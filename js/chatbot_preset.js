import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN API chatbot";
const PRESET_WIDGET_NAME = "preset";
const API_ENDPOINTS = {
	list: "/sdvn/chatbot_presets",
	save: "/sdvn/chatbot_presets/save",
	delete: "/sdvn/chatbot_presets/delete",
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

async function fetchPresets() {
	const response = await fetch(API_ENDPOINTS.list, { cache: "no-store" });
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload?.message || "Không thể tải preset.");
	}
	return payload;
}

function refreshPresetWidget(node, payload, selectedName = null) {
	const presetWidget = node.widgets?.find((w) => w.name === PRESET_WIDGET_NAME);
	if (!presetWidget) return;
	setComboOptions(presetWidget, payload.names || []);
	if (selectedName && (payload.names || []).includes(selectedName)) {
		presetWidget.value = selectedName;
		presetWidget.callback?.(selectedName);
	} else if (!(payload.names || []).includes(presetWidget.value)) {
		presetWidget.value = payload.names?.[0] ?? "None";
		presetWidget.callback?.(presetWidget.value);
	}
	node.setDirtyCanvas?.(true, true);
}

function prettyMessages(messages) {
	return JSON.stringify(messages ?? [], null, 2);
}

function extractPresetContent(value) {
	if (typeof value === "string") return value;
	if (Array.isArray(value) && value.length > 0) {
		return value[0]?.content ?? "";
	}
	return "";
}

function buildDialogContent(selectedName, presetValue, isDefaultPreset) {
	const safeName = escapeHtml(selectedName ?? "");
	const safeContent = escapeHtml(extractPresetContent(presetValue));
	const readonlyNote = isDefaultPreset
		? `<div style="padding: 0 0 12px; font-size: 12px; color: #f6c26b;">Preset mặc định chỉ đọc. Đổi tên để lưu thành preset mới.</div>`
		: `<div style="padding: 0 0 12px; font-size: 12px; opacity: 0.75;">Có thể lưu đè hoặc xóa preset custom đang chọn.</div>`;
	return `
		<div style="
			min-width: 480px;
			max-width: 78vw;
			padding: 16px 18px;
			border-radius: 8px;
			background: rgba(20, 20, 20, 0.96);
			border: 1px solid rgba(255,255,255,0.08);
			box-shadow: 0 25px 70px rgba(0, 0, 0, 0.55);
			font-family: 'Inter', 'Helvetica Neue', system-ui;
		">
			<div style="padding: 0 0 6px; font-weight: 600; font-size: 15px;">Save/Edit Chatbot Preset</div>
			<div style="padding: 0 0 10px; font-size: 12px; opacity: 0.75;">
				Preset custom sẽ lưu dưới dạng JSON đơn giản: {"Tên preset": "câu lệnh"}
			</div>
			${readonlyNote}
			<div style="padding: 0 0 10px;">
				<div style="font-size: 12px; opacity: 0.8; padding-bottom: 6px;">Preset name</div>
					<input class="sdvn-chatbot-preset-name" value="${safeName}" style="
					width: 100%;
					border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.15);
					background: rgba(0,0,0,0.35);
					color: #fff;
					padding: 10px 12px;
					font-size: 13px;
				" />
			</div>
			<div style="padding: 0;">
					<div style="font-size: 12px; opacity: 0.8; padding-bottom: 6px;">Preset content</div>
					<textarea class="sdvn-chatbot-preset-content" spellcheck="false" style="
						width: 100%;
						min-height: 280px;
						border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.15);
					background: rgba(0,0,0,0.35);
					color: #fff;
					padding: 12px 14px;
					resize: vertical;
						font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
						font-size: 13px;
					">${safeContent}</textarea>
				</div>
			<div class="sdvn-chatbot-preset-status" style="padding: 10px 0 0; min-height: 18px; font-size: 12px; opacity: 0.8;"></div>
			<div style="display: flex; justify-content: space-between; gap: 8px; padding: 14px 0 0;">
				<button class="comfy-btn comfy-btn-secondary sdvn-chatbot-preset-delete"${isDefaultPreset ? " disabled" : ""}>Delete</button>
				<div style="display: flex; gap: 8px;">
					<button class="comfy-btn comfy-btn-secondary sdvn-chatbot-preset-cancel">Cancel</button>
					<button class="comfy-btn comfy-btn-primary sdvn-chatbot-preset-save">Save</button>
				</div>
			</div>
		</div>
	`;
}

