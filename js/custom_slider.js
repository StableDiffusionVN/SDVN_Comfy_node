import { app } from "/scripts/app.js";

const SLIDER_CONFIG = {
	"SDVN Int Slider": {
		sliderName: "num",
		settingsName: "settings",
		defaults: { min: 0, max: 100, step: 1 },
		isFloat: false,
	},
	"SDVN Float Slider": {
		sliderName: "num",
		settingsName: "settings",
		defaults: { min: 0, max: 1, step: 0.01 },
		isFloat: true,
	},
};

function findWidget(node, name) {
	return node?.widgets?.find((widget) => widget.name === name) ?? null;
}

function centerDialog(dialog) {
	if (!dialog || !dialog.style) return;
	dialog.style.position = "fixed";
	dialog.style.left = "50%";
	dialog.style.top = "50%";
	dialog.style.transform = "translate(-50%, -50%)";
	dialog.style.margin = "0";
}

function hideSettingWidget(widget) {
	if (!widget || widget.__sdvnHidden) return;
	widget.__sdvnHidden = true;
	let originalType = widget.type;
	const originalCompute = widget.computeSize;
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
		if (typeof originalCompute === "function") {
			return originalCompute.call(this, targetWidth);
		}
		return [targetWidth ?? 100, 20];
	};
	widget.hidden = true;
}

function parseConfig(raw, defaults, isFloat) {
	const ensureNumber = (value, fallback) => {
		const num = typeof value === "number" ? value : parseFloat(value);
		return Number.isFinite(num) ? num : fallback;
	};
	let parsed = {};
	if (typeof raw === "string" && raw.trim().length) {
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			const parts = raw.split(/[,|]/).map((part) => part.trim()).filter(Boolean);
			if (parts.length >= 2) {
				parsed.min = parseFloat(parts[0]);
				parsed.max = parseFloat(parts[1]);
				if (parts[2]) parsed.step = parseFloat(parts[2]);
			}
		}
	} else if (typeof raw === "object" && raw !== null) {
		parsed = raw;
	}
	const config = {
		min: ensureNumber(parsed.min, defaults.min),
		max: ensureNumber(parsed.max, defaults.max),
		step: ensureNumber(parsed.step, defaults.step),
	};
	if (!isFloat) {
		config.min = Math.round(config.min);
		config.max = Math.round(config.max);
		config.step = Math.max(1, Math.round(config.step));
	} else {
		config.step = Math.abs(config.step) || defaults.step;
	}
	config.step = Math.max(Number.EPSILON, config.step);
	if (!(config.max > config.min)) {
		config.max = config.min + config.step;
	}
	return config;
}

function clampValue(value, { min, max }, isFloat) {
	let num = parseFloat(value);
	if (!Number.isFinite(num)) num = min;
	num = Math.min(max, Math.max(min, num));
	return isFloat ? num : Math.round(num);
}

function serializeConfig(config) {
	return JSON.stringify({
		min: config.min,
		max: config.max,
		step: config.step,
	});
}

function applyConfig(node, state, config) {
	const slider = state.sliderWidget;
	if (!slider) return;
	slider.options = slider.options ?? {};
	slider.options.min = config.min;
	slider.options.max = config.max;
	slider.options.step = config.step;
	const newValue = clampValue(slider.value, config, state.isFloat);
	if (newValue !== slider.value) {
		slider.value = newValue;
		slider.callback?.(newValue);
	}
	app.graph?.setDirtyCanvas?.(true, true);
	state.config = config;
}

