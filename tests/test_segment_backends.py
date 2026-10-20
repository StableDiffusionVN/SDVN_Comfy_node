import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch


PACKAGE = Path(__file__).resolve().parents[1] / 'node' / 'segment_anything'


@unittest.skipUnless(importlib.util.find_spec('torch') and importlib.util.find_spec('PIL'),
                     'Requires PyTorch and Pillow')
class SegmentBackendTests(unittest.TestCase):
    def setUp(self):
        import torch
        self.torch = torch
        self.stubs = {name: types.ModuleType(name) for name in (
            'nodes', 'folder_paths', 'comfy', 'comfy.model_management',
            'comfy.sd', 'comfy.supported_models',
        )}
        self.mapping = {}
        self.stubs['nodes'].NODE_CLASS_MAPPINGS = self.mapping
        self.stubs['comfy'].model_management = self.stubs['comfy.model_management']
        self.stubs['comfy'].sd = self.stubs['comfy.sd']
        self.stubs['comfy'].supported_models = self.stubs['comfy.supported_models']
        self.stubs['comfy.model_management'].get_torch_device = lambda: torch.device('cpu')
        self.stubs['comfy.supported_models'].SAM31 = object
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.stubs['folder_paths'].models_dir = self.temp.name
        self.stubs['folder_paths'].get_full_path = lambda *args: None
        self.modules = patch.dict(sys.modules, self.stubs)
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.backends = self.load_module('sdvn_segment.backends', 'backends.py')
        sys.modules['sdvn_segment.backends'] = self.backends
        self.nodes = self.load_module('sdvn_segment.nodes', 'nodes.py')

    def load_module(self, name, filename):
        spec = importlib.util.spec_from_file_location(name, PACKAGE / filename)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_sam3_batch_empty_mask_and_detection_limits(self):
        torch = self.torch
        clip = MagicMock()
        image = torch.ones(2, 4, 6, 3)
        masks = torch.zeros(2, 4, 6)
        masks[0, 0, 0] = 1
        detect = MagicMock()
        detect.execute.return_value = (masks, [])
        self.mapping['SAM3_Detect'] = detect
        model = {'model': object(), 'clip': clip}
        with patch.object(self.nodes, 'groundingdino_predict', side_effect=AssertionError('DINO must be bypassed')):
            images, output = self.backends.sam31_segment(model, image, 'cat, dog:2', .4)
        clip.tokenize.assert_called_once_with('cat:200, dog:2')
        self.assertEqual(tuple(output.shape), (2, 4, 6))
        self.assertEqual(images.sum().item(), 3)
        self.assertEqual(output[1].sum().item(), 0)
        self.assertEqual(detect.execute.call_args.kwargs['threshold'], .4)
        self.assertFalse(detect.execute.call_args.kwargs['individual_masks'])

    def test_standalone_node_never_loads_dino_and_keeps_preview(self):
        torch = self.torch
        model = {'model': object(), 'clip': MagicMock()}
        image = torch.ones(1, 4, 6, 4)
        mask = torch.ones(1, 4, 6)
        self.mapping['JoinImageWithAlpha'] = MagicMock()
        self.mapping['PreviewImage'] = MagicMock()
        self.mapping['PreviewImage']().save_images.return_value = {'ui': {'images': ['preview']}}
        with patch.object(self.nodes, 'load_sam_model', side_effect=AssertionError('Legacy SAM must not load')), patch.object(
                self.nodes, 'load_groundingdino_model', side_effect=AssertionError('DINO must not load')), patch.object(
                self.backends, 'load_sam31', return_value=model), patch.object(
                self.backends, 'sam31_segment', return_value=(image[..., :3], mask)) as segment:
            result = self.nodes.SamSegment().main(image, 'cat', .3)
        self.assertEqual(result['ui'], {'images': ['preview']})
        self.assertIs(result['result'][1], mask)
        self.assertEqual(segment.call_args.args[1].shape[-1], 3)
        self.assertEqual(self.mapping['JoinImageWithAlpha']().execute.call_args.args[0].shape[-1], 3)

    def test_native_loader_uses_local_checkpoint_and_managed_model(self):
        self.mapping['SAM3_Detect'] = object
        model, clip = object(), object()
        self.stubs['comfy.sd'].load_checkpoint_guess_config = MagicMock(return_value=(model, clip, None, None))
        path = Path(self.temp.name) / 'sam3' / self.backends.SAM31_FILENAME
        path.parent.mkdir()
        path.touch()
        with patch.object(self.backends, 'download_url_to_file') as download:
            loaded = self.backends.load_sam31()
        self.assertIs(loaded['model'], model)
        self.assertIs(loaded['clip'], clip)
        self.stubs['comfy.sd'].load_checkpoint_guess_config.assert_called_once_with(str(path), output_vae=False)
        download.assert_not_called()

    def test_extra_checkpoint_path_is_reused(self):
        self.mapping['SAM3_Detect'] = object
        self.stubs['folder_paths'].get_full_path = MagicMock(return_value='/extra/sam31.safetensors')
        self.stubs['comfy.sd'].load_checkpoint_guess_config = MagicMock(return_value=(object(), object(), None, None))
        with patch.object(self.backends, 'download_url_to_file') as download:
            self.backends.load_sam31()
        self.stubs['folder_paths'].get_full_path.assert_called_once_with('sam3', self.backends.SAM31_FILENAME)
        self.stubs['comfy.sd'].load_checkpoint_guess_config.assert_called_once_with('/extra/sam31.safetensors', output_vae=False)
        download.assert_not_called()

    def test_old_comfyui_fails_before_download(self):
        with patch.object(self.backends, 'download_url_to_file') as download:
            with self.assertRaisesRegex(RuntimeError, 'SAM3 Detect native'):
                self.backends.load_sam31()
            self.mapping['SAM3_Detect'] = object
            del self.stubs['comfy.supported_models'].SAM31
            with self.assertRaisesRegex(RuntimeError, 'chưa hỗ trợ SAM 3.1'):
                self.backends.load_sam31()
        download.assert_not_called()

    def test_download_uses_public_comfy_org_checkpoint_without_auth(self):
        self.mapping['SAM3_Detect'] = object
        self.stubs['comfy.sd'].load_checkpoint_guess_config = MagicMock(return_value=(object(), object(), None, None))
        with patch.dict(sys.modules, {'huggingface_hub': None}), patch.object(
                self.backends, 'download_url_to_file') as download:
            self.backends.load_sam31()
        download.assert_called_once_with(
            'https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors',
            str(Path(self.temp.name) / 'sam3' / 'sam3.1_multiplex_fp16.safetensors'))

    def test_model_name_is_allowlisted(self):
        with patch.object(self.nodes, 'get_local_filepath') as download:
            with self.assertRaises(KeyError):
                self.nodes.load_sam_model('../../outside.pt')
        download.assert_not_called()


if __name__ == '__main__':
    unittest.main()
