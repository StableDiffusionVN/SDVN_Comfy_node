import { api } from "/scripts/api.js";
import { ComfyDialog, $el } from "/scripts/ui.js";

let styleInjected = false;

function ensureStyles() {
	if (styleInjected) return;
	styleInjected = true;
	const style = document.createElement("style");
	style.textContent = `
		.sdvn-chooser-dialog { max-width: 760px; }
		.sdvn-chooser-title { font-size: 18px; font-weight: 700; text-align: center; color: var(--input-text, #fff); margin: 0 0 12px; }
		.sdvn-chooser-images { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
		.sdvn-chooser-item { position: relative; cursor: pointer; border-radius: 10px; overflow: hidden; border: 2px solid transparent; background: rgba(255,255,255,0.04); }
		.sdvn-chooser-item:hover { border-color: rgba(255,255,255,0.2); }
		.sdvn-chooser-item.selected { border-color: #43a047; box-shadow: 0 0 0 1px rgba(67,160,71,0.5) inset; }
		.sdvn-chooser-item img { display: block; width: 100%; height: auto; filter: brightness(0.9); }
		.sdvn-chooser-item.selected img { filter: brightness(1); }
		.sdvn-chooser-badge { position: absolute; top: 8px; right: 8px; min-width: 26px; height: 26px; border-radius: 999px; background: rgba(0,0,0,0.7); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
	`;
	document.head.appendChild(style);
}

async function sendChooserMessage(nodeId, action, selected = []) {
	return api.fetchApi("/sdvn/image_chooser_message", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			node_id: nodeId,
			action,
			selected,
		}),
	});
}

class SDVNChooserDialog extends ComfyDialog {
	constructor() {
		super();
		this.nodeId = null;
		this.selected = new Set();
	}

	showChooser(nodeId, urls) {
		this.nodeId = nodeId;
		this.selected = new Set();
		ensureStyles();

		const items = urls.map((url, index) => {
			const badge = $el("div.sdvn-chooser-badge", { textContent: `${index + 1}` });
			const image = $el("img", { src: api.apiURL(`/view?filename=${encodeURIComponent(url.filename)}&type=${encodeURIComponent(url.type)}&subfolder=${encodeURIComponent(url.subfolder || "")}`) });
			const item = $el("div.sdvn-chooser-item", {
				onclick: () => {
					if (this.selected.has(index)) {
						this.selected.delete(index);
						item.classList.remove("selected");
					} else {
						this.selected.add(index);
						item.classList.add("selected");
					}
				},
			}, [image, badge]);
			return item;
		});

		super.show($el("div.sdvn-chooser-dialog", [
			$el("h5.sdvn-chooser-title", "Choose images to continue"),
			$el("div.sdvn-chooser-images", items),
		]));
	}

	createButtons() {
		const buttons = super.createButtons();
		buttons[0].onclick = async () => {
			if (this.nodeId != null) {
				await sendChooserMessage(this.nodeId, "cancel");
			}
			super.close();
		};
		buttons.unshift($el("button", {
			type: "button",
			textContent: "Choose Selected Images",
			onclick: async () => {
				if (this.nodeId != null && this.selected.size > 0) {
					await sendChooserMessage(this.nodeId, "select", [...this.selected]);
					super.close();
				}
			},
		}));
		return buttons;
	}
}

api.addEventListener("sdvn-image-choose", (event) => {
	const nodeId = event.detail?.id;
	const urls = event.detail?.urls || [];
	if (!nodeId || !urls.length) return;
	const dialog = new SDVNChooserDialog();
	dialog.showChooser(nodeId, urls);
});
