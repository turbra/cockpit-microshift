# cockpit-microshift

Standalone Cockpit plugin for guided MicroShift installation either onto an
existing RHEL host over SSH or into a locally provisioned libvirt/KVM guest on
the Cockpit host.

[![License: GPL-3.0](https://img.shields.io/github/license/turbra/cockpit-microshift)](LICENSE)
![MicroShift 4.21](https://img.shields.io/badge/MicroShift-4.21-red)
![Cockpit](https://img.shields.io/badge/Cockpit-plugin-blue)
![RHEL 9/10](https://img.shields.io/badge/RHEL-9%2F10-red)

- dedicated MicroShift installer UI
- cluster list landing page with per-cluster overview
- host-based RPM install workflow
- optional local libvirt/KVM guest provisioning before the in-guest install
- optional local libvirt/KVM guest provisioning with selectable performance domains
- preflight checks for RHEL version, SSH, sudo, architecture, and package availability
- optional automated RHSM registration and MicroShift repository enablement
- rendered `config.yaml`, request JSON, and remote install plan review
- execution status, recent output, and kubeconfig retrieval after install

## Authoritative Sources

- Red Hat Build of MicroShift 4.21 installation guide:
  https://docs.redhat.com/en/documentation/red_hat_build_of_microshift/4.21/html-single/getting_ready_to_install_microshift/index
- Upstream implementation:
  https://github.com/openshift/microshift
- Community mirror reviewed for context:
  https://github.com/microshift-io/microshift

This plugin follows the Red Hat host-based RPM installation model for the final
MicroShift install. The local libvirt/KVM path is an intentional convenience
layer that provisions a RHEL guest first, then applies the same documented
in-guest install flow.

## Prerequisites

- Cockpit is installed on the machine hosting this plugin
- the Cockpit host can SSH to the target host with key auth
- the SSH user has `sudo -n` on the target host
- the target host is RHEL 9 or RHEL 10
- the operator supplies a valid pull secret

Repository access can follow either pattern:

- `Use preconfigured repositories`
  - the target host is already registered and already exposes:
    - `microshift`
    - `openshift-clients`
- `Register and enable repositories automatically`
  - the operator supplies:
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
- you can assign a static guest IP, gateway, and DNS servers for the new VM

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

If Cockpit is not already running:

```bash
sudo systemctl enable --now cockpit.socket
```

Then open `https://<host>:9090` and select `MicroShift`.
The landing page opens the local MicroShift cluster inventory, with links into
the install workflow and per-cluster overview pages.

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
- downloaded guest images cached under `/var/lib/cockpit-microshift/image-cache/`
- rendered config and install plan stored under the runtime work directory
- generated kubeconfig copied back to the Cockpit host after a successful install
- optional firewalld configuration uses the documented MicroShift trusted-source and exposed-port model
- create-host deployments also render cloud-init inputs and a local `virt-install` plan
- create-host root disks support the same `dir` and `logical` pool types used by `cockpit-openshift`

## Project Layout

- `src/cockpit-microshift/`
  - Cockpit runtime assets and backend helper
- `docs/microshift-support.md`
  - architecture notes, reference mapping, and known gaps
- `build-rpm.sh`
  - local RPM build entrypoint
- `cockpit-microshift.spec`
  - RPM packaging metadata
