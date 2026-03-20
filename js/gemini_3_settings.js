import { app } from "/scripts/app.js";

const STORAGE_KEYS = {
	gemini: "sdvn_api_key_gemini",
	openai: "sdvn_api_key_openai",
	huggingface: "sdvn_api_key_huggingface",
	deepseek: "sdvn_api_key_deepseek",
};

const API_LINKS = {
	gemini: "https://aistudio.google.com/apikey",
	openai: "https://platform.openai.com/settings/organization/api-keys",
	huggingface: "https://huggingface.co/settings/tokens",
	deepseek: "https://platform.deepseek.com/api_keys",
};

const TARGET_NODES = new Set([
	"SDVN API chatbot",
	"SDVN DALL-E Generate Image",
	"SDVN GPT Image",
	"SDVN Google Imagen",
	"SDVN Gemini Flash 2 Image",
	"SDVN Gemini 3 Pro Image",
	"SDVN Gemini 3.1 Flash Image",
	"SDVN Nano Banana",
]);

const NODE_CONFIG = {
	"SDVN API chatbot": {
		apiWidgetName: "APIkey",
		title: "API Key",
		description: "Nhập API key theo nhà cung cấp đang chọn ở node Chatbot.",
		resolveService(node) {
			const chatbotWidget = node.widgets?.find((w) => w.name === "chatbot");
			const value = chatbotWidget?.value ?? "";
			if (String(value).includes("HuggingFace")) return "huggingface";
			if (String(value).includes("OpenAI")) return "openai";
			if (String(value).includes("Deepseek")) return "deepseek";
			return "gemini";
		},
		serviceLabel(service) {
			return serviceName(service);
		},
	},
	"SDVN DALL-E Generate Image": {
		apiWidgetName: "OpenAI_API",
		service: "openai",
		title: "OpenAI API",
		description: "Nhập OpenAI API key dùng cho node DALL-E 3.",
	},
	"SDVN GPT Image": {
		apiWidgetName: "OpenAI_API",
		service: "openai",
		title: "OpenAI API",
		description: "Nhập OpenAI API key dùng cho node GPT Image.",
	},
	"SDVN Google Imagen": {
		apiWidgetName: "Gemini_API",
		service: "gemini",
		title: "Gemini API",
		description: "Nhập Gemini API key dùng cho node Google Imagen.",
	},
	"SDVN Gemini Flash 2 Image": {
		apiWidgetName: "Gemini_API",
		service: "gemini",
		title: "Gemini API",
		description: "Nhập Gemini API key dùng cho node Gemini Flash 2 Image.",
	},
	"SDVN Gemini 3 Pro Image": {
		apiWidgetName: "Gemini_API",
		service: "gemini",
		title: "Gemini API",
		description: "Nhập Gemini API key dùng cho node Gemini 3 Pro Image.",
	},
	"SDVN Gemini 3.1 Flash Image": {
		apiWidgetName: "Gemini_API",
		service: "gemini",
		title: "Gemini API",
		description: "Nhập Gemini API key dùng cho node Gemini 3.1 Flash Image.",
	},
	"SDVN Nano Banana": {
		apiWidgetName: "Gemini_API",
		service: "gemini",
		title: "Gemini API",
		description: "Nhập Gemini API key dùng cho node Nano Banana.",
	},
};

const MODEL_FLASH_VALUES = new Set(["gemini-2.5-flash-image", "Nano Banana"]);
const MODEL_PRO_VALUES = new Set(["gemini-3-pro-image-preview", "Nano Banana Pro"]);
const MODEL_FLASH_31_VALUES = new Set(["gemini-3.1-flash-image-preview", "Nano Banana 2"]);
const PRO_ASPECT_OPTIONS = ["Auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const FLASH_ASPECT_OPTIONS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const FLASH31_ASPECT_OPTIONS = ["Auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const PRO_RESOLUTION_OPTIONS = ["1K", "2K", "4K"];
const FLASH31_RESOLUTION_OPTIONS = ["0,5K", "1K", "2K", "4K"];

function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"']/g, (char) => {
		switch (char) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return char;
		}
	});
}

