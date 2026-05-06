---
title: Review Before Deploying
description: Check generated MicroShift and provisioning artifacts before installation starts.
---

# Review Before Deploying

Use the review step to catch host, network, repository, and configuration
mistakes before the backend writes to the target.

## Existing Host Review

Review these artifacts before deploying:

| Artifact | Check |
| --- | --- |
| `config.yaml` | base domain, hostname override, node IP, cluster network, service network, NodePort range |
| Request summary JSON | target pattern, host address, SSH user, MicroShift version, repository mode |
| Install plan | package access, CRI-O auth placement, firewalld intent, service start, readiness validation |

## Create-Host Review

Review the existing-host artifacts plus:

| Artifact | Check |
| --- | --- |
| Cloud-init user data | injected SSH key, user setup, guest bootstrap behavior |
| Cloud-init network data | static IP, gateway, DNS servers, interface settings |
| Guest plan | VM name, CPU, memory, disk size, image source, bridge |
| `virt-install` plan | domain name, disk path, import mode, network attachment |

## Deploy Only After These Match

- target host or guest address
- static networking
- repository access mode
- MicroShift version
- firewall management intent
- registry authentication source
- guest disk and storage pool for `create-host`

## Sensitive Values

Registry authentication and activation key values are redacted in backend
responses and artifact previews. Treat local request files, backend logs,
kubeconfigs, SSH key paths, and runtime state as sensitive deployment material.
