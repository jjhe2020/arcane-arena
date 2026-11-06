import {readFileSync} from 'node:fs';
import type {SkillBalance} from '../src/config';
import type {SkillDefinition} from '../src/model';
import balance from '../config/reference/r15-balance-changes.json';

// Source acceptance tests pin pre-tuning numbers while running the real
// combat implementation. Gameplay tests load the current catalog directly.
export function readReferenceSkillCatalog(): SkillDefinition[] {
  const catalog = JSON.parse(readFileSync(new URL('../public/data/skills.json', import.meta.url), 'utf8')) as SkillDefinition[];
  const definitions = new Map(catalog.map(definition => [definition.id, definition]));
  const restored = new Set<SkillDefinition>();
  for (const change of balance.changes) {
    const definition = definitions.get(change.id)!;
    const levels = definition.balanceLevels as Record<string, SkillBalance>;
    const row = levels[change.points];
    const [group, key] = change.field.split(':');
    if (group === 'params' || group === 'program') row[group][key] = change.from;
    else if (group === 'cooldown' || group === 'mana') row[group] = change.from;
    else throw new Error(`Unknown reference balance field ${change.field}`);
    restored.add(definition);
  }
  for (const definition of restored) {
    const levels = definition.balanceLevels as Record<string, SkillBalance>;
    const base = [levels[1], levels[2], levels[3]];
    definition.values = definition.values.map(text => {
      const separator = text.indexOf(':');
      const key = text.slice(0, separator).trim().toUpperCase();
      if (separator < 0 || base[0].params[key] === undefined) return text;
      const values = base.map(row => row.params[key]);
      return `${key}: ${values.every(value => value === values[0]) ? values[0] : values.join(' / ')}`;
    });
    definition.cooldowns = base.map(row => row.cooldown);
    definition.mana = base.map(row => row.mana);
    definition.balanceInputSignature = JSON.stringify([definition.values, definition.cooldowns, definition.mana]);
  }
  return catalog;
}
