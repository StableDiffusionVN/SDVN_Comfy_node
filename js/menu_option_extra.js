import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Menu Option Extra";
const DEFAULT_MENU_OPTIONS = ["Option_1", "Option_2", "Option_3", "Option_4", "Option_5", "Option_6", "Option_7", "Option_8"];
const DEFAULT_SUB_OPTIONS = ["Sub_1", "Sub_2", "Sub_3", "Sub_4", "Sub_5"];

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

