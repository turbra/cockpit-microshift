---
title: Runtime Model
description: Local runtime ownership, generated artifacts, and backend boundaries.
---

# Runtime Model

The backend is not a thin form submitter. It owns local workflow state,
generated artifacts, status files, and the privileged host-side execution
boundary.

## Local Ownership

| Path | Purpose |
| --- | --- |
| `/var/lib/cockpit-microshift/` | runtime root |
| `/var/lib/cockpit-microshift/microshift-work/` | generated work directories |
| `/var/lib/cockpit-microshift/image-cache/` | downloaded guest image cache |
| `/usr/share/cockpit/cockpit-microshift/` | installed Cockpit plugin files |

The runtime root is project-owned state. It should not contain user-local notes,
private kubeconfigs outside the deployment workflow, or hand-maintained
configuration.

## Backend Responsibilities

The backend handles:

- request validation and normalization
- target host SSH and sudo preflight checks
- optional RHSM registration and repository enablement
- MicroShift `config.yaml` rendering
- optional firewalld configuration
- CRI-O pull secret placement
- MicroShift RPM install and service start
- readiness checks with `oc`
- kubeconfig retrieval to the Cockpit host
- local libvirt guest provisioning for `create-host`
- destroy and clean rebuild for plugin-owned local guest deployments

## Generated Artifacts

The review surface exposes files such as:

- `config.yaml`
- request summary JSON
- install plan
- cloud-init user data and network data for `create-host`
- `virt-install` plan for `create-host`
- kubeconfig access details after install

Credential data is redacted in backend responses and artifact previews.

## Cleanup Boundary

Local `create-host` cleanup can remove the libvirt domain, guest disk, generated
seed media, work directory, stale inventory entry, and local credential file
for the deployment.

Existing-host cleanup is intentionally narrower. A remote RHEL host is not a
disposable VM, so package removal and broad system cleanup require explicit
ownership rules before they belong in the default flow.
