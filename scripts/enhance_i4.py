"""I4: partition the designated SU7 source surfaces; preserve UVs and closed pose.
Run on the current I2/I3 blend. Preview renders do not save or export assets.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
def rt(v):return Vector((v.x,v.z,-v.y))
def bl(v):return Vector((v[0],-v[2],v[1]))
root=bpy.data.objects['SU7_ROOT']; changes=[]
def parent_world(ob,parent):
    world=ob.matrix_world.copy();ob.parent=parent;ob.matrix_parent_inverse=Matrix.Identity(4);ob.matrix_world=world
def material(name,color,rough=.55):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=rough
    return m
inner=material('I4_TRUNK_LINER',(.025,.03,.034,1),.9)
def mesh(name,verts,faces,mat,parent=root):
    data=bpy.data.meshes.new(name+'_GEOMETRY');data.from_pydata([bl(v) for v in verts],[],faces);data.materials.append(mat);data.update()
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);parent_world(ob,parent);ob['provenance']='I4 necessary inner cavity / closure surface';return ob
def tube(name,points,radius,mat,parent=root):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=2
    s=curve.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*bl(v),1)
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False);parent_world(ob,parent);return ob
def extract(ob,ids,name,parent):
    """Clone then delete complementary faces with bmesh: preserves UVs/normals/material slots."""
    if not ids:return None
    data=ob.data.copy();out=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(out);out.matrix_world=ob.matrix_world.copy()
    bm=bmesh.new();bm.from_mesh(data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in ids],context='FACES');bm.to_mesh(data);bm.free();data.update()
    bm=bmesh.new();bm.from_mesh(ob.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index in ids],context='FACES');bm.to_mesh(ob.data);bm.free();ob.data.update()
    parent_world(out,parent);out['original_node']=ob.name;out['source_faces']=len(ids);changes.append({'source':ob.name,'destination':name,'faces':len(ids)});return out
if bpy.data.objects.get('TRUNK_REAR_ROOT'):raise RuntimeError('I4 already applied; use the existing project, do not re-partition it.')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='DESELECT')
mapping={'version':'I4.1','coordinates':'Y up, front -Z, left -X','doors':{},'trunk':{}}
outer={'fl':'Paint4','fr':'Paint2','rl':'Paint3','rr':'Paint1'}
related={'fl':['Mesh44','Mesh45','Mesh47','Mesh48','Mesh49','Mesh50','Mesh51'],
         'fr':['Mesh31','Mesh32','Mesh34','Mesh35','Mesh36','Mesh37','Mesh38'],
         'rl':['Mesh40','Mesh41','Mesh42','Mesh43'], 'rr':['Mesh27','Mesh28','Mesh29','Mesh30']}
wm=json.loads((ROOT/'docs/assets/window-mapping.json').read_text(encoding='utf8'))
trees={}
for c,name in outer.items():
    ob=bpy.data.objects[name];trees[c]=BVHTree.FromPolygons([ob.matrix_world@v.co for v in ob.data.vertices],[list(p.vertices) for p in ob.data.polygons],all_triangles=False)
for c in outer:
    side=-1 if c.endswith('l') else 1;hinge=Vector((side*.895,.665,-.875 if c.startswith('f') else .26))
    door=bpy.data.objects[f'DOOR_{c.upper()}_ROOT'];children=[(ob,ob.matrix_world.copy()) for ob in door.children]
    door.location=bl(hinge);bpy.context.view_layer.update()
    for child,world in children:child.matrix_world=world
    for name in [outer[c]]+related[c]:parent_world(bpy.data.objects[name],door)
    # The front frit perimeter is a separate original mesh, part of the movable glass.
    frit='Mesh44' if c=='fl' else 'Mesh31' if c=='fr' else None
    if frit:parent_world(bpy.data.objects[frit],bpy.data.objects[f'WINDOW_{c.upper()}_ROOT'])
    config=wm['windows'][c];config['closedTranslation']=list(rt(bpy.data.objects[config['node']].location));config['clipPlane'][3]+=sum(config['clipPlane'][i]*hinge[i] for i in range(3))
    config['companionGlass']=[frit] if frit else []
    door['hinge_yup']=list(hinge);door['max_angle_radians']=side*math.radians(65);door['role']='complete_door_assembly'
    mapping['doors'][c]={'node':door.name,'hinge':list(hinge),'axis':[0,1,0],'maxAngle':side*math.radians(65),'sourceOuter':outer[c],'sourceRelated':related[c],
        'hotspot':[side*.963,.86,.10 if c.startswith('f') else .93]}
# Paint6 contains the four inner edge/return strips plus hinge hardware, welded across door seams.
ob=bpy.data.objects['Paint6'];buckets={c:set() for c in outer}
# The bottom return includes triangles spanning both doors. Cut the B-pillar seam
# before attribution; moving an unsplit spanning face would leave long spikes.
bm=bmesh.new();bm.from_mesh(ob.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=ob.matrix_world.inverted()@bl((0,.6,.24)),plane_no=ob.matrix_world.to_3x3().transposed()@bl((0,-.035,1)),clear_inner=False,clear_outer=False)
bm.to_mesh(ob.data);bm.free();ob.data.update()
for face in ob.data.polygons:
    p=rt(ob.matrix_world@face.center);c=('f' if p.z<.24+.035*(p.y-.6) else 'r')+('l' if p.x<0 else 'r');buckets[c].add(face.index)
# Extract in one pass from untouched clones, then remove the original (no duplicate residual skin).
original=ob.data.copy()
for c,ids in buckets.items():
    temp=bpy.data.objects.new('Paint6_SOURCE',original.copy());bpy.context.collection.objects.link(temp);temp.matrix_world=ob.matrix_world.copy()
    extract(temp,ids,f'DOOR_{c.upper()}_RETURNS',bpy.data.objects[f'DOOR_{c.upper()}_ROOT']);bpy.data.objects.remove(temp,do_unlink=True)
bpy.data.objects.remove(ob,do_unlink=True)
# Lid footprint follows the source sedan deck: rear glazing and quarter panels remain fixed.
lid=bpy.data.objects.new('TRUNK_REAR_ROOT',None);bpy.context.collection.objects.link(lid);lid.parent=root
hinge=Vector((0,1.077,1.975));lid.location=bl(hinge);bpy.context.view_layer.update()
foot=[(-.55,1.975),(.55,1.975),(.76,2.18),(.775,2.40),(.68,2.50),(-.68,2.50),(-.775,2.40),(-.76,2.18)]
def inside(x,z):
    # convex footprint; counter-clockwise in X/Z
    return all((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=-.00001 for a,b in zip(foot,foot[1:]+foot[:1]))
def split_lid(ob):
    # Bisect at footprint planes and lower seam before classifying, so there are no jagged centroid cuts.
    bm=bmesh.new();bm.from_mesh(ob.data)
    for a,b in zip(foot,foot[1:]+foot[:1]):
        normal=bl((-(b[1]-a[1]),0,b[0]-a[0]));co=bl((a[0],0,a[1]))
        localn=ob.matrix_world.to_3x3().transposed()@normal;localco=ob.matrix_world.inverted()@co
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=localco,plane_no=localn,clear_inner=False,clear_outer=False)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=ob.matrix_world.inverted()@bl((0,.812,0)),plane_no=ob.matrix_world.to_3x3().transposed()@bl((0,1,0)),clear_inner=False,clear_outer=False)
    bm.to_mesh(ob.data);bm.free();ob.data.update()
    ids={p.index for p in ob.data.polygons if (lambda v: v.y>=.812-.00001 and inside(v.x,v.z))(rt(ob.matrix_world@p.center))}
    return extract(ob,ids,'TRUNK_'+ob.name,lid)
lid_parts=[]
for name in ['Paint5','Mesh17','Mesh18','Mesh19','Mesh20','Mesh21','Mesh23','Mesh24','Mesh25','Mesh58','Mesh71']:
    piece=split_lid(bpy.data.objects[name])
    if piece:lid_parts.append(piece.name)
    if not len(bpy.data.objects[name].data.polygons):bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
# Thin inner lid follows the actual extracted outside, avoiding a solid proxy replacing the lid.
skin=bpy.data.objects['TRUNK_Paint5'];inside_skin=skin.copy();inside_skin.data=skin.data.copy();inside_skin.name='TRUNK_INNER_SKIN';bpy.context.collection.objects.link(inside_skin);inside_skin.location+=bl((0,-.018,0));inside_skin.data.materials.clear();inside_skin.data.materials.append(inner)
for p in inside_skin.data.polygons:p.material_index=0
# Open cavity: floor and four walls, no top face, recessed below the original deck.
v=[(-.64,.43,1.99),(.64,.43,1.99),(.64,.43,2.39),(-.64,.43,2.39),(-.64,1.04,1.99),(.64,1.04,1.99),(.64,.805,2.39),(-.64,.805,2.39)]
mesh('TRUNK_INNER_CAVITY',v,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],inner)
tube('TRUNK_SEAL',[(-.55,1.058,1.985),(.55,1.058,1.985),(.74,.985,2.18),(.75,.825,2.39),(-.75,.825,2.39),(-.74,.985,2.18),(-.55,1.058,1.985)],.008,inner)
mapping['trunk']={'node':lid.name,'hinge':list(hinge),'axis':[1,0,0],'maxAngle':-math.radians(68),'sourceParts':lid_parts,'footprint':foot,'hotspot':[0,.91,2.43]}
mapping['changes']=changes
wm['version']='I4.1';root['increment']='I4';root['asset_stage']=4
bpy.context.view_layer.update()
# Closed poses are authoritative on disk. Opening is only used for read-only render inspection.
if '--preview' in sys.argv:
    for c in ['fl','rl']:bpy.data.objects[f'DOOR_{c.upper()}_ROOT'].rotation_euler.z=mapping['doors'][c]['maxAngle']
    lid.rotation_euler.x=mapping['trunk']['maxAngle'];bpy.context.view_layer.update()
    exec(compile((ROOT/'scripts/render_vehicle_audit.py').read_text(encoding='utf8'),'render_vehicle_audit.py','exec'))
else:
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/blender/su7-enhanced.blend'))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'apps/web/public/models/su7-runtime.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    for file in ['apps/web/public/models/vehicle-mapping.json','docs/assets/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
    for file in ['apps/web/public/models/window-mapping.json','docs/assets/window-mapping.json']:(ROOT/file).write_text(json.dumps(wm,indent=2),encoding='utf8',newline='\n')
    print('I4_EXPORTED',json.dumps({'doors':4,'lidParts':lid_parts,'partitions':len(changes)}))
