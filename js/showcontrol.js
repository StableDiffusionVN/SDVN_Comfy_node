import { app } from "../../scripts/app.js";

function chainCallback(object, property, callback) {
    if (!object) {
        console.error("Tried to add callback to non-existent object");
        return;
    }
    if (property in object) {
        const original = object[property];
        object[property] = function () {
            const result = original.apply(this, arguments);
            callback.apply(this, arguments);
            return result;
        };
    } else {
        object[property] = callback;
    }
}

function injectHidden(widget) {
    if (!widget) return;
    widget.computeSize = (target_width) => (widget.hidden ? [0, -4] : [target_width, 20]);
    widget._type = widget.type;
    Object.defineProperty(widget, "type", {
        get() {
            return widget.hidden ? "sdvnhide" : widget._type;
        },
        set(val) {
            widget._type = val;
        }
    });
}

function addShowControl(nodeType, nodeData) {
    chainCallback(nodeType.prototype, "onNodeCreated", function () {
        const node = this;

        const showConfigs = {
            "SDVN Auto Generate": {
                controller: "AdvSetting",
                keepSize: true,
                targets: (v) => ({
                    cfg: v === true,
                    sampler_name: v === true,
                    scheduler: v === true,
                    FluxGuidance: v === true,
                    Upscale_model: v === true,
                    Auto_hires: v === true,
                    Kontext_model: v === true,
                })
			},
			"SDVN Load Image Ultimate": {
				controller: "mode",
				keepSize: true,
				targets: (v) => ({
					// image: v === "Input folder",
					folder_path: v === "Custom folder",
                    number_img: v === "Custom folder",
                    url: v === "Url",
                    pin_url: v === "Pintrest",
                    range: v === "Pintrest",
                    number: v === "Pintrest",
                    random: v === "Pintrest",
                    insta_url: v === "Insta",
                    index: v === "Insta"
                })
            },
            "SDVN Load Video": {
                controller: "trim_mode",
                keepSize: true,
                targets: (v) => ({
                    start_time: v !== "block",
                    end_time: v !== "block",
                    num_blocks: v === "block",
                    index: v === "block"
                })
            },
            "SDVN Save Text": {
                controller: "save_dir",
                targets: (v) => ({
                    custom_dir: v === "custom"
                })
            }
        };

        const config = showConfigs[node.comfyClass];
        if (!config) return;

        const controller = node.widgets?.find(w => w.name === config.controller);
        if (!controller) return;

        if (node.comfyClass === "SDVN Load Video") {
            const widgets = node.widgets;
            const originalOrder = [...widgets];
            const video = widgets.find(w => w.name === "video");
            if (video) {
                widgets.splice(widgets.indexOf(controller), 1);
                widgets.splice(widgets.indexOf(video) + 1, 0, controller);
                const minimax = widgets.find(w => w.name === "minimax_frame");
                if (minimax) {
                    widgets.splice(widgets.indexOf(minimax), 1);
                    const upload = widgets.findIndex(w =>
                        w.name === "upload" || w.name === "choose file to upload" ||
                        w.label === "choose file to upload"
                    );
                    widgets.splice(upload < 0 ? widgets.length : upload, 0, minimax);
                }

                // Saved workflows store widget values in schema order.
                const configure = node.configure;
                node.configure = function (...args) {
                    const displayOrder = [...widgets];
                    widgets.splice(0, widgets.length, ...originalOrder, ...displayOrder.filter(w => !originalOrder.includes(w)));
                    try {
                        return configure.apply(this, args);
                    } finally {
                        widgets.splice(0, widgets.length, ...displayOrder, ...widgets.filter(w => !displayOrder.includes(w)));
                    }
                };
                chainCallback(node, "onSerialize", function (data) {
                    if (data.widgets_values) {
                        data.widgets_values = [
                            ...originalOrder.map(w => data.widgets_values[widgets.indexOf(w)]),
                            ...widgets.flatMap((w, index) => originalOrder.includes(w) ? [] : [data.widgets_values[index]]),
                        ];
                    }
                });
            }
        }

        const visibilityMap = config.targets(controller.value);
        for (const name of Object.keys(visibilityMap)) {
            const widget = node.widgets?.find(w => w.name === name);
            if (widget) injectHidden(widget);
        }

        controller._value = controller.value;
        Object.defineProperty(controller, "value", {
            get() {
                return this._value;
            },
			set(val) {
				this._value = val;
				const visibility = config.targets(val);
				for (const [name, visible] of Object.entries(visibility)) {
					const widget = node.widgets?.find(w => w.name === name);
					if (widget) widget.hidden = !visible;
				}
				if (!config.keepSize) {
					node.setSize([node.size[0], node.computeSize()[1]]);
				} else {
					node.setDirtyCanvas(true, true);
				}
			}
		});

        controller.value = controller._value;
    });
}

app.registerExtension({
    name: "SDVN.ShowControl",
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (!nodeData?.name?.startsWith("SDVN")) return;

        addShowControl(nodeType, nodeData);
    }
});
