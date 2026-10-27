"""Fit recessed ribbon emitters to the original SU7 trim, plus concealed wash lights.

Only our former five floating strips are replaced. Source car meshes are unchanged.
Run once on the current enhanced .blend; routine exports use export_current.py.
"""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
root=bpy.data.objects['SU7_ROOT']
if root.get('cabin_lighting_version') and '--rebuild' not in sys.argv:raise RuntimeError('Cabin fit already applied; use --rebuild to replace only our diffusers.')
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
old_nodes=mapping['materialRoles']['ambient'].get('replacedNodes',mapping['materialRoles']['ambient']['nodes'])
for name in mapping['materialRoles']['ambient']['nodes']:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
bpy.context.preferences.filepaths.save_version=0
def bl(v):return Vector((v[0],-v[2],v[1]))
def rt(v):return [v.x,v.z,-v.y]
def mat(name):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(.012,.016,.02,1);p.inputs['Roughness'].default_value=.5;p.inputs['Emission Color'].default_value=(1,1,1,1);p.inputs['Emission Strength'].default_value=0
 return m
led=mat('AMBIENT_CABIN_LED');wash=mat('AMBIENT_CABIN_WASH')
records=[];nodes=[];trees={}
def tree(name):
 if name not in trees:
  ob=bpy.data.objects[name];trees[name]=BVHTree.FromPolygons([ob.matrix_world@v.co for v in ob.data.vertices],[list(p.vertices) for p in ob.data.polygons])
 return trees[name]
def ribbon(name,source,seeds,parent=root,width=.0026,dim=False,preferred=(0,0,0)):
 """Sample the source surface at <=8mm intervals, using the real surface normal.
 The ribbon is 0.55mm proud, with width projected onto the same source surface.
 """
 bvh=tree(source);points=[]
 for a,b in zip(seeds,seeds[1:]):
  a,b=bl(a),bl(b);steps=max(2,int((b-a).length/.008))
  for i in range(steps):points.append(a.lerp(b,i/steps))
 points.append(bl(seeds[-1]));centers=[];normals=[];seed_error=0
 prefer=bl(preferred)
 for p in points:
  hit,normal,_,distance=bvh.find_nearest(p);seed_error=max(seed_error,distance)
  if prefer.length and normal.dot(prefer)<0:normal=-normal
  centers.append(hit);normals.append(normal)
 vertices=[];faces=[]
 for i,(center,normal) in enumerate(zip(centers,normals)):
  tangent=centers[min(i+1,len(centers)-1)]-centers[max(i-1,0)]
  across=normal.cross(tangent).normalized()*width*.5
  for sign in [-1,1]:
   hit,_,_,_=bvh.find_nearest(center+across*sign)
   vertices.append(hit+normal*.00055)
 trimmed=0
 for i in range(len(centers)-1):
  face=(2*i,2*i+2,2*i+3,2*i+1)
  # Source trim includes separate islands. Never bridge them with floating LEDs.
  probes=[sum((vertices[j] for j in ids),Vector())/3 for ids in [(face[0],face[1],face[2]),(face[0],face[2],face[3])]]
  if (centers[i+1]-centers[i]).length>.02 or any(bvh.find_nearest(p)[3]>.0014 for p in probes):trimmed+=1;continue
  if (vertices[face[1]]-vertices[face[0]]).cross(vertices[face[2]]-vertices[face[0]]).length<1e-10:continue
  faces.append(face)
 assert len(faces)>0,name
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(wash if dim else led);mesh.update()
 ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.matrix_parent_inverse=parent.matrix_world.inverted();ob['role']='surface_fitted_recessed_diffuser';ob['source_surface']=source
 for p in mesh.polygons:p.use_smooth=True
 nodes.append(name);records.append({'node':name,'source':source,'parent':parent.name,'width':width,'surfaceOffset':.00055,'seedMaxProjection':seed_error,'centerline':[rt(p) for p in centers],'samples':len(centers),'trimmedGapFaces':trimmed,'dim':dim})
 return ob