function setStatus(dialog, message, isError = false) {
	const statusEl = dialog?.querySelector(".sdvn-chatbot-preset-status");
	if (!statusEl) return;
	statusEl.textContent = message || "";
	statusEl.style.color = isError ? "#ff8c8c" : "#b8f2c3";
}

async function openPresetDialog(node, state) {
	const presetWidget = state.presetWidget;
	if (!presetWidget || !app?.canvas?.createDialog) return;

	let payload;
	try {
		payload = await fetchPresets();
	} catch (error) {
		alert(error.message || "Không thể tải preset.");
		return;
	}

	refreshPresetWidget(node, payload);
	const selectedName = presetWidget.value ?? "None";
	const selectedValue = payload.custom?.[selectedName] ?? payload.defaults?.[selectedName] ?? "";
	const isDefaultPreset = Object.prototype.hasOwnProperty.call(payload.defaults || {}, selectedName);

	state.dialog?.close?.();
	const dialog = app.canvas.createDialog(buildDialogContent(selectedName, selectedValue, isDefaultPreset));
	centerDialog(dialog);
	if (dialog?.style) {
		dialog.style.resize = "both";
		dialog.style.overflow = "visible";
		dialog.style.minWidth = "480px";
		dialog.style.maxWidth = "80vw";
		dialog.style.padding = "0";
	}

	const nameInput = dialog.querySelector(".sdvn-chatbot-preset-name");
	const contentTextarea = dialog.querySelector(".sdvn-chatbot-preset-content");
	const closeDialog = () => {
		dialog?.close?.();
		if (state.dialog === dialog) state.dialog = null;
	};

	const savePreset = async () => {
		try {
				const body = {
					name: nameInput?.value ?? "",
					previous_name: selectedName,
					content: contentTextarea?.value ?? "",
				};
			const response = await fetch(API_ENDPOINTS.save, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const result = await response.json();
			if (!response.ok || result.status !== "ok") {
				throw new Error(result?.message || "Không thể lưu preset.");
			}
			refreshPresetWidget(node, result, result.name);
			setStatus(dialog, "Đã lưu preset.");
			setTimeout(() => closeDialog(), 200);
		} catch (error) {
			setStatus(dialog, error.message || "Không thể lưu preset.", true);
		}
	};

	const deletePreset = async () => {
		if (!nameInput?.value?.trim()) return;
		if (!confirm(`Xóa preset "${nameInput.value.trim()}"?`)) return;
		try {
			const response = await fetch(API_ENDPOINTS.delete, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: nameInput.value.trim() }),
			});
			const result = await response.json();
			if (!response.ok || result.status !== "ok") {
				throw new Error(result?.message || "Không thể xóa preset.");
			}
			refreshPresetWidget(node, result, "None");
			closeDialog();
		} catch (error) {
			setStatus(dialog, error.message || "Không thể xóa preset.", true);
		}
	};

	dialog.querySelector(".sdvn-chatbot-preset-save")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		savePreset();
	});
	dialog.querySelector(".sdvn-chatbot-preset-delete")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		deletePreset();
	});
	dialog.querySelector(".sdvn-chatbot-preset-cancel")?.addEventListener("click", (event) => {
		event?.preventDefault?.();
		closeDialog();
	});
	dialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			closeDialog();
		} else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			savePreset();
		}
	});

	state.dialog = dialog;
}

function ensureButton(node, state) {
	if (state.presetButton) return;
	const button = node.addWidget("button", "📝 Save/Edit preset", null, () => openPresetDialog(node, state), {
		serialize: false,
	});
	if (!button) return;
	button.tooltip = "Mở popup quản lý preset";
	state.presetButton = button;
}

async function setupNode(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupNode(node));
		return;
	}
	const presetWidget = node.widgets.find((w) => w.name === PRESET_WIDGET_NAME);
	if (!presetWidget) return;
	const state = (node.__sdvnChatbotPresetState ||= {});
	state.presetWidget = presetWidget;
	ensureButton(node, state);
	try {
		const payload = await fetchPresets();
		refreshPresetWidget(node, payload);
	} catch {
		// Ignore transient UI fetch failures; popup can retry later.
	}
}

app.registerExtension({
	name: "SDVN.ChatbotPreset",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE) return;
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupNode(this);
			return result;
		};
	},
});
