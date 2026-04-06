"use strict";

/* global cockpit */

var HELPER_PATH = "/usr/share/cockpit/cockpit-microshift/microshift_backend.py";

var steps = [
    {
        id: 1,
        label: "Deployment details",
        description: "Choose an existing host or a local libvirt guest, then provide the release, access, and registry credentials."
    },
    {
        id: 2,
        label: "Host prerequisites",
        description: "Confirm the documented RHEL host expectations and decide whether the installer should configure firewalld."
    },
    {
        id: 3,
        label: "Configuration",
        description: "Render the supported MicroShift config.yaml inputs for hostname, networking, API SANs, and logging."
    },
    {
        id: 4,
        label: "Review and install",
        description: "Review the rendered request, run preflight validation, and start the host-based MicroShift installation."
    }
];

var refs = {};
var state = createInitialState();
var pollTimer = null;
var artifactPreviewTimer = null;
var lastArtifactPreviewKey = "";
var startResponseTimer = null;

function createInitialState() {
    return {
        currentStep: 1,
        yamlMode: false,
        yamlPaneWidth: 560,
        targetPattern: "existing-host",
        deploymentName: "",
        microshiftVersion: "4.21",
        hostAddress: "",
        sshPort: 22,
        sshUser: "microshift",
        sshPrivateKeyFile: "",
        vmName: "",
        imageSource: "local",
        baseImagePath: "",
        imageDownloadUrl: "",
        imageCacheName: "",
        storagePool: "",
        bridgeName: "",
        guestIpCidr: "",
        guestGateway: "",
        guestDnsServers: "",
        guestNodeVcpus: 4,
        guestNodeMemoryMb: 8192,
        guestDiskSizeGb: 40,
        performanceDomain: "none",
        packageAccessMode: "preconfigured",
        rhsmOrganizationId: "",
        rhsmActivationKey: "",
        rhsmReleaseLock: "",
        rhsmExtraRepositories: "",
        pullSecretValue: "",
        pullSecretFile: "",
        manageFirewall: true,
        exposeApiPort: true,
        exposeIngress: true,
        exposeNodePorts: false,
        exposeMdns: false,
        baseDomain: "",
        hostnameOverride: "",
        nodeIP: "",
        subjectAltNames: "",
        clusterNetwork: "10.42.0.0/16",
        serviceNetwork: "10.43.0.0/16",
        serviceNodePortRange: "30000-32767",
        logLevel: "Normal",
        artifacts: [],
        currentArtifactName: "",
        backendErrors: [],
        fieldErrors: {},
        job: null,
        transientStatusSummary: "",
        transientCurrentTask: "",
        clientLog: [],
        availableStoragePools: [],
        availableBridges: []
    };
}

