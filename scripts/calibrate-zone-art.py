"""Measure the visible 95%-alpha radius of actual persistent area layers.

This is presentation calibration, not a gameplay/source radius. The generated
JSON is committed; ordinary builds do not require Pillow, NumPy or source art.
"""
from pathlib import Path
from PIL import Image
import hashlib
import json
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
assets = json.loads((ROOT / 'public/data/assets.json').read_text(encoding='utf-8'))
roles = set('area area_air area_overlay channel_area passive_area ground ground_area ground_sustain ground_field ground_damage ground_portal area_status area_mark world_smoke remnant_aura ghost_aura'.split())
result = {}
for skill, art in assets['skills'].items():
    for name, clip in art.get('layers', {}).items():
        if clip.get('role') not in roles:
            continue
        path = ROOT / 'public' / clip['image'].lstrip('/')
        image = Image.open(path).convert('RGBA')
        width, height = clip['frameWidth'], clip['frameHeight']
        px, py = clip.get('pivot', [.5, .5])
        yy, xx = np.indices((height, width))
        radii = np.hypot((xx + .5) / width - px, (yy + .5) / height - py).ravel()
        order = np.argsort(radii)
        measured = []
        for index in range(clip['frames']):
            x, y = index % clip['columns'] * width, index // clip['columns'] * height
            alpha = np.asarray(image.crop((x, y, x + width, y + height)).getchannel('A')).ravel()
            weights = np.where(alpha >= 12, alpha, 0).astype(float)[order]
            if weights.sum() > 0:
                cutoff = int(np.searchsorted(np.cumsum(weights), weights.sum() * .95))
                measured.append(float(radii[order[cutoff]]))
        if measured:
            result[clip['image']] = {'outerRadius95': round(max(measured), 6), 'atlasSha256': hashlib.sha256(path.read_bytes()).hexdigest()}
(ROOT / 'src/zone-art-calibration.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Measured {len(result)} persistent area layers; no asset pixels changed.')
