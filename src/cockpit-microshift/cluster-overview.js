"use strict";

/* global cockpit */

var HELPER_PATH = "/usr/share/cockpit/cockpit-microshift/microshift_backend.py";
var refs = {};
var state = {
    cluster: null,
    status: null,
    activeTab: "overview"
};

function backendCommand(command, extraArgs) {
    var args = ["python3", HELPER_PATH, command];
    if (extraArgs && extraArgs.length) {
        args = args.concat(extraArgs);
    }
    return cockpit.spawn(args, { superuser: "require", err: "message" }).then(function (output) {
        return JSON.parse(output);
    });
}

function queryClusterId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("clusterId") || "";
}

function clusterIdFromRequest(request) {
    if (!request || !request.deploymentName || !request.config || !request.config.baseDomain) {
        return "";
    }
    return request.deploymentName + "." + request.config.baseDomain;
}

function formatDate(value) {
    if (!value) {
        return "Not recorded";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

function clusterStatus(cluster, status) {
    var activeClusterId = status && status.request ? clusterIdFromRequest(status.request) : "";

    if (status && status.running && cluster.clusterId === activeClusterId) {
        return "Deploying";
    }
    if (cluster.status === "failed") {
        return "Failed";
    }
    if (cluster.health && cluster.health.available) {
        return "Ready";
    }
    if (cluster.health && cluster.health.apiReachable) {
        return "API reachable";
    }
    if (cluster.status === "succeeded") {
        return "Installed";
    }
    if (cluster.status === "running" || cluster.status === "starting") {
        return "Provisioning";
    }
    return "Unknown";
}

function renderKeyValueList(container, rows) {
    container.innerHTML = "";
    rows.forEach(function (row) {
        var dt = document.createElement("dt");
        var dd = document.createElement("dd");
        dt.textContent = row[0];
        if (row[2]) {
            var link = document.createElement("a");
            link.className = "wizard-doc-link";
            link.href = row[1];
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = row[1];
            dd.appendChild(link);
        } else {
            dd.textContent = row[1];
        }
        container.appendChild(dt);
        container.appendChild(dd);
    });
}

function renderList(container, items) {
    container.innerHTML = "";
    items.forEach(function (item) {
        var li = document.createElement("li");
        li.textContent = item;
        container.appendChild(li);
    });
}

function renderTabs() {
    refs.tabs.forEach(function (button) {
        var active = button.dataset.tab === state.activeTab;
        button.classList.toggle("overview-tabs__tab--active", active);
        button.toggleAttribute("aria-current", active);
    });
    Object.keys(refs.panels).forEach(function (key) {
        refs.panels[key].hidden = key !== state.activeTab;
    });
}

function renderOverview() {
    var cluster = state.cluster;
    var statusText;
    var advisor = [];
    var notices = [];
    var history = [];
    var support = [];
    var access = [];

    if (!cluster) {
        refs.missing.hidden = false;
        refs.mainPanels.forEach(function (panel) {
            panel.hidden = true;
        });
        refs.openApi.classList.add("action-button--disabled");
        refs.openApi.removeAttribute("href");
        return;
    }

    refs.missing.hidden = true;
    statusText = clusterStatus(cluster, state.status);
    refs.title.textContent = cluster.clusterId;
    refs.subtitle.textContent = statusText + " on " + (cluster.provider || "MicroShift");
    refs.breadcrumbName.textContent = cluster.clusterId;

    if (cluster.installAccess && cluster.installAccess.apiEndpoint) {
        refs.openApi.href = cluster.installAccess.apiEndpoint;
        refs.openApi.classList.remove("action-button--disabled");
    } else {
        refs.openApi.removeAttribute("href");
        refs.openApi.classList.add("action-button--disabled");
    }

    renderKeyValueList(refs.details, [
        ["Cluster ID", cluster.clusterId || "Not recorded"],
        ["Deployment name", cluster.clusterName || "Not recorded"],
        ["Status", statusText],
        ["Deployment target", cluster.deploymentTargetPattern === "create-host" ? "Local libvirt guest" : "Existing RHEL host"],
        ["Target host", cluster.host && cluster.host.address ? cluster.host.address : "Not recorded"],
        ["SSH user", cluster.host && cluster.host.sshUser ? cluster.host.sshUser : "Not recorded"],
        ["Base domain", cluster.baseDomain || "Not recorded"],
        ["Node IP", cluster.request && cluster.request.config ? (cluster.request.config.nodeIP || "Auto-detect") : "Not recorded"],
        ["Version", cluster.microshiftVersion ? ("MicroShift " + cluster.microshiftVersion) : "Not recorded"],
        ["VM name", cluster.vmName || "Not applicable"],
        ["Created", formatDate(cluster.createdAt)],
        ["Owner", cluster.owner || "Not recorded"]
    ]);

    renderKeyValueList(refs.healthSummary, [
        ["Ready nodes", String(cluster.health ? cluster.health.readyNodes : 0)],
        ["Observed nodes", String(cluster.health ? cluster.health.totalNodes : 0)],
        ["API reachable", cluster.health && cluster.health.apiReachable ? "Yes" : "No"],
        ["Install result", cluster.status || "Unknown"]
    ]);

    renderKeyValueList(refs.deploymentSummary, [
        ["Provider", cluster.provider || "Not recorded"],
        ["Region", cluster.region || "Not recorded"],
        ["vCPUs", cluster.nodeVcpus ? String(cluster.nodeVcpus) : "Not recorded"],
        ["Memory", cluster.memoryMb ? (String(cluster.memoryMb) + " MiB") : "Not recorded"]
    ]);

    access.push(["API endpoint", cluster.installAccess && cluster.installAccess.apiEndpoint ? cluster.installAccess.apiEndpoint : "Not recorded", !!(cluster.installAccess && cluster.installAccess.apiEndpoint)]);
    access.push(["Kubeconfig", cluster.installAccess && cluster.installAccess.kubeconfigPath ? cluster.installAccess.kubeconfigPath : (cluster.kubeconfigPath || "Not recorded"), false]);
    access.push(["Remote kubeconfig", cluster.installAccess && cluster.installAccess.remoteKubeconfigPath ? cluster.installAccess.remoteKubeconfigPath : "Not recorded", false]);
    access.push(["Installer", "create.html?clusterId=" + encodeURIComponent(cluster.clusterId), true]);
    renderKeyValueList(refs.access, access);

    if (cluster.health && cluster.health.available) {
        advisor.push("The kubeconfig on the Cockpit host is usable. Continue cluster access and day-2 work from that file.");
    } else if (cluster.health && cluster.health.apiReachable) {
        advisor.push("The API is responding but no ready node was confirmed yet. Review the node state and in-cluster operators.");
    } else {
        advisor.push("The API is not currently reachable from the Cockpit host. Validate host reachability and the MicroShift service on the target.");
    }
    if (cluster.request && cluster.request.prerequisites && !cluster.request.prerequisites.manageFirewall) {
        advisor.push("This deployment did not let the installer manage firewalld. Host-side firewall exposure must stay aligned manually.");
    }
    if (cluster.deploymentTargetPattern === "create-host") {
        advisor.push("This cluster is backed by a local libvirt guest. Host-side VM lifecycle and cluster lifecycle remain coupled.");
    }

    if (state.status && state.status.running && cluster.clusterId === clusterIdFromRequest(state.status.request)) {
        notices.push("Deployment is still running: " + (state.status.currentTask || "Waiting for the next backend step."));
    }
    if (cluster.status === "failed" && cluster.error) {
        notices.push("Last deployment failure: " + cluster.error);
    }
    if (cluster.health && cluster.health.message) {
        notices.push(cluster.health.message);
    }
    if (!notices.length) {
        notices.push("No active alerts are recorded for this cluster.");
    }

    history.push("Created: " + formatDate(cluster.createdAt));
    if (cluster.request && cluster.request.deploymentTargetPattern) {
        history.push("Deployment target: " + (cluster.request.deploymentTargetPattern === "create-host" ? "Local libvirt guest" : "Existing RHEL host"));
    }
    history.push("Last known installer result: " + (cluster.status || "Unknown"));
    if (state.status && state.status.state && state.status.state.endedAt && cluster.clusterId === clusterIdFromRequest(state.status.request)) {
        history.push("Last backend completion: " + formatDate(state.status.state.endedAt));
    }

    support.push("Authoritative source: Red Hat Build of MicroShift host-based RPM installation model.");
    support.push("Use the local kubeconfig path recorded on this page for direct cluster access from the Cockpit host.");
    support.push("If API access fails, validate the target host first, then review microshift.service and the host firewall state.");

    renderList(refs.advisor, advisor);
    renderList(refs.notices, notices);
    renderList(refs.history, history);
    renderList(refs.support, support);
}

function refreshPage() {
    return Promise.all([
        backendCommand("clusters"),
        backendCommand("status")
    ]).then(function (results) {
        var clusterId = queryClusterId();
        state.cluster = (results[0].clusters || []).find(function (entry) {
            return entry.clusterId === clusterId;
        }) || null;
        state.status = results[1] || null;
        renderTabs();
        renderOverview();
    }).catch(function () {
        state.cluster = null;
        renderTabs();
        renderOverview();
    });
}

function cacheRefs() {
    refs.title = document.getElementById("cluster-page-title");
    refs.subtitle = document.getElementById("cluster-page-subtitle");
    refs.breadcrumbName = document.getElementById("cluster-breadcrumb-name");
    refs.openApi = document.getElementById("open-api-link");
    refs.refreshButton = document.getElementById("overview-refresh-button");
    refs.details = document.getElementById("cluster-details-list");
    refs.advisor = document.getElementById("advisor-list");
    refs.notices = document.getElementById("notices-list");
    refs.healthSummary = document.getElementById("health-summary-list");
    refs.deploymentSummary = document.getElementById("deployment-summary-list");
    refs.access = document.getElementById("access-list");
    refs.history = document.getElementById("history-list");
    refs.support = document.getElementById("support-list");
    refs.missing = document.getElementById("cluster-missing");
    refs.tabs = Array.prototype.slice.call(document.querySelectorAll(".overview-tabs__tab"));
    refs.panels = {
        overview: document.getElementById("overview-tab-panel"),
        access: document.getElementById("access-tab-panel"),
        history: document.getElementById("history-tab-panel"),
        support: document.getElementById("support-tab-panel")
    };
    refs.mainPanels = [
        refs.panels.overview,
        refs.panels.access,
        refs.panels.history,
        refs.panels.support
    ];
}

function bindEvents() {
    refs.refreshButton.addEventListener("click", refreshPage);
    refs.tabs.forEach(function (button) {
        button.addEventListener("click", function () {
            state.activeTab = button.dataset.tab;
            renderTabs();
            renderOverview();
        });
    });
}

document.addEventListener("DOMContentLoaded", function () {
    cacheRefs();
    bindEvents();
    renderTabs();
    refreshPage();
});
