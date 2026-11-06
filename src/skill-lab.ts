import {skillBalanceHTML} from './balance-presentation';
import {FIXED_STEP} from './combat';
import type {AssetManifest, DamageAmounts, SkillDefinition} from './model';
import {GRANTED_SKILL_DEFINITIONS} from './skill-effects';
import {skillIconURL} from './skill-icons';
import {SkillLabRenderer} from './skill-lab-renderer';
import {
  SKILL_LAB_DUMMY_ARMOR, SKILL_LAB_DUMMY_HEALTH, SKILL_LAB_DUMMY_MAGIC_RESIST, SKILL_LAB_HERO_LEVEL,
  createSkillLabCase, skillLabDamage, stepSkillLabCase, type SkillLabCase, type SkillLabPoints,
} from './skill-lab-simulation';

const PAGE_SIZE = 10;
const ranks = [[3, '基础'], [6, 'Super'], [9, 'Gaben']] as const;
const modeLabels: Record<SkillLabCase['mode'], string> = {
  passive: '被动触发',
  self: '自身施放',
  ally: '对自身施放',
  point: '瞄准 ① 的位置',
  unit: '锁定木桩 ①',
  unavailable: '当前布置下缺少触发条件',
};
const dummyLabels = ['①', '②', '③'];
const format = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => (
  {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]!
));
const find = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface DamageCells {
  skill: HTMLOutputElement;
  basic: HTMLOutputElement;
}

interface Card {
  definition: SkillDefinition;
  points: SkillLabPoints;
  scenario: SkillLabCase;
  canvas: HTMLCanvasElement;
  state: HTMLElement;
  setup: HTMLElement;
  damage: DamageCells[];
  visible: boolean;
  dirty: boolean;
  lastDrawTime: number;
}

function pageURL(page: number) {
  return `/skill-lab.html?page=${page}`;
}

function pageLink(id: string, target: number, total: number) {
  const link = find<HTMLAnchorElement>(id);
  if (target >= 1 && target <= total) link.href = pageURL(target);
  else link.setAttribute('aria-disabled', 'true');
}