function serviceName(service) {
	switch (service) {
		case "openai":
			return "OpenAI";
		case "huggingface":
			return "HuggingFace";
		case "deepseek":
			return "Deepseek";
		default:
			return "Gemini";
	}
}

function hideWidget(widget) {
	if (!widget || widget.__sdvnHidden) return;
	widget.__sdvnHidden = true;
	let originalType = widget.type;
	const originalComputeSize = widget.computeSize;
	Object.defineProperty(widget, "type", {
		get() {
			return this.hidden ? "sdvnhide" : originalType;
		},
		set(value) {
			originalType = value;
		},
		configurable: true,
	});
	widget.computeSize = function (targetWidth) {
		if (this.hidden) return [0, -4];
		if (typeof originalComputeSize === "function") {
			return originalComputeSize.call(this, targetWidth);
		}
		return [targetWidth ?? 160, 24];
	};
	widget.hidden = true;
}

function injectToggleHidden(widget) {
	if (!widget || widget.__sdvnToggleHidden) return;
	widget.__sdvnToggleHidden = true;
	let originalType = widget.type;
	const originalComputeSize = widget.computeSize;
	Object.defineProperty(widget, "type", {
		get() {
			return this.hidden ? "sdvnhide" : originalType;
		},
		set(value) {
			originalType = value;
		},
		configurable: true,
	});
	widget.computeSize = function (targetWidth) {
		if (this.hidden) return [0, -4];
		if (typeof originalComputeSize === "function") {
			return originalComputeSize.call(this, targetWidth);
		}
		return [targetWidth ?? 160, 24];
	};
}

function setAspectOptions(aspectWidget, options, fallbackValue) {
	if (!aspectWidget) return;
	if (aspectWidget.options?.values) {
		aspectWidget.options.values = [...options];
	} else if (Array.isArray(aspectWidget.options)) {
		aspectWidget.options = [...options];
	}
	if (!options.includes(aspectWidget.value)) {
		aspectWidget.value = fallbackValue;
		aspectWidget.callback?.(aspectWidget.value);
	}
}

function setComboOptions(widget, options, fallbackValue) {
	if (!widget) return;
	if (widget.options?.values) {
		widget.options.values = [...options];
	} else if (Array.isArray(widget.options)) {
		widget.options = [...options];
	}
	if (!options.includes(widget.value)) {
		widget.value = fallbackValue;
		widget.callback?.(widget.value);
	}
}

function applyModelRules(node, state) {
	const modelWidget = state.modelWidget;
	const aspectWidget = state.aspectWidget;
	const resolutionWidget = state.resolutionWidget;
	if (!modelWidget || !aspectWidget || !resolutionWidget) return;

	const selectedModel = modelWidget.value;
	const isFlash = MODEL_FLASH_VALUES.has(selectedModel);
	const isFlash31 = MODEL_FLASH_31_VALUES.has(selectedModel);
	const isPro = MODEL_PRO_VALUES.has(selectedModel);
	if (isFlash) {
		setAspectOptions(aspectWidget, FLASH_ASPECT_OPTIONS, "1:1");
		resolutionWidget.hidden = true;
	} else if (isFlash31) {
		setAspectOptions(aspectWidget, FLASH31_ASPECT_OPTIONS, "Auto");
		setComboOptions(resolutionWidget, FLASH31_RESOLUTION_OPTIONS, "1K");
		resolutionWidget.hidden = false;
	} else if (isPro) {
		setAspectOptions(aspectWidget, PRO_ASPECT_OPTIONS, "Auto");
		setComboOptions(resolutionWidget, PRO_RESOLUTION_OPTIONS, "1K");
		resolutionWidget.hidden = false;
	} else {
		setAspectOptions(aspectWidget, PRO_ASPECT_OPTIONS, "Auto");
		setComboOptions(resolutionWidget, PRO_RESOLUTION_OPTIONS, "1K");
		resolutionWidget.hidden = false;
	}
	node.setDirtyCanvas(true, true);
}