function openSettingsDialog(node, state, title = "Slider Settings") {
	const sliderWidget = state.sliderWidget;
	const settingsWidget = state.settingsWidget;
	if (!sliderWidget || !settingsWidget || !app?.canvas?.createDialog) return;
	const config = state.config ?? state.defaults;
	state.dialog?.close?.();
	const dialog = app.canvas.createDialog(
		`
		<div class="sdvn-setting-dialog" style="
			min-width: 360px;
			max-width: 75vw;
			padding: 16px 18px;
			border-radius: 8px;
			background: rgba(20, 20, 20, 0.95);
			border: 1px solid rgba(255,255,255,0.08);
			box-shadow: 0 25px 70px rgba(0,0,0,0.55);
			font-family: 'Inter', 'Helvetica Neue', system-ui;
		">
			<div style="font-weight: 600; margin-bottom: 6px; font-size: 15px; display: flex; align-items: center; gap: 6px;">
				<span>⚙️</span>
				${title}
			</div>
			<div style="display: flex; flex-direction: column; gap: 10px; padding: 6px 0 0;">
				<label style="font-size: 12px; opacity: 0.85; display: flex; flex-direction: column; gap: 4px;">
					<span>Minimum value</span>
					<input type="number" class="sdvn-slider-config" data-field="min" value="${config.min}" style="padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: inherit;">
				</label>
				<label style="font-size: 12px; opacity: 0.85; display: flex; flex-direction: column; gap: 4px;">
					<span>Maximum value</span>
					<input type="number" class="sdvn-slider-config" data-field="max" value="${config.max}" style="padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: inherit;">
				</label>
				<label style="font-size: 12px; opacity: 0.85; display: flex; flex-direction: column; gap: 4px;">
					<span>Step</span>
					<input type="number" class="sdvn-slider-config" data-field="step" value="${config.step}" step="${state.isFloat ? 0.001 : 1}" style="padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: inherit;">
				</label>
			</div>
			<div style="color: rgba(255,255,255,0.75); font-size: 11px; margin-top: 10px;">Ctrl + Enter to save · Esc to close</div>
			<div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;">
				<button class="comfy-btn comfy-btn-secondary sdvn-slider-cancel">Cancel</button>
				<button class="comfy-btn comfy-btn-primary sdvn-slider-save">Save</button>
			</div>
		</div>
		`
	);

	centerDialog(dialog);
	if (dialog?.style) {
		dialog.style.resize = "both";
		dialog.style.overflow = "visible";
		dialog.style.minWidth = "320px";
		dialog.style.maxWidth = "80vw";
		dialog.style.padding = "0";
	}

	const closeDialog = () => {
		dialog?.close?.();
		if (state.dialog === dialog) state.dialog = null;
	};

	const getConfigFromInputs = () => {
		const inputs = dialog.querySelectorAll(".sdvn-slider-config");
		const data = { ...config };
		inputs.forEach((input) => {
			const field = input.dataset.field;
			if (!field) return;
			const value = parseFloat(input.value);
			if (Number.isFinite(value)) data[field] = value;
		});
		return data;
	};

	const commitValue = () => {
		const rawConfig = getConfigFromInputs();
		const sanitized = parseConfig(rawConfig, state.defaults, state.isFloat);
		const serialized = serializeConfig(sanitized);
		if (settingsWidget.value !== serialized) {
			settingsWidget.value = serialized;
			settingsWidget.callback?.(serialized);
		} else {
			applyConfig(node, state, sanitized);
		}
		closeDialog();
	};

	dialog.querySelector(".sdvn-slider-save")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		commitValue();
	});

	dialog.querySelector(".sdvn-slider-cancel")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		closeDialog();
	});

	dialog.addEventListener("keydown", (event) => {
		if (!event) return;
		if (event.key === "Escape") {
			event.preventDefault();
			closeDialog();
		} else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			commitValue();
		}
	});

	state.dialog = dialog;
}

function ensureButton(node, state) {
	if (state.button) return;
	const button = node.addWidget("button", "⚙ Settings", null, () => openSettingsDialog(node, state, `${node.title || "Slider"} Settings`), {
		serialize: false,
	});
	if (!button) return;
	button.tooltip = "Open settings";
	state.button = button;
}

function setupSlider(node, config) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupSlider(node, config));
		return;
	}
	const sliderWidget = findWidget(node, config.sliderName);
	const settingsWidget = findWidget(node, config.settingsName);
	if (!sliderWidget || !settingsWidget) return;
	const state = node.__sdvnCustomSliderState ??= {};
	state.sliderWidget = sliderWidget;
	state.settingsWidget = settingsWidget;
	state.defaults = { ...config.defaults };
	state.isFloat = !!config.isFloat;
	hideSettingWidget(settingsWidget);
	ensureButton(node, state);

	state.apply = () => {
		const parsed = parseConfig(settingsWidget.value ?? "", state.defaults, state.isFloat);
		const serialized = serializeConfig(parsed);
		if (settingsWidget.value !== serialized) {
			settingsWidget.value = serialized;
		}
		applyConfig(node, state, parsed);
	};
	state.apply();

	if (!state.listenerAttached) {
		state.listenerAttached = true;
		const original = settingsWidget.callback;
		settingsWidget.callback = function (...args) {
			const result = original?.apply(this, args);
			state.apply?.();
			return result;
		};
	}
}

app.registerExtension({
	name: "SDVN.CustomSlider",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		const config = SLIDER_CONFIG[nodeData?.name];
		if (!config) return;
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupSlider(this, config);
			return result;
		};
		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			setupSlider(this, config);
			return result;
		};
	},
});
