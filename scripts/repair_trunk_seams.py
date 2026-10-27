"""Restore native SU7 panel islands and normals; never slice with invented planes.

The temporary library is read from the original I3 Git object, not a second
project checkout. Only original tail source objects are restored. Wipers stay.
"""
import bpy,json,math,sys,subprocess
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
def bl(v):return Vector((v[0],-v[2],v[1]))
def rt(v):return Vector((v.x,v.z,-v.y))
root=bpy.data.objects['SU7_ROOT'];lid=bpy.data.objects['TRUNK_REAR_ROOT']
if lid.get('native_seams_version')=='native_source_islands_v2':raise RuntimeError('Native source panels already restored; do not repeat the repair.')
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
bpy.context.preferences.filepaths.save_version=0
lid.rotation_euler=(0,0,0);bpy.context.view_layer.update()
sources=['Paint5','Mesh17','Mesh18','Mesh19','Mesh20','Mesh21','Mesh23','Mesh24','Mesh25','Mesh58','Mesh71']
def parent_world(ob,parent):
    world=ob.matrix_world.copy();ob.parent=parent;ob.matrix_parent_inverse=Matrix.Identity(4);ob.matrix_world=world
def components(data,weld=False):
    parent=list(range(len(data.vertices)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    if weld:
        quant={}
        for v in data.vertices:
            key=tuple(round(x,5) for x in v.co)
            if key in quant:parent[find(v.index)]=find(quant[key])
            else:quant[key]=v.index
    for p in data.polygons:
        for i in p.vertices[1:]:parent[find(i)]=find(p.vertices[0])
    groups={}
    for p in data.polygons:groups.setdefault(find(p.vertices[0]),[]).append(p.index)
    return list(groups.values())
def bounds(data,ids):
    pts=[rt(data.vertices[i].co) for f in ids for i in data.polygons[f].vertices]
    return [min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]
def subset(original,ids,name,parent):
    if not ids:return None
    source=original.data;ids=sorted(ids);vertices=sorted(set(i for f in ids for i in source.polygons[f].vertices));index={v:i for i,v in enumerate(vertices)}
    data=bpy.data.meshes.new(name+'_NATIVE_GEOMETRY');data.from_pydata([source.vertices[i].co for i in vertices],[],[[index[i] for i in source.polygons[f].vertices] for f in ids]);data.update()
    for mat in source.materials:
        matname=mat.name.rsplit('.',1)[0] if mat.name.rsplit('.',1)[-1].isdigit() else mat.name
        data.materials.append(bpy.data.materials['SU7_PAINT_BODY'] if matname=='Paint1Mtl' else bpy.data.materials.get(matname) or mat)
    source_loops=[i for f in ids for i in source.polygons[f].loop_indices]
    for layer in source.uv_layers:
        uv=data.uv_layers.new(name=layer.name)
        for i,source_i in enumerate(source_loops):uv.data[i].uv=layer.data[source_i].uv
    for p,f in zip(data.polygons,ids):p.material_index=source.polygons[f].material_index;p.use_smooth=source.polygons[f].use_smooth
    data.normals_split_custom_set([source.corner_normals[i].vector for i in source_loops])
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.matrix_world=original.matrix_world.copy();parent_world(ob,parent)
    ob['native_original']=original.get('native_original');ob['source_faces']=len(ids);return ob
def mesh(name,pts,faces,material,parent):
    data=bpy.data.meshes.new(name+'_GEOMETRY');data.from_pydata([bl(p) for p in pts],[],faces);data.materials.append(material);data.update()
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);parent_world(ob,parent);ob['native_helper']=True;return ob
def tube(name,pts,radius,material,parent):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=2
    s=curve.splines.new('POLY');s.points.add(len(pts)-1)
    for p,v in zip(s.points,pts):p.co=(*bl(v),1)
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);ob.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH');ob.select_set(False);parent_world(ob,parent);ob['native_helper']=True;return ob
temporary=ROOT/'.tools/su7-original-tail.blend'
if not temporary.exists():temporary.write_bytes(subprocess.check_output(['git','show','v0.3.2-i3-complete:assets/source/blender/su7-enhanced.blend'],cwd=ROOT))
try:
    with bpy.data.libraries.load(str(temporary),link=False) as (available,loaded):loaded.objects=list(sources)
