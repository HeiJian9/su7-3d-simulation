"""I2: modify the existing Blender baseline, preserving real SU7 glass surfaces."""
import bpy
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent.parent
CANDIDATES = {'fl':'Mesh46','fr':'Mesh33','rl':'Mesh39','rr':'Mesh26'}
def rt(v): return Vector((v.x,v.z,-v.y))
def blend(v): return Vector((v[0],-v[2],v[1]))
root = bpy.data.objects['SU7_ROOT']
mapping = {'version':'I2.1','modelId':'ca2cda599f5341068c992c9f44551bf9','coordinates':'Y up, front -Z, driver left -X','windows':{}}
for c,source in CANDIDATES.items():
    name=f'WINDOW_{c.upper()}_GLASS'
    ob=bpy.data.objects.get(source) or bpy.data.objects.get(name)
    if ob is None: raise RuntimeError(f'Missing source glass {source}')
    world=[ob.matrix_world @ v.co for v in ob.data.vertices]
    points=[rt(p) for p in world]
    low=[min(p[i] for p in points) for i in range(3)]
    high=[max(p[i] for p in points) for i in range(3)]
    bottom=[p for p in points if p.y < low[1]+(.035 if c[0]=='f' else .05)]
    zmean=sum(p.z for p in bottom)/len(bottom); ymean=sum(p.y for p in bottom)/len(bottom)
    slope=sum((p.z-zmean)*(p.y-ymean) for p in bottom)/sum((p.z-zmean)**2 for p in bottom)
    intercept=ymean-slope*zmean
    side=-1 if c.endswith('l') else 1
    travel=round(high[1]-low[1]+.055,3)
    anchor=Vector((side*.75,intercept+slope*(low[2]+high[2])/2,(low[2]+high[2])/2))
    door=bpy.data.objects.get(f'DOOR_{c.upper()}_ROOT')
    if door is None:
        door=bpy.data.objects.new(f'DOOR_{c.upper()}_ROOT',None);bpy.context.collection.objects.link(door);door.parent=root
    control=bpy.data.objects.get(f'WINDOW_{c.upper()}_ROOT')
    if control is None:
        control=bpy.data.objects.new(f'WINDOW_{c.upper()}_ROOT',None);bpy.context.collection.objects.link(control);control.parent=door
    control.location=blend(anchor)
    control.rotation_euler=(0,0,0);control.scale=(1,1,1)
    bpy.context.view_layer.update()
    inverse=control.matrix_world.inverted()
    ob.parent=control;ob.matrix_parent_inverse=Matrix.Identity(4);ob.matrix_basis=Matrix.Identity(4)
    if ob.data.users>1:ob.data=ob.data.copy()
    for vertex,p in zip(ob.data.vertices,world):vertex.co=inverse @ p
    ob.name=name;ob.data.name=name+'_GEOMETRY';ob['original_node']=source;ob['role']='movable_window_glass'
    control['corner']=c;control['openness']=0.0;control['travel_yup']=[side*.11,-travel,0]
    control['motion_note']='Translate real source glass into door; web driver clips only buried area at door sill.'
    ob.data.update()
    edges={}
    for face in ob.data.polygons:
        ids=list(face.vertices)
        for a,b in zip(ids,ids[1:]+ids[:1]):
            edge=tuple(sorted((a,b)));edges[edge]=edges.get(edge,0)+1
    boundary=[[list(points[a]),list(points[b])] for (a,b),count in edges.items() if count==1]
    mapping['windows'][c]={'sourceNode':source,'node':control.name,'glass':name,'parent':door.name,
        'closedTranslation':list(anchor),'travel':[side*.11,-travel,0],'clipPlane':[0,1,-slope,-intercept+.006],
        'closedBounds':{'min':low,'max':high},'boundary':boundary,'range':[0,1],
        'material':'Mesh26Mtl','fixedAdjacentGlazing':'Other glass meshes (including Mesh69 and Mesh63) remain static.',
        'fixedTriangleFinding':'Source candidate is one connected main pane without a separate triangular island; all neighboring static glazing is retained.'}
root['increment']='I2: real four-window geometry, no I4+ controls'
bpy.context.view_layer.update()
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/blender/su7-enhanced.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'apps/web/public/models/su7-runtime.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
for output in [ROOT/'apps/web/public/models/window-mapping.json',ROOT/'docs/assets/window-mapping.json']:
    output.write_text(json.dumps(mapping,indent=2),encoding='utf8')
print('I2_WINDOWS_EXPORTED',json.dumps({c:{'source':w['sourceNode'],'travel':w['travel']} for c,w in mapping['windows'].items()}))