function encodePayload(payload) {
    return window.btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function backendCommand(command, extraArgs) {
    var args = ["python3", HELPER_PATH, command];
    if (extraArgs && extraArgs.length) {
        args = args.concat(extraArgs);
    }
    return cockpit.spawn(args, { superuser: "require", err: "message" }).then(function (output) {
        return JSON.parse(output);
    });
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function highlightYamlLine(line) {
    var escaped = escapeHtml(line);

    if (/^\s*#/.test(line)) {
        return '<span class="yaml-comment">' + escaped + "</span>";
    }

    escaped = escaped.replace(/^(\s*)([A-Za-z0-9_.-]+)(:)/, function (match, indent, key, colon) {
        return indent + '<span class="yaml-key">' + key + "</span>" + '<span class="yaml-punctuation">' + colon + "</span>";
    });
    escaped = escaped.replace(/(:\s*)(true|false|null)(\s*)$/i, function (match, prefix, value, suffix) {
        return '<span class="yaml-punctuation">:</span>' + prefix.slice(1) + '<span class="yaml-boolean">' + value + "</span>" + suffix;
    });
    escaped = escaped.replace(/(:\s*)(-?\d+(?:\.\d+)?)(\s*)$/i, function (match, prefix, value, suffix) {
        return '<span class="yaml-punctuation">:</span>' + prefix.slice(1) + '<span class="yaml-number">' + value + "</span>" + suffix;
    });
    escaped = escaped.replace(/(:\s*)(".*")(\s*)$/, function (match, prefix, value, suffix) {
        return '<span class="yaml-punctuation">:</span>' + prefix.slice(1) + '<span class="yaml-string">' + value + "</span>" + suffix;
    });
    return escaped;
}

function renderArtifactCode(content, name) {
    var lines = content.split("\n");
    refs.artifactLineNumbers.innerHTML = lines.map(function (_, index) {
        return '<div class="yaml-editor__line-number">' + (index + 1) + "</div>";
    }).join("");

    if (/\.ya?ml$/i.test(name)) {
        refs.artifactContent.innerHTML = lines.map(highlightYamlLine).join("\n");
    } else {
        refs.artifactContent.innerHTML = escapeHtml(content);
    }
}

function splitList(value) {
    return String(value || "")
        .split(/\n|,/)
        .map(function (entry) { return entry.trim(); })
        .filter(function (entry) { return entry.length > 0; });
}

function payload() {
    return {
        deploymentTargetPattern: state.targetPattern,
        deploymentName: state.deploymentName.trim(),
        microshiftVersion: state.microshiftVersion,
        host: {
            address: state.hostAddress.trim(),
            sshPort: parseInt(state.sshPort, 10) || 0,
            sshUser: state.sshUser.trim(),
            sshPrivateKeyFile: state.sshPrivateKeyFile.trim()
        },
        pullSecretValue: state.pullSecretValue.trim(),
        pullSecretFile: state.pullSecretFile.trim(),
        packageAccess: {
            mode: state.packageAccessMode,
            organizationId: state.rhsmOrganizationId.trim(),
            activationKey: state.rhsmActivationKey.trim(),
            releaseLock: state.rhsmReleaseLock.trim(),
            extraRepositories: splitList(state.rhsmExtraRepositories)
        },
        provisioning: {
            vmName: state.vmName.trim(),
            imageSource: state.imageSource,
            baseImagePath: state.baseImagePath.trim(),
            imageDownloadUrl: state.imageDownloadUrl.trim(),
            imageCacheName: state.imageCacheName.trim(),
            storagePool: state.storagePool,
            bridgeName: state.bridgeName,
            guestIpCidr: state.guestIpCidr.trim(),
            guestGateway: state.guestGateway.trim(),
            dnsServers: splitList(state.guestDnsServers),
            nodeVcpus: parseInt(state.guestNodeVcpus, 10) || 0,
            memoryMb: parseInt(state.guestNodeMemoryMb, 10) || 0,
            diskSizeGb: parseInt(state.guestDiskSizeGb, 10) || 0,
            performanceDomain: state.performanceDomain
        },
        prerequisites: {
            manageFirewall: !!state.manageFirewall,
            exposeApiPort: !!state.exposeApiPort,
            exposeIngress: !!state.exposeIngress,
            exposeNodePorts: !!state.exposeNodePorts,
            exposeMdns: !!state.exposeMdns
        },
        config: {
            baseDomain: state.baseDomain.trim(),
            hostnameOverride: state.hostnameOverride.trim(),
            nodeIP: state.nodeIP.trim(),
            subjectAltNames: splitList(state.subjectAltNames),
            clusterNetwork: splitList(state.clusterNetwork),
            serviceNetwork: splitList(state.serviceNetwork),
            serviceNodePortRange: state.serviceNodePortRange.trim(),
            logLevel: state.logLevel
        }
    };
}

function currentArtifact() {
    var selected = null;
    state.artifacts.forEach(function (artifact) {
        if (artifact.name === state.currentArtifactName) {
            selected = artifact;
        }
    });
    return selected || (state.artifacts.length ? state.artifacts[0] : null);
}

function clampYamlPaneWidth(width) {
    var workspaceWidth = refs.wizardWorkspace ? refs.wizardWorkspace.clientWidth : 1280;
    var minWidth = 420;
    var maxWidth = Math.max(540, Math.floor(workspaceWidth * 0.5));
    return Math.max(minWidth, Math.min(width, maxWidth));
}

function artifactPreviewKey() {
    return JSON.stringify(payload());
}

function artifactLoadMode() {
    return state.job ? "current" : "payload";
}

function queryClusterId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("clusterId") || "";
}

function statusRequestAppliesToPage(status) {
    var requestedClusterId = queryClusterId();
    var statusClusterId = status && status.request ? clusterIdFromRequest(status.request) : "";

    if (!requestedClusterId) {
        return true;
    }
    return requestedClusterId === statusClusterId;
}

function selectedStoragePool() {
    var selected = null;
    state.availableStoragePools.forEach(function (pool) {
        if (pool.name === state.storagePool) {
            selected = pool;
        }
    });
    return selected;
}

function clearBackendErrors() {
    state.backendErrors = [];
}

function setTransientStatus(summary, currentTask) {
    state.transientStatusSummary = summary || "";
    state.transientCurrentTask = currentTask || "";
}

function clearTransientStatus() {
    setTransientStatus("", "");
}

function appendClientLog(message) {
    state.clientLog.push("[UI] " + message);
    state.clientLog = state.clientLog.slice(-40);
}

function clearStartResponseTimer() {
    if (startResponseTimer) {
        window.clearTimeout(startResponseTimer);
        startResponseTimer = null;
    }
}

function waitForRuntimeState(attemptsRemaining) {
    return refreshStatus().then(function () {
        if (state.job) {
            return;
        }
        if (attemptsRemaining <= 0) {
            state.backendErrors = ["The deployment request was submitted, but no backend runtime state or VM creation activity was detected."];
            appendClientLog("No backend runtime state or VM creation activity was detected after the request was submitted.");
            setTransientStatus("The deployment did not enter an observable running state.", "No VM creation or backend execution log was detected.");
            render();
            return;
        }
        window.setTimeout(function () {
            waitForRuntimeState(attemptsRemaining - 1);
        }, 1000);
    }).catch(function () {});
}

function setFieldError(name, hasError) {
    state.fieldErrors[name] = !!hasError;
}

function validateStep1() {
    var errors = [];
    var sshPort = parseInt(state.sshPort, 10) || 0;
    var hasPullSecret = !!(state.pullSecretValue.trim() || state.pullSecretFile.trim());
    var requiresActivationKey = state.packageAccessMode === "activation-key";
    var requiresExistingHost = state.targetPattern === "existing-host";
    var requiresCreateHost = state.targetPattern === "create-host";
    var pool = selectedStoragePool();
    var invalidStoragePool = requiresCreateHost && (!state.storagePool || !pool || !pool.supported);

    setFieldError("deploymentName", !state.deploymentName.trim());
    setFieldError("microshiftVersion", !state.microshiftVersion.trim());
    setFieldError("hostAddress", requiresExistingHost && !state.hostAddress.trim());
    setFieldError("sshPort", requiresExistingHost && (sshPort <= 0 || sshPort > 65535));
    setFieldError("sshUser", !state.sshUser.trim());
    setFieldError("sshPrivateKeyFile", !state.sshPrivateKeyFile.trim());
    setFieldError("vmName", requiresCreateHost && !state.vmName.trim());
    setFieldError("baseImagePath", requiresCreateHost && state.imageSource === "local" && !state.baseImagePath.trim());
    setFieldError("imageDownloadUrl", requiresCreateHost && state.imageSource === "download" && !state.imageDownloadUrl.trim());
    setFieldError("storagePool", invalidStoragePool);
    setFieldError("bridgeName", requiresCreateHost && !state.bridgeName);
    setFieldError("guestIpCidr", requiresCreateHost && !state.guestIpCidr.trim());
    setFieldError("guestGateway", requiresCreateHost && !state.guestGateway.trim());
    setFieldError("guestNodeVcpus", requiresCreateHost && ((parseInt(state.guestNodeVcpus, 10) || 0) <= 0));
    setFieldError("guestNodeMemoryMb", requiresCreateHost && ((parseInt(state.guestNodeMemoryMb, 10) || 0) <= 0));
    setFieldError("guestDiskSizeGb", requiresCreateHost && ((parseInt(state.guestDiskSizeGb, 10) || 0) <= 0));
    setFieldError("pullSecretValue", !hasPullSecret);
    setFieldError("pullSecretFile", !hasPullSecret);
    setFieldError("rhsmOrganizationId", requiresActivationKey && !state.rhsmOrganizationId.trim());
    setFieldError("rhsmActivationKey", requiresActivationKey && !state.rhsmActivationKey.trim());

    if (!state.deploymentName.trim()) {
        errors.push("Deployment name");
    }
    if (!state.microshiftVersion.trim()) {
        errors.push("MicroShift version");
    }
    if (requiresExistingHost && !state.hostAddress.trim()) {
        errors.push("Target host address");
    }
    if (requiresExistingHost && (sshPort <= 0 || sshPort > 65535)) {
        errors.push("SSH port");
    }
    if (!state.sshUser.trim()) {
        errors.push("SSH user");
    }
    if (!state.sshPrivateKeyFile.trim()) {
        errors.push("SSH private key file");
    }
    if (requiresCreateHost && !state.vmName.trim()) {
        errors.push("VM name");
    }
    if (requiresCreateHost && state.imageSource === "local" && !state.baseImagePath.trim()) {
        errors.push("Base image path");
    }
    if (requiresCreateHost && state.imageSource === "download" && !state.imageDownloadUrl.trim()) {
        errors.push("Image download URL");
    }
    if (invalidStoragePool) {
        errors.push("Storage pool");
    }
    if (requiresCreateHost && !state.bridgeName) {
        errors.push("Bridge");
    }
    if (requiresCreateHost && !state.guestIpCidr.trim()) {
        errors.push("Guest IP/CIDR");
    }
    if (requiresCreateHost && !state.guestGateway.trim()) {
        errors.push("Guest gateway");
    }
    if (requiresCreateHost && ((parseInt(state.guestNodeVcpus, 10) || 0) <= 0)) {
        errors.push("Guest vCPU count");
    }
    if (requiresCreateHost && ((parseInt(state.guestNodeMemoryMb, 10) || 0) <= 0)) {
        errors.push("Guest memory");
    }
    if (requiresCreateHost && ((parseInt(state.guestDiskSizeGb, 10) || 0) <= 0)) {
        errors.push("Guest disk size");
    }
    if (!hasPullSecret) {
        errors.push("Pull secret");
    }
    if (requiresActivationKey && !state.rhsmOrganizationId.trim()) {
        errors.push("RHSM organization ID");
    }
    if (requiresActivationKey && !state.rhsmActivationKey.trim()) {
        errors.push("RHSM activation key");
    }

    return errors;
}

function validateStep2() {
    return [];
}

function validIp(value) {
    if (!value) {
        return true;
    }
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[0-9a-f:]+$/i.test(value);
}

function validCidr(value) {
    return /^[^/\s]+\/\d{1,3}$/.test(value);
}

function validateStep3() {
    var errors = [];
    var clusterNetworks = splitList(state.clusterNetwork);
    var serviceNetworks = splitList(state.serviceNetwork);
    var nodePortRange = state.serviceNodePortRange.trim();
    var nodePortMatch = /^(\d{1,5})-(\d{1,5})$/.exec(nodePortRange);

    setFieldError("baseDomain", !state.baseDomain.trim());
    setFieldError("nodeIP", !!state.nodeIP.trim() && !validIp(state.nodeIP.trim()));
    setFieldError("clusterNetwork", !clusterNetworks.length || clusterNetworks.some(function (entry) { return !validCidr(entry); }));
    setFieldError("serviceNetwork", !serviceNetworks.length || serviceNetworks.some(function (entry) { return !validCidr(entry); }));
    setFieldError("serviceNodePortRange", !nodePortMatch);
    setFieldError("logLevel", !state.logLevel.trim());

    if (!state.baseDomain.trim()) {
        errors.push("Base domain");
    }
    if (state.nodeIP.trim() && !validIp(state.nodeIP.trim())) {
        errors.push("Node IP");
    }
    if (!clusterNetworks.length || clusterNetworks.some(function (entry) { return !validCidr(entry); })) {
        errors.push("Cluster network CIDR");
    }
    if (!serviceNetworks.length || serviceNetworks.some(function (entry) { return !validCidr(entry); })) {
        errors.push("Service network CIDR");
    }
    if (!nodePortMatch) {
        errors.push("Service NodePort range");
    } else {
        var start = parseInt(nodePortMatch[1], 10);
        var end = parseInt(nodePortMatch[2], 10);
        if (start <= 0 || end > 65535 || start > end) {
            errors.push("Service NodePort range");
        }
    }
    if (!state.logLevel.trim()) {
        errors.push("Log level");
    }

    return errors;
}

function validateStep(stepId) {
    if (stepId === 1) {
        return validateStep1();
    }
    if (stepId === 2) {
        return validateStep2();
    }
    if (stepId === 3) {
        return validateStep3();
    }
    if (stepId === 4) {
        return validateStep1().concat(validateStep2(), validateStep3());
    }
    return [];
}

function currentStepErrors() {
    return validateStep(state.currentStep);
}

function overallErrors() {
    var jobStatus = state.job && state.job.state ? state.job.state.status : "";
    if (jobStatus) {
        return [];
    }
    return validateStep(4).concat(
        (state.backendErrors || []).filter(function (entry) {
            return String(entry || "").trim().length > 0;
        })
    );
}

function furthestAvailableStep() {
    var maxStep = 1;
    var index;

    for (index = 1; index < steps.length; index += 1) {
        if (validateStep(index).length === 0) {
            maxStep = index + 1;
        } else {
            break;
        }
    }

    return Math.min(maxStep, steps.length);
}

function stepStatusClass(stepId) {
    if (stepId === state.currentStep) {
        return "wizard-step wizard-step--active";
    }
    if (stepId < state.currentStep && validateStep(stepId).length === 0) {
        return "wizard-step wizard-step--complete wizard-step--clickable";
    }
    if (stepId <= furthestAvailableStep()) {
        return "wizard-step wizard-step--clickable";
    }
    return "wizard-step wizard-step--disabled";
}

function applyRequestToState(request) {
    var host = request.host || {};
    var prerequisites = request.prerequisites || {};
    var config = request.config || {};
    var provisioning = request.provisioning || {};

    state.targetPattern = request.deploymentTargetPattern || state.targetPattern;
    state.deploymentName = request.deploymentName || state.deploymentName;
    state.microshiftVersion = request.microshiftVersion || state.microshiftVersion;
    state.hostAddress = host.address || state.hostAddress;
    state.sshPort = host.sshPort || state.sshPort;
    state.sshUser = host.sshUser || state.sshUser;
    state.sshPrivateKeyFile = host.sshPrivateKeyFile || state.sshPrivateKeyFile;
    state.pullSecretFile = request.secretInputs && request.secretInputs.pullSecretFile ? request.secretInputs.pullSecretFile : state.pullSecretFile;
    state.packageAccessMode = request.packageAccess && request.packageAccess.mode ? request.packageAccess.mode : state.packageAccessMode;
    state.rhsmOrganizationId = request.packageAccess && request.packageAccess.organizationId ? request.packageAccess.organizationId : state.rhsmOrganizationId;
    state.rhsmActivationKey = request.packageAccess && request.packageAccess.activationKey ? request.packageAccess.activationKey : state.rhsmActivationKey;
    state.rhsmReleaseLock = request.packageAccess && request.packageAccess.releaseLock ? request.packageAccess.releaseLock : state.rhsmReleaseLock;
    state.rhsmExtraRepositories = request.packageAccess && request.packageAccess.extraRepositories ? request.packageAccess.extraRepositories.join("\n") : state.rhsmExtraRepositories;
    state.manageFirewall = prerequisites.manageFirewall !== false;
    state.exposeApiPort = prerequisites.exposeApiPort !== false;
    state.exposeIngress = prerequisites.exposeIngress !== false;
    state.exposeNodePorts = !!prerequisites.exposeNodePorts;
    state.exposeMdns = !!prerequisites.exposeMdns;
    state.vmName = provisioning.vmName || state.vmName;
    state.imageSource = provisioning.imageSource || state.imageSource;
    state.baseImagePath = provisioning.baseImagePath || state.baseImagePath;
    state.imageDownloadUrl = provisioning.imageDownloadUrl || state.imageDownloadUrl;
    state.imageCacheName = provisioning.imageCacheName || state.imageCacheName;
    state.storagePool = provisioning.storagePool || state.storagePool;
    state.bridgeName = provisioning.bridgeName || state.bridgeName;
    state.guestIpCidr = provisioning.guestIpCidr || state.guestIpCidr;
    state.guestGateway = provisioning.guestGateway || state.guestGateway;
    state.guestDnsServers = (provisioning.dnsServers || []).join(", ");
    state.guestNodeVcpus = provisioning.nodeVcpus || state.guestNodeVcpus;
    state.guestNodeMemoryMb = provisioning.memoryMb || state.guestNodeMemoryMb;
    state.guestDiskSizeGb = provisioning.diskSizeGb || state.guestDiskSizeGb;
    state.performanceDomain = provisioning.performanceDomain || state.performanceDomain;
    state.baseDomain = config.baseDomain || state.baseDomain;
    state.hostnameOverride = config.hostnameOverride || state.hostnameOverride;
    state.nodeIP = config.nodeIP || state.nodeIP;
    state.subjectAltNames = (config.subjectAltNames || []).join("\n");
    state.clusterNetwork = (config.clusterNetwork || []).join("\n");
    state.serviceNetwork = (config.serviceNetwork || []).join("\n");
    state.serviceNodePortRange = config.serviceNodePortRange || state.serviceNodePortRange;
    state.logLevel = config.logLevel || state.logLevel;
}

function renderStepList() {
    refs.stepList.innerHTML = "";
    steps.forEach(function (step) {
        var item = document.createElement("li");
        var number = document.createElement("span");
        var copy = document.createElement("div");
        var label = document.createElement("div");
        var description = document.createElement("div");
        var allowed = step.id <= furthestAvailableStep() || step.id <= state.currentStep;

        item.className = stepStatusClass(step.id);
        number.className = "wizard-step__number";
        copy.className = "wizard-step__copy";
        label.className = "wizard-step__label";
        description.className = "wizard-step__description";

        number.textContent = String(step.id);
        label.textContent = step.label;
        description.textContent = step.description;

        if (allowed) {
            item.addEventListener("click", function () {
                state.currentStep = step.id;
                clearBackendErrors();
                render();
                if (state.currentStep === 4) {
                    refreshPreflight();
                    scheduleArtifactPreviewRefresh(true);
                }
            });
        }

        copy.appendChild(label);
        copy.appendChild(description);
        item.appendChild(number);
        item.appendChild(copy);
        refs.stepList.appendChild(item);
    });
}

function renderPanels() {
    steps.forEach(function (step) {
        refs["step" + step.id].hidden = step.id !== state.currentStep;
    });
    refs.stepTitle.textContent = steps[state.currentStep - 1].label;
    refs.stepDescription.textContent = steps[state.currentStep - 1].description;
    refs.reviewYamlToggleWrap.hidden = state.currentStep !== 4;
}

function renderReview() {
    var groups = [
        {
            title: "Deployment target",
            rows: [
                ["Target pattern", state.targetPattern === "existing-host" ? "Existing RHEL host" : "Create and provision a new host"],
                ["Deployment name", state.deploymentName.trim() || "Not set"],
                ["MicroShift version", state.microshiftVersion || "Not set"],
                ["Target host", state.targetPattern === "existing-host" ? (state.hostAddress.trim() || "Not set") : (state.guestIpCidr.trim() || "Will be assigned from guest IP/CIDR")],
                ["SSH", (state.sshUser.trim() || "Not set") + " / port " + String(state.targetPattern === "existing-host" ? (parseInt(state.sshPort, 10) || 0) : 22)],
                ["Pull secret", state.pullSecretValue.trim() ? "Pasted into form" : (state.pullSecretFile.trim() || "Not set")],
                ["Package access", state.packageAccessMode === "activation-key" ? "Automatic RHSM registration" : "Preconfigured repositories"]
            ]
        },
        {
            title: "Host prerequisites",
            rows: [
                ["Manage firewalld", state.manageFirewall ? "Yes" : "No"],
                ["Expose API port 6443", state.exposeApiPort ? "Yes" : "No"],
                ["Expose router 80/443", state.exposeIngress ? "Yes" : "No"],
                ["Expose NodePorts", state.exposeNodePorts ? "Yes" : "No"],
                ["Expose mDNS", state.exposeMdns ? "Yes" : "No"]
            ]
        },
        {
            title: "MicroShift configuration",
            rows: [
                ["Base domain", state.baseDomain.trim() || "Not set"],
                ["Hostname override", state.hostnameOverride.trim() || "Use target host hostname"],
                ["Node IP", state.nodeIP.trim() || "Auto-detect"],
                ["API subjectAltNames", splitList(state.subjectAltNames).join(", ") || "None"],
                ["Cluster network", splitList(state.clusterNetwork).join(", ") || "Not set"],
                ["Service network", splitList(state.serviceNetwork).join(", ") || "Not set"],
                ["NodePort range", state.serviceNodePortRange.trim() || "Not set"],
                ["Log level", state.logLevel || "Normal"]
            ]
        }
    ];

    if (state.targetPattern === "create-host") {
        groups.splice(1, 0, {
            title: "Local VM provisioning",
            rows: [
                ["VM name", state.vmName.trim() || "Not set"],
                ["Image source", state.imageSource === "download" ? "Download to Cockpit host" : "Use local image"],
                ["RHEL cloud image", state.imageSource === "download" ? (state.imageDownloadUrl.trim() || "Not set") : (state.baseImagePath.trim() || "Not set")],
                ["Cached image name", state.imageSource === "download" ? (state.imageCacheName.trim() || "Auto from URL") : "Not used"],
                ["Storage pool", state.storagePool || "Not set"],
                ["Bridge", state.bridgeName || "Not set"],
                ["Guest IP/CIDR", state.guestIpCidr.trim() || "Not set"],
                ["Guest gateway", state.guestGateway.trim() || "Not set"],
                ["Guest DNS servers", splitList(state.guestDnsServers).join(", ") || "Not set"],
                ["Guest sizing", String(parseInt(state.guestNodeVcpus, 10) || 0) + " vCPU / " + String(parseInt(state.guestNodeMemoryMb, 10) || 0) + " MiB / " + String(parseInt(state.guestDiskSizeGb, 10) || 0) + " GiB"],
                ["Performance domain", state.performanceDomain || "none"]
            ]
        });
    }
    if (state.packageAccessMode === "activation-key") {
        groups.splice(state.targetPattern === "create-host" ? 2 : 1, 0, {
            title: "Package access",
            rows: [
                ["Repository access model", "Automatic RHSM registration"],
                ["Organization ID", state.rhsmOrganizationId.trim() || "Not set"],
                ["Activation key", state.rhsmActivationKey.trim() ? "Provided" : "Not set"],
                ["Release lock", state.rhsmReleaseLock.trim() || "Not set"],
                ["Additional repositories", splitList(state.rhsmExtraRepositories).join(", ") || "None"]
            ]
        });
    }

    refs.reviewSections.innerHTML = "";
    groups.forEach(function (group) {
        var card = document.createElement("section");
        var title = document.createElement("h5");
        var list = document.createElement("dl");

        card.className = "review-group";
        title.className = "section-title section-title--small";
        title.textContent = group.title;
        list.className = "review-list review-list--compact";

        group.rows.forEach(function (row) {
            var dt = document.createElement("dt");
            var dd = document.createElement("dd");
            dt.textContent = row[0];
            dd.textContent = row[1];
            list.appendChild(dt);
            list.appendChild(dd);
        });

        card.appendChild(title);
        card.appendChild(list);
        refs.reviewSections.appendChild(card);
    });
}

function createLinkValue(url) {
    var link = document.createElement("a");
    link.className = "wizard-doc-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = url;
    return link;
}

function renderJob() {
    var stateData = state.job ? state.job.state || {} : {};
    var status = stateData.status || "";
    var summary;
    var logLines;

    if (!state.job) {
        refs.jobStatusSummary.textContent = state.transientStatusSummary || "No deployment has been started yet.";
        refs.jobCurrentTask.textContent = state.transientCurrentTask || "";
        refs.jobLog.textContent = state.clientLog.length ? state.clientLog.join("\n") : "No log output yet.";
        refs.installAccessList.innerHTML = "";
        refs.installAccessCard.hidden = true;
        return;
    }

    summary = "MicroShift deployment status: " + (status || "unknown");
    if (stateData.deploymentName) {
        summary += " for " + stateData.deploymentName;
    }

    refs.jobStatusSummary.textContent = summary;
    refs.jobCurrentTask.textContent = state.job.currentTask || "";
    logLines = [];
    if (state.clientLog.length) {
        logLines = logLines.concat(state.clientLog);
    }
    if (state.job.logTail && state.job.logTail.length) {
        logLines = logLines.concat(state.job.logTail);
    }
    refs.jobLog.textContent = logLines.length ? logLines.join("\n") : "No log output yet.";

    refs.installAccessList.innerHTML = "";
    if (stateData.installAccess) {
        [
            { label: "API endpoint", value: stateData.installAccess.apiEndpoint, link: true },
            { label: "Target host", value: stateData.installAccess.host || "Not available" },
            { label: "Kubeconfig", value: stateData.installAccess.kubeconfigPath || "Not available" },
            { label: "Remote kubeconfig", value: stateData.installAccess.remoteKubeconfigPath || "Not available" }
        ].forEach(function (row) {
            var dt = document.createElement("dt");
            var dd = document.createElement("dd");
            dt.textContent = row.label;
            if (row.link && row.value) {
                dd.appendChild(createLinkValue(row.value));
            } else {
                dd.textContent = row.value;
            }
            refs.installAccessList.appendChild(dt);
            refs.installAccessList.appendChild(dd);
        });
        refs.installAccessCard.hidden = false;
    } else {
        refs.installAccessCard.hidden = true;
    }
}

function renderArtifacts() {
    var artifact = currentArtifact();

    refs.artifactTabs.innerHTML = "";
    if (!state.artifacts.length) {
        refs.artifactEmpty.hidden = false;
        refs.artifactEditor.hidden = true;
        refs.artifactCopyButton.disabled = true;
        refs.artifactDownloadButton.disabled = true;
        return;
    }

    state.artifacts.forEach(function (entry) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "artifact-tab" + (entry.name === state.currentArtifactName ? " artifact-tab--active" : "");
        button.textContent = entry.name;
        button.addEventListener("click", function () {
            state.currentArtifactName = entry.name;
            renderArtifacts();
        });
        refs.artifactTabs.appendChild(button);
    });

    refs.artifactEmpty.hidden = true;
    refs.artifactEditor.hidden = false;
    refs.artifactCopyButton.disabled = false;
    refs.artifactDownloadButton.disabled = false;
    renderArtifactCode(artifact.content, artifact.name);
}

