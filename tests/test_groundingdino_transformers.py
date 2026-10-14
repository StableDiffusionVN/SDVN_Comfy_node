import importlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
from unittest.mock import MagicMock, patch
import unittest


PACKAGE = Path(__file__).resolve().parents[1] / 'node' / 'segment_anything'


@unittest.skipUnless(importlib.util.find_spec('torch') and importlib.util.find_spec('transformers'),
                     'Requires PyTorch and transformers')
class GroundingDinoBertTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import torch
        from transformers import BertConfig, BertModel, BertTokenizer
        cls.torch = torch
        torch.set_num_threads(2)
        spec = importlib.util.spec_from_file_location('sdvn_segment', PACKAGE / '__init__.py',
                                                     submodule_search_locations=[str(PACKAGE)])
        package = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = package
        spec.loader.exec_module(package)
        cls.dino_module = importlib.import_module(
            'sdvn_segment.local_groundingdino.models.GroundingDINO.groundingdino')
        cls.mask_module = importlib.import_module(
            'sdvn_segment.local_groundingdino.models.GroundingDINO.bertwarper')
        cls.temp = tempfile.TemporaryDirectory()
        cls.model_path = Path(cls.temp.name)
        vocab = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]', '.', '?', 'face', 'cat', 'dog']
        (cls.model_path / 'vocab.txt').write_text('\n'.join(vocab))
        tokenizer = BertTokenizer(vocab_file=str(cls.model_path / 'vocab.txt'))
        tokenizer.save_pretrained(cls.model_path)
        cls.bert = BertModel(BertConfig(vocab_size=len(vocab), hidden_size=32,
            num_hidden_layers=2, num_attention_heads=4, intermediate_size=64,
            hidden_dropout_prob=0, attention_probs_dropout_prob=0)).eval()
        cls.bert.save_pretrained(cls.model_path)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_groundingdino_native_bert_and_checkpoint_keys(self):
        from argparse import Namespace
        torch = self.torch
        args = Namespace(backbone='swin_T_224_1k', position_embedding='sine',
            pe_temperatureH=20, pe_temperatureW=20, return_interm_indices=[1, 2, 3],
            backbone_freeze_keywords=None, enc_layers=1, dec_layers=1, pre_norm=False,
            dim_feedforward=256, hidden_dim=256, dropout=0., nheads=8, num_queries=4,
            query_dim=4, num_patterns=0, num_feature_levels=4, enc_n_points=4, dec_n_points=4,
            two_stage_type='standard', two_stage_bbox_embed_share=False,
            two_stage_class_embed_share=False, transformer_activation='relu',
            dec_pred_bbox_embed_share=True, dn_box_noise_scale=1., dn_label_noise_ratio=.5,
            embed_init_tgt=True, dn_labelbook_size=2000, max_text_len=256,
            text_encoder_type=str(self.model_path), use_text_enhancer=True,
            use_fusion_layer=True, use_checkpoint=False, use_transformer_ckpt=False,
            use_text_cross_attention=True, text_dropout=0., fusion_dropout=0.,
            fusion_droppath=0., sub_sentence_present=True)
        model = self.dino_module.build_groundingdino(args).eval()
        keys = model.state_dict().keys()
        self.assertIn('bert.embeddings.word_embeddings.weight', keys)
        self.assertIn('bert.encoder.layer.0.attention.self.query.weight', keys)
        self.assertFalse(any(key.startswith('bert.bert.') for key in keys))
        captured = []
        hook = model.bert.register_forward_pre_hook(
            lambda module, args, kwargs: captured.append(kwargs['attention_mask'].detach()),
            with_kwargs=True)
        try:
            output = model(torch.rand(2, 3, 128, 128), captions=['face. cat.', 'face.'])
        finally:
            hook.remove()
        self.assertEqual(output['pred_boxes'].shape, (2, 4, 4))
        self.assertEqual(output['pred_logits'].shape, (2, 4, 256))
        self.assertTrue(torch.isfinite(output['pred_boxes']).all())
        mask = captured[0]
        self.assertEqual(mask.ndim, 4)
        self.assertEqual(mask.shape[1], 1)
        self.assertTrue((mask == 0).any())
        self.assertTrue((mask == torch.finfo(model.bert.dtype).min).any())

    def test_sam_variants_import_without_timm(self):
        module = importlib.import_module('sdvn_segment.sam_hq.build_sam_hq')
        self.assertEqual(set(module.sam_model_registry), {
            'sam_vit_h', 'sam_vit_l', 'sam_vit_b',
            'sam_hq_vit_h', 'sam_hq_vit_l', 'sam_hq_vit_b', 'mobile_sam',
        })

    def test_config_loader_without_addict_or_yapf(self):
        stubs = {name: types.ModuleType(name) for name in (
            'nodes', 'folder_paths', 'comfy', 'comfy.model_management',
        )}
        stubs['nodes'].NODE_CLASS_MAPPINGS = {}
        stubs['comfy'].model_management = stubs['comfy.model_management']
        stubs['comfy.model_management'].get_torch_device = lambda: 'cpu'
        spec = importlib.util.spec_from_file_location('sdvn_segment.nodes', PACKAGE / 'nodes.py')
        module = importlib.util.module_from_spec(spec)
        config = self.model_path / 'test.cfg.py'
        config.write_text("modelname = 'groundingdino'\ntext_encoder_type = 'local-test'\nhidden_dim = 256\n")
        fake_model = MagicMock()
        with patch.dict(sys.modules, stubs), patch(
                'sdvn_segment.local_groundingdino.models.build_model', return_value=fake_model) as build:
            spec.loader.exec_module(module)
            with patch.object(module, 'get_local_filepath', side_effect=[str(config), 'checkpoint.pth']), patch.object(
                    module.torch, 'load', return_value={'model': {}}) as load:
                self.assertIs(module.load_groundingdino_model('GroundingDINO_SwinT_OGC (694MB)'), fake_model)
            self.assertEqual(build.call_args.args[0].hidden_dim, 256)
            self.assertEqual(build.call_args.args[0].text_encoder_type, 'local-test')
            load.assert_called_once_with('checkpoint.pth', map_location='cpu', weights_only=True)
            fake_model.to.assert_called_once_with(device='cpu')
            fake_model.eval.assert_called_once_with()

    def test_custom_mask_preserves_sentence_isolation(self):
        torch = self.torch
        tokens = {'input_ids': torch.tensor([[2, 7, 5, 8, 5, 3]])}
        masks, positions, _ = self.mask_module.generate_masks_with_special_tokens_and_transfer_map(
            tokens, [2, 3, 5, 6], None)
        additive = torch.zeros(masks.shape, dtype=self.bert.dtype).masked_fill(
            ~masks, torch.finfo(self.bert.dtype).min).unsqueeze(1)
        first = self.bert(**tokens, attention_mask=additive, position_ids=positions).last_hidden_state
        changed = tokens['input_ids'].clone()
        changed[0, 3] = 9
        second = self.bert(input_ids=changed, attention_mask=additive,
                           position_ids=positions).last_hidden_state
        torch.testing.assert_close(first[:, 1:3], second[:, 1:3], rtol=0, atol=0)
        self.assertFalse(torch.equal(first[:, 3:5], second[:, 3:5]))


if __name__ == '__main__':
    unittest.main()
