import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch


NODE_DIR = Path(__file__).resolve().parents[1] / 'node'


@unittest.skipUnless(all(importlib.util.find_spec(name) for name in ('torch', 'numpy', 'PIL')),
                     'Requires PyTorch, NumPy and Pillow')
class YoloSegTests(unittest.TestCase):
    def setUp(self):
        import numpy as np
        import torch
        self.np, self.torch = np, torch
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        stubs = {name: types.ModuleType(name) for name in (
            'nodes', 'folder_paths', 'comfy', 'comfy.model_management',
            'ultralytics', 'sdvn_yolo_tests', 'sdvn_yolo_tests.inpaint_cropandstitch',
        )}
        stubs['folder_paths'].models_dir = self.temp.name
        stubs['comfy'].model_management = stubs['comfy.model_management']
        stubs['comfy.model_management'].get_torch_device = lambda: torch.device('cpu')
        stubs['sdvn_yolo_tests'].__path__ = [str(NODE_DIR)]
        stubs['sdvn_yolo_tests.inpaint_cropandstitch'].InpaintCropImproved = object
        stubs['sdvn_yolo_tests.inpaint_cropandstitch'].InpaintStitchImproved = object
        self.join, self.preview = MagicMock(), MagicMock()
        self.preview().save_images.return_value = {'ui': {'images': ['preview']}}
        stubs['nodes'].NODE_CLASS_MAPPINGS = {'JoinImageWithAlpha': self.join, 'PreviewImage': self.preview}
        self.names = {0: 'person', 1: 'cat'}
        self.model = MagicMock()
        self.model.names = self.names
        self.yolo = MagicMock(return_value=self.model)
        stubs['ultralytics'].YOLO = self.yolo
        modules = patch.dict(sys.modules, stubs)
        modules.start()
        self.addCleanup(modules.stop)
        spec = importlib.util.spec_from_file_location('sdvn_yolo_tests.mask', NODE_DIR / 'mask.py')
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.node = self.module.yoloseg()
        self.checkpoint = Path(self.node.yolo_dir) / 'yolo26n-seg.pt'
        self.checkpoint.parent.mkdir()
        self.checkpoint.touch()

    def prediction(self, masks=None, objects=0):
        result = types.SimpleNamespace(
            names=self.names, boxes=self.torch.zeros(objects, 6),
            masks=None if masks is None else types.SimpleNamespace(data=masks),
            plot=MagicMock(return_value=self.np.zeros((8, 12, 3), dtype=self.np.uint8)),
        )
        return result

    def run_node(self, predictions, image=None, model_name='yolo26n-seg.pt', ids=''):
        self.model.predict.return_value = iter(predictions)
        if image is None:
            image = self.torch.ones(len(predictions), 8, 12, 3)
        return self.node.yoloseg(image, model_name, .4, ids)['result']

    def test_overlapping_masks_are_union_and_names_are_not_mutated(self):
        torch = self.torch
        masks = torch.zeros(2, 8, 12)
        masks[0, :4, :6] = 1
        masks[1, :4, 3:9] = 1
        prediction = self.prediction(masks, objects=2)
        images, output, ids, count = self.run_node([prediction], ids='0, 1')
        self.assertEqual(tuple(output.shape), (1, 8, 12))
        self.assertEqual(output.max().item(), 1)
        self.assertEqual(output.sum().item(), 36)
        self.assertEqual(count, 2)
        self.assertEqual(ids, '0 - person\n1 - cat')
        self.assertEqual(self.names, {0: 'person', 1: 'cat'})
        self.assertEqual(prediction.names, {0: '0 - person', 1: '1 - cat'})
        self.assertEqual(images.shape[-1], 3)
        options = self.model.predict.call_args.kwargs
        self.assertEqual(options['classes'], [0, 1])
        self.assertTrue(options['retina_masks'])
        self.assertEqual(options['device'], 'cpu')
        self.assertTrue((self.join().execute.call_args.args[1] >= 0).all())

    def test_empty_images_keep_64_by_64_masks(self):
        for batch in (1, 2):
            with self.subTest(batch=batch):
                images, masks, _, count = self.run_node([self.prediction() for _ in range(batch)])
                self.assertEqual(tuple(masks.shape), (batch, 64, 64))
                self.assertEqual(masks.sum().item(), 0)
                self.assertEqual(tuple(images.shape), (batch, 8, 12, 3))
                self.assertEqual(count, 0)
        self.join.assert_not_called()

    def test_mixed_batch_aligns_empty_mask_and_accepts_rgba(self):
        torch = self.torch
        image = torch.ones(2, 8, 12, 4)
        images, masks, _, count = self.run_node([
            self.prediction(torch.ones(1, 8, 12), objects=1), self.prediction(),
        ], image=image)
        self.assertEqual(tuple(images.shape), (2, 8, 12, 3))
        self.assertEqual(tuple(masks.shape), (2, 8, 12))
        self.assertEqual(masks[0].sum().item(), 96)
        self.assertEqual(masks[1].sum().item(), 0)
        self.assertEqual(count, 1)
        self.assertTrue(all(source.mode == 'RGB' for source in self.model.predict.call_args.args[0]))
        self.assertEqual(self.join().execute.call_args.args[0].shape[-1], 3)

    def test_detection_only_checkpoint_still_returns_empty_mask(self):
        _, masks, _, count = self.run_node([self.prediction(objects=2)])
        self.assertEqual(tuple(masks.shape), (1, 64, 64))
        self.assertEqual(count, 2)

    def test_yolo26_downloads_from_official_huggingface(self):
        for scale in ('n', 's', 'm', 'l', 'x'):
            name = f'yolo26{scale}-seg.pt'
            with self.subTest(model=name), patch.object(self.module.os.path, 'isfile', return_value=False), patch.object(
                    self.module, 'download_url_to_file') as download:
                self.run_node([self.prediction()], model_name=name)
                download.assert_called_once_with(
                    f'https://huggingface.co/Ultralytics/YOLO26/resolve/main/{name}',
                    str(Path(self.node.yolo_dir) / name))

    def test_legacy_models_keep_sdvn_source_and_existing_files_are_reused(self):
        name = 'face_yolov8n-seg2_60.pt'
        with patch.object(self.module, 'download_url_to_file') as download:
            self.run_node([self.prediction()], model_name=name)
            download.assert_called_once_with(self.module.base_url + name, str(Path(self.node.yolo_dir) / name))
            download.reset_mock()
            self.run_node([self.prediction()])
            download.assert_not_called()

    def test_unadvertised_model_path_is_rejected_before_access(self):
        with patch.object(self.module, 'download_url_to_file') as download:
            with self.assertRaises(ValueError):
                self.run_node([self.prediction()], model_name='../outside.pt')
        self.yolo.assert_not_called()
        download.assert_not_called()


if __name__ == '__main__':
    unittest.main()
