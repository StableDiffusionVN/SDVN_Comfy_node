import ast
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'node' / 'segment_anything'


class SegmentAnythingIntegrationTests(unittest.TestCase):
    def test_register_without_external_node_or_model_dependencies(self):
        stubs = {name: types.ModuleType(name) for name in (
            'nodes', 'torch', 'torch.hub', 'numpy', 'PIL', 'folder_paths',
            'comfy', 'comfy.model_management',
        )}
        stubs['nodes'].NODE_CLASS_MAPPINGS = {}
        stubs['torch.hub'].download_url_to_file = None
        stubs['PIL'].Image = None
        spec = importlib.util.spec_from_file_location('sdvn_segment.nodes', PACKAGE / 'nodes.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, stubs):
            spec.loader.exec_module(module)
            self.assertEqual(set(module.NODE_CLASS_MAPPINGS), {
                'SDVN SAMModelLoader', 'SDVN DinoModelLoader',
                'SDVN DinoSAMSegment', 'SDVN SegmentAnything',
                'SDVN InvertMask', 'SDVN IsMaskEmpty',
            })
            required = module.SegmentAnything.INPUT_TYPES()['required']
            self.assertEqual(list(required), [
                'sam_model', 'dino_model', 'image', 'prompt', 'threshold', 'text_threshold',
            ])
            self.assertEqual(len(required['sam_model'][0]), 7)
            self.assertEqual(len(required['dino_model'][0]), 2)
            self.assertEqual(module.SegmentAnything.RETURN_TYPES, ('IMAGE', 'MASK'))

    def test_bundled_imports_resolve_inside_sdvn(self):
        for path in PACKAGE.rglob('*.py'):
            tree = ast.parse(path.read_text(), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    self.assertFalse(any(alias.name.startswith(('local_groundingdino', 'sam_hq'))
                                         for alias in node.names), str(path))
                if isinstance(node, ast.ImportFrom):
                    self.assertFalse(node.level == 0 and (node.module or '').startswith(
                        ('local_groundingdino', 'sam_hq')), str(path))
                    if node.level:
                        base = path.parent
                        for _ in range(node.level - 1):
                            base = base.parent
                        target = base.joinpath(*(node.module or '').split('.'))
                        self.assertTrue(target.is_dir() or target.with_suffix('.py').is_file(),
                                        f'{path}: {node.module}')


if __name__ == '__main__':
    unittest.main()
