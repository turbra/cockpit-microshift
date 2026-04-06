"use strict";

/* global cockpit */

var HELPER_PATH = "/usr/share/cockpit/cockpit-microshift/microshift_backend.py";
var refs = {};
var state = {
    items: [],
    search: "",
    target: "all",
    page: 1,
    pageSize: 10,
    lastStatus: null
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

function clusterIdFromRequest(request) {
    if (!request || !request.deploymentName || !request.config || !request.config.baseDomain) {
        return "";
    }
    return request.deploymentName + "." + request.config.baseDomain;
}

function formatCreatedDate(value) {
    if (!value) {
        return "Not recorded";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function targetLabel(cluster) {
    return cluster.deploymentTargetPattern === "create-host" ? "Local libvirt guest" : "Existing RHEL host";
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function clusterStatusInfo(cluster, status) {
    var activeClusterId = status && status.request ? clusterIdFromRequest(status.request) : "";

    if (status && status.running && cluster.clusterId === activeClusterId) {
        return { label: "Deploying", tone: "status-chip--progress" };
    }
    if (cluster.status === "failed") {
        return { label: "Failed", tone: "status-chip--danger" };
    }
    if (cluster.health && cluster.health.available) {
        return { label: "Ready", tone: "status-chip--success" };
    }
    if (cluster.health && cluster.health.apiReachable) {
        return { label: "API reachable", tone: "status-chip--warning" };
    }
    if (cluster.status === "succeeded") {
        return { label: "Installed", tone: "status-chip--muted" };
    }
    if (cluster.status === "running" || cluster.status === "starting") {
        return { label: "Provisioning", tone: "status-chip--progress" };
    }
    return { label: "Unknown", tone: "status-chip--muted" };
}

function filteredItems() {
    var search = state.search.trim().toLowerCase();
    return state.items.filter(function (item) {
        var haystack = [
            item.clusterName,
            item.clusterId,
            item.host && item.host.address,
            item.microshiftVersion,
            targetLabel(item)
        ].join(" ").toLowerCase();
        var matchesTarget = state.target === "all" || item.deploymentTargetPattern === state.target;
        var matchesSearch = !search || haystack.indexOf(search) >= 0;
        return matchesTarget && matchesSearch;
    });
}

function pagedItems(items) {
    var start = (state.page - 1) * state.pageSize;
    return items.slice(start, start + state.pageSize);
}

function navigateToCluster(clusterId) {
    window.location.href = "overview.html?clusterId=" + encodeURIComponent(clusterId);
}

function render() {
    var filtered = filteredItems();
    var totalPages = Math.max(1, Math.ceil(Math.max(filtered.length, 1) / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    var paged = pagedItems(filtered);
    var start = filtered.length ? ((state.page - 1) * state.pageSize) + 1 : 0;
    var end = Math.min(state.page * state.pageSize, filtered.length);

    refs.resultCount.textContent = filtered.length + " cluster" + (filtered.length === 1 ? "" : "s");
    refs.paginationSummary.textContent = start + " - " + end + " of " + filtered.length;
    refs.empty.hidden = filtered.length !== 0;
    refs.prevButton.disabled = state.page <= 1;
    refs.nextButton.disabled = end >= filtered.length;
    refs.tableBody.innerHTML = "";

    paged.forEach(function (cluster) {
        var row = document.createElement("tr");
        var statusInfo = clusterStatusInfo(cluster, state.lastStatus);
        var actionCell = document.createElement("td");
        var openButton = document.createElement("button");

        row.className = "inventory-table__row";
        row.tabIndex = 0;
        row.addEventListener("click", function () {
            navigateToCluster(cluster.clusterId);
        });
        row.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigateToCluster(cluster.clusterId);
            }
        });

        row.innerHTML =
            '<td><div class="inventory-table__primary">' + escapeHtml(cluster.clusterName) + '</div><div class="inventory-table__secondary">' + escapeHtml(cluster.clusterId) + "</div></td>" +
            '<td><span class="status-chip ' + statusInfo.tone + '">' + escapeHtml(statusInfo.label) + "</span></td>" +
            "<td>" + escapeHtml(targetLabel(cluster)) + "</td>" +
            "<td>" + escapeHtml((cluster.host && cluster.host.address) || "Not recorded") + "</td>" +
            "<td>" + escapeHtml(formatCreatedDate(cluster.createdAt)) + "</td>" +
            "<td>MicroShift " + escapeHtml(cluster.microshiftVersion || "Unknown") + "</td>";

        actionCell.className = "inventory-table__actions-cell";
        openButton.type = "button";
        openButton.className = "action-button action-button--secondary";
        openButton.textContent = "Details";
        openButton.addEventListener("click", function (event) {
            event.stopPropagation();
            navigateToCluster(cluster.clusterId);
        });
        actionCell.appendChild(openButton);
        row.appendChild(actionCell);
        refs.tableBody.appendChild(row);
    });
}

function refreshInventory() {
    return Promise.all([
        backendCommand("clusters"),
        backendCommand("status")
    ]).then(function (results) {
        state.items = results[0].clusters || [];
        state.lastStatus = results[1] || null;
        state.page = Math.max(1, Math.min(state.page, Math.ceil(Math.max(state.items.length, 1) / state.pageSize)));
        render();
    }).catch(function (error) {
        refs.empty.hidden = false;
        refs.empty.textContent = String(error);
        refs.tableBody.innerHTML = "";
    });
}

function cacheRefs() {
    refs.search = document.getElementById("clusters-search");
    refs.targetFilter = document.getElementById("cluster-target-filter");
    refs.tableBody = document.getElementById("cluster-table-body");
    refs.resultCount = document.getElementById("clusters-result-count");
    refs.empty = document.getElementById("clusters-empty");
    refs.paginationSummary = document.getElementById("pagination-summary");
    refs.pageSize = document.getElementById("page-size-select");
    refs.prevButton = document.getElementById("page-prev-button");
    refs.nextButton = document.getElementById("page-next-button");
    refs.refreshButton = document.getElementById("clusters-refresh-button");
}

function bindEvents() {
    refs.search.addEventListener("input", function (event) {
        state.search = event.target.value;
        state.page = 1;
        render();
    });
    refs.targetFilter.addEventListener("change", function (event) {
        state.target = event.target.value;
        state.page = 1;
        render();
    });
    refs.pageSize.addEventListener("change", function (event) {
        state.pageSize = parseInt(event.target.value, 10) || 10;
        state.page = 1;
        render();
    });
    refs.prevButton.addEventListener("click", function () {
        state.page = Math.max(1, state.page - 1);
        render();
    });
    refs.nextButton.addEventListener("click", function () {
        state.page += 1;
        render();
    });
    refs.refreshButton.addEventListener("click", refreshInventory);
}

document.addEventListener("DOMContentLoaded", function () {
    cacheRefs();
    bindEvents();
    render();
    refreshInventory();
});
