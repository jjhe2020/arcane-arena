import * as THREE from 'three';

/** Owns the context and the atlas cache. Independent scenes may share both. */
export class ArenaRenderSurface {
  readonly renderer: THREE.WebGLRenderer;
  readonly textures = new Map<string, THREE.Texture>();
  readonly pending = new Map<string, Promise<THREE.Texture>>();
  readonly retryAfter = new Map<string, number>();
  readonly loadErrors: string[] = [];
  private readonly lastUse = new Map<string, number>();
  private readonly loader = new THREE.TextureLoader();
  private generation = 0;

  constructor(canvas: HTMLCanvasElement, shared = false) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, alpha: false, antialias: true, powerPreference: 'high-performance',
    });
    this.renderer.setClearColor('#111b19');
    this.renderer.setPixelRatio(shared ? 1 : Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  use(url: string, time: number) {
    this.lastUse.set(url, time);
  }

  texture(url: string, now: () => number): Promise<THREE.Texture> {
    const time = now();
    this.use(url, time);
    const cached = this.textures.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(url);
    if (pending) return pending;
    if (time < (this.retryAfter.get(url) ?? 0)) return Promise.reject(new Error('Texture retry pending'));

    const generation = this.generation;
    const request = this.loader.loadAsync(url).then(texture => {
      if (generation !== this.generation) {
        texture.dispose();
        throw new Error('Texture request was released');
      }
      texture.name = url;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      this.textures.set(url, texture);
      this.pending.delete(url);
      this.retryAfter.delete(url);
      const previousError = this.loadErrors.indexOf(url);
      if (previousError >= 0) this.loadErrors.splice(previousError, 1);
      return texture;
    }).catch(error => {
      if (generation === this.generation) {
        if (!this.loadErrors.includes(url)) this.loadErrors.push(url);
        this.pending.delete(url);
        this.retryAfter.set(url, now() + 2);
      }
      throw error;
    });
    this.pending.set(url, request);
    return request;
  }

  trim(active: ReadonlySet<string>, time: number, compact: boolean) {
    const bytes = (texture: THREE.Texture) => texture.image.width * texture.image.height * 4;
    const budget = (compact ? 96 : 256) * 1048576;
    let used = [...this.textures.values()].reduce((sum, texture) => sum + bytes(texture), 0);
    const candidates = [...this.textures].sort(([a], [b]) => (this.lastUse.get(a) ?? 0) - (this.lastUse.get(b) ?? 0));
    for (const [url, texture] of candidates) {
      const age = time - (this.lastUse.get(url) ?? 0);
      if (active.has(url) || age < .5 || (used <= budget && this.textures.size <= 64 && age <= 15)) continue;
      used -= bytes(texture);
      texture.dispose();
      this.textures.delete(url);
      this.lastUse.delete(url);
    }
  }

  clearTextures() {
    this.generation++;
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.pending.clear();
    this.retryAfter.clear();
    this.lastUse.clear();
    this.loadErrors.length = 0;
  }

  /** Render each panel into a corner of one drawing buffer and copy it before
   * rendering the next scene. Growing only as needed avoids resize churn. */
  drawPanel(scene: THREE.Scene, camera: THREE.Camera, output: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const canvas = this.renderer.domElement;
    const {width, height} = output;
    if (width > canvas.width || height > canvas.height) {
      this.renderer.setSize(Math.max(width, canvas.width), Math.max(height, canvas.height), false);
    }
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.setScissor(0, 0, width, height);
    this.renderer.setScissorTest(true);
    this.renderer.render(scene, camera);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(canvas, 0, canvas.height - height, width, height, 0, 0, width, height);
  }

  dispose() {
    this.clearTextures();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
