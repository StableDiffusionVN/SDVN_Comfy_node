import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Load Lora Filter";
const GLOBAL_STATE = (globalThis.__sdvnLoraFilterGlobal ||= { masterValues: null });

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

function normalizeValues(values) {
	const list = Array.isArray(values) && values.length ? values : ["None"];
	return list.slice();
}

function readValues(widget) {
	return normalizeValues(widget?.options?.values);
}

function ensureMasterValues(values) {
	const normalized = normalizeValues(values);
	const master = GLOBAL_STATE.masterValues;
	const needsUpdate =
		!master ||
		normalized.length > master.length ||
		normalized.some((value) => !master.includes(value));
	if (needsUpdate) {
		GLOBAL_STATE.masterValues = [...normalized];
	}
	return [...(GLOBAL_STATE.masterValues || normalized)];
}

function detachWidgetOptions(widget, values) {
	const clone = { ...(widget.options || {}) };
	clone.values = [...values];
	widget.options = clone;
	return clone.values;
}

function setupLoraFilter(node) {
	if (!node?.widgets) {
		requestAnimationFrame(() => setupLoraFilter(node));
		return;
	}

	const filterWidget = findWidget(node, "fill");
	const loraWidget = findWidget(node, "lora_name");
	if (!filterWidget || !loraWidget) return;

	const state = (node.__sdvnLoraFilterState ||= {});
	state.filterWidget = filterWidget;
	state.loraWidget = loraWidget;

	const baseValues = ensureMasterValues(readValues(loraWidget));
	state.allValues = baseValues;
	state.optionsArray = detachWidgetOptions(loraWidget, baseValues);

	const applyFilter = () => {
		const search = (filterWidget.inputEl?.value ?? filterWidget.value ?? "")
			.toString()
			.trim()
			.toLowerCase();
		const source = state.allValues?.length ? state.allValues : ["None"];
		const filtered = search
			? source.filter((value) => value.toLowerCase().includes(search))
			: source.slice();
		const fallback = source.includes("None") ? ["None"] : source.slice(0, 1);
		const values = filtered.length ? filtered : (fallback.length ? fallback : ["None"]);
		const options = loraWidget.options?.values;
		if (Array.isArray(options)) {
			options.length = 0;
			options.push(...values);
			if (!values.includes(loraWidget.value)) {
				loraWidget.value = values[0] ?? loraWidget.value;
			}
		}
		app.graph?.setDirtyCanvas?.(true, true);
	};

	state.applyFilter = applyFilter;

	if (!state.listenerAttached) {
		state.listenerAttached = true;
		ensureInput(filterWidget, (input) => {
			input.addEventListener("input", () => state.applyFilter?.());
		});
	}

	if (!state.callbackPatched) {
		state.callbackPatched = true;
		const originalCallback = filterWidget.callback;
		filterWidget.callback = function (...args) {
			if (args.length) {
				filterWidget.value = args[0];
			}
			const r = originalCallback?.apply(this, args);
			state.applyFilter?.();
			return r;
		};
	}

	requestAnimationFrame(() => state.applyFilter?.());
}

app.registerExtension({
	name: "SDVN.LoraFilter",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE) return;

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupLoraFilter(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			setupLoraFilter(this);
			return result;
		};
	},
});
