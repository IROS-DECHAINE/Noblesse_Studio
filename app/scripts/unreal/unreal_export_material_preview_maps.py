import datetime
import hashlib
import json
import os
import re
from pathlib import Path

import unreal


SUPPORTED_ROLES = {
    "BaseColor": "baseColor",
    "NormaLMap": "normal",
    "ARM": "orm",
}


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def safe_stem(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")[:72] or "texture"
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    return f"{clean}-{digest}"


def export_texture(texture, filename: Path) -> None:
    task = unreal.AssetExportTask()
    task.set_editor_property("object", texture)
    task.set_editor_property("filename", str(filename))
    task.set_editor_property("automated", True)
    task.set_editor_property("prompt", False)
    task.set_editor_property("replace_identical", True)
    task.set_editor_property("exporter", unreal.TextureExporterPNG())
    if not unreal.Exporter.run_asset_export_task(task) or not filename.is_file():
        raise RuntimeError("TextureExporterPNG did not produce the expected file")


audit_path = Path(required_env("NOBLESSE_UNREAL_PREVIEW_AUDIT")).resolve()
export_root = Path(required_env("NOBLESSE_UNREAL_PREVIEW_EXPORT_ROOT")).resolve()
receipt_path = Path(required_env("NOBLESSE_UNREAL_PREVIEW_EXPORT_RECEIPT")).resolve()

audit = json.loads(audit_path.read_text(encoding="utf-8-sig"))
if audit.get("status") != "PASS" or audit.get("mode") != "READ_ONLY_MATERIAL_PREVIEW_AUDIT":
    raise RuntimeError("A passing read-only material preview audit is required")
if not audit.get("supportsTexturePngExporter"):
    raise RuntimeError("TextureExporterPNG is unavailable in this Unreal build")

export_root.mkdir(parents=True, exist_ok=True)
texture_records = {}
asset_records = {}
errors = []

for asset in audit.get("assets", []):
    asset_maps = {}
    for parameter in asset.get("parameters", {}).get("textures", []):
        parameter_name = parameter.get("name", "")
        role = SUPPORTED_ROLES.get(parameter_name)
        if not role:
            continue
        object_path = str(parameter.get("objectPath", ""))
        texture_key = hashlib.sha256(object_path.encode("utf-8")).hexdigest()
        asset_maps[role] = texture_key
        if texture_key in texture_records:
            continue
        texture = unreal.EditorAssetLibrary.load_asset(object_path)
        if texture is None or texture.get_class().get_name() != "Texture2D":
            errors.append({"objectPath": object_path, "error": "Expected Texture2D"})
            continue
        filename = export_root / f"{safe_stem(object_path)}.png"
        try:
            export_texture(texture, filename)
            texture_records[texture_key] = {
                "role": role,
                "parameterName": parameter_name,
                "objectPath": object_path,
                "sourceSrgb": parameter.get("srgb"),
                "sourceCompressionSettings": parameter.get("compressionSettings"),
                "filename": filename.name,
                "sizeBytes": filename.stat().st_size,
            }
        except Exception as error:
            errors.append({"objectPath": object_path, "error": str(error)})

    scalar_lookup = {
        item.get("name"): item.get("value")
        for item in asset.get("parameters", {}).get("scalars", [])
    }
    vector_lookup = {
        item.get("name"): item.get("value")
        for item in asset.get("parameters", {}).get("vectors", [])
    }
    asset_records[asset.get("assetId", "")] = {
        "objectPath": asset.get("objectPath", ""),
        "parentPath": asset.get("parentPath", ""),
        "maps": asset_maps,
        "parameters": {
            "colorAdd": vector_lookup.get("ColorAdd", [0.0, 0.0, 0.0, 0.0]),
            "colorMultiply": vector_lookup.get("ColorMultiply", [1.0, 1.0, 1.0, 1.0]),
            "metalness": scalar_lookup.get("Material", 1.0),
            "roughness": scalar_lookup.get("Roughness", 1.0),
            "uvOffset": vector_lookup.get("UVOffset", [0.0, 0.0, 0.0, 1.0])[:2],
            "uvRotationDegrees": scalar_lookup.get("UVRotationDegree", 0.0),
            "uvScale": vector_lookup.get("UVScale", [1.0, 1.0, 0.0, 1.0])[:2],
        },
    }

required_texture_keys = {
    texture_key
    for asset in asset_records.values()
    for texture_key in asset["maps"].values()
}
missing_texture_keys = sorted(required_texture_keys.difference(texture_records))
if missing_texture_keys:
    errors.append({"error": "Some referenced textures were not exported", "textureKeys": missing_texture_keys})

receipt = {
    "schemaVersion": 1,
    "status": "PASS" if not errors else "REVIEW_REQUIRED",
    "mode": "UNREAL_NATIVE_PREVIEW_MAP_EXPORT",
    "packId": audit.get("packId", ""),
    "assetCount": len(asset_records),
    "textureCount": len(texture_records),
    "assets": asset_records,
    "textures": texture_records,
    "errors": errors,
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
receipt_path.parent.mkdir(parents=True, exist_ok=True)
receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
unreal.log(f"NOBLESSE_PREVIEW_EXPORT_{receipt['status']}={receipt_path}")
if errors:
    raise RuntimeError(f"Material preview map export failed with {len(errors)} error(s)")
