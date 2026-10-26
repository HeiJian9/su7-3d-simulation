"""I5: explicit paint role, fitted lamp emitters and physical cabin LED strips."""
import bpy,json
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
def bl(v):return Vector((v[0],-v[2],v[1]))
def rt(v):return [v.x,v.z,-v.y]
root=bpy.data.objects['SU7_ROOT'];mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
if bpy.data.materials.get('SU7_PAINT_BODY'):raise RuntimeError('I5 already applied; edit the current project instead of adding duplicate emitters.')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='DESELECT')
def mat(name,color,metal=0,rough=.3,emissive=False):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emissive:p.inputs['Emission Color'].default_value=color;p.inputs['Emission Strength'].default_value=0
    return m
def tube(name,points,radius,material,parent=root):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=3
    sp=curve.splines.new('POLY');sp.points.add(len(points)-1)
    for p,v in zip(sp.points,points):p.co=(*bl(v),1)
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);ob.data.materials.append(material)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False)
    world=ob.matrix_world.copy();ob.parent=parent;ob.matrix_parent_inverse=Matrix.Identity(4);ob.matrix_world=world;ob['role']='physical_led_strip';return ob
paint=bpy.data.materials['Paint1Mtl'].copy();paint.name='SU7_PAINT_BODY';paint['role']='body_paint_whitelist'
paint_nodes=[]
for ob in bpy.context.scene.objects:
    if ob.type=='MESH' and any(m and m.name=='Paint1Mtl' for m in ob.data.materials):
        for i,m in enumerate(ob.data.materials):
            if m and m.name=='Paint1Mtl':ob.data.materials[i]=paint
        ob['material_role']='body_paint';paint_nodes.append(ob.name)
roles={'paint':{'material':paint.name,'nodes':paint_nodes,'source':'Paint1Mtl clone; original roughness, metalness and maps retained'},'headlights':{},'turnSignals':{},'ambient':{}}
lens=bpy.data.objects['Mesh70'];tree=BVHTree.FromPolygons([lens.matrix_world@v.co for v in lens.data.vertices],[list(p.vertices) for p in lens.data.polygons])
def fit(point):
    loc,normal,_,_=tree.find_nearest(bl(point));p=Vector(rt(loc));p.z-=.005;return list(p)
for side,sign in [('left',-1),('right',1)]:
    m=mat(f'LAMP_{side.upper()}_WHITE',(.8,.93,1,1),emissive=True)
    # Outline and two projector groups fit the actual source lens surface.
    outline=[(.51,.57,-2.36),(.59,.55,-2.36),(.82,.59,-2.20),(.905,.675,-2.04),(.87,.735,-2.08),(.68,.70,-2.29),(.51,.57,-2.36)]
    points=[fit((sign*x,y,z)) for x,y,z in outline];nodes=[tube(f'HEADLIGHT_{side.upper()}_DRL',points,.0035,m).name]
    emitters=[]
    for i,x in enumerate([.60,.72,.82]):
        center=fit((sign*x,.63,-2.3+(x-.60)*1.0));pts=[(center[0]-.022,center[1],center[2]),(center[0]+.022,center[1],center[2])]
        bulbmat=mat(f'LAMP_{side.upper()}_PROJECTOR_{i}',(.85,.95,1,1),emissive=True)
        node=tube(f'HEADLIGHT_{side.upper()}_PROJECTOR_{i}',pts,.011,bulbmat);emitters.append({'node':node.name,'material':bulbmat.name,'highOnly':i==0})
    roles['headlights'][side]={'drlNodes':nodes,'drlMaterial':m.name,'projectors':emitters,'lightPosition':fit((sign*.72,.63,-2.22))}
    amber=mat(f'TURN_{side.upper()}_AMBER',(1,.27,.012,1),emissive=True)
    front=[fit((sign*x,y,z)) for x,y,z in [(.54,.555,-2.365),(.67,.565,-2.31),(.82,.605,-2.18)]]
    signal_nodes=[tube(f'TURN_{side.upper()}_FRONT',front,.004,amber).name]
    # Rear inner segment follows the source lid, outer segment remains on the quarter.
    for suffix,points,parent in [('LID',[(sign*.45,.827,2.402),(sign*.60,.826,2.392),(sign*.68,.825,2.367)],bpy.data.objects['TRUNK_REAR_ROOT']),('BODY',[(sign*.78,.823,2.296),(sign*.81,.818,2.25)],root)]:
        signal_nodes.append(tube(f'TURN_{side.upper()}_REAR_{suffix}',points,.004,amber,parent).name)
    roles['turnSignals'][side]={'material':amber.name,'nodes':signal_nodes}
ambient=mat('AMBIENT_CABIN_LED',(.35,.1,1,1),emissive=True);ambient_nodes=[]
ambient_nodes.append(tube('AMBIENT_DASHBOARD',[(-.67,.855,-.595),(-.46,.866,-.59),(-.20,.858,-.61),(.20,.858,-.61),(.46,.866,-.59),(.67,.855,-.595)],.0028,ambient).name)
for c in ['fl','fr','rl','rr']:
    sign=-1 if c.endswith('l') else 1;front=c.startswith('f')
    points=[(sign*.766,.936,-.40),(sign*.766,.927,-.15),(sign*.766,.916,.12)] if front else [(sign*.747,.95,.39),(sign*.747,.93,.63),(sign*.747,.913,.88)]
    ambient_nodes.append(tube(f'AMBIENT_DOOR_{c.upper()}',points,.0025,ambient,bpy.data.objects[f'DOOR_{c.upper()}_ROOT']).name)
roles['ambient']={'material':ambient.name,'nodes':ambient_nodes,'lightPositions':[[-.45,.87,-.55],[.45,.87,-.55]],'radius':.0028,'note':'Physical tubes added along dashboard and existing door trim; each door strip is a child of its door hinge.'}
mapping.update({'version':'I5.1','materialRoles':roles,'cockpitHotspots':{'lights':[-.615,.88,-.39],'ambient':[.08,.91,-.48],'wiper':[-.215,.89,-.39]}})
root['increment']='I5';root['asset_stage']=5
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/blender/su7-enhanced.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'apps/web/public/models/su7-runtime.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
for file in ['apps/web/public/models/vehicle-mapping.json','docs/assets/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
print('I5_EXPORTED',json.dumps({'paintNodes':paint_nodes,'ambientNodes':ambient_nodes,'lampRoles':list(roles)}))
