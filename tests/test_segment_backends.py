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
        model = {'backend': 'sam3', 'model': object(), 'clip': clip}
        with patch.object(self.nodes, 'groundingdino_predict', side_effect=AssertionError('DINO must be bypassed')):
            images, output = self.nodes.GroundingDinoSAMSegment().main(None, model, image, 'cat, dog:2', .4, .25)
        clip.tokenize.assert_called_once_with('cat:200, dog:2')
        self.assertEqual(tuple(output.shape), (2, 4, 6))
        self.assertEqual(images.sum().item(), 3)
        self.assertEqual(output[1].sum().item(), 0)
        self.assertEqual(detect.execute.call_args.kwargs['threshold'], .4)
        self.assertFalse(detect.execute.call_args.kwargs['individual_masks'])

    def test_sam3_combined_node_never_loads_dino_and_keeps_preview(self):
        torch = self.torch
        model = {'backend': 'sam3', 'model': object(), 'clip': MagicMock()}
        image = torch.ones(1, 4, 6, 3)
        mask = torch.ones(1, 4, 6)
        self.mapping['JoinImageWithAlpha'] = MagicMock()
        self.mapping['PreviewImage'] = MagicMock()
        self.mapping['PreviewImage']().save_images.return_value = {'ui': {'images': ['preview']}}
        with patch.object(self.nodes, 'load_sam_model', return_value=model), patch.object(
                self.nodes, 'load_groundingdino_model', side_effect=AssertionError('DINO must not load')), patch.object(
                self.backends, 'sam3_segment', return_value=(image, mask)):
            result = self.nodes.SegmentAnything().main('sam3 (native ComfyUI)', 'unused', image, 'cat', .3, .25)
        self.assertEqual(result['ui'], {'images': ['preview']})
        self.assertIs(result['result'][1], mask)

    def test_native_loader_uses_local_checkpoint_and_managed_model(self):
        self.mapping['SAM3_Detect'] = object
        model, clip = object(), object()
        self.stubs['comfy.sd'].load_checkpoint_guess_config = MagicMock(return_value=(model, clip, None, None))
        for repo, filename in (('facebook/sam3', 'sam3.pt'), ('facebook/sam3.1', 'sam3.1_multiplex.pt')):
            with self.subTest(repo=repo):
                path = Path(self.temp.name) / 'sams' / filename
                path.parent.mkdir(exist_ok=True)
                path.touch()
                loaded = self.backends.load_sam3(repo, filename)
                self.assertIs(loaded['model'], model)
                self.assertIs(loaded['clip'], clip)
                self.stubs['comfy.sd'].load_checkpoint_guess_config.assert_called_with(str(path), output_vae=False)

    def test_old_comfyui_fails_before_download(self):
        with self.assertRaisesRegex(RuntimeError, 'SAM3 Detect native'):
            self.backends.load_sam3('facebook/sam3', 'sam3.pt')
        self.mapping['SAM3_Detect'] = object
        del self.stubs['comfy.supported_models'].SAM31
        with self.assertRaisesRegex(RuntimeError, 'chưa hỗ trợ SAM 3.1'):
            self.backends.load_sam3('facebook/sam3.1', 'sam3.1_multiplex.pt')

    def test_native_download_is_limited_to_selected_checkpoint(self):
        self.mapping['SAM3_Detect'] = object
        self.stubs['comfy.sd'].load_checkpoint_guess_config = MagicMock(return_value=(object(), object(), None, None))
        hub = types.ModuleType('huggingface_hub')
        errors = types.ModuleType('huggingface_hub.errors')
        errors.GatedRepoError = type('GatedRepoError', (RuntimeError,), {})
        hub.hf_hub_download = MagicMock(return_value='/download/sam3.pt')
        with patch.dict(sys.modules, {'huggingface_hub': hub, 'huggingface_hub.errors': errors}):
            self.backends.load_sam3('facebook/sam3', 'sam3.pt')
            hub.hf_hub_download.assert_called_once_with(
                repo_id='facebook/sam3', filename='sam3.pt', local_dir=str(Path(self.temp.name) / 'sams'))
            hub.hf_hub_download.side_effect = errors.GatedRepoError('access denied')
            with self.assertRaisesRegex(RuntimeError, 'https://huggingface.co/facebook/sam3.1'):
                self.backends.load_sam3('facebook/sam3.1', 'sam3.1_multiplex.pt')

    def test_model_name_is_allowlisted(self):
        with patch.object(self.nodes, 'get_local_filepath') as download:
            with self.assertRaises(KeyError):
                self.nodes.load_sam_model('../../outside.pt')
        download.assert_not_called()


if __name__ == '__main__':
    unittest.main()
