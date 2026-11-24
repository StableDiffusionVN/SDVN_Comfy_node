import ast
from dataclasses import dataclass, replace
from fractions import Fraction
import math
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock

import torch


@dataclass
class Components:
    images: object
    audio: object
    frame_rate: object = Fraction(24)
    alpha: object = None


class Video:
    def __init__(self, components):
        self.components = components

    def get_duration(self):
        return self.components.images.shape[0] / float(self.components.frame_rate)

    def get_components(self):
        return self.components

    def as_trimmed(self, start, duration, strict_duration=False):
        c = self.components
        fps = float(c.frame_rate)
        a = c.audio
        waveform = a['waveform'][..., round(start*a['sample_rate']):round((start+duration)*a['sample_rate'])]
        return Video(replace(c, images=c.images[round(start*fps):round((start+duration)*fps)],
                             audio={**a, 'waveform': waveform}))


class MediaInputTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / 'node/load.py').read_text())
        names = {'_media_time_range', '_minimax_length', '_video_block_range', '_slice_audio',
                 'SDVNLoadAudio', 'SDVNLoadVideo'}
        definitions = [n for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef)) and n.name in names]
        self.files = MagicMock()
        self.loader = MagicMock()
        self.ns = {'math': math, 'torch': torch, 'replace': replace, 'Fraction': Fraction,
                   'folder_paths': self.files, 'os': __import__('os'),
                   'ALL_NODE': {'LoadAudio': self.loader},
                   'InputImpl': SimpleNamespace(VideoFromFile=self.loader, VideoFromComponents=Video),
                   'ui': SimpleNamespace(PreviewAudio=lambda audio: SimpleNamespace(as_dict=lambda: {}))}
        exec(compile(ast.Module(body=definitions, type_ignores=[]), 'load.py', 'exec'), self.ns)
        self.audio = {'waveform': torch.arange(4000).reshape(1, 1, 4000), 'sample_rate': 1000}
        self.video = Video(Components(torch.arange(96).reshape(96, 1, 1, 1), self.audio))

    def test_audio_input_overrides_file_and_preserves_trimming(self):
        node = self.ns['SDVNLoadAudio']()
        for selected in ('None', 'selected.wav'):
            result = node.load_audio(selected, 1, 3, audio_input=self.audio)['result']
            self.assertEqual(result[1], 48)
            self.assertTrue(torch.equal(result[0]['waveform'], self.audio['waveform'][..., 1000:3000]))
        self.loader.execute.assert_not_called()
        self.files.get_annotated_filepath.assert_not_called()
        self.assertIsNone(node.IS_CHANGED('missing.wav', audio_input=self.audio))

    def test_video_input_overrides_file_and_preserves_blocks(self):
        node = self.ns['SDVNLoadVideo']()
        for selected in ('None', 'selected.mp4'):
            output = node.load_video(selected, 0, 0, trim_mode='block', num_blocks=2, index=1,
                                     video_input=self.video)
            self.assertEqual((output[2], output[3]), (24, 48))
            self.assertEqual(output[1][0].item(), 48)
            self.assertEqual(output[4]['waveform'].shape[-1], 2000)
        self.loader.assert_not_called()
        self.files.get_annotated_filepath.assert_not_called()
        self.assertIsNone(node.IS_CHANGED('missing.mp4', video_input=self.video))

    def test_file_fallback_and_no_source(self):
        audio_node, video_node = self.ns['SDVNLoadAudio'](), self.ns['SDVNLoadVideo']()
        self.assertEqual(audio_node.load_audio('None', 0, 0), (None, 0))
        self.assertEqual(video_node.load_video('None', 0, 0), (None, None, 0.0, 0, None))
        self.loader.execute.return_value = (self.audio,)
        self.loader.return_value = self.video
        self.assertEqual(audio_node.load_audio('selected.wav', 0, 0)['result'][1], 96)
        self.loader.execute.assert_called_once_with('selected.wav')
        self.assertEqual(video_node.load_video('selected.mp4', 0, 0)[3], 96)
        self.files.get_annotated_filepath.assert_called_once_with('selected.mp4')

    def test_connected_video_time_trim_and_minimax_audio(self):
        video = self.ns['SDVNLoadVideo']().load_video('None', 1, 3, video_input=self.video)
        self.assertEqual(video[3], 48)
        self.assertEqual(video[1][0].item(), 24)
        audio = self.ns['SDVNLoadAudio']().load_audio('None', 0, 0, minimax_frame=True,
                                                    audio_input=self.audio)['result']
        self.assertEqual(audio[1], 90)
        self.assertEqual(audio[0]['waveform'].shape[-1], 3750)


if __name__ == '__main__':
    unittest.main()
