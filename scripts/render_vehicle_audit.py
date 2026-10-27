"""Read-only orthographic part inspection. Never saves the source blend."""
import bpy, sys, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
def blend(v): return Vector((v[0],-v[2],v[1]))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.resolution_x=1400;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world.color=(.3,.3,.3)
mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'parts'
colors={'Paint4':(.9,.2,.1,1),'Paint2':(.9,.2,.1,1),'Paint3':(.1,.5,.9,1),'Paint1':(.1,.5,.9,1),'Paint5':(.4,.4,.4,1),'Paint6':(.1,.9,.4,1),'Mesh24':(1,.8,.1,1),'Mesh25':(.8,.1,.8,1)}
if mode=='lamps':colors={'Mesh61':(1,.1,.1,1),'Mesh62':(1,.8,.1,1),'Mesh73':(1,.8,.1,1),'Mesh68':(.2,1,.2,1),'Mesh70':(.1,.7,1,1)}
if mode in ['parts','lamps']:
    for ob in list(scene.objects):
        if ob.type!='MESH':continue
        mat=bpy.data.materials.new('AUDIT_'+ob.name);mat.diffuse_color=colors.get(ob.name,(.13,.14,.15,1));mat.use_nodes=True
        bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=mat.diffuse_color;bsdf.inputs['Roughness'].default_value=.65
        ob.data.materials.clear();ob.data.materials.append(mat)
        for p in ob.data.polygons:p.material_index=0
camdata=bpy.data.cameras.new('AUDIT');cam=bpy.data.objects.new('AUDIT',camdata);scene.collection.objects.link(cam);scene.camera=cam
camdata.type='ORTHO';camdata.ortho_scale=5.7
views=[('left',(-7,2.2,0),(0,.8,0)),('rear',(3,2.8,6),(0,.85,1)),('cabin',(-3,3,-3),(0,.75,0))]
if mode=='lamps':views=[('front',(-3,2,-6),(0,.75,-.6))]
if mode=='seams':
    scene.render.resolution_x=1400;scene.render.resolution_y=1100;camdata.type='PERSP';camdata.lens=43;scene.world.color=(.16,.16,.16)
    views=[('closed',(0,1.45,4.65),(0,.95,2.15)),('half',(0,1.45,4.65),(0,.95,2.15)),('full',(0,1.45,4.65),(0,.95,2.15)),('side',(2.5,1.9,3.9),(0,1,2.10))]
    mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'));folder=ROOT/'.tools/trunk-seams';folder.mkdir(exist_ok=True)
for name,pos,target in views:
    if mode=='seams':
        bpy.data.objects['TRUNK_REAR_ROOT'].rotation_euler.x=mapping['trunk']['maxAngle']*({'closed':0,'half':.5}.get(name,1));bpy.context.view_layer.update()
    cam.location=blend(pos);cam.rotation_euler=(blend(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    ld=bpy.data.lights.new('AUDIT_LIGHT','AREA');lo=bpy.data.objects.new('AUDIT_LIGHT',ld);scene.collection.objects.link(lo);lo.location=cam.location;lo.rotation_euler=cam.rotation_euler;ld.energy=1800;ld.shape='DISK';ld.size=6
    if mode=='seams':ld.energy=900;ld.size=4
    if mode=='seams' and name=='closed':
        helpers=[ob for ob in scene.objects if ob.get('native_helper')]
        for ob in helpers:ob.hide_render=True
        scene.render.filepath=str(folder/'closed-native-reference.png');bpy.ops.render.render(write_still=True)
        for ob in helpers:ob.hide_render=False
    scene.render.filepath=str(folder/(name+'.png')) if mode=='seams' else str(ROOT/'.tools/vehicle-audit'/f'{mode}-{name}.png');bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(lo,do_unlink=True)
print('RENDER_COMPLETE')
