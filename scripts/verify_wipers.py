"""Verify saved morph rig on the actual source windshield at 101 sweep positions."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
ROOT=Path(__file__).resolve().parent.parent
def bl(v):return Vector((v[0],-v[2],v[1]))
def rt(v):return Vector((v.x,v.z,-v.y))
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
glassob=bpy.data.objects['Mesh69'];verts=[glassob.matrix_world@v.co for v in glassob.data.vertices];faces=[list(f.vertices) for f in glassob.data.polygons if all(rt(verts[i]).z<-.20 for i in f.vertices)];glass=BVHTree.FromPolygons(verts,faces)
tune=float(sys.argv[sys.argv.index('--tune-scale')+1]) if '--tune-scale' in sys.argv else 1
tune_blade=float(sys.argv[sys.argv.index('--tune-blade')+1]) if '--tune-blade' in sys.argv else 1
blade_indices=set();blade_rest={}
if tune_blade!=1:
    cfg=mapping['wipers']['assemblies']['passenger'];ob=bpy.data.objects[cfg['mesh']];ps=[ob.matrix_world@v.co for v in ob.data.vertices];parent=list(range(len(ps)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    quant={}
    for i,p in enumerate(ps):
        k=tuple(round(x,5) for x in p)
        if k in quant:parent[find(i)]=find(quant[k])
        else:quant[k]=i
    for face in ob.data.polygons:
        for i in face.vertices[1:]:parent[find(i)]=find(face.vertices[0])
    groups={}
    for i in range(len(ps)):groups.setdefault(find(i),[]).append(i)
    for ids in groups.values():
        low=[min(rt(ps[i])[j] for i in ids) for j in range(3)];high=[max(rt(ps[i])[j] for i in ids) for j in range(3)]
        if (low[0]<.1 and high[0]>.45) or (high[0]<-.20 and low[2]<-1.17):blade_indices.update(ids)
    blade_rest={i:(.25+(ps[i].x-.134)*tune_blade)-ps[i].x for i in blade_indices}
records=[];minimum=10;maximum=0;overlaps=0;collisionExamples=[]
for step in range(101):
    fraction=step/100;surfaces=[];worlds=[];polygons=[]
    for side,cfg in mapping['wipers']['assemblies'].items():
        f=fraction+cfg.get('sweepLead',0)*math.sin(math.pi*fraction)
        ob=bpy.data.objects[cfg['mesh']];keys=ob.data.shape_keys.key_blocks;lo=int(f*8);hi=min(8,lo+1);t=f*8-lo
        lower=keys['Basis'] if lo==0 else keys[f'SWEEP_{lo:02d}'];upper=keys['Basis'] if hi==0 else keys[f'SWEEP_{hi:02d}']
        R=Matrix.Rotation(cfg['maxAngle']*f,4,bl(cfg['axis']));pivot=bl(cfg['pivot']);points=[];low=10;high=0
        for vi,(a,b) in enumerate(zip(lower.data,upper.data)):
            local=a.co*(1-t)+b.co*t
            p=pivot+R.to_3x3()@local;q,n,_,_=glass.find_nearest(p);n=n if rt(n).y>0 else -n;distance=(p-q).dot(n)
            if side=='passenger' and vi in blade_rest:
                local.x+=blade_rest[vi];p=pivot+R.to_3x3()@local;q,n,_,_=glass.find_nearest(p);n=n if rt(n).y>0 else -n;p=q+n*distance
            if side=='passenger' and tune!=1:
                p=pivot+(p-pivot)*tune;q,n,_,_=glass.find_nearest(p);n=n if rt(n).y>0 else -n;p=q+n*distance
            low=min(low,distance);high=max(high,distance);points.append(p)
        polys=[list(f.vertices) for f in ob.data.polygons];worlds.append(points);polygons.append(polys)
        minimum=min(minimum,low);maximum=max(maximum,high);surfaces.append(BVHTree.FromPolygons(points,polys))
        if step%10==0:records.append({'side':side,'fraction':fraction,'minGlassClearance':low,'maxGlassClearance':high})
    exact=0
    for ai,bi in surfaces[0].overlap(surfaces[1]):
        ap=[worlds[0][i] for i in polygons[0][ai]];bp=[worlds[1][i] for i in polygons[1][bi]]
        triangles=lambda ps:[(ps[0],ps[i],ps[i+1]) for i in range(1,len(ps)-1)]
        hit=False
        for A in triangles(ap):
            for B in triangles(bp):
                for edge,triangle in [(A,B),(B,A)]:
                    for a,b in zip(edge,edge[1:]+edge[:1]):
                        length=(b-a).length
                        if length<1e-8:continue
                        p=intersect_ray_tri(*triangle,(b-a)/length,a,True)
                        if p is not None and (p-a).length>1e-6 and (p-a).length<length-1e-6:hit=True
        if hit:
            exact+=1
            if len(collisionExamples)<12:
                ca=sum(ap,Vector())/len(ap);cb=sum(bp,Vector())/len(bp)
                collisionExamples.append({'fraction':fraction,'driverFace':ai,'passengerFace':bi,'driverCenter':list(rt(ca)),'passengerCenter':list(rt(cb))})
    overlaps+=exact
    if step%10==0:records.append({'fraction':fraction,'candidatePairs':len(surfaces[0].overlap(surfaces[1])),'exactIntersections':exact})
report={'samplesPerAssembly':101,'mode':'actual-saved-rig' if tune==1 and tune_blade==1 else 'read-only-proposed-fit','source':'saved enhanced Blender source, original windshield and original wiper faces','minGlassClearanceMeters':minimum,'maxGlassClearanceMeters':maximum,'intersectionsBetweenWipers':overlaps,'collisionExamples':collisionExamples,'records':records}
report['passed']=minimum>.001 and maximum<.03 and overlaps==0
(ROOT/'docs/assets/i6-wiper-clearance-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8',newline='\n')
print('WIPER_CLEARANCE',json.dumps({k:v for k,v in report.items() if k!='records'}));assert report['passed']
