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

function slider(label, max, value, step) {
	const input = document.createElement("input");
	input.type = "range";
	input.setAttribute("aria-label", label);
	input.max = max;
	input.value = value;
	input.step = step;
	return input;
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
		download.textContent = "Download";
		toolbar.append(selector, download);
		root.append(stage, toolbar);

		function show(index) {
			release();
			stage.replaceChildren();
			toolbar.querySelectorAll("button, input").forEach((element) => element.remove());
			const a = primary[index % primary.length];
			const b = reference[index % reference.length];
			download.href = mediaUrl(a);
			download.download = a.filename;
			const videos = [];

			function layer(entry) {
				const isVideo = entry.media_type === "video";
				const element = document.createElement(isVideo ? "video" : "img");
				element.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none";
				if (isVideo) {
					element.preload = "auto";
					element.playsInline = true;
					element.muted = true;
					videos.push(element);
				}
				element.src = mediaUrl(entry.preview ?? entry);
				stage.append(element);
				return element;
			}

			const base = layer(a);
			const overlay = b ? layer(b) : null;
			if (overlay) stage.append(divider);
			function hideComparison() {
				if (overlay) overlay.style.visibility = "hidden";
				divider.hidden = true;
			}
			stage.onpointerleave = hideComparison;
			stage.onpointermove = (event) => {
				if (!overlay) return;
				const bounds = stage.getBoundingClientRect();
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
				divider.style.top = divider.style.bottom = `${top / bounds.height * 100}%`;
				divider.hidden = false;
			};
			hideComparison();

			const master = videos[0];
			const follower = videos[1];
			if (!master) {
				release = () => {};
				return;
			}

			const play = document.createElement("button");
			play.type = "button";
			play.textContent = "Play";
			const seek = slider("Playback position", 0, 0, 0.01);
			seek.disabled = true;
			seek.style.cssText = "min-width:0;flex:1";
			toolbar.prepend(play, seek);

			function sync(force = false) {
				if (!follower || !Number.isFinite(follower.duration)) return;
				const time = Math.min(master.currentTime, follower.duration);
				if (force || Math.abs(follower.currentTime - time) > 0.15) follower.currentTime = time;
				if (master.paused || time >= follower.duration) follower.pause();
				else if (follower.paused) follower.play().catch(() => {});
			}

			play.onclick = () => {
				if (master.paused) {
					if (master.ended) master.currentTime = 0;
					master.play().catch(() => {});
				} else master.pause();
			};
			seek.oninput = () => { master.currentTime = Number(seek.value); };
			master.onloadedmetadata = () => {
				seek.max = master.duration;
				seek.disabled = !Number.isFinite(master.duration);
			};
			master.ontimeupdate = () => {
				seek.value = master.currentTime;
				sync();
			};
			master.onseeked = () => sync(true);
			master.onplay = master.onpause = master.onended = () => {
				play.textContent = master.paused ? "Play" : "Pause";
				sync(true);
			};
			if (follower) follower.onloadedmetadata = () => sync(true);

			release = () => {
				for (const video of videos) {
					video.onloadedmetadata = video.ontimeupdate = video.onseeked = null;
					video.onplay = video.onpause = video.onended = null;
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