function renderFieldValidation() {
    [
        "deploymentName",
        "microshiftVersion",
        "hostAddress",
        "sshPort",
        "sshUser",
        "sshPrivateKeyFile",
        "vmName",
        "baseImagePath",
        "imageDownloadUrl",
        "storagePool",
        "bridgeName",
        "guestIpCidr",
        "guestGateway",
        "guestNodeVcpus",
        "guestNodeMemoryMb",
        "guestDiskSizeGb",
        "rhsmOrganizationId",
        "rhsmActivationKey",
        "pullSecretValue",
        "pullSecretFile",
        "baseDomain",
        "nodeIP",
        "clusterNetwork",
        "serviceNetwork",
        "serviceNodePortRange",
        "logLevel"
    ].forEach(function (field) {
        var fieldNode = refs[field + "Field"];
        var inputNode = refs[field];
        var invalid = !!state.fieldErrors[field];

        if (fieldNode) {
            fieldNode.classList.toggle("is-invalid", invalid);
        }
        if (inputNode) {
            inputNode.classList.toggle("is-invalid", invalid);
        }
    });
}

function renderValidationAlert() {
    var errors = currentStepErrors();
    refs.validationAlert.hidden = errors.length === 0;
    refs.validationAlertBody.textContent = refs.validationAlert.hidden
        ? ""
        : "The following fields are invalid or missing: " + errors.join(", ") + ".";
}

