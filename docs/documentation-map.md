---
title: Documentation Map
description: >-
  Intent-first routing page for the Cockpit MicroShift docs set.
summary: >-
  Use this page when you know the operator problem but not yet the right page.
page_type: Routing Page
topic_family: Documentation system and reading order
parent_label: Docs Home
parent_url: /
operator_focus:
  - Route from an operator problem to the correct page family quickly.
  - Keep the docs split by intent instead of turning them into one long README.
start_here:
  - label: Capabilities
    url: /capabilities.html
  - label: Practical Use Cases
    url: /practical-use-cases.html
  - label: Reference
    url: /reference.html
related_pages:
  - label: Docs Home
    url: /
source_links:
  - label: docs/index.md
    url: https://github.com/turbra/cockpit-microshift/blob/main/docs/index.md
  - label: README.md
    url: https://github.com/turbra/cockpit-microshift/blob/main/README.md
---

# Documentation Map

Use this page when you know what you need to do on the Cockpit host, but you do
not yet know which page carries the right workflow or reference detail.

## Reading Model

The docs are split on purpose:

- use a **capabilities** page when you need decision boundaries
- use a **practical use cases** page when you need operator workflows and
  outcome-driven patterns
- use the **reference** page when you need exact commands, runtime paths,
  packaging behavior, or artifact names

## Route By Intent

### I need to know whether this plugin matches my MicroShift model

1. [Capabilities]({{ '/capabilities.html' | relative_url }})
2. return to [Docs Home]({{ '/' | relative_url }}) if you need the broader
   operating model and visual shape

### I need the supported workflow for installing onto an existing RHEL host

1. [Practical Use Cases]({{ '/practical-use-cases.html' | relative_url }})
2. then jump to [Reference]({{ '/reference.html' | relative_url }}) for exact
   install and packaging commands

### I need to understand the create-host convenience path

1. [Capabilities]({{ '/capabilities.html' | relative_url }})
2. [Practical Use Cases]({{ '/practical-use-cases.html' | relative_url }})

### I need packaging, runtime files, or backend-owned paths right now

1. [Reference]({{ '/reference.html' | relative_url }})
2. then return to [Capabilities]({{ '/capabilities.html' | relative_url }}) if
   you need the boundary and ownership model

### I need to know what happens after install

1. [Practical Use Cases]({{ '/practical-use-cases.html' | relative_url }})
2. focus on the inventory, kubeconfig access, and create-host cleanup flows

## Main Page Types

- [Capabilities]({{ '/capabilities.html' | relative_url }})
  for product shape, supported path, and backend ownership boundaries
- [Practical Use Cases]({{ '/practical-use-cases.html' | relative_url }})
  for existing-host install, create-host provisioning, review, inventory, and
  cleanup
- [Reference]({{ '/reference.html' | relative_url }})
  for commands, runtime files, artifact names, and source layout
