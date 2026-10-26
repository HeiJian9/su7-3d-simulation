"""Read the current Blender project and audit glazing before modifying it."""
import bpy
import json
from collections import Counter
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
NAMES = {'fl':'Mesh46','fr':'Mesh33','rl':'Mesh39','rr':'Mesh26'}
def runtime(v):
    return Vector((v.x, v.z, -v.y))
meshes = {}
trees = {}
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH': continue
    vs = [runtime(ob.matrix_world @ v.co) for v in ob.data.vertices]
    polygons = [list(p.vertices) for p in ob.data.polygons]
    meshes[ob.name] = (ob, vs, polygons)
    trees[ob.name] = BVHTree.FromPolygons(vs, polygons)

def inside(p, a, b, c):
    def cross(u,v,w): return (v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0])
    values=[cross(a,b,p),cross(b,c,p),cross(c,a,p)]
    return min(values)>=-1e-8 or max(values)<=1e-8

reports={}
for corner,name in NAMES.items():
    ob,vs,ps=meshes[name]
    low=[min(v[i] for v in vs) for i in range(3)]
    high=[max(v[i] for v in vs) for i in range(3)]
    projected=[]
    for poly in ps:
        for i in range(1,len(poly)-1): projected.append([(vs[k].z,vs[k].y) for k in [poly[0],poly[i],poly[i+1]]])
    samples=[]
    side=-1 if corner.endswith('l') else 1
    for yi in range(1,8):
        y=low[1]+(high[1]-low[1])*yi/8
        for zi in range(1,12):
            z=low[2]+(high[2]-low[2])*zi/12
            if not any(inside((z,y),*tri) for tri in projected): continue
            hits=[]
            for other,tree in trees.items():
                hit,normal,face,distance=tree.ray_cast(Vector((side*2,y,z)),Vector((-side,0,0)),4)
                if hit is not None and 0.5 < hit.x*side < 1.05:
                    hits.append({'node':other,'face':face,'x':round(hit.x,6),'materials':[m.name for m in meshes[other][0].data.materials if m]})
            samples.append({'y':round(y,5),'z':round(z,5),'hits':hits})
    reports[corner]={'source':name,'vertices':[list(v) for v in vs],'polygons':ps,'bounds':{'min':low,'max':high},'samples':samples,
        'overlappingNodeHitCounts':dict(Counter(h['node'] for s in samples for h in s['hits']))}
out=ROOT/'docs/assets/i2-window-original-audit.json'
out.write_text(json.dumps({'source':bpy.data.filepath,'windows':reports},indent=2),encoding='utf8')
print('WINDOW_AUDIT',json.dumps({k:{'source':v['source'],'vertices':len(v['vertices']),'faces':len(v['polygons']),'overlaps':v['overlappingNodeHitCounts']} for k,v in reports.items()}))
