---
title: Practical Use Cases
description: >-
  Operator-facing workflows that connect Cockpit MicroShift to host-based
  installation, review, inventory, and cleanup outcomes.
summary: >-
  Read this page when you want the actual practitioner flows this plugin makes
  easier, not a feature inventory.
page_type: Practical Use Cases
topic_family: Operator workflows and outcomes
parent_label: Docs Home
parent_url: /
operator_focus:
  - Follow the host-side workflows the plugin actually improves.
  - Connect the UI to concrete install, access, and cleanup outcomes.
start_here:
  - label: Reference
    url: /reference.html
  - label: Capabilities
    url: /capabilities.html
related_pages:
  - label: Documentation Map
    url: /documentation-map.html
source_links:
  - label: src/cockpit-microshift/create.html
    url: https://github.com/turbra/cockpit-microshift/blob/main/src/cockpit-microshift/create.html
  - label: src/cockpit-microshift/index.html
    url: https://github.com/turbra/cockpit-microshift/blob/main/src/cockpit-microshift/index.html
  - label: src/cockpit-microshift/overview.html
    url: https://github.com/turbra/cockpit-microshift/blob/main/src/cockpit-microshift/overview.html
---

# Practical Use Cases

This page is about when an operator would actually use Cockpit MicroShift on
the host, and why the plugin is better than a loose sequence of SSH commands in
that moment.

## Use Case: Install MicroShift Onto An Existing RHEL Host Without Losing The Plan

Problem:
You already have a RHEL machine that should become a MicroShift node, but you
do not want the install logic to disappear into an ad hoc SSH session.

Pattern:

1. open the Cockpit plugin on the control host
2. choose the existing-host path
3. provide SSH access, registry authentication, and either repo availability or
   RHSM activation details
4. review rendered `config.yaml`, request summary, and install plan before
   deployment
5. launch the install from the same workspace

Why this is the right pattern:
The UI keeps the host-based RPM workflow visible and reviewable instead of
turning it into a hidden remote script.

## Use Case: Create A Local Guest First, Then Apply The Same MicroShift Model

Problem:
You need a new local RHEL target but you still want the resulting MicroShift
installation to follow the same documented host-based pattern.

Pattern:

1. choose the create-host path
2. provide the qcow2 source, bridge, static guest IP, disk size, and sizing
   details
3. review cloud-init inputs, guest plan, and `virt-install` plan
4. let the plugin provision the local guest
5. continue into the same in-guest MicroShift RPM install flow

Why this is the right pattern:
The provisioning convenience does not replace the authoritative install model.
It only removes the manual guest creation work before that model starts.

## Use Case: Review Install Artifacts Before Touching The Target Host

Problem:
The real risk is not opening the UI. It is writing the wrong configuration to
the target host or exposing the wrong network and firewall posture.

Pattern:

1. stay in the create flow until the review step
2. inspect rendered `config.yaml`
3. inspect the request summary and install plan
4. for create-host, inspect cloud-init inputs and the `virt-install` plan
5. only then allow the deployment

Why this is the right pattern:
The review step turns the plugin into a validation surface, not just a form.

## Use Case: Return Later For Access Details And Operational Guidance

Problem:
After install, operators still need a local record of where the cluster lives,
how it was deployed, and which kubeconfig path should be used from the Cockpit
host.

Pattern:

1. return to the cluster inventory page
2. filter by deployment target when needed
3. open the overview page for one cluster
4. use the recorded kubeconfig path, remote host details, and advisor notices

Why this is the right pattern:
The project is not only an installer. It keeps a post-install operator surface
for access and follow-up decisions.

## Use Case: Clean Rebuild Or Destroy A Local Guest Deployment

Problem:
Local lab-style `create-host` deployments need a safe cleanup path that matches
the same tool which created the guest and performed the install.

Pattern:

1. return to the cluster inventory or overview page
2. use the destroy action for the selected `create-host` deployment
3. if you are already on the final installer step, use clean rebuild to destroy
   the prior local guest and reprovision it
4. let the backend remove the local libvirt guest and plugin-owned runtime
   artifacts it understands

Why this is the right pattern:
Creation and cleanup stay inside one operational boundary, which reduces drift
between the deployment path and the teardown path.

Boundary:
This cleanup model is intentionally stronger for `create-host` than for
existing-host installs. A remote RHEL host is not treated as disposable by
default.
