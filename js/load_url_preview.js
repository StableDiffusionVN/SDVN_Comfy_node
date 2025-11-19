import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const PREVIEW_ENDPOINT = "/sdvn/load_image_preview";
const PREVIEW_NODE_PREFIX = "SDVN_URL_PREVIEW";
const NODE_CONFIG = {
	"SDVN Load Image": [
		{
			widget: "Url",
			watch: ["Load_url"],
			buildPayload(node, widget) {
				const url = sanitizeUrl(widget?.value);
				if (!url) {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				const loadWidget = findWidget(node, "Load_url");
				const enabled = typeof loadWidget?.value === "boolean" ? loadWidget.value : true;
				if (!enabled) {
					setWidgetStatus(widget, "Load_url is disabled. Enable it to show the preview.", "info");
					return null;
				}
				return { url };
			},
		},
	],
	"SDVN Load Image Url": [
		{
			widget: "Url",
			buildPayload(_node, widget) {
				const url = sanitizeUrl(widget?.value);
				if (!url) {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				return { url };
			},
		},
	],
	"SDVN Load Image Ultimate": [
		{
			widget: "url",
			watch: ["mode"],
			buildPayload(node, widget) {
				const mode = String(findWidget(node, "mode")?.value ?? "");
				if (mode !== "Url") {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				const url = sanitizeUrl(widget?.value);
				if (!url) {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				return { url };
			},
		},
		{
			widget: "insta_url",
			watch: ["mode", "index"],
			buildPayload(node, widget) {
				const mode = String(findWidget(node, "mode")?.value ?? "");
				if (mode !== "Insta") {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				const base = sanitizeUrl(widget?.value);
				if (!base) {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				const indexWidget = findWidget(node, "index");
				const rawIndex = indexWidget ? parseInt(indexWidget.value ?? 0, 10) : 0;
				const index = Number.isFinite(rawIndex) ? rawIndex : 0;
				return { url: `${base}--${index}` };
			},
		},
		{
			widget: "pin_url",
			watch: ["mode"],
			buildPayload(node, widget) {
				const mode = String(findWidget(node, "mode")?.value ?? "");
				if (mode !== "Pintrest") {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				const pinUrl = normalizePinterestPin(widget?.value);
				if (!pinUrl) {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				return { url: pinUrl };
			},
		},
	],
	"SDVN LoadPinterest": [
		{
			widget: "url",
			buildPayload(_node, widget) {
				const pinUrl = normalizePinterestPin(widget?.value);
				if (!pinUrl) {
					setWidgetStatus(widget, "", "info");
					return null;
				}
				return { url: pinUrl };
			},
		},
	],
};

const PreviewRunState = {
	targetNodeId: null,
};

const originalQueuePrompt = api.queuePrompt;
api.queuePrompt = async function (index, payload, ...args) {
	if (PreviewRunState.targetNodeId !== null) {
		const promptGraph = payload?.output ?? payload?.prompt;
		if (!promptGraph) {
			PreviewRunState.targetNodeId = null;
			return originalQueuePrompt.call(this, index, payload, ...args);
		}
		const targetId = String(PreviewRunState.targetNodeId);
		const trimmed = {};
		addNodeWithDependencies(targetId, promptGraph, trimmed);
		if (Object.keys(trimmed).length > 0) {
			const previewNodeId = generatePreviewNodeId(promptGraph);
			trimmed[previewNodeId] = createPreviewNodeEntry(targetId);
			if (payload.output) {
				payload.output = trimmed;
			} else {
				payload.prompt = trimmed;
			}
			payload = {
				...payload,
			};
		}
	}
	try {
		return await originalQueuePrompt.call(this, index, payload, ...args);
	} finally {
		PreviewRunState.targetNodeId = null;
	}
};

app.registerExtension({
	name: "SDVN.LoadUrlPreview",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		const baseConfigs = NODE_CONFIG[nodeData.name];
		if (!baseConfigs) {
			return;
		}

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const r = onNodeCreated?.apply(this, arguments);
			const configs = baseConfigs.map((cfg) => ({
				...cfg,
				watch: cfg.watch ? [...cfg.watch] : undefined,
			}));
			setupUrlPreview(this, configs, 0);
			return r;
		};

		const onExecuted = nodeType.prototype.onExecuted;
		nodeType.prototype.onExecuted = function () {
			const r = onExecuted?.apply(this, arguments);
			const state = getPreviewState(this);
			if (state) {
				state.pendingPayload = null;
				state.error = null;
			}
			return r;
		};
	},
});

function setupUrlPreview(node, configs, attempt = 0) {
	if (!node || node.__sdvnUrlPreviewReady) {
		return;
	}
	if ((!node.widgets || !node.widgets.length) && attempt < 5) {
		requestAnimationFrame(() => setupUrlPreview(node, configs, attempt + 1));
		return;
	}
	if (!node.widgets || !node.widgets.length) {
		return;
	}
	node.__sdvnUrlPreviewReady = true;
	configs.forEach((cfg) => {
		const widget = findWidget(node, cfg.widget);
		if (!widget) {
			return;
		}
		cfg.widgetRef = widget;
		const trigger = debounce(() => handlePreviewRequest(node, cfg), 500);
		cfg.trigger = trigger;
		ensureInput(widget, (input) => {
			const handler = () => trigger();
			input.addEventListener("input", handler);
			input.addEventListener("change", handler);
			input.addEventListener("blur", handler);
		});
		const originalCallback = widget.callback;
		widget.callback = function () {
			const result = originalCallback?.apply(this, arguments);
			trigger();
			return result;
		};
		if (Array.isArray(cfg.watch)) {
			cfg.watch.forEach((watchName) => attachWatcher(node, watchName, trigger));
		}
		trigger();
	});
}

function handlePreviewRequest(node, config) {
	const widget = config.widgetRef;
	if (!widget) {
		return;
	}
	const payload = config.buildPayload?.(node, widget, config);
	if (!payload || !payload.url) {
		clearPendingState(node, config);
		return;
	}
	requestPreview(node, config, payload);
}

async function requestPreview(node, config, payload) {
	const state = getPreviewState(node);
	const widget = config.widgetRef;
	const targetUrl = sanitizeUrl(payload.url);
	if (!targetUrl) {
		clearPendingState(node, config);
		return;
	}

	const payloadKey = JSON.stringify({ url: targetUrl });
	if (state.pendingPayload === payloadKey && !state.error) {
		return;
	}

	state.pendingPayload = payloadKey;
	state.error = null;
	state.requestId = (state.requestId ?? 0) + 1;
	const requestId = state.requestId;
	setWidgetStatus(widget, "Loading URL preview...", "info");

	try {
		const response = await api.fetchApi(PREVIEW_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: targetUrl }),
		});
		const data = await response.json();
		if (state.requestId !== requestId) {
			return;
		}
		if (!response.ok || data.status !== "ok" || !data.preview_url) {
			throw new Error(data?.message || response.statusText || "Preview request failed");
		}
		const dims = data.width && data.height ? ` (${data.width}x${data.height})` : "";
		setWidgetStatus(widget, `URL cached${dims}. Running node...`, "success");
		await runNodePreview(node);
		setWidgetStatus(widget, "Preview updated from node run.", "success");
	} catch (error) {
		if (state.requestId !== requestId) {
			return;
		}
		state.error = error?.message || "Unable to fetch preview";
		setWidgetStatus(widget, `Warning: ${state.error}`, "error");
		console.error("[SDVN] URL preview error:", error);
	}
}

function clearPendingState(node, config) {
	const state = getPreviewState(node);
	if (config?.widgetRef) {
		setWidgetStatus(config.widgetRef, "", "info");
	}
	state.pendingPayload = null;
	state.error = null;
}

function attachWatcher(node, widgetName, trigger) {
	const widget = findWidget(node, widgetName);
	if (!widget) {
		return;
	}
	const original = widget.callback;
	widget.callback = function () {
		const result = original?.apply(this, arguments);
		trigger();
		return result;
	};
	ensureInput(widget, (input) => {
		const handler = () => trigger();
		input.addEventListener("input", handler);
		input.addEventListener("change", handler);
	});
}

function getPreviewState(node) {
	if (!node.__sdvnPreviewState) {
		node.__sdvnPreviewState = {
			pendingPayload: null,
			requestId: 0,
			error: null,
			runningPreview: false,
		};
	}
	return node.__sdvnPreviewState;
}

function sanitizeUrl(value) {
	return String(value ?? "").trim();
}

async function runNodePreview(node) {
	if (!node) return;
	const state = getPreviewState(node);
	if (state.runningPreview) {
		return;
	}
	state.runningPreview = true;
	try {
		PreviewRunState.targetNodeId = node.id;
		await app.queuePrompt(0);
		return true;
	} catch (err) {
		throw err instanceof Error ? err : new Error("Failed to queue preview node");
	} finally {
		state.runningPreview = false;
		PreviewRunState.targetNodeId = null;
	}
}

function addNodeWithDependencies(nodeId, source, dest) {
	if (!source || dest[nodeId] || !source[nodeId]) {
		return;
	}
	dest[nodeId] = cloneNodeData(source[nodeId]);
	const inputs = dest[nodeId].inputs || {};
	Object.values(inputs).forEach((value) => addDependencyValue(value, source, dest));
}

function addDependencyValue(value, source, dest) {
	if (Array.isArray(value)) {
		if (value.length >= 2 && (typeof value[0] === "string" || typeof value[0] === "number")) {
			addNodeWithDependencies(String(value[0]), source, dest);
		} else {
			value.forEach((entry) => addDependencyValue(entry, source, dest));
		}
	} else if (value && typeof value === "object") {
		Object.values(value).forEach((entry) => addDependencyValue(entry, source, dest));
	}
}

function cloneNodeData(data) {
	if (typeof structuredClone === "function") {
		return structuredClone(data);
	}
	return JSON.parse(JSON.stringify(data));
}

function generatePreviewNodeId(source) {
	let base = Date.now();
	while (source[String(base)]) {
		base += 1;
	}
	return String(base);
}

function createPreviewNodeEntry(targetId) {
	return {
		class_type: "PreviewImage",
		inputs: {
			images: [targetId, 0],
			filename_prefix: PREVIEW_NODE_PREFIX,
		},
	};
}

function normalizePinterestPin(raw) {
	let value = sanitizeUrl(raw);
	if (!value || !value.includes("/pin/")) {
		return "";
	}
	if (!/^https?:\/\//i.test(value)) {
		value = value.startsWith("/") ? `https://www.pinterest.com${value}` : `https://www.pinterest.com/${value}`;
	}
	value = value.replace(/^http:\/\//i, "https://");
	if (!value.includes("pinterest.com")) {
		const prefix = value.startsWith("/") ? "" : "/";
		value = `https://www.pinterest.com${prefix}${value}`;
	}
	return value;
}

function findWidget(node, name) {
	if (!node?.widgets || !name) {
		return null;
	}
	return node.widgets.find((widget) => widget.name === name) ?? null;
}

function ensureInput(widget, cb) {
	if (!widget || typeof cb !== "function") {
		return;
	}
	if (widget.inputEl) {
		cb(widget.inputEl);
		return;
	}
	requestAnimationFrame(() => ensureInput(widget, cb));
}

function setWidgetStatus(widget, text, tone = "info") {
	if (!widget) {
		return;
	}
	ensureInput(widget, (input) => {
		let statusEl = widget.__sdvnPreviewStatusEl;
		if (!statusEl) {
			statusEl = document.createElement("div");
			statusEl.className = "sdvn-url-preview-status";
			statusEl.style.fontSize = "11px";
			statusEl.style.marginTop = "4px";
			statusEl.style.opacity = "0.8";
			statusEl.style.whiteSpace = "nowrap";
			statusEl.style.pointerEvents = "none";
			const container = input.closest?.(".comfy-control") ?? input.parentElement ?? input;
			container.appendChild(statusEl);
			widget.__sdvnPreviewStatusEl = statusEl;
		}
		if (!text) {
			statusEl.textContent = "";
			statusEl.style.display = "none";
			return;
		}
		statusEl.textContent = text;
		statusEl.style.display = "block";
		if (tone === "error") {
			statusEl.style.color = "#ff8a8a";
		} else if (tone === "success") {
			statusEl.style.color = "#9dffae";
		} else {
			statusEl.style.color = "#c8d4ff";
		}
	});
}

function debounce(fn, wait = 400) {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), wait);
	};
}
