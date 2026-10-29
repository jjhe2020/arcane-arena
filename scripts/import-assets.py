"""Build compact runtime derivatives from the read-only, selected art delivery.

Run with the art project's Pillow-enabled Python, e.g.:
  E:/codex/gameArtPipeline/.venv/Scripts/python.exe -X utf8 scripts/import-assets.py
No original images, metadata, or acceptance records are modified. The exported
catalog is evidence/data, not a claim that the combat engine implements it.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import math
import os
from pathlib import Path
import time
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("E:/codex/gameArtPipeline")
PUBLIC = ROOT / "public"
JOBS: list[dict] = []


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(path)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def resolve_file(file, base):
    p = Path(file)
    if p.is_absolute():
        return p
    local = base / p
    return local if local.exists() else SOURCE / p


def normalized(point, size):
    if isinstance(point, dict):
        point = [point["x"], point["y"]]
    return [round(point[0] / size[0], 7), round(point[1] / size[1], 7)]


def clip(meta, base, target, size=192, priority=2):
    frames = meta["frames"]
    columns = min(16, math.ceil(math.sqrt(len(frames))))
    rows = math.ceil(len(frames) / columns)
    assert columns * size <= 4096 and rows * size <= 4096
    source_size = meta.get("frame_size", [1024, 1024])
    pivot = normalized(meta.get("pivot", frames[0].get("pivot", [source_size[0]/2, source_size[1]/2])), source_size)
    paths = [resolve_file(f["file"], base) for f in frames]
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError(missing[:3])
    output = PUBLIC / target
    signature = hashlib.sha256(json.dumps({"files": [str(p) for p in paths], "hashes": [f.get("png_sha256", f.get("sha256")) for f in frames], "size": size, "format": "webp-lossless-method0-v1"}, sort_keys=True).encode()).hexdigest()
    JOBS.append({"paths": paths, "output": output, "size": size, "columns": columns, "rows": rows, "signature": signature, "priority": priority})
    result = {"image": "/" + target, "frames": len(frames), "columns": columns,
              "frameWidth": size, "frameHeight": size, "fps": meta.get("fps", 24),
              "pivot": pivot, "pivotUnits": "normalized", "loop": bool(meta.get("loop", False)),
              "width": columns * size, "height": rows * size,
              "worldSize": meta.get("world_canvas_size", meta.get("ortho_scale", 3.6)),
              "sourceFrameSize": source_size, "onFinish": meta.get("on_finish", "remove"),
              "events": meta.get("events", []), "sourceFrameCount": len(frames),
              "alphaMode": "straight", "filter": "linear", "mipmaps": False}
    if any(f.get("sockets") for f in frames):
        result["sockets"] = [{k: normalized(v, source_size) for k, v in f.get("sockets", {}).items()} for f in frames]
    return result


def export_job(job):
    output = job["output"]
    cache = output.with_suffix(".source.json")
    if output.exists() and cache.exists() and read(cache).get("signature") == job["signature"]:
        return {"file": str(output.relative_to(PUBLIC)), "bytes": output.stat().st_size, "cached": True}
    size, cols = job["size"], job["columns"]
    sheet = Image.new("RGBA", (cols * size, job["rows"] * size), (0, 0, 0, 0))
    for i, source in enumerate(job["paths"]):
        with Image.open(source) as master:
            # Pillow RGBA resize uses premultiplied interpolation, protecting transparent edges.
            tile = master.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        sheet.paste(tile, ((i % cols) * size, (i // cols) * size))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, "WEBP", lossless=True, method=0, exact=True)
    write(cache, {"signature": job["signature"], "frames": len(job["paths"]), "sourceRoot": str(SOURCE), "readOnlySource": True})
    return {"file": str(output.relative_to(PUBLIC)), "bytes": output.stat().st_size, "cached": False}


def primary_layer(effects, tiers):
    normal = tiers.get("normal", {}).get("layer_refs", [])
    def score(pair):
        name, effect = pair
        value = 10 if name in normal else 0
        for token, weight in [("projectile", 16), ("impact", 13), ("field", 14), ("aura", 9), ("main", 18), ("wave", 13), ("bolt", 13), ("charge", -15), ("trail", -12), ("stun", -10), ("release", -5)]:
            if token in name:
                value += weight
        return value
    return max(effects.items(), key=score)[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--primary-only", action="store_true", help="Export all characters/arenas and each skill's primary layer only")
    args = parser.parse_args()
    globals()["SOURCE"] = args.source.resolve()
    started = time.time()
    manifest = {"schemaVersion": 1, "characters": {}, "skills": {}, "arenas": [], "icons": {}, "projectiles": {},
                "coordinateSystem": {"projection": "orthographic-top-down", "imageForward": "+Y", "worldForward": "-Y", "pivotUnits": "normalized"},
                "sourceRoot": str(SOURCE), "sourceApproval": "User confirmed latest art/UI/icons in the current development conversation; historical pending labels are retained in source records.",
                "runtimeStatus": "importing", "combatMechanicsValidatedByArt": False}

    character_catalog = read(SOURCE / "assets/character-extra-actions/catalog.json")
    for actor in character_catalog["actors"]:
        key = actor["role"] + "-" + actor["gender"]
        runtime_path = SOURCE / actor["package"] / "05_导出" / actor["candidate_version"] / "runtime.json"
        runtime = read(runtime_path)
        actions = {}
        for action_id, entry in runtime["actions"].items():
            path = SOURCE / entry["animation"]
            meta = read(path)
            actions[action_id] = clip(meta, path.parent, f"art/characters/{key}/{action_id}.webp", priority=0)
            actions[action_id]["sourceMetadata"] = entry["animation"]
        manifest["characters"][key] = actions

    # Exact selected icon versions, including the retained mixed-version first 16.
    icons_path = SOURCE / "00_管理/制作批次/20261028_技能图标_全量236项/交付清单.json"
    icon_entries = read(icons_path)["icons"]
    icons_by_catalog = {}
    for entry in icon_entries:
        identifier = entry.get("catalog_skill_key") or entry["key"]
        target = f"art/icons/{identifier}.webp"
        source = SOURCE / entry["exports"].get("128", entry["exports"]["256"])["path"]
        output = PUBLIC / target
        output.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as image:
            image.convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS).save(output, "WEBP", lossless=True, method=0, exact=True)
        icon = {"image": "/" + target, "assetId": entry["asset_id"], "version": entry["version"], "source": str(source.relative_to(SOURCE)), "sourceSha256": sha(source)}
        manifest["icons"][identifier] = icon
        icons_by_catalog[identifier] = icon

    selected = read(SOURCE / "reports/skill-art-approval-20261028.json")["assets"]
    for entry in selected:
        identifier = entry.get("catalog_id") or entry["skill_id"]
        path = SOURCE / entry["runtime"]
        runtime = read(path)
        effects, tiers = runtime["effects"], runtime.get("tiers", {})
        primary = primary_layer(effects, tiers)
        layers = {}
        for layer_id, effect in effects.items():
            layers[layer_id] = clip(effect, path.parent, f"art/skills/{identifier}/{layer_id}.webp", priority=1 if layer_id == primary else 3)
            layers[layer_id]["role"] = effect.get("role", effect.get("runtime_semantics", layer_id))
        bindings_path = path.parent / "bindings.json"
        binding_data = read(bindings_path) if bindings_path.exists() else {}
        # Source bindings repeat the same 8 actors' full animation tables in each
        # skill. Their runtime sockets already exist once under characters.
        compact_bindings = {k: v for k, v in binding_data.items() if k not in {
            "actor_action_bindings", "actor_cast_bindings",
            "approved_action_socket_references", "approved_actor_action_dependencies"}}
        art = {**layers[primary], "primary": layers[primary], "primaryLayer": primary, "layers": layers,
               "assetId": entry["asset_id"], "version": entry["version"], "coverage": entry["coverage"],
               "sourceRuntime": entry["runtime"], "sourceRuntimeSha256": sha(path), "tiers": tiers,
               "preview": runtime.get("preview", {}), "bindings": compact_bindings,
               "sourceBindings": str(bindings_path.relative_to(SOURCE)),
               "combatImplementation": "Not certified by this art import; see the engine's mechanic coverage report."}
        manifest["skills"][identifier] = art

    # Ordinary attacks have their own approved HD delivery, outside the skill
    # catalog. Preserve all five layers and their sockets/orientation so release
    # effects do not need to be guessed from a skill projectile.
    projectile_sources = [
        ("01_特效/技能特效/ART-20261025-001_法师灵光弹/05_导出/c01_hd_v001/bundle.json",
         {"bolt": ("magic_bolt", "projectile"), "charge": ("magic_charge", "charge"), "muzzle": ("magic_muzzle", "muzzle")}),
        ("06_物品与道具/ART-20261025-002_射手箭矢与投掷球/05_导出/c01_hd_v001/bundle.json",
         {"arrow": ("arrow", "projectile"), "throw_ball": ("throw_ball", "projectile")}),
    ]
    for relative_path, aliases in projectile_sources:
        path = SOURCE / relative_path
        bundle = read(path)
        assert set(bundle["effects"]) == set(aliases), f"Unmapped ordinary-attack layer in {relative_path}"
        for effect_id, effect in bundle["effects"].items():
            key, role = aliases[effect_id]
            manifest["projectiles"][key] = {
                **clip(effect, path.parent, f"art/projectiles/{key}.webp", priority=1),
                "role": effect.get("role", role), "effectId": effect_id,
                "assetId": bundle["asset_id"], "version": bundle["version"],
                "recommendedSocket": effect.get("recommended_socket"),
                "projection": effect.get("projection"),
                "imageForward": effect.get("forward_image_axis"),
                "worldForward": effect.get("forward_world_axis"),
                "sourceMetadata": effect.get("animation_json"),
                "sourceBundle": relative_path, "sourceBundleSha256": sha(path),
                "sourceStatus": effect.get("status", bundle.get("status")),
                "sourceApproval": manifest["sourceApproval"],
            }

    for path in sorted((SOURCE / "04_场景与环境/背景").glob("*/05_导出/c01_hd_v002/scene.json")):
        scene = read(path)
        key = scene["asset_id"].lower()
        base = PUBLIC / f"art/arenas/{key}/base.webp"
        base.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(path.parent / "base.png") as image:
            image.convert("RGBA").resize((1024, 1024), Image.Resampling.LANCZOS).save(base, "WEBP", lossless=True, method=0, exact=True)
        ambient = next(layer for layer in scene["layers"] if layer["id"] == "ambient")
        ambient = {**ambient, "frame_size": scene["frame_size"], "fps": scene["fps"], "pivot": scene["pivot"], "loop": True, "world_canvas_size": 39}
        manifest["arenas"].append({"id": key, "name": scene["title"], "image": "/" + str(base.relative_to(PUBLIC)).replace("\\", "/"),
             "ambient": clip(ambient, path.parent, f"art/arenas/{key}/ambient.webp", size=512, priority=1),
             "worldCanvas": scene["world_canvas"], "playableRect": scene["playable_rect_world_xy"],
             "grid": [scene["grid_columns"], scene["grid_rows"]], "sourceMetadata": str(path.relative_to(SOURCE)), "version": scene["version"]})

    en = read(SOURCE / "outputs/aa02-reference-catalog-20261026/abilities.en.json")
    cn = {entry["id"]: entry for entry in read(SOURCE / "outputs/aa02-reference-catalog-20261026/abilities.cn.json")}
    catalog = read(SOURCE / "config/ability-arena-spell-catalog.json")
    catalog_by_id = {entry["ability_id"]: entry for entry in catalog["spells"]}
    skills = []
    for entry in en:
        identifier = entry["id"]
        translation = cn.get(identifier, {})
        categories = entry.get("categories", [])
        tags = entry.get("tags", [])
        # The production spelling index contains only the 189 visible entries;
        # the captured raw site arrays contain all 230, including 41 hidden ones.
        known = catalog_by_id.get(identifier, {"enabled_on_current_page": False})
        skill = {"id": identifier, "name": translation.get("name", entry["name"]), "nameEn": entry["name"],
                 "description": translation.get("description", entry.get("description", "")), "descriptionEn": entry.get("description", ""),
                 "super": translation.get("superUpgrade", entry.get("superUpgrade", "")), "gaben": translation.get("gabenUpgrade", entry.get("gabenUpgrade", "")),
                 "superEn": entry.get("superUpgrade", ""), "gabenEn": entry.get("gabenUpgrade", ""),
                 "tags": tags, "values": entry.get("values", []), "valuesZh": translation.get("values", []),
                 "cooldowns": entry.get("cooldowns", []), "mana": entry.get("manaCost", []), "categories": categories,
                 "icon": icons_by_catalog[identifier]["image"], "art": identifier,
                 "passive": any("Passive" in category for category in categories), "ultimate": "ultimate" in tags,
                 "visibleInSource": known["enabled_on_current_page"], "catalog": entry, "catalogZh": translation,
                 "translationConflicts": known.get("translation_conflicts", []),
                 "artCoverage": manifest["skills"][identifier]["coverage"], "mechanicsStatus": "requires_engine_coverage_validation"}
        skills.append(skill)
    assert len(skills) == 230 and len({s["id"] for s in skills}) == 230
    # The editable balance workbooks own runtime skills after the first import.
    # Keep fresh source evidence separately; importing art must not reset balance.
    write(ROOT / "references/ability-arena/imported-skills.json", skills)
    if not (ROOT / "config/技能配置.xlsx").exists():
        write(PUBLIC / "data/skills.json", skills)
    write(PUBLIC / "data/assets.json", manifest)
    write(PUBLIC / "data/provenance.json", {"sourceRoot": str(SOURCE), "catalogSource": catalog["source_page"], "catalogPatch": catalog["source_patch"],
          "sourceCatalogSha256": sha(SOURCE / "outputs/aa02-reference-catalog-20261026/abilities.en.json"), "catalogCount": 230,
          "visibleCount": sum(s["visibleInSource"] for s in skills), "hiddenCount": sum(not s["visibleInSource"] for s in skills),
          "selectedSkillArtCount": len(selected), "iconCount": len(icon_entries), "artSourceManifestSha256": sha(SOURCE / "reports/skill-art-approval-20261028.json"),
          "characterCount": len(manifest["characters"]), "characterClipCount": sum(len(x) for x in manifest["characters"].values()),
          "projectileClipCount": len(manifest["projectiles"]),
          "projectileSources": [{"path": path, "sha256": sha(SOURCE / path)} for path, _ in projectile_sources],
          "artFrameCount": sum(len(j["paths"]) for j in JOBS), "sourceFilesModified": False,
          "masterPolicy": "Original PNG masters retained. Compact lossless WebP atlases are new runtime derivatives, not replacements.",
          "mechanicPolicy": "Full catalog text is retained. Visual layers do not prove combat correctness. Base-only art and unresolved tier assumptions remain identified."})
    print(f"MANIFEST_READY: {len(skills)} skills, {len(JOBS)} animation clips, {len(icon_entries)} icons", flush=True)
    jobs = sorted(JOBS, key=lambda job: job["priority"])
    if args.primary_only:
        jobs = [job for job in jobs if job["priority"] < 3]
    results, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        pending = {executor.submit(export_job, job): job for job in jobs}
        for future in concurrent.futures.as_completed(pending):
            try:
                results.append(future.result())
            except Exception as exc:
                errors.append({"file": str(pending[future]["output"]), "error": repr(exc)})
            count = len(results) + len(errors)
            if count % 100 == 0 or count == len(jobs):
                print(f"EXPORT {count}/{len(jobs)} errors={len(errors)} elapsed={time.time()-started:.1f}s", flush=True)
    verified = 0
    for job in jobs:
        try:
            with Image.open(job["output"]) as image:
                image.load()
                assert image.mode == "RGBA", f"Expected transparent RGBA: {image.mode}"
                assert image.size == (job["columns"] * job["size"], job["rows"] * job["size"])
                # Check both sequence endpoints against separately resampled masters.
                for index in sorted({0, len(job["paths"]) - 1}):
                    x, y = (index % job["columns"]) * job["size"], (index // job["columns"]) * job["size"]
                    actual = image.crop((x, y, x + job["size"], y + job["size"]))
                    with Image.open(job["paths"][index]) as master:
                        expected = master.convert("RGBA").resize((job["size"], job["size"]), Image.Resampling.LANCZOS)
                    assert actual.tobytes() == expected.tobytes(), "Lossless sequence endpoint mismatch"
            verified += 1
        except Exception as exc:
            errors.append({"file": str(job["output"]), "verificationError": repr(exc)})
    manifest["runtimeStatus"] = "failed" if errors else ("primary-layers-exported" if args.primary_only else "complete")
    write(PUBLIC / "data/assets.json", manifest)
    files = [p for p in (PUBLIC / "art").rglob("*.webp")]
    stats = {"status": manifest["runtimeStatus"], "elapsedSeconds": round(time.time() - started, 2), "files": len(files), "totalBytes": sum(p.stat().st_size for p in files),
             "animationClips": len(results), "frames": sum(len(j["paths"]) for j in jobs), "errors": errors,
             "cachedAtlases": sum(result["cached"] for result in results),
             "generatedAtlases": sum(not result["cached"] for result in results),
             "projectileClips": len(manifest["projectiles"]),
             "verifiedAtlases": verified, "validation": "All atlases decoded; dimensions, RGBA, first and last frames compared byte-for-byte to independently resized source masters.",
             "maximumAtlasDimension": max(max(j["columns"], j["rows"]) * j["size"] for j in jobs),
             "characterFrameSize": 192, "skillFrameSize": 192, "arenaAmbientFrameSize": 512,
             "loadingPolicy": "Load only current arena, active role/action clips, and active skills. Never preload this entire manifest into GPU memory."}
    write(PUBLIC / "data/import-report.json", stats)
    print(json.dumps(stats, ensure_ascii=False), flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
