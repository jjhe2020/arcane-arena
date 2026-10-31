"""Measure runtime atlas alpha radii, without changing approved image pixels.

These are presentation measurements in cell-width units, never gameplay values.
Re-run after importing a newer atlas for any of the named ring/burst layers.
"""
from pathlib import Path
from PIL import Image
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parent.parent
assets = json.loads((ROOT / 'public/data/assets.json').read_text(encoding='utf-8'))
layers = {
    'custom_tidehunter_ravage': ['eruption', 'return', 'crest'],
    'razor_plasma_field': ['wave'],
    'custom_sandking_epicenter': ['wave'],
    'custom_crystal_maiden_freezing_field': ['ice_burst'],
    'void_spirit_resonant_pulse': ['pulse'],
    'custom_ancient_apparition_ice_blast': ['burst'],
    'mars_arena_of_blood': ['arena_wall'],
}
destination = ROOT / 'src/radial-art-calibration.json'
# Keep calibrations introduced by other independent visual subsystems.
result = json.loads(destination.read_text(encoding='utf-8')) if destination.exists() else {}
for skill, names in layers.items():
    for name in names:
        clip = assets['skills'][skill]['layers'][name]
        path = ROOT / 'public' / clip['image'].lstrip('/')
        image = Image.open(path).convert('RGBA')
        width, height = clip['frameWidth'], clip['frameHeight']
        px, py = clip.get('pivot', [.5, .5])
        means, inner, outer = [], [], []
        for index in range(clip['frames']):
            x, y = index % clip['columns'] * width, index // clip['columns'] * height
            alpha = image.crop((x, y, x + width, y + height)).getchannel('A')
            samples = [(math.hypot((i % width + .5) / width - px,
                                   (i // width + .5) / height - py), a)
                       for i, a in enumerate(alpha.getdata()) if a >= 12]
            weight = sum(a for _, a in samples)
            means.append(round(sum(r * a for r, a in samples) / weight, 6) if weight else 0)
            cumulative, radius, inner_radius = 0, 0, None
            for radius, a in sorted(samples):
                cumulative += a
                if inner_radius is None and cumulative >= weight * .05:
                    inner_radius = radius
                if cumulative >= weight * .95:
                    break
            inner.append(round(inner_radius, 6) if inner_radius is not None and weight else 0)
            outer.append(round(radius, 6) if weight else 0)
        result[f'{skill}/{name}'] = {'atlasSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                    'meanRadius': means, 'innerRadius05': inner, 'outerRadius95': outer}
destination.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Measured {len(result)} approved runtime atlas layers; no image files changed.')
