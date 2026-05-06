---
title: Artifact Review
description: Generated artifact previews, when they appear, and what to check before deployment.
---

# Artifact Review

The review step shows generated files before deployment starts. Use it to
verify what the backend will write or use during host preparation,
provisioning, and MicroShift installation.

## Existing Host Artifacts

| Artifact | When it appears | Check before deploy |
| --- | --- | --- |
| `config.yaml` | every deployment | base domain, hostname override, node IP, cluster network, service network, NodePort range, log level |
| Request summary JSON | every deployment | target pattern, deployment ID, host address, SSH user, MicroShift version, repository mode |
| Install plan | every deployment | package access, CRI-O registry auth path, firewalld intent, RPM install, service start, readiness checks |

## Create-Host Artifacts

| Artifact | When it appears | Check before deploy |
| --- | --- | --- |
| Cloud-init user data | `create-host` only | injected SSH key, user setup, package bootstrap behavior |
| Cloud-init network data | `create-host` only | static IP, gateway, DNS servers, interface settings |
| Guest plan | `create-host` only | VM name, CPU, memory, disk size, storage pool, base image source, bridge |
| `virt-install` plan | `create-host` only | domain name, disk path, import mode, network attachment |

## Access Artifacts

After a successful install, the backend records kubeconfig access details for
the inventory and overview pages. Confirm the local kubeconfig path and target
host details before using them in follow-up commands.

## Redaction Boundary

Credential data is redacted in backend responses and artifact previews. This
includes registry authentication and activation key values. Do not treat the
runtime directory as public output, because request files, backend logs,
kubeconfigs, and SSH key paths are still deployment-sensitive material.

## Operator Decision

Deploy only when these generated values match the intended target:

- target host or guest address
- static networking
- repository access mode
- MicroShift version
- firewall management intent
- registry authentication source
- guest disk and storage pool for `create-host`
