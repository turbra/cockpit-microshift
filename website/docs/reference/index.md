---
title: Reference
description: Reference index for commands, files, packaging, runtime paths, and source layout.
---

# Reference

Use these pages when you need exact commands, file paths, backend behavior, or
source ownership.

| Need | Page |
| --- | --- |
| Copy source install commands | [Source Install](source-install.md) |
| Build or inspect RPM packaging | [RPM Packaging](rpm-packaging.md) |
| Confirm runtime paths and generated files | [Runtime Files](runtime-files.md) |
| Understand generated artifact previews | [Artifact Review](artifact-review.md) |
| Inspect backend command entry points | [Backend Commands](backend-commands.md) |
| Find the source file for a workflow area | [Source Layout](source-layout.md) |

## Current Reference Values

| Area | Current value |
| --- | --- |
| RPM version | `0.1.0` |
| MicroShift badge target | `4.21` |
| Cockpit path | `/usr/share/cockpit/cockpit-microshift/` |
| Runtime path | `/var/lib/cockpit-microshift/` |
| Validated networking | static host and guest networking |
| Local guest storage pools | `dir` and `logical`, with `/var/lib/libvirt/images` fallback |

## Host Prerequisites

- Cockpit installed on the machine hosting this plugin
- SSH reachability from the Cockpit host to the target host
- SSH user with `sudo -n` on the target host
- target host running RHEL 9 or RHEL 10
- valid registry authentication data

Additional prerequisites for `create-host`:

- libvirt/KVM on the Cockpit host
- supported storage pool or `/var/lib/libvirt/images`
- bridge interface on the Cockpit host
- local or downloadable RHEL qcow2 image
- static guest IP, gateway, and DNS plan
