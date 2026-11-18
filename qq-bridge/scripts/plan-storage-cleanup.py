"""Prepare a reviewable cleanup plan. This script never deletes anything."""
from pathlib import Path
import fnmatch
import importlib.util
import json
import os
import stat
import time

ROOT = Path(__file__).resolve().parents[2]
MAINTENANCE = ROOT / 'maintenance'
spec = importlib.util.spec_from_file_location('storage_audit', Path(__file__).with_name('audit-storage.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
rules = {
    'full-installer-v18': ['full-acceptance', '*fixture*'],
    'full-installer-v20': ['full-acceptance', '*fixture*'],
    'full-installer-v21': ['full-acceptance', '*fixture*'],
    'universal-repair-20261026': ['case-*', 'legacy-rpc-*', 'live-v13-*', 'live v13 *'],
    'qq-startup-20261026': ['*fixture*'],
    'dsh-health-20261026': ['engine-fixture-*', 'help-home'],
}
targets = []
for parent, patterns in rules.items():
    directory = MAINTENANCE / parent
    if not directory.is_dir():
        continue
    for candidate in directory.iterdir():
        if not any(fnmatch.fnmatchcase(candidate.name, pattern) for pattern in patterns):
            continue
        info = candidate.lstat()
        if not stat.S_ISDIR(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            continue
        resolved = candidate.resolve()
        if not resolved.is_relative_to(MAINTENANCE.resolve()):
            raise RuntimeError('Cleanup target escaped maintenance')
        result = audit.inventory(resolved)
        total = next((row for row in result['directories'] if row['path'] == '.'), {'bytes': 0})
        targets.append({'path': str(resolved), 'bytes': total['bytes'], 'files': result['files'],
                        'skippedReparsePoints': result['skippedReparsePoints'],
                        'reason': 'Regenerable installation/compatibility test copy; source scripts are retained'})
plan = {'at': time.time(), 'mode': 'plan-only', 'requiresUserConfirmation': True,
        'totalBytes': sum(row['bytes'] for row in targets), 'targets': targets,
        'preserved': ['All ZIP installers and checksums', 'All release directories (v20 release is still referenced by v21 merge-latest.py)',
                      'Active installation, model masters, credentials and chat history', 'Build/test source scripts',
                      'Live research integrations and their Git repositories']}
output = ROOT / 'qq-bridge/state/system-audit/cleanup-plan.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'mode': plan['mode'], 'targets': len(targets), 'GiB': round(plan['totalBytes'] / 1024**3, 2)}, ensure_ascii=False))
