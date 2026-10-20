import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


NODE_DIR = Path(__file__).resolve().parents[1] / 'node'


@unittest.skipUnless(all(importlib.util.find_spec(name) for name in ('torch', 'torchvision', 'scipy', 'PIL')),
                     'Requires PyTorch, torchvision, scipy and Pillow')
class InpaintStitchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import torch
        cls.torch = torch
        spec = importlib.util.spec_from_file_location('sdvn_stitch_tests.inpaint_cropandstitch', NODE_DIR / 'inpaint_cropandstitch.py')
        cls.stitch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.stitch)

    def setUp(self):
        comfy = types.ModuleType('comfy')
        management = types.ModuleType('comfy.model_management')
        management.get_torch_device = lambda: self.torch.device('cpu')
        comfy.model_management = management
        self.modules = patch.dict(sys.modules, {'comfy': comfy, 'comfy.model_management': management})
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def stitcher(self, mode):
        mask = self.torch.full((1, 2, 3), 128 / 255)
        mask[:, 0, 0] = 0
        return {
            'device_mode': mode, 'downscale_algorithm': 'bilinear', 'upscale_algorithm': 'bicubic',
            'blend_pixels': 0, 'canvas_image': [self.torch.full((1, 4, 5, 3), .25)],
            'canvas_to_orig_x': [0], 'canvas_to_orig_y': [0],
            'canvas_to_orig_w': [5], 'canvas_to_orig_h': [4],
            'cropped_to_canvas_x': [1], 'cropped_to_canvas_y': [1],
            'cropped_to_canvas_w': [3], 'cropped_to_canvas_h': [2],
            'cropped_mask_for_blend': [mask],
        }

    def test_rgba_batch_respects_alpha_and_mask_in_both_processors(self):
        torch = self.torch
        for mode in ('cpu (compatible)', 'gpu (much faster)'):
            with self.subTest(mode=mode):
                source = torch.ones(3, 2, 3, 4)
                alphas = (0, 128 / 255, 1)
                for i, alpha in enumerate(alphas):
                    source[i, ..., 3] = alpha
                original_source = source.clone()
                stitcher = self.stitcher(mode)
                canvas = stitcher['canvas_image'][0].clone()
                result, = self.stitch.InpaintStitchImproved().inpaint_stitch(stitcher, source)
                expected = canvas.repeat(3, 1, 1, 1)
                for i, alpha in enumerate(alphas):
                    expected[i, 1:3, 1:4] += .75 * alpha * stitcher['cropped_mask_for_blend'][0][0].unsqueeze(-1)
                torch.testing.assert_close(result, expected)
                torch.testing.assert_close(result[0], canvas[0], rtol=0, atol=0)
                torch.testing.assert_close(source, original_source, rtol=0, atol=0)
                torch.testing.assert_close(stitcher['canvas_image'][0], canvas, rtol=0, atol=0)

    def test_opaque_rgba_matches_existing_rgb_output(self):
        torch = self.torch
        rgb = torch.arange(18).reshape(1, 2, 3, 3).float() / 17
        rgba = torch.cat((rgb, torch.ones(1, 2, 3, 1)), dim=-1)
        for mode in ('cpu (compatible)', 'gpu (much faster)'):
            with self.subTest(mode=mode):
                stitch = self.stitch.InpaintStitchImproved()
                rgb_result, = stitch.inpaint_stitch(self.stitcher(mode), rgb)
                rgba_result, = stitch.inpaint_stitch(self.stitcher(mode), rgba)
                torch.testing.assert_close(rgb_result, rgba_result, rtol=0, atol=0)

    def test_rgba_resize_up_and_down(self):
        torch = self.torch
        for mode in ('cpu (compatible)', 'gpu (much faster)'):
            for height, width in ((1, 1), (4, 6)):
                with self.subTest(mode=mode, size=(height, width)):
                    source = torch.ones(1, height, width, 4)
                    source[..., 3] = 128 / 255
                    stitcher = self.stitcher(mode)
                    expected = stitcher['canvas_image'][0].clone()
                    expected[:, 1:3, 1:4] += .75 * (128 / 255) * stitcher['cropped_mask_for_blend'][0].unsqueeze(-1)
                    result, = self.stitch.InpaintStitchImproved().inpaint_stitch(stitcher, source)
                    torch.testing.assert_close(result, expected)

    def test_sdvn_loop_stitch_accepts_rgba(self):
        package = types.ModuleType('sdvn_stitch_tests')
        package.__path__ = [str(NODE_DIR)]
        nodes = types.ModuleType('nodes')
        nodes.NODE_CLASS_MAPPINGS = {}
        folder_paths = types.ModuleType('folder_paths')
        folder_paths.models_dir = str(NODE_DIR.parent / 'models')
        with patch.dict(sys.modules, {
            'sdvn_stitch_tests': package, 'sdvn_stitch_tests.inpaint_cropandstitch': self.stitch,
            'nodes': nodes, 'folder_paths': folder_paths,
        }):
            spec = importlib.util.spec_from_file_location('sdvn_stitch_tests.mask', NODE_DIR / 'mask.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            source = self.torch.ones(1, 2, 3, 4)
            source[..., 3] = 0
            stitcher = self.stitcher('cpu (compatible)')
            result, = module.LoopInpaintStitch().inpaint_stitch([stitcher], [source])
            self.torch.testing.assert_close(result, stitcher['canvas_image'][0], rtol=0, atol=0)


if __name__ == '__main__':
    unittest.main()
