"""Safety regression tests for reversible SDK storage optimization."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
import zipfile
from voice_package_policy import VOICE_CODE, is_voice_development_file

api = runpy.run_path(str(Path(__file__).with_name('optimize-voice-storage.py')))
PREFIX = api['SDK_PREFIX']


class VoiceStorageTest(unittest.TestCase):
    def test_package_exclusions_preserve_every_inference_asset(self):
        for name in [PREFIX + 'lib/dnnl.lib', PREFIX + 'include/torch/a.h', PREFIX + 'share/cmake/Torch/a.cmake']:
            self.assertTrue(is_voice_development_file('GPT-SoVITS/' + name))
        for name in [PREFIX + 'lib/torch_cuda.dll', PREFIX + 'lib/torch_cpu.dll',
                     'GPT_SoVITS/text/G2PWModel/g2pW.onnx', 'voices/hutao.wav', 'pet-voice.json',
                     'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large/pytorch_model.bin']:
            self.assertFalse(is_voice_development_file('GPT-SoVITS/' + name))
        for name in VOICE_CODE:
            self.assertTrue((Path(__file__).absolute().parents[2] / 'GPT-SoVITS' / name).is_file())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='voice-storage-test-')
        self.base = Path(self.temp.name)
        self.root = self.base / 'GPT-SoVITS'
        self.archive = self.base / 'backup' / 'sdk.zip'
        self.content = {PREFIX + 'lib/dnnl.lib': b'optional compiler SDK' * 100,
                        PREFIX + 'include/torch/header.h': b'// development header',
                        PREFIX + 'share/cmake/Torch/TorchConfig.cmake': b'compiler config',
                        PREFIX + 'lib/torch_cuda.dll': b'keep GPU acceleration',
                        'pet-voice.json': b'{"voice":"hutao-playful"}',
                        'voices/hutao.wav': b'keep user reference',
                        'service-token': b'keep private token'}
        for name, data in self.content.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)

    def tearDown(self):
        self.temp.cleanup()

    def test_archive_restore_preserves_models_config_and_cuda(self):
        result = api['archive_sdk'](self.root, self.archive)
        self.assertEqual(result['files'], 3)
        self.assertTrue(api['validate_archive'](self.archive))
        for name, data in self.content.items():
            self.assertEqual((self.root / name).exists(), not api['is_sdk'](name))
        api['restore_sdk'](self.root, self.archive)
        for name, data in self.content.items():
            self.assertEqual((self.root / name).read_bytes(), data)
        # Repeat actions are safe; an existing verified archive remains unchanged.
        before = self.archive.read_bytes()
        api['archive_sdk'](self.root, self.archive)
        self.assertEqual(before, self.archive.read_bytes())

    def test_changed_sdk_is_never_deleted_or_overwritten(self):
        api['archive_sdk'](self.root, self.archive)
        api['restore_sdk'](self.root, self.archive)
        target = self.root / (PREFIX + 'lib/dnnl.lib')
        target.write_bytes(b'new user SDK')
        with self.assertRaises(ValueError):
            api['archive_sdk'](self.root, self.archive)
        with self.assertRaises(ValueError):
            api['restore_sdk'](self.root, self.archive)
        self.assertEqual(target.read_bytes(), b'new user SDK')
        self.assertTrue((self.root / (PREFIX + 'include/torch/header.h')).exists())

    def test_corrupt_and_traversal_archives_do_not_modify_runtime(self):
        self.archive.parent.mkdir()
        for name in [PREFIX + 'include/../../outside.txt', 'service-token']:
            with zipfile.ZipFile(self.archive, 'w') as package:
                package.writestr(name, b'bad')
                package.writestr('voice-sdk-manifest.json', json.dumps({'files': [
                    {'path': name, 'bytes': 3, 'sha256': hashlib.sha256(b'bad').hexdigest()}]}))
            with self.assertRaises(ValueError):
                api['restore_sdk'](self.root, self.archive)
        self.assertEqual((self.root / 'service-token').read_bytes(), self.content['service-token'])

    def test_path_escape_and_hardlinks_rejected(self):
        for name in ['../outside', '/outside', 'C:/outside', 'runtime/../outside']:
            with self.assertRaises(ValueError):
                api['checked'](self.root, name)
        target = self.root / (PREFIX + 'lib/dnnl.lib')
        os.link(target, self.base / 'hardlink.lib')
        with self.assertRaises(ValueError):
            api['archive_sdk'](self.root, self.archive)
        self.assertTrue(target.exists())


if __name__ == '__main__':
    unittest.main()