finally:temporary.unlink(missing_ok=True)
originals={}
for name,ob in zip(sources,loaded.objects):
    ob['native_original']=name;ob.name='NATIVE_REFERENCE_'+name;ob.parent=None;ob.matrix_world=Matrix.Identity(4);originals[name]=ob
# Remove prior arbitrary cuts and all helper caps/rings. These do not form the
# native seam and cannot be patched by changing their colour or transparency.
for ob in list(bpy.context.scene.objects):
    if ob.name in sources or ob.name.startswith('TRUNK_') and ob!=lid or ob.name.startswith('BODY_REAR_LAMP_END_'):
        bpy.data.objects.remove(ob,do_unlink=True)
children=[(ob,ob.matrix_world.copy()) for ob in lid.children]
hinge=Vector((0,1.075,1.88));lid.location=bl(hinge);bpy.context.view_layer.update()
for ob,world in children:ob.matrix_world=world
parts=[];audit={};selections={}
for name,original in originals.items():
    data=original.data;moving=set();excluded=set();records=[]
    if name=='Mesh24':
        for group in components(data,True):
            low,high=bounds(data,group)
            if low[1]>.83 and high[2]<-.98 and low[0]>-.75 and high[0]<.75:excluded.update(group)
        # I4's blanket bisects had increased the old 536 faces to 562 before
        # I6 extracted them. Restore the uncut fixed body, not those bisects.
        assert len(excluded)==536,('parked original wiper removal',len(excluded))
    for group in components(data):
        low,high=bounds(data,group);width=max(abs(low[0]),abs(high[0]))
        belongs=low[2]>1.8 and low[1]>.63 and width<.70
        # Rear-window perimeter is a fixed body trim. Only its native spoiler
        # hardware island travels, not the broad lower glazing border.
        if name=='Mesh25':belongs=low[2]>2.20 and low[1]>.63 and width<.70
        if name=='Mesh24':belongs=low[2]>1.8 and low[1]>.63 and width<.625
        if name in {'Mesh17','Mesh18','Mesh19','Mesh20','Mesh21','Mesh23','Mesh71'}:belongs=low[2]>2.285 and low[1]>.75 and width<.625
        if name=='Mesh58':belongs=True
        if belongs:moving.update(group)
        records.append({'firstFace':group[0],'faces':len(group),'min':low,'max':high,'moving':belongs})
    assert not moving&excluded
    for ids,outname,parent in [(moving,'TRUNK_'+name,lid),(set(range(len(data.polygons)))-moving-excluded,name,root)]:
        ob=subset(original,ids,outname,parent)
        if ob and parent==lid:parts.append(outname)
    selections[name]=moving;audit[name]={'originalFaces':len(data.polygons),'movingFaces':len(moving),'fixedFaces':len(data.polygons)-len(moving)-len(excluded),'removedOriginalParkedWipers':len(excluded),'nativeIslands':records}
for name in ['Mesh52','Mesh55','Mesh56']:parent_world(bpy.data.objects[name],lid);parts.append(name)
bpy.context.view_layer.update()
# Form the inner cover from the original base-panel islands. Shrink it inward;
# no strips reach out from this cover to the exterior seam or lamp surface.
liner=bpy.data.materials['TRUNK_FORMED_CARPET'];rubber=bpy.data.materials['TRUNK_FLUSH_SEAL'];hardware=bpy.data.materials['TRUNK_HINGE_FINISH']
cover_ids=set()
for group in components(originals['Paint5'].data):
    if group[0] in [2562,3055,7151,7169]:cover_ids.update(group)
cover=subset(originals['Paint5'],cover_ids,'TRUNK_INNER_SKIN',lid);cover['native_helper']=True;cover.data.materials.clear();cover.data.materials.append(liner)
for v in cover.data.vertices:
    p=rt(v.co);p=Vector((p.x*.965,.90+(p.y-.90)*.96,2.18+(p.z-2.18)*.94))
    p.y=min(p.y,.84+max(0,2.18-p.z)*.75);v.co=bl(p)
