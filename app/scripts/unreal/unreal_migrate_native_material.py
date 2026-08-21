import datetime
import hashlib
import json
import os
from pathlib import Path

import unreal


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def payload_snapshot(root: Path) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    if not root.is_dir():
        return result
    for file in sorted(root.rglob("*")):
        if not file.is_file() or file.suffix.lower() not in {".uasset", ".uexp", ".ubulk"}:
            continue
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        result[file.relative_to(root).as_posix()] = {"bytes": file.stat().st_size, "sha256": digest}
    return result


def game_dependency_closure(source_package: str) -> list[str]:
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    options = unreal.AssetRegistryDependencyOptions()
    for option_name in (
        "include_soft_package_references",
        "include_hard_package_references",
        "include_searchable_names",
        "include_soft_management_references",
        "include_hard_management_references",
    ):
        options.set_editor_property(option_name, True)
    pending = [source_package]
    visited: set[str] = set()
    while pending:
        package = pending.pop()
        if package in visited or not package.startswith("/Game/"):
            continue
        visited.add(package)
        pending.extend(str(item) for item in registry.get_dependencies(package, options))
    return sorted(visited)


source_package = required_env("NOBLESSE_UNREAL_SOURCE_PACKAGE")
target_content = Path(required_env("NOBLESSE_UNREAL_TARGET_CONTENT")).resolve()
receipt_path = Path(required_env("NOBLESSE_UNREAL_MIGRATION_RECEIPT")).resolve()
target_content.mkdir(parents=True, exist_ok=True)
receipt_path.parent.mkdir(parents=True, exist_ok=True)

started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
if not unreal.EditorAssetLibrary.does_asset_exist(source_package):
    raise RuntimeError(f"Source asset does not exist: {source_package}")

source_asset = unreal.EditorAssetLibrary.load_asset(source_package)
if source_asset is None:
    raise RuntimeError(f"Source asset could not be loaded: {source_package}")

source_class = source_asset.get_class().get_name()
if source_class != "MaterialInstanceConstant":
    raise RuntimeError(f"Expected MaterialInstanceConstant, got {source_class}")

dependency_packages = game_dependency_closure(source_package)
preexisting_packages: list[str] = []
for package in dependency_packages:
    target_base = target_content / package.removeprefix("/Game/")
    target_payloads = [candidate for suffix in (".uasset", ".uexp", ".ubulk") if (candidate := target_base.with_suffix(suffix)).is_file()]
    if target_payloads:
        preexisting_packages.append(package)

before = payload_snapshot(target_content)
migration_options = [False, False, unreal.AssetMigrationConflict.SKIP, ""]
unreal.AssetToolsHelpers.get_asset_tools().migrate_packages([source_package], str(target_content), migration_options)
after = payload_snapshot(target_content)
added = sorted(set(after) - set(before))
changed = sorted(path for path in set(after) & set(before) if after[path]["sha256"] != before[path]["sha256"])
if not added and not changed:
    unreal.log(f"NOBLESSE_MIGRATION_ALREADY_PRESENT={source_package}")

receipt = {
    "schemaVersion": 1,
    "status": "PASS",
    "sourcePackage": source_package,
    "sourceClass": source_class,
    "dependencyPackageCount": len(dependency_packages),
    "dependencyPackages": dependency_packages,
    "conflictPolicy": "SKIP_EXISTING_PACKAGES",
    "preexistingPackages": preexisting_packages,
    "conflictingPackages": [],
    "targetContent": str(target_content),
    "payloadCountBefore": len(before),
    "payloadCountAfter": len(after),
    "addedPayloads": added,
    "changedPayloads": changed,
    "startedAt": started_at,
    "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
unreal.log(f"NOBLESSE_MIGRATION_PASS={receipt_path}")
