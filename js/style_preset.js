import { app } from "/scripts/app.js";

const TARGET_NODES = new Set([
	"SDVN CLIP Text Encode",
	"SDVN CLIP Text Encode Simple",
]);

const STYLE_WIDGET_NAME = "style";
const API_ENDPOINTS = {
	list: "/sdvn/styles",
	save: "/sdvn/styles/save",
	delete: "/sdvn/styles/delete",
};

function centerDialog(dialog) {
	if (!dialog || !dialog.style) return;
	dialog.style.position = "fixed";
	dialog.style.left = "50%";
	dialog.style.top = "50%";
	dialog.style.transform = "translate(-50%, -50%)";
	dialog.style.margin = "0";
}

function setComboOptions(widget, values) {
	if (!widget) return;
	if (widget.options?.values) {
		widget.options.values = [...values];
	} else if (Array.isArray(widget.options)) {
		widget.options = [...values];
	} else {
		widget.options = { values: [...values] };
	}
}

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

async function fetchStyles() {
	const response = await fetch(API_ENDPOINTS.list, { cache: "no-store" });
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload?.message || "Không thể tải style.");
	}
	return payload;
}

function refreshStyleWidget(node, payload, selectedName = null) {
	const styleWidget = node.widgets?.find((w) => w.name === STYLE_WIDGET_NAME);
	if (!styleWidget) return;
	setComboOptions(styleWidget, payload.names || []);
	if (selectedName && (payload.names || []).includes(selectedName)) {
		styleWidget.value = selectedName;
		styleWidget.callback?.(selectedName);
	} else if (!(payload.names || []).includes(styleWidget.value)) {
		styleWidget.value = payload.names?.[0] ?? "None";
		styleWidget.callback?.(styleWidget.value);
	}
	node.setDirtyCanvas?.(true, true);
}

function setStatus(dialog, message, isError = false) {
	const statusEl = dialog?.querySelector(".sdvn-style-preset-status");
	if (!statusEl) return;
	statusEl.textContent = message || "";
	statusEl.style.color = isError ? "#ff8c8c" : "#b8f2c3";
}

function buildDialogContent(selectedName, styleValue, isDefaultStyle) {
	const safeName = escapeHtml(selectedName === "None" ? "" : selectedName ?? "");
	const positivePrompt = Array.isArray(styleValue) ? styleValue[0] ?? "" : "";
	const negativePrompt = Array.isArray(styleValue) ? styleValue[1] ?? "" : "";
	const safePositivePrompt = escapeHtml(positivePrompt);
	const safeNegativePrompt = escapeHtml(negativePrompt);
	const readonlyNote = isDefaultStyle
		? `<div style="padding: 0 0 12px; font-size: 12px; color: #f6c26b;">Style mặc định chỉ đọc. Đổi tên để lưu thành style mới.</div>`
		: `<div style="padding: 0 0 12px; font-size: 12px; opacity: 0.75;">Có thể lưu đè hoặc xóa style custom đang chọn.</div>`;
	return `
		<div style="
			min-width: 540px;
			max-width: 78vw;
			padding: 16px 18px;
			border-radius: 8px;
			background: rgba(20, 20, 20, 0.96);
			border: 1px solid rgba(255,255,255,0.08);
			box-shadow: 0 25px 70px rgba(0, 0, 0, 0.55);
			font-family: 'Inter', 'Helvetica Neue', system-ui;
		">
			<div style="padding: 0 0 6px; font-weight: 600; font-size: 15px;">Save/Edit Style</div>
			<div style="padding: 0 0 10px; font-size: 12px; opacity: 0.75;">
				Style custom sẽ lưu sang JSON riêng dạng {"Tên style": ["positive prompt", "negative prompt"]}
			</div>
			${readonlyNote}
			<div style="padding: 0 0 10px;">
				<div style="font-size: 12px; opacity: 0.8; padding-bottom: 6px;">Style name</div>
				<input class="sdvn-style-preset-name" value="${safeName}" style="
					width: 100%;
					border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.15);
					background: rgba(0,0,0,0.35);
					color: #fff;
					padding: 10px 12px;
					font-size: 13px;
				" />
			</div>
			<div style="padding: 0 0 10px;">
				<div style="font-size: 12px; opacity: 0.8; padding-bottom: 6px;">Positive prompt</div>
				<textarea class="sdvn-style-preset-positive" spellcheck="false" style="
					width: 100%;
					min-height: 160px;
					border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.15);
					background: rgba(0,0,0,0.35);
					color: #fff;
					padding: 12px 14px;
					resize: vertical;
					font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
					font-size: 13px;
				">${safePositivePrompt}</textarea>
			</div>
			<div style="padding: 0;">
				<div style="font-size: 12px; opacity: 0.8; padding-bottom: 6px;">Negative prompt</div>
				<textarea class="sdvn-style-preset-negative" spellcheck="false" style="
					width: 100%;
					min-height: 140px;
					border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.15);
					background: rgba(0,0,0,0.35);
					color: #fff;
					padding: 12px 14px;
					resize: vertical;
					font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
					font-size: 13px;
				">${safeNegativePrompt}</textarea>
			</div>
			<div class="sdvn-style-preset-status" style="padding: 10px 0 0; min-height: 18px; font-size: 12px; opacity: 0.8;"></div>
			<div style="display: flex; justify-content: space-between; gap: 8px; padding: 14px 0 0;">
				<button class="comfy-btn comfy-btn-secondary sdvn-style-preset-delete"${selectedName === "None" || isDefaultStyle ? " disabled" : ""}>Delete</button>
				<div style="display: flex; gap: 8px;">
					<button class="comfy-btn comfy-btn-secondary sdvn-style-preset-cancel">Cancel</button>
					<button class="comfy-btn comfy-btn-primary sdvn-style-preset-save">Save</button>
				</div>
			</div>
		</div>
	`;
}

