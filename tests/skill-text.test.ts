import {describe,it,expect} from 'vitest';
import data from '../public/data/skills.json';
import type {SkillDefinition} from '../src/model';
import {upgradeText,originalRules} from '../src/skill-text';
describe('规则显示的已知译文冲突',()=>{
 it('时间结界Gaben说明降低而不是中文快照的加速，保留英文原文可查',()=>{const def=(data as SkillDefinition[]).find(d=>d.id==='custom_faceless_void_chronosphere')!;expect(def.gaben).toContain('+550%');expect(upgradeText(def,'gaben')).toContain('降低');expect(upgradeText(def,'gaben')).toContain('攻击');expect(originalRules(def)).toContain('-550%');});
 it('无已知冲突的技能保留现有文本，不丢失Super与Gaben',()=>{const def=(data as SkillDefinition[]).find(d=>d.id==='custom_luna_moon_glaive')!;expect(upgradeText(def,'super')).toBe(def.super);expect(upgradeText(def,'gaben')).toBe(def.gaben);expect(originalRules(def)).toContain(String(def.gabenEn));});
});