async function load<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取 ${url}（HTTP ${response.status}）`);
  return response.json();
}

function cardMarkup(definition: SkillDefinition, points: number, label: string) {
  return `<article class="skill-case" data-points="${points}">
    <header class="case-heading"><strong>Lv ${points} · ${label}</strong><span class="case-state"></span></header>
    <div class="case-content">
      <canvas aria-label="${escape(definition.name)} ${points} 点技能演示"></canvas>
      <aside class="damage-panel">
        <table aria-label="${points} 点各木桩累计实际伤害">
          <caption>木桩累计伤害</caption>
          <thead><tr><th scope="col">桩</th><th scope="col">技能</th><th scope="col">普攻</th></tr></thead>
          <tbody>${dummyLabels.map((label, index) => `<tr class="damage-row" data-dummy="${index + 1}">
            <th scope="row">${label}</th><td><output data-skill-damage>0</output></td><td><output data-basic-damage>0</output></td>
          </tr>`).join('')}</tbody>
        </table>
      </aside>
    </div>
    <p class="case-setup" hidden></p>
  </article>`;
}

function groupMarkup(definition: SkillDefinition, index: number) {
  const icon = skillIconURL(definition);
  const title = `labSkill${index}`;
  return `<section class="skill-group" data-skill="${escape(definition.id)}" aria-labelledby="${title}">
    <header class="skill-group-header">
      <span class="skill-index">${String(index).padStart(3, '0')}</span>
      ${icon ? `<img class="skill-icon" src="${escape(icon)}" loading="lazy" alt="">` : ''}
      <div class="skill-heading"><h2 id="${title}">${escape(definition.name)}</h2><span class="skill-en" lang="en">${escape(definition.nameEn)}</span>
      <p class="skill-mode">${definition.passive ? '被动' : '主动'} · ${definition.ultimate ? '终极技能' : '基础技能'}</p></div>
    </header>
    <details class="skill-description"><summary>技能说明与配置数值</summary><div></div></details>
    <div class="skill-ranks">${ranks.map(([points, label]) => cardMarkup(definition, points, label)).join('')}</div>
  </section>`;
}

function setDamage(output: HTMLOutputElement, amount: number, types: DamageAmounts) {
  output.value = format.format(amount);
  output.title = `累计 ${amount.toFixed(3)} · 物理 ${types.physical.toFixed(3)} · 魔法 ${types.magical.toFixed(3)} · 纯粹 ${types.pure.toFixed(3)}`;
}

function updateCard(card: Card) {
  for (const [index, damage] of skillLabDamage(card.scenario).entries()) {
    setDamage(card.damage[index].skill, damage.skill, damage.skillTypes);
    setDamage(card.damage[index].basic, damage.basic, damage.basicTypes);
  }
}

function updateSetup(card: Card) {
  const {mode, selfRadius, startDistance, setupNote} = card.scenario;
  card.state.textContent = modeLabels[mode];
  card.state.title = `① 开场距离 ${Math.round(startDistance * 100)}${selfRadius === undefined ? '' : ` · 范围半径 ${Math.round(selfRadius * 100)}`}`;
  card.setup.hidden = !setupNote;
  card.setup.textContent = setupNote ?? '';
}

async function initialize() {
  const [catalog, assets] = await Promise.all([load<SkillDefinition[]>('/data/skills.json'), load<AssetManifest>('/data/assets.json')]);
  const definitions = [...GRANTED_SKILL_DEFINITIONS, ...catalog];
  const total = Math.ceil(catalog.length / PAGE_SIZE);
  const requested = Number(new URLSearchParams(location.search).get('page'));
  const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(total, requested)) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const skills = catalog.slice(from, from + PAGE_SIZE);
  document.title = `技能实验场 · 第 ${page} 页 · 秘境竞技场`;

  const picker = find<HTMLSelectElement>('labPage');
  for (let number = 1; number <= total; number++) picker.add(new Option(`第 ${number} / ${total} 页`, String(number), false, number === page));
  picker.addEventListener('change', () => location.assign(pageURL(Number(picker.value))));
  pageLink('labPrevious', page - 1, total);
  pageLink('labNext', page + 1, total);
  pageLink('labBottomPrevious', page - 1, total);
  pageLink('labBottomNext', page + 1, total);
  find('labPageSummary').textContent = `第 ${page} / ${total} 页`;
  find('labToolbar').hidden = false;
  find('labBottom').hidden = false;
  const notice = find('labNotice');
  notice.textContent = `全图鉴 ${catalog.length} 个技能 · 本页 ${skills.length} 个技能 / ${skills.length * ranks.length} 场。① 是唯一初始瞄准目标。英雄等级固定为 ${SKILL_LAB_HERO_LEVEL}，木桩基准生命 ${SKILL_LAB_DUMMY_HEALTH}、护甲 ${SKILL_LAB_DUMMY_ARMOR}、魔抗 ${SKILL_LAB_DUMMY_MAGIC_RESIST * 100}%。伤害按实战账本归因，强化效果并入普攻时计入普攻列。`;

  const groups = find('labSkills');
  groups.innerHTML = skills.map((definition, index) => groupMarkup(definition, from + index + 1)).join('');
  const cards = [...groups.querySelectorAll<HTMLElement>('.skill-group')].flatMap((group, index): Card[] => {
    const definition = skills[index];
    const details = group.querySelector('details')!;
    details.addEventListener('toggle', () => {
      const description = details.querySelector('div')!;
      if (details.open && !description.hasChildNodes()) {
        description.innerHTML = `<p>${escape(definition.description)}</p>${skillBalanceHTML(definition)}`;
      }
    });
    return [...group.querySelectorAll<HTMLElement>('.skill-case')].map((entry, rank) => {
      const points = ranks[rank][0];
      return {
        definition, points,
        scenario: createSkillLabCase(definition, points, definitions),
        canvas: entry.querySelector('canvas')!,
        state: entry.querySelector('.case-state')!,
        setup: entry.querySelector('.case-setup')!,
        damage: [...entry.querySelectorAll('.damage-row')].map(row => ({
          skill: row.querySelector('[data-skill-damage]')!,
          basic: row.querySelector('[data-basic-damage]')!,
        })),
        visible: false, dirty: true, lastDrawTime: 0,
      };
    });
  });
  const duration = Math.max(...cards.map(card => card.scenario.duration));
  notice.textContent += ` 每场观察 ${duration} 秒，主动技能成功施放一次后观察其后续效果。`;
  const renderer = new SkillLabRenderer(assets, definitions);
  const play = find<HTMLButtonElement>('labPlay');
  const replay = find<HTMLButtonElement>('labReplay');
  const speed = find<HTMLSelectElement>('labSpeed');
  const clock = find<HTMLOutputElement>('labTime');
  let tick = 0;
  let elapsed = 0;
  let playing = false;
  let accumulator = 0;
  let previous = 0;
  let lastRender = 0;
  let lastUpdate = 0;
  let frameHandle = 0;

  const cardByCanvas = new Map(cards.map(card => [card.canvas, card]));
  const prepare = async (card: Card) => {
    await renderer.prepare(card.canvas, card.scenario.battle, card.scenario.selfRadius);
    card.dirty = true;
  };
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = cardByCanvas.get(entry.target as HTMLCanvasElement)!;
      if (entry.isIntersecting && !card.visible) void prepare(card).catch(showError);
      card.visible = entry.isIntersecting;
      card.dirty = true;
    }
  });
  const resize = new ResizeObserver(entries => {
    for (const entry of entries) cardByCanvas.get(entry.target as HTMLCanvasElement)!.dirty = true;
  });

  function refreshClock() {
    clock.dataset.time = String(elapsed);
    clock.value = `${elapsed.toFixed(1)} / ${duration.toFixed(0)} 秒`;
    play.disabled = elapsed >= duration;
    play.textContent = elapsed >= duration ? '已结束' : playing ? '暂停' : '继续';
  }

  function restart() {
    renderer.clear();
    for (const card of cards) {
      card.scenario = createSkillLabCase(card.definition, card.points, definitions);
      card.lastDrawTime = 0;
      card.dirty = true;
      updateCard(card);
      if (card.visible) void prepare(card).catch(showError);
    }
    tick = elapsed = accumulator = 0;
    playing = true;
    refreshClock();
  }

  function frame(now: number) {
    const realStep = previous ? Math.min((now - previous) / 1000, .2) : 0;
    previous = now;
    if (playing) {
      accumulator += realStep * Number(speed.value);
      while (accumulator >= FIXED_STEP && elapsed < duration) {
        for (const card of cards) stepSkillLabCase(card.scenario, FIXED_STEP);
        elapsed = Math.min(++tick * FIXED_STEP, duration);
        accumulator -= FIXED_STEP;
      }
      if (elapsed >= duration) {
        playing = false;
        for (const card of cards) card.dirty = true;
        lastUpdate = 0;
      }
    }
    if (now - lastUpdate >= 100 && (playing || lastUpdate === 0)) {
      refreshClock();
      cards.forEach(updateCard);
      lastUpdate = now;
    }
    if (now - lastRender >= 1000 / 32) {
      for (const card of cards) {
        if (!card.visible || (!playing && !card.dirty)) continue;
        const battle = card.scenario.battle;
        renderer.draw(card.canvas, battle, Math.min(battle.time - card.lastDrawTime, .1));
        card.lastDrawTime = battle.time;
        card.dirty = renderer.loading;
      }
      lastRender = now;
    }
    frameHandle = requestAnimationFrame(frame);
  }

  replay.disabled = speed.disabled = true;
  refreshClock();
  play.disabled = true;
  cards.forEach(card => {
    updateSetup(card);
    updateCard(card);
  });
  await Promise.all(cards.filter(card => {
    const rect = card.canvas.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  }).map(prepare));
  for (const card of cards) {
    intersection.observe(card.canvas);
    resize.observe(card.canvas);
  }
  play.addEventListener('click', () => {
    playing = !playing;
    if (!playing) {
      cards.forEach(updateCard);
      for (const card of cards) card.dirty = true;
    }
    refreshClock();
  });
  replay.addEventListener('click', restart);
  replay.disabled = speed.disabled = false;
  playing = true;
  refreshClock();
  groups.dataset.ready = 'true';
  frameHandle = requestAnimationFrame(frame);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    cancelAnimationFrame(frameHandle);
    intersection.disconnect();
    resize.disconnect();
    renderer.dispose();
  });
}

function showError(error: unknown) {
  const notice = find('labNotice');
  notice.dataset.error = '';
  notice.textContent = `技能实验场加载失败。请刷新重试。 ${error instanceof Error ? error.message : String(error)}`;
}

void initialize().catch(showError);
