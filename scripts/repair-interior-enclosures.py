"""Repair only fitted helper liners on the approved current model; keep native panels."""
import bpy, bmesh, json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent.parent
root=bpy.data.objects['SU7_ROOT']
if root.get('enclosure_revision'): raise RuntimeError('Already repaired; use normal asset:export.')
def rt(p): return Vector((p.x,p.z,-p.y))
def bl(p): return Vector((p[0],-p[2],p[1]))
def replace_mesh(ob,points,faces):
 old=ob.data;data=bpy.data.meshes.new(ob.name+'_ENCLOSED');data.from_pydata([ob.matrix_world.inverted()@bl(p) for p in points],[],faces)
 for m in old.materials:data.materials.append(m)
 data.update();ob.data=data
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
def thickness(ob,amount):
 bpy.context.view_layer.objects.active=ob
 mod=ob.modifiers.new('Formed wall thickness','SOLIDIFY');mod.thickness=amount;mod.offset=1
 bpy.ops.object.modifier_apply(modifier=mod.name)

# Keep the native rim; below tyre-top height, the storage walls retreat inboard.
ob=bpy.data.objects['FRUNK_STORAGE_TUB'];n=82
rim=[rt(ob.matrix_world@v.co) for v in ob.data.vertices[:n]]
shoulder=[Vector((max(-.65,min(.65,p.x)),min(p.y-.035,.765),min(p.z,-1.29))) for p in rim]
floor=[Vector((p.x*.68,.48,-1.69+(p.z+1.69)*.75)) for p in shoulder]
faces=[tuple(reversed(range(2*n,3*n)))]+[(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(2) for i in range(n)]
replace_mesh(ob,rim+shoulder+floor,faces);thickness(ob,.012)

# Shorter cargo tub, behind the rear wheels instead of extending into them/seats.
ob=bpy.data.objects['TRUNK_INNER_CAVITY'];n=len(bpy.data.objects['TRUNK_BODY_FLANGE'].data.vertices)//2
rim=[rt(ob.matrix_world@v.co) for v in ob.data.vertices[:n]]
shoulder=[];floor=[]
for p in rim:
 t=max(0,min(1,(p.z-1.92)/.52))
 shoulder.append(Vector((p.x*.88,min(p.y-.035,.69),1.94+t*.45)))
 floor.append(Vector((p.x*.76,.48,1.98+t*.36)))
faces=[tuple(reversed(range(2*n,3*n)))]+[(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(2) for i in range(n)]
replace_mesh(ob,rim+shoulder+floor,faces);thickness(ob,.012)

# A continuous formed liner bridges the native paint islands from deck to fascia.
# Each row is fitted to the actual paint surface; only its helper is rebuilt.
ob=bpy.data.objects['TRUNK_INNER_SKIN'];src=bpy.data.objects['TRUNK_Paint5']
verts=[];polys=[]
for source_name in json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf-8'))['trunk']['sourceParts']:
 source=bpy.data.objects[source_name]
 if source.type!='MESH':continue
 offset=len(verts);verts.extend(source.matrix_world@v.co for v in source.data.vertices);polys.extend([i+offset for i in p.vertices] for p in source.data.polygons)
tree=BVHTree.FromPolygons(verts,polys)
profile=[(.54,1.055,1.94),(.60,1.025,2.02),(.61,1.00,2.14),(.60,.965,2.24),(.58,.91,2.34),(.55,.79,2.41),(.50,.67,2.47)]
profile=[tuple(a[k]+(b[k]-a[k])*t/6 for k in range(3)) for a,b in zip(profile,profile[1:]) for t in range(6)]+[profile[-1]]
points=[];source_points=[];cols=33
for width,y,z in profile:
 for i in range(cols):
  x=width*(2*i/(cols-1)-1);guide=bl((x,y,z))
  if y<.94:hit=tree.ray_cast(bl((x,y,2.02)),bl((0,0,1)),.6)[0]
  else:hit=tree.ray_cast(bl((x,.7,z)),bl((0,1,0)),.5)[0]
  q=rt(hit if hit is not None else tree.find_nearest(guide)[0]);source_points.append(q)
  points.append(Vector((q.x*.965,q.y-.018,q.z-.035)))
faces=[(r*cols+i,r*cols+i+1,(r+1)*cols+i+1,(r+1)*cols+i) for r in range(len(profile)-1) for i in range(cols-1)]
boundary=list(range(cols))+[r*cols+cols-1 for r in range(1,len(profile))]+list(reversed(range((len(profile)-1)*cols,(len(profile)-1)*cols+cols-1)))+[r*cols for r in reversed(range(1,len(profile)-1))]
max_span=0;returns={}
for i in boundary:
 q=source_points[i];direction=points[i]-q;max_span=max(max_span,direction.length);q=q+direction.normalized()*.002
 q.y-=.003
 returns[i]=len(points);points.append(q)
for a,b in zip(boundary,boundary[1:]+boundary[:1]):faces.append((a,b,returns[b],returns[a]))
replace_mesh(ob,points,faces)

# Opaque underside backing beneath the original cabin floor, inside the chassis.
bpy.ops.mesh.primitive_cube_add(size=1,location=bl((0,.187,.15)))
floor=bpy.context.object;floor.name='CABIN_FLOOR_BACKING';floor.dimensions=(1.38,2.16,.018)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
world=floor.matrix_world.copy();floor.parent=root;floor.matrix_world=world
floor.data.materials.append(bpy.data.materials['TRUNK_FORMED_CARPET'])

mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf-8'))
mapping['version']='0.7.2-enclosed-cabin'
mapping['enclosureRepair']={'baseline':'1b83988','modifiedNodes':['FRUNK_STORAGE_TUB','TRUNK_INNER_CAVITY','TRUNK_INNER_SKIN'],'addedNodes':['CABIN_FLOOR_BACKING'],'wallThickness':.012,'lidReturnEdges':len(boundary),'maxLidReturnSpan':max_span}
for i in [4,5,12,13]:mapping['materialRoles']['ambient']['lights'][i]['occludedFootwell']=True
for f in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/f).write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf-8')
root['enclosure_revision']='formed_liners_v1';bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/blender/su7-enhanced.blend'))
print('ENCLOSURES_REPAIRED',json.dumps(mapping['enclosureRepair']))
