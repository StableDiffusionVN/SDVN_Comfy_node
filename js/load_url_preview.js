import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const PREVIEW_ENDPOINT = "/sdvn/load_image_preview";
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
		const finalUrl = sanitizeUrl(data.preview_url);
		if (!finalUrl) {
			throw new Error("Preview URL missing from response");
		}
		const dims = data.width && data.height ? ` (${data.width}x${data.height})` : "";
		updateWidgetPreview(widget, {
			url: finalUrl,
			width: data.width,
			height: data.height,
			resolved: data.resolved,
			isRemote: Boolean(data.is_remote),
		});
		updateNodePreviewImage(node, finalUrl);
		setWidgetStatus(widget, `URL preview updated${dims}.`, "success");
		state.pendingPayload = null;
		state.error = null;
	} catch (error) {
		if (state.requestId !== requestId) {
			return;
		}
		state.error = error?.message || "Unable to fetch preview";
		state.pendingPayload = null;
		clearWidgetPreview(widget);
		setWidgetStatus(widget, `Warning: ${state.error}`, "error");
		console.error("[SDVN] URL preview error:", error);
	}
}

function clearPendingState(node, config) {
	const state = getPreviewState(node);
	if (config?.widgetRef) {
		setWidgetStatus(config.widgetRef, "", "info");
		clearWidgetPreview(config.widgetRef);
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
		};
	}
	return node.__sdvnPreviewState;
}

function sanitizeUrl(value) {
	return String(value ?? "").trim();
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

function updateWidgetPreview(widget, data = {}) {
	if (!widget) {
		return;
	}
	const previewUrl = sanitizeUrl(data.url ?? data.preview_url ?? "");
	if (!previewUrl) {
		clearWidgetPreview(widget);
		return;
	}
	ensureInput(widget, (input) => {
		let container = widget.__sdvnPreviewContainer;
		if (!container) {
			container = document.createElement("div");
			container.className = "sdvn-url-preview-container";
			container.style.marginTop = "6px";
			container.style.border = "1px solid rgba(255, 255, 255, 0.1)";
			container.style.borderRadius = "6px";
			container.style.padding = "6px";
			container.style.background = "rgba(0, 0, 0, 0.35)";
			container.style.display = "flex";
			container.style.flexDirection = "column";
			container.style.gap = "4px";
			container.style.maxWidth = "240px";
			container.style.cursor = "pointer";
			container.title = "Click to open preview in a new tab";
			const mountPoint = input.closest?.(".comfy-control") ?? input.parentElement ?? input;
			mountPoint.appendChild(container);
			container.addEventListener("click", (event) => {
				event.stopPropagation();
				const target = widget.__sdvnPreviewSrc;
				if (target) {
					window.open(target, "_blank", "noopener");
				}
			});
			widget.__sdvnPreviewContainer = container;
		}
		container.style.display = "flex";

		let img = widget.__sdvnPreviewImg;
		if (!img) {
			img = document.createElement("img");
			img.style.width = "100%";
			img.style.maxHeight = "140px";
			img.style.objectFit = "contain";
			img.style.borderRadius = "4px";
			img.loading = "lazy";
			widget.__sdvnPreviewImg = img;
			container.appendChild(img);
		}

		let caption = widget.__sdvnPreviewCaption;
		if (!caption) {
			caption = document.createElement("div");
			caption.className = "sdvn-url-preview-caption";
			caption.style.fontSize = "11px";
			caption.style.opacity = "0.75";
			widget.__sdvnPreviewCaption = caption;
			container.appendChild(caption);
		}

		if (widget.__sdvnPreviewSrc !== previewUrl) {
			widget.__sdvnPreviewSrc = previewUrl;
			img.src = previewUrl;
		}
		const dims = data.width && data.height ? ` ${data.width}x${data.height}` : "";
		const sourceLabel = data.isRemote ? "Remote preview" : "Cached preview";
		caption.textContent = `${sourceLabel}${dims}`;
		if (data.resolved) {
			caption.title = data.resolved;
		}
	});
}

function updateNodePreviewImage(node, previewUrl) {
	if (!node || !previewUrl) {
		return;
	}
	const img = new Image();
	img.crossOrigin = "anonymous";
	img.onload = () => {
		if (!node.imgs) {
			node.imgs = [];
		}
		node.imgs.length = 0;
		node.imgs.push(img);
		if (typeof node.setDirtyCanvas === "function") {
			node.setDirtyCanvas(true, true);
		}
	};
	img.onerror = () => {
		console.warn("[SDVN] Unable to load preview image for node", previewUrl);
	};
	img.src = previewUrl;
}

function clearWidgetPreview(widget) {
	if (!widget) {
		return;
	}
	const container = widget.__sdvnPreviewContainer;
	if (container) {
		container.style.display = "none";
	}
	if (widget.__sdvnPreviewImg) {
		widget.__sdvnPreviewImg.src = "";
	}
	widget.__sdvnPreviewSrc = "";
	const caption = widget.__sdvnPreviewCaption;
	if (caption) {
		caption.textContent = "";
	}
}

function debounce(fn, wait = 400) {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), wait);
	};
}
