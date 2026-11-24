import json
from pathlib import Path

import torch

try:
    from vieneu import Vieneu
except ImportError:
    Vieneu = None


# Preset names from vieneu 3.8.5 assets/voices_v3_{turbo,nano}.json.
with (Path(__file__).parent.parent / "js" / "tts_voices.json").open(encoding="utf-8") as file:
    TTS_VOICES = json.load(file)

TTS_MODES = {"VieNeu-TTS-v3-Turbo": "v3turbo", "VieNeu-TTS-v3-Nano": "v3nano"}


class SDVNTTS:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": (list(TTS_MODES),),
            "tone": (list(dict.fromkeys(name for voices in TTS_VOICES.values() for name in voices)),),
            "text": ("STRING", {"default": "Xin chào!", "multiline": True}),
        }}

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "speak"
    CATEGORY = "📂 SDVN/🔊 Audio"
    DESCRIPTION = "VieNeu TTS chạy ONNX/CPU. Model tự tải vào cache Hugging Face khi chạy lần đầu."

    def speak(self, model, tone, text):
        mode = TTS_MODES[model]
        if tone not in TTS_VOICES[model]:
            raise ValueError(f"Giọng {tone!r} không thuộc {model}. Hãy chọn lại tone.")
        if Vieneu is None:
            raise RuntimeError("Thiếu vieneu. Cài requirements.txt bằng Python của ComfyUI rồi khởi động lại.")
        tts = Vieneu(mode=mode, backbone_repo=f"pnnbao-ump/{model}", device="cpu", backend="onnx")
        try:
            audio = tts.infer(text, voice=tone)
            waveform = torch.from_numpy(audio.copy()).float().reshape(1, 1, -1)
            return ({"waveform": waveform, "sample_rate": tts.sample_rate},)
        finally:
            tts.close()


NODE_CLASS_MAPPINGS = {"SDVN TTS": SDVNTTS}
NODE_DISPLAY_NAME_MAPPINGS = {"SDVN TTS": "🔊 SDVN TTS"}
