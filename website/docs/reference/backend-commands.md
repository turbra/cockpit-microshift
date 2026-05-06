---
title: Backend Commands
description: Backend helper subcommands used by the Cockpit frontend.
---

# Backend Commands

The Cockpit frontend calls `microshift_backend.py` through the local Cockpit
bridge. These commands are implementation entry points, not a stable public CLI.

## Command Overview

| Command | Purpose |
| --- | --- |
| `options` | return UI option data |
| `preflight --payload-b64 <payload>` | validate and normalize a deployment request |
| `artifacts --payload-b64 <payload>` | render artifacts for a proposed request |
| `artifacts --current` | return artifacts for the current recorded request |
| `start --payload-b64 <payload>` | create runtime state and start the deploy job |
| `run-job --mode deploy --unit-name <unit>` | execute the deploy job body |
| `run-job --mode destroy --unit-name <unit> --cluster-id <id>` | execute the destroy job body |
| `clusters` | list local inventory entries |
| `cluster --cluster-id <id>` | return one inventory entry |
| `status` | return current runtime job status |
| `cancel` | mark the current deployment canceled |
| `destroy --cluster-id <id>` | start local destroy for a `create-host` deployment |

## Job Boundary

`start` and `destroy` create systemd transient jobs. The actual privileged work
runs through `run-job`, which lets the UI poll `status` while the operation is
active.

## Destroy Guardrail

`destroy --cluster-id <id>` is rejected unless the inventory entry is a
`create-host` deployment. This avoids treating a remote RHEL host like a local
disposable VM.

## Validation Checks

Backend validation covers:

- deployment name format
- target pattern
- SSH key usability
- RHEL version and architecture facts
- sudo access
- package access mode
- required host networking fields
- libvirt image, bridge, and storage details for `create-host`

The frontend should display backend validation errors directly instead of
guessing at missing prerequisites.
