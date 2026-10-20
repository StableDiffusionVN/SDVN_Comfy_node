import ast
import base64
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import types
import unittest
from unittest.mock import MagicMock


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(all(importlib.util.find_spec(name) for name in ('torch', 'numpy', 'PIL')),
                     'Requires PyTorch, NumPy and Pillow')
class APIUpdateTests(unittest.TestCase):
    def setUp(self):
        import numpy as np
        import torch
        from PIL import Image, ImageOps
        self.torch, self.Image = torch, Image
        buffer = BytesIO()
        Image.new('RGBA', (6, 4), (255, 0, 0, 128)).save(buffer, format='PNG')
        self.encoded_image = base64.b64encode(buffer.getvalue()).decode('ascii')
        self.client = MagicMock()
        self.client.images.generate.return_value = types.SimpleNamespace(
            data=[types.SimpleNamespace(b64_json=self.encoded_image)])
        self.client.images.edit.return_value = self.client.images.generate.return_value
        self.client.interactions.create.return_value = types.SimpleNamespace(
            output_image=types.SimpleNamespace(data=self.encoded_image), output_text='Image description')
        random = MagicMock()
        random().get_prompt.side_effect = lambda text, *_: ([text],)
        translate = MagicMock()
        translate().ggtranslate.side_effect = lambda text, *_: (text,)
        self.ns = {
            'torch': torch, 'np': np, 'Image': Image, 'ImageOps': ImageOps,
            'BytesIO': BytesIO, 'base64': base64,
            'OpenAI': MagicMock(return_value=self.client),
            'genai': types.SimpleNamespace(Client=MagicMock(return_value=self.client)),
            'api_check': MagicMock(return_value={'OpenAI': 'test', 'Gemini': 'test'}),
            'merge_image_preset_prompt': lambda prompt, _: prompt,
            'lang_list': lambda: ['None'], 'image_preset_list': lambda: ['None'],
            'ALL_NODE': {'SDVN Random Prompt': random, 'SDVN Translate': translate, 'PreviewImage': MagicMock()},
        }
        self.ns['ALL_NODE']['PreviewImage']().save_images.return_value = {'ui': {'images': ['preview']}}
        names = {
            'pil2tensor', 'tensor2pil', 'pil_to_bytesio', 'mask_bytesio', 'collect_pil_images',
            'with_node_preview', 'gemini_image_response', 'run_gemini_image_node',
            'API_DALLE', 'API_GPT_image', 'API_Imagen', 'Gemini_Flash2_Image',
            'Gemini_3_Pro_Image', 'Gemini_3_1_Flash_Image', 'Gemini_Nano_Banana',
        }
        tree = ast.parse((ROOT / 'node/api.py').read_text())
        definitions = [node for node in tree.body if
                       isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names or
                       isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'GPT_IMAGE_MODELS'
                                                           for t in node.targets)]
        exec(compile(ast.Module(body=definitions, type_ignores=[]), 'node/api.py', 'exec'), self.ns)

    def gpt_call(self, image=None, mask=None):
        return self.ns['API_GPT_image']().API_GPT_image(
            ['test'], ['gpt-image-2.5-sunburst'], ['auto'], [0], ['a cat'], ['high'],
            ['transparent'], [1], ['None'], image=image, mask=mask)

    def test_openai_generation_preserves_transparency_and_list_output(self):
        images, = self.gpt_call()
        options = self.client.images.generate.call_args.kwargs
        self.assertEqual(options['model'], 'gpt-image-2.5-sunburst')
        self.assertEqual(options['background'], 'transparent')
        self.assertEqual(options['output_format'], 'png')
        self.assertEqual(tuple(images[0].shape), (1, 4, 6, 4))
        self.assertNotIn('response_format', options)

    def test_openai_edit_flattens_references_and_resizes_alpha_mask(self):
        torch = self.torch
        references = torch.ones(2, 4, 6, 4)
        mask = torch.tensor([[[0., 1.], [0., 1.]]])
        self.gpt_call(image=[references], mask=[mask])
        options = self.client.images.edit.call_args.kwargs
        self.assertEqual(len(options['image']), 2)
        self.assertEqual(options['background'], 'transparent')
        alpha = self.Image.open(options['mask']).getchannel('A')
        self.assertEqual(alpha.size, (6, 4))
        self.assertEqual(alpha.getpixel((0, 0)), 255)
        self.assertEqual(alpha.getpixel((5, 0)), 0)

    def test_legacy_dalle_node_routes_to_gpt_image_with_same_output_contract(self):
        image, = self.ns['API_DALLE']().api_dalle('test', '1792x1024', 0, 'a cat', 'hd', 'None')
        self.assertEqual(tuple(image.shape), (1, 4, 6, 4))
        options = self.client.images.generate.call_args.kwargs
        self.assertEqual(options['model'], 'gpt-image-2.5-sunburst')
        self.assertEqual(options['quality'], 'high')
        self.assertEqual(options['size'], '1792x1024')

    def test_gemini_stable_models_and_text_do_not_overwrite_image(self):
        for cls, model in (('Gemini_3_Pro_Image', 'gemini-3-pro-image'),
                           ('Gemini_3_1_Flash_Image', 'gemini-3.1-flash-image')):
            with self.subTest(node=cls):
                image, text, prompt = self.ns[cls]().api_imagen(
                    ['test'], ['None'], ['a cat'], [''], ['Auto'], ['1K'], ['None'], [0], [False],
                    image=[self.torch.ones(2, 4, 6, 4)])
                self.assertEqual(tuple(image.shape), (1, 4, 6, 3))
                self.assertEqual(text, 'Image description')
                options = self.client.interactions.create.call_args.kwargs
                self.assertEqual(options['model'], model)
                self.assertEqual(len(options['input']), 3)
                self.assertFalse(options['store'])

    def test_gemini_resolution_and_new_nano_banana_choice(self):
        self.ns['Gemini_3_1_Flash_Image']().api_imagen(
            ['test'], ['None'], ['a cat'], [''], ['Auto'], ['0,5K'], ['None'], [0], [False])
        self.assertEqual(self.client.interactions.create.call_args.kwargs['response_format'][1]['image_size'], '512')
        image, _, _ = self.ns['Gemini_Nano_Banana']().api_imagen(
            ['test'], ['Nano Banana 2.1'], ['None'], ['a cat'], [''], ['16:9'], ['0,5K'], ['None'], [0], [False])
        options = self.client.interactions.create.call_args.kwargs
        self.assertEqual(options['model'], 'gemini-nano-banana-2.1')
        self.assertEqual(options['response_format'][1]['image_size'], '1K')
        self.assertEqual(image.shape[-1], 3)

    def test_imagen_replacement_uses_person_prompt_and_current_model(self):
        image, = self.ns['API_Imagen']().api_imagen('test', '4:3', False, 0, 'a room', 'None')
        options = self.client.interactions.create.call_args.kwargs
        self.assertEqual(options['model'], 'gemini-nano-banana-2.1')
        self.assertIn('Do not depict people.', options['input'][0]['text'])
        self.assertEqual(tuple(image.shape), (1, 4, 6, 3))

    def test_missing_gemini_image_reports_text_instead_of_silent_zero_image(self):
        self.client.interactions.create.return_value = types.SimpleNamespace(
            output_image=None, output_text='No image returned')
        with self.assertRaisesRegex(RuntimeError, 'No image returned'):
            self.ns['gemini_image_response'](self.client, 'gemini-nano-banana-2.1', 'a cat')

    def test_current_google_sdk_serializes_image_request_without_network(self):
        try:
            import httpx
            from google import genai
            from google.genai import types as genai_types
        except ImportError:
            self.skipTest('Requires current google-genai SDK')
        captured = []
        def respond(request):
            captured.append(json.loads(request.content))
            return httpx.Response(200, json={'status': 'completed', 'steps': [{
                'type': 'model_output', 'content': [
                    {'type': 'image', 'data': self.encoded_image, 'mime_type': 'image/png'},
                    {'type': 'text', 'text': 'ready'},
                ]}]})
        with genai.Client(api_key='test', http_options=genai_types.HttpOptions(
                base_url='https://sdvn-test.invalid', client_args={'transport': httpx.MockTransport(respond)})) as client:
            image, text = self.ns['gemini_image_response'](
                client, 'gemini-nano-banana-2.1', 'a cat', [self.Image.new('RGB', (6, 4))], '16:9', '2K')
        self.assertEqual(tuple(image.shape), (1, 4, 6, 3))
        self.assertEqual(text, 'ready')
        self.assertEqual(captured[0]['response_format'][1]['image_size'], '2K')

    def test_current_openai_sdk_serializes_generation_and_masked_edit_without_network(self):
        try:
            import httpx2
            from openai import OpenAI
        except ImportError:
            self.skipTest('Requires current OpenAI SDK')
        captured = []
        def respond(request):
            captured.append(request)
            return httpx2.Response(200, json={'data': [{'b64_json': self.encoded_image}]})
        clients = []
        def factory(**kwargs):
            client = OpenAI(api_key='test', base_url='https://sdvn-test.invalid/v1',
                            http_client=httpx2.Client(transport=httpx2.MockTransport(respond)))
            clients.append(client)
            return client
        self.ns['OpenAI'] = factory
        try:
            self.gpt_call()
            self.gpt_call(image=[self.torch.ones(1, 4, 6, 3)], mask=[self.torch.ones(1, 4, 6)])
        finally:
            for client in clients:
                client.close()
        self.assertTrue(str(captured[0].url).endswith('/images/generations'))
        self.assertTrue(str(captured[1].url).endswith('/images/edits'))
        self.assertEqual(json.loads(captured[0].content)['background'], 'transparent')
        self.assertIn(b'mask_alpha.png', captured[1].content)
        self.assertIn(b'gpt-image-2.5-sunburst', captured[1].content)


if __name__ == '__main__':
    unittest.main()
