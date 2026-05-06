---
title: Rebuild Or Destroy
description: Destroy or clean rebuild a local create-host deployment.
---

# Rebuild Or Destroy

Destroy and clean rebuild are intended for local `create-host` deployments that
the plugin provisioned. They are not a broad remote-host cleanup mechanism.

## Destroy From Inventory

1. Open `https://<cockpit-host>:9090`.
2. Navigate to `MicroShift`.
3. Find the `create-host` deployment.
4. Use the destroy action.
5. Wait for the destroy job to complete.
6. Refresh the inventory and confirm the stale entry is gone.

The backend removes the local libvirt guest and plugin-owned runtime artifacts
it can identify for that deployment.

## Clean Rebuild From Installer

Use clean rebuild when you are on the final installer step and want to remove
the prior local deployment before reprovisioning.

1. Return to the installer flow for the same deployment ID.
2. Use `Clean rebuild`.
3. Wait for destroy to finish.
4. Let the UI continue into provisioning and installation.

## Cleanup Scope

Expected local cleanup candidates:

- libvirt domain
- guest root disk
- generated seed or install media owned by this plugin
- deployment work directory
- stale inventory entry
- local credential file for the deployment

The shared image cache is not removed by default because one downloaded qcow2
can be reused by multiple deployments.

## Existing Host Boundary

An existing remote host is not disposable by default. Package removal, system
configuration cleanup, and broader host reset behavior require explicit
ownership decisions before they should be automated.
