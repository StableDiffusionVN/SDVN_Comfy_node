import { app } from "/scripts/app.js";

const TARGET_NODES = new Set(["SDVN Gemini 3 Pro Image", "SDVN Nano Banana"]);
const API_WIDGET_NAME = "Gemini_API";
const STORAGE_KEY = "sdvn_gemini3_api_key";
const MODEL_FLASH_VALUES = new Set(["gemini-2.5-flash-image", "Nano Banana"]);
const MODEL_PRO_VALUES = new Set(["gemini-3-pro-image-preview", "Nano Banana Pro"]);
const MODEL_FLASH_31_VALUES = new Set(["gemini-3.1-flash-image-preview", "Nano Banana 2"]);
const PRO_ASPECT_OPTIONS = ["Auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const FLASH_ASPECT_OPTIONS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const FLASH31_ASPECT_OPTIONS = ["Auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const PRO_RESOLUTION_OPTIONS = ["1K", "2K", "4K"];
const FLASH31_RESOLUTION_OPTIONS = ["0,5K", "1K", "2K", "4K"];

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
		// Fallback: treat unknown values as Pro-like behavior.
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

function setApiValue(apiWidget, value) {
	if (!apiWidget) return;
	apiWidget.value = value ?? "";
	apiWidget.callback?.(apiWidget.value);
}

function applyStoredValue(apiWidget) {
	if (!apiWidget) return;
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored && apiWidget.value !== stored) {
			setApiValue(apiWidget, stored);
		}
	} catch (err) {
		console.warn("SDVN Gemini 3 Pro Image: cannot access localStorage", err);
	}
}

function openApiDialog(node, state) {
	const apiWidget = state.apiWidget;
	if (!apiWidget || !app?.canvas?.createDialog) return;

	let cached = "";
	try {
		cached = window.localStorage.getItem(STORAGE_KEY) ?? apiWidget.value ?? "";
	} catch {
		cached = apiWidget.value ?? "";
	}

	state.dialog?.close?.();
	const dialog = app.canvas.createDialog(
		`
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
				Gemini 3 Pro API
			</div>
			<div style="font-size: 12px; opacity: 0.78; margin-bottom: 10px;">
				Nhập API key dùng cho node Gemini 3 Pro Image.
			</div>
			<div>
				<input class="sdvn-gemini3-input" type="password" placeholder="Gemini API key" style="
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
			<div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px;">
				<button class="comfy-btn comfy-btn-secondary sdvn-gemini3-cancel">Cancel</button>
				<button class="comfy-btn comfy-btn-primary sdvn-gemini3-save">Save</button>
			</div>
		</div>
	`
	);

	centerDialog(dialog);
	const input = dialog.querySelector(".sdvn-gemini3-input");
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
		if (!input) {
			closeDialog();
			return;
		}
		const newValue = input.value?.trim() ?? "";
		try {
			window.localStorage.setItem(STORAGE_KEY, newValue);
		} catch (err) {
			console.warn("SDVN Gemini 3 Pro Image: cannot write localStorage", err);
		}
		setApiValue(apiWidget, newValue);
		state.updateButton?.();
		closeDialog();
	};

	dialog.querySelector(".sdvn-gemini3-save")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		commitValue();
	});
	dialog.querySelector(".sdvn-gemini3-cancel")?.addEventListener("click", (event) => {
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
	button.tooltip = "Mở hộp thoại nhập Gemini API key";
}

function setupNode(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupNode(node));
		return;
	}
	const apiWidget = node.widgets.find((w) => w.name === API_WIDGET_NAME);
	if (!apiWidget) return;

	const state = (node.__sdvnGemini3State ||= {});
	state.apiWidget = apiWidget;

	hideWidget(apiWidget);
	applyStoredValue(apiWidget);
	ensureButton(node, state);

	if (node.comfyClass === "SDVN Nano Banana") {
		const modelWidget = node.widgets.find((w) => w.name === "model");
		const aspectWidget = node.widgets.find((w) => w.name === "aspect_ratio");
		const resolutionWidget = node.widgets.find((w) => w.name === "resolution");
		if (modelWidget && aspectWidget && resolutionWidget) {
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
	}
}

app.registerExtension({
	name: "SDVN.Gemini3ProImage.Settings",
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
