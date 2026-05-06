---
title: First Existing Host Install
description: Install MicroShift onto a reachable RHEL host over SSH.
---

# First Existing Host Install

Use the existing-host path when the target RHEL machine already exists and the
Cockpit host can reach it over SSH.

## Check Access

Run these checks from the Cockpit host before opening the UI:

```bash
ssh -i <ssh-key> <ssh-user>@<target-host> 'cat /etc/redhat-release'
ssh -i <ssh-key> <ssh-user>@<target-host> 'uname -m'
ssh -i <ssh-key> <ssh-user>@<target-host> 'sudo -n true'
```

Expected result:

- the target is RHEL 9 or RHEL 10
- the architecture is `x86_64`
- the SSH user can run passwordless sudo

## Choose Repository Access

Use one of the supported package access modes:

| Mode | Use it when |
| --- | --- |
| Preconfigured repositories | the target host is already registered and exposes `microshift` and `openshift-clients` |
| RHSM activation key | the UI should register the target with organization ID and activation key inputs |

## Run The Install Flow

1. Open `https://<cockpit-host>:9090`.
2. Navigate to `MicroShift`.
3. Select `Install MicroShift`.
4. Choose `Use an existing RHEL host`.
5. Enter the target host, SSH, registry authentication, repository, network,
   and MicroShift config fields.
6. Continue to review.
7. Inspect `config.yaml`, request summary, and install plan.
8. Start deployment only after the generated plan matches the intended host.

## After Install

Return to the inventory entry and confirm:

- deployment status is recorded
- target pattern is `existing-host`
- kubeconfig access details are present
- recent output does not show package, service, or readiness failures

Existing remote hosts are not treated as disposable targets. Destroy and clean
rebuild are intentionally focused on local `create-host` deployments.
