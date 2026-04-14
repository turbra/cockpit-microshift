---
title: Cockpit MicroShift
description: >-
  Intent-first entry point for the Cockpit-hosted MicroShift installer and
  inventory workflow.
summary: >-
  Start here when you need to decide whether this project matches your
  MicroShift host model, install path, or operator workflow.
page_type: Landing Page
topic_family: Project entry and operator routing
operator_focus:
  - Decide whether you need existing-host install or create-host provisioning.
  - Jump straight to workflows, packaging details, or product boundaries.
start_here:
  - label: Documentation Map
    url: /documentation-map.html
  - label: Capabilities
    url: /capabilities.html
  - label: Practical Use Cases
    url: /practical-use-cases.html
  - label: Reference
    url: /reference.html
related_pages:
  - label: Top README
    url: https://github.com/turbra/cockpit-microshift/blob/main/README.md
source_links:
  - label: README.md
    url: https://github.com/turbra/cockpit-microshift/blob/main/README.md
  - label: src/cockpit-microshift/create.html
    url: https://github.com/turbra/cockpit-microshift/blob/main/src/cockpit-microshift/create.html
  - label: src/cockpit-microshift/index.html
    url: https://github.com/turbra/cockpit-microshift/blob/main/src/cockpit-microshift/index.html
---

<div class="cockpit-microshift-badge-row">
  <a href="https://github.com/turbra/cockpit-microshift/blob/main/LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/github/license/turbra/cockpit-microshift" /></a>
  <img alt="Cockpit plugin" src="https://img.shields.io/badge/Cockpit-plugin-blue" />
  <img alt="MicroShift 4.21" src="https://img.shields.io/badge/MicroShift-4.21-red" />
  <img alt="KVM and libvirt" src="https://img.shields.io/badge/KVM-libvirt-blue" />
  <img alt="RHEL 9 or 10" src="https://img.shields.io/badge/RHEL-9%2F10-red" />
</div>

Cockpit MicroShift is for operators who want one local control point for
installing and revisiting MicroShift without reducing the final install to an
opaque button press. It keeps the real host-based RPM model visible, shows the
generated install inputs before deployment, and gives you an inventory surface
to return to after the cluster exists.

## Pick A Starting Point

<div class="cockpit-microshift-decision-grid">
  <a class="cockpit-microshift-decision-card" href="{{ '/documentation-map.html' | relative_url }}">
    <span class="cockpit-microshift-decision-intent">I know the problem, not the page</span>
    <span class="cockpit-microshift-decision-title">Documentation Map</span>
    <span class="cockpit-microshift-decision-body">Intent-first routing from host-side problems to the right page family.</span>
  </a>
  <a class="cockpit-microshift-decision-card" href="{{ '/capabilities.html' | relative_url }}">
    <span class="cockpit-microshift-decision-intent">I am evaluating fit</span>
    <span class="cockpit-microshift-decision-title">Capabilities</span>
    <span class="cockpit-microshift-decision-body">What the plugin does well, what it assumes, and where the boundary stops.</span>
  </a>
  <a class="cockpit-microshift-decision-card" href="{{ '/practical-use-cases.html' | relative_url }}">
    <span class="cockpit-microshift-decision-intent">I want the operator workflow</span>
    <span class="cockpit-microshift-decision-title">Practical Use Cases</span>
    <span class="cockpit-microshift-decision-body">Concrete patterns for existing-host installs, create-host provisioning, review, and cleanup.</span>
  </a>
  <a class="cockpit-microshift-decision-card" href="{{ '/reference.html' | relative_url }}">
    <span class="cockpit-microshift-decision-intent">I need exact commands and files</span>
    <span class="cockpit-microshift-decision-title">Reference</span>
    <span class="cockpit-microshift-decision-body">Install commands, runtime paths, artifact names, and packaging details without the filler.</span>
  </a>
</div>

## What The Plugin Covers

- guided MicroShift deployment onto an existing RHEL host over SSH
- optional local libvirt guest creation before the in-guest install
- rendered `config.yaml`, request summary, install plan, cloud-init inputs, and
  `virt-install` review
- deployment status, recent output, kubeconfig retrieval, and local inventory
- destroy and clean rebuild actions for local `create-host` deployments

## Current Operating Model

| Layer | Current model |
| --- | --- |
| Primary install authority | Red Hat Build of MicroShift host-based RPM model |
| UI shell | Cockpit plugin |
| Backend | privileged local helper on the Cockpit host |
| Deployment target patterns | existing RHEL host or local libvirt guest |
| Validated shape | single-node MicroShift |
| Networking | static host and guest networking |
| Runtime ownership | `/var/lib/cockpit-microshift/` |

The create-host path is intentionally a convenience layer. Once the VM exists,
the final install still follows the same host-based MicroShift pattern.

## Workflow Shape

<div class="cockpit-microshift-diagram-card">
  <img alt="Cockpit MicroShift install workflow diagram" src="{{ '/assets/images/microshift-install-flow.svg' | relative_url }}" />
  <p>The plugin keeps target selection, validation, artifact review, installation, and post-install inventory in one operator-facing surface without hiding the host-side RPM model.</p>
</div>

## Operator Screens

<div class="cockpit-microshift-media-grid">
  <div class="cockpit-microshift-media-card">
    <img alt="Cockpit MicroShift installer view" src="{{ '/assets/images/microshift-ui.jpg' | relative_url }}" />
    <p>The guided create flow keeps deployment target selection, repository access mode, host prep, and artifact review in a single workspace.</p>
  </div>
  <div class="cockpit-microshift-media-card">
    <img alt="Cockpit MicroShift workflow diagram" src="{{ '/assets/images/microshift-install-flow.svg' | relative_url }}" />
    <p>The workflow stays host-first: validate, render, install, return later for kubeconfig access and cleanup.</p>
  </div>
</div>

## Why This Exists

This project is not trying to turn MicroShift into a generic multi-node
OpenShift installer. It exists for the narrower case where an operator wants a
deliberate host-side installation flow, wants to review what will be written to
the target host, and still wants inventory plus follow-up actions in the same
Cockpit surface afterward.

## Repository

The repository remains the source of truth for code, packaging, and this docs
site:

- [Repository](https://github.com/turbra/cockpit-microshift)
- [README](https://github.com/turbra/cockpit-microshift/blob/main/README.md)
