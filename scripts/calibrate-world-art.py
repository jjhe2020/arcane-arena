"""Measure runtime atlas alpha radii, without changing approved image pixels.

These are presentation measurements in cell-width units, never gameplay values.
Re-run after importing a newer atlas for any of these five ring/burst layers.
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
}
result = {}
for skill, names in layers.items():
    for name in names:
        clip = assets['skills'][skill]['layers'][name]
        path = ROOT / 'public' / clip['image'].lstrip('/')
        image = Image.open(path).convert('RGBA')
        width, height = clip['frameWidth'], clip['frameHeight']
        px, py = clip.get('pivot', [.5, .5])
        means, outer = [], []
        for index in range(clip['frames']):
            x, y = index % clip['columns'] * width, index // clip['columns'] * height
            alpha = image.crop((x, y, x + width, y + height)).getchannel('A')
            samples = [(math.hypot((i % width + .5) / width - px,
                                   (i // width + .5) / height - py), a)
                       for i, a in enumerate(alpha.getdata()) if a >= 12]
            weight = sum(a for _, a in samples)
            means.append(round(sum(r * a for r, a in samples) / weight, 6) if weight else 0)
            cumulative, radius = 0, 0
            for radius, a in sorted(samples):
                cumulative += a
                if cumulative >= weight * .95:
                    break
            outer.append(round(radius, 6) if weight else 0)
        result[f'{skill}/{name}'] = {'atlasSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                    'meanRadius': means, 'outerRadius95': outer}
(ROOT / 'src/radial-art-calibration.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Measured {len(result)} approved runtime atlas layers; no image files changed.')
