"""Open the native bonnet panel along its original 82-vertex boundary."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parent.parent
root=bpy.data.objects['SU7_ROOT']
if bpy.data.objects.get('FRUNK_FRONT_ROOT'):raise RuntimeError('Frunk already applied; use normal export.')
bpy.context.preferences.filepaths.save_version=0
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
def bl(p):return Vector((p[0],-p[2],p[1]))
def rt(p):return [p.x,p.z,-p.y]
def parent_world(ob,parent):
 world=ob.matrix_world.copy();ob.parent=parent;ob.matrix_parent_inverse=Matrix.Identity(4);ob.matrix_world=world

def components(data):
 parent=list(range(len(data.vertices)))
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for p in data.polygons:
  for i in p.vertices[1:]:parent[find(i)]=find(p.vertices[0])
 groups={}
 for p in data.polygons:groups.setdefault(find(p.vertices[0]),[]).append(p.index)
 return list(groups.values())

def subset(original,ids,name,parent):
 source=original.data;ids=sorted(ids);vertices=sorted({i for f in ids for i in source.polygons[f].vertices});index={v:i for i,v in enumerate(vertices)}
 data=bpy.data.meshes.new(name+'_NATIVE_GEOMETRY');data.from_pydata([source.vertices[i].co for i in vertices],[],[[index[i] for i in source.polygons[f].vertices] for f in ids]);data.update()
 for mat in source.materials:data.materials.append(mat)
 loops=[i for f in ids for i in source.polygons[f].loop_indices]
 for layer in source.uv_layers:
  uv=data.uv_layers.new(name=layer.name)
  for i,j in enumerate(loops):uv.data[i].uv=layer.data[j].uv
 for p,f in zip(data.polygons,ids):p.material_index=source.polygons[f].material_index;p.use_smooth=source.polygons[f].use_smooth
 data.normals_split_custom_set([source.corner_normals[i].vector for i in loops])
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.matrix_world=original.matrix_world.copy();parent_world(ob,parent);return ob

def material(name,color,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
liner=material('FRUNK_FORMED_LINER',(.018,.022,.025),.87);rubber=material('FRUNK_SEAL_RUBBER',(.009,.012,.014),.8);hardware=bpy.data.materials['TRUNK_HINGE_FINISH']

def mesh(name,points,faces,mat,parent=root):
 d=bpy.data.meshes.new(name+'_GEOMETRY');d.from_pydata([bl(p) for p in points],[],faces);d.materials.append(mat);d.update();ob=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(ob);parent_world(ob,parent);ob['frunk_helper']=True;return ob

def tube(name,points,radius,mat,parent=root):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=2;s=c.splines.new('POLY');s.points.add(len(points)-1)
 for p,v in zip(s.points,points):p.co=(*bl(v),1)
 ob=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(ob);c.materials.append(mat);bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH');ob.select_set(False);parent_world(ob,parent);ob['frunk_helper']=True;return ob

lid=bpy.data.objects.new('FRUNK_FRONT_ROOT',None);bpy.context.collection.objects.link(lid);lid.parent=root;hinge=[0,.935,-1.025];lid.location=bl(hinge);bpy.context.view_layer.update()
original=bpy.data.objects['Paint7'];groups=components(original.data)
firsts={1941,873,5216,971,5308,961,5298,1472,5842,2017};moving={i for ids in groups if ids[0] in firsts for i in ids};assert len(moving)==1230,len(moving)
main=next(ids for ids in groups if ids[0]==1941);assert len(main)==912
# Exact original boundary: not a convex hull or an invented cutting footprint.
edges={}
for f in main:
 ids=list(original.data.polygons[f].vertices)
 for a,b in zip(ids,ids[1:]+ids[:1]):key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1
adj={}
for (a,b),count in edges.items():
 if count==1:adj.setdefault(a,[]).append(b);adj.setdefault(b,[]).append(a)
assert len(adj)==82 and all(len(a)==2 for a in adj.values())
loop=[];i=min(adj);previous=None
while i not in loop:loop.append(i);previous,i=i,next(j for j in adj[i] if j!=previous)
boundary=[rt(original.matrix_world@original.data.vertices[i].co) for i in loop]
sourceRecords=[{'node':'Paint7','movingFirstFaces':sorted(firsts),'movingFaces':len(moving),'fixedFaces':len(original.data.polygons)-len(moving),'nativeBoundary':boundary}]
original.name='FRUNK_TEMP_SOURCE';movingOb=subset(original,moving,'FRUNK_Paint7',lid);subset(original,set(range(len(original.data.polygons)))-moving,'Paint7',root)
# Backside follows the actual native hood, recessed behind the outside panel.
cover=subset(original,main,'FRUNK_INNER_SKIN',lid);cover.data.materials.clear();cover.data.materials.append(liner)
for v in cover.data.vertices:
 p=rt(original.matrix_world@v.co);p=[p[0]*.965,p[1]-.016,-1.69+(p[2]+1.69)*.965];v.co=original.matrix_world.inverted()@bl(p)
for p in cover.data.polygons:p.material_index=0;p.flip()
cover.data.normals_split_custom_set([(0,0,0)]*len(cover.data.loops));cover.data.update();cover['frunk_helper']=True
bpy.data.objects.remove(original,do_unlink=True)
badge=bpy.data.objects['Mesh65'];parent_world(badge,lid);sourceRecords.append({'node':'Mesh65','allFacesMove':len(badge.data.polygons)})
# Inset flange, seal, deep storage tub. The outer seam is still entirely native.
outer=[[p[0]*.994,p[1]-.015,-1.69+(p[2]+1.69)*.994] for p in boundary]
rim=[[p[0]*.961,p[1]-.032,-1.69+(p[2]+1.69)*.961] for p in boundary]
shoulder=[[p[0]*.97,p[1]-.045,-1.69+(p[2]+1.69)*.97] for p in rim]
floor=[[p[0]*.81,.405,-1.69+(p[2]+1.69)*.89] for p in rim];n=len(rim)
flange=mesh('FRUNK_BODY_FLANGE',outer+rim,[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)],rubber)
tube('FRUNK_BODY_GASKET',rim+[rim[0]],.0025,rubber)
cavity=mesh('FRUNK_STORAGE_TUB',rim+shoulder+floor,[tuple(reversed(range(2*n,3*n)))]+[(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(2) for i in range(n)],liner)
# Ensure visible normals point into the open tub regardless of boundary winding.
center=Vector((0,1.69,.58))
for p in cavity.data.polygons:
 if p.normal.dot(center-p.center)<0:p.flip()
cavity.data.update()
for sign,side in [(-1,'LEFT'),(1,'RIGHT')]:tube('FRUNK_HINGE_'+side,[(sign*.62,.906,-1.09),(sign*.62,.84,-1.105),(sign*.62,.82,-1.195),(sign*.62,.87,-1.255)],.010,hardware,lid)
helpers=['FRUNK_INNER_SKIN','FRUNK_BODY_FLANGE','FRUNK_BODY_GASKET','FRUNK_STORAGE_TUB','FRUNK_HINGE_LEFT','FRUNK_HINGE_RIGHT']
mapping['frunk']={'node':lid.name,'hinge':hinge,'axis':[1,0,0],'maxAngle':math.radians(65),'hotspot':[0,.795,-2.10],'nativeSeams':True,'sourceNodes':['Paint7','Mesh65'],'movingNodes':['FRUNK_Paint7','Mesh65','FRUNK_INNER_SKIN','FRUNK_HINGE_LEFT','FRUNK_HINGE_RIGHT'],'newNodes':[lid.name,'FRUNK_Paint7']+helpers,'helpers':helpers,'boundaryVertices':82,'audit':'docs/assets/frunk-audit.json'}
for cfg in mapping['cabinLights'].values():cfg['angle']=1.25;cfg['fillIntensity']=1.2;cfg['fillDistance']=1.4
mapping['materialRoles']['paint']['nodes'].append('FRUNK_Paint7')
mapping['version']='I6.9-native-frunk-wide-dome';lid['native_seams_version']='original_82_vertex_hood';root['increment']='Frunk and wide cabin lighting'
report={'baseline':'d1608ab','bisectOperations':0,'sourceGeometryChanged':False,'panels':sourceRecords,'newNodes':mapping['frunk']['newNodes'],'helpers':helpers,'domeLighting':{'halfAngleRadians':1.25,'fullAngleDegrees':math.degrees(2.5),'fillIntensity':1.2}}
(ROOT/'docs/assets/frunk-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
for f in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/f).write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf8')
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
print('NATIVE_FRUNK_CREATED',json.dumps({'movingPaintFaces':len(moving),'boundaryVertices':82,'newNodes':len(mapping['frunk']['newNodes'])}))
