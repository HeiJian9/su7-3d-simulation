"""Isolate a graphite display material on the real wiper assemblies."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
mapping=json.loads((ROOT/'docs/assets/vehicle-mapping.json').read_text(encoding='utf8'))
mat=bpy.data.materials.get('WIPER_GRAPHITE')
if mat is None:
    mat=bpy.data.materials['Mesh24Mtl'].copy();mat.name='WIPER_GRAPHITE'
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    for link in list(mat.node_tree.links):
        if link.to_node==bsdf and link.to_socket==bsdf.inputs['Base Color']:mat.node_tree.links.remove(link)
    bsdf.inputs['Base Color'].default_value=(.08,.10,.115,1);bsdf.inputs['Metallic'].default_value=.35;bsdf.inputs['Roughness'].default_value=.6
    mat['role']='isolated_graphite_wiper_display_material'
for cfg in mapping['wipers']['assemblies'].values():
    ob=bpy.data.objects[cfg['mesh']];ob.data.materials.clear();ob.data.materials.append(mat)
    for poly in ob.data.polygons:poly.material_index=0
mapping['materialRoles']['wiper']={'material':mat.name,'nodes':[cfg['mesh'] for cfg in mapping['wipers']['assemblies'].values()],'note':'Isolated graphite improves motion visibility against dark showroom; source geometry and UVs retained.'}
mapping['version']='I6.2'
for file in ['apps/web/public/models/vehicle-mapping.json','docs/assets/vehicle-mapping.json']:(ROOT/file).write_text(json.dumps(mapping,indent=2),encoding='utf8',newline='\n')
exec(compile((ROOT/'scripts/export_current.py').read_text(encoding='utf8'),'export_current.py','exec'))
