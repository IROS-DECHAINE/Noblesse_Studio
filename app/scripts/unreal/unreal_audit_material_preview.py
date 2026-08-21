import datetime
import json
import os
from pathlib import Path

import unreal


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def optional_property(asset, name: str):
    try:
        value = asset.get_editor_property(name)
    except Exception:
        return None
    if isinstance(value, (bool, float, int, str)) or value is None:
        return value
    return str(value)


def material_parameters(asset) -> dict[str, list[dict[str, object]]]:
    texture_parameters = []
    for parameter_name in unreal.MaterialEditingLibrary.get_texture_parameter_names(asset):
        name = str(parameter_name)
        texture = unreal.MaterialEditingLibrary.get_material_instance_texture_parameter_value(asset, name)
        if texture is None:
            continue
        texture_parameters.append(
            {
                "name": name,
                "objectPath": texture.get_path_name(),
                "class": texture.get_class().get_name(),
                "srgb": optional_property(texture, "srgb"),
                "flipGreenChannel": optional_property(texture, "flip_green_channel"),
                "compressionSettings": optional_property(texture, "compression_settings"),
                "lodGroup": optional_property(texture, "lod_group"),
            }
        )

    scalar_parameters = []
    for parameter_name in unreal.MaterialEditingLibrary.get_scalar_parameter_names(asset):
        name = str(parameter_name)
        value = unreal.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(asset, name)
        scalar_parameters.append({"name": name, "value": float(value)})

    vector_parameters = []
    for parameter_name in unreal.MaterialEditingLibrary.get_vector_parameter_names(asset):
        name = str(parameter_name)
        value = unreal.MaterialEditingLibrary.get_material_instance_vector_parameter_value(asset, name)
        vector_parameters.append(
            {
                "name": name,
                "value": [float(value.r), float(value.g), float(value.b), float(value.a)],
            }
        )

    static_switches = []
    for parameter_name in unreal.MaterialEditingLibrary.get_static_switch_parameter_names(asset):
        name = str(parameter_name)
        value = unreal.MaterialEditingLibrary.get_material_instance_static_switch_parameter_value(asset, name)
        static_switches.append({"name": name, "value": bool(value)})

    return {
        "textures": texture_parameters,
        "scalars": scalar_parameters,
        "vectors": vector_parameters,
        "staticSwitches": static_switches,
    }


def expression_property(expression, name: str):
    value = optional_property(expression, name)
    if value is None:
        return None
    return {"name": name, "value": value}


def material_expression_tree(material, expression, visited=None):
    if expression is None:
        return None
    visited = set() if visited is None else visited
    identity = expression.get_path_name()
    if identity in visited:
        return {"class": expression.get_class().get_name(), "path": identity, "cycle": True}
    visited.add(identity)

    properties = []
    for property_name in (
        "parameter_name",
        "default_value",
        "const_a",
        "const_b",
        "r",
        "g",
        "b",
        "a",
        "texture",
        "sampler_type",
    ):
        value = expression_property(expression, property_name)
        if value is not None:
            properties.append(value)

    input_names = list(unreal.MaterialEditingLibrary.get_material_expression_input_names(expression))
    input_nodes = list(unreal.MaterialEditingLibrary.get_inputs_for_material_expression(material, expression))
    inputs = []
    for index, input_name in enumerate(input_names):
        input_node = input_nodes[index] if index < len(input_nodes) else None
        inputs.append(
            {
                "name": str(input_name),
                "sourceOutput": str(
                    unreal.MaterialEditingLibrary.get_input_node_output_name_for_material_expression(
                        expression,
                        input_node,
                    )
                ) if input_node else "",
                "source": material_expression_tree(material, input_node, visited.copy()),
            }
        )
    return {
        "class": expression.get_class().get_name(),
        "path": identity,
        "properties": properties,
        "inputs": inputs,
    }


def material_output_graph(material) -> dict[str, object]:
    properties = {
        "BaseColor": unreal.MaterialProperty.MP_BASE_COLOR,
        "Normal": unreal.MaterialProperty.MP_NORMAL,
        "AmbientOcclusion": unreal.MaterialProperty.MP_AMBIENT_OCCLUSION,
        "Roughness": unreal.MaterialProperty.MP_ROUGHNESS,
        "Metallic": unreal.MaterialProperty.MP_METALLIC,
    }
    outputs = {}
    for label, material_property in properties.items():
        expression = unreal.MaterialEditingLibrary.get_material_property_input_node(material, material_property)
        outputs[label] = {
            "sourceOutput": str(
                unreal.MaterialEditingLibrary.get_material_property_input_node_output_name(
                    material,
                    material_property,
                )
            ) if expression else "",
            "source": material_expression_tree(material, expression),
        }
    return outputs


catalog_path = Path(required_env("NOBLESSE_UNREAL_PREVIEW_CATALOG")).resolve()
receipt_path = Path(required_env("NOBLESSE_UNREAL_PREVIEW_RECEIPT")).resolve()
pack_id = os.environ.get("NOBLESSE_UNREAL_PREVIEW_PACK", "").strip()

catalog = json.loads(catalog_path.read_text(encoding="utf-8-sig"))
assets = [
    asset
    for asset in catalog.get("assets", [])
    if asset.get("asset_type") == "UnrealMaterialInstance"
    and (not pack_id or asset.get("pack_id") == pack_id)
]

results = []
errors = []
parent_graphs = {}
for asset_record in assets:
    asset_id = str(asset_record.get("asset_id", ""))
    object_path = str(asset_record.get("source_unreal_path", ""))
    try:
        if not object_path.startswith("/Game/"):
            raise RuntimeError("Invalid Unreal object path")
        material = unreal.EditorAssetLibrary.load_asset(object_path)
        if material is None:
            raise RuntimeError("Material instance could not be loaded")
        if material.get_class().get_name() != "MaterialInstanceConstant":
            raise RuntimeError(f"Expected MaterialInstanceConstant, got {material.get_class().get_name()}")
        parent = material.get_editor_property("parent")
        if parent and parent.get_path_name() not in parent_graphs:
            parent_graphs[parent.get_path_name()] = material_output_graph(parent)
        results.append(
            {
                "assetId": asset_id,
                "displayName": asset_record.get("display_name", ""),
                "objectPath": object_path,
                "parentPath": parent.get_path_name() if parent else "",
                "parameters": material_parameters(material),
            }
        )
    except Exception as error:
        errors.append({"assetId": asset_id, "objectPath": object_path, "error": str(error)})

receipt = {
    "schemaVersion": 1,
    "status": "PASS" if not errors and len(results) == len(assets) else "REVIEW_REQUIRED",
    "mode": "READ_ONLY_MATERIAL_PREVIEW_AUDIT",
    "packId": pack_id,
    "assetCount": len(assets),
    "auditedCount": len(results),
    "errorCount": len(errors),
    "supportsTexturePngExporter": hasattr(unreal, "TextureExporterPNG"),
    "parentGraphs": parent_graphs,
    "assets": results,
    "errors": errors,
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
receipt_path.parent.mkdir(parents=True, exist_ok=True)
receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
unreal.log(f"NOBLESSE_PREVIEW_AUDIT_{receipt['status']}={receipt_path}")
