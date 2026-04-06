#!/usr/bin/env python3
"""
Dedicated Cockpit backend for MicroShift host deployment.

This helper validates a MicroShift-specific request, checks the target host
over SSH, renders the MicroShift configuration and install plan, executes the
remote RPM-based install workflow, and reports status back to the Cockpit
MicroShift installer page.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import getpass
import hashlib
import ipaddress
import json
import os
import re
import time
import shlex
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse


STATE_DIR = Path("/var/lib/cockpit-microshift")
STATE_FILE = STATE_DIR / "microshift-state.json"
REQUEST_FILE = STATE_DIR / "microshift-request.json"
LOG_FILE = STATE_DIR / "microshift-install.log"
SECRET_DIR = STATE_DIR / "microshift-secrets"
WORK_ROOT = STATE_DIR / "microshift-work"
IMAGE_CACHE_DIR = STATE_DIR / "image-cache"
HELPER_PATH = Path("/usr/share/cockpit/cockpit-microshift/microshift_backend.py")
STATE_SCHEMA = "microshift-v1"
CLUSTER_SCHEMA = "microshift-cluster-v1"
CLUSTER_METADATA_NAME = "cluster-metadata.json"
CLUSTER_REQUEST_NAME = "request-summary.json"
LIBVIRT_MEDIA_DIR = Path("/var/lib/libvirt/images")
DEFAULT_BRIDGE_NAME = "bridge0"
DEFAULT_VM_SSH_USER = "microshift"
DEFAULT_VM_VCPUS = 4
DEFAULT_VM_MEMORY_MB = 8192
DEFAULT_VM_DISK_GB = 40
DEFAULT_PERFORMANCE_DOMAIN = "none"
SYSTEM_DEFAULT_STORAGE_POOL = "system-default"
SYSTEM_DEFAULT_STORAGE_PATH = Path("/var/lib/libvirt/images")
PERFORMANCE_DOMAINS = {
    "none": {},
    "gold": {"cpu_shares": 512},
    "silver": {"cpu_shares": 333},
    "bronze": {"cpu_shares": 167},
}

NAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
VERSION_PATTERN = re.compile(r"^\d+\.\d+$")
NODEPORT_RANGE_PATTERN = re.compile(r"^\d{1,5}-\d{1,5}$")


def ensure_private_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    path.chmod(0o700)


def write_private_file(path: Path, content: str) -> None:
    ensure_private_dir(path.parent)
    path.write_text(content, encoding="utf-8")
    path.chmod(0o600)


def append_private_line(path: Path, line: str) -> None:
    ensure_private_dir(path.parent)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(line.rstrip() + "\n")
    path.chmod(0o600)


def enforce_runtime_permissions() -> None:
    for path in [STATE_DIR, SECRET_DIR, WORK_ROOT]:
        if path.exists():
            path.chmod(0o700)
    for path in [STATE_FILE, REQUEST_FILE, LOG_FILE]:
        if path.exists():
            path.chmod(0o600)


def ensure_runtime_dirs() -> None:
    for path in [STATE_DIR, SECRET_DIR, WORK_ROOT, IMAGE_CACHE_DIR]:
        ensure_private_dir(path)
    enforce_runtime_permissions()


def clear_runtime_state() -> None:
    for path in [STATE_FILE, REQUEST_FILE, LOG_FILE]:
        path.unlink(missing_ok=True)
    if SECRET_DIR.exists():
        shutil.rmtree(SECRET_DIR)


def load_state() -> dict:
    enforce_runtime_permissions()
    if not STATE_FILE.exists():
        return {}
    data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    if data.get("schema") == STATE_SCHEMA:
        return data
    clear_runtime_state()
    return {}


def save_state(data: dict) -> None:
    ensure_private_dir(STATE_DIR)
    write_private_file(STATE_FILE, json.dumps(data, indent=2, sort_keys=True))


def run(*argv: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(list(argv), check=check, capture_output=True, text=True, stdin=subprocess.DEVNULL)


def run_as_root(*argv: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["sudo", "-n", *list(argv)], check=check, capture_output=True, text=True, stdin=subprocess.DEVNULL)


def command_available(name: str) -> bool:
    return shutil.which(name) is not None


def command_path(name: str) -> str:
    resolved = shutil.which(name)
    if resolved:
        return resolved
    for candidate in [f"/usr/bin/{name}", f"/usr/sbin/{name}", f"/bin/{name}", f"/sbin/{name}"]:
        if Path(candidate).exists():
            return candidate
    return name


def json_response(payload: dict, exit_code: int = 0) -> int:
    print(json.dumps(payload, indent=2, sort_keys=True))
    return exit_code


def current_timestamp() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def discover_owner() -> str:
    for candidate in [os.environ.get("SUDO_USER"), os.environ.get("USER")]:
        if candidate:
            return candidate
    try:
        return getpass.getuser()
    except Exception:
        return "local-admin"


def log_line(message: str) -> None:
    ensure_runtime_dirs()
    append_private_line(LOG_FILE, message)


def log_step(message: str) -> None:
    log_line(f"[STEP] {message}")


def log_command(message: str) -> None:
    log_line(f"[CMD] {message}")


def tail_log(lines: int = 120) -> list[str]:
    if not LOG_FILE.exists():
        return []
    return LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]


def current_task_from_log(log_lines: list[str]) -> str:
    for line in reversed(log_lines):
        if line.startswith("[STEP] "):
            return line[len("[STEP] "):].strip()
    return ""


def unit_status(unit_name: str) -> dict:
    if not unit_name:
        return {}
    proc = run(
        "systemctl",
        "show",
        unit_name,
        "--property=ActiveState,SubState,Result,ExecMainStatus,LoadState",
        check=False,
    )
    result: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            result[key] = value
    return result


def job_running(state: dict) -> bool:
    unit_name = state.get("unitName", "")
    if not unit_name:
        return False
    status = unit_status(unit_name)
    return status.get("ActiveState") in {"active", "activating"}


def validate_ip(value: str, field_name: str, errors: list[str]) -> None:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        errors.append(field_name)


def query_storage_pools() -> list[dict]:
    proc = run_as_root("virsh", "pool-list", "--all", "--name", check=True)
    pools: list[dict] = []
    for name in [line.strip() for line in proc.stdout.splitlines() if line.strip()]:
        info = run_as_root("virsh", "pool-info", name, check=False)
        xml = run_as_root("virsh", "pool-dumpxml", name, check=False)
        if xml.returncode != 0:
            continue
        root = ET.fromstring(xml.stdout)
        pool_type = root.attrib.get("type", "")
        target_path = root.findtext("./target/path", default="")
        source_name = root.findtext("./source/name", default="")
        active = any(line.strip() in {"State:          running", "State:           running"} for line in info.stdout.splitlines())
        pools.append(
            {
                "name": name,
                "type": pool_type,
                "active": active,
                "targetPath": target_path,
                "sourceName": source_name,
                "supported": pool_type in {"dir", "logical"},
            }
        )
    pools.append(
        {
            "name": SYSTEM_DEFAULT_STORAGE_POOL,
            "type": "dir",
            "active": SYSTEM_DEFAULT_STORAGE_PATH.exists(),
            "targetPath": str(SYSTEM_DEFAULT_STORAGE_PATH),
            "supported": True,
            "displayName": f"System default ({SYSTEM_DEFAULT_STORAGE_PATH})",
            "managed": False,
        }
    )
    return pools


def query_bridges() -> list[str]:
    proc = run_as_root("ip", "-j", "link", "show", "type", "bridge", check=True)
    data = json.loads(proc.stdout)
    return [entry["ifname"] for entry in data if entry.get("ifname")]


def choose_default_pool(pools: list[dict]) -> str:
    for preferred in ["default", "images"]:
        for pool in pools:
            if pool["name"] == preferred and pool["supported"]:
                return pool["name"]
    for pool in pools:
        if pool["supported"] and pool["active"]:
            return pool["name"]
    for pool in pools:
        if pool["supported"]:
            return pool["name"]
    return SYSTEM_DEFAULT_STORAGE_POOL


def choose_default_bridge(bridges: list[str]) -> str:
    if DEFAULT_BRIDGE_NAME in bridges:
        return DEFAULT_BRIDGE_NAME
    return bridges[0] if bridges else DEFAULT_BRIDGE_NAME


def determine_pool(name: str) -> dict:
    if name == SYSTEM_DEFAULT_STORAGE_POOL:
        return {
            "name": SYSTEM_DEFAULT_STORAGE_POOL,
            "type": "dir",
            "active": SYSTEM_DEFAULT_STORAGE_PATH.exists(),
            "targetPath": str(SYSTEM_DEFAULT_STORAGE_PATH),
            "supported": True,
            "displayName": f"System default ({SYSTEM_DEFAULT_STORAGE_PATH})",
            "managed": False,
        }
    pool_map = {pool["name"]: pool for pool in query_storage_pools()}
    if name not in pool_map:
        raise ValueError(f"Storage pool {name} was not found")
    pool = pool_map[name]
    if not pool["supported"]:
        raise ValueError(f"Storage pool {name} type {pool['type']} is not supported for MicroShift VM provisioning")
    return pool


def ensure_dir_pool_context(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if str(path) == str(LIBVIRT_MEDIA_DIR):
        return
    if shutil.which("semanage"):
        pattern = f"{path}(/.*)?"
        run("semanage", "fcontext", "-a", "-t", "virt_image_t", pattern, check=False)
        run("semanage", "fcontext", "-m", "-t", "virt_image_t", pattern, check=False)
    run("restorecon", "-RF", str(path), check=False)


def parse_payload(payload_b64: str) -> dict:
    try:
        raw = base64.b64decode(payload_b64.encode("utf-8"))
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid payload: {exc}") from exc


def remote_target(request: dict) -> str:
    host = request["host"]
    return f"{host['sshUser']}@{host['address']}"


def ssh_base_argv(request: dict) -> list[str]:
    host = request["host"]
    return [
        command_path("ssh"),
        "-i",
        host["sshPrivateKeyFile"],
        "-p",
        str(host["sshPort"]),
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ConnectionAttempts=1",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        remote_target(request),
    ]


def scp_base_argv(request: dict) -> list[str]:
    host = request["host"]
    return [
        command_path("scp"),
        "-i",
        host["sshPrivateKeyFile"],
        "-P",
        str(host["sshPort"]),
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ConnectionAttempts=1",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
    ]


def run_logged(
    argv: list[str],
    *,
    step: str | None = None,
    display_argv: list[str] | None = None,
) -> subprocess.CompletedProcess:
    if step:
        log_step(step)
    log_command(" ".join(shlex.quote(part) for part in (display_argv or argv)))
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, stdin=subprocess.DEVNULL)
    output_lines: list[str] = []
    assert process.stdout is not None
    for raw_line in process.stdout:
        line = raw_line.rstrip("\n")
        output_lines.append(line)
        log_line(line)
    rc = process.wait()
    if rc != 0:
        raise subprocess.CalledProcessError(rc, argv, output="\n".join(output_lines))
    return subprocess.CompletedProcess(argv, rc, stdout="\n".join(output_lines), stderr="")


def format_process_error(exc: subprocess.CalledProcessError) -> str:
    command = " ".join(shlex.quote(part) for part in exc.cmd)
    details = (exc.output or exc.stderr or "").strip()
    if details:
        return f"Command failed with exit status {exc.returncode}: {command}\n{details}"
    return f"Command failed with exit status {exc.returncode}: {command}"


def remote_run(request: dict, script: str, *, step: str | None = None) -> subprocess.CompletedProcess:
    remote_command = "sudo -n bash -lc " + shlex.quote(script)
    return run_logged(ssh_base_argv(request) + [remote_command], step=step)


def remote_run_masked(
    request: dict,
    script: str,
    *,
    step: str | None = None,
    display_script: str,
) -> subprocess.CompletedProcess:
    remote_command = "sudo -n bash -lc " + shlex.quote(script)
    display_command = "sudo -n bash -lc " + shlex.quote(display_script)
    return run_logged(
        ssh_base_argv(request) + [remote_command],
        step=step,
        display_argv=ssh_base_argv(request) + [display_command],
    )


def remote_query(request: dict, script: str) -> str:
    remote_command = "sudo -n bash -lc " + shlex.quote(script)
    proc = run(*(ssh_base_argv(request) + [remote_command]), check=False)
    if proc.returncode != 0:
        raise ValueError((proc.stderr or proc.stdout or "Remote command failed").strip())
    return proc.stdout.strip()


def scp_to_remote(request: dict, local_path: Path, remote_path: str, *, step: str | None = None) -> None:
    run_logged(scp_base_argv(request) + [str(local_path), f"{remote_target(request)}:{remote_path}"], step=step)


def scp_from_remote(request: dict, remote_path: str, local_path: Path, *, step: str | None = None) -> None:
    ensure_private_dir(local_path.parent)
    run_logged(scp_base_argv(request) + [f"{remote_target(request)}:{remote_path}", str(local_path)], step=step)
    local_path.chmod(0o600)


def read_optional_file(path_str: str) -> str:
    if not path_str:
        return ""
    path = Path(path_str)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


def sanitize_url(value: str) -> str:
    if not value:
        return ""
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return value
    netloc = parsed.hostname or parsed.netloc.split("@", 1)[-1]
    sanitized = parsed._replace(netloc=netloc, params="", query="", fragment="")
    return sanitized.geturl()


def cache_filename_for_download(request: dict) -> str:
    provisioning = request["provisioning"]
    override = provisioning.get("imageCacheName", "").strip()
    if override:
        return re.sub(r"[^A-Za-z0-9._-]", "-", override)
    parsed = urlparse(provisioning.get("imageDownloadUrl", ""))
    candidate = Path(parsed.path).name or f"{request['deploymentId']}.qcow2"
    return re.sub(r"[^A-Za-z0-9._-]", "-", candidate)


def downloaded_image_path(request: dict) -> Path:
    return IMAGE_CACHE_DIR / cache_filename_for_download(request)


def effective_base_image_path(request: dict) -> Path:
    provisioning = request["provisioning"]
    if provisioning.get("imageSource") == "download":
        return downloaded_image_path(request)
    return Path(provisioning["baseImagePath"])


def guest_ip_from_cidr(value: str) -> str:
    return str(ipaddress.ip_interface(value).ip)


def generated_mac(request: dict) -> str:
    seed = (request.get("deploymentId") or request.get("deploymentName") or "microshift").encode("utf-8")
    digest = hashlib.sha1(seed).digest()
    octets = [0x52, 0x54, 0x00, digest[0], digest[1], digest[2]]
    return ":".join(f"{entry:02x}" for entry in octets)


def vm_domain_name(request: dict) -> str:
    if request["deploymentTargetPattern"] == "create-host":
        return request["provisioning"]["vmName"]
    return ""


def ensure_pool_started(pool: dict) -> dict:
    if not pool.get("managed", True):
        return pool
    if not pool["active"]:
        run_logged(["virsh", "pool-start", pool["name"]], step=f"Starting storage pool {pool['name']}")
        pool = determine_pool(pool["name"])
    return pool


def render_cloud_init_user_data(request: dict, public_key: str) -> str:
    ssh_user = request["host"]["sshUser"]
    host_name = request["config"]["hostnameOverride"] or request["provisioning"]["vmName"]
    return "\n".join(
        [
            "#cloud-config",
            "preserve_hostname: false",
            f"hostname: {host_name}",
            "users:",
            f"  - name: {ssh_user}",
            "    gecos: MicroShift administrator",
            "    groups: [wheel]",
            "    sudo: ALL=(ALL) NOPASSWD:ALL",
            "    shell: /bin/bash",
            "    lock_passwd: true",
            "    ssh_authorized_keys:",
            f"      - {public_key}",
            "ssh_pwauth: false",
            "package_update: false",
        ]
    ) + "\n"


def render_cloud_init_meta_data(request: dict) -> str:
    host_name = request["config"]["hostnameOverride"] or request["provisioning"]["vmName"]
    return "\n".join(
        [
            f"instance-id: {request['deploymentId']}",
            f"local-hostname: {host_name}",
        ]
    ) + "\n"


def render_cloud_init_network_config(request: dict) -> str:
    provisioning = request["provisioning"]
    gateway_key = "gateway6" if ":" in provisioning["guestGateway"] else "gateway4"
    lines = [
        "version: 2",
        "ethernets:",
        "  eth0:",
        "    match:",
        f"      macaddress: {provisioning['macAddress']}",
        "    set-name: eth0",
        "    dhcp4: false",
        "    dhcp6: false",
        "    addresses:",
        f"      - {provisioning['guestIpCidr']}",
        f"    {gateway_key}: {provisioning['guestGateway']}",
    ]
    if provisioning["dnsServers"]:
        lines.extend(
            [
                "    nameservers:",
                "      addresses:",
            ]
        )
        lines.extend([f"        - {entry}" for entry in provisioning["dnsServers"]])
    return "\n".join(lines) + "\n"


def render_virt_install_plan(request: dict, pool: dict, disk_path: Path, seed_path: Path) -> str:
    provisioning = request["provisioning"]
    performance_domain = provisioning.get("performanceDomain", DEFAULT_PERFORMANCE_DOMAIN)
    disk_format = vm_disk_format(pool)
    image_source_line = (
        f"# Image source: download to {effective_base_image_path(request)} from {sanitize_url(provisioning.get('imageDownloadUrl', ''))}"
        if provisioning.get("imageSource") == "download"
        else f"# Image source: local {effective_base_image_path(request)}"
    )
    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        f"# Local MicroShift VM provisioning plan for {request['deploymentName']}",
        f"# Domain: {provisioning['vmName']}",
        f"# Storage pool: {pool['name']}",
        f"# Root disk format: {disk_format}",
        f"# Bridge: {provisioning['bridgeName']}",
        f"# Performance domain: {performance_domain}",
        image_source_line,
        "",
    ]
    if pool["type"] == "logical":
        lines.extend(
            [
                f"lvcreate -y -W y -L {provisioning['diskSizeGb']}G -n {shlex.quote(disk_path.name)} {shlex.quote(pool['sourceName'] or Path(pool['targetPath']).name)}",
                f"qemu-img convert -O raw {shlex.quote(str(effective_base_image_path(request)))} {shlex.quote(str(disk_path))}",
                "",
            ]
        )
    lines.extend(
        [
            "cloud-localds \\",
            f"  --network-config {shlex.quote(str(provisioning_artifact_path(request, 'network-config.yaml')))} \\",
            f"  {shlex.quote(str(seed_path))} \\",
            f"  {shlex.quote(str(provisioning_artifact_path(request, 'user-data.yaml')))} \\",
            f"  {shlex.quote(str(provisioning_artifact_path(request, 'meta-data.yaml')))}",
            "",
            "virt-install \\",
            f"  --name {shlex.quote(provisioning['vmName'])} \\",
            "  --import \\",
            "  --osinfo detect=on,require=off \\",
            f"  --memory {provisioning['memoryMb']} \\",
            f"  --vcpus {provisioning['nodeVcpus']} \\",
            "  --cpu host-passthrough \\",
        ]
    )
    if performance_domain in PERFORMANCE_DOMAINS and performance_domain != "none":
        lines.append(f"  --cputune shares={PERFORMANCE_DOMAINS[performance_domain]['cpu_shares']} \\")
    lines.extend(
        [
            f"  --disk path={shlex.quote(str(disk_path))},format={disk_format},bus=virtio \\",
            f"  --disk path={shlex.quote(str(seed_path))},device=cdrom,bus=sata \\",
            f"  --network bridge={shlex.quote(provisioning['bridgeName'])},model=virtio,mac={provisioning['macAddress']} \\",
            "  --graphics none \\",
            "  --console pty,target_type=serial \\",
            "  --noautoconsole \\",
            "  --autostart",
        ]
    )
    return "\n".join(lines) + "\n"


def render_microshift_config(request: dict) -> str:
    config = request["config"]
    lines = ["dns:", f"  baseDomain: {config['baseDomain']}"]

    if config["hostnameOverride"] or config["nodeIP"]:
        lines.append("node:")
        if config["hostnameOverride"]:
            lines.append(f"  hostnameOverride: {config['hostnameOverride']}")
        if config["nodeIP"]:
            lines.append(f"  nodeIP: {config['nodeIP']}")

    if config["subjectAltNames"]:
        lines.extend(
            [
                "apiServer:",
                "  subjectAltNames:",
            ]
        )
        lines.extend([f"    - {entry}" for entry in config["subjectAltNames"]])

    lines.extend(["network:", "  clusterNetwork:"])
    lines.extend([f"    - {entry}" for entry in config["clusterNetwork"]])
    lines.append("  serviceNetwork:")
    lines.extend([f"    - {entry}" for entry in config["serviceNetwork"]])
    lines.extend(
        [
            f"  serviceNodePortRange: {config['serviceNodePortRange']}",
            "debugging:",
            f"  logLevel: {config['logLevel']}",
        ]
    )
    return "\n".join(lines) + "\n"


def firewall_commands(request: dict) -> list[str]:
    cfg = request["config"]
    options = request["prerequisites"]
    commands = [
        "dnf install -y firewalld",
        "systemctl enable firewalld --now",
    ]
    for cidr in cfg["clusterNetwork"]:
        commands.append(f"firewall-cmd --permanent --zone=trusted --add-source={shlex.quote(cidr)}")
    commands.append("firewall-cmd --permanent --zone=trusted --add-source=169.254.169.1")
    if any(":" in cidr for cidr in cfg["clusterNetwork"]):
        commands.append("firewall-cmd --permanent --zone=trusted --add-source=fd01::/48")
    if options["exposeApiPort"]:
        commands.append("firewall-cmd --permanent --zone=public --add-port=6443/tcp")
    if options["exposeIngress"]:
        commands.extend(
            [
                "firewall-cmd --permanent --zone=public --add-port=80/tcp",
                "firewall-cmd --permanent --zone=public --add-port=443/tcp",
            ]
        )
    if options["exposeNodePorts"]:
        commands.extend(
            [
                f"firewall-cmd --permanent --zone=public --add-port={cfg['serviceNodePortRange']}/tcp",
                f"firewall-cmd --permanent --zone=public --add-port={cfg['serviceNodePortRange']}/udp",
            ]
        )
    if options["exposeMdns"]:
        commands.extend(
            [
                "firewall-cmd --permanent --zone=public --add-port=5353/udp",
                "firewall-cmd --permanent --zone=public --add-service=mdns",
            ]
        )
    commands.append("firewall-cmd --reload")
    return commands


def render_install_plan(request: dict) -> str:
    cfg = request["config"]
    host = request["host"]
    package_access = request.get("packageAccess", {})
    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        f"# MicroShift {request['microshiftVersion']} install plan for {request['deploymentName']}",
        f"# Target host: {host['sshUser']}@{host['address']}:{host['sshPort']}",
        "",
        "# Assumptions:",
        "# - The target host is a supported RHEL machine with passwordless sudo.",
    ]
    if package_access.get("mode") == "activation-key":
        lines.extend(
            [
                "# - The target host will be registered and repository-enabled automatically before package install.",
                f"subscription-manager register --org={shlex.quote(package_access['organizationId'])} --activationkey='<redacted>'",
                "subscription-manager repos "
                + " ".join(
                    [
                        "--enable " + shlex.quote(
                            "rhocp-" + request["microshiftVersion"] + "-for-rhel-<detected-major>-$(uname -m)-rpms"
                        ),
                        "--enable " + shlex.quote("fast-datapath-for-rhel-<detected-major>-$(uname -m)-rpms"),
                    ]
                ),
            ]
        )
        if package_access.get("releaseLock"):
            lines.append(f"subscription-manager release --set={shlex.quote(package_access['releaseLock'])}")
            lines.append("# On RHEL 9, the backend also enables the matching AppStream/BaseOS EUS repositories before applying the release lock.")
    else:
        lines.append("# - The MicroShift and openshift-clients RPMs are already reachable through configured repositories.")
    lines.extend(
        [
            "",
            "dnf install -y microshift openshift-clients" + (" firewalld" if request["prerequisites"]["manageFirewall"] else ""),
            "install -D -m 0600 pull-secret.json /etc/crio/openshift-pull-secret",
            "install -D -m 0644 config.yaml /etc/microshift/config.yaml",
        ]
    )
    if request["prerequisites"]["manageFirewall"]:
        lines.append("")
        lines.append("# Firewall preparation")
        lines.extend(firewall_commands(request))
    lines.extend(
        [
            "",
            "# Start MicroShift",
            "systemctl enable --now microshift.service",
            "",
            "# Validate the single-node deployment",
            "oc --kubeconfig /var/lib/microshift/resources/kubeadmin/kubeconfig get nodes -o wide",
            "oc --kubeconfig /var/lib/microshift/resources/kubeadmin/kubeconfig get pods -A",
            "",
            f"# Base domain: {cfg['baseDomain']}",
            f"# Node IP override: {cfg['nodeIP'] or '<auto>'}",
            f"# Hostname override: {cfg['hostnameOverride'] or '<system hostname>'}",
        ]
    )
    return "\n".join(lines) + "\n"


def render_artifact_bundle(request: dict) -> dict:
    config_yaml = render_microshift_config(request)
    plan_script = render_install_plan(request)
    summary = {
        "deploymentKind": "microshift",
        "deploymentTargetPattern": request["deploymentTargetPattern"],
        "deploymentName": request["deploymentName"],
        "microshiftVersion": request["microshiftVersion"],
        "host": request["host"],
        "packageAccess": {
            **request["packageAccess"],
            "activationKey": "<redacted>" if request["packageAccess"].get("activationKey") else "",
        },
        "prerequisites": request["prerequisites"],
        "config": request["config"],
        "provisioning": {
            **request["provisioning"],
            "imageDownloadUrl": sanitize_url(request["provisioning"].get("imageDownloadUrl", "")),
            "resolvedBaseImagePath": str(effective_base_image_path(request)) if request["deploymentTargetPattern"] == "create-host" else "",
        },
    }
    artifacts = [
        {
            "name": "microshift-request.json",
            "content": json.dumps(summary, indent=2, sort_keys=True),
            "contentType": "application/json",
        },
        {
            "name": "microshift-config.yaml",
            "content": config_yaml,
            "contentType": "application/x-yaml",
        },
        {
            "name": "microshift-install-plan.sh",
            "content": plan_script,
            "contentType": "text/x-shellscript",
        },
    ]

    if request["deploymentTargetPattern"] == "create-host":
        pool = determine_pool(request["provisioning"]["storagePool"])
        disk_path = vm_disk_path(request, pool)
        seed_path = vm_seed_path(request, pool)
        public_key = ssh_public_key_from_private_key(request["host"]["sshPrivateKeyFile"])
        artifacts.extend(
            [
                {
                    "name": "cloud-init-user-data.yaml",
                    "content": render_cloud_init_user_data(request, public_key),
                    "contentType": "application/x-yaml",
                },
                {
                    "name": "cloud-init-meta-data.yaml",
                    "content": render_cloud_init_meta_data(request),
                    "contentType": "application/x-yaml",
                },
                {
                    "name": "cloud-init-network-config.yaml",
                    "content": render_cloud_init_network_config(request),
                    "contentType": "application/x-yaml",
                },
                {
                    "name": "virt-install-plan.sh",
                    "content": render_virt_install_plan(request, pool, disk_path, seed_path),
                    "contentType": "text/x-shellscript",
                },
            ]
        )

    return {
        "ok": True,
        "artifacts": artifacts,
    }


def public_request_view(request: dict) -> dict:
    data = json.loads(json.dumps(request))
    if "secretMaterial" in data:
        data["secretMaterial"] = {"pullSecret": "<redacted>"}
    if "packageAccess" in data and data["packageAccess"].get("activationKey"):
        data["packageAccess"]["activationKey"] = "<redacted>"
    if "provisioning" in data and "imageDownloadUrl" in data["provisioning"]:
        data["provisioning"]["imageDownloadUrl"] = sanitize_url(data["provisioning"]["imageDownloadUrl"])
    return data


def health_from_nodes_json(output: str) -> dict:
    result = {
        "available": False,
        "apiReachable": False,
        "readyNodes": 0,
        "totalNodes": 0,
        "message": "",
    }
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        result["message"] = "Unable to parse node status from oc output"
        return result

    items = data.get("items", [])
    ready_nodes = 0
    for node in items:
        conditions = {
            entry.get("type"): entry.get("status")
            for entry in node.get("status", {}).get("conditions", [])
        }
        if conditions.get("Ready") == "True":
            ready_nodes += 1

    result["apiReachable"] = True
    result["readyNodes"] = ready_nodes
    result["totalNodes"] = len(items)
    result["available"] = ready_nodes > 0 and len(items) > 0
    return result


def cluster_health(cluster: dict) -> dict:
    result = {
        "available": False,
        "apiReachable": False,
        "readyNodes": 0,
        "totalNodes": 0,
        "message": "",
    }
    kubeconfig_path = Path(cluster.get("kubeconfigPath", ""))
    remote_kubeconfig = ((cluster.get("installAccess") or {}).get("remoteKubeconfigPath") or "").strip()
    host = cluster.get("host") or {}
    oc = command_path("oc") if command_available("oc") else ""

    if kubeconfig_path.exists() and oc:
        proc = run(oc, "--kubeconfig", str(kubeconfig_path), "--request-timeout=5s", "get", "nodes", "-o", "json", check=False)
        if proc.returncode == 0:
            return health_from_nodes_json(proc.stdout)
        result["message"] = (proc.stderr or proc.stdout or "Unable to reach the MicroShift API").strip()

    if remote_kubeconfig and host.get("address") and host.get("sshUser") and host.get("sshPrivateKeyFile"):
        remote_command = "sudo -n bash -lc " + shlex.quote(
            f"oc --kubeconfig {shlex.quote(remote_kubeconfig)} --request-timeout=5s get nodes -o json"
        )
        proc = run(*(ssh_base_argv({"host": host}) + [remote_command]), check=False)
        if proc.returncode == 0:
            return health_from_nodes_json(proc.stdout)
        result["message"] = (proc.stderr or proc.stdout or "Unable to reach the MicroShift API").strip()

    if not result["message"]:
        if cluster.get("status") == "failed" and cluster.get("error"):
            result["message"] = cluster["error"]
        elif not kubeconfig_path.exists() and not remote_kubeconfig:
            result["message"] = "No kubeconfig recorded"
        else:
            result["message"] = "Unable to reach the MicroShift API"
    return result


def discover_clusters(*, include_health: bool = False) -> list[dict]:
    backfill_cluster_record_from_runtime()
    clusters: list[dict] = []
    if not WORK_ROOT.exists():
        return clusters

    for path in sorted([entry for entry in WORK_ROOT.iterdir() if entry.is_dir()]):
        metadata_path = cluster_metadata_path(path)
        request_path = cluster_request_summary_path(path)
        metadata: dict | None = None
        request: dict | None = None

        if request_path.exists():
            try:
                request = json.loads(request_path.read_text(encoding="utf-8"))
            except Exception:
                request = None

        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except Exception:
                metadata = None

        if not metadata and request:
            metadata = cluster_record_from_request(request)

        if not metadata:
            continue

        cluster = dict(metadata)
        if request:
            cluster["request"] = request

        if (
            cluster.get("deploymentTargetPattern") == "create-host"
            and cluster.get("vmName")
            and not domain_exists(cluster.get("vmName", ""))
        ):
            prune_cluster_runtime(path, cluster)
            continue

        if include_health:
            cluster["health"] = cluster_health(cluster)
        clusters.append(cluster)

    clusters.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return clusters


def discover_cluster(cluster_id: str, *, include_health: bool = False) -> dict | None:
    cluster_id = str(cluster_id or "").strip()
    if not cluster_id:
        return None
    for cluster in discover_clusters(include_health=include_health):
        if cluster.get("clusterId") == cluster_id:
            return cluster
    return None


def validate_local_payload(payload: dict) -> tuple[dict, list[str]]:
    errors: list[str] = []

    target_pattern = str(payload.get("deploymentTargetPattern", "existing-host")).strip() or "existing-host"
    deployment_name = str(payload.get("deploymentName", "")).strip()
    microshift_version = str(payload.get("microshiftVersion", "")).strip()
    host_payload = payload.get("host", {}) or {}
    host_address = str(host_payload.get("address", "")).strip()
    ssh_port = int(host_payload.get("sshPort", 0) or 0)
    ssh_user = str(host_payload.get("sshUser", "")).strip()
    ssh_private_key_file = str(host_payload.get("sshPrivateKeyFile", "")).strip()
    provision_payload = payload.get("provisioning", {}) or {}
    vm_name = str(provision_payload.get("vmName", "")).strip()
    image_source = str(provision_payload.get("imageSource", "local")).strip() or "local"
    base_image_path = str(provision_payload.get("baseImagePath", "")).strip()
    image_download_url = str(provision_payload.get("imageDownloadUrl", "")).strip()
    image_cache_name = str(provision_payload.get("imageCacheName", "")).strip()
    storage_pool_name = str(provision_payload.get("storagePool", "")).strip()
    bridge_name = str(provision_payload.get("bridgeName", "")).strip()
    performance_domain = str(provision_payload.get("performanceDomain", DEFAULT_PERFORMANCE_DOMAIN)).strip() or DEFAULT_PERFORMANCE_DOMAIN
    guest_ip_cidr = str(provision_payload.get("guestIpCidr", "")).strip()
    guest_gateway = str(provision_payload.get("guestGateway", "")).strip()
    guest_dns_servers = [str(entry).strip() for entry in (provision_payload.get("dnsServers", []) or []) if str(entry).strip()]
    node_vcpus = int(provision_payload.get("nodeVcpus", 0) or 0)
    memory_mb = int(provision_payload.get("memoryMb", 0) or 0)
    disk_size_gb = int(provision_payload.get("diskSizeGb", 0) or 0)
    derived_guest_ip = ""

    if not deployment_name:
        errors.append("Deployment name")
    elif not NAME_PATTERN.match(deployment_name):
        errors.append("Deployment name must contain only lowercase letters, numbers, and hyphens")

    if target_pattern not in {"existing-host", "create-host"}:
        errors.append("Deployment target pattern")
    if not VERSION_PATTERN.match(microshift_version):
        errors.append("MicroShift version")

    if ssh_port <= 0 or ssh_port > 65535:
        errors.append("SSH port")
    if not ssh_user:
        errors.append("SSH user")
    if not ssh_private_key_file or not Path(ssh_private_key_file).exists():
        errors.append("SSH private key file")
    elif target_pattern == "create-host":
        proc = run("ssh-keygen", "-y", "-f", ssh_private_key_file, check=False)
        if proc.returncode != 0 or not proc.stdout.strip():
            errors.append("SSH private key file must be usable non-interactively. Passphrase-protected keys are not supported for create-host deployments.")

    if target_pattern == "existing-host":
        if not host_address:
            errors.append("Target host address")
    else:
        if not vm_name:
            errors.append("VM name")
        elif not NAME_PATTERN.match(vm_name):
            errors.append("VM name must contain only lowercase letters, numbers, and hyphens")
        if image_source not in {"local", "download"}:
            errors.append("Image source")
        elif image_source == "local":
            if not base_image_path or not Path(base_image_path).exists():
                errors.append("Base image path")
        else:
            if not image_download_url:
                errors.append("Image download URL")
        if not storage_pool_name:
            errors.append("Storage pool")
        if not bridge_name:
            errors.append("Bridge")
        if performance_domain not in PERFORMANCE_DOMAINS:
            errors.append("Performance domain")
        if not guest_ip_cidr:
            errors.append("Guest IP/CIDR")
        else:
            try:
                ipaddress.ip_interface(guest_ip_cidr)
                derived_guest_ip = guest_ip_from_cidr(guest_ip_cidr)
            except ValueError:
                errors.append("Guest IP/CIDR")
        if not guest_gateway:
            errors.append("Guest gateway")
        else:
            validate_ip(guest_gateway, "Guest gateway", errors)
        for idx, server in enumerate(guest_dns_servers, start=1):
            validate_ip(server, f"Guest DNS server {idx}", errors)
        if node_vcpus <= 0:
            errors.append("Guest vCPU count")
        if memory_mb <= 0:
            errors.append("Guest memory")
        if disk_size_gb <= 0:
            errors.append("Guest disk size")
        if derived_guest_ip:
            host_address = derived_guest_ip

    pull_secret_value = str(payload.get("pullSecretValue", "")).strip()
    pull_secret_file = str(payload.get("pullSecretFile", "")).strip()
    if pull_secret_value:
        try:
            json.loads(pull_secret_value)
        except json.JSONDecodeError:
            errors.append("Pull secret")
    elif not pull_secret_file or not Path(pull_secret_file).exists():
        errors.append("Pull secret")

    package_access_payload = payload.get("packageAccess", {}) or {}
    package_access_mode = str(package_access_payload.get("mode", "preconfigured")).strip() or "preconfigured"
    package_access_org = str(package_access_payload.get("organizationId", "")).strip()
    package_access_key = str(package_access_payload.get("activationKey", "")).strip()
    package_access_release = str(package_access_payload.get("releaseLock", "")).strip()
    package_access_extra_repositories = [
        str(entry).strip() for entry in (package_access_payload.get("extraRepositories", []) or []) if str(entry).strip()
    ]
    if package_access_mode not in {"preconfigured", "activation-key"}:
        errors.append("Package access mode")
    if package_access_mode == "activation-key":
        if not package_access_org:
            errors.append("RHSM organization ID")
        if not package_access_key:
            errors.append("RHSM activation key")

    config_payload = payload.get("config", {}) or {}
    base_domain = str(config_payload.get("baseDomain", "")).strip()
    hostname_override = str(config_payload.get("hostnameOverride", "")).strip()
    node_ip = str(config_payload.get("nodeIP", "")).strip()
    cluster_network = [str(entry).strip() for entry in (config_payload.get("clusterNetwork", []) or []) if str(entry).strip()]
    service_network = [str(entry).strip() for entry in (config_payload.get("serviceNetwork", []) or []) if str(entry).strip()]
    subject_alt_names = [str(entry).strip() for entry in (config_payload.get("subjectAltNames", []) or []) if str(entry).strip()]
    service_node_port_range = str(config_payload.get("serviceNodePortRange", "")).strip()
    log_level = str(config_payload.get("logLevel", "Normal")).strip() or "Normal"

    if not base_domain:
        errors.append("Base domain")
    if node_ip:
        try:
            ipaddress.ip_address(node_ip)
        except ValueError:
            errors.append("Node IP")
    for cidr in cluster_network:
        try:
            ipaddress.ip_network(cidr, strict=False)
        except ValueError:
            errors.append(f"Cluster network CIDR {cidr}")
    if not cluster_network:
        errors.append("Cluster network")
    for cidr in service_network:
        try:
            ipaddress.ip_network(cidr, strict=False)
        except ValueError:
            errors.append(f"Service network CIDR {cidr}")
    if not service_network:
        errors.append("Service network")
    if not NODEPORT_RANGE_PATTERN.match(service_node_port_range):
        errors.append("Service NodePort range")
    else:
        start_text, end_text = service_node_port_range.split("-", 1)
        start = int(start_text)
        end = int(end_text)
        if start <= 0 or end > 65535 or start > end:
            errors.append("Service NodePort range")
    if log_level not in {"Normal", "Debug", "Trace", "TraceAll"}:
        errors.append("Log level")

    prerequisites_payload = payload.get("prerequisites", {}) or {}
    prerequisites = {
        "manageFirewall": bool(prerequisites_payload.get("manageFirewall", True)),
        "exposeApiPort": bool(prerequisites_payload.get("exposeApiPort", True)),
        "exposeIngress": bool(prerequisites_payload.get("exposeIngress", True)),
        "exposeNodePorts": bool(prerequisites_payload.get("exposeNodePorts", False)),
        "exposeMdns": bool(prerequisites_payload.get("exposeMdns", False)),
    }

    normalized = {
        "deploymentKind": "microshift",
        "deploymentTargetPattern": target_pattern,
        "deploymentName": deployment_name,
        "deploymentId": deployment_name,
        "microshiftVersion": microshift_version,
        "host": {
            "address": host_address,
            "sshPort": ssh_port,
            "sshUser": ssh_user,
            "sshPrivateKeyFile": ssh_private_key_file,
        },
        "config": {
            "baseDomain": base_domain,
            "hostnameOverride": hostname_override,
            "nodeIP": node_ip,
            "subjectAltNames": subject_alt_names,
            "clusterNetwork": cluster_network,
            "serviceNetwork": service_network,
            "serviceNodePortRange": service_node_port_range,
            "logLevel": log_level,
        },
        "prerequisites": prerequisites,
        "provisioning": {
            "vmName": vm_name,
            "imageSource": image_source,
            "baseImagePath": base_image_path,
            "imageDownloadUrl": image_download_url,
            "imageCacheName": image_cache_name,
            "storagePool": storage_pool_name,
            "bridgeName": bridge_name,
            "performanceDomain": performance_domain,
            "guestIpCidr": guest_ip_cidr,
            "guestGateway": guest_gateway,
            "dnsServers": guest_dns_servers,
            "nodeVcpus": node_vcpus,
            "memoryMb": memory_mb,
            "diskSizeGb": disk_size_gb,
            "macAddress": "",
        },
        "secretInputs": {
            "pullSecretSource": "inline" if pull_secret_value else "file",
            "pullSecretFile": pull_secret_file,
        },
        "packageAccess": {
            "mode": package_access_mode,
            "organizationId": package_access_org,
            "activationKey": package_access_key,
            "releaseLock": package_access_release,
            "extraRepositories": package_access_extra_repositories,
        },
        "secretMaterial": {
            "pullSecret": pull_secret_value if pull_secret_value else Path(pull_secret_file).read_text(encoding="utf-8"),
        },
    }
    if target_pattern == "create-host":
        normalized["provisioning"]["macAddress"] = generated_mac(normalized)
        if not normalized["config"]["hostnameOverride"]:
            normalized["config"]["hostnameOverride"] = vm_name
        if not normalized["config"]["nodeIP"] and host_address:
            normalized["config"]["nodeIP"] = host_address
    return normalized, errors


def remote_host_facts(request: dict) -> tuple[dict[str, str], list[str]]:
    errors: list[str] = []

    for binary in ["ssh", "scp"]:
        if not Path(command_path(binary)).exists():
            errors.append(binary)

    if errors:
        return {}, errors

    try:
        remote_run(request, "true", step="Checking SSH connectivity and passwordless sudo")
    except Exception as exc:
        return {}, [f"Unable to reach the target host with passwordless sudo: {exc}"]

    try:
        os_release = remote_query(request, "cat /etc/os-release")
    except Exception as exc:
        return {}, [f"Unable to read /etc/os-release on the target host: {exc}"]

    fields: dict[str, str] = {}
    for line in os_release.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            fields[key] = value.strip().strip('"')
    if fields.get("ID") != "rhel":
        errors.append("Target host must be Red Hat Enterprise Linux")
    major = (fields.get("VERSION_ID", "").split(".", 1)[0] if fields.get("VERSION_ID") else "")
    if major not in {"9", "10"}:
        errors.append("Target host must be RHEL 9 or RHEL 10")

    try:
        arch = remote_query(request, "uname -m")
    except Exception as exc:
        errors.append(f"Unable to determine target architecture: {exc}")
        arch = ""
    else:
        if arch not in {"x86_64", "aarch64"}:
            errors.append("Target architecture must be x86_64 or aarch64")

    return {
        "id": fields.get("ID", ""),
        "versionId": fields.get("VERSION_ID", ""),
        "major": major,
        "arch": arch.strip(),
    }, errors


def validate_remote_host(request: dict, *, require_packages: bool | None = None) -> list[str]:
    facts, errors = remote_host_facts(request)
    if errors:
        return errors

    if facts["major"] == "10" and facts["versionId"] and facts["versionId"] != "10.0":
        errors.append(
            f"MicroShift {request['microshiftVersion']} on RHEL 10 is currently aligned to the Red Hat Technology Preview matrix for RHEL 10.0. The target host is RHEL {facts['versionId']}."
        )
        return errors

    mode = request.get("packageAccess", {}).get("mode", "preconfigured")
    if require_packages is None:
        require_packages = mode == "preconfigured"

    if not require_packages:
        proc = run(
            *(ssh_base_argv(request) + ["sudo -n bash -lc " + shlex.quote("command -v subscription-manager >/dev/null 2>&1 && command -v dnf >/dev/null 2>&1")]),
            check=False,
        )
        if proc.returncode != 0:
            errors.append("subscription-manager and dnf must be available on the target host")
        return errors

    package_checks = {
        "microshift": "dnf -q list --available microshift >/dev/null 2>&1 || dnf -q info microshift >/dev/null 2>&1",
        "openshift-clients": "dnf -q list --available openshift-clients >/dev/null 2>&1 || dnf -q info openshift-clients >/dev/null 2>&1",
    }
    for label, script in package_checks.items():
        proc = run(*(ssh_base_argv(request) + ["sudo -n bash -lc " + shlex.quote(script)]), check=False)
        if proc.returncode != 0:
            errors.append(
                f"{label} RPM is not currently available on the target host. Register the host and enable the required repositories first."
            )

    return errors


def microshift_repository_ids(request: dict, facts: dict[str, str]) -> list[str]:
    version = request["microshiftVersion"]
    major = facts["major"]
    arch = facts["arch"]
    package_access = request.get("packageAccess", {})
    repos = [
        f"rhocp-{version}-for-rhel-{major}-{arch}-rpms",
        f"fast-datapath-for-rhel-{major}-{arch}-rpms",
    ]
    if major == "9" and package_access.get("releaseLock"):
        repos.extend(
            [
                f"rhel-9-for-{arch}-appstream-eus-rpms",
                f"rhel-9-for-{arch}-baseos-eus-rpms",
            ]
        )
    repos.extend(package_access.get("extraRepositories", []))
    return list(dict.fromkeys([entry for entry in repos if entry]))


def ensure_package_access(request: dict) -> None:
    facts, errors = remote_host_facts(request)
    if errors:
        raise ValueError("; ".join(errors))

    package_access = request["packageAccess"]
    repo_args = " ".join(
        f"--enable {shlex.quote(repo_id)}" for repo_id in microshift_repository_ids(request, facts)
    )
    release_lock = package_access.get("releaseLock", "").strip()
    script_lines = [
        "set -euo pipefail",
        "if ! subscription-manager identity >/dev/null 2>&1; then",
        f"    subscription-manager register --org={shlex.quote(package_access['organizationId'])} --activationkey={shlex.quote(package_access['activationKey'])}",
        "fi",
        f"subscription-manager repos {repo_args}",
    ]
    if release_lock:
        script_lines.append(f"subscription-manager release --set={shlex.quote(release_lock)}")
    script_lines.append("dnf clean all")

    display_lines = [
        "set -euo pipefail",
        "if ! subscription-manager identity >/dev/null 2>&1; then",
        f"    subscription-manager register --org={shlex.quote(package_access['organizationId'])} --activationkey='<redacted>'",
        "fi",
        f"subscription-manager repos {repo_args}",
    ]
    if release_lock:
        display_lines.append(f"subscription-manager release --set={shlex.quote(release_lock)}")
    display_lines.append("dnf clean all")

    remote_run_masked(
        request,
        "\n".join(script_lines),
        step="Registering the target host and enabling MicroShift repositories",
        display_script="\n".join(display_lines),
    )


def validate_local_environment(request: dict) -> list[str]:
    errors: list[str] = []
    target_pattern = request["deploymentTargetPattern"]

    if target_pattern == "existing-host":
        return errors

    required_binaries = ["systemd-run", "virsh", "virt-install", "qemu-img", "ssh-keygen"]
    if request["provisioning"].get("imageSource") == "download":
        required_binaries.append("curl")
    try:
        pool = determine_pool(request["provisioning"]["storagePool"])
    except Exception:
        pool = None
    if pool and pool["type"] == "logical":
        required_binaries.extend(["lvcreate", "lvremove"])
    for binary in required_binaries:
        if not command_available(binary):
            errors.append(binary)
    if not command_available("cloud-localds") and not command_available("mkisofs"):
        errors.append("cloud-localds or mkisofs")

    try:
        pools = query_storage_pools()
    except Exception as exc:
        errors.append(f"Unable to query libvirt storage pools: {exc}")
        pools = []
    try:
        bridges = query_bridges()
    except Exception as exc:
        errors.append(f"Unable to query bridge interfaces: {exc}")
        bridges = []

    pool = next((entry for entry in pools if entry["name"] == request["provisioning"]["storagePool"]), None)
    if not pool:
        errors.append("Storage pool")
    elif not pool["supported"]:
        errors.append("Storage pool")

    if request["provisioning"]["bridgeName"] not in bridges:
        errors.append("Bridge")

    if request["provisioning"].get("imageSource") == "local" and not Path(request["provisioning"]["baseImagePath"]).exists():
        errors.append("Base image path")

    return errors


def validate_payload(payload: dict) -> tuple[dict, list[str]]:
    normalized, errors = validate_local_payload(payload)
    if errors:
        return normalized, errors
    errors = validate_local_environment(normalized)
    if errors:
        return normalized, errors
    if normalized["deploymentTargetPattern"] == "existing-host":
        return normalized, validate_remote_host(normalized)
    return normalized, []


def work_dir(request: dict) -> Path:
    return WORK_ROOT / request["deploymentId"]


def generated_dir(request: dict) -> Path:
    return work_dir(request) / "generated"


def cluster_metadata_path(path: Path) -> Path:
    return path / CLUSTER_METADATA_NAME


def cluster_request_summary_path(path: Path) -> Path:
    return path / CLUSTER_REQUEST_NAME


def cluster_id_from_request(request: dict) -> str:
    deployment_name = str(request.get("deploymentName", "")).strip()
    base_domain = str((request.get("config") or {}).get("baseDomain", "")).strip()
    if deployment_name and base_domain:
        return f"{deployment_name}.{base_domain}"
    return deployment_name


def cluster_record_from_request(request: dict, state: dict | None = None) -> dict:
    state = state or {}
    provisioning = request.get("provisioning", {}) or {}
    install_access = state.get("installAccess", {}) or {}
    cluster_id = cluster_id_from_request(request)
    kubeconfig_path = install_access.get("kubeconfigPath") or str(generated_dir(request) / "kubeconfig")
    return {
        "schema": CLUSTER_SCHEMA,
        "clusterId": cluster_id,
        "clusterName": request.get("deploymentName", ""),
        "baseDomain": (request.get("config") or {}).get("baseDomain", ""),
        "topology": "sno",
        "nodeCount": 1,
        "deploymentTargetPattern": request.get("deploymentTargetPattern", ""),
        "host": request.get("host", {}),
        "provider": request.get("provider", ""),
        "region": request.get("region", ""),
        "microshiftVersion": request.get("microshiftVersion", ""),
        "owner": request.get("owner", discover_owner()),
        "createdAt": request.get("createdAt", current_timestamp()),
        "updatedAt": current_timestamp(),
        "status": state.get("status", "starting"),
        "returnCode": state.get("returnCode"),
        "error": state.get("error", ""),
        "vmName": provisioning.get("vmName", ""),
        "nodeVcpus": provisioning.get("nodeVcpus", 0),
        "memoryMb": provisioning.get("memoryMb", 0),
        "kubeconfigPath": kubeconfig_path,
        "installAccess": install_access,
        "request": public_request_view(request),
    }


def write_cluster_record(request: dict, state: dict | None = None) -> None:
    path = work_dir(request)
    ensure_private_dir(path)
    write_private_file(cluster_request_summary_path(path), json.dumps(public_request_view(request), indent=2, sort_keys=True))
    write_private_file(cluster_metadata_path(path), json.dumps(cluster_record_from_request(request, state), indent=2, sort_keys=True))


def backfill_cluster_record_from_runtime() -> None:
    if not REQUEST_FILE.exists():
        return
    try:
        request = json.loads(REQUEST_FILE.read_text(encoding="utf-8"))
    except Exception:
        return
    path = cluster_metadata_path(work_dir(request))
    if path.exists():
        return
    write_cluster_record(request, load_state())


def domain_exists(name: str) -> bool:
    if not name or not command_available("virsh"):
        return False
    return run("virsh", "dominfo", name, check=False).returncode == 0


def prune_cluster_runtime(path: Path, cluster: dict) -> None:
    request = cluster.get("request") or {}
    deployment_id = str(request.get("deploymentId", "")).strip()

    if path.exists():
        shutil.rmtree(path, ignore_errors=True)

    if job_running(load_state()):
        return

    current_request = current_request_view()
    if current_request and deployment_id and current_request.get("deploymentId") == deployment_id:
        clear_runtime_state()


def config_path(request: dict) -> Path:
    return generated_dir(request) / "config.yaml"


def plan_path(request: dict) -> Path:
    return generated_dir(request) / "install-plan.sh"


def local_pull_secret_path(request: dict) -> Path:
    return SECRET_DIR / f"{request['deploymentId']}-pull-secret.json"


def provisioning_artifact_path(request: dict, name: str) -> Path:
    return generated_dir(request) / name


def ssh_public_key_from_private_key(private_key_path: str) -> str:
    proc = run("ssh-keygen", "-y", "-f", private_key_path, check=False)
    if proc.returncode != 0 or not proc.stdout.strip():
        raise ValueError("Unable to derive the SSH public key from the provided private key. Passphrase-protected keys are not supported for create-host deployments.")
    return proc.stdout.strip()


def vm_disk_path(request: dict, pool: dict) -> Path:
    if pool["type"] == "logical":
        return Path(pool["targetPath"]) / request["provisioning"]["vmName"]
    return Path(pool["targetPath"]) / f"{request['provisioning']['vmName']}.qcow2"


def vm_seed_path(request: dict, pool: dict) -> Path:
    return LIBVIRT_MEDIA_DIR / f"{request['provisioning']['vmName']}-seed.iso"


def vm_disk_format(pool: dict) -> str:
    return "raw" if pool["type"] == "logical" else "qcow2"


def record_request_summary(request: dict, unit_name: str) -> dict:
    return {
        "schema": STATE_SCHEMA,
        "deploymentKind": "microshift",
        "deploymentTargetPattern": request["deploymentTargetPattern"],
        "deploymentName": request["deploymentName"],
        "deploymentId": request["deploymentId"],
        "microshiftVersion": request["microshiftVersion"],
        "host": request["host"],
        "provisioning": request["provisioning"],
        "mode": "deploy",
        "unitName": unit_name,
        "startedAt": current_timestamp(),
        "status": "starting",
    }


def host_label(request: dict) -> str:
    host = request["host"]
    return f"{host['sshUser']}@{host['address']}:{host['sshPort']}"


def resolve_remote_kubeconfig(request: dict) -> tuple[str, str]:
    configured_name = request["config"]["hostnameOverride"]
    system_name = remote_query(request, "hostname -f 2>/dev/null || hostname -s 2>/dev/null || hostname")
    candidates = []
    if configured_name:
        candidates.append(f"/var/lib/microshift/resources/kubeadmin/{configured_name}/kubeconfig")
    if system_name:
        candidates.append(f"/var/lib/microshift/resources/kubeadmin/{system_name}/kubeconfig")
    candidates.append("/var/lib/microshift/resources/kubeadmin/kubeconfig")
    for candidate in candidates:
        proc = run(*(ssh_base_argv(request) + [f"sudo -n test -f {shlex.quote(candidate)}"]), check=False)
        if proc.returncode == 0:
            return candidate, system_name or configured_name or request["host"]["address"]
    raise ValueError("MicroShift kubeconfig was not found on the target host")


def install_access(request: dict, local_kubeconfig: Path, remote_kubeconfig: str, server_name: str) -> dict:
    server_host = request["config"]["nodeIP"] or server_name or request["host"]["address"]
    return {
        "apiEndpoint": f"https://{server_host}:6443",
        "host": host_label(request),
        "kubeconfigPath": str(local_kubeconfig),
        "remoteKubeconfigPath": remote_kubeconfig,
    }


def download_base_image(request: dict) -> None:
    provisioning = request["provisioning"]
    if provisioning.get("imageSource") != "download":
        return
    ensure_runtime_dirs()
    target_path = downloaded_image_path(request)
    temp_path = target_path.with_suffix(target_path.suffix + ".part")
    url = provisioning["imageDownloadUrl"]
    redacted = sanitize_url(url)

    if target_path.exists():
        log_step(f"Using cached RHEL cloud image at {target_path}")
        return

    log_step(f"Downloading RHEL cloud image to {target_path}")
    log_command("curl --fail --location --output " + shlex.quote(str(temp_path)) + " " + shlex.quote(redacted))
    proc = subprocess.Popen(
        ["curl", "--fail", "--location", "--output", str(temp_path), url],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert proc.stdout is not None
    for raw_line in proc.stdout:
        log_line(raw_line.rstrip("\n"))
    rc = proc.wait()
    if rc != 0:
        temp_path.unlink(missing_ok=True)
        raise ValueError("Failed to download the RHEL cloud image")
    temp_path.replace(target_path)
    target_path.chmod(0o600)


def ensure_root_disk(pool: dict, request: dict, disk_path: Path) -> None:
    provisioning = request["provisioning"]
    if pool["type"] == "dir":
        pool_path = Path(pool["targetPath"])
        ensure_dir_pool_context(pool_path)
        run_logged(
            [
                "qemu-img",
                "create",
                "-f",
                "qcow2",
                "-F",
                "qcow2",
                "-b",
                str(effective_base_image_path(request)),
                str(disk_path),
                f"{provisioning['diskSizeGb']}G",
            ],
            step=f"Creating VM disk for {provisioning['vmName']}",
        )
        run("chown", "root:qemu", str(disk_path), check=False)
        run("chmod", "0660", str(disk_path), check=False)
        run("restorecon", str(disk_path), check=False)
        return

    vg_name = pool["sourceName"] or Path(pool["targetPath"]).name
    run_logged(
        [
            "lvcreate",
            "-y",
            "-W",
            "y",
            "-L",
            f"{provisioning['diskSizeGb']}G",
            "-n",
            disk_path.name,
            vg_name,
        ],
        step=f"Creating VM disk for {provisioning['vmName']}",
    )
    run_logged(
        [
            "qemu-img",
            "convert",
            "-O",
            "raw",
            str(effective_base_image_path(request)),
            str(disk_path),
        ],
        step=f"Populating VM disk for {provisioning['vmName']}",
    )


def wait_for_ssh(request: dict) -> None:
    log_step("Waiting for SSH on the provisioned host")
    for _ in range(60):
        proc = run(*(ssh_base_argv(request) + ["true"]), check=False)
        if proc.returncode == 0:
            return
        time.sleep(10)
    raise ValueError(f"Provisioned host {request['host']['address']} did not become reachable over SSH")


def wait_for_cloud_init(request: dict) -> None:
    remote_run(
        request,
        r"""
