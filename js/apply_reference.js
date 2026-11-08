import { app } from "/scripts/app.js";

app.registerExtension({
	name: "SDVN.ApplyReference",
	beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "SDVN Apply Kontext Reference") return;

		const imageNames = Object.entries(nodeData.input.optional)
			.filter(([, [type]]) => type === "IMAGE")
			.map(([name]) => name);

		function syncImageInputs(node) {
			const inputs = node.inputs ?? [];
			const linked = new Set(inputs.filter((input) => input.link != null).map((input) => input.name));
			const visible = new Set(imageNames.slice(0, imageNames.findLastIndex((name) => linked.has(name)) + 2));

			for (let i = inputs.length - 1; i >= 0; i--) {
				if (imageNames.includes(inputs[i].name) && !visible.has(inputs[i].name)) node.removeInput(i);
			}
			for (const name of visible) {
				if (node.findInputSlot(name) < 0) {
					node.addInput(name, "IMAGE", { shape: LiteGraph.HOLLOW_CIRCLE_SHAPE });
				}
			}
		}

		// Wait for LiteGraph to finish restoring links or updating slot indices.
		for (const hook of ["onNodeCreated", "onConfigure", "onConnectionsChange"]) {
			const original = nodeType.prototype[hook];
			nodeType.prototype[hook] = function (...args) {
				const result = original?.apply(this, args);
				queueMicrotask(() => syncImageInputs(this));
				return result;
			};
		}
	},
});
