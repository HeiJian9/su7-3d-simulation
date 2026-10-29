"""Read the saved Blender asset and fit two wider runtime crown diffusers.
Only writes the derived JSON; never saves or exports the Blender project.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(__file__).resolve().parent.parent
source=bpy.data.objects['Mesh53'];points=[source.matrix_world@v.co for v in source.data.vertices]
source.data.calc_loop_triangles()
tree=BVHTree.FromPolygons(points,[list(p.vertices) for p in source.data.loop_triangles],all_triangles=True)
routes={'AMBIENT_DASH_CROWN_LEFT':[7702,6793,6791,6773,5948,5943,5942,5940,5939,5937,5936,5934],
        'AMBIENT_DASH_CROWN_RIGHT':[8300,8302,8304,8305,8307,8309,8311,8312,7704,8206,8208,7699,7227,6869,6794,6795,9850]}
records=[];width=.0048;offset=.00055;up=Vector((0,0,1));pieces=[];columns=9
for name,indices in routes.items():
    anchors=[points[i] for i in indices];centres=[]
    for a,b in zip(anchors,anchors[1:]):
        steps=max(1,math.ceil((b-a).length/.003))
        centres.extend(a.lerp(b,j/steps) for j in range(steps))
    centres.append(anchors[-1]);pieces.append((name,centres))
all_centres=pieces[0][1]+pieces[1][1][1:]
for number,(name,centres) in enumerate(pieces):
    vertices=[];faces=[];world=[];start=0 if number==0 else len(pieces[0][1])-1
    inverse=bpy.data.objects[name].matrix_world.inverted()
    for i,c in enumerate(centres):
        j=start+i;tangent=all_centres[min(j+1,len(all_centres)-1)]-all_centres[max(j-1,0)]
        across=up.cross(tangent).normalized()*width*.5
        for column in range(columns):
            sign=column/(columns-1)*2-1
            hit=tree.find_nearest(c+across*sign)[0]
            # A shallow rounded diffuser is visible from the cabin's low angle;
            # a flat horizontal ribbon collapses to a thin edge in this view.
            rise=.00035+.00105*math.sqrt(max(0,1-sign*sign))
            world.append(hit+up*rise)
    for i in range(len(centres)-1):
        for j in range(columns-1):
            a=i*columns+j;b=a+columns
            faces.extend([a,b,b+1,a,b+1,a+1])
    # A wider cross-section can cross a crease. Refine only those triangles
    # rather than bridging it with a flat, floating connector.
    refined=[];midpoints={}
    def midpoint(a,b):
        key=tuple(sorted((a,b)))
        if key not in midpoints:
            p=(world[a]+world[b])*.5;hit=tree.find_nearest(p)[0]
            midpoints[key]=len(world);world.append(hit+up*offset)
        return midpoints[key]
    def fit(a,b,c,depth=0):
        pa,pb,pc=world[a],world[b],world[c]
        probes=[(pa+pb+pc)/3,(pa+pb)*.5,(pb+pc)*.5,(pc+pa)*.5]
        if depth<5 and max(tree.find_nearest(p)[3] for p in probes)>.00145:
            ab,bc,ca=midpoint(a,b),midpoint(b,c),midpoint(c,a)
            for tri in [(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)]:fit(*tri,depth+1)
        else:refined.extend([a,b,c])
    for i in range(0,len(faces),3):fit(*faces[i:i+3])
    for q in world:
        p=inverse@q;vertices.extend([round(p.x,8),round(p.z,8),round(-p.y,8)])
    centreline=[]
    for q in centres:
        p=inverse@q;centreline.extend([round(p.x,8),round(p.z,8),round(-p.y,8)])
    records.append({'node':name,'positions':vertices,'indices':refined,'sections':len(centres),'centreline':centreline})
out={'source':'Mesh53','width':width,'columns':columns,'surfaceOffset':offset,'diffuserRise':.0014,'emission':1.8,'meshes':records}
(root/'apps/web/src/data/dashboard-profile.json').write_text(json.dumps(out,separators=(',',':'))+'\n',encoding='utf-8')
print('DASHBOARD_PROFILE',json.dumps({'width':width,'sections':sum(r['sections'] for r in records),'sourceUnmodified':True}))
