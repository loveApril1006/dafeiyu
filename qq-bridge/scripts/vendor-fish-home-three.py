"""Vendor pinned browser 3D dependencies; verify npm's archive integrity first."""
from pathlib import Path
import base64, hashlib, io, json, tarfile, urllib.request

root = Path(__file__).resolve().parents[1]
version = '0.186.1'
with urllib.request.urlopen('https://registry.npmjs.org/three/' + version, timeout=30) as response:
    info = json.load(response)
cache = root / 'state/code-backups/fish-home-20261029/three.tgz'
if cache.exists():
    data = cache.read_bytes()
else:
    with urllib.request.urlopen(info['dist']['tarball'], timeout=60) as response:
        data = response.read(20 * 1024 * 1024)
algorithm, expected = info['dist']['integrity'].split('-', 1)
assert algorithm == 'sha512' and base64.b64encode(hashlib.sha512(data).digest()).decode() == expected
selected = {'package/build/three.module.js':'three.module.js',
            'package/build/three.core.js':'three.core.js',
            'package/examples/jsm/controls/OrbitControls.js':'OrbitControls.js',
            'package/LICENSE':'LICENSE'}
target = root / 'public/vendor/three'
target.mkdir(parents=True, exist_ok=True)
files = []
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    for source, destination in selected.items():
        content = archive.extractfile(source).read()
        if destination == 'OrbitControls.js':
            content = content.replace(b"from 'three';", b"from './three.module.js';")
        (target / destination).write_bytes(content)
        files.append({'file':destination,'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)})
(target / 'vendor.json').write_text(json.dumps({'package':'three','version':version,'license':'MIT',
    'source':info['dist']['tarball'],'integrity':info['dist']['integrity'],
    'modifications':['OrbitControls bare import resolved to local module'],'files':files}, indent=2), encoding='utf-8')
print(json.dumps({'version':version,'files':len(files),'bytes':sum(row['bytes'] for row in files)}))
