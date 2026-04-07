"use strict";

/* global cockpit */

var HELPER_PATH = "/usr/share/cockpit/cockpit-microshift/microshift_backend.py";
var refs = {};
var state = {
    items: [],
    search: "",
    target: "all",
    selectedClusterId: "",
    openMenuClusterId: "",
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

    if (status && status.running && status.state && status.state.mode === "destroy" && status.state.clusterId === cluster.clusterId) {
        return { label: "Destroying", tone: "status-chip--danger" };
    }
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
            targetLabel(item),
            clusterStatusInfo(item, state.lastStatus).label
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
    state.selectedClusterId = clusterId;
    render();
    window.location.href = "overview.html?clusterId=" + encodeURIComponent(clusterId);
}

function closeRowMenu() {
    state.openMenuClusterId = "";
    render();
}

function activeMenuAnchor() {
    var buttons;
    var anchor = null;

    if (!state.openMenuClusterId) {
        return null;
    }

    buttons = document.querySelectorAll(".kebab-button[data-cluster-id]");
    buttons.forEach(function (entry) {
        if (entry.getAttribute("data-cluster-id") === state.openMenuClusterId) {
            anchor = entry;
        }
    });

    return anchor;
}

function renderRowMenuOverlay() {
    var item;
    var anchor;
    var rect;
    var menu;
    var menuWidth = 220;
    var left;
    var top;

    refs.rowActionMenuRoot.innerHTML = "";
    if (!state.openMenuClusterId) {
        return;
    }

    item = state.items.find(function (entry) {
        return entry.clusterId === state.openMenuClusterId;
    });
    anchor = activeMenuAnchor();
    if (!item || !anchor) {
        return;
    }

    rect = anchor.getBoundingClientRect();
    left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    top = rect.bottom + 8;

    menu = document.createElement("div");
    menu.className = "action-menu action-menu--row action-menu--floating";
    menu.style.left = left + "px";
    menu.style.top = top + "px";

    function addMenuItem(label, handler, disabled) {
        var menuButton = document.createElement("button");
        menuButton.type = "button";
        menuButton.className = "action-menu__item";
        menuButton.textContent = label;
        menuButton.disabled = !!disabled;
        menuButton.addEventListener("click", function (event) {
            event.stopPropagation();
            handler();
        });
        menu.appendChild(menuButton);
    }

    addMenuItem("Open details", function () {
        closeRowMenu();
        navigateToCluster(item.clusterId);
    }, false);
    addMenuItem("Destroy cluster", function () {
        closeRowMenu();
        if (!window.confirm("Destroy cluster " + item.clusterId + "?")) {
            return;
        }
        backendCommand("destroy", ["--cluster-id", item.clusterId]).then(function (result) {
            if (!result.ok) {
                window.alert((result.errors || ["Cluster destroy failed"]).join("\n"));
                return;
            }
            refreshInventory();
        }).catch(function (error) {
            window.alert(String(error));
        });
    }, item.deploymentTargetPattern !== "create-host" || !!(state.lastStatus && state.lastStatus.running));

    refs.rowActionMenuRoot.appendChild(menu);
}

function positionOpenRowMenu() {
    var menu;
    var anchor;
    var rect;
    var menuWidth;
    var menuHeight;
    var left;
    var top;

    if (!state.openMenuClusterId) {
        return;
    }

    anchor = activeMenuAnchor();
    menu = refs.rowActionMenuRoot.querySelector(".action-menu--floating");
    if (!anchor || !menu) {
        return;
    }

    rect = anchor.getBoundingClientRect();
    menuWidth = menu.offsetWidth || 220;
    menuHeight = menu.offsetHeight || 0;
    left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    top = rect.bottom + 8;
    if (top + menuHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - menuHeight - 8);
    }

    menu.style.left = left + "px";
    menu.style.top = top + "px";
}

function pageRangeText(total) {
    if (!total) {
        return "0 - 0 of 0";
    }
    var start = ((state.page - 1) * state.pageSize) + 1;
    var end = Math.min(total, state.page * state.pageSize);
    return start + " - " + end + " of " + total;
}

function renderStatusChip(item) {
    var info = clusterStatusInfo(item, state.lastStatus);
    return '<span class="status-chip ' + info.tone + '">' + escapeHtml(info.label) + "</span>";
}

function renderRowActionCell(item) {
    var cell = document.createElement("td");
    var wrapper = document.createElement("div");
    var button = document.createElement("button");

    cell.className = "inventory-table__actions-cell";
    wrapper.className = "page-action-menu page-action-menu--row";
    button.type = "button";
    button.className = "kebab-button";
    button.setAttribute("data-cluster-id", item.clusterId);
    button.setAttribute("aria-label", "Cluster row actions");
    button.setAttribute("aria-expanded", state.openMenuClusterId === item.clusterId ? "true" : "false");
    button.innerHTML = '<span aria-hidden="true">&#x22ee;</span>';

    button.addEventListener("click", function (event) {
        event.stopPropagation();
        state.openMenuClusterId = state.openMenuClusterId === item.clusterId ? "" : item.clusterId;
        render();
    });

    wrapper.appendChild(button);
    cell.appendChild(wrapper);
    return cell;
}

