import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
mapping=json.loads((ROOT/'docs/assets/window-mapping.json').read_text())
original=json.loads((ROOT/'docs/assets/i2-window-original-audit.json').read_text())
def rt(v):return Vector((v.x,v.z,-v.y))
def bl(v):return Vector((v[0],-v[2],v[1]))
report={'windows':{},'kind':'actual geometric ray intersections, not transparency checks'}
for c,w in mapping['windows'].items():
    control=bpy.data.objects[w['node']];glass=bpy.data.objects[w['glass']];closed=control.location.copy()
    actual=[rt(glass.matrix_world @ v.co) for v in glass.data.vertices]
    error=max((p-Vector(q)).length for p,q in zip(actual,original['windows'][c]['vertices']))
    assert error<.00001
    parent=list(range(len(actual)))
    def find(x):
        while parent[x]!=x:x=parent[x]
        return x
    for face in glass.data.polygons:
        for v in list(face.vertices)[1:]:parent[find(v)]=find(face.vertices[0])
    components=len(set(find(i) for i in range(len(actual))))
    assert components==1
    samples=original['windows'][c]['samples'];side=-1 if c.endswith('l') else 1
    poses=[]
    for value in [0,.5,1]:
        control.location=closed+bl(w['travel'])*value;bpy.context.view_layer.update()
        vs=[rt(glass.matrix_world @ v.co) for v in glass.data.vertices]
        tree=BVHTree.FromPolygons(vs,[list(p.vertices) for p in glass.data.polygons])
        hits=sum(tree.ray_cast(Vector((side*2,s['y'],s['z'])),Vector((-side,0,0)),4)[0] is not None for s in samples)
        poses.append({'openness':value,'glassRayHitsInOriginalAperture':hits,'sampleCount':len(samples),'maxY':max(p.y for p in vs),'scale':list(control.scale)})
    assert poses[0]['glassRayHitsInOriginalAperture']==len(samples)
    assert 0<poses[1]['glassRayHitsInOriginalAperture']<len(samples)
    assert poses[2]['glassRayHitsInOriginalAperture']==0
    assert poses[2]['maxY']<w['closedBounds']['min'][1]
    control.location=closed;bpy.context.view_layer.update()
    report['windows'][c]={'closedWorldVertexMaxError':error,'connectedComponents':components,'poses':poses,'staticAdjacentGlazingRetained':True}
(ROOT/'docs/assets/i2-window-geometric-validation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('FOUR_WINDOW_GEOMETRY_PASS',json.dumps({c:[p['glassRayHitsInOriginalAperture'] for p in w['poses']] for c,w in report['windows'].items()}))
