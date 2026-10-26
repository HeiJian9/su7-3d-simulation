"""Place cockpit annotations on the original steering buttons and center screen."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
ob=bpy.data.objects['Mesh57'];tree=BVHTree.FromPolygons([ob.matrix_world@v.co for v in ob.data.vertices],[list(p.vertices) for p in ob.data.polygons])
for key,p in {'lights':(-.562,.882,-.475),'wiper':(-.270,.882,-.475),'ambient':(.08,.91,-.58)}.items():
    v=tree.find_nearest(Vector((p[0],-p[2],p[1])))[0];mapping['cockpitHotspots'][key]=[v.x,v.z,-v.y+.006]
mapping['cockpitHotspotSource']='Original Mesh57 left/right steering button surfaces and center screen; annotations only, no full cockpit rebuild.'
for file in ['apps/web/public/models/vehicle-mapping.json','docs/assets/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
bpy.data.objects['SU7_ROOT']['cockpit_hotspots']=json.dumps(mapping['cockpitHotspots'])
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
