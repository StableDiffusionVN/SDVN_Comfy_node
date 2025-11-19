import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Dic Convert";

function findWidget(node, name) {
	if (!node?.widgets) return null;
	return node.widgets.find((widget) => widget.name === name) || null;
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

function openSettingDialog(state, title = "Dic Convert Settings") {
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
		dialog.style.minWidth = "360px";
		dialog.style.maxWidth = "80vw";
		dialog.style.padding = "0";
		dialog.style.overflow = "visible";
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
	const button = node.addWidget("button", "⚙ Settings", null, () => openSettingDialog(state), {
		serialize: false,
	});
	if (button) {
		button.__sdvnSettingTrigger = true;
		button.tooltip = "Open settings";
		state.settingButton = button;
	}
}

function setupDicConvert(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupDicConvert(node));
		return;
	}

	const settingWidget = findWidget(node, "setting");
	if (!settingWidget) return;

	const state = (node.__sdvnDicConvertState ||= {});
	state.settingWidget = settingWidget;

	hideSettingWidget(settingWidget);
	ensureSettingButton(node, state);
}

app.registerExtension({
	name: "SDVN.DicConvert",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE) return;

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupDicConvert(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			setupDicConvert(this);
			return result;
		};
	},
});
