"""Correct the source passenger assembly's oversized sweep around the driver pivot.
Edit actual vertices and all surface-conforming keys, keeping the source UVs and
parts. Runtime scale stays one; no proxy or visibility trick hides the crossing.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
def bl(v):return Vector((v[0],-v[2],v[1]))
def rt(v):return Vector((v.x,v.z,-v.y))
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'));cfg=mapping['wipers']['assemblies']['passenger']
if cfg.get('geometryLengthCalibration'):raise RuntimeError('Calibration already baked.')
g=bpy.data.objects['Mesh69'];gv=[g.matrix_world@v.co for v in g.data.vertices];gf=[list(f.vertices) for f in g.data.polygons if all(rt(gv[i]).z<-.20 for i in f.vertices)];glass=BVHTree.FromPolygons(gv,gf)
ob=bpy.data.objects[cfg['mesh']];pivot=bl(cfg['pivot']);axis=bl(cfg['axis'])
for index,key in enumerate(ob.data.shape_keys.key_blocks):
    fraction=index/8;R=Matrix.Rotation(cfg['maxAngle']*fraction,4,axis);inverse=R.inverted()
    for v in key.data:
        original=pivot+R.to_3x3()@v.co;q,n,_,_=glass.find_nearest(original);n=n if rt(n).y>0 else -n;clearance=(original-q).dot(n)
        candidate=pivot+(original-pivot)*.5;q,n,_,_=glass.find_nearest(candidate);n=n if rt(n).y>0 else -n;v.co=inverse.to_3x3()@(q+n*clearance-pivot)
for v,b in zip(ob.data.vertices,ob.data.shape_keys.key_blocks['Basis'].data):v.co=b.co
ob.data.update();cfg['geometryLengthCalibration']=.5;cfg['approximateBladeLengthMeters']=.38
mapping['wipers']['assemblies']['driver']['approximateBladeLengthMeters']=.63
mapping['wipers']['calibrationNote']='Source passenger sweep crossed the driver pivot. Its source assembly was physically shortened and refitted to the glass (about 38 cm blade, driver about 63 cm), preserving original topology, materials and UV. These are display-rig dimensions, not manufacturer CAD claims.'
for file in ['apps/web/public/models/vehicle-mapping.json','docs/assets/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
