"""Package the reviewed Git snapshot, without local keys or build caches."""
from pathlib import Path
import hashlib
import subprocess

root = Path(__file__).resolve().parents[1]
out = root.parent / 'output' / 'demo'
out.mkdir(parents=True, exist_ok=True)
names = subprocess.check_output(
    ['git', 'ls-tree', '-r', '--name-only', '-z', 'HEAD'], cwd=root
).decode().split('\0')
blocked_dirs = {'.local', 'node_modules', '.gradle', 'build', '.idea', '__pycache__', '.git'}
blocked_suffixes = {'.jks', '.keystore', '.key', '.pem', '.p12', '.pfx', '.log'}
for name in filter(None, names):
    path = Path(name)
    if (any(part in blocked_dirs for part in path.parts)
            or path.name in {'local.properties', '.npmrc'}
            or path.suffix.lower() in blocked_suffixes
            or (path.name.startswith('.env') and path.name != '.env.example')):
        raise SystemExit(f'Packaging refused: excluded file is tracked: {name}')

target = out / '텔레CAR시_검토된소스와APK.zip'
subprocess.run([
    'git', 'archive', '--format=zip', '--prefix=telecar-demo/',
    f'--output={target}', 'HEAD'
], cwd=root, check=True)
print('snapshot:', subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip())
print('archive:', target, target.stat().st_size)
print('sha256:', hashlib.sha256(target.read_bytes()).hexdigest())
