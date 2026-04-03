import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Fast Groups Bypasser";
const MODE_ALWAYS = LiteGraph.ALWAYS ?? 0;
const MODE_BYPASS = 4;
const PROPERTY_SORT = "sort";

function fitString(ctx, text, maxWidth) {
	if (!text) return "";
	if (ctx.measureText(text).width <= maxWidth) return text;
	let output = text;
	while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
		output = output.slice(0, -1);
	}
	return `${output}...`;
}

function drawNodeWidget(ctx, width, posY, height) {
	const margin = 15;
	const x = margin;
	const y = posY;
	const w = width - margin * 2;
	const h = height;
	ctx.save();
	ctx.beginPath();
	ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR || "#222";
	ctx.strokeStyle = LiteGraph.WIDGET_OUTLINE_COLOR || "#666";
	ctx.lineWidth = 1;
	if (typeof ctx.roundRect === "function") {
		ctx.roundRect(x, y, w, h, 8);
	} else {
		ctx.rect(x, y, w, h);
	}
	ctx.fill();
	ctx.stroke();
	ctx.restore();
	return {
		margin,
		width: w,
		posY: y,
		height: h,
		colorOutline: LiteGraph.WIDGET_OUTLINE_COLOR || "#666",
		colorText: LiteGraph.WIDGET_TEXT_COLOR || "#ddd",
		colorTextSecondary: LiteGraph.WIDGET_SECONDARY_TEXT_COLOR || "#999",
		lowQuality: (((app.canvas?.ds?.scale) || 1) <= 0.5),
	};
}

function changeModeOfNodes(nodes, mode) {
	const list = Array.isArray(nodes) ? nodes : [nodes];
	for (const node of list) {
		if (!node) continue;
		node.mode = mode;
		node.graph?.change?.();
	}
}

function getGroupNodes(group) {
	if (!group) return [];
	if (!app.canvas?.selected_group_moving) {
		group.recomputeInsideNodes?.();
	}
	if (group._children) {
		return Array.from(group._children).filter((child) => child && typeof child.mode === "number");
	}
	return Array.from(group._nodes || []).filter((child) => child && typeof child.mode === "number");
}

function getCurrentGraph() {
	return app.canvas?.getCurrentGraph?.() || app.graph || null;
}

function isGroupAlive(group) {
	if (!group) return false;
	const graph = group.graph || getCurrentGraph();
	return !!graph?._groups?.includes(group);
}

class FastGroupsService {
	constructor() {
		this.fastGroupNodes = [];
		this.runScheduledForMs = null;
		this.runScheduleTimeout = null;
		this.runScheduleAnimation = null;
	}

	addNode(node) {
		if (!this.fastGroupNodes.includes(node)) {
			this.fastGroupNodes.push(node);
		}
		this.scheduleRun(8);
	}

	removeNode(node) {
		const index = this.fastGroupNodes.indexOf(node);
		if (index > -1) {
			this.fastGroupNodes.splice(index, 1);
		}
		if (!this.fastGroupNodes.length) {
			this.clearScheduledRun();
		}
	}

	run() {
		if (!this.runScheduledForMs) return;
		for (const node of this.fastGroupNodes) {
			node.refreshWidgets?.();
		}
		this.clearScheduledRun();
		this.scheduleRun();
	}

	scheduleRun(ms = 400) {
		if (this.runScheduledForMs && ms < this.runScheduledForMs) {
			this.clearScheduledRun();
		}
		if (!this.runScheduledForMs && this.fastGroupNodes.length) {
			this.runScheduledForMs = ms;
			this.runScheduleTimeout = setTimeout(() => {
				this.runScheduleAnimation = requestAnimationFrame(() => this.run());
			}, ms);
		}
	}

	clearScheduledRun() {
		if (this.runScheduleTimeout) clearTimeout(this.runScheduleTimeout);
		if (this.runScheduleAnimation) cancelAnimationFrame(this.runScheduleAnimation);
		this.runScheduleTimeout = null;
		this.runScheduleAnimation = null;
		this.runScheduledForMs = null;
	}

