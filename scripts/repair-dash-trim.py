"""Repair only the two dashboard crown diffusers along native Mesh53 edges.

The original dashboard, displays, lower rails and all articulated panels remain
unchanged. Run once with --apply, then use npm run asset:export.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent.parent
source=bpy.data.objects['Mesh53']
points=[source.matrix_world@v.co for v in source.data.vertices]
tree=BVHTree.FromPolygons(points,[list(p.vertices) for p in source.data.polygons])
def rt(p): return [p.x,p.z,-p.y]
def key(p): return tuple(round(v,5) for v in p)
edges={frozenset((key(points[e.vertices[0]]),key(points[e.vertices[1]]))) for e in source.data.edges}
paths={
 'AMBIENT_DASH_CROWN_LEFT':[6793,6791,6773,5948,5943,5942,5940,5939,5937,5936,5934],
 'AMBIENT_DASH_CROWN_RIGHT':[8300,8302,8304,8305,8307,8309,8311,8312,7704,8206,8208,7699,7227,6869,6794,6795],
}
audit=json.loads((ROOT/'docs/assets/cabin-lighting-audit.json').read_text(encoding='utf8'))
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
if '--apply' not in sys.argv: raise RuntimeError('Explicit --apply is required.')
if mapping.get('dashTrimRepair'): raise RuntimeError('Dashboard trim repair already applied.')
records=[]
for name,indices in paths.items():
 anchors=[points[i] for i in indices]
 assert all(frozenset((key(a),key(b))) in edges for a,b in zip(anchors,anchors[1:])),name
 centers=[]
 for a,b in zip(anchors,anchors[1:]):
  steps=max(1,math.ceil((b-a).length/.003))
  centers.extend(a.lerp(b,j/steps) for j in range(steps))
 centers.append(anchors[-1])
 vertices=[];faces=[];up=Vector((0,0,1));width=.0024
 for i,c in enumerate(centers):
  tangent=centers[min(i+1,len(centers)-1)]-centers[max(i-1,0)]
  across=up.cross(tangent).normalized()*width*.5
  for sign in [-1,1]:
   hit=tree.find_nearest(c+across*sign)[0]
   vertices.append(hit+up*.00055)
 for i in range(len(centers)-1):
  f=(2*i,2*i+2,2*i+3,2*i+1)
  for ids in [(f[0],f[1],f[2]),(f[0],f[2],f[3])]:
   assert tree.find_nearest(sum((vertices[j] for j in ids),Vector())/3)[3]<.0014,name
  faces.append(f)
 ob=bpy.data.objects[name];old=ob.data
 mesh=bpy.data.meshes.new(name+'_native_edge');mesh.from_pydata(vertices,[],faces);mesh.materials.append(bpy.data.materials['AMBIENT_CABIN_LED']);mesh.update()
 ob.data=mesh
 if not old.users:bpy.data.meshes.remove(old)
 ob['design']='native_continuous_dashboard_v2'
 for p in mesh.polygons:p.use_smooth=True
 record=next(r for r in audit['records'] if r['node']==name)
 record.update({'width':width,'surfaceOffset':.00055,'seedMaxProjection':0,'centerline':[rt(p) for p in centers],'samples':len(centers),'trimmedGapFaces':0,'trimEdgePath':[rt(p) for p in anchors],'nativeVertexIndices':indices,'routeRevision':'continuous_native_edge_v2'})
 records.append({'node':name,'samples':len(centers),'faces':len(faces),'nativeEdgeSegments':len(indices)-1})
assert (points[5934]-points[8300]).length<1e-6
audit['dashboardTrimRevision']='continuous_native_edge_v2'
mapping['dashTrimRepair']={'baseline':'e221e9c','modifiedNodes':list(paths),'source':'Mesh53','continuousJoin':[rt(points[5934])],'nativeEdgeOnly':True}
for file in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf8')
(ROOT/'docs/assets/cabin-lighting-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/blender/su7-enhanced.blend'))
print('DASH_TRIM_REPAIRED',json.dumps(records))
