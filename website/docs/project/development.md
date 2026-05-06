---
title: Development
description: Local development notes for plugin and docs changes.
---

# Development

Keep code, packaging, and docs changes scoped to the workflow being changed.

## Plugin Checks

Use syntax checks for the files you changed:

```bash
python3 -m py_compile src/cockpit-microshift/microshift_backend.py
node --check src/cockpit-microshift/cockpit-microshift.js
node --check src/cockpit-microshift/cluster-list.js
node --check src/cockpit-microshift/cluster-overview.js
bash -n build-rpm.sh
rpmspec -P cockpit-microshift.spec >/dev/null
```

## Docs Checks

```bash
cd website
npm ci
npm run build
```

## Generated Files

Do not commit these generated paths:

- `rpmbuild/`
- `website/node_modules/`
- `website/.docusaurus/`
- `website/build/`
- Python `__pycache__/`
- `*.pyc`

## Local State

Keep machine-local paths, credentials, kubeconfigs, private keys, activation
keys, and host-specific notes out of committed documentation.
