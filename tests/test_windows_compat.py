import ast
import builtins
import hashlib
import ntpath
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]


def symbols(path, names, ns):
    tree = ast.parse((ROOT / path).read_text())
    nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name in names]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), path, 'exec'), ns)
    return ns


class WindowsCompatibilityTests(unittest.TestCase):
    def test_gallery_and_instaloader_use_current_python_everywhere(self):
        calls = []
        for path in ('node/load.py', 'node/image.py'):
            for n in ast.walk(ast.parse((ROOT / path).read_text())):
                if isinstance(n, ast.List) and any(isinstance(x, ast.Constant) and x.value in ('gallery_dl', 'instaloader') for x in n.elts):
                    self.assertEqual(ast.unparse(n.elts[0]), 'sys.executable')
                    self.assertEqual(ast.literal_eval(n.elts[1]), '-m')
                    calls.append(n)
        self.assertEqual(len(calls), 4)

    def test_pinterest_paths_and_unlimited_range(self):
        process = Mock()
        ns = symbols('node/load.py', ['LoadPinterest'], dict(os=os, re=re, sys=sys, urllib=urllib,
            hashlib=hashlib, subprocess=process,
            folder_paths=types.SimpleNamespace(get_input_directory=lambda: r'C:\Comfy UI\input')))
        node = ns['LoadPinterest']()
        for range_value in ('', '-1', '1:10'):
            result = node.pintrest_board_download('https://www.pinterest.com/search/pins/?q=ảnh%20đẹp', range_value)
            self.assertNotRegex(result[3:], r'[:?*"<>|]')
            command = process.run.call_args.args[0]
            self.assertEqual(command[:3], [sys.executable, '-m', 'gallery_dl'])
            self.assertEqual('--range' in command, range_value == '1:10')

    def test_local_preview_and_unicode_text_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / 'ảnh.png'
            source.write_bytes(b'image')
            temp = base / 'temp'
            ns = symbols('node/load.py', ['_sdvn_cache_preview_file'], dict(os=os, shutil=shutil,
                hashlib=hashlib, SDVN_IMAGE_DOT_EXTENSIONS={'.png'},
                folder_paths=types.SimpleNamespace(get_temp_directory=lambda: str(temp))))
            path, info = ns['_sdvn_cache_preview_file'](str(source))
            self.assertEqual(Path(path).read_bytes(), b'image')
            self.assertEqual(info['type'], 'temp')
            sub = base / 'văn bản'
            sub.mkdir()
            (sub / 'prompt.txt').write_text('Tiếng Việt', encoding='utf-8')
            ns = symbols('node/creative.py', ['list_txt_path', 'get_name_file'], {'os': os})
            self.assertEqual(ns['get_name_file'](str(base)), ['None', 'văn bản/prompt.txt'])

    def test_metadata_uses_windows_basename(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'model.safetensors'
            path.write_bytes((2).to_bytes(8, 'little') + b'{}')
            path.with_suffix('.txt').write_text('Tiếng Việt', encoding='utf-8')
            import json
            ns = symbols('node/load_info.py', ['get_metadata'], dict(os=os, ntpath=ntpath, json=json))
            self.assertEqual(ns['get_metadata'](str(path))['info'], 'Tiếng Việt')

    def test_packaging_bootstrap_precedes_node_imports(self):
        tree = ast.parse((ROOT / '__init__.py').read_text())
        bootstrap = next(n for n in tree.body if isinstance(n, ast.Try))
        process = Mock()
        imports = []
        def importer(name, *args, **kwargs):
            if name == 'packaging.requirements':
                imports.append(name)
                if len(imports) == 1:
                    raise ImportError('not installed')
            return builtins.__import__(name, *args, **kwargs)
        ns = {'__builtins__': dict(vars(builtins), __import__=importer),
              'sys': sys, 'subprocess': process, 'invalidate_caches': Mock()}
        exec(compile(ast.Module(body=[bootstrap], type_ignores=[]), '__init__.py', 'exec'), ns)
        process.check_call.assert_called_once_with([sys.executable, '-m', 'pip', 'install', 'packaging'])
        self.assertEqual(len(imports), 2)


if __name__ == '__main__':
    unittest.main()
