import ast
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock


ROOT = Path(__file__).resolve().parents[1]


class TTSTests(unittest.TestCase):
    def setUp(self):
        source = ast.parse((ROOT / "node/tts.py").read_text())
        definitions = [node for node in source.body if isinstance(node, ast.ClassDef)]
        self.factory = MagicMock()
        self.torch = MagicMock()
        self.voices = json.loads((ROOT / "js/tts_voices.json").read_text())
        namespace = {"Vieneu": self.factory, "torch": self.torch,
                     "TTS_VOICES": self.voices,
                     "TTS_MODES": {name: mode for name, mode in zip(self.voices, ("v3turbo", "v3nano"))}}
        exec(compile(ast.Module(body=definitions, type_ignores=[]), "tts.py", "exec"), namespace)
        self.node = namespace["SDVNTTS"]()

    def test_models_voice_selection_and_audio_contract(self):
        for model, mode, rate in [("VieNeu-TTS-v3-Turbo", "v3turbo", 48000),
                                  ("VieNeu-TTS-v3-Nano", "v3nano", 24000)]:
            with self.subTest(model=model):
                tts = self.factory.return_value
                tts.sample_rate = rate
                voice = self.voices[model][0]
                result, = self.node.speak(model, voice, "Xin chào")
                self.factory.assert_called_with(mode=mode, backbone_repo=f"pnnbao-ump/{model}",
                                                device="cpu", backend="onnx")
                tts.infer.assert_called_with("Xin chào", voice=voice)
                self.torch.from_numpy.return_value.float.return_value.reshape.assert_called_with(1, 1, -1)
                self.assertEqual(result["sample_rate"], rate)
                self.assertIs(result["waveform"], self.torch.from_numpy.return_value.float.return_value.reshape.return_value)
                tts.close.assert_called()

    def test_invalid_model_or_voice_does_not_download(self):
        with self.assertRaises(KeyError):
            self.node.speak("../other", "Adam", "test")
        with self.assertRaises(ValueError):
            self.node.speak("VieNeu-TTS-v3-Nano", "invalid voice", "test")
        self.factory.assert_not_called()

    def test_inference_failure_closes_engine(self):
        self.factory.return_value.infer.side_effect = RuntimeError("inference failed")
        model = "VieNeu-TTS-v3-Nano"
        with self.assertRaisesRegex(RuntimeError, "inference failed"):
            self.node.speak(model, self.voices[model][0], "test")
        self.factory.return_value.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