for p in cover.data.polygons:p.material_index=0
cover.data.normals_split_custom_set([(0,0,0)]*len(cover.data.loops));cover.data.update()
# Cargo lining follows original seam samples, inset into the existing body.
# These guides form only a hidden lining; they never cut the outside panels.
paint=bpy.data.objects['TRUNK_Paint5'];tree=BVHTree.FromPolygons([paint.matrix_world@v.co for v in paint.data.vertices],[list(p.vertices) for p in paint.data.polygons])
right=[(.55,1.075,1.92),(.63,1.04,2.00),(.642,1.02,2.10),(.638,.95,2.23),(.618,.88,2.34),(.595,.79,2.40),(.58,.72,2.45),(.53,.65,2.47)]
guides=[(-.55,1.075,1.92),(-.30,1.075,1.92),(0,1.075,1.92),(.30,1.075,1.92)]+right+[(.30,.644,2.49),(0,.644,2.49),(-.30,.644,2.49)]+[(-x,y,z) for x,y,z in reversed(right[1:])]
rim=[];outer=[]
for guide in guides:
    q=rt(tree.find_nearest(bl(guide))[0]);p=Vector((q.x*.975,.88+(q.y-.88)*.96,2.20+(q.z-2.20)*.96));p.y-=.012 if p.y>.85 else 0;outer.append(list(p));p=Vector((p.x*.975,p.y-.008,2.20+(p.z-2.20)*.98));rim.append(list(p))
n=len(rim);flange=[]
for p,q in zip(outer,rim):flange.extend([p,q])
mesh('TRUNK_BODY_FLANGE',flange,[(2*i,2*((i+1)%n),2*((i+1)%n)+1,2*i+1) for i in range(n)],rubber,root)
tube('TRUNK_BODY_GASKET',rim+[rim[0]],.0025,rubber,root)
shoulder=[];floor=[]
for p in rim:
    depth=max(0,min(1,(p[2]-1.92)/.57));shoulder.append([p[0]*.98,.79*(1-depth)+.49*depth,1.25+depth*1.20]);floor.append([p[0]*.86,.365,1.17+depth*1.22])
mesh('TRUNK_INNER_CAVITY',rim+shoulder+floor,[tuple(range(n*2,n*3))]+[(row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i) for row in range(2) for i in range(n)],liner,root)
for side,sign in [('LEFT',-1),('RIGHT',1)]:tube('TRUNK_HINGE_'+side,[(sign*.49,hinge.y,hinge.z),(sign*.49,.97,1.94),(sign*.49,.83,2.02),(sign*.49,.84,2.10),(sign*.49,.95,2.105)],.015,hardware,lid)
# Keep the rear lining behind the original lamp housing as well as the paint.
# Multi-view first-hit checks detect even tiny slivers through the lamp splits.
for name in ['TRUNK_BODY_FLANGE','TRUNK_BODY_GASKET','TRUNK_INNER_CAVITY']:
    ob=bpy.data.objects[name]
    for v in ob.data.vertices:
        p=rt(v.co)
        if p.z>2.20 and p.y<.93:p.x*=.98;p.z-=.04
        v.co=bl(p)
    ob.data.update()