if command -v cloud-init >/dev/null 2>&1; then
    output="$(cloud-init status --wait 2>&1)"
    rc=$?
    printf '%s\n' "$output"
    if printf '%s\n' "$output" | grep -q 'status: done'; then
        exit 0
    fi
    exit $rc
elif test -f /var/lib/cloud/instance/boot-finished; then
    true
else
    for _ in $(seq 1 60); do
        test -f /var/lib/cloud/instance/boot-finished && exit 0
        sleep 5
    done
    echo "cloud-init did not finish within the expected time" >&2
    exit 1
fi
""".strip(),
        step="Waiting for cloud-init to finish on the provisioned host",
    )


def provision_vm(request: dict) -> None:
    provisioning = request["provisioning"]
    download_base_image(request)
    pool = ensure_pool_started(determine_pool(provisioning["storagePool"]))
    disk_path = vm_disk_path(request, pool)
    seed_path = vm_seed_path(request, pool)
    disk_format = vm_disk_format(pool)
    domain_name = vm_domain_name(request)

    if run("virsh", "dominfo", domain_name, check=False).returncode == 0:
        raise ValueError(f"Libvirt domain {domain_name} already exists")
    if disk_path.exists():
        raise ValueError(f"Disk path {disk_path} already exists")
    ensure_dir_pool_context(LIBVIRT_MEDIA_DIR)
    if seed_path.exists():
        seed_path.unlink()

    ensure_private_dir(generated_dir(request))
    user_data = provisioning_artifact_path(request, "user-data.yaml")
    meta_data = provisioning_artifact_path(request, "meta-data.yaml")
    network_config = provisioning_artifact_path(request, "network-config.yaml")
    write_private_file(user_data, render_cloud_init_user_data(request, ssh_public_key_from_private_key(request["host"]["sshPrivateKeyFile"])))
    write_private_file(meta_data, render_cloud_init_meta_data(request))
    write_private_file(network_config, render_cloud_init_network_config(request))

    ensure_root_disk(pool, request, disk_path)

    build_cloud_init_seed(seed_path, user_data, meta_data, network_config, domain_name)

    write_private_file(
        provisioning_artifact_path(request, "virt-install-plan.sh"),
        render_virt_install_plan(request, pool, disk_path, seed_path),
    )

    virt_install_argv = [
        "virt-install",
        "--name",
        domain_name,
        "--import",
        "--osinfo",
        "detect=on,require=off",
        "--memory",
        str(provisioning["memoryMb"]),
        "--vcpus",
        str(provisioning["nodeVcpus"]),
        "--cpu",
        "host-passthrough",
    ]
    perf = provisioning.get("performanceDomain", DEFAULT_PERFORMANCE_DOMAIN)
    if perf in PERFORMANCE_DOMAINS and perf != "none":
        virt_install_argv.extend(["--cputune", f"shares={PERFORMANCE_DOMAINS[perf]['cpu_shares']}"])
    virt_install_argv.extend(
        [
            "--disk",
            f"path={disk_path},format={disk_format},bus=virtio",
            "--disk",
            f"path={seed_path},device=cdrom,bus=sata",
            "--network",
            f"bridge={provisioning['bridgeName']},model=virtio,mac={provisioning['macAddress']}",
            "--graphics",
            "none",
            "--console",
            "pty,target_type=serial",
            "--noautoconsole",
            "--autostart",
        ]
    )

    run_logged(virt_install_argv, step=f"Creating libvirt guest {domain_name}")


def build_cloud_init_seed(seed_path: Path, user_data: Path, meta_data: Path, network_config: Path, domain_name: str) -> None:
    if command_available("cloud-localds"):
        run_logged(
            [
                "cloud-localds",
                "--network-config",
                str(network_config),
                str(seed_path),
                str(user_data),
                str(meta_data),
            ],
            step=f"Generating cloud-init seed for {domain_name}",
        )
        return

    with tempfile.TemporaryDirectory(prefix="cockpit-microshift-seed-") as temp_dir:
        stage_dir = Path(temp_dir)
        shutil.copyfile(user_data, stage_dir / "user-data")
        shutil.copyfile(meta_data, stage_dir / "meta-data")
        shutil.copyfile(network_config, stage_dir / "network-config")
        run_logged(
            [
                "mkisofs",
                "-output",
                str(seed_path),
                "-volid",
                "cidata",
                "-joliet",
                "-rock",
                str(stage_dir / "user-data"),
                str(stage_dir / "meta-data"),
                str(stage_dir / "network-config"),
            ],
            step=f"Generating cloud-init seed for {domain_name}",
        )


def wait_for_microshift(request: dict) -> None:
    remote_run(
        request,
        """
