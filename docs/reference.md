---
title: Reference
description: >-
  Scan-friendly reference for install commands, runtime files, backend
  expectations, and source layout.
summary: >-
  Read this page when you need exact commands, file paths, artifact names, or
  packaging details without digging through the repo.
page_type: Reference
topic_family: Install, packaging, runtime, and source layout
parent_label: Docs Home
parent_url: /
operator_focus:
  - Get exact host commands, paths, files, and artifact names fast.
  - Confirm what the backend and package actually carry.
start_here:
  - label: Practical Use Cases
    url: /practical-use-cases.html
  - label: Capabilities
    url: /capabilities.html
related_pages:
  - label: Documentation Map
    url: /documentation-map.html
source_links:
  - label: README.md
    url: https://github.com/turbra/cockpit-microshift/blob/main/README.md
  - label: build-rpm.sh
    url: https://github.com/turbra/cockpit-microshift/blob/main/build-rpm.sh
  - label: cockpit-microshift.spec
    url: https://github.com/turbra/cockpit-microshift/blob/main/cockpit-microshift.spec
  - label: src/cockpit-microshift/manifest.json
    url: https://github.com/turbra/cockpit-microshift/blob/main/src/cockpit-microshift/manifest.json
---

# Reference

## Host Prerequisites

- Cockpit installed on the machine hosting this plugin
- SSH reachability from the Cockpit host to the target host
- SSH user with `sudo -n` on the target host
- target host running RHEL 9 or RHEL 10
- valid registry authentication data

Additional prerequisites for `create-host`:

- libvirt/KVM on the Cockpit host
- supported storage pool or `/var/lib/libvirt/images`
- bridge interface on the Cockpit host
- local or downloadable RHEL qcow2 image
- static guest IP, gateway, and DNS plan

## Runtime Model

| Component | Role |
| --- | --- |
| Cockpit plugin | local UI shell |
| `microshift_backend.py` | privileged workflow owner |
| `/var/lib/cockpit-microshift/` | runtime state, generated artifacts, logs |
| `/var/lib/cockpit-microshift/image-cache/` | cached guest images |
| `ssh` / `scp` / `systemd-run` / `virsh` / `virt-install` / `oc` | host-side execution tools |

## Install From Source

```bash
sudo mkdir -p /usr/share/cockpit/cockpit-microshift
sudo install -m 0644 src/cockpit-microshift/manifest.json /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/index.html /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/create.html /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/overview.html /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cockpit-microshift.css /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cockpit-microshift.js /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cluster-list.js /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cluster-overview.js /usr/share/cockpit/cockpit-microshift/
sudo install -m 0755 src/cockpit-microshift/microshift_backend.py /usr/share/cockpit/cockpit-microshift/
```

Then ensure Cockpit is running:

```bash
sudo systemctl enable --now cockpit.socket
```

Cockpit will expose the plugin in the left navigation as `MicroShift`.

## Build The RPM

```bash
sudo dnf install -y rpm-build
cd /path/to/cockpit-microshift
./build-rpm.sh
```

Expected RPM output:

- `rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm`

## Install The RPM

```bash
sudo dnf install -y ./rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm
```

## Packaging Notes

The RPM spec currently installs:

- `manifest.json`
- `index.html`
- `create.html`
- `overview.html`
- `cockpit-microshift.js`
- `cluster-list.js`
- `cluster-overview.js`
- `cockpit-microshift.css`
- `microshift_backend.py`
- `README.md`

Path:

- `/usr/share/cockpit/cockpit-microshift/`

## Artifact Review Surface

The backend review flow exposes artifact families such as:

- rendered `config.yaml`
- request summary JSON
- install plan output
- cloud-init inputs for `create-host`
- `virt-install` plan for `create-host`
- recorded kubeconfig access details after success

Credential data is redacted in backend responses and artifact previews.

## Cockpit Entry Point

The Cockpit menu registration lives in:

- `src/cockpit-microshift/manifest.json`

Current menu shape:

- label: `MicroShift`
- path: `index.html`
- keywords include `microshift`, `installer`, `edge`, `cluster`, `fleet`,
  `rhel`, and `single-node`

## Authoritative External Sources

- Red Hat Build of MicroShift 4.21 installation guide:
  https://docs.redhat.com/en/documentation/red_hat_build_of_microshift/4.21/html-single/getting_ready_to_install_microshift/index
- upstream MicroShift implementation:
  https://github.com/openshift/microshift

## Key Source Files

| Path | Why it exists in the workflow |
| --- | --- |
| `src/cockpit-microshift/index.html` | cluster inventory entry point |
| `src/cockpit-microshift/create.html` | guided install workflow |
| `src/cockpit-microshift/overview.html` | cluster-specific follow-up view |
| `src/cockpit-microshift/cockpit-microshift.js` | main installer UI logic |
| `src/cockpit-microshift/cluster-list.js` | inventory and destroy actions |
| `src/cockpit-microshift/cluster-overview.js` | overview and access behavior |
| `src/cockpit-microshift/microshift_backend.py` | backend execution boundary |
| `cockpit-microshift.spec` | RPM packaging definition |
| `build-rpm.sh` | local RPM build entrypoint |

## Screens In Scope

- cluster list and deployment-target filtering
- guided MicroShift install workflow
- per-cluster overview, access, history, and support tabs

Destroy behavior is currently intended for local `create-host` deployments. Do
not assume the same cleanup semantics for an existing remote host.
