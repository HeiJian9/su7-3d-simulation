"""Use original SU7 lamp surfaces. Remove the former tube/rod proxies.

Only native polygon material indices change; positions, UVs and custom normals
are untouched. Rear lamp material slots retain the existing lid/body hierarchy.
"""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
root=bpy.data.objects['SU7_ROOT']
if root.get('native_lamps_version')=='native_surfaces_v3_inner_rear':raise RuntimeError('Native lamp materials already assigned; do not repeat.')
upgrading=bool(root.get('native_lamps_version'))
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'));roles=mapping['materialRoles']
bpy.context.preferences.filepaths.save_version=0
def rt(p):return Vector((p.x,p.z,-p.y))
def groups(ob):
    data=ob.data;parent=list(range(len(data.vertices)));quant={}
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for v in data.vertices:
        key=tuple(round(x,5) for x in v.co)
        if key in quant:parent[find(v.index)]=find(quant[key])
        else:quant[key]=v.index
    for face in data.polygons:
        for i in face.vertices[1:]:parent[find(i)]=find(face.vertices[0])
    out={}
    for face in data.polygons:out.setdefault(find(face.vertices[0]),[]).append(face.index)
    return list(out.values())
def center(ob,ids):
    points=[rt(ob.matrix_world@ob.data.vertices[i].co) for f in ids for i in ob.data.polygons[f].vertices]
    return sum(points,Vector())/len(points)
removed=[]
for ob in list(bpy.context.scene.objects):
    if ob.name.startswith(('HEADLIGHT_','TURN_')):removed.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)
assert len(removed)==(0 if upgrading else 14),removed
if upgrading:
    removed=mapping['materialRoles']['removedProxyNodes']
    ob=bpy.data.objects['Mesh68']
    for p in ob.data.polygons:
        if ob.data.materials[p.material_index].name.startswith('TURN_'):p.material_index=0
    for i in reversed(range(1,len(ob.data.materials))):
        if ob.data.materials[i].name.startswith('TURN_'):ob.data.materials.pop(index=i)
    # The user revised the rear target from the C contour to the inner modules.
    for name in ['Mesh21','TRUNK_Mesh21']:
        ob=bpy.data.objects[name]
        for p in ob.data.polygons:
            if ob.data.materials[p.material_index].name.startswith('TURN_'):p.material_index=0
        for i in reversed(range(1,len(ob.data.materials))):
            if ob.data.materials[i].name.startswith('TURN_'):ob.data.materials.pop(index=i)
bpy.data.orphans_purge(do_recursive=True)
def clone(source,name):
    if bpy.data.materials.get(name):return bpy.data.materials[name]
    mat=bpy.data.materials[source].copy();mat.name=name;mat.use_nodes=True
    bsdf=mat.node_tree.nodes['Principled BSDF'];bsdf.inputs['Emission Color'].default_value=(1,1,1,1);bsdf.inputs['Emission Strength'].default_value=0
    mat['role']='native_source_lamp';return mat
records=[]
def assign(ob,ids,mat,role,side):
    index=next((i for i,m in enumerate(ob.data.materials) if m==mat),None)
    if index is None:index=len(ob.data.materials);ob.data.materials.append(mat)
    for f in ids:ob.data.polygons[f].material_index=index
    records.append({'node':ob.name,'source':ob.get('native_original',ob.name),'role':role,'side':side,'material':mat.name,'faces':len(ids),'faceIndices':ids,'center':list(center(ob,ids))})
bulbs=bpy.data.objects['Mesh61'];parts=groups(bulbs);assert len(parts)==8 and all(len(ids)==10 for ids in parts)
old_heads=roles['headlights'];heads={}
for side,sign in [('left',-1),('right',1)]:
    selected=sorted([ids for ids in parts if center(bulbs,ids).x*sign>0],key=lambda ids:(center(bulbs,ids).y,abs(center(bulbs,ids).x)))
    projectors=[]
    for i,ids in enumerate(selected):
        material=clone('Mesh61Mtl',f'LAMP_{side.upper()}_PROJECTOR_{i}');assign(bulbs,ids,material,'projector',side)
        projectors.append({'node':bulbs.name,'material':material.name,'highOnly':False,'sourceFaces':10,'center':list(center(bulbs,ids))})
    heads[side]={'drlNodes':[],'drlMaterial':None,'projectors':projectors,'lightPosition':old_heads[side]['lightPosition']}
signals={}
for side,sign in [('left',-1),('right',1)]:
    front=clone('Mesh62Mtl',f'TURN_{side.upper()}_FRONT_AMBER');rear=clone('Mesh19Mtl',f'TURN_{side.upper()}_AMBER')
    diffuser=bpy.data.objects['Mesh73' if sign<0 else 'Mesh62'];ids=list(range(len(diffuser.data.polygons)));assert len(ids)==91
    assign(diffuser,ids,front,'front_native_diffuser',side)
    source='Mesh20' if sign<0 else 'Mesh19';rear_nodes=[]
    for name in [source,'TRUNK_'+source]:
        ob=bpy.data.objects[name];ids=list(range(len(ob.data.polygons)));assign(ob,ids,rear,'rear_native_inner_module',side);rear_nodes.append(name)
    signals[side]={'material':rear.name,'materials':[front.name,rear.name],'nodes':[diffuser.name]+rear_nodes}
roles['headlights']=heads;roles['turnSignals']=signals;roles['nativeLampSources']=['Mesh61','Mesh68','Mesh21','Mesh62','Mesh73','Mesh19','Mesh20'];roles['removedProxyNodes']=removed
roles['nativeLampAudit']='docs/assets/native-lamp-audit.json';roles['lampNote']='Original Mesh61 projector faces, Mesh62/73 front diffuser, Mesh19/20 inner rear modules per latest user annotation. C contours restored. Yellow only in the on half-cycle; original colours otherwise.'
mapping['version']='I6.5-native-lamps';root['native_lamps_version']='native_surfaces_v3_inner_rear';root['increment']='I6 native lamp repair'
report={'sourceRevision':'9ee4d5f','modifiedSourceNodes':['Mesh61','Mesh62','Mesh73','Mesh19','Mesh20','TRUNK_Mesh19','TRUNK_Mesh20'],'removedProxyNodes':removed,'addedGeometry':False,'positionsUvNormalsChanged':False,'records':records,'note':roles['lampNote']}
(ROOT/'docs/assets/native-lamp-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8',newline='\n')
for path in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/path).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
print('NATIVE_LAMP_REPAIR',json.dumps({'removed':len(removed),'nativeProjectors':8,'signalMaterials':4,'nativeAssignments':len(records)}))