for _ in $(seq 1 60); do
    if systemctl is-active --quiet microshift.service; then
        exit 0
    fi
    sleep 10
done
systemctl status microshift.service --no-pager || true
exit 1
""".strip(),
        step="Waiting for microshift.service to become active",
    )


def validate_microshift(request: dict) -> None:
    remote_run(
        request,
        """
for _ in $(seq 1 60); do
    if oc --kubeconfig /var/lib/microshift/resources/kubeadmin/kubeconfig get nodes -o json >/tmp/microshift-nodes.json 2>/tmp/microshift-nodes.err; then
        if python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path('/tmp/microshift-nodes.json').read_text())
for node in data.get('items', []):
    ready = {entry['type']: entry['status'] for entry in node.get('status', {}).get('conditions', [])}.get('Ready')
    if ready == 'True':
        raise SystemExit(0)
raise SystemExit(1)
PY
        then
            exit 0
        fi
    fi
    sleep 10
done
cat /tmp/microshift-nodes.err 2>/dev/null || true
oc --kubeconfig /var/lib/microshift/resources/kubeadmin/kubeconfig get nodes -o wide || true
exit 1
""".strip(),
        step="Validating node readiness with oc",
    )
    remote_run(
        request,
        "oc --kubeconfig /var/lib/microshift/resources/kubeadmin/kubeconfig get pods -A",
        step="Collecting post-install pod state",
    )


def handle_preflight(payload_b64: str) -> int:
    try:
        request, errors = validate_payload(parse_payload(payload_b64))
    except ValueError as exc:
        return json_response({"ok": False, "errors": [str(exc)]}, exit_code=0)
    return json_response({"ok": not errors, "errors": errors, "request": public_request_view(request), "running": job_running(load_state())})


def handle_options() -> int:
    pools = query_storage_pools()
    bridges = query_bridges()
    return json_response(
        {
            "ok": True,
            "storagePools": pools,
            "bridges": bridges,
            "defaults": {
                "storagePool": choose_default_pool(pools),
                "bridgeName": choose_default_bridge(bridges),
                "sshUser": DEFAULT_VM_SSH_USER,
                "nodeVcpus": DEFAULT_VM_VCPUS,
                "memoryMb": DEFAULT_VM_MEMORY_MB,
                "diskSizeGb": DEFAULT_VM_DISK_GB,
                "performanceDomain": DEFAULT_PERFORMANCE_DOMAIN,
                "pullSecretFile": "",
            },
            "running": job_running(load_state()),
        }
    )


def handle_clusters() -> int:
    return json_response({"ok": True, "clusters": discover_clusters(), "running": job_running(load_state())})


def handle_cluster(cluster_id: str) -> int:
    cluster = discover_cluster(cluster_id, include_health=True)
    if not cluster:
        return json_response({"ok": False, "errors": [f"Cluster {cluster_id} was not found"]}, exit_code=0)
    return json_response({"ok": True, "cluster": cluster, "running": job_running(load_state())})


def handle_artifacts(payload_b64: str | None, current: bool) -> int:
    if current:
        if not REQUEST_FILE.exists():
            return json_response({"ok": False, "errors": ["No current MicroShift deployment request is recorded"]}, exit_code=0)
        request = json.loads(REQUEST_FILE.read_text(encoding="utf-8"))
        return json_response(render_artifact_bundle(request))
    if not payload_b64:
        return json_response({"ok": False, "errors": ["Missing payload"]}, exit_code=0)
    try:
        request, errors = validate_payload(parse_payload(payload_b64))
    except ValueError as exc:
        return json_response({"ok": False, "errors": [str(exc)]}, exit_code=0)
    if errors:
        return json_response({"ok": False, "errors": errors}, exit_code=0)
    return json_response(render_artifact_bundle(request))


def handle_start(payload_b64: str) -> int:
    try:
        request, errors = validate_payload(parse_payload(payload_b64))
    except ValueError as exc:
        return json_response({"ok": False, "errors": [str(exc)]}, exit_code=0)

    if job_running(load_state()):
        return json_response({"ok": False, "errors": ["A MicroShift deployment is already running"]}, exit_code=0)
    if errors:
        return json_response({"ok": False, "errors": errors}, exit_code=0)

    clear_runtime_state()
    ensure_runtime_dirs()
    request["createdAt"] = current_timestamp()
    request["owner"] = discover_owner()
    request["provider"] = "Existing RHEL host" if request["deploymentTargetPattern"] == "existing-host" else "Local libvirt / KVM"
    request["region"] = request["host"]["address"] if request["deploymentTargetPattern"] == "existing-host" else "Cockpit host"

    ensure_private_dir(generated_dir(request))
    write_private_file(local_pull_secret_path(request), request["secretMaterial"]["pullSecret"].strip() + "\n")
    write_private_file(config_path(request), render_microshift_config(request))
    write_private_file(plan_path(request), render_install_plan(request))

    write_private_file(REQUEST_FILE, json.dumps(request, indent=2, sort_keys=True))
    write_private_file(LOG_FILE, "")

    unit_name = f"cockpit-microshift-{dt.datetime.now():%Y%m%d%H%M%S}"
    state = record_request_summary(request, unit_name)
    save_state(state)
    write_cluster_record(request, state)

    proc = run(
        "systemd-run",
        "--unit",
        unit_name,
        "--description",
        "Cockpit MicroShift",
        "python3",
        str(HELPER_PATH),
        "run-job",
        "--unit-name",
        unit_name,
        check=False,
    )
    if proc.returncode != 0:
        state["status"] = "failed"
        state["endedAt"] = current_timestamp()
        state["error"] = proc.stderr.strip() or proc.stdout.strip() or "Failed to start MicroShift job"
        save_state(state)
        write_cluster_record(request, state)
        return json_response({"ok": False, "errors": [state["error"]]})

    state["status"] = "running"
    save_state(state)
    write_cluster_record(request, state)
    return json_response({"ok": True, "unitName": unit_name, "request": public_request_view(request)})


def run_install_job(unit_name: str) -> int:
    request = json.loads(REQUEST_FILE.read_text(encoding="utf-8"))
    output_dir = generated_dir(request)
    local_kubeconfig = output_dir / "kubeconfig"
    log_step(f"Starting MicroShift deployment for {request['deploymentName']} on {host_label(request)}")

    rc = 0
    try:
        if request["deploymentTargetPattern"] == "create-host":
            provision_vm(request)
            wait_for_ssh(request)
            wait_for_cloud_init(request)
        remote_errors = validate_remote_host(request)
        if remote_errors:
            raise ValueError("; ".join(remote_errors))
        if request.get("packageAccess", {}).get("mode") == "activation-key":
            ensure_package_access(request)
            remote_errors = validate_remote_host(request, require_packages=True)
            if remote_errors:
                raise ValueError("; ".join(remote_errors))
        package_names = "microshift openshift-clients"
        if request["prerequisites"]["manageFirewall"]:
            package_names += " firewalld"
        remote_run(request, f"dnf install -y {package_names}", step="Installing MicroShift and required RPMs")
        if request["prerequisites"]["manageFirewall"]:
            remote_run(request, "\n".join(firewall_commands(request)), step="Configuring firewalld for MicroShift")

        remote_pull_secret = f"/tmp/{request['deploymentId']}-pull-secret.json"
        remote_config = f"/tmp/{request['deploymentId']}-config.yaml"
        scp_to_remote(request, local_pull_secret_path(request), remote_pull_secret, step="Uploading pull secret to the target host")
        scp_to_remote(request, config_path(request), remote_config, step="Uploading MicroShift config to the target host")
        remote_run(
            request,
            f"""
