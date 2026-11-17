import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "SDVN.LoadAudio",
    beforeRegisterNodeDef(_nodeType, nodeData) {
        if (nodeData.name !== "SDVN Load Audio") return;
        const required = nodeData.input?.required;
        if (!required?.audio?.[1]?.audio_upload) return;

        // Comfy's AUDIOUPLOAD widget expects the native player to exist first.
        const upload = required.upload;
        delete required.upload;
        required.audioUI = ["AUDIO_UI", {}];
        if (upload) required.upload = upload;
    },
});
