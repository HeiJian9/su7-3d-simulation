"""Open the isolated copy and check that textures are packed, without saving."""
import bpy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
images = []
for image in bpy.data.images:
    if image.source != 'FILE':
        continue
    # Blender loads images lazily. Point the external fallback at a nonexistent
    # location, then force pixel decoding to prove the packed payload is enough.
    image.filepath = str(ROOT / '.tools/nonexistent-textures' / image.name)
    first_pixel = image.pixels[0]
    images.append({'name': image.name, 'packed': image.packed_file is not None,
        'packedBytes': len(image.packed_file.data) if image.packed_file else 0,
        'hasData': image.has_data, 'size': list(image.size), 'firstPixel': first_pixel})
meshes = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
report = {'openedFile': bpy.data.filepath, 'blender': bpy.app.version_string, 'meshes': len(meshes),
    'triangles': sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in meshes), 'images': images,
    'allTexturesPacked': all(image['packed'] and image['hasData'] for image in images)}
output = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'docs/assets/blend-portability-check.json'
(ROOT/output).write_text(json.dumps(report, indent=2), encoding='utf8')
if bpy.data.objects.get('TRUNK_REAR_ROOT'):
    expected=json.loads((ROOT/'docs/assets/current-geometry.json').read_text(encoding='utf8'))
    assert report['meshes']==expected['meshes'] and report['triangles']==expected['triangles']
else: assert report['meshes'] == 84 and report['triangles'] == 92410
assert len(images) == 15 and report['allTexturesPacked']
print('BLEND_PORTABILITY_PASS')
