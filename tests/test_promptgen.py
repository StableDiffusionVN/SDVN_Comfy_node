import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(importlib.util.find_spec('torch'), 'Requires PyTorch')
class PromptGenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import torch
        cls.torch = torch
        try:
            from transformers import Florence2ForConditionalGeneration
        except ImportError as error:
            raise unittest.SkipTest('Requires native Florence2 in Transformers >=4.57.6') from error

    def setUp(self):
        torch = self.torch
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        stubs = {name: types.ModuleType(name) for name in (
            'folder_paths', 'comfy', 'comfy.model_management', 'comfy.model_patcher',
            'comfy.utils', 'comfy.ldm', 'comfy.ldm.modules', 'comfy.ldm.modules.attention',
        )}
        stubs['folder_paths'].models_dir = self.temp.name
        self.mm = stubs['comfy.model_management']
        self.mm.load_models_gpu = MagicMock()
        self.mm.unload_model_and_clones = MagicMock()
        self.mm.throw_exception_if_processing_interrupted = MagicMock()
        stubs['comfy.model_patcher'].ModelPatcher = MagicMock()
        stubs['comfy.utils'].ProgressBar = MagicMock()

        def attention(query, key, value, heads, mask=None, **kwargs):
            output = torch.nn.functional.scaled_dot_product_attention(query, key, value, attn_mask=mask)
            return output.transpose(1, 2).reshape(query.shape[0], query.shape[2], -1)

        stubs['comfy.ldm.modules.attention'].optimized_attention_for_device = MagicMock(return_value=attention)
        modules = patch.dict(sys.modules, stubs)
        modules.start()
        self.addCleanup(modules.stop)
        spec = importlib.util.spec_from_file_location('sdvn_test_promptgen', ROOT / 'node/promptgen.py')
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.model = MagicMock(dtype=torch.float32)
        self.model.generate.return_value = torch.ones(1, 3, dtype=torch.long)
        self.patcher = types.SimpleNamespace(model=types.SimpleNamespace(transformer=self.model), load_device=torch.device('cpu'))
        self.processor = MagicMock()
        from transformers.feature_extraction_utils import BatchFeature
        self.processor.return_value = BatchFeature({
            'input_ids': torch.ones(1, 4, dtype=torch.long),
            'attention_mask': torch.ones(1, 4, dtype=torch.long),
            'pixel_values': torch.ones(1, 3, 4, 4),
        })
        self.processor.batch_decode.side_effect = lambda *args, **kwargs: [' A red square. ']
        self.load = patch.object(self.module, 'load_promptgen', return_value=(self.patcher, self.processor))
        self.loader = self.load.start()
        self.addCleanup(self.load.stop)

    def test_batch_rgba_returns_one_prompt_per_image_and_reuses_model(self):
        torch = self.torch
        node = self.module.FlorencePromptGen()
        image = torch.ones(2, 5, 7, 4)
        image[..., 1:3] = 0
        output = node.caption(image, 'base', 'Detailed prompt', 256, 1, False)
        self.assertEqual(output, (['A red square.', 'A red square.'],))
        self.assertEqual(self.model.generate.call_count, 2)
        for call in self.processor.call_args_list:
            self.assertEqual(call.kwargs['text'], '<MORE_DETAILED_CAPTION>')
            self.assertEqual(call.kwargs['images'].mode, 'RGB')
            self.assertEqual(call.kwargs['images'].getpixel((0, 0)), (255, 0, 0))
        self.assertEqual(self.model.generate.call_args.kwargs['input_ids'].dtype, torch.long)
        self.assertFalse(self.model.generate.call_args.kwargs['do_sample'])
        self.mm.unload_model_and_clones.assert_called_once_with(self.patcher)
        node.caption(image[:1], 'base', 'Tags', 128, 3, True)
        self.loader.assert_called_once_with('base')
        self.assertEqual(self.processor.call_args.kwargs['text'], '<GENERATE_TAGS>')
        self.assertEqual(self.model.generate.call_args.kwargs['num_beams'], 3)
        self.assertEqual(self.mm.unload_model_and_clones.call_count, 1)

    def test_generation_failure_releases_device_and_model_switch_invalidates_cache(self):
        node = self.module.FlorencePromptGen()
        image = self.torch.zeros(1, 4, 4, 3)
        self.model.generate.side_effect = RuntimeError('generation failed')
        with self.assertRaisesRegex(RuntimeError, 'generation failed'):
            node.caption(image, 'base', 'Detailed prompt', 128, 1, False)
        self.mm.unload_model_and_clones.assert_called_once_with(self.patcher)
        self.model.generate.side_effect = None
        node.caption(image, 'large', 'Caption + tags', 128, 1, True)
        self.assertEqual(self.loader.call_args.args, ('large',))
        self.assertEqual(self.mm.unload_model_and_clones.call_count, 2)
        self.assertEqual(self.processor.call_args.kwargs['text'], '<MIXED_CAPTION>')

    def test_unknown_model_is_rejected_before_loading_or_path_access(self):
        node = self.module.FlorencePromptGen()
        with self.assertRaises(ValueError):
            node.caption(self.torch.zeros(1, 2, 2, 3), '../../invalid', 'Tags', 128, 1, False)
        self.loader.assert_not_called()

    def test_missing_artifact_download_is_allowlisted_and_anonymous(self):
        self.load.stop()
        directory = Path(self.temp.name) / 'LLM' / 'Florence-2-base-PromptGen-v2.0'
        directory.mkdir(parents=True)
        (directory / 'config.json').write_text('{}')
        with patch.object(self.module, 'snapshot_download', side_effect=RuntimeError('download requested')) as download:
            with self.assertRaisesRegex(RuntimeError, 'download requested'):
                self.module.load_promptgen('base')
        self.assertEqual(download.call_args.kwargs['repo_id'], 'MiaoshouAI/Florence-2-base-PromptGen-v2.0')
        self.assertFalse(download.call_args.kwargs['token'])
        self.assertIn('model.safetensors', download.call_args.kwargs['allow_patterns'])
        self.assertFalse(any(name.endswith('.py') for name in download.call_args.kwargs['allow_patterns']))
        self.assertEqual(download.call_args.kwargs['local_dir'], str(directory))

    def test_checkpoint_adapter_preserves_values_and_tied_embeddings(self):
        torch = self.torch
        projection = torch.arange(6.).reshape(2, 3)
        shared = torch.ones(4, 3)
        state = {
            'image_projection': projection,
            'language_model.final_logits_bias': torch.zeros(1, 4),
            'language_model.model.shared.weight': shared,
            'language_model.lm_head.weight': shared,
            'vision_tower.convs.0.proj.weight': torch.ones(3, 3, 1, 1),
            'vision_tower.blocks.0.0.spatial_block.window_attn.norm.weight': torch.ones(3),
            'vision_tower.blocks.0.0.channel_block.ffn.fn.net.fc1.weight': torch.ones(6, 3),
            'image_pos_embed.row_embeddings.weight': torch.ones(2, 3),
        }
        converted = self.module.promptgen_weights(state, torch.float16)
        torch.testing.assert_close(converted['model.multi_modal_projector.image_projection.weight'], projection.T.half())
        self.assertIs(converted['model.language_model.encoder.embed_tokens.weight'], converted['model.language_model.shared.weight'])
        self.assertIs(converted['model.language_model.decoder.embed_tokens.weight'], converted['model.language_model.shared.weight'])
        self.assertIn('model.vision_tower.blocks.0.0.spatial_block.norm1.weight', converted)
        self.assertIn('model.vision_tower.blocks.0.0.channel_block.ffn.fc1.weight', converted)
        self.assertIn('model.vision_tower.convs.0.conv.weight', converted)
        self.assertIn('model.multi_modal_projector.image_position_embed.row_embeddings.weight', converted)
        state['language_model.final_logits_bias'][0, 0] = 1
        with self.assertRaises(ValueError):
            self.module.promptgen_weights(state, torch.float32)

    def test_comfy_attention_preserves_scaling_masks_and_channel_layout(self):
        torch = self.torch
        for width, scale in [(8, 0.25), (300, 300 ** -0.5)]:
            query, key, value = (torch.randn(2, 3, 4, width) for _ in range(3))
            mask = torch.zeros(2, 1, 4, 4)
            mask[..., -1] = float('-inf')
            output, weights = self.module.promptgen_attention(None, query, key, value, mask, scaling=scale)
            expected = torch.nn.functional.scaled_dot_product_attention(query, key, value, attn_mask=mask, scale=scale)
            torch.testing.assert_close(output, expected.transpose(1, 2))
            self.assertIsNone(weights)

    def test_registration_and_default_task(self):
        cls = self.module.NODE_CLASS_MAPPINGS['SDVN Florence PromptGen']
        self.assertEqual(cls.INPUT_TYPES()['required']['model'][1]['default'], 'base')
        self.assertEqual(cls.INPUT_TYPES()['required']['mode'][1]['default'], 'Detailed prompt')
        self.assertEqual(cls.RETURN_TYPES, ('STRING',))
        self.assertEqual(cls.OUTPUT_IS_LIST, (True,))
        self.assertIn('from .node.promptgen import NODE_CLASS_MAPPINGS', (ROOT / '__init__.py').read_text())

    def test_model_container_allows_comfy_device_tracking(self):
        torch = self.torch

        class Transformer(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.weight = torch.nn.Parameter(torch.ones(2))

            @property
            def device(self):
                return self.weight.device

            @property
            def dtype(self):
                return self.weight.dtype

        transformer = Transformer()
        wrapped = self.module.PromptGenModel(transformer)
        wrapped.device = torch.device('cpu')
        self.assertEqual(wrapped.get_dtype(), torch.float32)
        self.assertIn('transformer.weight', wrapped.state_dict())
        self.assertEqual(transformer.device, wrapped.device)


if __name__ == '__main__':
    unittest.main()
