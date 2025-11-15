import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TARGET_NODE = "SDVN Save Image";
let canvasPatched = false;

function imageDataToUrl(data) {
	if (!data) return "";
	return api.apiURL(
		`/view?filename=${encodeURIComponent(data.filename)}&type=${data.type}&subfolder=${data.subfolder}${app.getPreviewFormatParam()}${app.getRandParam()}`
	);
}

function ensureState(node) {
	if (!node.__sdvnSaveCompare) {
		node.__sdvnSaveCompare = {
			images: [null, null],
			pointerX: null,
			isPointerOver: false,
		};
	}
	return node.__sdvnSaveCompare;
}

function loadImage(meta, node) {
	if (!meta) return null;
	const img = new Image();
	img.src = imageDataToUrl(meta);
	img.onload = () => node.setDirtyCanvas(true, false);
	return { meta, img };
}

function parsePayload(data) {
	const payload = data?.ui ?? data ?? {};
	const primaryList =
		(Array.isArray(payload.a_images) && payload.a_images.length) ||
		(Array.isArray(payload.images) && payload.images.length)
			? (payload.a_images && payload.a_images.length ? payload.a_images : payload.images)
			: [];
	const secondaryList = Array.isArray(payload.b_images) ? payload.b_images : [];
	return {
		primary: primaryList?.[0] ?? null,
		secondary: secondaryList?.[0] ?? null,
		disable: false,
	};
}

function updateImages(node, data) {
	const state = ensureState(node);
	const { primary, secondary, disable } = parsePayload(data);
	if (disable) {
		state.images = [null, null];
	} else {
		state.images = [loadImage(primary, node), loadImage(secondary, node)];
	}
	node.setDirtyCanvas(true, true);
}

function getDrawArea(node) {
	const titleHeight = LiteGraph.NODE_TITLE_HEIGHT ?? 28;
	const slotHeight = LiteGraph.NODE_SLOT_HEIGHT ?? 15;
	const inputsHeight = (node.inputs?.length ?? 0) * slotHeight;
	const outputsHeight = (node.outputs?.length ?? 0) * slotHeight;
	const baseY = titleHeight + inputsHeight + 4;
	const y = Math.max(baseY - 25, titleHeight);
	const marginX = 0;
	const width = Math.max(node.size[0] - marginX * 2, 0);
	const height = Math.max(node.size[1] - y - outputsHeight - 15, 0);
	return { x: marginX, y, width, height };
}

function pointInArea(area, pos) {
	if (!area || !pos) return false;
	return (
		pos[0] >= area.x &&
		pos[0] <= area.x + area.width &&
		pos[1] >= area.y &&
		pos[1] <= area.y + area.height
	);
}

function drawImage(ctx, img, area, clipX) {
	const { x, y, width, height } = area;
	const imgAspect = img.naturalWidth / img.naturalHeight;
	const boxAspect = width / (height || 1);
	let targetWidth;
	let targetHeight;
	let destX;
	let destY;

	if (imgAspect > boxAspect) {
		targetWidth = width;
		targetHeight = width / imgAspect;
		destX = x;
		destY = y + (height - targetHeight) / 2;
	} else {
		targetHeight = height;
		targetWidth = height * imgAspect;
		destX = x + (width - targetWidth) / 2;
		destY = y;
	}

	if (clipX != null) {
		const clamped = Math.min(Math.max(clipX, destX), destX + targetWidth);
		ctx.save();
		ctx.beginPath();
		ctx.rect(destX, destY, Math.max(clamped - destX, 0), targetHeight);
		ctx.clip();
		ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, destX, destY, targetWidth, targetHeight);
		ctx.restore();
		return { destX, destY, destWidth: targetWidth, destHeight: targetHeight, clipX: clamped };
	}

	ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, destX, destY, targetWidth, targetHeight);
	return { destX, destY, destWidth: targetWidth, destHeight: targetHeight };
}

function hasOverlayImages(state) {
	return !!(state.images?.[1]?.img && state.images[1].img.naturalWidth && state.images[1].img.naturalHeight);
}

