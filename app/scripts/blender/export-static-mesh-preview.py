import bpy
import os
import sys


def arguments():
    marker = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    values = sys.argv[marker + 1:]
    if len(values) != 2:
        raise RuntimeError("Expected source .blend and destination .glb")
    return os.path.abspath(values[0]), os.path.abspath(values[1])


source_blend, destination_glb = arguments()
os.makedirs(os.path.dirname(destination_glb), exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=source_blend, load_ui=False)
bpy.ops.export_scene.gltf(
    filepath=destination_glb,
    export_format="GLB",
    use_selection=False,
    use_visible=True,
    export_apply=True,
    export_materials="EXPORT",
    export_image_format="WEBP",
    export_texcoords=True,
    export_normals=True,
    export_tangents=True,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)

if not os.path.isfile(destination_glb) or os.path.getsize(destination_glb) < 1024:
    raise RuntimeError("GLB preview export did not produce a valid file")

print(f"NOBLESSE_PREVIEW_GLB={destination_glb}")
