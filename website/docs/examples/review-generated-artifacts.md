---
title: Review Generated Artifacts
description: Check generated MicroShift and provisioning artifacts before deployment.
---

# Review Generated Artifacts

Use the review step to catch host, network, repository, and configuration
mistakes before the backend writes to the target.

## Existing Host Artifacts

Review these before deploying:

| Artifact | Check |
| --- | --- |
| `config.yaml` | base domain, hostname override, node IP, service and cluster networks |
| request summary JSON | target host, target pattern, version, repository mode |
| install plan | package access, firewalld intent, service start, readiness validation |

## Create-Host Artifacts

Review the existing-host artifacts plus:

| Artifact | Check |
| --- | --- |
| cloud-init user data | SSH user, injected key, package bootstrap behavior |
| cloud-init network data | static IP, gateway, DNS servers |
| guest plan | disk, CPU, memory, image source, bridge |
| `virt-install` plan | domain name, disk path, import mode, network attachment |

## Credential Handling

Registry authentication and activation key values are redacted in backend
responses and artifact previews. Treat local request files and runtime state as
sensitive because they are part of the deployment workflow.

## Deploy Only After These Match

- target host or guest address
- static networking
- repository access mode
- MicroShift version
- firewall management intent
- registry authentication source
- guest disk and storage pool for `create-host`
