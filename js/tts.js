import { app } from "/scripts/app.js";

const voices = await fetch(new URL("./tts_voices.json", import.meta.url)).then(r => {
    if (!r.ok) throw new Error("SDVN TTS: Cannot load voice list");
    return r.json();
});

function updateTones(node) {
    const model = node.widgets?.find(w => w.name === "model");
    const tone = node.widgets?.find(w => w.name === "tone");
    const values = voices[model?.value];
    if (!tone || !values) return;
    tone.options.values = [...values];
    if (!values.includes(tone.value)) tone.value = values[0];
    node.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "SDVN.TTS",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "SDVN TTS") return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            const model = this.widgets.find(w => w.name === "model");
            const callback = model.callback;
            model.callback = (...values) => {
                callback?.apply(model, values);
                updateTones(this);
            };
            updateTones(this);
            return result;
        };
        const configured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = configured?.apply(this, args);
            updateTones(this);
            return result;
        };
    },
});
