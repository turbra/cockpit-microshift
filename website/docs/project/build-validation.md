---
title: Build Validation
description: Commands used to validate package and documentation changes.
---

# Build Validation

Use the checks that match the area you changed.

## RPM Build

```bash
sudo dnf install -y rpm-build
./build-rpm.sh
```

Expected output:

```text
rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm
rpmbuild/SRPMS/cockpit-microshift-*.src.rpm
```

## Plugin Syntax

```bash
python3 -m py_compile src/cockpit-microshift/microshift_backend.py
node --check src/cockpit-microshift/cockpit-microshift.js
node --check src/cockpit-microshift/cluster-list.js
node --check src/cockpit-microshift/cluster-overview.js
bash -n build-rpm.sh
rpmspec -P cockpit-microshift.spec >/dev/null
```

## Docs Build

```bash
cd website
npm ci
npm run build
```

## GitHub Pages Path Check

After a docs build, generated links should work under `/cockpit-microshift/`:

```bash
cd website
rg --pcre2 -n 'href="/(?!cockpit-microshift|/)|src="/(?!cockpit-microshift|/)' build
```

No matches should appear for internal site routes or assets.
