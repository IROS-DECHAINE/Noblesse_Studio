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


asset_path = required_env("NOBLESSE_UNREAL_SOURCE_PACKAGE")
receipt_path = Path(required_env("NOBLESSE_UNREAL_VALIDATION_RECEIPT")).resolve()
receipt_path.parent.mkdir(parents=True, exist_ok=True)

if not unreal.EditorAssetLibrary.does_asset_exist(asset_path):
    raise RuntimeError(f"Migrated asset is missing: {asset_path}")
asset = unreal.EditorAssetLibrary.load_asset(asset_path)
if asset is None:
    raise RuntimeError(f"Migrated asset could not be loaded: {asset_path}")
asset_class = asset.get_class().get_name()
if asset_class != "MaterialInstanceConstant":
    raise RuntimeError(f"Expected MaterialInstanceConstant, got {asset_class}")

parent = asset.get_editor_property("parent")
if parent is None:
    raise RuntimeError("Migrated material instance has no parent")
parent_path = parent.get_path_name()

if hasattr(unreal.MaterialEditingLibrary, "update_material_instance"):
    unreal.MaterialEditingLibrary.update_material_instance(asset)
if parent.get_class().get_name() == "Material" and hasattr(unreal.MaterialEditingLibrary, "recompile_material"):
    unreal.MaterialEditingLibrary.recompile_material(parent)

registry = unreal.AssetRegistryHelpers.get_asset_registry()
package_name = asset.get_outermost().get_name()
dependency_options = unreal.AssetRegistryDependencyOptions()
for option_name in (
    "include_soft_package_references",
    "include_hard_package_references",
    "include_searchable_names",
    "include_soft_management_references",
    "include_hard_management_references",
):
    dependency_options.set_editor_property(option_name, True)
pending = [package_name]
visited = set()
while pending:
    current = pending.pop()
    if current in visited or not current.startswith("/Game/"):
        continue
    visited.add(current)
    pending.extend(str(item) for item in registry.get_dependencies(current, dependency_options))
dependencies = sorted(visited - {package_name})
missing_dependencies = [dependency for dependency in dependencies if not unreal.EditorAssetLibrary.does_asset_exist(dependency)]
if missing_dependencies:
    raise RuntimeError(f"Missing migrated dependencies: {missing_dependencies}")

textures = []
for dependency in dependencies:
    dependency_asset = unreal.EditorAssetLibrary.load_asset(dependency)
    if dependency_asset and dependency_asset.get_class().get_name().startswith("Texture"):
        textures.append(dependency_asset.get_path_name())

saved = unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=True)
receipt = {
    "schemaVersion": 1,
    "status": "PASS",
    "assetPath": asset_path,
    "assetClass": asset_class,
    "parentPath": parent_path,
    "textureCount": len(textures),
    "textures": sorted(textures),
    "dependencyCount": len(dependencies),
    "dependencies": dependencies,
    "recursiveDependencyValidation": True,
    "missingDependencies": [],
    "materialInstanceUpdated": True,
    "parentRecompileAttempted": parent.get_class().get_name() == "Material",
    "saveCallAccepted": bool(saved),
    "validatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
unreal.log(f"NOBLESSE_VALIDATION_PASS={receipt_path}")