	getGroups(sort = "position") {
		const graph = getCurrentGraph();
		const groups = [...(graph?._groups || [])];
		if (sort === "alphanumeric" || sort === "abc") {
			return groups.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
		}
		return groups.sort((a, b) => {
			const aY = Math.floor((a?._pos?.[1] ?? a?.pos?.[1] ?? 0) / 30);
			const bY = Math.floor((b?._pos?.[1] ?? b?.pos?.[1] ?? 0) / 30);
			if (aY === bY) {
				const aX = Math.floor((a?._pos?.[0] ?? a?.pos?.[0] ?? 0) / 30);
				const bX = Math.floor((b?._pos?.[0] ?? b?.pos?.[0] ?? 0) / 30);
				return aX - bX;
			}
			return aY - bY;
		});
	}
}

const SERVICE = new FastGroupsService();

class FastGroupsToggleRowWidget {
	constructor(group, node) {
		this.name = "SDVN_FAST_GROUPS_TOGGLE";
		this.type = "custom";
		this.value = { toggled: false };
		this.options = { on: "yes", off: "no", serialize: false };
		this.label = "";
		this.group = group;
		this.groupName = group?.title || "";
		this.node = node;
	}

	get toggled() {
		return this.value.toggled;
	}

	set toggled(value) {
		this.value.toggled = value;
	}

	computeSize(width) {
		return [width, LiteGraph.NODE_WIDGET_HEIGHT || 28];
	}

	serializeValue() {
		return this.value;
	}

	doModeChange(force) {
		if (!isGroupAlive(this.group)) {
			this.node?.refreshWidgets?.();
			return;
		}
		this.group.recomputeInsideNodes?.();
		const nodes = getGroupNodes(this.group);
		const hasAnyActiveNodes = nodes.some((n) => n.mode === MODE_ALWAYS);
		const newValue = force != null ? force : !hasAnyActiveNodes;
		changeModeOfNodes(nodes, newValue ? this.node.modeOn : this.node.modeOff);
		this.group.sdvn_hasAnyActiveNode = newValue;
		this.toggled = newValue;
		this.group.graph.setDirtyCanvas?.(true, false);
	}

	draw(ctx, node, width, posY, height) {
		if (!isGroupAlive(this.group)) {
			this.node?.refreshWidgets?.();
			return;
		}
		this.groupName = this.group?.title || this.groupName;

		const widgetData = drawNodeWidget(ctx, width, posY, height);
		let currentX = width - widgetData.margin;
		this.toggled = !!this.group.sdvn_hasAnyActiveNode;
		currentX -= 12;
		ctx.fillStyle = this.toggled ? "#43a047" : "#f2c94c";
		ctx.beginPath();
		const toggleRadius = height * 0.36;
		ctx.arc(currentX - toggleRadius, posY + height * 0.5, toggleRadius, 0, Math.PI * 2);
		ctx.fill();
		currentX -= toggleRadius * 2;

		if (!widgetData.lowQuality) {
			currentX -= 10;
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillStyle = widgetData.colorText;
			const maxLabelWidth = currentX - (widgetData.margin + 10);
			ctx.fillStyle = widgetData.colorText;
			ctx.fillText(fitString(ctx, this.label, maxLabelWidth), widgetData.margin + 10, posY + height * 0.55);
		}
	}

	mouse(event, pos, node) {
		if (event.type !== "pointerdown") return true;
		if (!isGroupAlive(this.group)) {
			this.node?.refreshWidgets?.();
			return true;
		}
		this.doModeChange();
		return true;
	}
}

