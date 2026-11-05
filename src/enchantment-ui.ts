import './enchantment-ui.css';
import {ENCHANTMENT_REDRAW_PRICE, ENCHANTMENT_STATS, enchantmentCoefficient, enchantmentEntries, getEnchantment} from './hero-enchantments';
import type {Hero} from './model';

const format = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2, signDisplay: 'always'});
type Enchantment = NonNullable<ReturnType<typeof getEnchantment>>;

function badge(enchantment: Enchantment, pending = false) {
  return `<span class="enchantment-badge" data-grade="${enchantment.grade}">${pending ? '✧' : ''}${enchantment.grade}</span>`;
}

function effects(enchantment: Enchantment) {
  return `<ul class="enchantment-effects">${enchantmentEntries(enchantment.effects).map(([stat, amount]) => {
    const value = format.format(stat === 'skillArea' ? amount * 100 : amount);
    const unit = stat === 'attackInterval' ? ' 秒' : stat === 'skillArea' ? '%' : '';
    return `<li>${ENCHANTMENT_STATS[stat].label}<span class="${enchantmentCoefficient(stat, amount) > 0 ? 'enchantment-up' : 'enchantment-down'}">${value}${unit}</span></li>`;
  }).join('')}</ul>`;
}

export function enchantmentRosterBadge(hero: Hero) {
  const enchantment = getEnchantment(hero.enchantmentId);
  return enchantment ? `<span class="hero-enchantment-badge" title="${hero.enchantmentChoice ? '附魔待选' : enchantment.name}">${badge(enchantment, Boolean(hero.enchantmentChoice))}</span>` : '';
}

export function enchantmentInspector(enchantmentId: string | undefined, planningHero: Hero, canEdit: boolean) {
  const current = getEnchantment(enchantmentId);
  const planning = getEnchantment(planningHero.enchantmentId);
  if (!current && (!canEdit || !planning)) return '';
  return `<div class="enchantment-inspector">${current ? `<div class="enchantment-heading">${badge(current)}<strong>${current.name}</strong></div>${effects(current)}` : ''}${canEdit && planning ? `<button class="text-button" data-action="enchantHero">${planningHero.enchantmentChoice ? '选择附魔 →' : '管理附魔 →'}</button>` : ''}</div>`;
}

export function enchantmentDialog(hero: Hero, index: number, gold: number) {
  const current = getEnchantment(hero.enchantmentId);
  if (!current) return undefined;
  const choice = hero.enchantmentChoice;
  const owned = `<section class="enchantment-current"><div class="enchantment-heading">${badge(current)}<strong>${current.name}</strong><small>当前附魔</small></div>${effects(current)}</section>`;
  const options = choice ? `<div class="enchantment-options">${choice.options.map(id => {
    const candidate = getEnchantment(id)!;
    return `<button class="enchantment-option" data-enchant-hero="${index}" data-enchant-option="${id}"><span class="enchantment-heading">${badge(candidate)}<strong>${candidate.name}</strong>${id === current.id ? '<small>保留</small>' : ''}</span>${effects(candidate)}</button>`;
  }).join('')}</div>` : '';
  const note = choice?.mode === 'arrival' ? '新英雄可免费选一个。开战前如未选择，将保留当前的随机附魔。' : choice?.mode === 'redraw' ? '每个候选位置独立以 20% 概率抽取各等级。请从这四个候选中选一个以完成重选。' : `花费 ${ENCHANTMENT_REDRAW_PRICE} 金币，可从四个全新候选中选择。当前附魔随英雄保留，更换职业或皮肤时继续生效。`;
  const redraw = !choice ? `<button class="ready-button" data-enchant-redraw="${index}" ${gold < ENCHANTMENT_REDRAW_PRICE ? 'disabled' : ''}>重选附魔 · ${ENCHANTMENT_REDRAW_PRICE} ◉</button>` : '';
  return {body: `${owned}<p class="info-note">${note}</p>${options}`, footer: `${redraw}<button data-action="close">返回</button>`};
}
