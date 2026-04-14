---
title: Capabilities
description: >-
  What Cockpit MicroShift handles well today, what it assumes about the host,
  and where its boundary stops.
summary: >-
  Read this page when you need to decide whether the plugin fits your host,
  target pattern, and lifecycle expectations before you commit to the local
  path.
page_type: Capabilities
topic_family: Product shape and decision boundaries
parent_label: Docs Home
parent_url: /
operator_focus:
  - Decide whether a host-based MicroShift workflow is the right fit.
  - Understand what the backend owns and where the plugin stops on purpose.
start_here:
  - label: Practical Use Cases
    url: /practical-use-cases.html
  - label: Reference
    url: /reference.html
related_pages:
  - label: Documentation Map
    url: /documentation-map.html
source_links:
  - label: README.md
    url: https://github.com/turbra/cockpit-microshift/blob/main/README.md
  - label: docs/microshift-support.md
    url: https://github.com/turbra/cockpit-microshift/blob/main/docs/microshift-support.md
  - label: src/cockpit-microshift/microshift_backend.py
    url: https://github.com/turbra/cockpit-microshift/blob/main/src/cockpit-microshift/microshift_backend.py
---

# Capabilities

Cockpit MicroShift is a host-based install surface for single-node MicroShift.
It is not a generic OpenShift installer, and the project is stronger because it
does not pretend otherwise.

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

## What The Backend Owns

The backend is not a thin form submitter. It owns the local workflow:

- runtime state under `/var/lib/cockpit-microshift/`
- generated work directories under `/var/lib/cockpit-microshift/microshift-work/`
- cached guest images under `/var/lib/cockpit-microshift/image-cache/`
- rendered artifacts such as:
  - `config.yaml`
  - request summary JSON
  - install plan
  - cloud-init inputs
  - `virt-install` plan
- kubeconfig retrieval back to the Cockpit host
- libvirt guest provisioning and destroy behavior for `create-host`

That matters because the plugin is strongest when the Cockpit host remains the
source of execution and state tracking, not just the place where a UI happens
to render.

## Supported Path

The supported path today is intentionally narrow:

| Dimension | Current path |
| --- | --- |
| Cluster shape | single-node MicroShift |
| Target patterns | existing host or local libvirt guest |
| Host OS | RHEL 9 and RHEL 10 |
| Networking | static host and guest networking |
| Package access | preconfigured repos or RHSM activation key flow |
| Local virtualization | libvirt/KVM with `dir` or `logical` pools |

> [!IMPORTANT]
> The authoritative source for the final install remains the Red Hat Build of
> MicroShift host-based RPM installation model. The create-host path only adds
> guest provisioning before that same in-guest flow.

## Where The Boundary Stops

Do not treat the plugin as proof that these are solved:

- multi-node OpenShift deployment
- cloud-provider integrations
- generic DHCP-driven guest bring-up
- cluster-fleet lifecycle management beyond the local inventory model
- aggressive cleanup of an existing remote host beyond state the plugin clearly
  owns

The plugin is about single-node MicroShift installation and follow-up, not a
general platform control plane.

## Where This Shape Pays Off

This project is useful when the operator wants:

- fewer shell-driven install steps
- a real review step before touching the target host
- one place to return to after the cluster exists
- an optional local guest-provisioning path without losing the documented RPM
  install model

If the real requirement is larger-scale OpenShift lifecycle management, this is
the wrong product choice by design.
