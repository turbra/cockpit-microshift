# Deployment Cleanup Handoff

Branch to resume on tomorrow:

- `feature/deployment-cleanup`

Current base:

- `origin/main` and this branch both point at `1a6c720`
- working tree was clean when this note was created

## Where We Left Off

Completed and pushed to `main`:

- standalone Cockpit MicroShift plugin
- create-host provisioning flow
- cluster list landing page
- per-cluster overview page
- inventory reconciliation for deleted local libvirt guests
- installer status tracking fix
- README alignment with `cockpit-openshift`
- doc cleanup to remove local-only wording

Current MicroShift plugin shape:

- landing page: `src/cockpit-microshift/index.html`
- installer workflow: `src/cockpit-microshift/create.html`
- cluster detail page: `src/cockpit-microshift/overview.html`
- main installer UI: `src/cockpit-microshift/cockpit-microshift.js`
- cluster list UI: `src/cockpit-microshift/cluster-list.js`
- cluster overview UI: `src/cockpit-microshift/cluster-overview.js`
- backend authority: `src/cockpit-microshift/microshift_backend.py`

## Tomorrow's Feature

Add deployment cleanup and destroy/rebuild behavior with the same lifecycle
intent as `cockpit-openshift`, but without diverging from the MicroShift
host-based RPM model.

Authoritative cleanup reference in `cockpit-openshift`:

- backend destroy primitives:
  `src/cockpit-openshift/installer_backend.py`
  - `destroy_domain()`
  - `remove_disk()`
  - `cleanup_previous_install()`
  - `run_destroy_job()`
  - `handle_destroy()`
- list-page destroy action:
  `src/cockpit-openshift/cluster-list.js`
- overview-page destroy action:
  `src/cockpit-openshift/cluster-overview.js`
- installer footer clean-rebuild button:
  `src/cockpit-openshift/create.html`

## Practical Scope

First pass should cover:

1. Local `create-host` cleanup
   - destroy and undefine the libvirt domain
   - remove guest root disk
   - remove generated seed/install media owned by this plugin
   - remove runtime work directory
   - remove stale inventory entry

2. Inventory-driven destroy action
   - add a backend `destroy --cluster-id ...` path
   - surface destroy from the cluster list
   - surface destroy from the overview page
   - refresh or redirect the UI after successful cleanup

3. Installer-side rebuild path
   - add a `Clean rebuild` action for `create-host`
   - reuse the cleanup logic before reprovisioning when the operator explicitly asks for it

## Important Constraint

Do not treat existing-host cleanup the same as local guest cleanup.

For `existing-host`, the plugin is operating on a real host over SSH, not a
disposable VM. A safe first implementation should avoid blindly removing more
than the state this plugin clearly owns.

That means:

- local guest destroy can be aggressive about libvirt/domain/disk cleanup
- remote host cleanup needs explicit ownership rules before removing RPMs or
  broader system configuration

If existing-host cleanup is included tomorrow, keep the first pass narrow:

- stop and disable `microshift.service`
- remove plugin-written config inputs if they still match this deployment's
  ownership model
- clear local runtime and inventory state

Package removal on an existing host should be treated as a separate decision
unless ownership is explicit.

## Suggested Implementation Order

1. Backend cleanup primitives in `src/cockpit-microshift/microshift_backend.py`
   - add `destroy_domain()` and `remove_disk()` equivalents
   - add MicroShift-specific cleanup helpers for plugin-owned generated files
   - add `run_destroy_job()` and `handle_destroy()`
   - update CLI parser with a `destroy` subcommand

2. Cluster inventory actions
   - add destroy action in `src/cockpit-microshift/cluster-list.js`
   - add destroy action in `src/cockpit-microshift/cluster-overview.js`
   - keep confirmation prompts and post-destroy refresh behavior aligned with
     `cockpit-openshift`

3. Installer rebuild flow
   - add a visible `Clean rebuild` path in `src/cockpit-microshift/create.html`
   - wire it through `src/cockpit-microshift/cockpit-microshift.js`
   - ensure runtime status distinguishes deploy vs destroy/rebuild mode

4. Documentation and packaging
   - update `README.md`
   - update `docs/microshift-support.md`
   - confirm `cockpit-microshift.spec` already includes all required assets

## MicroShift-Specific Cleanup Candidates

State this plugin currently creates or manages:

- runtime root: `/var/lib/cockpit-microshift/`
- generated work dir per deployment under:
  `/var/lib/cockpit-microshift/microshift-work/<deployment>/`
- cached guest images under:
  `/var/lib/cockpit-microshift/image-cache/`
- local copy of kubeconfig under the generated work dir
- local libvirt guest for `create-host`
- guest cloud-init seed / generated provisioning artifacts for `create-host`
- guest-side files written by install flow:
  - MicroShift config under `/etc/microshift/`
  - CRI-O registry auth file under `/etc/crio/`

Be conservative about shared cache deletion:

- destroying one deployment should not remove shared downloaded images unless
  ownership is explicit and exclusive

## Validation Checklist For Tomorrow

- syntax check backend:
  `python3 -m py_compile src/cockpit-microshift/microshift_backend.py`
- syntax check JS:
  - `node --check src/cockpit-microshift/cockpit-microshift.js`
  - `node --check src/cockpit-microshift/cluster-list.js`
  - `node --check src/cockpit-microshift/cluster-overview.js`
- package sanity:
  - `bash -n build-rpm.sh`
  - `rpmspec -P cockpit-microshift.spec >/dev/null`
- behavior:
  - deploy a `create-host` cluster
  - destroy it from the list page
  - verify libvirt domain is gone
  - verify owned disk/media artifacts are gone
  - verify inventory entry is gone
  - verify a clean rebuild works from the installer path

## Known Design Risk

The reference lifecycle source for destroy/rebuild behavior is
`cockpit-openshift`, but the final install authority remains the Red Hat
MicroShift host-based RPM model.

Alignment target:

- match `cockpit-openshift` for operator-facing cleanup controls and backend job
  structure
- keep MicroShift cleanup semantics limited to state this plugin actually owns
