---
title: Source Install
description: Exact source install commands for the Cockpit MicroShift plugin files.
---

# Source Install

Run these commands from the repository root when you want to install the current
working tree directly into Cockpit.

```bash
sudo mkdir -p /usr/share/cockpit/cockpit-microshift
sudo install -m 0644 src/cockpit-microshift/manifest.json /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/index.html /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/create.html /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/overview.html /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cockpit-microshift.css /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cockpit-microshift.js /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cluster-list.js /usr/share/cockpit/cockpit-microshift/
sudo install -m 0644 src/cockpit-microshift/cluster-overview.js /usr/share/cockpit/cockpit-microshift/
sudo install -m 0755 src/cockpit-microshift/microshift_backend.py /usr/share/cockpit/cockpit-microshift/
```

Start Cockpit if needed:

```bash
sudo systemctl enable --now cockpit.socket
```

Open `https://<host>:9090` and navigate to `MicroShift`.

## Installed Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Cockpit package metadata and menu registration |
| `index.html` | cluster inventory entry point |
| `create.html` | guided install workflow |
| `overview.html` | cluster overview page |
| `cockpit-microshift.css` | plugin styling |
| `cockpit-microshift.js` | install workflow frontend |
| `cluster-list.js` | inventory frontend |
| `cluster-overview.js` | overview frontend |
| `microshift_backend.py` | privileged backend helper |
