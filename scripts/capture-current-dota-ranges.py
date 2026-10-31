"""Explicit research capture of Valve's current public datafeed.

Never run from build/CI: the audit consumes the committed dated snapshot and
does not silently migrate the AA/historical game to current Dota rules.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://www.dota2.com/datafeed/'
def fetch(endpoint):
    url = BASE + endpoint
    request = urllib.request.Request(url, headers={'User-Agent': 'ArcaneArena-RangeResearch/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
        status = response.status
    parsed = json.loads(raw)
    return parsed, {'url': url, 'httpStatus': status, 'accessedAt': datetime.now(timezone.utc).isoformat(), 'rawResponseSha256': hashlib.sha256(raw).hexdigest()}

listing, list_source = fetch('herolist?language=english')
heroes = listing['result']['data']['heroes']
records, errors = [], []
def capture(hero):
    payload, source = fetch(f"herodata?language=english&hero_id={hero['id']}")
    detail = payload['result']['data']['heroes'][0]
    abilities = []
    for ability in detail.get('abilities', []):
        abilities.append({key: ability[key] for key in ['id', 'name', 'name_loc', 'max_level', 'behavior', 'target_team', 'target_type', 'cast_ranges', 'cast_points', 'channel_times', 'special_values', 'ability_is_innate', 'ability_is_granted_by_scepter', 'ability_is_granted_by_shard'] if key in ability})
    return {'hero': hero, 'source': source, 'abilities': abilities}

with ThreadPoolExecutor(max_workers=5) as pool:
    futures = {pool.submit(capture, hero): hero for hero in heroes}
    for future in as_completed(futures):
        hero = futures[future]
        try:
            records.append(future.result())
        except Exception as error:
            errors.append({'hero': hero, 'error': str(error)})
if errors:
    raise RuntimeError(json.dumps(errors, ensure_ascii=False))
records.sort(key=lambda record: record['hero']['id'])
canonical = json.dumps(records, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
result = {'schemaVersion': 1, 'capturedAt': datetime.now(timezone.utc).isoformat(), 'patch': None, 'patchPolicy': 'The official response does not identify a patch number; none is inferred.', 'policy': 'Current Valve data is comparison only. Existing user/AA/historical runtime rules are unchanged.', 'herolistSource': list_source, 'allHeroesAttempt': {'url': BASE+'herodata?language=english&hero_id=0', 'resultStatus': 8, 'note': 'No all-hero payload; fetched each hero from the official herolist with at most five simultaneous requests.'}, 'heroCount': len(records), 'abilityCount': sum(len(record['abilities']) for record in records), 'retainedRecordsCanonicalSha256': hashlib.sha256(canonical).hexdigest(), 'records': records, 'errors': errors}
destination = ROOT / 'references/dota-wiki/r13-current-valve-range-snapshot.json'
destination.write_bytes((json.dumps(result, indent=2, ensure_ascii=False)+'\n').encode('utf-8'))
print(json.dumps({'heroes': result['heroCount'], 'abilities': result['abilityCount'], 'snapshot': str(destination), 'sha256': result['retainedRecordsCanonicalSha256']}))
