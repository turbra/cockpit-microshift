---
title: Existing Host Install
description: Install MicroShift onto a reachable RHEL host over SSH.
---

# Existing Host Install

Use this workflow when the target RHEL host already exists and the Cockpit host
can SSH to it.

## Confirm Host Access

Run these checks from the Cockpit host:

```bash
ssh -i <ssh-key> <ssh-user>@<target-host> 'cat /etc/redhat-release'
ssh -i <ssh-key> <ssh-user>@<target-host> 'sudo -n true'
```

The target should be RHEL 9 or RHEL 10. The SSH user must be able to use
`sudo -n`.

## Choose Package Access

Use one of these repository patterns:

| Mode | Required state |
| --- | --- |
| Preconfigured repositories | the target already exposes `microshift` and `openshift-clients` packages |
| RHSM activation key | the operator supplies organization ID, activation key, optional release lock, and optional additional repository IDs |

## Run The UI Flow

1. Open `https://<cockpit-host>:9090`.
2. Navigate to `MicroShift`.
3. Select `Install MicroShift`.
4. Choose `Use an existing RHEL host`.
5. Enter host, SSH, registry authentication, repository, network, and
   MicroShift config fields.
6. Continue to review.
7. Inspect the generated artifacts.
8. Start deployment.

## After Install

Open the inventory entry for the deployment. Confirm:

- status is recorded as succeeded
- target pattern is `existing-host`
- kubeconfig access details are present
- recent output does not show failed package, service, or readiness checks

Existing-host destroy semantics are intentionally conservative. Do not assume
the plugin will remove packages or broad host configuration from a remote RHEL
machine.