function renderPreflightAlert() {
    var jobStatus = state.job && state.job.state ? state.job.state.status : "";
    var suppress = !!jobStatus;
    var backendErrors = (state.backendErrors || []).filter(function (entry) {
        return String(entry || "").trim().length > 0;
    });

    refs.preflightAlert.hidden = state.currentStep !== 4 || suppress || backendErrors.length === 0;
    refs.preflightAlertBody.textContent = refs.preflightAlert.hidden
        ? ""
        : "The following checks failed or are incomplete: " + backendErrors.join(", ") + ".";
}

function renderProvisioningOptions() {
    refs.storagePool.innerHTML = state.availableStoragePools.map(function (pool) {
        var label = pool.displayName || pool.name;
        return '<option value="' + escapeHtml(pool.name) + '"' + (pool.supported ? "" : " disabled") + ">" + escapeHtml(label + (pool.supported ? "" : " (unsupported)")) + "</option>";
    }).join("");
    refs.bridgeName.innerHTML = state.availableBridges.map(function (bridge) {
        return '<option value="' + escapeHtml(bridge) + '">' + escapeHtml(bridge) + "</option>";
    }).join("");

    if (state.storagePool && state.availableStoragePools.some(function (pool) { return pool.name === state.storagePool; })) {
        refs.storagePool.value = state.storagePool;
    }
    if (state.bridgeName && state.availableBridges.some(function (bridge) { return bridge === state.bridgeName; })) {
        refs.bridgeName.value = state.bridgeName;
    }
}

