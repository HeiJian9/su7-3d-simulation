"""Seat fitted front LED geometry just beneath the original transparent lens."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
lens=bpy.data.objects['Mesh70'];tree=BVHTree.FromPolygons([lens.matrix_world@v.co for v in lens.data.vertices],[list(p.vertices) for p in lens.data.polygons])
if not bpy.data.objects['SU7_ROOT'].get('lamp_depth_refined'):
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH' or not(ob.name.startswith('HEADLIGHT_') or ob.name.startswith('TURN_') and ob.name.endswith('_FRONT')):continue
        inverse=ob.matrix_world.inverted()
        for vertex in ob.data.vertices:
            p=ob.matrix_world@vertex.co;q,n,_,_=tree.find_nearest(p)
            if n.y<0:n=-n # Blender front is +Y, outside of the lens.
            depth=max(-.018,min(-.002,(p-q).dot(n)-.012));vertex.co=inverse@(q+n*depth)
        ob.data.update()
    bpy.data.objects['SU7_ROOT']['lamp_depth_refined']=True
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