function renderRow(item) {
    var row = document.createElement("tr");
    var nameCell = document.createElement("td");
    var statusCell = document.createElement("td");
    var targetCell = document.createElement("td");
    var hostCell = document.createElement("td");
    var createdCell = document.createElement("td");
    var versionCell = document.createElement("td");

    row.className = "inventory-table__row";
    if (state.selectedClusterId === item.clusterId) {
        row.classList.add("inventory-table__row--selected");
    }
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "Open cluster overview for " + item.clusterId);

    nameCell.innerHTML = '<div class="inventory-table__primary">' + escapeHtml(item.clusterName || item.clusterId) + '</div><div class="inventory-table__secondary">' + escapeHtml(item.clusterId) + "</div>";
    statusCell.innerHTML = renderStatusChip(item);
    targetCell.textContent = targetLabel(item);
    hostCell.textContent = (item.host && item.host.address) || "Not recorded";
    createdCell.textContent = formatCreatedDate(item.createdAt);
    versionCell.textContent = item.microshiftVersion || "Unknown";

    [nameCell, statusCell, targetCell, hostCell, createdCell, versionCell].forEach(function (cell) {
        row.appendChild(cell);
    });
    row.appendChild(renderRowActionCell(item));

    row.addEventListener("click", function () {
        navigateToCluster(item.clusterId);
    });
    row.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigateToCluster(item.clusterId);
        }
    });

    return row;
}

function syncPagination(items) {
    var pageCount = Math.max(1, Math.ceil(items.length / state.pageSize));
    if (state.page > pageCount) {
        state.page = pageCount;
    }
    refs.paginationSummary.textContent = pageRangeText(items.length);
    refs.prevButton.disabled = state.page <= 1;
    refs.nextButton.disabled = state.page >= pageCount;
}

function render() {
    var items = filteredItems();
    var visibleItems;

    syncPagination(items);
    visibleItems = pagedItems(items);

    refs.tableBody.innerHTML = "";
    refs.empty.hidden = items.length > 0;
    refs.tableShell.hidden = items.length === 0;
    refs.pagination.hidden = items.length === 0;
    refs.empty.textContent = "No clusters match the current filters.";
    refs.resultCount.textContent = items.length + (items.length === 1 ? " cluster" : " clusters");

    visibleItems.forEach(function (item) {
        refs.tableBody.appendChild(renderRow(item));
    });

    renderRowMenuOverlay();
    positionOpenRowMenu();
}

function refreshInventory() {
    Promise.all([
        backendCommand("clusters"),
        backendCommand("status")
    ]).then(function (results) {
        state.items = results[0].clusters || [];
        state.lastStatus = results[1] || null;
        render();
    }).catch(function (error) {
        refs.empty.hidden = false;
        refs.empty.textContent = String(error);
        refs.tableShell.hidden = true;
        refs.pagination.hidden = true;
        refs.resultCount.textContent = "Inventory unavailable";
    });
}

function resetListPosition() {
    state.page = 1;
    state.openMenuClusterId = "";
}

function cacheRefs() {
    refs.search = document.getElementById("clusters-search");
    refs.targetFilter = document.getElementById("cluster-target-filter");
    refs.refreshButton = document.getElementById("clusters-refresh-button");
    refs.tableBody = document.getElementById("cluster-table-body");
    refs.tableShell = document.querySelector(".fleet-table-shell");
    refs.empty = document.getElementById("clusters-empty");
    refs.resultCount = document.getElementById("clusters-result-count");
    refs.pagination = document.querySelector(".fleet-pagination");
    refs.paginationSummary = document.getElementById("pagination-summary");
    refs.pageSize = document.getElementById("page-size-select");
    refs.prevButton = document.getElementById("page-prev-button");
    refs.nextButton = document.getElementById("page-next-button");
    refs.rowActionMenuRoot = document.getElementById("row-action-menu-root");
}

function bindEvents() {
    refs.search.addEventListener("input", function (event) {
        state.search = event.target.value;
        resetListPosition();
        render();
    });
    refs.targetFilter.addEventListener("change", function (event) {
        state.target = event.target.value;
        resetListPosition();
        render();
    });
    refs.refreshButton.addEventListener("click", refreshInventory);
    refs.pageSize.addEventListener("change", function (event) {
        state.pageSize = parseInt(event.target.value, 10) || 10;
        resetListPosition();
        render();
    });
    refs.prevButton.addEventListener("click", function () {
        if (state.page > 1) {
            state.page -= 1;
            render();
        }
    });
    refs.nextButton.addEventListener("click", function () {
        state.page += 1;
        render();
    });
    document.addEventListener("click", function (event) {
        if (state.openMenuClusterId &&
            !event.target.closest(".page-action-menu--row") &&
            !event.target.closest(".action-menu--floating")) {
            state.openMenuClusterId = "";
            render();
        }
    });
    refs.tableShell.addEventListener("scroll", function () {
        if (state.openMenuClusterId) {
            closeRowMenu();
        }
    });
    window.addEventListener("resize", function () {
        if (state.openMenuClusterId) {
            closeRowMenu();
        }
    });
}

document.addEventListener("DOMContentLoaded", function () {
    cacheRefs();
    bindEvents();
    refreshInventory();
});
