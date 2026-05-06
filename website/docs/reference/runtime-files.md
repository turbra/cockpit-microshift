---
title: Runtime Files
description: Runtime paths, generated files, credential handling, and cleanup boundaries.
---

# Runtime Files

The backend writes deployment state under `/var/lib/cockpit-microshift/`.
Treat this path as project-owned runtime state.

## Path Reference

| Path | Purpose |
| --- | --- |
| `/var/lib/cockpit-microshift/` | runtime state, generated artifacts, logs |
| `/var/lib/cockpit-microshift/microshift-work/` | per-deployment generated work directories |
| `/var/lib/cockpit-microshift/image-cache/` | cached guest qcow2 images |
| `/usr/share/cockpit/cockpit-microshift/` | installed plugin files |
| `/etc/microshift/config.yaml` | target-side MicroShift config written during install |
| `/etc/crio/` | target-side CRI-O registry auth location used during install |
| `/var/lib/microshift/resources/kubeadmin/` | target-side kubeconfig source path |

## Artifact Families

The backend review flow exposes artifact families such as:

- rendered `config.yaml`
- request summary JSON
- install plan output
- cloud-init inputs for `create-host`
- `virt-install` plan for `create-host`
- recorded kubeconfig access details after success

Use [Artifact Review](artifact-review.md) when you need to know what each
preview is for and which operator decision it supports.

## Credential Handling

The user supplies valid registry authentication data in the UI, either by
pasting it directly or by pointing at a local file on the Cockpit host. For
SSH-based deployment, the user also supplies an SSH key path available on the
Cockpit host.

Credential values are redacted in backend responses and artifact previews. Do
not copy request files, backend logs, kubeconfigs, private key paths, or
activation key values into public issue reports.

## Cleanup Behavior

Destroy is currently intended for local `create-host` deployments. It can
remove plugin-owned libvirt and runtime artifacts tied to the deployment.

Shared downloaded images are not deleted by default. Existing remote hosts are
not treated as disposable cleanup targets.
