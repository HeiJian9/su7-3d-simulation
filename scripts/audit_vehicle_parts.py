"""Read-only I4–I6 geometry audit, in runtime coordinates (Y up, front -Z)."""
import bpy, json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def rt(p): return (p.x,p.z,-p.y)
def bounds(points): return {'min':[round(min(p[i] for p in points),5) for i in range(3)],'max':[round(max(p[i] for p in points),5) for i in range(3)]}
report=[];raw={}
for ob in sorted(bpy.context.scene.objects,key=lambda o:o.name):
    if ob.type!='MESH':continue
    points=[rt(ob.matrix_world@v.co) for v in ob.data.vertices]
    parent=list(range(len(points)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    def union(a,b):parent[find(a)]=find(b)
    quant={}
    for i,p in enumerate(points):
        key=tuple(round(x,5) for x in p)
        if key in quant:union(i,quant[key])
        else:quant[key]=i
    for poly in ob.data.polygons:
        for v in poly.vertices[1:]:union(poly.vertices[0],v)
    comps={}
    for poly in ob.data.polygons:
        key=find(poly.vertices[0]);comps.setdefault(key,[]).append(poly.index)
    records=[]
    for faces in comps.values():
        vi=set(v for i in faces for v in ob.data.polygons[i].vertices)
        records.append({'faces':len(faces),'bounds':bounds([points[i] for i in vi])})
    report.append({'name':ob.name,'parent':ob.parent.name if ob.parent else None,'vertices':len(points),'faces':len(ob.data.polygons),'triangles':sum(len(p.vertices)-2 for p in ob.data.polygons),'materials':[m.name for m in ob.data.materials],'bounds':bounds(points),'components':sorted(records,key=lambda r:-r['faces'])})
    raw[ob.name]={'vertices':points,'faces':[list(p.vertices) for p in ob.data.polygons]}
(ROOT/'docs/assets/i4-original-audit.json').write_text(json.dumps({'blender':bpy.app.version_string,'objects':report},indent=2),encoding='utf8',newline='\n')
folder=ROOT/'.tools/vehicle-audit';folder.mkdir(parents=True,exist_ok=True)
(folder/'geometry.json').write_text(json.dumps(raw),encoding='utf8')
for r in report:print(r['name'],r['faces'],len(r['components']),r['bounds'],','.join(r['materials']))
print('VEHICLE_AUDIT_COMPLETE')
