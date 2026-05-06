---
title: Examples
description: Copy-paste-oriented examples for common Cockpit MicroShift workflows.
---

# Examples

Use these pages when you know the task and need the workflow checklist without
reading the concept pages first.

| Task | Page |
| --- | --- |
| Install onto a reachable RHEL machine | [Existing Host Install](existing-host-install.md) |
| Provision a local RHEL guest and install MicroShift | [Create-Host Install](create-host-install.md) |
| Review generated files before deployment | [Review Generated Artifacts](review-generated-artifacts.md) |
| Destroy or rebuild a local guest deployment | [Rebuild Or Destroy](rebuild-or-destroy.md) |

## Common Placeholders

| Placeholder | Replace with |
| --- | --- |
| `<cockpit-host>` | host running Cockpit and this plugin |
| `<target-host>` | existing RHEL host where MicroShift will be installed |
| `<ssh-user>` | user with passwordless sudo on the target |
| `<ssh-key>` | private key path on the Cockpit host |
| `<rhel-image.qcow2>` | local RHEL qcow2 cloud image path |
| `<bridge>` | libvirt bridge attached to the target network |
| `<guest-ip/prefix>` | static guest address, such as `192.0.2.50/24` |

Do not paste registry credentials, activation keys, kubeconfigs, or private key
content into documentation or issue reports.
