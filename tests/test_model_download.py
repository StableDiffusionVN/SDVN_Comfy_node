import ast
import os
from pathlib import Path
import re
import tempfile
import types
import unittest
from unittest.mock import Mock
import urllib.parse


class ModelDownloadTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).resolve().parents[1] / 'node/load.py'
        definitions = [node for node in ast.parse(source.read_text()).body
                       if isinstance(node, (ast.FunctionDef, ast.ClassDef))
                       and node.name in ('download_model', 'check_link', 'LoraDownload')]
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.response = Mock()
        self.response.__enter__ = Mock(return_value=self.response)
        self.response.__exit__ = Mock(return_value=False)
        self.response.headers = {'Content-Length': '6'}
        self.response.iter_content.side_effect = lambda **_: iter([b'abc', b'def'])
        self.requests = Mock()
        self.requests.get.return_value = self.response
        self.shutil = Mock()
        self.shutil.which.return_value = None
        self.subprocess = __import__('subprocess')
        self.namespace = dict(os=os, re=re, requests=self.requests, shutil=self.shutil,
                              subprocess=self.subprocess, urllib=urllib,
                              folder_paths=types.SimpleNamespace(models_dir=self.temp.name),
                              get_hf_token=lambda: 'test-token', apix_license=Mock())
        exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), 'exec'), self.namespace)
        self.target = Path(self.temp.name) / 'checkpoints' / 'model.bin'

    def download(self, url='https://example.com/model?signature=abc'):
        self.namespace['download_model'](url, 'model.bin', 'checkpoints')

    def test_missing_aria_downloads_and_preserves_query(self):
        self.download()
        self.assertEqual(self.target.read_bytes(), b'abcdef')
        self.assertEqual(self.requests.get.call_args.args[0], 'https://example.com/model?signature=abc')
        self.download()
        self.requests.get.assert_called_once()

    def test_truncated_download_does_not_publish_model(self):
        self.response.headers['Content-Length'] = '10'
        with self.assertRaises(RuntimeError):
            self.download()
        self.assertFalse(self.target.exists())
        self.assertFalse(Path(str(self.target) + '.sdvn-download').exists())

    def test_aria_failure_falls_back_with_hf_auth(self):
        self.shutil.which.return_value = r'C:\Program Files\aria2\aria2c.exe'
        self.namespace['subprocess'] = Mock()
        self.namespace['subprocess'].CalledProcessError = self.subprocess.CalledProcessError
        self.namespace['subprocess'].run.side_effect = OSError('cannot run')
        self.download('https://huggingface.co/org/repo/blob/main/model')
        self.assertEqual(self.target.read_bytes(), b'abcdef')
        self.assertEqual(self.requests.get.call_args.kwargs['headers'], {'Authorization': 'Bearer test-token'})
        self.assertIn('/resolve/', self.requests.get.call_args.args[0])

    def test_lora_download_loads_huggingface_filename_even_when_cached(self):
        filename = 'moss_image_edit_lora_rank_64_bf16.safetensors'
        url = 'https://huggingface.co/Comfy-Org/MOSS-Image/blob/main/loras/' + filename
        loader = Mock()
        self.namespace['ALL_NODE'] = {'LoraLoader': lambda: loader}
        node = self.namespace['LoraDownload']()
        for _ in range(2):
            node.load_lora(None, None, url, 'model.safetensors', 1., 1.)
            loader.load_lora.assert_called_with(None, None, filename, 1., 1.)
        self.assertEqual((Path(self.temp.name) / 'loras' / filename).read_bytes(), b'abcdef')
        self.requests.get.assert_called_once()
        self.assertEqual(self.requests.get.call_args.args[0], url.replace('/blob/', '/resolve/'))

    def test_huggingface_resolve_decodes_filename_and_preserves_query(self):
        url = 'https://huggingface.co/org/repo/resolve/main/model%20blob.gguf?download=true'
        download = self.namespace['download_model']
        name = download(url, 'model.safetensors', 'checkpoints')
        self.assertEqual(name, 'model blob.gguf')
        self.assertEqual((self.target.parent / name).read_bytes(), b'abcdef')
        self.assertEqual(self.requests.get.call_args.args[0], url)

    def test_custom_name_and_other_hosts_keep_requested_name(self):
        download = self.namespace['download_model']
        self.assertEqual(download('https://huggingface.co/org/repo/resolve/main/actual.bin',
                                  'model.bin', 'checkpoints'), 'model.bin')
        self.assertEqual(download('https://example.com/resolve/main/actual.bin',
                                  'model.safetensors', 'checkpoints'), 'model.safetensors')
        self.assertEqual((self.target.parent / 'model.safetensors').read_bytes(), b'abcdef')


if __name__ == '__main__':
    unittest.main()
