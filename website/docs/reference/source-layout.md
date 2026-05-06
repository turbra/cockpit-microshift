---
title: Source Layout
description: Source files and the workflow areas they own.
---

# Source Layout

Use this page when you need to find the source file behind a UI or backend
behavior.

## Runtime Source

| Path | Why it exists |
| --- | --- |
| `src/cockpit-microshift/index.html` | cluster inventory entry point |
| `src/cockpit-microshift/create.html` | guided install workflow |
| `src/cockpit-microshift/overview.html` | cluster-specific follow-up view |
| `src/cockpit-microshift/cockpit-microshift.js` | main installer UI logic |
| `src/cockpit-microshift/cluster-list.js` | inventory and destroy actions |
| `src/cockpit-microshift/cluster-overview.js` | overview, access, and destroy behavior |
| `src/cockpit-microshift/cockpit-microshift.css` | Cockpit plugin styling |
| `src/cockpit-microshift/microshift_backend.py` | backend execution boundary |
| `src/cockpit-microshift/manifest.json` | Cockpit plugin registration |

## Packaging And Docs

| Path | Why it exists |
| --- | --- |
| `build-rpm.sh` | local RPM build entry point |
| `cockpit-microshift.spec` | RPM packaging definition |
| `README.md` | repository landing page |
| `website/` | Docusaurus documentation site |
| `.github/workflows/pages.yml` | GitHub Pages deployment workflow |

## Screens In Scope

- cluster list and deployment-target filtering
- guided MicroShift install workflow
- per-cluster overview, access, history, and support tabs
- destroy and clean rebuild actions for local `create-host` deployments

Destroy behavior is intentionally limited to local guest deployments created by
this plugin.
