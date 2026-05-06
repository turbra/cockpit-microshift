---
title: First Create-Host Install
description: Create a local RHEL guest with libvirt, then install MicroShift inside it.
---

# First Create-Host Install

Use the create-host path when the Cockpit host should provision a local RHEL
guest before installing MicroShift.

## Check Local Virtualization

Run these checks on the Cockpit host:

```bash
virsh list --all
virsh pool-list --all
ip link show <bridge>
test -r <rhel-image.qcow2>
```

Expected result:

- libvirt is usable
- the selected storage pool exists, or `/var/lib/libvirt/images` is usable
- the bridge exists on the Cockpit host
- the RHEL qcow2 image is readable, unless you plan to use a direct download URL

## Prepare Static Networking

Collect these values before opening the UI:

| Field | Example |
| --- | --- |
| Guest hostname | `microshift-01` |
| Guest IP | `192.0.2.50/24` |
| Gateway | `192.0.2.1` |
| DNS servers | `192.0.2.53` |
| Bridge | `br0` |
| Base domain | `example.test` |

The current validated path assumes static guest networking.

## Run The Install Flow

1. Open `https://<cockpit-host>:9090`.
2. Navigate to `MicroShift`.
3. Select `Install MicroShift`.
4. Choose `Create a local libvirt guest`.
5. Enter the qcow2 image source, guest identity, bridge, static networking,
   storage, sizing, registry authentication, repository, and MicroShift config
   fields.
6. Continue to review.
7. Inspect cloud-init inputs, guest plan, `virt-install` plan, `config.yaml`,
   request summary, and install plan.
8. Start deployment after the guest network and storage plan match the target.

## After Install

Return to the inventory or overview page for access details. For `create-host`
deployments, the plugin can destroy the local guest and plugin-owned generated
artifacts when you choose the destroy action.