install -D -m 0600 {shlex.quote(remote_pull_secret)} /etc/crio/openshift-pull-secret
install -D -m 0644 {shlex.quote(remote_config)} /etc/microshift/config.yaml
rm -f {shlex.quote(remote_pull_secret)} {shlex.quote(remote_config)}
""".strip(),
            step="Installing MicroShift input files on the target host",
        )
        remote_run(request, "systemctl enable --now microshift.service", step="Starting microshift.service")
        wait_for_microshift(request)
        validate_microshift(request)

        remote_kubeconfig, server_name = resolve_remote_kubeconfig(request)
        remote_run(
            request,
            f"cat {shlex.quote(remote_kubeconfig)}",
            step="Reading generated kubeconfig from the target host",
        )
        ensure_private_dir(local_kubeconfig.parent)
        proc = run(*(ssh_base_argv(request) + [f"sudo -n cat {shlex.quote(remote_kubeconfig)}"]), check=False)
        if proc.returncode != 0:
            raise ValueError(proc.stderr.strip() or proc.stdout.strip() or "Unable to copy kubeconfig from the target host")
        write_private_file(local_kubeconfig, proc.stdout)

        state = load_state()
        state["installAccess"] = install_access(request, local_kubeconfig, remote_kubeconfig, server_name)
        save_state(state)
        write_cluster_record(request, state)
        log_step("MicroShift installation completed successfully")
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        message = format_process_error(exc)
        for line in message.splitlines():
            log_line(f"[ERROR] {line}")
        rc = 1
    except Exception as exc:  # pragma: no cover
        log_line(f"[ERROR] {exc}")
        rc = 1

    state = load_state()
    state.update(
        {
            "unitName": unit_name,
            "status": "succeeded" if rc == 0 else "failed",
            "endedAt": current_timestamp(),
            "returnCode": rc,
        }
    )
    save_state(state)
    write_cluster_record(request, state)
    return rc


def handle_run_job(unit_name: str) -> int:
    ensure_runtime_dirs()
    return run_install_job(unit_name)


def current_request_view() -> dict | None:
    if not REQUEST_FILE.exists():
        return None
    try:
        return public_request_view(json.loads(REQUEST_FILE.read_text(encoding="utf-8")))
    except Exception:
        return None


def handle_status() -> int:
    state = load_state()
    service_status = unit_status(state.get("unitName", ""))
    request = current_request_view()
    log_lines = tail_log()
    return json_response(
        {
            "ok": True,
            "state": state,
            "request": request,
            "running": service_status.get("ActiveState") in {"active", "activating"},
            "service": service_status,
            "logTail": log_lines,
            "currentTask": current_task_from_log(log_lines),
        }
    )


def handle_cancel() -> int:
    state = load_state()
    unit_name = state.get("unitName", "")
    if not unit_name:
        return json_response({"ok": False, "errors": ["No active MicroShift deployment is recorded"]}, exit_code=0)
    run("systemctl", "stop", unit_name, check=False)
    state["status"] = "canceled"
    state["endedAt"] = current_timestamp()
    save_state(state)
    if REQUEST_FILE.exists():
        try:
            request = json.loads(REQUEST_FILE.read_text(encoding="utf-8"))
        except Exception:
            request = None
        if request:
            write_cluster_record(request, state)
    return json_response({"ok": True, "unitName": unit_name})


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("options")

    preflight = subparsers.add_parser("preflight")
    preflight.add_argument("--payload-b64", required=True)

    artifacts = subparsers.add_parser("artifacts")
    artifacts.add_argument("--payload-b64")
    artifacts.add_argument("--current", action="store_true")

    start = subparsers.add_parser("start")
    start.add_argument("--payload-b64", required=True)

    run_job = subparsers.add_parser("run-job")
    run_job.add_argument("--unit-name", required=True)

    subparsers.add_parser("clusters")
    cluster = subparsers.add_parser("cluster")
    cluster.add_argument("--cluster-id", required=True)
    subparsers.add_parser("status")
    subparsers.add_parser("cancel")

    args = parser.parse_args()
    try:
        if args.command == "options":
            return handle_options()
        if args.command == "preflight":
            return handle_preflight(args.payload_b64)
        if args.command == "artifacts":
            return handle_artifacts(args.payload_b64, args.current)
        if args.command == "start":
            return handle_start(args.payload_b64)
        if args.command == "run-job":
            return handle_run_job(args.unit_name)
        if args.command == "clusters":
            return handle_clusters()
        if args.command == "cluster":
            return handle_cluster(args.cluster_id)
        if args.command == "status":
            return handle_status()
        if args.command == "cancel":
            return handle_cancel()
    except Exception as exc:  # pragma: no cover
        return json_response({"ok": False, "errors": [str(exc)]}, exit_code=1)
    return 1


if __name__ == "__main__":
    sys.exit(main())
