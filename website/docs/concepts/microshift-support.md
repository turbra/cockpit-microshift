---
title: MicroShift Support Model
description: How the implementation maps to the Red Hat Build of MicroShift installation model.
---

# MicroShift Support Model

Cockpit MicroShift is implemented as a dedicated host-based workflow. It does
not reuse the multi-node OpenShift deployment path from `cockpit-openshift`.

## Authoritative Sources

- Red Hat Build of MicroShift 4.21 installation guide:
  https://docs.redhat.com/en/documentation/red_hat_build_of_microshift/4.21/html-single/getting_ready_to_install_microshift/index
- Upstream MicroShift implementation:
  https://github.com/openshift/microshift
- Community MicroShift mirror reviewed for context:
  https://github.com/microshift-io/microshift

The Red Hat installation guide and upstream `openshift/microshift` repository
are the governing references. The community mirror is context, not the primary
implementation source.

## Mapping To The Reference Model

The implementation aligns to the documented Red Hat MicroShift install model
by:

- collecting target host SSH and sudo access details
- validating RHEL version, architecture, SSH, sudo, and package availability
- optionally registering the target host with RHSM through organization ID and
  activation key inputs
- rendering a MicroShift `config.yaml` from supported fields:
  - `dns.baseDomain`
  - `node.hostnameOverride`
  - `node.nodeIP`
  - `apiServer.subjectAltNames`
  - `network.clusterNetwork`
  - `network.serviceNetwork`
  - `network.serviceNodePortRange`
  - `debugging.logLevel`
- optionally configuring `firewalld` with trusted sources and public ports
- installing `microshift` and `openshift-clients` through `dnf`
- writing the CRI-O registry auth file under `/etc/crio/`
- writing `/etc/microshift/config.yaml`
- enabling and starting `microshift.service`
- validating node readiness and pod state with `oc`
- copying the generated kubeconfig back to the Cockpit host

## Create-Host Divergence

The `create-host` path is an intentional divergence from the Red Hat
documentation. It provisions a local RHEL guest first, then falls back to the
same host-based MicroShift installation pattern used for `existing-host`.

Additional create-host requirements:

- libvirt/KVM on the Cockpit host
- a supported storage pool or `/var/lib/libvirt/images`
- a bridge on the Cockpit host
- a local RHEL qcow2 cloud image or direct downloadable qcow2 URL
- static guest IP, gateway, and DNS plan

## Known Limits

- The automated RHSM path follows the documented MicroShift 4.21 RPM model
  directly for RHEL 9.
- For RHEL 10, the current implementation treats `10.0` as the aligned
  Technology Preview target.
- Newer RHEL 10 minors are rejected early when the required `microshift` and
  `openshift-clients` RPMs are not exposed through the enabled repositories.
- The create-host path supports `dir` and `logical` libvirt pool types, plus a
  fallback to `/var/lib/libvirt/images`.
- Downloaded qcow2 images must be reachable by the Cockpit host with `curl`.
