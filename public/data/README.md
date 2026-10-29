# Runtime art and catalog contract

`skills.json` contains all 230 definitions from the Ability Arena English site
snapshot: 189 visible and 41 hidden definitions. Exact IDs, including `custom_`
prefixes, are retained. `catalog` / `catalogZh` preserve source strings and
numerical arrays. Chinese labels are display text; the captured English data is
the numeric authority. Imported definitions do not certify combat implementation.

`assets.json` maps eight `role-gender` character keys to all thirteen actions.
Every `AnimationClip` is a regular, row-major, transparent WebP atlas. `frames`
excludes unused cells; `columns`, `frameWidth`, and `frameHeight` define cells.
`pivot` and per-frame `sockets` use normalized image coordinates with the origin
at top left. Source characters face image-down. `worldSize` is the full canvas
width in source world units, including transparent margins. Preserve the pivot
when rotating. Linear sampling must clamp to the current cell; disable mipmaps.

`skills[id]` contains every exported source layer, tier composition records and
compact binding metadata. `primary` is one representative full animation for
the initial renderer, also flattened at the skill entry root. The layer choice
is a display fallback, not a full implementation of that skill's choreography.
Read `tiers`, `layers`, and `bindings` for layered integration; unresolved source
interpretations and base-only upgrade coverage remain explicitly marked.

Arena entries have a 1024px static `image`, a full 48-frame 512px `ambient` clip,
and their original world/playable rectangles. Character and skill clips use
192px frames, preserving every frame from the selected original sequences.
All 236 icon deliveries are included; the 230 game definitions point to exact
matching icons. Six extra project effects remain available in the art manifest.

Load the current arena and active clips on demand; the complete library is not
a preload list. Release unused GPU textures. `provenance.json` records selected
source versions and `import-report.json` records byte totals and validation.

`mobileAtlases` contains the complete 128px character/skill and 256px ambient
frame variants. The renderer and hero portraits select these on narrow screens;
desktop atlases remain separate. Generate these after the main art import with
`scripts/build-mobile-atlases.py`. Every frame is cropped and resized separately
to avoid sampling neighboring frames. `mobile-import-report.json` records the
derived counts, bytes, dimensions and endpoint verification.

Regenerate with the Pillow-enabled source-project Python:

```powershell
& 'E:\codex\gameArtPipeline\.venv\Scripts\python.exe' -X utf8 scripts/import-assets.py
```

The source project is read-only. The current development conversation approved
its latest artwork, superseding historical pending labels without rewriting
source records. Lossless WebP here refers to the resized runtime derivatives;
the original 1024px/1536px production masters remain unchanged.
