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
                node.setSize([node.size[0], node.computeSize()[1]]);
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