import { app } from "/scripts/app.js";

const TARGET_NODE = "SDVN Fast Groups Bypasser";
const MODE_ALWAYS = LiteGraph.ALWAYS ?? 0;
const MODE_BYPASS = 4;
const PROPERTY_SORT = "sort";
const MIN_NODE_WIDTH = 240;
const CONTENT_PADDING_Y = 10;
const SPACER_WIDGET_NAME = "SDVN_FAST_GROUPS_SPACER";
const DEFAULT_NODE_HEIGHT = 120;

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

function getNodeBounds(node) {
	let bounds = node?.getBounding?.();
	if (Array.isArray(bounds) && bounds.length === 4) {
		const hasVisibleSize = bounds[2] !== 0 || bounds[3] !== 0;
		if (hasVisibleSize) {
			return bounds;
		}
	}
	const pos = node?.pos || [0, 0];
	const size = node?.size || [0, 0];
	return [pos[0] || 0, pos[1] || 0, size[0] || 0, size[1] || 0];
}

function recomputeInsideNodesForGroup(group) {
	if (!group?.graph) return [];
	const nodes = group.graph.nodes || group.graph._nodes || [];
	const groupBounds = group._bounding || [group.pos?.[0] || 0, group.pos?.[1] || 0, group.size?.[0] || 0, group.size?.[1] || 0];
	const inside = [];
	for (const node of nodes) {
		if (!node || typeof node.mode !== "number") continue;
		const bounds = getNodeBounds(node);
		const centerX = bounds[0] + bounds[2] * 0.5;
		const centerY = bounds[1] + bounds[3] * 0.5;
		if (
			centerX >= groupBounds[0] &&
			centerX < groupBounds[0] + groupBounds[2] &&
			centerY >= groupBounds[1] &&
			centerY < groupBounds[1] + groupBounds[3]
		) {
			inside.push(node);
		}
	}
	if (group._children?.clear) {
		group._children.clear();
		for (const node of inside) {
			group._children.add(node);
		}
	}
	if (Array.isArray(group._nodes)) {
		group._nodes.length = 0;
		group._nodes.push(...inside);
	}
	if (Array.isArray(group.nodes)) {
		group.nodes.length = 0;
		group.nodes.push(...inside);
	}
	return inside;
}

function getGroupNodes(group) {
	if (!group) return [];
	if (!app.canvas?.selected_group_moving) {
		return recomputeInsideNodesForGroup(group);
	}
	if (group._children) {
		return Array.from(group._children).filter((child) => child && typeof child.mode === "number");
	}
	return Array.from(group._nodes || []).filter((child) => child && typeof child.mode === "number");
}

function getCurrentGraph() {
	return app.canvas?.getCurrentGraph?.() || app.graph || null;
}

function getWorkflowGraphs() {
	const rootGraph = app.graph || getCurrentGraph();
	const graphs = [];
	if (rootGraph) {
		graphs.push(rootGraph);
	}
	const subgraphs = rootGraph?.subgraphs?.values?.();
	if (subgraphs) {
		let subgraph;
		while ((subgraph = subgraphs.next().value)) {
			graphs.push(subgraph);
		}
	}
	return graphs;
}

function isGroupAlive(group) {
	if (!group) return false;
	return getWorkflowGraphs().some((graph) => graph?._groups?.includes(group));
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
		const groups = [];
		for (const graph of getWorkflowGraphs()) {
			groups.push(...(graph?._groups || []));
		}
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
			SERVICE.scheduleRun(8);
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
			SERVICE.scheduleRun(8);
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
			SERVICE.scheduleRun(8);
			return true;
		}
		this.doModeChange();
		return true;
	}
}

class FastGroupsSpacerWidget {
	constructor() {
		this.name = SPACER_WIDGET_NAME;
		this.type = "custom";
		this.options = { serialize: false };
	}

	computeSize(width) {
		return [width, CONTENT_PADDING_Y];
	}

	draw() {}
}

