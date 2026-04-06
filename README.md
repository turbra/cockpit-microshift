# cockpit-microshift

Standalone Cockpit plugin for guided MicroShift installation onto an existing
RHEL host over SSH.

[![License: GPL-3.0](https://img.shields.io/github/license/turbra/cockpit-microshift)](LICENSE)
![MicroShift 4.21](https://img.shields.io/badge/MicroShift-4.21-red)
![Cockpit](https://img.shields.io/badge/Cockpit-plugin-blue)
![RHEL 9/10](https://img.shields.io/badge/RHEL-9%2F10-red)

- dedicated MicroShift installer UI
- host-based RPM install workflow
- preflight checks for RHEL version, SSH, sudo, architecture, and package availability
- rendered `config.yaml`, request JSON, and remote install plan review
- execution status, recent output, and kubeconfig retrieval after install

## Authoritative Sources

- Red Hat Build of MicroShift 4.21 installation guide:
  https://docs.redhat.com/en/documentation/red_hat_build_of_microshift/4.21/html-single/getting_ready_to_install_microshift/index
- Upstream implementation:
  https://github.com/openshift/microshift
- Community mirror reviewed for context:
  https://github.com/microshift-io/microshift

This plugin follows the Red Hat host-based RPM installation model. It does not
try to treat MicroShift as a full OpenShift cluster deployment.

## Prerequisites

- Cockpit is installed on the machine hosting this plugin
- the Cockpit host can SSH to the target host with key auth
- the SSH user has `sudo -n` on the target host
- the target host is RHEL 9 or RHEL 10
- the target host already has access to repositories that provide:
  - `microshift`
  - `openshift-clients`
- the operator supplies a valid pull secret

## Installation

### From source

```bash
sudo mkdir -p /usr/share/cockpit/cockpit-microshift
sudo install -m 0644 src/cockpit-microshift/manifest.json /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/index.html /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cockpit-microshift.css /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cockpit-microshift.js /usr/share/cockpit/cockpit-microshift/
sudo install -m 0755 src/cockpit-microshift/microshift_backend.py /usr/share/cockpit/cockpit-microshift/
```

Cockpit discovers the plugin on page load. No service restart is required.

If Cockpit is not already running:

```bash
sudo systemctl enable --now cockpit.socket
```

Then open `https://<host>:9090` and select `MicroShift`.

### Building the RPM

```bash
sudo dnf install -y rpm-build
./build-rpm.sh
```

### From RPM

```bash
sudo dnf install -y ./rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm
```

## Runtime Model

- plugin runtime under `/var/lib/cockpit-microshift/`
- rendered config and install plan stored under the runtime work directory
- generated kubeconfig copied back to the Cockpit host after a successful install
- optional firewalld configuration uses the documented MicroShift trusted-source and exposed-port model

## Project Layout

- `src/cockpit-microshift/`
  - Cockpit runtime assets and backend helper
- `docs/microshift-support.md`
  - architecture notes, reference mapping, and known gaps
- `build-rpm.sh`
  - local RPM build entrypoint
- `cockpit-microshift.spec`
  - RPM packaging metadata
