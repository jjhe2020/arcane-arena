import { describe, expect, it } from 'vitest';
import rawSkills from '../public/data/skills.json';
import { analyzeBalance } from '../scripts/balance-analysis';
import { createSamplingDesign, decodeOutcome, POINTS } from '../scripts/balance-design';
import type { SkillDefinition } from '../src/model';
import { skillModelPreference } from '../src/skill-model-preferences';

const definitions = rawSkills as SkillDefinition[];

describe('离线平衡实验', () => {
  it('每项技能有四模型优先级，五名英雄按等级优先获得合法配装', () => {
    const design = createSamplingDesign(definitions, 54321);
    expect(skillModelPreference('custom_axe_counter_helix')[0]).toBe('tank');
    expect(skillModelPreference('custom_sniper_take_aim')[0]).toBe('archer');
    expect(skillModelPreference('custom_phantom_assassin_coup_de_grace')[0]).toBe('assassin');
    expect(skillModelPreference('custom_silencer_glaives_of_wisdom')[0]).toBe('mage');
    for (const {id} of definitions) expect(new Set(skillModelPreference(id)).size).toBe(4);
    for (let index = 0; index < 10; index++) {
      const {a, b, duplicateModel} = design.drawMatch(index);
      for (const [side, team] of [a, b].entries()) {
        const player = design.buildPlayer(team, duplicateModel, side);
        expect(new Set(player.heroes.map(hero => hero.role)).size).toBe(4);
        expect(new Set(player.heroes.flatMap(hero => hero.skills.map(skill => skill?.id))).size).toBe(20);
        for (const hero of player.heroes) {
          expect(hero.skills).toHaveLength(4);
          const levels = hero.skills.map(skill => skill!.points);
          expect(levels).toEqual([...levels].sort((left, right) => right - left));
          expect(hero.skills.filter(skill => design.skills.find(def => def.id === skill?.id)?.ultimate)).toHaveLength(1);
        }
      }
    }
  });

  it('按可独立访问的样本序号复现阵容并均匀覆盖每个等级', () => {
    const design = createSamplingDesign(definitions, 20261105);
    const reversed = createSamplingDesign([...definitions].reverse(), 20261105);
    expect(design.drawMatch(984)).toEqual(reversed.drawMatch(984));
    const samples = 3_000;
    const appearances = new Uint32Array(design.skills.length * POINTS.length);
    for (let index = 0; index < samples; index++) {
      const {a, b} = design.drawMatch(index);
      for (const feature of [...a, ...b]) appearances[feature]++;
    }
    const ultimateCount = design.skills.filter(skill => skill.ultimate).length;
    appearances.forEach((count, feature) => {
      const ultimate = design.skills[Math.floor(feature / POINTS.length)].ultimate;
      const average = samples * 2 / POINTS.length * (ultimate ? 5 / ultimateCount : 15 / (design.skills.length - ultimateCount));
      expect(Math.abs(count - average)).toBeLessThan(average * 0.12);
    });
  });

  it('用镜像场次计数胜率、平局与技能组合残差', () => {
    const design = createSamplingDesign(definitions, 123456);
    expect(decodeOutcome(2)).toEqual([0, 2]);
    expect(() => decodeOutcome(9)).toThrow();
    const analysis = analyzeBalance(design, Uint8Array.of(4, 4, 4, 4));
    expect(analysis.overview).toMatchObject({pairs: 4, battles: 8, draws: 8, firstSideWins: 0});
    expect(analysis.skillLevels.reduce((sum, row) => sum + row.battles, 0)).toBe(320);
    expect(analysis.skillLevels.find(row => row.pairs)).toMatchObject({winRate: 0, winScore: 0.5, effect: 0, flagged: false});
    for (const pairs of [analysis.sameHeroPairs, analysis.sameTeamPairs, analysis.opposedPairs]) {
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs.every(row => row.effect === 0 && row.winScore === 0.5 && !row.flagged)).toBe(true);
    }
  });

  it('对手技能组合按报告中的第一项统一镜像胜负方向', () => {
    const design = createSamplingDesign(definitions, 24680);
    const outcomes = Uint8Array.from({length: 1_200}, (_, index) => {
      const {a, b} = design.drawMatch(index);
      const left = a.map(feature => Math.floor(feature / POINTS.length));
      const right = b.map(feature => Math.floor(feature / POINTS.length));
      const firstWins = left.includes(0) && right.includes(1);
      const firstLoses = left.includes(1) && right.includes(0);
      return firstWins === firstLoses ? 4 : firstWins ? 8 : 0;
    });
    const {opposedPairs} = analyzeBalance(design, outcomes);
    const pair = opposedPairs.find(row => row.first === design.skills[0].id && row.second === design.skills[1].id);
    expect(pair).toMatchObject({winScore: 1, provisional: true, flagged: false});
    expect(pair!.pairs).toBeGreaterThan(0);
    expect(pair!.effect).toBeGreaterThan(0.35);
  });
});