function renderFooter() {
    var onFinalStep = state.currentStep === 4;
    var running = state.job && state.job.running;
    var status = state.job && state.job.state ? state.job.state.status : "";
    var stoppedOrComplete = status === "succeeded" || status === "failed" || status === "canceled";
    var canAdvance = currentStepErrors().length === 0;

    refs.backButton.hidden = state.currentStep === 1;
    refs.backButton.disabled = running;
    refs.nextButton.hidden = onFinalStep || !!running;
    refs.nextButton.disabled = !canAdvance || onFinalStep || !!running;
    refs.nextButton.style.display = onFinalStep || running ? "none" : "";
    refs.deployButton.hidden = !onFinalStep || !!running || status === "succeeded";
    refs.deployButton.disabled = !!running || status === "succeeded";
    refs.deployButton.style.display = !onFinalStep || running || status === "succeeded" ? "none" : "";
    refs.stopButton.hidden = !running;
    refs.stopButton.disabled = !running;
    refs.cancelButton.textContent = stoppedOrComplete ? "Done" : "Cancel";
    refs.cancelButton.disabled = running;
}

function revealBlockingState() {
    render();
    window.requestAnimationFrame(function () {
        if (!refs.validationAlert.hidden) {
            refs.validationAlert.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        if (!refs.preflightAlert.hidden) {
            refs.preflightAlert.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });
}

function renderYamlPane() {
    refs.wizardWorkspace.classList.toggle("wizard-workspace--yaml", state.yamlMode);
    refs.yamlPane.hidden = !state.yamlMode;
    refs.yamlDivider.hidden = !state.yamlMode;
    refs.wizardWorkspace.style.setProperty("--yaml-pane-width", clampYamlPaneWidth(state.yamlPaneWidth) + "px");
    refs.reviewYamlToggle.checked = state.yamlMode;
}

function render() {
    refs.deploymentName.value = state.deploymentName;
    refs.microshiftVersion.value = state.microshiftVersion;
    refs.hostAddress.value = state.hostAddress;
    refs.sshPort.value = String(state.sshPort);
    refs.sshUser.value = state.sshUser;
    refs.sshPrivateKeyFile.value = state.sshPrivateKeyFile;
    refs.vmName.value = state.vmName;
    refs.imageSourceLocal.checked = state.imageSource === "local";
    refs.imageSourceDownload.checked = state.imageSource === "download";
    refs.baseImagePath.value = state.baseImagePath;
    refs.imageDownloadUrl.value = state.imageDownloadUrl;
    refs.imageCacheName.value = state.imageCacheName;
    refs.guestIpCidr.value = state.guestIpCidr;
    refs.guestGateway.value = state.guestGateway;
    refs.guestDnsServers.value = state.guestDnsServers;
    refs.guestNodeVcpus.value = String(state.guestNodeVcpus);
    refs.guestNodeMemoryMb.value = String(state.guestNodeMemoryMb);
    refs.guestDiskSizeGb.value = String(state.guestDiskSizeGb);
    refs.performanceDomain.value = state.performanceDomain;
    refs.packageAccessPreconfigured.checked = state.packageAccessMode === "preconfigured";
    refs.packageAccessActivationKey.checked = state.packageAccessMode === "activation-key";
    refs.packageAccessActivationFields.hidden = state.packageAccessMode !== "activation-key";
    refs.rhsmOrganizationId.value = state.rhsmOrganizationId;
    refs.rhsmActivationKey.value = state.rhsmActivationKey;
    refs.rhsmReleaseLock.value = state.rhsmReleaseLock;
    refs.rhsmExtraRepositories.value = state.rhsmExtraRepositories;
    refs.pullSecretValue.value = state.pullSecretValue;
    refs.pullSecretFile.value = state.pullSecretFile;
    refs.manageFirewall.checked = state.manageFirewall;
    refs.exposeApiPort.checked = state.exposeApiPort;
    refs.exposeIngress.checked = state.exposeIngress;
    refs.exposeNodePorts.checked = state.exposeNodePorts;
    refs.exposeMdns.checked = state.exposeMdns;
    refs.baseDomain.value = state.baseDomain;
    refs.hostnameOverride.value = state.hostnameOverride;
    refs.nodeIP.value = state.nodeIP;
    refs.subjectAltNames.value = state.subjectAltNames;
    refs.clusterNetwork.value = state.clusterNetwork;
    refs.serviceNetwork.value = state.serviceNetwork;
    refs.serviceNodePortRange.value = state.serviceNodePortRange;
    refs.logLevel.value = state.logLevel;
    refs.wizardSummary.textContent = state.deploymentName.trim() || "New MicroShift deployment";
    refs.targetPatternExistingHost.checked = state.targetPattern === "existing-host";
    refs.targetPatternCreateHost.checked = state.targetPattern === "create-host";
    refs.existingHostFields.hidden = state.targetPattern !== "existing-host";
    refs.createHostFields.hidden = state.targetPattern !== "create-host";
    refs.localImageFields.hidden = state.imageSource !== "local";
    refs.downloadImageFields.hidden = state.imageSource !== "download";
    renderProvisioningOptions();

    renderStepList();
    renderPanels();
    renderReview();
    renderArtifacts();
    renderFieldValidation();
    renderValidationAlert();
    renderPreflightAlert();
    renderJob();
    renderFooter();
    renderYamlPane();
}

function stopPolling() {
    if (pollTimer) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function schedulePoll() {
    stopPolling();
    if (state.job && state.job.running) {
        pollTimer = window.setTimeout(refreshStatus, 5000);
    }
}

function setJobFromStatus(status) {
    if (!status.running && (!status.state || Object.keys(status.state).length === 0)) {
        state.job = null;
        return;
    }
    if (!statusRequestAppliesToPage(status)) {
        state.job = null;
        return;
    }
    clearStartResponseTimer();
    clearTransientStatus();
    state.job = {
        running: status.running,
        state: status.state || {},
        service: status.service || {},
        logTail: status.logTail || [],
        currentTask: status.currentTask || ""
    };
    if (status.request) {
        applyRequestToState(status.request);
    }
}

function refreshStatus() {
    return backendCommand("status").then(function (status) {
        setJobFromStatus(status);
        if (state.job) {
            state.currentStep = 4;
        }
        if (state.currentStep === 4 && (state.yamlMode || artifactLoadMode() === "current")) {
            loadArtifacts(artifactLoadMode(), true);
        }
        render();
        schedulePoll();
        return status;
    }).catch(function (error) {
        state.backendErrors = [String(error)];
        render();
        throw error;
    });
}

function refreshPreflight() {
    if (state.currentStep !== 4 || validateStep(4).length > 0) {
        return Promise.resolve();
    }
    return backendCommand("preflight", ["--payload-b64", encodePayload(payload())]).then(function (result) {
        state.backendErrors = result.ok ? [] : (result.errors || []);
        render();
        return result;
    }).catch(function (error) {
        state.backendErrors = [String(error)];
        render();
        throw error;
    });
}

function loadArtifacts(mode, silent) {
    var args = mode === "current"
        ? ["--current"]
        : ["--payload-b64", encodePayload(payload())];

    return backendCommand("artifacts", args).then(function (result) {
        if (!result.ok) {
            throw new Error((result.errors || ["Artifact generation failed"]).join(", "));
        }
        state.artifacts = result.artifacts || [];
        if (!state.currentArtifactName || !state.artifacts.some(function (artifact) { return artifact.name === state.currentArtifactName; })) {
            state.currentArtifactName = state.artifacts.length ? state.artifacts[0].name : "";
        }
        render();
        return result;
    }).catch(function (error) {
        state.artifacts = [];
        state.currentArtifactName = "";
        if (!silent) {
            state.backendErrors = [String(error)];
        }
        render();
        throw error;
    });
}

function scheduleArtifactPreviewRefresh(force) {
    var key;

    if (!force && (!state.yamlMode || state.currentStep !== 4)) {
        return;
    }

    key = artifactPreviewKey();
    if (!force && key === lastArtifactPreviewKey) {
        return;
    }
    lastArtifactPreviewKey = key;

    window.clearTimeout(artifactPreviewTimer);
    artifactPreviewTimer = window.setTimeout(function () {
        if (artifactLoadMode() === "current") {
            loadArtifacts("current", true);
        } else if (state.currentStep === 4) {
            loadArtifacts("payload", true);
        }
    }, 300);
}

function startYamlResize(event) {
    var startX;
    var startWidth;

    if (!state.yamlMode || window.innerWidth <= 960) {
        return;
    }

    startX = event.clientX;
    startWidth = clampYamlPaneWidth(state.yamlPaneWidth);

    function onMove(moveEvent) {
        state.yamlPaneWidth = clampYamlPaneWidth(startWidth - (moveEvent.clientX - startX));
        renderYamlPane();
    }

    function onUp() {
        document.body.classList.remove("is-resizing-yaml");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
    }

    event.preventDefault();
    document.body.classList.add("is-resizing-yaml");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
}

function goNext() {
    if (currentStepErrors().length > 0 || state.currentStep >= steps.length) {
        render();
        return;
    }
    state.currentStep += 1;
    clearBackendErrors();
    render();
    if (state.currentStep === 4) {
        refreshPreflight();
        scheduleArtifactPreviewRefresh(true);
    }
}

function goBack() {
    if (state.currentStep <= 1) {
        return;
    }
    state.currentStep -= 1;
    clearBackendErrors();
    render();
}

function startDeployment() {
    clearStartResponseTimer();
    appendClientLog("Install MicroShift clicked.");
    setTransientStatus("Validating the final deployment request.", "Checking the request before any VM or host action begins.");
    if (state.currentStep !== 4 || overallErrors().length > 0) {
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        appendClientLog("Install request blocked by validation or preflight errors.");
        setTransientStatus("Install MicroShift is blocked. Resolve the validation issues shown on this page.", "");
        revealBlockingState();
        return;
    }
    clearBackendErrors();
    appendClientLog("Submitting the deployment request to the privileged backend.");
    setTransientStatus("Submitting the deployment request.", "Waiting for the backend to accept the request and create runtime state.");
    startResponseTimer = window.setTimeout(function () {
        appendClientLog("Still waiting for the backend to accept the deployment request.");
        setTransientStatus("Still waiting for the backend response.", "No VM has been created yet.");
        render();
    }, 3000);
    render();
    backendCommand("start", ["--payload-b64", encodePayload(payload())]).then(function (result) {
        clearStartResponseTimer();
        if (!result.ok) {
            state.backendErrors = result.errors || ["MicroShift deployment start failed"];
            appendClientLog("Backend rejected the deployment request: " + state.backendErrors.join(", "));
            setTransientStatus("MicroShift deployment did not start.", "The backend rejected the request before any VM or install action began.");
            render();
            return;
        }
        state.currentStep = 4;
        appendClientLog("Backend accepted the deployment request" + (result.unitName ? " as unit " + result.unitName : "") + ".");
        setTransientStatus("The backend accepted the deployment request.", "Waiting for runtime state, VM creation activity, and backend execution logs.");
        render();
        waitForRuntimeState(10);
    }).catch(function (error) {
        clearStartResponseTimer();
        state.backendErrors = [String(error)];
        appendClientLog("Failed to submit the deployment request: " + String(error));
        setTransientStatus("MicroShift deployment failed to start.", "The frontend could not complete the backend start request.");
        render();
    });
}

function cancelDeployment() {
    backendCommand("cancel").then(function () {
        refreshStatus();
    }).catch(function (error) {
        state.backendErrors = [String(error)];
        render();
    });
}

function resetState() {
    var savedPools = state.availableStoragePools;
    var savedBridges = state.availableBridges;
    stopPolling();
    window.clearTimeout(artifactPreviewTimer);
    state = createInitialState();
    state.availableStoragePools = savedPools;
    state.availableBridges = savedBridges;
    if (!state.storagePool && savedPools.length) {
        state.storagePool = savedPools[0].name;
    }
    if (!state.bridgeName && savedBridges.length) {
        state.bridgeName = savedBridges[0];
    }
    render();
}

function copyCurrentArtifact() {
    var artifact = currentArtifact();
    if (!artifact) {
        return;
    }
    navigator.clipboard.writeText(artifact.content).catch(function () {});
}

function downloadCurrentArtifact() {
    var artifact = currentArtifact();
    var blob;
    var href;
    var link;

    if (!artifact) {
        return;
    }
    blob = new Blob([artifact.content], { type: artifact.contentType || "text/plain" });
    href = window.URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = href;
    link.download = artifact.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(href);
}

function bindText(input, key, parser) {
    input.addEventListener("input", function (event) {
        state[key] = parser ? parser(event.target.value) : event.target.value;
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
}

function bindCheckbox(input, key) {
    input.addEventListener("change", function (event) {
        state[key] = !!event.target.checked;
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
}

function loadOptions() {
    return backendCommand("options").then(function (result) {
        state.availableStoragePools = result.storagePools || [];
        state.availableBridges = result.bridges || [];
        if (!state.storagePool && result.defaults && result.defaults.storagePool) {
            state.storagePool = result.defaults.storagePool;
        }
        if (!state.bridgeName && result.defaults && result.defaults.bridgeName) {
            state.bridgeName = result.defaults.bridgeName;
        }
        if (!state.sshUser && result.defaults && result.defaults.sshUser) {
            state.sshUser = result.defaults.sshUser;
        }
        if (!state.pullSecretFile && result.defaults && result.defaults.pullSecretFile) {
            state.pullSecretFile = result.defaults.pullSecretFile;
        }
        render();
        return result;
    }).catch(function (error) {
        state.backendErrors = [String(error)];
        render();
        throw error;
    });
}

function loadClusterContext() {
    var clusterId = queryClusterId();

    if (!clusterId) {
        return Promise.resolve();
    }

    return backendCommand("clusters").then(function (result) {
        var cluster = (result.clusters || []).find(function (entry) {
            return entry.clusterId === clusterId;
        });
        if (cluster && cluster.request) {
            applyRequestToState(cluster.request);
            state.currentStep = 1;
            clearBackendErrors();
            render();
        }
    }).catch(function () {
        return Promise.resolve();
    });
}

function bindEvents() {
    bindText(refs.deploymentName, "deploymentName");
    bindText(refs.hostAddress, "hostAddress");
    bindText(refs.sshPort, "sshPort", function (value) { return parseInt(value, 10) || 0; });
    bindText(refs.sshUser, "sshUser");
    bindText(refs.sshPrivateKeyFile, "sshPrivateKeyFile");
    bindText(refs.vmName, "vmName");
    bindText(refs.imageDownloadUrl, "imageDownloadUrl");
    bindText(refs.imageCacheName, "imageCacheName");
    bindText(refs.baseImagePath, "baseImagePath");
    bindText(refs.guestIpCidr, "guestIpCidr");
    bindText(refs.guestGateway, "guestGateway");
    bindText(refs.guestDnsServers, "guestDnsServers");
    bindText(refs.guestNodeVcpus, "guestNodeVcpus", function (value) { return parseInt(value, 10) || 0; });
    bindText(refs.guestNodeMemoryMb, "guestNodeMemoryMb", function (value) { return parseInt(value, 10) || 0; });
    bindText(refs.guestDiskSizeGb, "guestDiskSizeGb", function (value) { return parseInt(value, 10) || 0; });
    bindText(refs.performanceDomain, "performanceDomain");
    bindText(refs.rhsmOrganizationId, "rhsmOrganizationId");
    bindText(refs.rhsmActivationKey, "rhsmActivationKey");
    bindText(refs.rhsmReleaseLock, "rhsmReleaseLock");
    bindText(refs.rhsmExtraRepositories, "rhsmExtraRepositories");
    bindText(refs.pullSecretValue, "pullSecretValue");
    bindText(refs.pullSecretFile, "pullSecretFile");
    bindText(refs.baseDomain, "baseDomain");
    bindText(refs.hostnameOverride, "hostnameOverride");
    bindText(refs.nodeIP, "nodeIP");
    bindText(refs.subjectAltNames, "subjectAltNames");
    bindText(refs.clusterNetwork, "clusterNetwork");
    bindText(refs.serviceNetwork, "serviceNetwork");
    bindText(refs.serviceNodePortRange, "serviceNodePortRange");

    refs.microshiftVersion.addEventListener("change", function (event) {
        state.microshiftVersion = event.target.value;
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });

    refs.logLevel.addEventListener("change", function (event) {
        state.logLevel = event.target.value;
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });

    bindCheckbox(refs.manageFirewall, "manageFirewall");
    bindCheckbox(refs.exposeApiPort, "exposeApiPort");
    bindCheckbox(refs.exposeIngress, "exposeIngress");
    bindCheckbox(refs.exposeNodePorts, "exposeNodePorts");
    bindCheckbox(refs.exposeMdns, "exposeMdns");

    refs.targetPatternExistingHost.addEventListener("change", function (event) {
        if (!event.target.checked) {
            return;
        }
        state.targetPattern = "existing-host";
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
    refs.targetPatternCreateHost.addEventListener("change", function (event) {
        if (!event.target.checked) {
            return;
        }
        state.targetPattern = "create-host";
        state.sshPort = 22;
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
    refs.imageSourceLocal.addEventListener("change", function (event) {
        if (!event.target.checked) {
            return;
        }
        state.imageSource = "local";
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
    refs.imageSourceDownload.addEventListener("change", function (event) {
        if (!event.target.checked) {
            return;
        }
        state.imageSource = "download";
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
    refs.storagePool.addEventListener("change", function (event) {
        state.storagePool = event.target.value;
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
    refs.bridgeName.addEventListener("change", function (event) {
        state.bridgeName = event.target.value;
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
    refs.packageAccessPreconfigured.addEventListener("change", function (event) {
        if (!event.target.checked) {
            return;
        }
        state.packageAccessMode = "preconfigured";
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });
    refs.packageAccessActivationKey.addEventListener("change", function (event) {
        if (!event.target.checked) {
            return;
        }
        state.packageAccessMode = "activation-key";
        clearBackendErrors();
        render();
        if (state.currentStep === 4) {
            refreshPreflight();
        }
        scheduleArtifactPreviewRefresh(true);
    });

    refs.backButton.addEventListener("click", goBack);
    refs.nextButton.addEventListener("click", goNext);
    refs.stopButton.addEventListener("click", cancelDeployment);
    refs.cancelButton.addEventListener("click", function () {
        if (state.job && state.job.running) {
            return;
        }
        resetState();
    });
    refs.reviewYamlToggle.addEventListener("change", function (event) {
        state.yamlMode = !!event.target.checked;
        render();
        if (state.yamlMode) {
            loadArtifacts(artifactLoadMode(), true);
        }
    });
    refs.yamlDivider.addEventListener("pointerdown", startYamlResize);
    refs.artifactCopyButton.addEventListener("click", copyCurrentArtifact);
    refs.artifactDownloadButton.addEventListener("click", downloadCurrentArtifact);
    document.addEventListener("click", function (event) {
        var deployTarget = event.target.closest("#deploy-button");
        if (!deployTarget) {
            return;
        }
        event.preventDefault();
        if (deployTarget.disabled || deployTarget.hidden) {
            setTransientStatus("Install MicroShift is currently unavailable.", "");
            render();
            return;
        }
        startDeployment();
    }, true);
}

function cacheRefs() {
    refs.wizardWorkspace = document.getElementById("wizard-workspace");
    refs.reviewYamlToggleWrap = document.getElementById("review-yaml-toggle-wrap");
    refs.reviewYamlToggle = document.getElementById("review-yaml-toggle");
    refs.wizardSummary = document.getElementById("wizard-summary");
    refs.yamlPane = document.getElementById("yaml-pane");
    refs.yamlDivider = document.getElementById("yaml-divider");
    refs.stepList = document.getElementById("step-list");
    refs.stepTitle = document.getElementById("step-title");
    refs.stepDescription = document.getElementById("step-description");
    refs.step1 = document.getElementById("step-1");
    refs.step2 = document.getElementById("step-2");
    refs.step3 = document.getElementById("step-3");
    refs.step4 = document.getElementById("step-4");
    refs.targetPatternExistingHost = document.getElementById("target-pattern-existing-host");
    refs.targetPatternCreateHost = document.getElementById("target-pattern-create-host");
    refs.existingHostFields = document.getElementById("existing-host-fields");
    refs.createHostFields = document.getElementById("create-host-fields");

    refs.deploymentNameField = document.getElementById("deployment-name-field");
    refs.deploymentName = document.getElementById("deployment-name");
    refs.microshiftVersionField = document.getElementById("microshift-version-field");
    refs.microshiftVersion = document.getElementById("microshift-version");
    refs.hostAddressField = document.getElementById("host-address-field");
    refs.hostAddress = document.getElementById("host-address");
    refs.sshPortField = document.getElementById("ssh-port-field");
    refs.sshPort = document.getElementById("ssh-port");
    refs.sshUserField = document.getElementById("ssh-user-field");
    refs.sshUser = document.getElementById("ssh-user");
    refs.sshPrivateKeyFileField = document.getElementById("ssh-private-key-file-field");
    refs.sshPrivateKeyFile = document.getElementById("ssh-private-key-file");
    refs.vmNameField = document.getElementById("vm-name-field");
    refs.vmName = document.getElementById("vm-name");
    refs.imageSourceLocal = document.getElementById("image-source-local");
    refs.imageSourceDownload = document.getElementById("image-source-download");
    refs.localImageFields = document.getElementById("local-image-fields");
    refs.downloadImageFields = document.getElementById("download-image-fields");
    refs.baseImagePathField = document.getElementById("base-image-path-field");
    refs.baseImagePath = document.getElementById("base-image-path");
    refs.imageDownloadUrlField = document.getElementById("image-download-url-field");
    refs.imageDownloadUrl = document.getElementById("image-download-url");
    refs.imageCacheNameField = document.getElementById("image-cache-name-field");
    refs.imageCacheName = document.getElementById("image-cache-name");
    refs.storagePoolField = document.getElementById("storage-pool-field");
    refs.storagePool = document.getElementById("storage-pool");
    refs.bridgeNameField = document.getElementById("bridge-name-field");
    refs.bridgeName = document.getElementById("bridge-name");
    refs.guestIpCidrField = document.getElementById("guest-ip-cidr-field");
    refs.guestIpCidr = document.getElementById("guest-ip-cidr");
    refs.guestGatewayField = document.getElementById("guest-gateway-field");
    refs.guestGateway = document.getElementById("guest-gateway");
    refs.guestDnsServersField = document.getElementById("guest-dns-servers-field");
    refs.guestDnsServers = document.getElementById("guest-dns-servers");
    refs.guestNodeVcpusField = document.getElementById("guest-node-vcpus-field");
    refs.guestNodeVcpus = document.getElementById("guest-node-vcpus");
    refs.guestNodeMemoryMbField = document.getElementById("guest-node-memory-mb-field");
    refs.guestNodeMemoryMb = document.getElementById("guest-node-memory-mb");
    refs.guestDiskSizeGbField = document.getElementById("guest-disk-size-gb-field");
    refs.guestDiskSizeGb = document.getElementById("guest-disk-size-gb");
    refs.performanceDomainField = document.getElementById("performance-domain-field");
    refs.performanceDomain = document.getElementById("performance-domain");
    refs.packageAccessModeField = document.getElementById("package-access-mode-field");
    refs.packageAccessPreconfigured = document.getElementById("package-access-preconfigured");
    refs.packageAccessActivationKey = document.getElementById("package-access-activation-key");
    refs.packageAccessActivationFields = document.getElementById("package-access-activation-fields");
    refs.rhsmOrganizationIdField = document.getElementById("rhsm-organization-id-field");
    refs.rhsmOrganizationId = document.getElementById("rhsm-organization-id");
    refs.rhsmActivationKeyField = document.getElementById("rhsm-activation-key-field");
    refs.rhsmActivationKey = document.getElementById("rhsm-activation-key");
    refs.rhsmReleaseLockField = document.getElementById("rhsm-release-lock-field");
    refs.rhsmReleaseLock = document.getElementById("rhsm-release-lock");
    refs.rhsmExtraRepositoriesField = document.getElementById("rhsm-extra-repositories-field");
    refs.rhsmExtraRepositories = document.getElementById("rhsm-extra-repositories");
    refs.pullSecretValueField = document.getElementById("pull-secret-value-field");
    refs.pullSecretValue = document.getElementById("pull-secret-value");
    refs.pullSecretFileField = document.getElementById("pull-secret-file-field");
    refs.pullSecretFile = document.getElementById("pull-secret-file");

    refs.manageFirewall = document.getElementById("manage-firewall");
    refs.exposeApiPort = document.getElementById("expose-api-port");
    refs.exposeIngress = document.getElementById("expose-ingress");
    refs.exposeNodePorts = document.getElementById("expose-nodeports");
    refs.exposeMdns = document.getElementById("expose-mdns");

    refs.baseDomainField = document.getElementById("base-domain-field");
    refs.baseDomain = document.getElementById("base-domain");
    refs.hostnameOverrideField = document.getElementById("hostname-override-field");
    refs.hostnameOverride = document.getElementById("hostname-override");
    refs.nodeIPField = document.getElementById("node-ip-field");
    refs.nodeIP = document.getElementById("node-ip");
    refs.subjectAltNames = document.getElementById("subject-alt-names");
    refs.clusterNetworkField = document.getElementById("cluster-network-field");
    refs.clusterNetwork = document.getElementById("cluster-network");
    refs.serviceNetworkField = document.getElementById("service-network-field");
    refs.serviceNetwork = document.getElementById("service-network");
    refs.serviceNodePortRangeField = document.getElementById("service-nodeport-range-field");
    refs.serviceNodePortRange = document.getElementById("service-nodeport-range");
    refs.logLevelField = document.getElementById("log-level-field");
    refs.logLevel = document.getElementById("log-level");

    refs.reviewSections = document.getElementById("review-sections");
    refs.preflightAlert = document.getElementById("preflight-alert");
    refs.preflightAlertBody = document.getElementById("preflight-alert-body");
    refs.jobStatusSummary = document.getElementById("job-status-summary");
    refs.jobCurrentTask = document.getElementById("job-current-task");
    refs.installAccessCard = document.getElementById("install-access-card");
    refs.installAccessList = document.getElementById("install-access-list");
    refs.jobLog = document.getElementById("job-log");

    refs.validationAlert = document.getElementById("validation-alert");
    refs.validationAlertBody = document.getElementById("validation-alert-body");

    refs.artifactTabs = document.getElementById("artifact-tabs");
    refs.artifactEmpty = document.getElementById("artifact-empty");
    refs.artifactEditor = document.getElementById("artifact-editor");
    refs.artifactLineNumbers = document.getElementById("artifact-line-numbers");
    refs.artifactContent = document.getElementById("artifact-content");
    refs.artifactCopyButton = document.getElementById("artifact-copy-button");
    refs.artifactDownloadButton = document.getElementById("artifact-download-button");

    refs.backButton = document.getElementById("back-button");
    refs.nextButton = document.getElementById("next-button");
    refs.deployButton = document.getElementById("deploy-button");
    refs.cancelButton = document.getElementById("cancel-button");
    refs.stopButton = document.getElementById("stop-button");
}

document.addEventListener("DOMContentLoaded", function () {
    cacheRefs();
    bindEvents();
    window.cockpitMicroshiftStart = startDeployment;
    render();
    loadOptions()
        .then(loadClusterContext)
        .then(refreshStatus)
        .catch(function () {});
});
