# Cockpit MicroShift

`cockpit-microshift` is a Cockpit-hosted local MicroShift installer for one
existing RHEL host or one KVM/libvirt guest created on the Cockpit host.

[![License: GPL-3.0](https://img.shields.io/github/license/turbra/cockpit-microshift)](LICENSE)
![MicroShift 4.21](https://img.shields.io/badge/MicroShift-4.21-red)
![Cockpit](https://img.shields.io/badge/Cockpit-plugin-blue)
![KVM/libvirt](https://img.shields.io/badge/KVM-libvirt-blue)
![RHEL 9/10](https://img.shields.io/badge/RHEL-9%2F10-red)

- guided MicroShift host deployment
- local cluster inventory landing page with per-cluster overview
- self-contained privileged backend for validation, runtime state, and install artifacts
- optional local libvirt/KVM guest provisioning before the in-guest install
- rendered `config.yaml`, request JSON, install plan, cloud-init inputs, and `virt-install` plan review
- deployment status, recent output, and recorded kubeconfig access details

## Start Here

- install the plugin from source:
  [commands](#from-source)
- review host prerequisites:
  [notes](#prerequisites)
- build the RPM:
  [commands](#building-the-rpm)
- install the plugin from RPM:
  [commands](#from-rpm)
- review backend limits and runtime ownership:
  [notes](#backend-expectations)

> [!IMPORTANT]
> The validated deployment path today is:
>
> - `x86_64`
> - single-node MicroShift
> - static host networking
> - existing RHEL host deployment over SSH
> - local libvirt guest creation on the Cockpit host
> - directory-backed and logical libvirt storage pools

> [!NOTE]
> The authoritative source for the final install flow is the Red Hat Build of
> MicroShift host-based RPM installation model. The create-host path is only a
> convenience layer that provisions a RHEL guest first, then applies that same
> documented in-guest install flow.

> [!NOTE]
> The user must provide valid registry authentication data in the UI, either by
> pasting it directly or by pointing at a local file on the host. For
> SSH-based deployment, the user must also provide an SSH key path available on
> the Cockpit host.

## Default Operating Model

- host-local Cockpit plugin with privileged backend helper
- installer runtime under `/var/lib/cockpit-microshift/`
- generated artifacts owned by this project, not an external orchestration repo
- MicroShift lifecycle driven directly by:
  - `ssh`
  - `scp`
  - `systemd-run`
  - `virsh`
  - `virt-install`
  - `oc`

Use this path when you want the Cockpit host to drive MicroShift deployment
from the UI instead of manually preparing the host and install artifacts.

## Prerequisites

- Cockpit is installed on the machine hosting this plugin
- the Cockpit host can SSH to the target host with key auth
- the SSH user has `sudo -n` on the target host
- the target host is RHEL 9 or RHEL 10
- the user has valid registry authentication data

Repository access can follow either pattern:

- `Use preconfigured repositories`
  - the target host is already registered and already exposes:
    - `microshift`
    - `openshift-clients`
- `Register and enable repositories automatically`
  - the user supplies:
    - RHSM organization ID
    - RHSM activation key
  - optional:
    - release lock
    - additional repository IDs

Additional prerequisites for the create-host path:

- libvirt/KVM is available on the Cockpit host
- either:
  - a supported libvirt storage pool exists
  - or the host can use the standard `/var/lib/libvirt/images` path
- a bridge interface exists on the Cockpit host
- either:
  - a usable RHEL qcow2 cloud image is available locally on the Cockpit host
  - or a direct downloadable qcow2 URL is available to the Cockpit host
- static guest IP, gateway, and DNS servers are prepared for the new VM

## Installation

### From source

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

Cockpit discovers the plugin on page load. No service restart is required.

Open Cockpit if it is not already running:

```bash
sudo systemctl enable --now cockpit.socket
```

Then open `https://<host>:9090` and navigate to `MicroShift`.

### Building the RPM

Install the packaging tool once on the build host:

```bash
sudo dnf install -y rpm-build
```

Then build from the project directory:

```bash
cd /path/to/cockpit-microshift
./build-rpm.sh
```

Build output:

- `rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm`

### From RPM

After the RPM has been built, install it from the project directory:

```bash
sudo dnf install -y ./rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm
```

## Backend Expectations

- the backend writes its own runtime state under `/var/lib/cockpit-microshift/`
- downloaded guest images are cached under `/var/lib/cockpit-microshift/image-cache/`
- generated kubeconfig is copied back to the Cockpit host after a successful install
- the current validated path assumes static host and guest networking
- firewalld configuration follows the documented MicroShift trusted-source and exposed-port model
- create-host root disks support the same `dir` and `logical` pool types used by `cockpit-openshift`

> [!NOTE]
> The plugin previews generated install inputs and provisioning artifacts
> directly in the UI. Credential data is redacted in backend responses and
> artifact previews.

## Authoritative Sources

- Red Hat Build of MicroShift 4.21 installation guide:
  https://docs.redhat.com/en/documentation/red_hat_build_of_microshift/4.21/html-single/getting_ready_to_install_microshift/index
- Upstream implementation:
  https://github.com/openshift/microshift
- Community mirror reviewed for context:
  https://github.com/microshift-io/microshift

## Project Layout

- `src/cockpit-microshift/`
  - Cockpit runtime assets and backend helper
- `docs/microshift-support.md`
  - architecture notes, reference mapping, and known gaps
- `build-rpm.sh`
  - local RPM build entrypoint
- `cockpit-microshift.spec`
  - RPM packaging metadata
- `README.md`
  - operator-facing usage and install notes
