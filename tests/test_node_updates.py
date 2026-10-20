import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from importlib.metadata import PackageNotFoundError
from unittest.mock import MagicMock

from packaging.requirements import Requirement


ROOT = Path(__file__).resolve().parents[1]


def load_symbols(filename, names, namespace):
    tree = ast.parse((ROOT / filename).read_text())
    definitions = [node for node in tree.body
                   if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in names]
    exec(compile(ast.Module(body=definitions, type_ignores=[]), filename, 'exec'), namespace)
    return namespace


@unittest.skipUnless(importlib.util.find_spec('torch'), 'Requires PyTorch')
class ImageNodeUpdateTests(unittest.TestCase):
    def setUp(self):
        import torch
        self.torch = torch

    def test_mask_size_checks_entire_batch_and_inpaint_keeps_mask(self):
        torch = self.torch
        mask = torch.zeros(2, 8, 8)
        mask[1, 2:6, 2:6] = 1
        mask_size = load_symbols('node/mask.py', ['GetMaskSize'], {})['GetMaskSize']
        self.assertEqual(mask_size().get_size(mask), (4, 4))
        self.assertEqual(mask_size().get_size(torch.zeros_like(mask)), (0, 0))
        self.assertEqual(mask_size().get_size(mask[1]), (4, 4))
        encode, noise = MagicMock(), MagicMock()
        encode().encode.return_value = ({'samples': torch.zeros(2, 4, 1, 1)},)
        noise().set_mask.return_value = ({'noise_mask': mask},)
        nodes = {'SDVN Get Mask Size': mask_size, 'VAEEncode': encode, 'SetLatentNoiseMask': noise}
        cls = load_symbols('node/load.py', ['Inpaint'], {'ALL_NODE': nodes})['Inpaint']
        output = cls().encode(True, torch.ones(2, 8, 8, 3), object(), mask=mask)
        self.assertIs(noise().set_mask.call_args.args[1], mask)
        self.assertIs(output[2]['noise_mask'], mask)

    def test_crop_keeps_nonempty_masks_after_first_empty_image(self):
        torch = self.torch
        mask = torch.zeros(2, 8, 8)
        mask[1, 2:6, 2:6] = 1
        mask_size = load_symbols('node/mask.py', ['GetMaskSize'], {})['GetMaskSize']
        crop = MagicMock()
        crop().inpaint_crop.return_value = ({}, torch.ones(2, 8, 8, 3), mask)
        cls = load_symbols('node/mask.py', ['inpaint_crop'], {
            'ALL_NODE': {'SDVN Get Mask Size': mask_size}, 'InpaintCropImproved': crop,
        })['inpaint_crop']
        cls().inpaint_crop(torch.ones(2, 8, 8, 3), 512, 1.2, True, mask)
        self.assertIs(crop().inpaint_crop.call_args.args[-2], mask)

    def test_upscale_zero_dimension_and_scale(self):
        torch = self.torch
        def resize(samples, width, height, *args):
            return torch.nn.functional.interpolate(samples, size=(height, width), mode='nearest')
        cls = load_symbols('node/load.py', ['UpscaleImage'], {
            'os': os, 'json': json, '__file__': str(ROOT / 'node/load.py'),
            'folder_paths': types.SimpleNamespace(get_filename_list=lambda _: []),
            'comfy': types.SimpleNamespace(utils=types.SimpleNamespace(common_upscale=resize)),
        })['UpscaleImage']
        image = torch.ones(1, 20, 40, 3)
        for width, height, expected in ((100, 0, (50, 100)), (0, 100, (100, 200)), (100, 100, (50, 100))):
            with self.subTest(size=(width, height)):
                result, = cls().upscale('Maxsize', width, height, 1, 'None', image)
                self.assertEqual(tuple(result.shape[1:3]), expected)
        result, = cls().upscale('Scale', 0, 0, 2, 'None', image)
        self.assertEqual(tuple(result.shape), (1, 40, 80, 3))
        result, = cls().upscale('Scale', 10, 10, 0, 'None', image)
        self.assertEqual(tuple(result.shape[1:3]), (1, 1))

    def test_white_balance_preserves_rgba_alpha_and_dtype(self):
        torch = self.torch
        cls = load_symbols('node/image.py', ['white_balance'], {'torch': torch})['white_balance']
        image = torch.full((2, 3, 4, 4), .5, dtype=torch.float16)
        image[..., 3] = .25
        result, = cls().white_balance(image, 20, -10)
        expected_rgb, = cls().white_balance(image[..., :3], 20, -10)
        self.assertEqual(result.dtype, image.dtype)
        torch.testing.assert_close(result[..., :3], expected_rgb)
        torch.testing.assert_close(result[..., 3], image[..., 3], rtol=0, atol=0)

    def test_fp8_export_works_on_cpu_and_keeps_integer_buffers(self):
        torch = self.torch
        cls = load_symbols('node/merge.py', ['ModelExport'], {'torch': torch})['ModelExport']
        integer = torch.tensor([1, 2], dtype=torch.int64)
        state = cls().unet_fp8({'weight': torch.tensor([1., -1.]), 'counter': integer})
        self.assertEqual(state['weight'].dtype, torch.float8_e4m3fn)
        self.assertEqual(state['weight'].device.type, 'cpu')
        self.assertIs(state['counter'], integer)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.pt'
            torch.save(state, path)
            loaded = torch.load(path, weights_only=True, map_location='cpu')
            torch.testing.assert_close(loaded['weight'].float(), torch.tensor([1., -1.]))

    def test_color_match_rgba_preserves_alpha_and_rgb_results(self):
        torch = self.torch

        def matcher(image, reference, method):
            self.assertEqual(image.shape[-1], 3)
            self.assertEqual(reference.shape[-1], 3)
            return image * .5 + reference.mean(dim=(0, 1)) * .5

        ns = load_symbols('node/image.py', [
            '_calc_mean_std', '_adaptive_instance_normalization', '_wavelet_blur',
            '_wavelet_decomposition', '_wavelet_color_fix_tensor', '_resolve_reference_image', 'color_match',
        ], {'torch': torch, 'tF': torch.nn.functional, '_color_match_color_matcher': matcher})
        node = ns['color_match']()
        image = torch.rand(2, 5, 7, 4, dtype=torch.float64)
        image[0, ..., 3] = 0
        ref = torch.rand(1, 6, 4, 4, dtype=torch.float64)
        methods = node.INPUT_TYPES()['required']['method'][0]
        for method in methods:
            for blend in (0., .5, 1.):
                expected, = node.color_match(image[..., :3], ref[..., :3], method, blend)
                rgba, = node.color_match(image, ref, method, blend)
                torch.testing.assert_close(rgba[..., :3], expected)
                torch.testing.assert_close(rgba[..., 3:], image[..., 3:], rtol=0, atol=0)
                self.assertEqual(rgba.dtype, image.dtype)
                self.assertEqual(rgba.device, image.device)
            mixed, = node.color_match(image[..., :3], ref, method, .5)
            self.assertEqual(mixed.shape[-1], 3)
        matched_batch, = node.color_match(image, image.flip(0), 'adain', .5)
        torch.testing.assert_close(matched_batch[..., 3:], image[..., 3:], rtol=0, atol=0)


