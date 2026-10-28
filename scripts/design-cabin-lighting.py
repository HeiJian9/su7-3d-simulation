"""Add a layered cabin-light design to the current saved vehicle, preserving all prior meshes.

--survey inspects proposed routes. --apply saves only the additive design to the
existing .blend and mapping. Export separately with npm run asset:export.
"""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
root = bpy.data.objects['SU7_ROOT']
mapping = json.loads((ROOT / 'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
audit = json.loads((ROOT / 'docs/assets/cabin-lighting-audit.json').read_text(encoding='utf8'))

def bl(p): return Vector((p[0], -p[2], p[1]))
def rt(p): return [p.x, p.z, -p.y]

trees = {}
def tree(name):
    if name not in trees:
        ob = bpy.data.objects[name]
        trees[name] = BVHTree.FromPolygons([ob.matrix_world @ v.co for v in ob.data.vertices], [list(p.vertices) for p in ob.data.polygons])
    return trees[name]

routes = []
def route(name, source, points, parent='SU7_ROOT', width=.0032, dim=False, preferred=(0,1,0)):
    routes.append(dict(name=name, source=source, points=points, parent=parent, width=width, dim=dim, preferred=preferred))

for c in ['fl','fr','rl','rr']:
    sign = -1 if c.endswith('l') else 1
    front = c.startswith('f')
    parent = mapping['doors'][c]['node']
    source = ('Mesh49' if sign < 0 else 'Mesh36') if front else ('Mesh41' if sign < 0 else 'Mesh28')
    inlay = [(sign*.775,.875,-.58),(sign*.774,.869,-.31),(sign*.773,.862,-.03),(sign*.773,.863,.12)] if front else [(sign*.748,.863,.38),(sign*.744,.862,.58),(sign*.740,.873,.80),(sign*.735,.88,.95)]
    pocket = [(sign*.77,.50,-.57),(sign*.749,.46,-.36),(sign*.739,.455,-.07),(sign*.753,.48,.11)] if front else [(sign*.724,.50,.40),(sign*.71,.46,.58),(sign*.71,.465,.78),(sign*.735,.50,.93)]
    route('AMBIENT_INLAY_'+c.upper(),source,inlay,parent,width=.0034,preferred=(-sign,0,0))
    speaker_source=('Mesh47' if sign<0 else 'Mesh34') if front else ('Mesh40' if sign<0 else 'Mesh27')
    speaker_indices=[58,56,60,61,62,63,65,76,78,79,77,74,73,72,71,70,69,68,67,64,57,58] if front else [17,20,19,18,16,15,14,12,9,10,11,13,17]
    # Right-side source vertex numbering differs; mirror the left native edge and
    # fit it against the corresponding right trim, preserving the actual mesh.
    left_source=bpy.data.objects['Mesh47' if front else 'Mesh40']
    speaker=[rt(left_source.matrix_world@left_source.data.vertices[i].co) for i in speaker_indices]
    speaker=[[sign*abs(p[0]),p[1],p[2]] for p in speaker]
    route('AMBIENT_SPEAKER_'+c.upper(),speaker_source,speaker,parent,width=.0026,dim=True,preferred=(-sign,0,0))
    routes[-1]['linear']=True

route('AMBIENT_DASH_CROWN_LEFT','Mesh53',[(-.72,.9584,-.7487),(-.6898,.9587,-.7666),(-.6639,.9584,-.7763),(-.6395,.9584,-.7748),(-.6215,.9588,-.7649),(-.5878,.9597,-.6997),(-.5741,.9596,-.6786),(-.5576,.9595,-.6617),(-.5339,.9593,-.6527),(-.5111,.9594,-.6512),(-.3207,.9594,-.6512)],width=.003,preferred=(0,0,1))
route('AMBIENT_DASH_CROWN_RIGHT','Mesh53',[(-.20,.967,-.854),(-.09,.96,-.855),(.19,.957,-.855),(.4513,.9574,-.8397),(.5847,.9574,-.8089),(.6898,.9587,-.7666),(.7201,.9584,-.7487)],width=.003,preferred=(0,0,1))
for sign,side in [(-1,'LEFT'),(1,'RIGHT')]:
    route('AMBIENT_TUNNEL_'+side,'Mesh53',[(sign*.1193,.6371,-.1714),(sign*.1212,.6371,.2027),(sign*.1212,.6371,.2349),(sign*.1212,.6189,.2875)],width=.0034,dim=True,preferred=(sign,.6,0))
    routes[-1]['linear']=True
route('AMBIENT_REAR_CONSOLE','Mesh53',[(-.125,.594,.3005),(0,.594,.3005),(.125,.594,.3005)],width=.003,dim=True,preferred=(0,0,1))

def sampled(points,linear=False):
    anchors = [bl(p) for p in points]
    out = []
    for i in range(len(anchors)-1):
        a,b,c,d = anchors[max(0,i-1)],anchors[i],anchors[i+1],anchors[min(len(anchors)-1,i+2)]
        steps=max(3,int((c-b).length/.005))
        for j in range(steps):
            t=j/steps
            out.append(b.lerp(c,t) if linear else (2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)*.5)
    return out+[anchors[-1]]

surveys=[]
for cfg in routes:
    bvh=tree(cfg['source']);hits=[bvh.find_nearest(p) for p in sampled(cfg['points'],cfg.get('linear',False))]
    surveys.append({'node':cfg['name'],'source':cfg['source'],'projectionMax':max(h[3] for h in hits),'start':rt(hits[0][0]),'end':rt(hits[-1][0]),'maxStep':max((b[0]-a[0]).length for a,b in zip(hits,hits[1:])), 'gaps':[[rt(a[0]),rt(b[0])] for a,b in zip(hits,hits[1:]) if (b[0]-a[0]).length>.015]})
print('CABIN_SURVEY',json.dumps(surveys))
if '--apply' not in sys.argv:
    sys.exit(0)
if root.get('cabin_design_version'):
    raise RuntimeError('The additive cabin design already exists. Edit its dedicated objects; do not layer another copy.')

records=[];created=[]
for cfg in routes:
    assert not bpy.data.objects.get(cfg['name']),cfg['name']
    bvh=tree(cfg['source']);prefer=bl(cfg['preferred']);centers=[];normals=[];errors=[]
    for point in sampled(cfg['points'],cfg.get('linear',False)):
        hit,normal,_,distance=bvh.find_nearest(point)
        if normal.dot(prefer)<0: normal=-normal
        centers.append(hit);normals.append(normal);errors.append(distance)
    assert max(errors)<.025,('Route too far from intended surface',cfg['name'],max(errors))
    vertices=[];faces=[];trimmed=0
    for i,(center,normal) in enumerate(zip(centers,normals)):
        tangent=centers[min(i+1,len(centers)-1)]-centers[max(i-1,0)]
        across=normal.cross(tangent).normalized()*cfg['width']*.5
        for sign in [-1,1]:
            hit,_,_,_=bvh.find_nearest(center+across*sign)
            vertices.append(hit+normal*.0006)
    for i in range(len(centers)-1):
        face=(2*i,2*i+2,2*i+3,2*i+1)
        probes=[sum((vertices[j] for j in ids),Vector())/3 for ids in [(face[0],face[1],face[2]),(face[0],face[2],face[3])]]
        if (centers[i+1]-centers[i]).length>.015 or any(bvh.find_nearest(p)[3]>.0014 for p in probes):
            trimmed+=1;continue
        if (vertices[face[1]]-vertices[face[0]]).cross(vertices[face[2]]-vertices[face[0]]).length>1e-10: faces.append(face)
    assert len(faces)>12,('Insufficient continuous surface',cfg['name'])
    mesh=bpy.data.meshes.new(cfg['name']);mesh.from_pydata(vertices,[],faces);mesh.materials.append(bpy.data.materials['AMBIENT_CABIN_WASH' if cfg['dim'] else 'AMBIENT_CABIN_LED']);mesh.update()
    ob=bpy.data.objects.new(cfg['name'],mesh);bpy.context.collection.objects.link(ob);parent=bpy.data.objects[cfg['parent']];ob.parent=parent;ob.matrix_parent_inverse=parent.matrix_world.inverted()
    ob['role']='surface_fitted_recessed_diffuser';ob['source_surface']=cfg['source'];ob['design']='layered_cabin_v1'
    for p in mesh.polygons:p.use_smooth=True
    created.append(cfg['name']);records.append({'node':cfg['name'],'source':cfg['source'],'parent':cfg['parent'],'width':cfg['width'],'surfaceOffset':.0006,'seedMaxProjection':max(errors),'centerline':[rt(p) for p in centers],'samples':len(centers),'trimmedGapFaces':trimmed,'dim':cfg['dim']})

ambient=mapping['materialRoles']['ambient'];lights=ambient['lights']
for c in ['fl','fr','rl','rr']:
    sign=-1 if c.endswith('l') else 1;front=c.startswith('f');parent=bpy.data.objects[mapping['doors'][c]['node']]
    point=bl((sign*.68,.56,-.16 if front else .72))
    lights.append({'parent':parent.name,'position':rt(parent.matrix_world.inverted()@point),'distance':.40,'gain':.16})
for sign in [-1,1]:lights.append({'parent':'SU7_ROOT','position':[sign*.40,.30,.67],'distance':.67,'gain':.58})
lights.append({'parent':'SU7_ROOT','position':[-.47,.91,-.53],'distance':.42,'gain':.15})
lights.append({'parent':'SU7_ROOT','position':[0,.46,.40],'distance':.42,'gain':.20})
ambient['nodes']+=created
ambient.update({'addedNodes':created,'lightPositions':[p['position'] for p in lights if p['parent']=='SU7_ROOT'],'design':'layered_cabin_v1','note':'Layered ring: 25 surface-fitted diffusers covering original upper rails, door inlays, handle recesses, speaker contours and door pockets, dashboard seams, centre tunnel and rear console. 16 concealed short-range wash lights include front/rear footwells; eight follow the four doors. Existing 140 nodes preserved.'})
audit['records']+=records;audit['ribbonCount']=len(audit['records']);audit['lights']=lights;audit['designRevision']='layered_cabin_v1';audit['additiveBaseline']='f74cbf1'
mapping['version']='0.7.1-layered-cabin';root['cabin_design_version']='layered_cabin_v1'
for file in ['docs/assets/vehicle-mapping.json','apps/web/public/models/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf8')
(ROOT/'docs/assets/cabin-lighting-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/blender/su7-enhanced.blend'))
print('CABIN_DESIGN_SAVED',json.dumps({'newDiffusers':len(created),'totalDiffusers':len(ambient['nodes']),'localLights':len(lights),'sourceGeometryModified':False}))
