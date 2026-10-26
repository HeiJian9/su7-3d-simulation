"""Extract the selected Sketchfab OBJ download without trusting archive paths."""
import io
from pathlib import Path
import sys
import zipfile

archive, destination = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
destination.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as outer:
    if 'source/su7.zip' not in outer.namelist():
        raise ValueError('Expected designated OBJ source/su7.zip package. Inspect a different format before adapting this importer.')
    with zipfile.ZipFile(io.BytesIO(outer.read('source/su7.zip'))) as source:
        for info in source.infolist():
            target = (destination / info.filename).resolve()
            if not target.is_relative_to(destination):
                raise ValueError('Unsafe ZIP path')
        source.extractall(destination)
if not (destination / '2024 Xiaomi SU7.obj').exists():
    raise ValueError('Expected source OBJ is missing')
print('Official OBJ package extracted')
