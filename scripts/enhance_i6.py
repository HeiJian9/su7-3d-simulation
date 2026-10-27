"""Separate the original twin wipers from Mesh24 and fit a flexible sweep to Mesh69.
Root rotation is the mechanism; small baked morph corrections keep the source
blade/arm surfaces on the curved windshield without replacing them with proxies.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
def rt(p):return Vector((p.x,p.z,-p.y))
def bl(p):return Vector((p[0],-p[2],p[1]))
root=bpy.data.objects['SU7_ROOT'];source=bpy.data.objects['Mesh24']
if bpy.data.objects.get('WIPER_DRIVER_ROOT'):raise RuntimeError('I6 already applied; use current rig.')
bpy.context.preferences.filepaths.save_version=0
points=[source.matrix_world@v.co for v in source.data.vertices];parent=list(range(len(points)))
def find(i):
    while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
    return i
def union(a,b):parent[find(a)]=find(b)
quant={}
for i,p in enumerate(points):
    key=tuple(round(x,5) for x in p)
    if key in quant:union(i,quant[key])
    else:quant[key]=i
for face in source.data.polygons:
    for i in face.vertices[1:]:union(face.vertices[0],i)
components={}
for f in source.data.polygons:components.setdefault(find(f.vertices[0]),[]).append(f.index)
buckets={'driver':set(),'passenger':set()};audit=[]
for faces in components.values():
    ps=[rt(points[i]) for f in faces for i in source.data.polygons[f].vertices];low=[min(p[i] for p in ps) for i in range(3)];high=[max(p[i] for p in ps) for i in range(3)]
    if low[1]>.83 and high[2]<-.98 and low[0]>-.75 and high[0]<.75:
        side='driver' if high[0]<-.5 or (high[0]<.24 and not(high[0]<-.20 and low[2]<-1.17)) else 'passenger'
        buckets[side].update(faces);audit.append({'side':side,'faces':len(faces),'min':low,'max':high})
assert all(len(ids)>150 for ids in buckets.values())
windshield=bpy.data.objects['Mesh69'];gv=[windshield.matrix_world@v.co for v in windshield.data.vertices]
gf=[list(f.vertices) for f in windshield.data.polygons if all(rt(gv[i]).z<-.20 for i in f.vertices)]
glass=BVHTree.FromPolygons(gv,gf)
# Axis from the source windshield surface normal (outside points toward +Y / -Z).
normal=Vector((0,0,0))
for ids in gf:
    n=(gv[ids[1]]-gv[ids[0]]).cross(gv[ids[2]]-gv[ids[0]])
    if rt(n).y<0:n=-n
    normal+=n
normal.normalize();axis=rt(normal)
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'));mapping['wipers']={'source':'Original Mesh24 wiper subassemblies; original Mesh69 windshield','axis':list(axis),'samples':8,'assemblies':{},'sourceComponents':audit,'note':'Original UV/material surfaces retained. Root rotations plus baked surface-conforming corrections, interpolated by sweep fraction. Cowl remains fixed.'}
original=source.data.copy();all_ids=buckets['driver']|buckets['passenger'];metrics=[]
for side,ids in buckets.items():
    data=original.copy();bm=bmesh.new();bm.from_mesh(data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in ids],context='FACES');bm.to_mesh(data);bm.free()
    control=bpy.data.objects.new(f'WIPER_{side.upper()}_ROOT',None);bpy.context.collection.objects.link(control);control.parent=root
    initial=Vector((.2127,.938,-1.1096)) if side=='driver' else Vector((.7198,.9245,-1.0043))
    q,n,_,_=glass.find_nearest(bl(initial));n=n if rt(n).y>0 else -n
    pivot=q+n*.015;control.location=pivot;bpy.context.view_layer.update()
    mesh=bpy.data.objects.new(f'WIPER_{side.upper()}_ASSEMBLY',data);bpy.context.collection.objects.link(mesh);mesh.parent=control
    # Source mesh transforms are currently identity; retain full world points explicitly.
    world=[source.matrix_world@v.co for v in data.vertices]
    max_angle=math.radians(62)
    offsets=[]
    for p in world:
        q,n,_,_=glass.find_nearest(p);n=n if rt(n).y>0 else -n;offsets.append(max(.004,min(.026,(p-q).dot(n))))
    def fitted(fraction):
        R=Matrix.Rotation(max_angle*fraction,4,normal);inverse=R.inverted();coords=[];max_tangent=0
        for p,offset in zip(world,offsets):
            candidate=pivot+R.to_3x3()@(p-pivot);q,n,_,_=glass.find_nearest(candidate);n=n if rt(n).y>0 else -n
            delta=candidate-q;tangent=(delta-n*delta.dot(n)).length;max_tangent=max(max_tangent,tangent)
            coords.append(inverse.to_3x3()@(q+n*offset-pivot))
        return coords,max_tangent
    base,tangent=fitted(0)
    for v,p in zip(data.vertices,base):v.co=p
    mesh.shape_key_add(name='Basis')
    for i in range(1,9):
        fraction=i/8;coords,tangent=fitted(fraction);key=mesh.shape_key_add(name=f'SWEEP_{i:02d}')
        for v,p in zip(key.data,coords):v.co=p
        metrics.append({'side':side,'fraction':fraction,'maxTangentialCorrection':round(tangent,6)})
    mesh['original_node']='Mesh24';mesh['role']='source_wiper_assembly';control['axis_yup']=list(axis);control['max_angle']=max_angle
    mapping['wipers']['assemblies'][side]={'node':control.name,'mesh':mesh.name,'pivot':list(rt(pivot)),'axis':list(axis),'maxAngle':max_angle,'morphTargets':[f'SWEEP_{i:02d}' for i in range(1,9)],'sourceFaces':len(ids),'sourceVertices':len(data.vertices)}
# Remove the moving faces from the fixed source. No original parked wipers remain underneath.
bm=bmesh.new();bm.from_mesh(source.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index in all_ids],context='FACES');bm.to_mesh(source.data);bm.free();source.data.update()
mapping['wipers']['fitMetrics']=metrics;mapping['version']='I6.1';root['increment']='I6';root['asset_stage']=6
(ROOT/'docs/assets/i6-sweep-fit.json').write_text(json.dumps(mapping['wipers'],indent=2),encoding='utf8',newline='\n')
if '--preview' in sys.argv:
    for cfg in mapping['wipers']['assemblies'].values():
        ob=bpy.data.objects[cfg['node']];ob.rotation_mode='AXIS_ANGLE';ob.rotation_axis_angle=(cfg['maxAngle'],*normal)
        bpy.data.objects[cfg['mesh']].data.shape_keys.key_blocks['SWEEP_08'].value=1
    exec(compile((ROOT/'scripts/render_vehicle_audit.py').read_text(encoding='utf8'),'render_vehicle_audit.py','exec'))
else:
    for file in ['apps/web/public/models/vehicle-mapping.json','docs/assets/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
    exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
print('I6_FIT',json.dumps({'axis':list(axis),'assemblies':mapping['wipers']['assemblies'],'maxTangent':max(m['maxTangentialCorrection'] for m in metrics)}))
