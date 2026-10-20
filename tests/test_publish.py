from contextlib import chdir
from io import BytesIO
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import yaml


ROOT = Path(__file__).resolve().parents[1]


class RegistryPublishTests(unittest.TestCase):
    def setUp(self):
        workflow = yaml.safe_load((ROOT / '.github/workflows/publish.yml').read_text())
        steps = workflow['jobs']['publish-node']['steps']
        check = next(step for step in steps if step.get('id') == 'registry')
        self.script = check['run'].split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
        publish = next(step for step in steps if step.get('name') == 'Publish Custom Node')
        self.assertEqual(publish['if'], "steps.registry.outputs.publish == 'true'")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        (self.directory / 'pyproject.toml').write_text('[project]\nname="sdvn_comfy_node"\nversion="2.10.20"\n')
        self.path = self.directory / 'check.py'
        self.path.write_text(self.script)
        self.output = self.directory / 'output'

    def run_check(self, versions=None, error=None):
        with chdir(self.directory), patch.dict(os.environ, {'GITHUB_OUTPUT': str(self.output)}), patch(
                'urllib.request.urlopen', return_value=BytesIO(json.dumps(versions).encode()), side_effect=error) as request:
            runpy.run_path(str(self.path))
        request.assert_called_once_with('https://api.comfy.org/nodes/sdvn_comfy_node/versions', timeout=30)
        return self.output.read_text()

    def test_new_version_is_published(self):
        self.assertEqual(self.run_check([{'version': '2.9.24'}]), 'publish=true\n')

    def test_existing_version_is_skipped(self):
        self.assertEqual(self.run_check([{'version': '2.10.20'}]), 'publish=false\n')

    def test_new_node_can_publish(self):
        self.assertEqual(self.run_check(error=HTTPError('url', 404, 'Not found', {}, None)), 'publish=true\n')

    def test_registry_failure_stops_publication(self):
        with self.assertRaises(HTTPError):
            self.run_check(error=HTTPError('url', 503, 'Unavailable', {}, None))
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
