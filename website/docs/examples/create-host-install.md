---
title: Create-Host Install
description: Create a local RHEL guest with libvirt, then install MicroShift inside it.
---

# Create-Host Install

Use this workflow when the Cockpit host should create the target RHEL guest
before installing MicroShift.

## Confirm Local Virtualization

Run these checks on the Cockpit host:

```bash
virsh list --all
virsh pool-list --all
```

Confirm that the host has:

- libvirt/KVM available
- a bridge connected to the target network
- a supported `dir` or `logical` storage pool, or usable
  `/var/lib/libvirt/images`
- a local RHEL qcow2 image or a direct downloadable qcow2 URL

## Prepare Static Networking

Collect these values before opening the UI:

- guest hostname
- static guest IP with prefix
- gateway
- DNS servers
- bridge name
- base domain

The current validated path assumes static guest networking.

## Run The UI Flow

1. Open `https://<cockpit-host>:9090`.
2. Navigate to `MicroShift`.
3. Select `Install MicroShift`.
4. Choose `Create a local libvirt guest`.
5. Enter the qcow2 image source, guest identity, bridge, static networking,
   storage, sizing, registry authentication, and repository access fields.
6. Continue to review.
7. Inspect cloud-init inputs, guest plan, `virt-install` plan, MicroShift
   config, and install plan.
8. Start deployment.

## After Install

The inventory and overview pages are the return point for access details and
cleanup. For `create-host`, the plugin can destroy the local guest and
plugin-owned generated artifacts when you choose the destroy action.
