import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Run Python Code";
const FUNCTION_WIDGET_NAME = "function";

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

function summarizeFunction(code = "") {
	return (
		code
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.startsWith("def ")) ||
			"def function(...):"
	);
}

function centerDialog(dialog) {
	if (!dialog || !dialog.style) return;
	dialog.style.position = "fixed";
	dialog.style.left = "50%";
	dialog.style.top = "50%";
	dialog.style.transform = "translate(-50%, -50%)";
	dialog.style.margin = "0";
}

function openFunctionDialog(node, state) {
	const targetWidget = state.functionWidget;
	if (!targetWidget || !app?.canvas?.createDialog) return;

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
			box-shadow: 0 25px 70px rgba(0, 0, 0, 0.55);
			font-family: 'Inter', 'Helvetica Neue', system-ui;
			resize: horizontal;
			overflow: hidden;
		">
			<div style="padding: 0 0 6px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 6px;">
				<span>⚙️</span>
				Python Function Settings
			</div>
			<div style="padding: 0 0 12px; font-size: 12px; opacity: 0.75;">
				Enter or edit your Python function.
			</div>
			<div style="padding: 0;">
				<textarea class="sdvn-setting-dialog__input sdvn-python-textarea" spellcheck="false" style="
					width: 100%;
					min-height: 260px;
					border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.15);
					background: rgba(0,0,0,0.35);
					color: #fff;
					padding: 12px 14px;
					resize: vertical;
					font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
					font-size: 13px;
				"></textarea>
			</div>
			<div style="padding: 8px 0 0; font-size: 11px; opacity: 0.75;">
				Ctrl + Enter to save • Esc to close • Tab / Shift+Tab to adjust indent
			</div>
			<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0 16px; font-size: 11px; opacity: 0.65;">
				<span>${summarizeFunction(targetWidget.value)}</span>
				<span>Tip: pass dict/list to auto unpack.</span>
			</div>
			<div style="display: flex; justify-content: flex-end; gap: 8px; padding: 0 0 16px;">
				<button class="comfy-btn comfy-btn-secondary sdvn-python-cancel">Cancel</button>
				<button class="comfy-btn comfy-btn-primary sdvn-python-save">Save</button>
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
		textarea.value = (targetWidget.value ?? "").toString();
		setTimeout(() => textarea.focus(), 0);
	}

	const closeDialog = () => {
		dialog?.close?.();
		if (state.dialog === dialog) {
			state.dialog = null;
		}
	};

	const commitValue = () => {
		if (!textarea) return closeDialog();
		const newValue = textarea.value ?? "";
		if (newValue !== targetWidget.value) {
			targetWidget.value = newValue;
			targetWidget.callback?.(newValue);
		}
		closeDialog();
	};

	dialog.querySelector(".sdvn-python-save")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		commitValue();
	});

	dialog.querySelector(".sdvn-python-cancel")?.addEventListener("click", (event) => {
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
		} else if (event.key === "Tab") {
			event.preventDefault();
			const indent = "    ";
			const start = textarea.selectionStart ?? 0;
			const end = textarea.selectionEnd ?? start;
			const value = textarea.value ?? "";
			if (event.shiftKey) {
				const lineStart = value.lastIndexOf("\n", start - 1) + 1;
				const before = value.slice(lineStart, start);
				const match = before.match(/(\t| {1,4})$/);
				if (match) {
					const removeLen = match[0].length;
					textarea.value = `${value.slice(0, start - removeLen)}${value.slice(end)}`;
					const newCursor = Math.max(start - removeLen, lineStart);
					textarea.selectionStart = textarea.selectionEnd = newCursor;
				}
			} else {
				textarea.value = `${value.slice(0, start)}${indent}${value.slice(end)}`;
				const newCursor = start + indent.length;
				textarea.selectionStart = textarea.selectionEnd = newCursor;
			}
		}
	});

	state.dialog = dialog;
}

function ensureButton(node, state) {
	if (state.button) return;
	const button = node.addWidget("button", "⚙ Settings", null, () => openFunctionDialog(node, state), {
		serialize: false,
	});
	if (!button) return;
	button.tooltip = "Open settings";
	state.button = button;
}

function setupNode(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupNode(node));
		return;
	}
	const functionWidget = node.widgets.find((w) => w.name === FUNCTION_WIDGET_NAME);
	if (!functionWidget) return;
	const state = (node.__sdvnRunPythonState ||= {});
	state.functionWidget = functionWidget;
	hideWidget(functionWidget);
	ensureButton(node, state);

	if (!state.listenerAttached) {
		state.listenerAttached = true;
		const originalCallback = functionWidget.callback;
		functionWidget.callback = function (...args) {
			const result = originalCallback?.apply(this, args);
			return result;
		};
	}
}

app.registerExtension({
	name: "SDVN.RunPythonCode",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE) return;
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupNode(this);
			return result;
		};
		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			setupNode(this);
			return result;
		};
	},
});