for original in originals.values():bpy.data.objects.remove(original,do_unlink=True)
bpy.context.view_layer.update()
if '--preview' in sys.argv:
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.world.color=(.16,.16,.16)
    camera_data=bpy.data.cameras.new('SEAM_AUDIT_CAMERA');camera=bpy.data.objects.new('SEAM_AUDIT_CAMERA',camera_data);scene.collection.objects.link(camera);scene.camera=camera;camera_data.lens=43
    for i,pos in enumerate([(0,3.4,4.5),(-3,3,2)]):
        data=bpy.data.lights.new('SEAM_AUDIT_LIGHT','AREA');data.energy=900 if i==0 else 600;data.size=4;ob=bpy.data.objects.new(data.name,data);scene.collection.objects.link(ob);ob.location=bl(pos);ob.rotation_euler=(bl((0,.8,2.1))-ob.location).to_track_quat('-Z','Y').to_euler()
    folder=ROOT/'.tools/trunk-seams';folder.mkdir(exist_ok=True)
    if '--part-colors' in sys.argv:
        colors={'Paint5':(.8,.1,.05,1),'Mesh24':(.05,.8,.1,1),'Mesh71':(.05,.1,.8,1),'Mesh25':(.8,.05,.8,1),'Mesh17':(.8,.6,.05,1),'Mesh18':(.05,.7,.8,1),'Mesh21':(.8,.1,.4,1)}
        for source in sources:
            ob=bpy.data.objects.get('TRUNK_'+source)
            if not ob:continue
            mat=bpy.data.materials.new('SOURCE_PART_'+source);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=colors.get(source,(.5,.5,.5,1));ob.data.materials.clear();ob.data.materials.append(mat)
            for p in ob.data.polygons:p.material_index=0
    for name,amount,pos,target in [('closed',0,(0,1.45,4.65),(0,.95,2.15)),('half',.5,(0,1.45,4.65),(0,.95,2.15)),('full',1,(0,1.45,4.65),(0,.95,2.15)),('side',1,(2.5,1.9,3.9),(0,1,2.10))]:
        if '--part-colors' in sys.argv and name!='full':continue
        if '--part-colors' in sys.argv:name='parts-full'
        lid.rotation_euler.x=-math.radians(100)*amount;bpy.context.view_layer.update();camera.location=bl(pos);camera.rotation_euler=(bl(target)-camera.location).to_track_quat('-Z','Y').to_euler()
        if name=='closed':
            helpers=[ob for ob in scene.objects if ob.get('native_helper')]
            for ob in helpers:ob.hide_render=True
            scene.render.filepath=str(folder/'closed-native-reference.png');bpy.ops.render.render(write_still=True)
            for ob in helpers:ob.hide_render=False
        scene.render.filepath=str(folder/(name+'.png'));bpy.ops.render.render(write_still=True)
    (folder/'native-islands.json').write_text(json.dumps(audit,indent=2),encoding='utf8')
else:
    mapping['version']='I6.4-native-trunk-seams'
    mapping['trunk']={'node':lid.name,'hinge':list(hinge),'axis':[1,0,0],'maxAngle':-math.radians(100),'sourceParts':parts,'hotspot':[0,.86,2.47],
        'nativeSeams':True,'nativeSourceRevision':'v0.3.2-i3-complete','nativeSourceAudit':'docs/assets/trunk-native-seams.json',
        'requiredMovingBadges':['Mesh52','Mesh55','Mesh56','TRUNK_Mesh58'],'liner':'TRUNK_INNER_SKIN','cavity':'TRUNK_INNER_CAVITY','flushFlange':'TRUNK_BODY_FLANGE',
        'repairNote':'Original complete panel islands and per-corner normals/UV restored. No invented bisect planes, hull lamp caps or exterior cover-edge strips. Original rounded lower fascia and lamp splits define the moving boundary.'}
    lid['native_seams_version']='native_source_islands_v2';lid['repair_version']='native_source_islands_v2';lid['max_angle_radians']=mapping['trunk']['maxAngle'];root['increment']='I6 native trunk seams'
    report={'sourceRevision':'v0.3.2-i3-complete','bisectOperations':0,'panels':audit,'sourceParts':parts,'helpers':[ob.name for ob in bpy.context.scene.objects if ob.get('native_helper')],
        'removedIncorrectHelpers':['TRUNK_LID_EDGE_RETURNS','TRUNK_LAMP_END_LEFT','TRUNK_LAMP_END_RIGHT','BODY_REAR_LAMP_END_LEFT','BODY_REAR_LAMP_END_RIGHT'],'originalWipersExcluded':536}
    (ROOT/'docs/assets/trunk-native-seams.json').write_text(json.dumps(report,indent=2),encoding='utf8',newline='\n')
    for path in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/path).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
    bpy.data.orphans_purge(do_recursive=True)
    exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
print('NATIVE_TRUNK_SOURCE_PREVIEW',json.dumps({name:{k:v for k,v in rec.items() if k!='nativeIslands'} for name,rec in audit.items()}))
