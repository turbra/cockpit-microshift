---
title: RPM Packaging
description: Build commands, RPM output paths, and package file ownership.
---

# RPM Packaging

The repository builds a noarch Cockpit plugin RPM from the local source tree.

## Build

Install the packaging tool once:

```bash
sudo dnf install -y rpm-build
```

Build from the repository root:

```bash
./build-rpm.sh
```

Expected output:

```text
rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm
rpmbuild/SRPMS/cockpit-microshift-*.src.rpm
```

## Install

```bash
sudo dnf install -y ./rpmbuild/RPMS/noarch/cockpit-microshift-*.noarch.rpm
```

## Spec Metadata

| Field | Value |
| --- | --- |
| Name | `cockpit-microshift` |
| Version | `0.1.0` |
| BuildArch | `noarch` |
| License | `GPL-3.0-or-later` |
| URL | `https://github.com/turbra/cockpit-microshift` |

## Packaged Payload

The RPM installs the Cockpit plugin under:

```text
/usr/share/cockpit/cockpit-microshift/
```

Packaged files include:

- `manifest.json`
- `index.html`
- `create.html`
- `overview.html`
- `cockpit-microshift.js`
- `cluster-list.js`
- `cluster-overview.js`
- `cockpit-microshift.css`
- `microshift_backend.py`
- `README.md`

The RPM does not package local runtime state from `/var/lib/cockpit-microshift/`.