function drawCompare(ctx) {
	const state = ensureState(this);
	const base = state.images?.[0]?.img;
	if (!base || !base.naturalWidth || !base.naturalHeight) return;

	const area = getDrawArea(this);
	if (area.width <= 0 || area.height <= 0) return;

	ctx.save();
	ctx.beginPath();
	ctx.rect(area.x, area.y, area.width, area.height);
	ctx.clip();

	const baseRect = drawImage(ctx, base, area);
	let lineX = null;
	const overlay = state.images?.[1]?.img;
	const hasOverlay = state.isPointerOver && hasOverlayImages(state);
	if (hasOverlay && overlay) {
		const pointerX = state.pointerX ?? this.size[0] / 2;
		const clamp = Math.min(Math.max(pointerX, baseRect.destX), baseRect.destX + baseRect.destWidth);
		drawImage(ctx, overlay, area, clamp);
		lineX = clamp;
	}

	ctx.restore();

	if (lineX != null) {
		ctx.save();
		ctx.strokeStyle = "rgba(255,255,255,0.9)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(lineX, area.y);
		ctx.lineTo(lineX, area.y + area.height);
		ctx.stroke();
		ctx.restore();
	}
}

function ensureCanvasPatched() {
	if (canvasPatched || !globalThis.LiteGraph?.LGraphCanvas) return;
	canvasPatched = true;
	const proto = LiteGraph.LGraphCanvas.prototype;
	const originalDrawNode = proto.drawNode;
	proto.drawNode = function (node) {
		const result = originalDrawNode.apply(this, arguments);
		if (node?.__sdvnSaveCompareDraw && typeof node.__sdvnSaveCompareDraw === "function") {
			node.__sdvnSaveCompareDraw(this.ctx);
		}
		return result;
	};
}

app.registerExtension({
	name: "SDVN.SaveImageCompare",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== TARGET_NODE || nodeType.prototype.__sdvnSaveComparePatched) return;

		nodeType.prototype.__sdvnSaveComparePatched = true;

		ensureCanvasPatched();

		const originalNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const r = originalNodeCreated?.apply(this, arguments);
			const state = ensureState(this);
			if (this.size) {
				this.size[0] = Math.max(this.size[0], 260);
				this.size[1] = Math.max(this.size[1], 260);
			}
			this.__sdvnSaveCompareDraw = (ctx) => drawCompare.call(this, ctx);
			return r;
		};

		const originalExecuted = nodeType.prototype.onExecuted;
		nodeType.prototype.onExecuted = function () {
			const result = originalExecuted?.apply(this, arguments);
			updateImages(this, arguments[0]);
			return result;
		};

		const originalResize = nodeType.prototype.onResize;
		nodeType.prototype.onResize = function (size) {
			if (size) {
				size[0] = Math.max(size[0], 220);
				size[1] = Math.max(size[1], 220);
			}
			return originalResize?.apply(this, arguments) ?? size;
		};

		const originalMouseMove = nodeType.prototype.onMouseMove;
		nodeType.prototype.onMouseMove = function (event, pos, canvas) {
			const result = originalMouseMove?.apply(this, arguments);
			const state = ensureState(this);
			const area = getDrawArea(this);
			if (pos) {
				state.pointerX = pos[0];
			}
			state.isPointerOver = pointInArea(area, pos) && hasOverlayImages(state);
			this.setDirtyCanvas?.(true, false);
			return result;
		};

		const originalMouseEnter = nodeType.prototype.onMouseEnter;
		nodeType.prototype.onMouseEnter = function () {
			const result = originalMouseEnter?.apply(this, arguments);
			const state = ensureState(this);
			state.isPointerOver = true;
			this.setDirtyCanvas?.(true, false);
			return result;
		};

		const originalMouseLeave = nodeType.prototype.onMouseLeave;
		nodeType.prototype.onMouseLeave = function () {
			const result = originalMouseLeave?.apply(this, arguments);
			const state = ensureState(this);
			state.isPointerOver = false;
			state.pointerX = null;
			this.setDirtyCanvas?.(true, false);
			return result;
		};
	},
});