function setupFastGroupsBypasser(node) {
	if (!node || node.__sdvnFastGroupsBypasserSetup) return;
	node.__sdvnFastGroupsBypasserSetup = true;
	node.serialize_widgets = false;
	node.modeOn = MODE_ALWAYS;
	node.modeOff = MODE_BYPASS;
	node.properties ||= {};
	node.properties[PROPERTY_SORT] ??= "alphanumeric";

	node.refreshWidgets = function () {
		const groups = SERVICE.getGroups(this.properties?.[PROPERTY_SORT] || "alphanumeric");
		const groupNames = new Set(groups.map((group) => group?.title || ""));
		if (Array.isArray(this.widgets)) {
			for (let i = this.widgets.length - 1; i >= 0; i--) {
				const widget = this.widgets[i];
				if (
					widget instanceof FastGroupsToggleRowWidget &&
					(!groups.includes(widget.group) || !groupNames.has(widget.groupName || widget.group?.title || ""))
				) {
					this.removeWidget(i);
				}
			}
		}
		let index = 0;
		for (const group of groups) {
			group.sdvn_hasAnyActiveNode = getGroupNodes(group).some((n) => n.mode === MODE_ALWAYS);
			let widget = this.widgets?.find((w) => w instanceof FastGroupsToggleRowWidget && w.group === group);
			let isDirty = false;
			if (!widget) {
				this.tempSize = [...this.size];
				widget = this.addCustomWidget(new FastGroupsToggleRowWidget(group, this));
				this.setSize(this.computeSize());
				isDirty = true;
			}
			const widgetLabel = `${group.title}`;
			if (widget.label !== widgetLabel) {
				widget.label = widgetLabel;
				widget.groupName = group.title || "";
				isDirty = true;
			}
			if (widget.toggled !== group.sdvn_hasAnyActiveNode) {
				widget.toggled = group.sdvn_hasAnyActiveNode;
				isDirty = true;
			}
			if (this.widgets[index] !== widget) {
				const oldIndex = this.widgets.findIndex((w) => w === widget);
				if (oldIndex > -1) {
					this.widgets.splice(index, 0, this.widgets.splice(oldIndex, 1)[0]);
					isDirty = true;
				}
			}
			if (isDirty) {
				this.setDirtyCanvas?.(true, false);
			}
			index++;
		}

		while ((this.widgets || [])[index]) {
			this.removeWidget(index++);
		}
	};

	const originalComputeSize = node.computeSize;
	node.computeSize = function (out) {
		const originalSize = originalComputeSize ? originalComputeSize.call(this, out) : [Math.max(this.size?.[0] || 240, 240), 0];
		const widgetHeight = LiteGraph.NODE_WIDGET_HEIGHT || 28;
		const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
		const contentHeight = (this.widgets?.length || 0) * widgetHeight;
		let size = [
			Math.max(this.size?.[0] || 240, originalSize[0] || 0, 240),
			titleHeight + contentHeight + 2,
		];
		if (this.tempSize) {
			size[0] = Math.max(this.tempSize[0], size[0]);
			clearTimeout(this.__sdvnTempSizeDebounce);
			this.__sdvnTempSizeDebounce = setTimeout(() => {
				this.tempSize = null;
			}, 32);
		}
		setTimeout(() => {
			this.graph?.setDirtyCanvas?.(true, true);
		}, 16);
		return size;
	};

	const originalOnAdded = node.onAdded;
	node.onAdded = function () {
		const result = originalOnAdded?.apply(this, arguments);
		SERVICE.addNode(this);
		return result;
	};

	const originalOnRemoved = node.onRemoved;
	node.onRemoved = function () {
		SERVICE.removeNode(this);
		return originalOnRemoved?.apply(this, arguments);
	};

	setTimeout(() => node.refreshWidgets?.(), 0);
	setTimeout(() => SERVICE.addNode(node), 0);
}

app.registerExtension({
	name: "SDVN.FastGroupsBypasser",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE) return;

		nodeType.prototype.modeOn = MODE_ALWAYS;
		nodeType.prototype.modeOff = MODE_BYPASS;
		nodeType.prototype.serialize_widgets = false;

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated?.apply(this, arguments);
			setupFastGroupsBypasser(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure?.apply(this, arguments);
			setupFastGroupsBypasser(this);
			return result;
		};
	},
	loadedGraphNode(node) {
		if (node.type === TARGET_NODE) {
			node.tempSize = [...node.size];
			setupFastGroupsBypasser(node);
		}
	},
});
