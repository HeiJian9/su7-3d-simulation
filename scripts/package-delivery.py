"""Package this local delivery without credentials, tool caches, or dependencies."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
target = root / 'deliverables' / f'SU7-{version}.zip'
target.parent.mkdir(exist_ok=True)
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode('utf-8').split('\0')
names += [str(p.relative_to(root)).replace('\\', '/') for folder in ['apps/web/dist', 'apps/server/dist'] for p in (root / folder).rglob('*') if p.is_file()]
original = root / 'assets/source/original/xiaomi-su7.zip'
if original.is_file():
    names.append(str(original.relative_to(root)).replace('\\', '/'))
keys = []
for line in (root / '.env').read_text(encoding='utf-8').splitlines():
    if '=' not in line:
        continue
    name, value = line.split('=', 1)
    if name.strip() in ['ASR_API_KEY', 'TTS_API_KEY', 'INTENT_API_KEY']:
        value = value.strip().strip('"').strip("'")
        if len(value) >= 12:
            keys.append(value.encode())
files = []
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name in sorted(set(names)):
        if not name or name.startswith('deliverables/'):
            continue
        path = root / name
        if any(part in ['.git', '.tools', 'node_modules'] for part in path.parts):
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        if path.suffix.lower() in ['.pem', '.key']:
            continue
        if not path.is_file():
            continue
        if not path.resolve().is_relative_to(root):
            raise RuntimeError('Delivery path escaped the workspace')
        data = path.read_bytes()
        if any(key in data for key in keys):
            raise RuntimeError(f'Credential found in delivery file: {name}')
        archive.writestr(name, data)
        files.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    archive.writestr('DELIVERY_MANIFEST.json', json.dumps({'version': version, 'credentialValuesPrinted': False, 'credentialsExcluded': True, 'setup': 'npm ci; npm run build; npm start. Configure server-only .env locally.', 'files': files}, ensure_ascii=False, indent=2))
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('Archive CRC validation failed')
report = {'version': version, 'archive': str(target.relative_to(root)), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'files': len(files), 'credentialsExcluded': True, 'crcPassed': True}
(target.parent / f'SU7-{version}-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report))
