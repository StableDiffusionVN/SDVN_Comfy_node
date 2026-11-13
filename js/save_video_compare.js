import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function mediaUrl(entry) {
	const params = new URLSearchParams({
		filename: entry.filename,
		subfolder: entry.subfolder,
		type: entry.type,
	});
	return api.apiURL(`/view?${params}`);
}

function createPreview(node) {
	const root = document.createElement("div");
	root.style.cssText = "display:flex;flex-direction:column;gap:6px;min-height:0;height:100%";
	const widget = node.addDOMWidget("media_compare", "div", root, {
		serialize: false,
		getMinHeight: () => 260,
	});
	widget.computeSize = (width) => [width, 260];
	function resize(height) {
		const minimum = node.computeSize()[1];
		root.style.height = `${260 + Math.max(0, height - minimum)}px`;
	}
	let release = () => {};

	function update(primary, reference) {
		release();
		root.replaceChildren();
		if (!primary.length) return;

		const stage = document.createElement("div");
		stage.style.cssText = "position:relative;flex:1;min-height:0;background:#181818;overflow:hidden";
		const divider = document.createElement("div");
		divider.style.cssText = "position:absolute;inset:0 auto 0 50%;width:2px;background:white;pointer-events:none";
		const toolbar = document.createElement("div");
		toolbar.style.cssText = "display:flex;align-items:center;gap:6px";
		const count = Math.max(primary.length, reference.length);
		const selector = document.createElement("select");
		selector.setAttribute("aria-label", "Preview item");
		for (let index = 0; index < count; index++) {
			selector.add(new Option(`${index + 1} / ${count}`, index));
		}
		selector.hidden = count < 2;
		const download = document.createElement("a");
		download.title = "Download";
		download.setAttribute("aria-label", "Download");
		download.style.cssText = "position:absolute;top:8px;right:8px;z-index:2;display:inline-flex;padding:6px;border-radius:6px;color:white;background:#0009";
		download.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/></svg>';
		toolbar.append(selector);
		root.append(stage);
		if (count > 1) root.append(toolbar);

		function show(index) {
			release();
			stage.replaceChildren();
			const a = primary[index % primary.length];
			const b = reference[index % reference.length];
			download.href = mediaUrl(a);
			download.download = a.filename;
			const videos = [];

			function layer(entry, primaryLayer = false) {
				const isVideo = entry.media_type === "video";
				const element = document.createElement(isVideo ? "video" : "img");
				element.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none";
				if (isVideo) {
					element.preload = "auto";
					element.playsInline = true;
					element.muted = !primaryLayer;
					element.controls = primaryLayer || a.media_type !== "video";
					element.loop = element.controls;
					if (element.controls) element.style.pointerEvents = "auto";
					videos.push(element);
				}
				element.src = mediaUrl(entry.preview ?? entry);
				stage.append(element);
				return element;
			}

			const base = layer(a, true);
			const overlay = b ? layer(b) : null;
			if (overlay) stage.append(divider);
			stage.append(download);
			const referencePlayer = overlay?.controls === true;
			const controlsHeight = 48;
			function hideComparison() {
				if (referencePlayer) {
					overlay.style.clipPath = `inset(calc(100% - ${controlsHeight}px) 0 0)`;
				} else if (overlay) overlay.style.visibility = "hidden";
				divider.hidden = true;
			}
			stage.onpointerleave = hideComparison;
			stage.onpointermove = (event) => {
				if (!overlay) return;
				const bounds = stage.getBoundingClientRect();
				const localY = (event.clientY - bounds.top) / bounds.height * stage.clientHeight;
				if (download.contains(event.target) ||
					((base.controls || referencePlayer) && localY >= stage.clientHeight - controlsHeight)) {
					hideComparison();
					return;
				}
				const width = base.videoWidth || base.naturalWidth;
				const height = base.videoHeight || base.naturalHeight;
				if (!width || !height || !bounds.width || !bounds.height) return;
				const scale = Math.min(bounds.width / width, bounds.height / height);
				const left = (bounds.width - width * scale) / 2;
				const top = (bounds.height - height * scale) / 2;
				const x = Math.max(left, Math.min(bounds.width - left, event.clientX - bounds.left));
				const split = x / bounds.width * 100;
				overlay.style.clipPath = `inset(0 ${100 - split}% 0 0)`;
				overlay.style.visibility = "visible";
				divider.style.left = `${split}%`;
				divider.style.top = `${top / bounds.height * 100}%`;
				divider.style.bottom = divider.style.top;
				divider.hidden = false;
			};
			hideComparison();

			const master = videos[0];
			const follower = videos[1];
			if (!master) {
				release = () => {};
				return;
			}

			function sync(force = false) {
				if (!follower || !Number.isFinite(follower.duration)) return;
				follower.playbackRate = master.playbackRate;
				const time = Math.min(master.currentTime, follower.duration);
				if (force || Math.abs(follower.currentTime - time) > 0.15) follower.currentTime = time;
				if (master.paused || time >= follower.duration) follower.pause();
				else if (follower.paused) follower.play().catch(() => {});
			}

			master.ontimeupdate = () => sync();
			master.onseeked = master.onplay = master.onpause = master.onratechange = () => sync(true);
			if (follower) follower.onloadedmetadata = () => sync(true);

			release = () => {
				for (const video of videos) {
					video.onloadedmetadata = video.ontimeupdate = video.onseeked = null;
					video.onplay = video.onpause = video.onratechange = null;
					video.pause();
					video.removeAttribute("src");
					video.load();
				}
			};
		}

		selector.onchange = () => show(Number(selector.value));
		show(0);
	}

	return { update, resize, dispose: () => release() };
}

app.registerExtension({
	name: "SDVN.SaveVideoCompare",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "SDVN Save Video Compare") return;

		const created = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function (...args) {
			const result = created?.apply(this, args);
			this.sdvnVideoCompare = createPreview(this);
			this.setSize(this.computeSize());
			return result;
		};

		const executed = nodeType.prototype.onExecuted;
		nodeType.prototype.onExecuted = function (output) {
			executed?.apply(this, arguments);
			this.sdvnVideoCompare?.update(output.sdvn_compare_primary ?? [], output.sdvn_compare_reference ?? []);
			this.sdvnVideoCompare?.resize(this.size[1]);
		};

		const resized = nodeType.prototype.onResize;
		nodeType.prototype.onResize = function (size) {
			const result = resized?.apply(this, arguments);
			this.sdvnVideoCompare?.resize(size[1]);
			return result;
		};

		const removed = nodeType.prototype.onRemoved;
		nodeType.prototype.onRemoved = function (...args) {
			this.sdvnVideoCompare?.dispose();
			return removed?.apply(this, args);
		};
	},
});
