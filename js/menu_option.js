import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Menu Option";
const DEFAULT_OPTIONS = ["Option_1", "Option_2", "Option_3", "Option_4", "Option_5", "Option_6", "Option_7", "Option_8"];

function findWidget(node, name) {
	if (!node?.widgets) return null;
	return node.widgets.find((widget) => widget.name === name) || null;
}

function ensureInput(widget, cb) {
	if (widget.inputEl) {
		cb(widget.inputEl);
		return;
	}
	requestAnimationFrame(() => ensureInput(widget, cb));
}

function parseSetting(text) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => line.split(":")[0].trim())
		.filter(Boolean);
}

function setupMenuOption(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupMenuOption(node));
		return;
	}

	const menuWidget = findWidget(node, "Menu");
	const settingWidget = findWidget(node, "Setting");
	if (!menuWidget || !settingWidget) return;

	const state = (node.__sdvnMenuOptionState ||= {});
	state.menuWidget = menuWidget;
	state.settingWidget = settingWidget;

	const ensureValuesArray = () => {
		if (state.valuesArray) {
			return state.valuesArray;
		}
		const current = menuWidget.options?.values;
		const clone = Array.isArray(current) ? [...current] : [...DEFAULT_OPTIONS];
		menuWidget.options = { ...(menuWidget.options ?? {}), values: clone };
		state.valuesArray = menuWidget.options.values;
		return state.valuesArray;
	};

	const apply = () => {
		const raw = (settingWidget.value ?? "").toString();
		const parsed = parseSetting(raw);
		const options = ensureValuesArray();
		const values = parsed.length ? parsed : [...DEFAULT_OPTIONS];
		options.length = 0;
		options.push(...values);
		if (!values.includes(menuWidget.value)) {
			menuWidget.value = values[0] ?? menuWidget.value;
		}
		app.graph?.setDirtyCanvas?.(true, true);
	};

	state.apply = apply;

	if (!state.listenerAttached) {
		state.listenerAttached = true;
		ensureInput(settingWidget, (input) => {
			input.addEventListener("input", () => state.apply?.());
		});
		const originalCallback = settingWidget.callback;
		settingWidget.callback = function (...args) {
			const result = originalCallback?.apply(this, args);
			state.apply?.();
			return result;
		};
	}

	requestAnimationFrame(() => state.apply?.());
}

app.registerExtension({
	name: "SDVN.MenuOption",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE) return;

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupMenuOption(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			setupMenuOption(this);
			return result;
		};
	},
});
