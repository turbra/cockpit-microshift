Name:           cockpit-microshift
Version:        0.1.0
Release:        1%{?dist}
Summary:        Cockpit plugin for MicroShift installation

License:        GPL-3.0-or-later
URL:            https://github.com/turbra/cockpit-microshift
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch

Requires:       cockpit-system
Requires:       cockpit-bridge

%description
Cockpit MicroShift is a Cockpit plugin prototype for a guided MicroShift
installation workflow onto an existing RHEL host.

The current release provides:
- a cluster inventory landing page with per-cluster overview pages
- a wizard-style MicroShift installer UI
- a privileged backend helper that owns the host-side install workflow
- preflight validation over SSH
- job status polling and recent log output

%prep
%autosetup

%build
# Nothing to build - pure HTML/JS/CSS plugin

%install
mkdir -p %{buildroot}%{_datadir}/cockpit/cockpit-microshift
install -m 0644 src/cockpit-microshift/manifest.json %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 src/cockpit-microshift/index.html %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 src/cockpit-microshift/create.html %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 src/cockpit-microshift/overview.html %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 src/cockpit-microshift/cockpit-microshift.js %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 src/cockpit-microshift/cluster-list.js %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 src/cockpit-microshift/cluster-overview.js %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 src/cockpit-microshift/cockpit-microshift.css %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0755 src/cockpit-microshift/microshift_backend.py %{buildroot}%{_datadir}/cockpit/cockpit-microshift/
install -m 0644 README.md %{buildroot}%{_datadir}/cockpit/cockpit-microshift/

%files
%license LICENSE
%{_datadir}/cockpit/cockpit-microshift/
