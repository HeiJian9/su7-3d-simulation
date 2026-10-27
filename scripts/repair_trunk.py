"""Correct the complete SU7 deck + rear fascia, not a shallow horizontal flap.

Rejoin the previous source partitions in their closed world pose, then cut a
three-dimensional lid envelope. UVs/materials and the other vehicle rigs survive.
--preview renders the correction without saving the working blend or GLB.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
def bl(p):return Vector((p[0],-p[2],p[1]))
def rt(p):return Vector((p.x,p.z,-p.y))
root=bpy.data.objects['SU7_ROOT'];lid=bpy.data.objects['TRUNK_REAR_ROOT']
if lid.get('repair_version'):raise RuntimeError('Trunk repair already applied; do not cut the source twice.')
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
bpy.context.preferences.filepaths.save_version=0
lid.rotation_euler=(0,0,0);bpy.context.view_layer.update()
def parent_world(ob,parent):
    world=ob.matrix_world.copy();ob.parent=parent;ob.matrix_parent_inverse=Matrix.Identity(4);ob.matrix_world=world
def material(name,color,roughness=.85):
    mat=bpy.data.materials.get(name) or bpy.data.materials.new(name);mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=0
    return mat
liner=material('TRUNK_FORMED_CARPET',(.022,.027,.032,1),.92)
rubber=material('TRUNK_FLUSH_SEAL',(.009,.012,.014,1),.85)
hardware=material('TRUNK_HINGE_FINISH',(.035,.041,.045,1),.6)
def mesh(name,points,faces,mat,parent=root):
    data=bpy.data.meshes.new(name+'_GEOMETRY');data.from_pydata([bl(p) for p in points],[],faces);data.materials.append(mat);data.update()
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);parent_world(ob,parent);return ob
def tube(name,points,radius,mat,parent=root):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=3
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for p,v in zip(spline.points,points):p.co=(*bl(v),1)
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active=ob;bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False);parent_world(ob,parent);return ob
# Delete the incorrect free-standing ring and five-sided box, not original SU7 skin.
for name in ['TRUNK_INNER_SKIN','TRUNK_INNER_CAVITY','TRUNK_SEAL']:
    ob=bpy.data.objects.get(name)
    if ob:bpy.data.objects.remove(ob,do_unlink=True)
sources=['Paint5','Mesh17','Mesh18','Mesh19','Mesh20','Mesh21','Mesh23','Mesh24','Mesh25','Mesh58','Mesh71']
for name in sources:
    fixed=bpy.data.objects.get(name);moving=bpy.data.objects.get('TRUNK_'+name)
    if moving:
        if fixed:
            bpy.ops.object.select_all(action='DESELECT');fixed.select_set(True);moving.select_set(True);bpy.context.view_layer.objects.active=fixed;bpy.ops.object.join();fixed.select_set(False)
        else:moving.name=name;fixed=moving;parent_world(fixed,root)
    assert fixed and fixed.type=='MESH',name
    parent_world(fixed,root)
bpy.context.view_layer.update()
def surface_stats(ob):
    return {'faces':len(ob.data.polygons),'area':sum(p.area for p in ob.data.polygons),'bounds':[[min(rt(ob.matrix_world@v.co)[i] for v in ob.data.vertices) for i in range(3)],[max(rt(ob.matrix_world@v.co)[i] for v in ob.data.vertices) for i in range(3)]]}
before={name:surface_stats(bpy.data.objects[name]) for name in sources}
hinge=Vector((0,1.075,1.965));children=[(ob,ob.matrix_world.copy()) for ob in lid.children]
lid.location=bl(hinge);bpy.context.view_layer.update()
for ob,world in children:ob.matrix_world=world
foot=[(-.56,1.98),(.56,1.98),(.66,2.14),(.66,2.27),(.61,2.45),(.59,2.52),(-.59,2.52),(-.61,2.45),(-.66,2.27),(-.66,2.14)]
def inside(x,z):
    return all((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-6 for a,b in zip(foot,foot[1:]+foot[:1]))
planes=[]
for a,b in zip(foot,foot[1:]+foot[:1]):planes.append(((a[0],0,a[1]),(-(b[1]-a[1]),0,b[0]-a[0])))
planes += [((0,.63,0),(0,1,0)),((0,1.12,0),(0,1,0)),((.5,.63,0),(-.12,1,0)),((-.5,.63,0),(.12,1,0)),((.565,.63,0),(-.45,1,0)),((-.565,.63,0),(.45,1,0)),((-.61,0,0),(1,0,0)),((.61,0,0),(1,0,0)),((0,0,2.30),(0,0,1))]
lamp_names={'Mesh17','Mesh18','Mesh19','Mesh20','Mesh21','Mesh23','Mesh71'}
def owned(name,p):
    bottom=max(.63,.63+.12*(abs(p.x)-.5),.63+.45*(abs(p.x)-.565))
    if p.y<bottom-1e-6 or p.y>1.12+1e-6:return False
    if name in lamp_names:return abs(p.x)<=.61+1e-6 and p.z>=2.30-1e-6
    if name in {'Mesh24','Mesh25'} and p.y<.91 and p.z>2.29:return abs(p.x)<=.61+1e-6
    return inside(p.x,p.z)
def separate(ob,name):
    bm=bmesh.new();bm.from_mesh(ob.data)
    for co,no in planes:
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=ob.matrix_world.inverted()@bl(co),plane_no=ob.matrix_world.to_3x3().transposed()@bl(no),clear_inner=False,clear_outer=False)
    bm.to_mesh(ob.data);bm.free();ob.data.update()
    selected={p.index for p in ob.data.polygons if owned(name,rt(ob.matrix_world@p.center))}
    if not selected:return None
    data=ob.data.copy();out=bpy.data.objects.new('TRUNK_'+name,data);bpy.context.collection.objects.link(out);out.matrix_world=ob.matrix_world.copy()
    for data,remove in [(data,lambda f:f.index not in selected),(ob.data,lambda f:f.index in selected)]:
        bm=bmesh.new();bm.from_mesh(data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if remove(f)],context='FACES');bm.to_mesh(data);bm.free();data.update()
    parent_world(out,lid);out['original_node']=name;return out
parts=[];after={}
for name in sources:
    fixed=bpy.data.objects[name];moving=separate(fixed,name)
    if moving:parts.append(moving.name)
    area=sum(p.area for p in fixed.data.polygons)+(sum(p.area for p in moving.data.polygons) if moving else 0)
    after[name]={'area':area,'delta':area-before[name]['area']}
    assert abs(after[name]['delta'])<.001,('source surface changed',name,after[name])
    if not len(fixed.data.polygons):bpy.data.objects.remove(fixed,do_unlink=True)
# These badges were below the old horizontal cut and incorrectly stayed on the body.
for name in ['Mesh52','Mesh55','Mesh56']:
    parent_world(bpy.data.objects[name],lid);parts.append(name)
bpy.context.view_layer.update()
paint=bpy.data.objects['TRUNK_Paint5'];tree=BVHTree.FromPolygons([paint.matrix_world@v.co for v in paint.data.vertices],[list(p.vertices) for p in paint.data.polygons])
fixed=bpy.data.objects['Paint5']
# The forward edge meets the original rear-window trim, not a painted surface.
# Include that fixed trim when fitting the supported flange.
body_verts=[];body_faces=[]
for fixed_part in [fixed,bpy.data.objects['Mesh25']]:
    offset=len(body_verts);body_verts.extend(fixed_part.matrix_world@v.co for v in fixed_part.data.vertices)
    body_faces.extend([offset+i for i in p.vertices] for p in fixed_part.data.polygons)
body=BVHTree.FromPolygons(body_verts,body_faces)
# Formed underside, fitted to the actual deck and rear fascia, with edge returns.
profiles=[('top',2.015,.53),('top',2.08,.59),('top',2.16,.63),('top',2.24,.63),('top',2.31,.605),('top',2.365,.58),('rear',.84,.575),('rear',.78,.57),('rear',.72,.555),('rear',.66,.54)]
grid=[];outer=[];columns=13
for kind,value,width in profiles:
    for col in range(columns):
        u=col/(columns-1)*2-1;x=u*width
        start=bl((x,.50,value)) if kind=='top' else bl((x,value,2.05));direction=bl((0,1,0)) if kind=='top' else bl((0,0,1))
        hit=tree.ray_cast(start,direction,1)[0]
        if hit is None:hit=tree.find_nearest(bl((x,1.0,value)) if kind=='top' else bl((x,value,2.46)))[0]
        q=rt(hit);outer.append(list(q))
        # The source has spoiler actuators below the outside deck. The formed
        # inner cover must sit below their full envelope, not just 12 mm below
        # the external sheet and let the mechanism poke through it.
        q=Vector((q.x,min(q.y-.025,.845),q.z)) if kind=='top' else q-Vector((0,0,.025));grid.append(list(q))
faces=[]
for row in range(len(profiles)-1):
    for col in range(columns-1):
        a=row*columns+col;faces.append((a,a+1,a+1+columns,a+columns))
skin=mesh('TRUNK_INNER_SKIN',grid,faces,liner,lid)
boundary=list(range(columns))+[r*columns+columns-1 for r in range(1,len(profiles))]+list(range((len(profiles)-1)*columns+columns-2,(len(profiles)-1)*columns-1,-1))+[r*columns for r in range(len(profiles)-2,0,-1)]
returns=[];return_faces=[]
for i in boundary:returns.extend([outer[i],grid[i]])
for i in range(len(boundary)):
    a=i*2;b=((i+1)%len(boundary))*2;return_faces.append((a,b,b+1,a+1))
mesh('TRUNK_LID_EDGE_RETURNS',returns,return_faces,liner,lid)
# A flush supported body flange. No large wire hoop above the car surface.
right=[(.55,1.103,1.985),(.635,1.045,2.10),(.66,1.015,2.24),(.624,.95,2.40),(.60,.72,2.475),(.565,.643,2.49)]
guides=[(-.55,1.06,1.985),(-.30,1.07,1.985),(0,1.07,1.985),(.30,1.07,1.985)]+right+[(.35,.632,2.49),(0,.632,2.49),(-.35,.632,2.49)]+[(-x,y,z) for x,y,z in reversed(right[1:])]
rim=[];rim_outer=[];fit_dist=[]
for guide in guides:
    q,n,_,distance=body.find_nearest(bl(guide));n.normalize();q=rt(q);normal=rt(n);rim_outer.append(list(q));fit_dist.append(distance)
    towards=Vector((-q.x,0,2.23-q.z)).normalized();inner=q+towards*.026-Vector((0,.009,0));rim.append(list(inner))
vertices=[];rim_faces=[]
for q,p in zip(rim_outer,rim):vertices.extend([q,p])
for i in range(len(rim)):
    a=i*2;b=((i+1)%len(rim))*2;rim_faces.append((a,b,b+1,a+1))
mesh('TRUNK_BODY_FLANGE',vertices,rim_faces,rubber)
# The seal is sunk into the body edge, at most a few millimetres proud.
seal=[list(Vector(a)*.9+Vector(b)*.1-Vector((0,.001,0))) for a,b in zip(rim_outer,rim)]
tube('TRUNK_BODY_GASKET',seal+[seal[0]],.0035,rubber)
floor=[];shoulder=[]
for q in rim:
    depth=max(0,min(1,(q[2]-1.98)/.52))
    # Cargo extends forward beneath the fixed parcel shelf. A shallow box with
    # its front wall directly at the opening incorrectly looks like a baffle.
    shoulder.append([q[0]*.98,.79*(1-depth)+.49*depth,1.25+depth*1.20])
    floor.append([q[0]*.86,.365,1.17+depth*1.22])
points=rim+shoulder+floor;n=len(rim)
cavity_faces=[tuple(range(2*n,3*n))]+[(row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i) for row in range(2) for i in range(n)]
mesh('TRUNK_INNER_CAVITY',points,cavity_faces,liner)
for side,sign in [('LEFT',-1),('RIGHT',1)]:
    tube('TRUNK_HINGE_'+side,[(sign*.49,hinge.y,hinge.z),(sign*.49,.985,2.015),(sign*.49,.865,2.085),(sign*.49,.87,2.14),(sign*.49,1.01,2.15)],.017,hardware,lid)
# Close the newly cut lamp housings, keeping the inner bar on the lid and outer
# lamp wings fixed. These are end faces of real source parts, not a proxy lid.
def hull2(points):
    points=sorted(set(points))
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    halves=[]
    for seq in [points,list(reversed(points))]:
        h=[]
        for p in seq:
            while len(h)>1 and cross(h[-2],h[-1],p)<=0:h.pop()
            h.append(p)
        halves+=h[:-1]
    return halves
for side,sign in [('LEFT',-1),('RIGHT',1)]:
    section=[]
    for source in lamp_names|{'Mesh24','Mesh25'}:
        ob=bpy.data.objects.get('TRUNK_'+source)
        if ob:
            for v in ob.data.vertices:
                p=rt(ob.matrix_world@v.co)
                if abs(p.x-sign*.61)<2e-5 and .75<p.y<.91 and p.z>2.299:section.append((p.y,p.z))
    contour=hull2(section)
    assert len(contour)>2
    for name,x,parent in [('TRUNK_LAMP_END_'+side,sign*.61,lid),('BODY_REAR_LAMP_END_'+side,sign*.612,root)]:
        mesh(name,[(x,y,z) for y,z in contour],[tuple(range(len(contour)))],rubber,parent)
# Refit both amber segments against their respective remaining source lens.
for suffix,lamp_name,xs,parent in [('LID','TRUNK_Mesh71',[.40,.49,.575],lid),('BODY','Mesh71',[.66,.72,.79],root)]:
    lamp=bpy.data.objects[lamp_name];lamp_tree=BVHTree.FromPolygons([lamp.matrix_world@v.co for v in lamp.data.vertices],[list(p.vertices) for p in lamp.data.polygons])
    for side,sign in [('LEFT',-1),('RIGHT',1)]:
        name='TURN_'+side+'_REAR_'+suffix;old=bpy.data.objects.get(name);mat=old.data.materials[0]
        bpy.data.objects.remove(old,do_unlink=True);path=[]
        for x in xs:
            q,n,_,_=lamp_tree.find_nearest(bl((sign*x,.803,2.45)));p=rt(q);p.z+=.002;path.append(list(p))
        tube(name,path,.0035,mat,parent)
mapping['version']='I6.3-trunk-correction'
mapping['trunk']={'node':lid.name,'hinge':list(hinge),'axis':[1,0,0],'maxAngle':-math.radians(100),'sourceParts':parts,'footprint':foot,'hotspot':[0,.86,2.47],
    'rearFasciaMinimumY':.63,'requiredMovingBadges':['Mesh52','Mesh55','Mesh56','TRUNK_Mesh58'],'liner':'TRUNK_INNER_SKIN','cavity':'TRUNK_INNER_CAVITY','flushFlange':'TRUNK_BODY_FLANGE',
    'repairNote':'Complete deck and badged rear fascia travel together. Previous raised wire ring / shallow box removed; formed underside, edge returns and deep carpet-lined opening added.',
    'reference':'https://s1.xiaomiev.com/activity-outer-assets/0328/images/su7/su7_12_2.jpg'}
lid['repair_version']='complete_lid_v1';lid['max_angle_radians']=mapping['trunk']['maxAngle'];root['increment']='I6 trunk geometry correction'
report={'before':before,'afterSourceArea':after,'parts':parts,'badges':mapping['trunk']['requiredMovingBadges'],'removedIncorrectGeometry':['TRUNK_SEAL','previous TRUNK_INNER_SKIN','previous TRUNK_INNER_CAVITY'],'guideProjectionDistances':fit_dist,'flangeBodyAttachments':rim_outer,'trunk':mapping['trunk']}
(ROOT/'docs/assets/trunk-correction-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8',newline='\n')
bpy.context.view_layer.update()
if '--preview' in sys.argv:
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=100;scene.world.color=(.16,.16,.16)
    camera_data=bpy.data.cameras.new('TRUNK_AUDIT_CAMERA');camera=bpy.data.objects.new('TRUNK_AUDIT_CAMERA',camera_data);scene.collection.objects.link(camera);scene.camera=camera;camera_data.lens=43
    for i,pos in enumerate([(0,3.4,4.5),(-3,3,2)]):
        data=bpy.data.lights.new('TRUNK_AUDIT_LIGHT','AREA');data.energy=900 if i==0 else 600;data.size=4;ob=bpy.data.objects.new(data.name,data);scene.collection.objects.link(ob);ob.location=bl(pos);ob.rotation_euler=(bl((0,.8,2.1))-ob.location).to_track_quat('-Z','Y').to_euler()
    folder=ROOT/'.tools/trunk-repair';folder.mkdir(exist_ok=True)
    for name,amount,pos,target in [('closed',0,(0,1.45,4.8),(0,.95,2.15)),('half',.5,(0,1.45,4.8),(0,.95,2.15)),('full',1,(0,1.45,4.8),(0,.95,2.15)),('cargo',1,(0,1.25,3.7),(0,.69,1.95)),('side',1,(2.5,1.9,3.9),(0,1,2.10))]:
        lid.rotation_euler.x=mapping['trunk']['maxAngle']*amount;bpy.context.view_layer.update();camera.location=bl(pos);camera.rotation_euler=(bl(target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(folder/(name+'.png'));bpy.ops.render.render(write_still=True)
else:
    for path in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/path).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
    exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
print('TRUNK_CORRECTION_COMPLETE',json.dumps({'parts':parts,'maxSourceAreaDelta':max(abs(v['delta']) for v in after.values()),'maxGuideProjection':max(fit_dist)}))
