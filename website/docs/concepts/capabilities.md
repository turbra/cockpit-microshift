---
title: Capabilities
description: What Cockpit MicroShift handles today, what it assumes, and where the boundary stops.
---

# Capabilities

Cockpit MicroShift is a host-based install surface for single-node MicroShift.
It is not a generic OpenShift installer.

## What It Does Well

- drives MicroShift installation from a Cockpit plugin instead of a loose SSH
  session
- supports two operator entry patterns:
  - install onto an existing RHEL host
  - create a local libvirt guest first, then install inside it
- owns the local runtime, validation, artifact rendering, and status tracking
- shows generated install inputs and provisioning plans before deployment
- records kubeconfig access details and exposes a local inventory view
- supports destroy and clean rebuild for local `create-host` deployments

## Supported Path

| Dimension | Current path |
| --- | --- |
| Cluster shape | single-node MicroShift |
| Architecture | `x86_64` |
| Target patterns | existing host or local libvirt guest |
| Host OS | RHEL 9 and RHEL 10 |
| Networking | static host and guest networking |
| Package access | preconfigured repos or RHSM activation key flow |
| Local virtualization | libvirt/KVM with `dir` or `logical` pools |

:::important
The create-host path is a provisioning convenience. Once the VM exists, the
MicroShift install follows the same host-based RPM model used by existing-host
deployments.
:::

## Where The Boundary Stops

Do not treat the plugin as proof that these are solved:

- multi-node OpenShift deployment
- cloud-provider integrations
- generic DHCP-driven guest bring-up
- fleet lifecycle management beyond the local inventory model
- aggressive cleanup of an existing remote host

The plugin is about single-node MicroShift installation and follow-up, not a
general platform control plane.

## When It Fits

Use this project when the operator wants:

- fewer shell-driven install steps
- a review step before touching the target host
- one Cockpit surface for install status, inventory, and kubeconfig access
- optional local guest provisioning without losing the documented RPM install
  model

If the actual requirement is larger-scale OpenShift lifecycle management, this
is the wrong product choice by design.
