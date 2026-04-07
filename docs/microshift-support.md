# MicroShift Support Architecture

This repository provides a standalone Cockpit plugin for MicroShift. It does
not reuse the OpenShift cluster deployment path.

## Authoritative Sources

- Red Hat Build of MicroShift 4.21 installation guide:
  https://docs.redhat.com/en/documentation/red_hat_build_of_microshift/4.21/html-single/getting_ready_to_install_microshift/index
- Upstream MicroShift implementation:
  https://github.com/openshift/microshift
- Community MicroShift mirror:
  https://github.com/microshift-io/microshift

The primary reference is the Red Hat installation guide plus the upstream
`openshift/microshift` repository. The community mirror was reviewed for
context, not as the governing implementation source.

## Architecture Approach

MicroShift is implemented as a dedicated host-based workflow with two operator
entry patterns:

- UI entrypoint: `src/cockpit-microshift/index.html`
- UI controller: `src/cockpit-microshift/cockpit-microshift.js`
- Backend helper: `src/cockpit-microshift/microshift_backend.py`

Supported target patterns:

- `existing-host`
  - direct alignment with the Red Hat documented install model
- `create-host`
  - local libvirt/KVM provisioning on the Cockpit host, then the same in-guest install model
  - includes the same Gold / Silver / Bronze performance-domain selection pattern already used by `cockpit-openshift`

This standalone plugin is intentional, because the documented MicroShift
lifecycle is materially different:

- existing RHEL host
- RPM installation
- `/etc/microshift/config.yaml`
- remote service start and validation
- kubeconfig retrieval from `/var/lib/microshift/resources/kubeadmin/...`

The `cockpit-openshift` plugin can stay focused on multi-node KVM-backed
cluster deployment and libvirt artifact generation.

The `create-host` path is an intentional divergence from the Red Hat
documentation. It is a local provisioning convenience layer only. Once the VM
exists, the backend falls back to the same host-based MicroShift installation
pattern used for `existing-host`.

## Mapping to the Reference Model

The implementation aligns to the documented Red Hat MicroShift install model by:

- collecting target host SSH and sudo access details instead of cluster-host VM definitions
- optionally provisioning a local libvirt guest from a RHEL cloud image when `create-host` is selected
- applying a weighted performance domain to the provisioned VM when selected
- validating RHEL version, architecture, SSH, sudo, and package availability before install
- optionally registering the target host with RHSM through organization ID and activation key inputs before package install
- rendering a MicroShift `config.yaml` from supported fields:
  - `dns.baseDomain`
  - `node.hostnameOverride`
  - `node.nodeIP`
  - `apiServer.subjectAltNames`
  - `network.clusterNetwork`
  - `network.serviceNetwork`
  - `network.serviceNodePortRange`
  - `debugging.logLevel`
- optionally configuring `firewalld` using the documented trusted sources and public ports
- installing `microshift` and `openshift-clients` through `dnf`
- writing:
  - the CRI-O registry auth file under `/etc/crio/`
  - `/etc/microshift/config.yaml`
- enabling and starting `microshift.service`
- validating node readiness and pod state with `oc`
- copying the generated kubeconfig back to the Cockpit host

## Prerequisites and Deployment Flow

Expected prerequisites:

- Cockpit host can reach the target host with SSH key auth
- SSH user has `sudo -n`
- target host is RHEL 9 or RHEL 10
- operator supplies valid registry authentication data

Package access can use either:

- preconfigured repositories already available on the target host
- automatic RHSM registration and repository enablement through:
  - organization ID
  - activation key
  - optional release lock
  - optional extra repository IDs

Additional prerequisites for `create-host`:

- libvirt/KVM on the Cockpit host
- either a supported libvirt storage pool or the standard `/var/lib/libvirt/images` path
- a bridge on the Cockpit host
- either a local RHEL qcow2 cloud image or a direct downloadable qcow2 URL
- a static IP, gateway, and DNS plan for the guest

Deployment flow:

1. Operator opens the `MicroShift` plugin in Cockpit.
2. UI collects either existing-host SSH details or create-host libvirt provisioning details.
3. Review step runs backend preflight validation for the selected path.
4. For `create-host`, the backend provisions the VM with cloud-init and waits for SSH.
5. Backend uploads rendered artifacts and starts the RPM-based install flow.
6. Backend validates readiness and stores access details for the completed deployment.

## Known Gaps and Intentional Limits

- The automated RHSM path follows the documented MicroShift 4.21 RPM model directly for RHEL 9.
  For RHEL 10, the current implementation only treats `10.0` as a valid Technology Preview target.
  Newer RHEL 10 minors are rejected early because the enabled 4.21 repos on a `10.1` guest did not expose the required `microshift` or `openshift-clients` RPMs during live validation.
- The create-host path supports the same `dir` and `logical` libvirt pool types used by `cockpit-openshift`, plus a fallback to `/var/lib/libvirt/images` when no pool is defined.
- When `download image` is used, the Cockpit host must be able to fetch the qcow2 URL directly with `curl`.
  This is meant for signed Red Hat image URLs or internal mirrors, not anonymous public discovery.
- It does not attempt to model MicroShift as a multi-node OpenShift cluster.
  That is intentional and aligns with the documented host-based install flow.
- It does not currently maintain a dedicated MicroShift deployment inventory on the main cluster list page.
  The initial scope is a separate install path with runtime status and artifact review.
