import type {BattleState, Role, SkillDefinition} from './model';

type Voice = {wave: OscillatorType; from: number; to: number; length: number; gain: number; noise?: number};
type Cue = 'buy' | 'sell' | 'refresh' | 'upgrade' | 'begin' | 'settlement' | 'death' | 'summon';

const attacks: Record<Role, Voice> = {
  assassin: {wave:'triangle', from:540, to:175, length:.09, gain:.15, noise:.6},
  archer: {wave:'triangle', from:390, to:290, length:.12, gain:.12, noise:.35},
  mage: {wave:'sine', from:880, to:500, length:.18, gain:.14},
  tank: {wave:'triangle', from:155, to:53, length:.16, gain:.22, noise:.75},
};
const cues: Record<Cue, Voice> = {
  buy: {wave:'sine', from:600, to:980, length:.18, gain:.22},
  sell: {wave:'triangle', from:710, to:420, length:.16, gain:.17},
  refresh: {wave:'triangle', from:350, to:620, length:.16, gain:.15, noise:.25},
  upgrade: {wave:'triangle', from:420, to:840, length:.32, gain:.19},
  begin: {wave:'triangle', from:156, to:234, length:.38, gain:.22},
  settlement: {wave:'sine', from:145, to:37, length:.43, gain:.31, noise:.9},
  death: {wave:'triangle', from:220, to:62, length:.27, gain:.21, noise:.3},
  summon: {wave:'sine', from:240, to:620, length:.22, gain:.13, noise:.26},
};

function spellVoice(id: string, definition?: SkillDefinition): Voice {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const pitch = 190 * Math.pow(2, ((hash >>> 0) % 24) / 24);
  const tags = definition?.tags ?? [];
  const support = tags.some(tag => ['healing', 'buff', 'manaRegeneration'].includes(tag));
  const impact = tags.some(tag => ['attackModifier', 'stun', 'displacement', 'instantAttack'].includes(tag));
  const motion = tags.includes('mobility');
  const length = (definition?.ultimate ? .32 : .18) + ((hash >>> 8) % 8) * .012;
  if (support) return {wave:'sine', from:pitch * 2, to:pitch * 3, length, gain:.19};
  if (motion) return {wave:'triangle', from:pitch * 1.7, to:pitch * 3.3, length, gain:.18, noise:.45};
  if (impact) return {wave:'triangle', from:pitch * 1.5, to:pitch * .55, length, gain:.21, noise:.7};
  return {wave:'sine', from:pitch * 3, to:pitch * .8, length, gain:.21, noise:.3};
}

const preference = 'arcane-arena.sound';
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private voices = 0;
  private heard = new WeakMap<BattleState, Map<string, number>>();
  private enabled = true;

  constructor() {
    try { this.enabled = localStorage.getItem(preference) !== 'off'; } catch { /* Storage may be disabled. */ }
  }
  get isEnabled() { return this.enabled; }
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(preference, this.enabled ? 'on' : 'off'); } catch { /* In-memory setting still works. */ }
    if (this.master && this.context) this.master.gain.setValueAtTime(this.enabled ? .4 : 0, this.context.currentTime);
    if (this.enabled) this.unlock();
  }
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const context = this.context = new AudioContext();
        const master = this.master = context.createGain();
        master.gain.value = .4;
        master.connect(context.createDynamicsCompressor()).connect(context.destination);
        this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .45), context.sampleRate);
        const samples = this.noise.getChannelData(0);
        let random = 275604541;
        for (let i = 0; i < samples.length; i++) {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
          samples[i] = random / 2147483648 - 1;
        }
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* The browser may disable Web Audio. */ }
  }

  cue(cue: Cue) { this.play(cues[cue], 0, 1, true); }
  preview(definition: SkillDefinition) { this.play(spellVoice(definition.id, definition), 0, 1, true); }

  battle(battle: BattleState, from: number, definitions: ReadonlyMap<string, SkillDefinition>) {
    if (!this.enabled || from >= battle.events.length) return;
    let heard = this.heard.get(battle);
    if (!heard) { heard = new Map(); this.heard.set(battle, heard); }
    const newEvents = battle.events.slice(from);
    // Prioritize finishing cues and cast starts over crowded auto-attack volleys.
    const rank = {death:0, cast:1, summon:2, attack:3, status:4, hit:4, heal:4, move:4};
    newEvents.sort((a, b) => rank[a.type] - rank[b.type]);
    for (const event of newEvents) {
      const pan = Math.max(-.8, Math.min(.8, event.x / 8));
      if (event.type === 'death') { this.play(cues.death, pan); continue; }
      if (event.type === 'attack') {
        const role = battle.units.find(unit => unit.id === event.source)?.role;
        if (role) this.play(attacks[role], pan, .8);
      }
      const id = event.skill ?? event.attribution?.abilityId;
      if (!id || id === 'basic_attack') continue;
      const definition = definitions.get(id);
      const cast = event.type === 'cast';
      const proc = definition?.passive && (event.type === 'hit' || event.type === 'heal' || event.type === 'status') && !event.flags?.damageOverTime;
      const summon = event.type === 'summon';
      if (!cast && !proc && !summon && !event.passiveReplacement && !id.startsWith('god_')) continue;
      const key = `${event.source}:${id}`;
      const previous = heard.get(key) ?? -Infinity;
      if (Math.abs(event.time - previous) < (cast ? .08 : .65)) continue;
      heard.set(key, event.time);
      this.play(spellVoice(id, definition), pan, cast ? 1 : .68);
      if (summon) this.play(cues.summon, pan, .55);
    }
  }

  private play(voice: Voice, pan: number, volume = 1, priority = false) {
    const context = this.context, master = this.master;
    if (!this.enabled || !context || !master || context.state === 'closed' || this.voices >= (priority ? 15 : 11)) return;
    const now = context.currentTime, end = now + voice.length;
    const oscillator = context.createOscillator(), envelope = context.createGain();
    const stereo = context.createStereoPanner?.();
    oscillator.type = voice.wave;
    oscillator.frequency.setValueAtTime(voice.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(voice.to, end);
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(voice.gain * volume, now + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    if (stereo) { stereo.pan.value = pan; envelope.connect(stereo).connect(master); }
    else envelope.connect(master);
    oscillator.connect(envelope);
    if (voice.noise && this.noise) {
      const noise = context.createBufferSource(), filter = context.createBiquadFilter(), mix = context.createGain();
      noise.buffer = this.noise;
      filter.type = 'bandpass';
      filter.frequency.value = voice.from * (voice.from < 200 ? 2.7 : 2);
      mix.gain.value = voice.noise;
      noise.connect(filter).connect(mix).connect(envelope);
      noise.start(now); noise.stop(end);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); mix.disconnect(); };
    }
    this.voices++;
    oscillator.onended = () => { this.voices--; oscillator.disconnect(); envelope.disconnect(); stereo?.disconnect(); };
    oscillator.start(now); oscillator.stop(end);
  }
}