function setupFastGroupsBypasser(node) {
	if (!node || node.__sdvnFastGroupsBypasserSetup) return;
	node.__sdvnFastGroupsBypasserSetup = true;
	node.serialize_widgets = false;
	node.modeOn = MODE_ALWAYS;
	node.modeOff = MODE_BYPASS;
	node.properties ||= {};
	node.properties[PROPERTY_SORT] ??= "alphanumeric";

	node.getRequiredHeight = function () {
		const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
		const contentHeight = (this.widgets || []).reduce((total, widget) => {
			const widgetSize = widget?.computeSize?.(this.size?.[0] || MIN_NODE_WIDTH);
			return total + (Array.isArray(widgetSize) ? widgetSize[1] || 0 : 0);
		}, 0);
		return titleHeight + contentHeight;
	};

	node.refreshWidgets = function () {
		const groups = SERVICE.getGroups(this.properties?.[PROPERTY_SORT] || "alphanumeric");
		const ensureSpacers = () => {
			let topSpacer = this.widgets?.[0];
			if (!(topSpacer instanceof FastGroupsSpacerWidget)) {
				topSpacer = this.addCustomWidget(new FastGroupsSpacerWidget());
				if (this.widgets?.length > 1) {
					const index = this.widgets.findIndex((w) => w === topSpacer);
					if (index > 0) {
						this.widgets.splice(0, 0, this.widgets.splice(index, 1)[0]);
					}
				}
			}

			let bottomSpacer = this.widgets?.[this.widgets.length - 1];
			if (!(bottomSpacer instanceof FastGroupsSpacerWidget) || bottomSpacer === topSpacer) {
				bottomSpacer = this.addCustomWidget(new FastGroupsSpacerWidget());
				const index = this.widgets.findIndex((w) => w === bottomSpacer);
				if (index > -1 && index !== this.widgets.length - 1) {
					this.widgets.push(this.widgets.splice(index, 1)[0]);
				}
			}

			return { topSpacer, bottomSpacer };
		};

		const { topSpacer, bottomSpacer } = ensureSpacers();
		if (Array.isArray(this.widgets)) {
			for (let i = this.widgets.length - 1; i >= 0; i--) {
				const widget = this.widgets[i];
				if (
					widget instanceof FastGroupsToggleRowWidget &&
					!groups.includes(widget.group)
				) {
					this.removeWidget(widget);
				}
			}
		}
		let index = 1;
		for (const group of groups) {
			group.sdvn_hasAnyActiveNode = getGroupNodes(group).some((n) => n.mode === MODE_ALWAYS);
			let widget = this.widgets?.find((w) => w instanceof FastGroupsToggleRowWidget && w.group === group);
			let isDirty = false;
			if (!widget) {
				widget = this.addCustomWidget(new FastGroupsToggleRowWidget(group, this));
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

		if (this.widgets?.[index] !== bottomSpacer) {
			const bottomSpacerIndex = this.widgets?.findIndex((w) => w === bottomSpacer) ?? -1;
			if (bottomSpacerIndex > -1) {
				this.widgets.splice(index, 0, this.widgets.splice(bottomSpacerIndex, 1)[0]);
			}
		}
		index++;

		while ((this.widgets || [])[index]) {
			const widget = this.widgets[index];
			if (widget === topSpacer || widget === bottomSpacer) {
				index++;
				continue;
			}
			this.removeWidget(widget);
		}

		const requiredHeight = this.getRequiredHeight();
		const targetHeight = Math.max(requiredHeight, DEFAULT_NODE_HEIGHT);
		const currentHeight = this.size?.[1] || DEFAULT_NODE_HEIGHT;
		if (currentHeight < targetHeight) {
			this.setSize([Math.max(this.size?.[0] || MIN_NODE_WIDTH, MIN_NODE_WIDTH), targetHeight]);
		}
	};

	const originalComputeSize = node.computeSize;
	node.computeSize = function (out) {
		const originalSize = originalComputeSize ? originalComputeSize.call(this, out) : [Math.max(this.size?.[0] || MIN_NODE_WIDTH, MIN_NODE_WIDTH), DEFAULT_NODE_HEIGHT];
		const requiredHeight = this.getRequiredHeight();
		const targetHeight = Math.max(requiredHeight, DEFAULT_NODE_HEIGHT);
		return [
			Math.max(originalSize[0] || 0, MIN_NODE_WIDTH),
			targetHeight,
		];
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
			setupFastGroupsBypasser(node);
		}
	},
});