class RequirementsUpdateTests(unittest.TestCase):
    def namespace(self, root, installed_version):
        return load_symbols('__init__.py', ['check_pip', 'install'], {
            'Requirement': Requirement, 'PackageNotFoundError': PackageNotFoundError,
            'version': installed_version, 'os': os, 'sys': sys,
            '__file__': str(root / '__init__.py'), 'subprocess': types.SimpleNamespace(check_call=MagicMock()),
        })

    def test_version_constraints_and_platform_markers(self):
        ns = self.namespace(ROOT, MagicMock(return_value='1.0'))
        self.assertFalse(ns['check_pip']('example>=2.0'))
        self.assertTrue(ns['check_pip']('example==1.0'))
        self.assertTrue(ns['check_pip']('example; python_version < "2.0"'))
        ns['version'].side_effect = PackageNotFoundError
        self.assertFalse(ns['check_pip']('missing'))

    def test_failed_install_does_not_mark_requirements_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            requirements = '# Comment\nfirst==2.0\nsecond>=2.0\n'
            (root / 'requirements.txt').write_text(requirements)
            marker = root / 'installed.txt'
            marker.write_text('previous successful installation')
            ns = self.namespace(root, MagicMock(return_value='1.0'))
            call = ns['subprocess'].check_call
            call.side_effect = subprocess.CalledProcessError(1, 'pip')
            with self.assertRaises(subprocess.CalledProcessError):
                ns['install']()
            self.assertEqual(marker.read_text(), 'previous successful installation')
            call.side_effect = None
            ns['install']()
            self.assertEqual(call.call_count, 2)
            self.assertEqual(marker.read_text(), requirements)
            self.assertFalse((root / 'installed.txt.tmp').exists())
            self.assertEqual(call.call_args.args[0][-2:], ['first==2.0', 'second>=2.0'])


if __name__ == '__main__':
    unittest.main()
