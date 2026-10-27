"""Native outer rear running lamp plus two fitted downward cabin luminaires."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
root=bpy.data.objects['SU7_ROOT']
if root.get('dome_tail_version'):raise RuntimeError('Already enhanced; routine export only.')
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
def bl(p):return Vector((p[0],-p[2],p[1]))
def rt(p):return [p.x,p.z,-p.y]
def material(name,color,roughness=.5):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;return m
red=bpy.data.materials['Mesh19Mtl'].copy();red.name='TAIL_RUNNING_RED';p=red.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(.19,.002,.003,1);p.inputs['Emission Color'].default_value=(1,.005,.009,1);p.inputs['Emission Strength'].default_value=1.5
housing=material('DOME_HOUSING',(.026,.031,.035),.65)
records=[];samples=[]
def components(ob):
 parent=list(range(len(ob.data.vertices)));keys={}
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for v in ob.data.vertices:
  key=tuple(round(x,5) for x in v.co)
  if key in keys:parent[find(v.index)]=find(keys[key])
  else:keys[key]=v.index
 for f in ob.data.polygons:
  for i in f.vertices[1:]:parent[find(i)]=find(f.vertices[0])
 out={}
 for f in ob.data.polygons:out.setdefault(find(f.vertices[0]),[]).append(f.index)
 return list(out.values())
for name in ['Mesh21','TRUNK_Mesh21']:
 ob=bpy.data.objects[name];groups=components(ob)
 # Native outermost band. The inner three graphic strips and turn modules stay separate.
 ids=[i for group in groups for i in group if (len(group)==217 if name=='Mesh21' else len(group) in [44,168,6])]
 assert len(ids)==(434 if name=='Mesh21' else 280),(name,len(ids))
 slot=len(ob.data.materials);ob.data.materials.append(red)
 bins={}
 for i in ids:
  f=ob.data.polygons[i];f.material_index=slot
  world=ob.matrix_world@f.center;c=rt(world)
  normal=ob.matrix_world.to_3x3()@f.normal
  if rt(normal)[2]>.2:bins.setdefault((round(c[0]/.15),round(c[1]/.04)),[]).append(world)
 for points in bins.values():
  center=sum(points,Vector())/len(points);near=min(points,key=lambda p:(p-center).length)
  samples.append({'node':name,'position':rt(ob.matrix_world.inverted()@near)})
 records.append({'node':name,'faces':ids,'triangles':len(ids),'geometryChanged':False})
assert len(samples)<=32,len(samples)
domes={}
def cube(name,pos,size,mat,bevel):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);ob=bpy.context.object;ob.name=name;ob.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=ob.modifiers.new('Rounded housing edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name);ob.data.materials.append(mat);ob.parent=root;return ob
for label,z,source in [('front',-.27,'Mesh53'),('rear',.8,'Mesh63')]:
 roof=bpy.data.objects[source];bvh=BVHTree.FromPolygons([roof.matrix_world@v.co for v in roof.data.vertices],[list(f.vertices) for f in roof.data.polygons])
 point,normal,face,d=bvh.ray_cast(bl((0,1.12,z)),bl((0,1,0)),.5);assert point is not None
 if normal.z<0:normal=-normal
 orientation=Vector((0,0,1)).rotation_difference(normal)
 center=point-normal*.008
 box=cube('DOME_'+label.upper()+'_HOUSING',center,(.16,.082,.016),housing,.012);box.rotation_mode='QUATERNION';box.rotation_quaternion=orientation
 mat=material('DOME_'+label.upper()+'_DIFFUSER',(.65,.64,.58),.45)
 lens=cube('DOME_'+label.upper()+'_LENS',center-normal*.009,(.125,.055,.004),mat,.007);lens.rotation_mode='QUATERNION';lens.rotation_quaternion=orientation
 light=center-normal*.014;direction=-normal
 domes[label]={'housing':box.name,'lens':lens.name,'material':mat.name,'position':rt(light),'direction':rt(direction),'hotspot':rt(light-normal*.012),'roofSource':source,'roofHit':rt(point),'mountGap':.0,'color':'#fff3db','intensity':12,'distance':2.1,'angle':.95}
mapping['materialRoles']['tailRunning']={'material':red.name,'nodes':['Mesh21','TRUNK_Mesh21'],'alwaysOn':True,'color':'#ff1424','intensity':1.5,'samples':samples,'audit':'docs/assets/dome-tail-audit.json'}
mapping['cabinLights']=domes;mapping['version']='I6.8-tail-and-dome';root['dome_tail_version']='native_ring_roof_v1'
report={'baseline':'697b314','tail':records,'samples':len(samples),'cabinLights':domes,'newNodes':[c[k] for c in domes.values() for k in ['housing','lens']],'sourceGeometryChanged':False}
(ROOT/'docs/assets/dome-tail-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
for name in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/name).write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf8')
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
print('DOME_TAIL_ADDED',json.dumps({'tailFaces':sum(len(r['faces']) for r in records),'samples':len(samples),'domes':domes}))
