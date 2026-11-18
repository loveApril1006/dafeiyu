"""Package the generated allowlist, validating hashes and excluding instance data."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone, timedelta
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'docs/ocean-system-manifest.json'
manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
forbidden = re.compile(r'(^|/)(?:state|roles|qq-memory-channels|node_modules|\.mnemon|\.git)(?:/|$)|(?:^|/)companion/[^/]*-data/|^(?:config\.json|packaging/default-settings\.json)$|\.(?:sqlite(?:-wal|-shm)?|db|log|env|pem|key|pfx)$', re.I)

# Compare source text against known local credentials without printing values.
known_secrets = set()
def collect(value):
    if isinstance(value, dict):
        for key, child in value.items():
            credential_field = re.search(r'api.?key|token|password|secret|authorization|cookie', key, re.I) and not re.search(r'(?:env|name|path|file|header|prefix)$', key, re.I)
            if credential_field and isinstance(child, str) and len(child) >= 12:
                known_secrets.add(child)
            else:
                collect(child)
    elif isinstance(value, list):
        for child in value:
            collect(child)
config = ROOT / 'config.json'
if config.exists():
    collect(json.loads(config.read_text(encoding='utf-8-sig')))
console_token = ROOT / 'state/console-token'
if console_token.exists():
    known_secrets.add(console_token.read_text(encoding='utf-8').strip())
known_secrets.discard('')

files = []
seen = set()
def add(source, destination, expected_hash=None, plugin=False):
    relative = PurePosixPath(destination)
    if relative.is_absolute() or '..' in relative.parts or destination in seen:
        raise RuntimeError('Unsafe or duplicate archive path: ' + destination)
    if forbidden.search(destination):
        raise RuntimeError('Private runtime path rejected: ' + destination)
    source = source.resolve(strict=True)
    boundary = (ROOT.parent / 'engine-home/profiles/web/node_modules').resolve() if plugin else ROOT
    if not source.is_relative_to(boundary):
        raise RuntimeError('Source escaped expected boundary: ' + destination)
    data = source.read_bytes()
    if expected_hash and hashlib.sha256(data).hexdigest() != expected_hash:
        raise RuntimeError('Source changed; regenerate manifest: ' + destination)
    text = data.decode('utf-8', errors='replace')
    if any(secret in text for secret in known_secrets):
        raise RuntimeError('Local credential found in reference source: ' + destination)
    if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text):
        raise RuntimeError('Private key material rejected: ' + destination)
    for match in re.finditer(r'\bsk-[A-Za-z0-9_-]{24,}\b', text):
        if not re.search(r'fixture|example|placeholder|test|dummy', match.group(), re.I):
            raise RuntimeError('Potential API key literal rejected: ' + destination)
    seen.add(destination)
    files.append((destination, data))

for item in manifest['files']:
    add(ROOT / item['path'], item['path'], item['sha256'])
for item in manifest['externalPlugins']['bundled']:
    add(ROOT / item['source'], item['path'], item['sha256'], plugin=True)
add(MANIFEST, 'docs/ocean-system-manifest.json')
if manifest['unresolvedStaticImports']:
    raise RuntimeError('Resolve static imports before packaging')

output_dir = ROOT.parent / 'outputs'
output_dir.mkdir(exist_ok=True)
stamp = datetime.now(timezone(timedelta(hours=8))).strftime('%Y%m%d-%H%M%S')
output = output_dir / ('识海系统源码参考包-' + stamp + '.zip')
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in files:
        archive.writestr('识海系统参考/' + name, data)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('Archive CRC verification failed')
    if len(archive.namelist()) != len(files):
        raise RuntimeError('Archive entry mismatch')
report = {'file': str(output), 'files': len(files), 'bytes': output.stat().st_size,
          'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
          'privateRuntimeFilesIncluded': False, 'knownCredentialCheckPassed': True,
          'staticImportsResolved': True, 'archiveVerified': True,
          'kind': 'source-reference-not-installer'}
output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