async function openStyleDialog(node, state) {
	const styleWidget = state.styleWidget;
	if (!styleWidget || !app?.canvas?.createDialog) return;

	let payload;
	try {
		payload = await fetchStyles();
	} catch (error) {
		alert(error.message || "Không thể tải style.");
		return;
	}

	refreshStyleWidget(node, payload);
	const selectedName = styleWidget.value ?? "None";
	const selectedValue = payload.custom?.[selectedName] ?? payload.defaults?.[selectedName] ?? ["", ""];
	const isDefaultStyle = Object.prototype.hasOwnProperty.call(payload.defaults || {}, selectedName);

	state.dialog?.close?.();
	const dialog = app.canvas.createDialog(buildDialogContent(selectedName, selectedValue, isDefaultStyle));
	centerDialog(dialog);
	if (dialog?.style) {
		dialog.style.resize = "both";
		dialog.style.overflow = "visible";
		dialog.style.minWidth = "540px";
		dialog.style.maxWidth = "80vw";
		dialog.style.padding = "0";
	}

	const nameInput = dialog.querySelector(".sdvn-style-preset-name");
	const positiveTextarea = dialog.querySelector(".sdvn-style-preset-positive");
	const negativeTextarea = dialog.querySelector(".sdvn-style-preset-negative");
	const closeDialog = () => {
		dialog?.close?.();
		if (state.dialog === dialog) state.dialog = null;
	};

	const saveStyle = async () => {
		try {
			const body = {
				name: nameInput?.value ?? "",
				previous_name: selectedName,
				positive_prompt: positiveTextarea?.value ?? "",
				negative_prompt: negativeTextarea?.value ?? "",
			};
			const response = await fetch(API_ENDPOINTS.save, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const result = await response.json();
			if (!response.ok || result.status !== "ok") {
				throw new Error(result?.message || "Không thể lưu style.");
			}
			refreshStyleWidget(node, result, result.name);
			setStatus(dialog, "Đã lưu style.");
			setTimeout(() => closeDialog(), 200);
		} catch (error) {
			setStatus(dialog, error.message || "Không thể lưu style.", true);
		}
	};

	const deleteStyle = async () => {
		if (!nameInput?.value?.trim()) return;
		if (!confirm(`Xóa style "${nameInput.value.trim()}"?`)) return;
		try {
			const response = await fetch(API_ENDPOINTS.delete, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: nameInput.value.trim() }),
			});
			const result = await response.json();
			if (!response.ok || result.status !== "ok") {
				throw new Error(result?.message || "Không thể xóa style.");
			}
			refreshStyleWidget(node, result, "None");
			closeDialog();
		} catch (error) {
			setStatus(dialog, error.message || "Không thể xóa style.", true);
		}
	};

	dialog.querySelector(".sdvn-style-preset-save")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		saveStyle();
	});
	dialog.querySelector(".sdvn-style-preset-delete")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		deleteStyle();
	});
	dialog.querySelector(".sdvn-style-preset-cancel")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		closeDialog();
	});
	dialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			closeDialog();
		} else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			saveStyle();
		}
	});

	state.dialog = dialog;
}

function ensureButton(node, state) {
	if (state.styleButton) return;
	const button = node.addWidget("button", "📝 Save/Edit style", null, () => openStyleDialog(node, state), {
		serialize: false,
	});
	if (!button) return;
	button.tooltip = "Mở popup quản lý style";
	state.styleButton = button;
}

async function setupNode(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupNode(node));
		return;
	}
	const styleWidget = node.widgets.find((w) => w.name === STYLE_WIDGET_NAME);
	if (!styleWidget) return;
	const state = (node.__sdvnStylePresetState ||= {});
	state.styleWidget = styleWidget;
	ensureButton(node, state);
	try {
		const payload = await fetchStyles();
		refreshStyleWidget(node, payload);
	} catch {
	}
}

app.registerExtension({
	name: "SDVN.StylePreset",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (!TARGET_NODES.has(nodeData?.name)) return;
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupNode(this);
			return result;
		};
	},
});
