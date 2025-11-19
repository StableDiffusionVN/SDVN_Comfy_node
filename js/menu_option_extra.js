import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Menu Option Extra";
const DEFAULT_MENU_OPTIONS = ["Option_1", "Option_2", "Option_3", "Option_4", "Option_5", "Option_6", "Option_7", "Option_8"];
const DEFAULT_SUB_OPTIONS = ["Sub_1", "Sub_2", "Sub_3", "Sub_4", "Sub_5"];

function findWidget(node, name) {
	if (!node?.widgets) return null;
	return node.widgets.find((widget) => widget.name === name) || null;
}

function ensureInput(widget, cb) {
	if (!widget || widget.__sdvnPopupSetting) return;
	if (widget.inputEl) {
		cb(widget.inputEl);
		return;
	}
	requestAnimationFrame(() => ensureInput(widget, cb));
}

function ensureValuesArray(widget, fallbackFactory) {
	if (widget.options?.values) {
		return widget.options.values;
	}
	const values = fallbackFactory ? fallbackFactory() : [];
	widget.options = { ...(widget.options ?? {}), values };
	return widget.options.values;
}

function parseSetting(text) {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (!lines.length) {
		return [{ label: DEFAULT_MENU_OPTIONS[0], values: DEFAULT_SUB_OPTIONS.slice() }];
	}

	return lines.map((line, idx) => {
		const [rawName, ...restParts] = line.split(":");
		const rest = restParts.join(":");
		const label = (rawName ?? "").trim() || DEFAULT_MENU_OPTIONS[idx] || `Option_${idx + 1}`;
		const values = rest
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean);
		return {
			label,
			values: values.length ? values : [label],
		};
	});
}

function hideSettingWidget(widget) {
	if (!widget || widget.__sdvnPopupSetting) return;
	widget.__sdvnPopupSetting = true;
	let originalType = widget.type;
	const originalCompute = widget.computeSize;
	Object.defineProperty(widget, "type", {
		get() {
			return this.hidden ? "sdvnhide" : originalType;
		},
		set(val) {
			originalType = val;
		},
		configurable: true,
	});
	widget.computeSize = function (target_width) {
		if (this.hidden) return [0, -4];
		if (typeof originalCompute === "function") {
			return originalCompute.call(this, target_width);
		}
		return [target_width ?? 100, 20];
	};
	widget.hidden = true;
}

function centerDialog(dialog) {
	if (!dialog || !dialog.style) return;
	dialog.style.position = "fixed";
	dialog.style.left = "50%";
	dialog.style.top = "50%";
	dialog.style.transform = "translate(-50%, -50%)";
	dialog.style.margin = "0";
}

function openSettingDialog(node, state, title = "Menu Option Extra Settings") {
	const settingWidget = state.settingWidget;
	if (!settingWidget || !app?.canvas?.createDialog) return;

	state.settingDialog?.close?.();
	const dialog = app.canvas.createDialog(
		`
		<div class="sdvn-setting-dialog" style="
			min-width: 360px;
			max-width: 75vw;
			padding: 16px 18px;
			border-radius: 8px;
			background: rgba(20, 20, 20, 0.95);
			border: 1px solid rgba(255,255,255,0.08);
			box-shadow: 0 25px 70px rgba(0, 0, 0, 0.55);
			resize: horizontal;
			overflow: hidden;
			">
			<div style="font-weight: 600; margin-bottom: 6px; font-size: 15px;">${title}</div>
			<textarea class="sdvn-setting-dialog__input" spellcheck="false" style="
				width: 100%;
				min-height: 220px;
				border-radius: 6px;
				border: 1px solid rgba(255,255,255,0.15);
				background: rgba(255,255,255,0.02);
				color: #fff;
				padding: 10px 12px;
				resize: vertical;
			"></textarea>
			<div style="font-size: 11px; margin-top: 6px; opacity: 0.75;">Ctrl + Enter to save • Esc to close</div>
			<div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
				<button class="comfy-btn comfy-btn-secondary sdvn-setting-cancel">Cancel</button>
				<button class="comfy-btn comfy-btn-primary sdvn-setting-save">Save</button>
			</div>
		</div>
	`
	);
	centerDialog(dialog);
	if (dialog?.style) {
		dialog.style.resize = "both";
		dialog.style.overflow = "visible";
		dialog.style.minWidth = "360px";
		dialog.style.maxWidth = "80vw";
		dialog.style.padding = "0";
	}
	const textarea = dialog.querySelector("textarea");
	if (textarea) {
		textarea.value = (settingWidget.value ?? "").toString();
	}

	const closeDialog = () => {
		dialog.close?.();
		if (state.settingDialog === dialog) {
			state.settingDialog = null;
		}
	};

	const commitValue = () => {
		if (!textarea) {
			closeDialog();
			return;
		}
		const newValue = textarea.value ?? "";
		if (settingWidget.value !== newValue) {
			settingWidget.value = newValue;
			settingWidget.callback?.(newValue);
		} else {
			state.apply?.();
		}
		closeDialog();
	};

	dialog.querySelector(".sdvn-setting-save")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		commitValue();
	});
	dialog.querySelector(".sdvn-setting-cancel")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		closeDialog();
	});

	textarea?.addEventListener("keydown", (event) => {
		if (!event) return;
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			closeDialog();
		} else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			commitValue();
		}
	});

	setTimeout(() => textarea?.focus(), 0);
	state.settingDialog = dialog;
}

