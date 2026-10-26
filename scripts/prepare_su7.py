"""Blender 4.5 LTS: reproducible I0–I1 import, material adaptation and export.

Run: blender --background --factory-startup --python scripts/prepare_su7.py
No part is animated, split, reconstructed or recolored as an interactive feature.
"""
import bpy
import json
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/source/extracted/2024 Xiaomi SU7.obj'
OUT = ROOT / 'assets/source/blender/su7-enhanced.blend'
RUNTIME = ROOT / 'apps/web/public/models/su7-runtime.glb'
REPORT = ROOT / 'docs/assets/model-structure.json'
for folder in [OUT.parent, RUNTIME.parent, REPORT.parent, ROOT / 'assets/derived']:
    folder.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=str(SOURCE), forward_axis='NEGATIVE_Z', up_axis='Y', use_split_objects=True, use_split_groups=True)
objects = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
points = [ob.matrix_world @ Vector(corner) for ob in objects for corner in ob.bound_box]
low = Vector(tuple(min(v[i] for v in points) for i in range(3)))
high = Vector(tuple(max(v[i] for v in points) for i in range(3)))
# Original coordinates have an arbitrary unit. Match nominal 4.997m length,
# retaining original proportions (including mirror width) without deformation.
scale = 4.997 / (high.y - low.y)
center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
for ob in objects:
    for vertex in ob.data.vertices:
        vertex.co = (ob.matrix_world @ vertex.co - center) * scale
    ob.matrix_world.identity()
    ob.data.update()

material_changes = []
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    bsdf = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        continue
    # OBJ exporter redundantly writes map_d=<diffuse> for opaque RGBA images.
    # Blender connects Color (luminance) to Alpha, making black tyres disappear.
    # Every diffuse PNG in this package has alpha=255; retain scalar MTL d only.
    alpha_links = list(bsdf.inputs['Alpha'].links)
    if alpha_links:
        for link in alpha_links:
            material.node_tree.links.remove(link)
        bsdf.inputs['Alpha'].default_value = 1.0
        material_changes.append({'material': material.name, 'change': 'Removed spurious diffuse-luminance alpha; diffuse PNG alpha is uniformly 255; MTL d=1'})
    # The source MTL has Ns=0 for most surfaces. Use modest PBR roughness;
    # keep original diffuse colors, textures, alpha and all material roles.
    if material.name == 'Paint1Mtl':
        bsdf.inputs['Metallic'].default_value = 0.55
        bsdf.inputs['Roughness'].default_value = 0.27
        bsdf.inputs['Coat Weight'].default_value = 0.3
        bsdf.inputs['Coat Roughness'].default_value = 0.18
        material_changes.append({'material': material.name, 'change': 'PBR paint: metal=.55 rough=.27 coat=.3; original diffuse retained'})
    elif material.name == 'Mesh26Mtl':
        # Side windows, windscreen and roof. Avoid refraction multipass costs;
        # preserve source alpha=.501961 and use a thin, double-sided surface.
        bsdf.inputs['Roughness'].default_value = 0.12
        bsdf.inputs['Metallic'].default_value = 0.05
        material.use_backface_culling = False
        material_changes.append({'material': material.name, 'change': 'Glass PBR rough=.12 metal=.05; original alpha retained; double sided'})
    elif bsdf.inputs['Roughness'].default_value > 0.9:
        bsdf.inputs['Roughness'].default_value = 0.72
    # All textures packed into the .blend; GLB embeds all runtime images.
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            node.image.filepath = str(SOURCE.parent / Path(node.image.filepath).name)

root = bpy.data.objects.new('SU7_ROOT', None)
bpy.context.collection.objects.link(root)
for ob in objects:
    ob.parent = root
root['source_model_id'] = 'ca2cda599f5341068c992c9f44551bf9'
root['author'] = 'Mona x Supercars'
root['license'] = 'CC BY 4.0'
root['increment'] = 'I0–I1: imported baseline only; no part articulation'
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.context.view_layer.update()

node_report = []
for ob in objects:
    coords = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    # Record runtime Y-up coordinates (Blender x,z,-y).
    runtime_coords = [Vector((v.x, v.z, -v.y)) for v in coords]
    node_report.append({
        'name': ob.name, 'parent': root.name,
        'vertices': len(ob.data.vertices),
        'triangles': sum(max(0, len(p.vertices)-2) for p in ob.data.polygons),
        'materials': [m.name for m in ob.data.materials if m],
        'boundsYUp': {'min': [round(min(v[i] for v in runtime_coords),5) for i in range(3)], 'max': [round(max(v[i] for v in runtime_coords),5) for i in range(3)]},
    })
materials = []
for mat in bpy.data.materials:
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'),None) if mat.use_nodes else None
    materials.append({'name': mat.name, 'alpha': bsdf.inputs['Alpha'].default_value if bsdf else None,
        'baseColor': list(bsdf.inputs['Base Color'].default_value) if bsdf else None,
        'textures': [n.image.name for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image] if mat.use_nodes else []})
images = [{'name': image.name, 'size': list(image.size), 'filepath': image.filepath, 'exists': Path(bpy.path.abspath(image.filepath)).exists()} for image in bpy.data.images if image.source == 'FILE']
if any(not image['exists'] for image in images):
    raise RuntimeError('Missing texture, aborting export')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
bpy.ops.export_scene.gltf(filepath=str(RUNTIME), export_format='GLB', use_selection=False, export_yup=True, export_animations=False, export_cameras=False, export_lights=False, export_extras=True)
report = {'blender': bpy.app.version_string, 'source': str(SOURCE.relative_to(ROOT)), 'sourceUnitToMeters': scale,
    'orientation': 'Y up, front -Z in GLB', 'lengthMeters': 4.997,
    'meshCount': len(objects), 'triangles': sum(n['triangles'] for n in node_report), 'animations': 0,
    'nodes': node_report, 'materials': materials, 'images': images, 'changes': material_changes,
    'limitations': ['Unrigged imported baseline; generic mesh names retained', 'No I2+ part actions or semantic pivots', 'Nominal length calibration; not an engineering scan']}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print('SU7_EXPORT_COMPLETE', json.dumps({k: report[k] for k in ['meshCount','triangles','sourceUnitToMeters','blender']}))
