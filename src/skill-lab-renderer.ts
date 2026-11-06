import { bodyPresentation } from './animation';
import { ArenaRenderSurface } from './arena-render-surface';
import type { AnimationClip, AssetManifest, BattleState, SkillDefinition } from './model';
import { ArenaRenderer } from './renderer';
import { resolveVisualArt } from './visual-bindings';
import { tierVisualLayers } from './visual-layers';

const WOODEN_DUMMY: AnimationClip = {
  image: '/art/skill-lab/wooden-dummy.svg',
  frames: 1, columns: 1, frameWidth: 128, frameHeight: 128, fps: 1,
  pivot: [.5, .19], worldSize: 1.65,
};
const now = () => performance.now() / 1000;

/** Each cell owns its scene and event cursor. All cells share the WebGL
 * context and the immutable texture sources used by the main arena. */
export class SkillLabRenderer {
  private readonly surface = new ArenaRenderSurface(document.createElement('canvas'), true);
  private readonly scenes = new Map<HTMLCanvasElement, ArenaRenderer>();

  constructor(private readonly assets: AssetManifest, private readonly definitions: SkillDefinition[]) {}

  get loadErrors() { return this.surface.loadErrors; }
  get loading() { return this.surface.pending.size > 0; }

  private scene(canvas: HTMLCanvasElement) {
    let scene = this.scenes.get(canvas);
    if (!scene) {
      scene = new ArenaRenderer(canvas, this.assets, { lab: { surface: this.surface, dummy: WOODEN_DUMMY } });
      scene.definitions = this.definitions;
      this.scenes.set(canvas, scene);
    }
    return scene;
  }

  async prepare(canvas: HTMLCanvasElement, battle: BattleState, selfRadius?: number) {
    const scene = this.scene(canvas);
    scene.labSelfRadius = selfRadius;
    const clips = new Set<AnimationClip>([WOODEN_DUMMY]);
    for (const unit of battle.units) {
      if (unit.trainingDummy) continue;
      const character = this.assets.characters[`${unit.role}-${unit.skin}`];
      for (const action of ['idle', 'cast', 'channel', 'move', 'attack', 'attack_02', 'attack_03']) {
        if (character?.[action]) clips.add(character[action]);
      }
      const presented = bodyPresentation(this.assets, unit, unit.action, battle.time).clip;
      if (presented) clips.add(presented);
      for (const skill of unit.skills) {
        if (!skill) continue;
        const resolved = resolveVisualArt(this.assets, { skill: skill.id, points: skill.points });
        if (resolved) for (const layer of tierVisualLayers(resolved.art, resolved.points)) clips.add(layer.clip);
      }
    }
    const images = new Set([...clips].map(clip => scene.resolveClip(clip).image));
    await Promise.allSettled([...images].map(image => this.surface.texture(image, now)));
  }

  draw(canvas: HTMLCanvasElement, battle: BattleState, dt: number, alpha = 1) {
    const scene = this.scene(canvas);
    scene.layout();
    scene.draw([], [], battle, 0, dt, alpha);
  }

  clear() {
    for (const scene of this.scenes.values()) scene.dispose();
    this.scenes.clear();
  }

  dispose() {
    this.clear();
    this.surface.dispose();
  }
}