function centerDialog(dialog) {
	if (!dialog || !dialog.style) return;
	dialog.style.position = "fixed";
	dialog.style.left = "50%";
	dialog.style.top = "50%";
	dialog.style.transform = "translate(-50%, -50%)";
	dialog.style.margin = "0";
}

function getNodeConfig(node) {
	return NODE_CONFIG[node?.comfyClass] ?? null;
}

function resolveService(node, state) {
	const config = getNodeConfig(node);
	if (!config) return "gemini";
	if (typeof config.resolveService === "function") {
		return config.resolveService(node, state);
	}
	return config.service ?? "gemini";
}

function getStorageKey(service) {
	return STORAGE_KEYS[service] ?? STORAGE_KEYS.gemini;
}

function getStoredValue(service) {
	try {
		return window.localStorage.getItem(getStorageKey(service)) ?? "";
	} catch (err) {
		console.warn("SDVN API settings: cannot access localStorage", err);
		return "";
	}
}

function setStoredValue(service, value) {
	try {
		window.localStorage.setItem(getStorageKey(service), value);
	} catch (err) {
		console.warn("SDVN API settings: cannot write localStorage", err);
	}
}

function setApiValue(apiWidget, value) {
	if (!apiWidget) return;
	apiWidget.value = value ?? "";
	apiWidget.callback?.(apiWidget.value);
}

function syncStoredValue(node, state) {
	const apiWidget = state.apiWidget;
	if (!apiWidget) return;
	const service = resolveService(node, state);
	const stored = getStoredValue(service);
	if (apiWidget.value !== stored) {
		setApiValue(apiWidget, stored);
	}
	state.updateButton?.();
}

function buildDialogContent(node, state, service) {
	const config = getNodeConfig(node);
	const label = config?.serviceLabel?.(service, node, state) ?? serviceName(service);
	const title = config?.title ?? `${label} API`;
	const description = config?.description ?? `Nhập API key dùng cho ${label}.`;
	const link = API_LINKS[service];

	return `
		<div style="
			min-width: 320px;
			max-width: 70vw;
			padding: 16px 18px;
			border-radius: 8px;
			background: rgba(20, 20, 20, 0.95);
			border: 1px solid rgba(255,255,255,0.08);
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
			font-family: 'Inter', 'Helvetica Neue', system-ui;
		">
			<div style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; margin-bottom: 8px;">
				<span>🔑</span>
				${escapeHtml(title)}
			</div>
			<div style="font-size: 12px; opacity: 0.78; margin-bottom: 6px;">
				${escapeHtml(description)}
			</div>
			<div style="font-size: 12px; opacity: 0.72; margin-bottom: 10px;">
				Provider hiện tại: <strong>${escapeHtml(label)}</strong>
			</div>
			<div>
				<input class="sdvn-api-input" type="password" placeholder="${escapeHtml(label)} API key" style="
					width: 100%;
					box-sizing: border-box;
					border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.15);
					background: rgba(255,255,255,0.04);
					color: #fff;
					padding: 10px 12px;
					font-size: 13px;
				" />
			</div>
			${link ? `<div style="font-size: 12px; opacity: 0.72; margin-top: 10px; word-break: break-all;">Get API: <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a></div>` : ""}
			<div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px;">
				<button class="comfy-btn comfy-btn-secondary sdvn-api-cancel">Cancel</button>
				<button class="comfy-btn comfy-btn-primary sdvn-api-save">Save</button>
			</div>
		</div>
	`;
}

