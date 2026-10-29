"""Read the current .blend and derive luminous paths from its original edges.

Run Blender with -b assets/source/blender/su7-enhanced.blend --python this file.
Writes runtime path data only; never saves or exports the Blender project.
"""
import bpy
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
paths = {}

def route(mesh, name, source, indices, radius=.0032, gain=1, mirror=False, fill=.22):
    ob = bpy.data.objects[source]
    points = []
    for i in indices:
        p = ob.matrix_world @ ob.data.vertices[i].co
        points.append([round(-p.x if mirror else p.x, 7), round(p.z, 7), round(-p.y, 7)])
    paths.setdefault(mesh, []).append(dict(name=name, points=points, radius=radius, gain=gain, fill=fill))

route('Mesh59', 'console-perimeter', 'Mesh59', [0,1,2,4,8,11,13,12,15,17,18,20,62,59,57,55,54,44,42,41,39,0], gain=1.15)
# Mesh54 is the visible original textured trim, sitting over the structural
# Mesh53 edge. Illuminating Mesh53 alone is occluded by this trim; adding a
# diffuser above it introduced a height step. Use the actual visible faces.
route('Mesh54', 'dashboard-crown-left', 'Mesh54', [778,775,773,772,770,768,766,764,761,759,757,756], radius=.0085, fill=.9)
route('Mesh54', 'dashboard-crown-right', 'Mesh54', [756,754,669,667,666,663,661,660,658,591,590,593,595,632,635,637,640], radius=.0085, fill=.9)
for mirror, front, rear, upper, inlay in [(False,'Mesh47','Mesh40','Mesh43','Mesh49'),(True,'Mesh34','Mesh27','Mesh30','Mesh36')]:
    side = 'right' if mirror else 'left'
    route(front, 'front-upper-'+side, 'Mesh47', [0,1,4,6,8,14,10,11], radius=.0085, fill=.9, mirror=mirror)
    route(front, 'front-armrest-'+side, 'Mesh47', [18,20,21,23,24,22,19,18], gain=.9, mirror=mirror)
    route(front, 'front-handle-'+side, 'Mesh47', [37,39,41,43,45], gain=.85, mirror=mirror)
    route(front, 'front-speaker-'+side, 'Mesh47', [58,56,60,61,62,63,65,76,78,79,77,74,73,72,71,70,69,68,67,64,57,58], radius=.0028, gain=.8, mirror=mirror)
    route(inlay, 'front-inlay-'+side, 'Mesh49', [433,436,438,439,442,444], radius=.0034, mirror=mirror)
    route(inlay, 'front-inlay-upper-'+side, 'Mesh49', [668,664,660,658,657,654,652], radius=.0034, mirror=mirror)
    route(upper, 'rear-upper-'+side, 'Mesh43', [2,3,5,6,8], mirror=mirror)
    route(upper, 'rear-inlay-'+side, 'Mesh43', [1,0,4,7,8], radius=.0034, mirror=mirror)
    route(rear, 'rear-armrest-'+side, 'Mesh40', [8,7,5,6], gain=.9, mirror=mirror)
    route(rear, 'rear-handle-'+side, 'Mesh40', [0,2,3,1], gain=.85, mirror=mirror)
    route(rear, 'rear-speaker-'+side, 'Mesh40', [17,20,19,18,16,15,14,12,9,10,11,13,17], radius=.0028, gain=.8, mirror=mirror)
    route('Mesh53', 'centre-box-'+side, 'Mesh53', [6410,5647,5645,6358,8855,7607,4168], radius=.0034, gain=1.15, mirror=mirror)
    route('Mesh53', 'centre-box-top-'+side, 'Mesh53', [8280,8279,6778,6780,5860,5859,8033,8032], radius=.0036, gain=1.2, mirror=mirror)
route('Mesh53', 'centre-box-rear', 'Mesh53', [4168,4170], radius=.0034, gain=1.15)
route('Mesh53', 'centre-box-top-rear', 'Mesh53', [8032,10338,10865,7053], radius=.0036, gain=1.2)
out = root / 'apps/web/src/data/native-ambient-paths.json'
out.write_text(json.dumps(paths, indent=2)+'\n', encoding='utf-8')
print('NATIVE_AMBIENT_PATHS', json.dumps({'sourceMeshes':len(paths),'routes':sum(map(len,paths.values())),'sourceUnmodified':True}))
