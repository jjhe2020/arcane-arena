import './round-impact.css';

type Point = {x:number; y:number};
export const ROUND_IMPACT_DURATION = 1200;

export function showRoundImpact(stage: HTMLElement, strikes: {
  target: HTMLElement | null; name: string; damage: number; origin?: Point; lane: number;
}[]) {
  const root = stage.closest<HTMLElement>('#game') ?? stage;
  const bounds = stage.getBoundingClientRect();
  const center = {x:bounds.left + bounds.width / 2, y:bounds.top + bounds.height * .42};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const {target, name, damage, origin = center, lane} of strikes) {
    const rect = target?.getBoundingClientRect();
    const visible = rect && rect.width > 0 && rect.height > 0 && rect.left < innerWidth && rect.right > 0 && rect.top < innerHeight && rect.bottom > 0;
    const x = visible ? rect.left + rect.width / 2 : center.x + lane * Math.min(100, bounds.width / 4);
    const y = visible ? rect.top + rect.height / 2 : bounds.top + Math.min(126, bounds.height * .32);
    const effect = document.createElement('span');
    effect.className = 'round-impact';
    effect.style.setProperty('--hit-x', `${x}px`);
    effect.style.setProperty('--hit-y', `${y}px`);
    effect.style.setProperty('--flight-x', `${origin.x - x}px`);
    effect.style.setProperty('--flight-y', `${origin.y - y}px`);
    effect.style.setProperty('--flight-angle', `${Math.atan2(y - origin.y, x - origin.x)}rad`);
    effect.classList.toggle('round-impact--reduced', reduced);
    effect.classList.toggle('round-impact--sidebar', !!visible && x < center.x);
    const bolt = document.createElement('i'), ring = document.createElement('i');
    bolt.className = 'round-impact-bolt'; ring.className = 'round-impact-ring';
    bolt.setAttribute('aria-hidden', 'true'); ring.setAttribute('aria-hidden', 'true');
    const number = document.createElement('b');
    number.textContent = `${name} −${damage} HP`;
    effect.append(bolt, ring, number);
    root.append(effect);
    window.setTimeout(() => effect.remove(), ROUND_IMPACT_DURATION);
  }
}