function ensureSettingButton(node, state) {
	if (!node?.addWidget || state.settingButton) return;
	const button = node.addWidget("button", "⚙ Settings", null, () => openSettingDialog(node, state, "Menu Option Extra Settings"), {
		serialize: false,
	});
	if (button) {
		button.__sdvnSettingTrigger = true;
		button.tooltip = "Open settings";
		state.settingButton = button;
	}
}

function setupMenuOptionExtra(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupMenuOptionExtra(node));
		return;
	}

	const menuWidget = findWidget(node, "Menu");
	const subMenuWidget = findWidget(node, "Sub_Menu");
	const settingWidget = findWidget(node, "Setting");
	if (!menuWidget || !subMenuWidget || !settingWidget) return;

	const state = (node.__sdvnMenuOptionExtraState ||= {});
	state.menuWidget = menuWidget;
	state.subMenuWidget = subMenuWidget;
	state.settingWidget = settingWidget;
	hideSettingWidget(settingWidget);
	ensureSettingButton(node, state);

	state.updateSubMenu = () => {
		const entries = state.entries ?? [];
		const fallbackEntry = entries[0] ?? { values: DEFAULT_SUB_OPTIONS.slice() };
		const activeEntry = entries.find((entry) => entry.label === menuWidget.value) || fallbackEntry;
		const sourceValues =
			(activeEntry.values && activeEntry.values.length && activeEntry.values) ||
			(fallbackEntry.values && fallbackEntry.values.length && fallbackEntry.values) ||
			DEFAULT_SUB_OPTIONS;
		const options = ensureValuesArray(subMenuWidget, () => DEFAULT_SUB_OPTIONS.slice());
		options.length = 0;
		options.push(...(Array.isArray(sourceValues) && sourceValues.length ? [...sourceValues] : DEFAULT_SUB_OPTIONS.slice()));
		if (!options.includes(subMenuWidget.value)) {
			subMenuWidget.value = options[0] ?? subMenuWidget.value;
		}
		app.graph?.setDirtyCanvas?.(true, true);
	};

	state.apply = () => {
		const raw = (settingWidget.value ?? "").toString();
		const parsed = parseSetting(raw);
		state.entries = parsed;
		const menuOptions = ensureValuesArray(menuWidget, () => DEFAULT_MENU_OPTIONS.slice());
		const labels = parsed.map((entry) => entry.label);
		const values = labels.length ? labels : DEFAULT_MENU_OPTIONS.slice();
		menuOptions.length = 0;
		menuOptions.push(...values);
		if (!menuOptions.includes(menuWidget.value)) {
			menuWidget.value = menuOptions[0] ?? menuWidget.value;
		}
		state.updateSubMenu?.();
	};

	if (!state.settingListenerAttached) {
		state.settingListenerAttached = true;
		ensureInput(settingWidget, (input) => {
			input.addEventListener("input", () => state.apply?.());
		});
		const originalSettingCallback = settingWidget.callback;
		settingWidget.callback = function (...args) {
			const result = originalSettingCallback?.apply(this, args);
			state.apply?.();
			return result;
		};
	}

	if (!state.menuListenerAttached) {
		state.menuListenerAttached = true;
		const originalMenuCallback = menuWidget.callback;
		menuWidget.callback = function (...args) {
			const result = originalMenuCallback?.apply(this, args);
			state.updateSubMenu?.();
			return result;
		};
	}

	requestAnimationFrame(() => state.apply?.());
}

app.registerExtension({
	name: "SDVN.MenuOptionExtra",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE) return;

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupMenuOptionExtra(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			setupMenuOptionExtra(this);
			return result;
		};
	},
});