function openApiDialog(node, state) {
	const apiWidget = state.apiWidget;
	if (!apiWidget || !app?.canvas?.createDialog) return;

	const service = resolveService(node, state);
	const cached = getStoredValue(service) || apiWidget.value || "";

	state.dialog?.close?.();
	const dialog = app.canvas.createDialog(buildDialogContent(node, state, service));
	centerDialog(dialog);

	const input = dialog.querySelector(".sdvn-api-input");
	if (input) {
		input.value = cached;
		setTimeout(() => input.focus(), 0);
	}

	const closeDialog = () => {
		dialog?.close?.();
		if (state.dialog === dialog) {
			state.dialog = null;
		}
	};

	const commitValue = () => {
		const newValue = input?.value?.trim() ?? "";
		setStoredValue(service, newValue);
		setApiValue(apiWidget, newValue);
		state.updateButton?.();
		closeDialog();
	};

	dialog.querySelector(".sdvn-api-save")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		commitValue();
	});
	dialog.querySelector(".sdvn-api-cancel")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		closeDialog();
	});

	input?.addEventListener("keydown", (event) => {
		if (!event) return;
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			closeDialog();
		} else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			commitValue();
		}
	});

	state.dialog = dialog;
}

function ensureButton(node, state) {
	if (state.button) return;
	const button = node.addWidget("button", "⚙ Settings", null, () => openApiDialog(node, state), {
		serialize: false,
	});
	if (!button) return;
	state.button = button;
	state.updateButton = () => {
		const service = resolveService(node, state);
		button.name = `⚙ ${serviceName(service)} Settings`;
		button.tooltip = `Mở hộp thoại nhập ${serviceName(service)} API key`;
		node.setDirtyCanvas(true, true);
	};
	state.updateButton();
}

function setupNanoBanana(node, state) {
	const modelWidget = node.widgets.find((w) => w.name === "model");
	const aspectWidget = node.widgets.find((w) => w.name === "aspect_ratio");
	const resolutionWidget = node.widgets.find((w) => w.name === "resolution");
	if (!modelWidget || !aspectWidget || !resolutionWidget) return;

	state.modelWidget = modelWidget;
	state.aspectWidget = aspectWidget;
	state.resolutionWidget = resolutionWidget;
	injectToggleHidden(resolutionWidget);
	if (!modelWidget.__sdvnModelPatched) {
		modelWidget.__sdvnModelPatched = true;
		const originalCallback = modelWidget.callback;
		modelWidget.callback = function () {
			const result = originalCallback?.apply(this, arguments);
			applyModelRules(node, state);
			return result;
		};
	}
	applyModelRules(node, state);
}

function setupChatbot(node, state) {
	const chatbotWidget = node.widgets.find((w) => w.name === "chatbot");
	if (!chatbotWidget || chatbotWidget.__sdvnApiPatched) return;

	chatbotWidget.__sdvnApiPatched = true;
	const originalCallback = chatbotWidget.callback;
	chatbotWidget.callback = function () {
		const result = originalCallback?.apply(this, arguments);
		syncStoredValue(node, state);
		return result;
	};
}

function setupNode(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupNode(node));
		return;
	}

	const config = getNodeConfig(node);
	if (!config) return;

	const apiWidget = node.widgets.find((w) => w.name === config.apiWidgetName);
	if (!apiWidget) return;

	const state = (node.__sdvnApiSettingsState ||= {});
	state.apiWidget = apiWidget;

	hideWidget(apiWidget);
	ensureButton(node, state);
	syncStoredValue(node, state);

	if (node.comfyClass === "SDVN API chatbot") {
		setupChatbot(node, state);
	}
	if (node.comfyClass === "SDVN Nano Banana") {
		setupNanoBanana(node, state);
	}
}

app.registerExtension({
	name: "SDVN.Api.Settings",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (!TARGET_NODES.has(nodeData?.name)) return;
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const res = onNodeCreated?.apply(this, arguments);
			setupNode(this);
			return res;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const res = onConfigure?.apply(this, arguments);
			setupNode(this);
			return res;
		};
	},
});