# Front door upper rail: original chrome seam vertices, not a guessed straight tube.
for c in ['fl','fr','rl','rr']:
 sign=-1 if c.endswith('l') else 1;front=c.startswith('f');parent=bpy.data.objects[mapping['doors'][c]['node']]
 source=('Mesh47' if sign<0 else 'Mesh34') if front else ('Mesh43' if sign<0 else 'Mesh30')
 pts=[rt(bpy.data.objects[source].matrix_world@v.co) for v in bpy.data.objects[source].data.vertices]
 if front:
  selected=[p for p in pts if p[1]>.95];groups={}
  for p in selected:groups.setdefault(round(p[2]/.018),[]).append(p)
  path=sorted([max(v,key=lambda p:p[1]) for v in groups.values()],key=lambda p:p[2]);path=[[p[0],p[1]-.002,p[2]] for p in path]
 else:path=[pts[i] for i in [1,3,5,6,8]];path=[[p[0],p[1]-.0017,p[2]] for p in path]
 ribbon('AMBIENT_DOOR_'+c.upper(),source,path,parent,preferred=(-sign,0,0))
 # Follow the handle / armrest inner edge, with a softer separate diffuser.
 handle=('Mesh47' if sign<0 else 'Mesh34') if front else ('Mesh40' if sign<0 else 'Mesh27')
 pocket=[(sign*.744,.682,.08),(sign*.744,.682,-.13),(sign*.772,.695,-.31)] if front else [(sign*.697,.707,.85),(sign*.706,.704,.67),(sign*.711,.753,.54)]
 ribbon('AMBIENT_HANDLE_'+c.upper(),handle,pocket,parent,width=.004,dim=True,preferred=(-sign,0,0))

for side,sign in [('LEFT',-1),('RIGHT',1)]:
 ribbon('AMBIENT_DASHBOARD' if sign<0 else 'AMBIENT_DASHBOARD_RIGHT','Mesh53',[(sign*.77,.94,-.64),(sign*.65,.94,-.63),(sign*.43,.94,-.63),(sign*.20,.93,-.63)],preferred=(0,0,1))
 ribbon('AMBIENT_CONSOLE_'+side,'Mesh53',[(sign*.18,.56,-.43),(sign*.18,.52,-.25),(sign*.18,.49,-.05),(sign*.18,.48,.10)],width=.003,dim=True,preferred=(sign,0,0))

lights=[]
for c in ['fl','fr','rl','rr']:
 sign=-1 if c.endswith('l') else 1;p=bl((sign*(.735 if c.startswith('f') else .70),.88,-.18 if c.startswith('f') else .66));parent=bpy.data.objects[mapping['doors'][c]['node']]
 lights.append({'parent':parent.name,'position':rt(parent.matrix_world.inverted()@p),'distance':.42,'gain':.20})
for sign in [-1,1]:lights.append({'parent':'SU7_ROOT','position':[sign*.4,.49,-.48],'distance':.78,'gain':1.15})
lights.append({'parent':'SU7_ROOT','position':[.32,.91,-.56],'distance':.6,'gain':.16})
lights.append({'parent':'SU7_ROOT','position':[0,.51,-.06],'distance':.4,'gain':.12})
mapping['materialRoles']['ambient'].update({'materials':[led.name,wash.name],'washMaterial':wash.name,'nodes':nodes,'replacedNodes':old_nodes,'lights':lights,'lightPositions':[p['position'] for p in lights if p['parent']=='SU7_ROOT'],'radius':None,'note':'12 surface-fitted narrow ribbon diffusers; native door upper rails, handle undersides, dashboard and console. Footwells use concealed local wash illumination, with no visible added glovebox bars. Gaps between original surface islands are not bridged. Eight short-range wash lights; four follow their actual doors. Source car surfaces unchanged.','audit':'docs/assets/cabin-lighting-audit.json'})
mapping['version']='I6.6-cabin-lighting';root['cabin_lighting_version']='surface_fitted_ribbons_v1';root['increment']='I6 cabin lighting refinement'
report={'sourceRevision':'16cb5b9','oldNodesReplaced':old_nodes,'sourceGeometryModified':False,'ribbonCount':len(nodes),'lights':lights,'records':records}
(ROOT/'docs/assets/cabin-lighting-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
for file in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf8')
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
print('CABIN_LIGHTING_REFINED',json.dumps({'ribbons':len(nodes),'lights':len(lights),'maxSeedProjection':max(r['seedMaxProjection'] for r in records)}))
