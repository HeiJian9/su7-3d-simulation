"""Re-export the saved enhanced project, without re-importing or re-partitioning."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
def bl(v):return Vector((v[0],-v[2],v[1]))
bpy.context.preferences.filepaths.save_version=0
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
for cfg in list(mapping['doors'].values())+[mapping['trunk']]:bpy.data.objects[cfg['node']].rotation_euler=(0,0,0)
wm=json.loads((ROOT/'docs/assets/window-mapping.json').read_text(encoding='utf8'))
for cfg in wm['windows'].values():bpy.data.objects[cfg['node']].location=bl(cfg['closedTranslation'])
if mapping.get('wipers'):
    for cfg in mapping['wipers']['assemblies'].values():
        ob=bpy.data.objects[cfg['node']];ob.rotation_mode='XYZ';ob.rotation_euler=(0,0,0)
        for key in bpy.data.objects[cfg['mesh']].data.shape_keys.key_blocks:key.value=0
bpy.context.view_layer.update();bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/blender/su7-enhanced.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'apps/web/public/models/su7-runtime.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
