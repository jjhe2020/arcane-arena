import * as THREE from 'three';
import type { AnimationClip, AssetManifest, BattleState, CombatEvent, CombatUnit, Hero,SkillDefinition } from './model';
import {atlasFrame,bodyPresentation,barrierPresentations,linePresentations,combatTextEvents,recentCombatEvents,COMBAT_TEXT_LIFETIME,basicAttackClip,bodyVisibility,bodyVisualScale,shadowPathPresentations} from './animation';
import {interpolatedTransform} from './combat/presentation';
import {DAMAGE_COLORS} from './combat/statistics';
import type {ShadowPath} from './animation';
import type {BattleBarrier} from './combat/barriers';
import {activeVisualBodyActions} from './combat/visual-state';
import {selectVisualLayers,tierVisualLayers} from './visual-layers';
import {resolveVisualArt,statusVisuals,portalVisuals,movingVisuals,worldVisuals,zoneVisuals,eventVisuals,type VisualSource} from './visual-bindings';
import {duelVisuals} from './duel-presentation';
import {isRangedAttackType} from './combat';
import {ARENA_SCALE,ARENA_WIDTH,ARENA_HEIGHT,BATTLE_BOUNDS,FORMATION_BOUNDS} from './arena-layout';
import {ArenaViewTransition,battleViewRotation,viewPoint,isCelebrating} from './arena-view';
import {radialMaterial} from './range-material';
import {zoneVisualSize,type RadialMapping} from './range-geometry';
import {combatUnitBuffs,heroPersistentBuffs,drawBuffBorder,type UnitBuffView} from './buffs';
import {UI_CONFIG} from './global-config';

type Visual = { group: THREE.Group; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; clip?: AnimationClip; desired?:AnimationClip; key: string; texture?: THREE.Texture;radial:ReturnType<typeof radialMaterial> };
export class ArenaRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private world = new THREE.Group();
  readonly camera = new THREE.OrthographicCamera(-20,20,20,-20,0.1,100);
  readonly hud: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loader = new THREE.TextureLoader();
  private textures = new Map<string, THREE.Texture>();
  private pending = new Map<string, Promise<THREE.Texture>>();
  private retryAfter = new Map<string,number>();
  private visuals = new Map<string, Visual>();
  private fx: { key:string;visual: Visual; start: number; end: number; x:number;y:number;angle:number;size:number }[] = [];
  private grid: THREE.LineSegments;
  private eventCursor = 0;
  private currentBattle?: BattleState;
  private width=1; private height=1;
  private safe={left:12,top:100,right:900,bottom:600};
  private viewTransition=new ArenaViewTransition();
  get mode(){return this.viewTransition.mode;}
  set mode(value:'formation'|'spectate'){this.viewTransition.setMode(value);}
  private introBattle?:BattleState;
  private introSide=0;
  beginBattleIntro(battle?:BattleState,viewSide=0){this.introBattle=battle;this.introSide=viewSide;this.viewTransition.beginBattleIntro();}
  get battleIntroReady(){return this.viewTransition.battleIntroReady;}
  private viewRotation=0;
  private formationShade=new THREE.Group();
  public gridVisible=false;
  public selected='';
  public loadErrors: string[]=[];
  private buffDefinitions=new Map<string,SkillDefinition>();
  set definitions(value:SkillDefinition[]){this.buffDefinitions=new Map(value.map(d=>[d.id,d]));}
  private buffIcons=new Map<string,HTMLImageElement>();
  private buffCache=new WeakMap<CombatUnit,{time:number;buffs:UnitBuffView[]}>();
  private clock=0;
  private persistentFx=new Map<string,Visual>();
  private attacks=new Map<string,CombatEvent>();
  private attackChoices=new Map<string,string>();
  private cosmeticRandom=new Map<string,number>();
  private windups=new Map<string,CombatEvent>();
  private births=new Map<string,CombatEvent>();
  private finishClock:number|undefined;
  private ambient?:Visual;
  private textureUse=new Map<string,number>();
  private hiddenBodies=new Set<string>();
  private arenaGeneration=0;
  private disposed=false;
  private compactAtlases(){return this.renderer.capabilities.maxTextureSize<3584||innerWidth<=920||(innerHeight<=600&&matchMedia('(pointer:coarse)').matches);}
  resolveClip(clip:AnimationClip):AnimationClip{const variant=this.assets.mobileAtlases?.[clip.image];return this.compactAtlases()&&variant?{...clip,...variant}:clip;}
  diagnostics(){const images=new Map<string,{width:number;height:number}>();this.scene.traverse(object=>{if(object instanceof THREE.Mesh){const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){const t=(material as THREE.MeshBasicMaterial).map;if(t?.image)images.set(t.source.uuid,{width:t.image.width,height:t.image.height});}}});return{drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,gpuTextures:this.renderer.info.memory.textures,activeImageBytes:[...images.values()].reduce((n,i)=>n+i.width*i.height*4,0),cachedImageBytes:[...this.textures.values()].reduce((n,t)=>n+t.image.width*t.image.height*4,0),cachedAtlases:this.textures.size,unitBodies:[...this.visuals.entries()].map(([id,v])=>({id,image:v.clip?.image,visible:v.group.visible,action:v.group.userData.action,frame:v.group.userData.frame,age:v.group.userData.age,loop:v.group.userData.loop,opacity:v.mesh.material.opacity,size:v.mesh.scale.x})),view:{...this.viewTransition.diagnostics(),rotation:this.viewRotation},intro:{ready:this.battleIntroReady,progress:this.viewTransition.introProgress,enemyOpacity:this.viewTransition.enemyOpacity,maskOpacity:this.viewTransition.shade*.43},persistentEffects:this.persistentFx.size,persistentEffectKeys:[...this.persistentFx.keys()],transientEffects:this.fx.length,loadErrors:[...this.loadErrors]};}
  constructor(public canvas: HTMLCanvasElement, public assets:AssetManifest,private options:{isolated?:boolean}={}) {
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'high-performance'});
    this.renderer.setClearColor('#111b19');this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.camera.position.z=50;
    this.world.name='battle-world';this.scene.add(this.world);
    this.hud=document.createElement('canvas');this.hud.className='battle-hud';canvas.after(this.hud);this.ctx=this.hud.getContext('2d')!;
    const vertices:number[]=[];const bw=ARENA_WIDTH,bh=ARENA_HEIGHT;
    for(let i=0;i<=12;i++){let x=-bw/2+i*bw/12;vertices.push(x,-bh/2,.1,x,bh/2,.1);}
    for(let i=0;i<=10;i++){let y=-bh/2+i*bh/10;vertices.push(-bw/2,y,.1,bw/2,y,.1);}
    this.grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color:'#a4bba4',transparent:true,opacity:.18}));this.scene.add(this.grid);
    const mask=(x:number,y:number,w:number,h:number)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:'#07110f',transparent:true,opacity:.43,depthWrite:false}));mesh.position.set(x,y,.11);this.formationShade.add(mesh);};
    const edge=60,left=-FORMATION_BOUNDS.x,right=FORMATION_BOUNDS.x,bottom=FORMATION_BOUNDS.minY;
    mask(0,edge/2,edge*2,edge);mask(0,(bottom-edge)/2,edge*2,edge+bottom);
    mask((left-edge)/2,bottom/2,edge+left,-bottom);mask((right+edge)/2,bottom/2,edge-right,-bottom);
    this.formationShade.name='formation-boundary-shade';this.scene.add(this.formationShade);
    this.setArena(0);
  }
  dispose(){
    this.disposed=true;this.arenaGeneration++;
    this.scene.traverse(object=>{const drawable=object as THREE.Mesh;if(drawable.geometry)drawable.geometry.dispose();if(drawable.material)for(const material of Array.isArray(drawable.material)?drawable.material:[drawable.material]){(material as THREE.MeshBasicMaterial).map?.dispose();material.dispose();}});
    for(const texture of this.textures.values())texture.dispose();this.textures.clear();this.renderer.dispose();this.renderer.forceContextLoss();this.hud.remove();
  }
  private texture(url:string):Promise<THREE.Texture>{
    this.textureUse.set(url,this.clock);
    if(this.textures.has(url))return Promise.resolve(this.textures.get(url)!);
    if(this.pending.has(url))return this.pending.get(url)!;
    if(this.clock<(this.retryAfter.get(url)??0))return Promise.reject(new Error('Texture retry pending'));
    const p=this.loader.loadAsync(url).then(t=>{if(this.disposed){t.dispose();throw Error('Renderer disposed');}t.name=url;t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;this.textures.set(url,t);this.retryAfter.delete(url);this.loadErrors=this.loadErrors.filter(failed=>failed!==url);return t;}).catch(e=>{if(!this.disposed&&!this.loadErrors.includes(url))this.loadErrors.push(url);this.pending.delete(url);this.retryAfter.set(url,this.clock+2);throw e;});
    this.pending.set(url,p);return p;
  }
  async setArena(index:number){const generation=++this.arenaGeneration,arena=this.assets.arenas[index];if(!arena)return;try{const texture=await this.texture(arena.image);if(generation!==this.arenaGeneration)return;let bg=this.scene.getObjectByName('background') as THREE.Mesh; if(bg){bg.geometry.dispose();(bg.material as THREE.Material).dispose();this.scene.remove(bg);}bg=new THREE.Mesh(new THREE.PlaneGeometry(39*ARENA_SCALE,39*ARENA_SCALE),new THREE.MeshBasicMaterial({map:texture,transparent:true}));bg.name='background';bg.position.z=-2;this.scene.add(bg);if(this.ambient)this.remove(this.ambient);if(arena.ambient){this.ambient=this.makeVisual();this.world.remove(this.ambient.group);this.scene.add(this.ambient.group);this.setClip(this.ambient,{...arena.ambient as AnimationClip,pivot:[.5,.5]});this.ambient.group.position.z=-1.9;}}catch{setTimeout(()=>{if(generation===this.arenaGeneration)void this.setArena(index);},2000);}}
  layout(){
    const box=this.canvas.parentElement!.getBoundingClientRect();this.width=Math.max(1,box.width);this.height=Math.max(1,box.height);
    this.renderer.setSize(this.width,this.height,false);this.hud.width=this.width*Math.min(devicePixelRatio,1.75);this.hud.height=this.height*Math.min(devicePixelRatio,1.75);
    if(this.options.isolated){this.safe={left:12,top:12,right:this.width-12,bottom:this.height-12};this.updateCamera();return;}
    const visibleBox=(selector:string)=>{const el=document.querySelector<HTMLElement>(selector);return el?.getClientRects().length?el.getBoundingClientRect():undefined;};
    const top=visibleBox('#matchIsland'),shop=visibleBox('#arenaShop');
    const cinema=document.querySelector<HTMLElement>('#game')?.dataset.cinema==='true';
    this.safe={left:12,top:cinema?48:Math.max(45,(top?.bottom??box.top+70)-box.top+12),right:this.width-12,bottom:cinema?this.height-12:Math.max(120,(shop?.top??box.bottom-100)-box.top-20)};
    this.updateCamera();
  }
  private updateCamera(){
    const blend=this.viewTransition.blend,formationHeight=14.983333*ARENA_SCALE,target={x:0,y:-5.425*ARENA_SCALE*(1-blend),w:ARENA_WIDTH,h:formationHeight+(ARENA_HEIGHT-formationHeight)*blend};
    const safeW=this.safe.right-this.safe.left,safeH=this.safe.bottom-this.safe.top;
    const scale=Math.max(.5,Math.min(safeW/target.w,safeH/target.h));const cx=(this.safe.left+this.safe.right)/2,cy=(this.safe.top+this.safe.bottom)/2;
    this.camera.left=-this.width/scale/2;this.camera.right=this.width/scale/2;this.camera.top=this.height/scale/2;this.camera.bottom=-this.height/scale/2;
    this.camera.position.x=target.x+(this.width/2-cx)/scale;this.camera.position.y=target.y-(this.height/2-cy)/scale;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  project(x:number,y:number){const p=viewPoint(x,y,this.viewRotation),v=new THREE.Vector3(p.x,p.y,0).project(this.camera);return {x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2};}
  unproject(clientX:number,clientY:number){const r=this.canvas.getBoundingClientRect();const v=new THREE.Vector3((clientX-r.left)/this.width*2-1,1-(clientY-r.top)/this.height*2,0).unproject(this.camera);return viewPoint(v.x,v.y,this.viewRotation);}
  private makeVisual():Visual{const group=new THREE.Group();const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide}));group.add(mesh);this.world.add(group);return{group,mesh,key:'',radial:radialMaterial(mesh.material)};}
  private setClip(v:Visual,clip:AnimationClip){clip=this.resolveClip(clip);v.desired=clip;if(v.key===clip.image&&(v.clip?.image===clip.image||this.pending.has(clip.image)||this.clock<(this.retryAfter.get(clip.image)??0)))return;v.key=clip.image;v.mesh.visible=!!v.texture;
    // Hold the old pose with its own UV layout until the next atlas is ready.
    // A failed request can retry after a short delay instead of poisoning cache.
    this.texture(clip.image).then(base=>{if(this.disposed||v.key!==clip.image)return;v.texture?.dispose();v.texture=base.clone();v.clip=clip;v.mesh.visible=true;v.mesh.material.map=v.texture;v.mesh.material.needsUpdate=true;}).catch(()=>{});
  }
  private frame(v:Visual,age:number,loop=true,size=3.6,height=size){if(v.desired&&(!v.texture||v.clip?.image!==v.desired.image))this.setClip(v,v.desired);const c=v.clip;if(!c||!v.texture)return;this.textureUse.set(v.key,this.clock);const cell=atlasFrame(c,age,loop);
    Object.assign(v.group.userData,{frame:cell.index,age,loop});
    v.texture.repeat.set(cell.repeatX,cell.repeatY);v.texture.offset.set(cell.offsetX,cell.offsetY);
    v.mesh.scale.set(size,height,1);const pivot=c.pivot??[.5,.3888889];v.mesh.position.set((.5-pivot[0])*size,-(.5-pivot[1])*height,0);
  }
  private introBodiesReady(displayedBattle:BattleState|undefined,viewSide:number){
    if(this.battleIntroReady)return true;
    if(!this.introBattle&&displayedBattle){this.introBattle=displayedBattle;this.introSide=viewSide;}
    const battle=this.introBattle;if(!battle)return false;
    // Keep loading the entry's original participants if the user temporarily
    // opens formation or watches another pair. Ordinary later view changes
    // never use this gate. Invisible enemy bodies and dead units cannot block.
    const poses=new Map(activeVisualBodyActions(battle,battle.time).map(p=>[p.unitId,p]));
    let ready=true;
    for(const unit of battle.units){
      if(unit.dead||bodyVisibility(unit,this.introSide,battle.time).hidden)continue;
      const celebrating=isCelebrating(battle,unit),action=celebrating?'celebrate':poses.get(unit.id)?.action??unit.action;
      const presentation=!celebrating||unit.summoned?bodyPresentation(this.assets,unit,action,battle.time):{hidden:false};
      if(presentation.hidden)continue;
      const clips=this.assets.characters[`${unit.role}-${unit.skin}`],aliases:Record<string,string>={stun:'disabled',controlled:'disabled',walk:'move'};
      const source=presentation.clip??clips?.[action]??clips?.[aliases[action]]??clips?.idle;if(!source)continue;
      const visual=displayedBattle===battle&&this.currentBattle===battle?this.visuals.get(unit.id):undefined;
      const clip=visual?.desired??this.resolveClip(source);
      // texture() retains the existing retry/backoff behavior and a matching
      // image key is required; a previous visual's cached pose is insufficient.
      void this.texture(clip.image).catch(()=>{});
      if(!this.textures.has(clip.image)){ready=false;continue;}
      if(displayedBattle===battle){if(!visual?.texture||visual.desired?.image!==clip.image||visual.key!==clip.image||visual.clip?.image!==clip.image||!visual.mesh.visible)ready=false;}
    }
    return ready;
  }
  draw(heroes:Hero[],enemy:Hero[],battle:BattleState|undefined,viewSide:number,dt:number,alpha=1){
    this.clock+=dt;this.viewTransition.advance(dt,this.introBodiesReady(battle,viewSide));this.updateCamera();this.grid.visible=this.gridVisible;
    this.viewRotation=battleViewRotation(battle,viewSide);this.world.rotation.z=this.viewRotation;
    this.formationShade.visible=this.viewTransition.shade>0;
    this.formationShade.children.forEach(child=>{(child as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>).material.opacity=.43*this.viewTransition.shade;});
    if(this.ambient)this.frame(this.ambient,this.clock,true,39*ARENA_SCALE);
    if(battle!==this.currentBattle){this.currentBattle=battle;this.finishClock=undefined;this.eventCursor=0;this.attacks.clear();this.attackChoices.clear();this.cosmeticRandom.clear();this.windups.clear();this.births.clear();this.fx.forEach(f=>this.remove(f.visual));this.fx=[];}
    const displayBattle=battle?{...battle,units:battle.units.map(unit=>({...unit,...interpolatedTransform(unit,alpha)}))}:undefined;
    const units: (Hero|CombatUnit)[]=displayBattle?displayBattle.units:[...heroes,...enemy.map(h=>({...h,y:-h.y,x:-h.x}))];
    if(battle?.finished&&this.finishClock===undefined)this.finishClock=this.clock;
    const used=new Set<string>();this.hiddenBodies.clear();const time=battle?battle.time+(this.finishClock===undefined?0:Math.min(2,this.clock-this.finishClock)):this.clock;
    const bodyPoses=new Map(battle?activeVisualBodyActions(battle,time).map(p=>[p.unitId,p]):[]);
    units.forEach((u)=>{const live='dead' in u,unit=u as CombatUnit;if(live&&unit.dead&&time-unit.actionStart>5)return;used.add(u.id);let v=this.visuals.get(u.id);if(!v){v=this.makeVisual();this.visuals.set(u.id,v);}
      const clips=this.assets.characters[`${u.role}-${u.skin}`];if(!clips)return;
      let action=live?unit.action:'idle';let clipAge=live?time-(unit.actionStart??0):time;
      const attack=live?this.attacks.get(u.id):undefined;
      const attacking=action==='attack'||(action==='idle'&&attack&&time-attack.time<Number(attack.duration??unit.attackInterval));
      if(attacking&&attack){action=this.attackChoices.get(u.id)??'attack';const c=clips[action]??clips.attack;const age=time-attack.time,windup=Number(attack.windup??.3),duration=Number(attack.duration??unit.attackInterval);const frame=age<=windup?17*age/Math.max(.01,windup):17+(c.frames-18)*(age-windup)/Math.max(.01,duration-windup);clipAge=Math.min(c.frames-1,frame)/c.fps;}
      if(action==='cast'&&battle){const windup=this.windups.get(u.id);if(windup){const point=Number(windup.duration??.3);const age=time-windup.time;clipAge=(age<=point?17*age/Math.max(.01,point):17+(age-point)*24)/24;}}
      const pose=live?bodyPoses.get(unit.id):undefined;
      if(pose){action=pose.action;clipAge=Math.max(0,time-pose.createdAt);}
      const celebrating=live&&isCelebrating(battle,unit);
      if(celebrating){action='celebrate';clipAge=this.clock-(this.finishClock??this.clock);}
      const aliases:Record<string,string>={stun:'disabled',controlled:'disabled',cast:'cast',walk:'move',channel:'channel',death:'death'};
      let clip=clips[action]??clips[aliases[action]]??clips['idle'];
      if(live&&battle&&(!celebrating||unit.summoned)){const presentation=bodyPresentation(this.assets,unit,action,battle.time,this.births.get(unit.id)?.skill);clip=presentation.clip??clip;v.group.visible=!presentation.hidden;if(presentation.hidden)this.hiddenBodies.add(unit.id);}else v.group.visible=true;
      const visibility=live?bodyVisibility(unit,viewSide,time):{hidden:false,opacity:1};if(visibility.hidden){v.group.visible=false;this.hiddenBodies.add(unit.id);}if(!clip)return;this.setClip(v,clip);
      const bodyScale=live&&battle?bodyVisualScale(unit as CombatUnit,battle.time):1;
      this.frame(v,clipAge,celebrating||Boolean(clip.loop??(action==='idle'||action==='move')),Number(clip.worldSize??3.6)*bodyScale);v.group.userData.action=action;
      v.group.position.set(u.x,u.y,.2+(BATTLE_BOUNDS.y-viewPoint(u.x,u.y,this.viewRotation).y)*.001);v.group.rotation.z=live?(pose?.facing??unit.facing)+Math.PI/2:(heroes.includes(u as Hero)?Math.PI:0);
      const ghost=live&&typeof battle?.ghostSide==='number'&&battle.ghostSide===unit.side,enemyOpacity=live&&unit.side!==viewSide?this.viewTransition.enemyOpacity:1;v.mesh.material.opacity=(live&&unit.dead?.valueOf()?0.35:visibility.opacity)*(ghost ? .6 : 1)*enemyOpacity;v.mesh.material.color.set(ghost?'#dcecff':live&&unit.side!==viewSide?'#ffd0b8':'#ffffff');
      if(enemyOpacity<=0){v.group.visible=false;this.hiddenBodies.add(u.id);}
    });
    this.visuals.forEach((v,id)=>{if(!used.has(id)){this.remove(v);this.visuals.delete(id);}});
    if(battle){while(this.eventCursor<battle.events.length){const e=battle.events[this.eventCursor++];if(e.type==='attack'){this.attacks.set(e.source,e);let seed=this.cosmeticRandom.get(e.source);if(seed===undefined){seed=Number((battle.initial as {seed?:number}|undefined)?.seed??1);for(const c of e.source)seed=Math.imul(seed^c.charCodeAt(0),16777619);}seed||=0x6d2b79f5;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;this.cosmeticRandom.set(e.source,seed>>>0);this.attackChoices.set(e.source,['attack','attack_02','attack_03'][Math.floor((seed>>>0)/4294967296*3)]);}if(e.type==='status'&&e.status==='castWindup')this.windups.set(e.source,e);if(e.type==='summon'&&e.target)this.births.set(e.target,e);if(!e.skill)continue;
      for(const placed of eventVisuals(this.assets,e,battle.units)){
        const end=e.time+Math.min(3,placed.clip.frames/placed.clip.fps),limit=this.compactAtlases()?80:160;
        if(end<=time||this.fx.length>=limit||this.fx.some(f=>f.key===placed.key))continue;
        const visual=this.makeVisual();this.setClip(visual,placed.clip);
        this.fx.push({key:placed.key,visual,start:e.time,end,x:placed.x,y:placed.y,angle:placed.angle,size:placed.size});
      }
    }}
    this.drawPersistentEffects(displayBattle,time);
    this.fx=this.fx.filter(f=>{if(time>f.end){this.remove(f.visual);return false;}f.visual.group.position.set(f.x,f.y,.7);f.visual.group.rotation.z=f.angle;this.frame(f.visual,time-f.start,false,f.size);f.visual.mesh.material.opacity=this.viewTransition.enemyOpacity;return true;});
    this.persistentFx.forEach(v=>{v.mesh.material.opacity=this.viewTransition.enemyOpacity;});
    this.trimTextures();this.renderer.render(this.scene,this.camera);this.drawHUD(units,displayBattle,viewSide,time);
  }
  private trimTextures(){const active=new Set<string>();this.scene.traverse(object=>{if(object instanceof THREE.Mesh){const materials=Array.isArray(object.material)?object.material:[object.material];for(const m of materials){const t=(m as THREE.MeshBasicMaterial).map;if(t?.name)active.add(t.name);}}});
    const budget=(this.compactAtlases()?96:256)*1048576;
    let bytes=[...this.textures.values()].reduce((sum,t)=>sum+t.image.width*t.image.height*4,0);
    const candidates=[...this.textures].sort(([a],[b])=>(this.textureUse.get(a)??0)-(this.textureUse.get(b)??0));
    for(const [url,t]of candidates){if(active.has(url))continue;const age=this.clock-(this.textureUse.get(url)??0);if(age<.5)continue;if(bytes<=budget&&this.textures.size<=64&&age<=15)continue;bytes-=t.image.width*t.image.height*4;t.dispose();this.textures.delete(url);this.pending.delete(url);this.textureUse.delete(url);}
  }
  private remove(v:Visual){v.key='';v.group.removeFromParent();v.texture?.dispose();v.mesh.geometry.dispose();v.mesh.material.dispose();}
  private drawPersistentEffects(battle:BattleState|undefined,time:number){const used=new Set<string>();
    const paint=(key:string,c:AnimationClip,x:number,y:number,age:number,size:number,angle=0,z=.4,loop=true,height=size,radial?:RadialMapping)=>{if(used.size>=90)return;used.add(key);let v=this.persistentFx.get(key);if(!v){v=this.makeVisual();this.persistentFx.set(key,v);}this.setClip(v,c);this.frame(v,age,loop,size,height);v.radial.update(radial,size,v.texture);v.group.position.set(x,y,z);v.group.rotation.z=angle;};
    if(battle){
      for(const wall of barrierPresentations(this.assets,(battle.barriers??[]) as BattleBarrier[],time))paint(wall.key,wall.clip,wall.x,wall.y,wall.age,wall.width,wall.angle,.16,wall.loop??false,wall.height);
      for(const line of linePresentations(this.assets,battle.units,time))paint(line.key,line.clip,line.x,line.y,line.age,line.width,line.angle,.68,true,line.height);
      for(const placed of duelVisuals(this.assets,battle,time))paint(placed.key,placed.clip,placed.x,placed.y,placed.age,placed.size,placed.angle,placed.z,placed.loop,placed.height);
      for(const placed of worldVisuals(this.assets,battle,time))paint(placed.key,placed.clip,placed.x,placed.y,placed.age,placed.size,placed.angle,placed.z,placed.loop,placed.height,placed.radialMapping);
      for(const placed of portalVisuals(this.assets,battle.units,time))paint(placed.key,placed.clip,placed.x,placed.y,placed.age,placed.size,placed.angle,placed.z,placed.loop,placed.height);
      for(const p of (battle.projectiles??[]) as (VisualSource&{id?:string;createdAt?:number;angle?:number;source:string;target:string;x:number;y:number;visualProjectile?:string;visualLayer?:string})[]){
        const source=battle.units.find(u=>u.id===p.source),target=battle.units.find(u=>u.id===p.target);
        const angle=(p.angle??Math.atan2((target?.y??p.y)-p.y,(target?.x??p.x)-p.x))+Math.PI/2;
        const declared=p.visualProjectile?this.assets.projectiles?.[p.visualProjectile]:undefined;
        if(declared){paint(`p:${p.id??p.source}:declared`,declared,p.x,p.y,time-(p.createdAt??0),Number(declared.worldSize??.6),angle,.8);continue;}
        if(p.skill==='basic_attack'){const declared=p.visualSkill?resolveVisualArt(this.assets,p,p.visualPoints??1):undefined,clip=declared?selectVisualLayers(declared.art,declared.points,'projectile')[0]?.clip:source?basicAttackClip(this.assets,source,time):undefined;if(clip)paint(`p:${p.id??p.source}:basic`,clip,p.x,p.y,time-(p.createdAt??0),Number(clip.worldSize??.6),angle,.8);continue;}
        const resolved=resolveVisualArt(this.assets,p,source?.skills.find(s=>s?.id===p.skill)?.points??1);if(!resolved)continue;
        for(const layer of selectVisualLayers(resolved.art,resolved.points,'projectile',p.visualLayer?[p.visualLayer]:undefined).slice(0,2))paint(`p:${p.id??`${p.source}:${p.target}:${p.skill}`}:${layer.id}`,layer.clip,p.x,p.y,time-(p.createdAt??0),Number(layer.clip.worldSize??3.6),angle,.8);
      }
      for(const placed of movingVisuals(this.assets,battle,time))paint(placed.key,placed.clip,placed.x,placed.y,placed.age,placed.size,placed.angle,placed.z,placed.loop,placed.height);
      for(const placed of zoneVisuals(this.assets,battle,time))paint(placed.key,placed.clip,placed.x,placed.y,placed.age,placed.size,placed.angle,placed.z,placed.loop,placed.height);
      for(const placed of statusVisuals(this.assets,battle.units.filter(u=>!this.hiddenBodies.has(u.id)),time))paint(placed.key,placed.clip,placed.x,placed.y,placed.age,placed.size,placed.angle,placed.z,placed.loop,placed.height);
      for(const path of shadowPathPresentations(this.assets,(battle.shadowPaths??[]) as ShadowPath[],time))paint(path.key,path.clip,path.x,path.y,path.age,path.width,path.angle,.14,true,path.height);
    }
    this.persistentFx.forEach((v,key)=>{if(!used.has(key)){this.remove(v);this.persistentFx.delete(key);}});
  }
  private drawHUD(units:(Hero|CombatUnit)[],battle:BattleState|undefined,side:number,time=battle?.time??0){const ctx=this.ctx;ctx.setTransform(this.hud.width/this.width,0,0,this.hud.height/this.height,0,0);ctx.clearRect(0,0,this.width,this.height);
    units.forEach(u=>{const p=this.project(u.x,u.y);const c=u as CombatUnit;if(c.dead||this.hiddenBodies.has(u.id))return;const mine=!battle?u.y<=0:c.side===side,pixels=this.width/(this.camera.right-this.camera.left),r=Math.max(c.summoned?3:5,Math.min(c.summoned?12:23,pixels*(c.summoned?.5:1)));
      ctx.globalAlpha=battle&&c.side!==side?this.viewTransition.enemyOpacity:1;
      ctx.strokeStyle=u.id===this.selected?'#f5d891':battle&&typeof battle.ghostSide==='number'&&battle.ghostSide===c.side?'#e0edf6':mine?'#70c9b2':'#ec8c76';ctx.lineWidth=u.id===this.selected?2.5:1;ctx.beginPath();ctx.ellipse(p.x,p.y+3,r,r*.7,0,0,Math.PI*2);ctx.stroke();
      const w=Math.max(c.summoned?UI_CONFIG.summonHealthBarMinimumWidth:UI_CONFIG.healthBarMinimumWidth,Math.min(c.summoned?UI_CONFIG.summonHealthBarMaximumWidth:UI_CONFIG.healthBarMaximumWidth,pixels*(c.summoned?UI_CONFIG.summonHealthBarWorldWidth:UI_CONFIG.healthBarWorldWidth))),barHeight=c.summoned?UI_CONFIG.summonHealthBarHeight:UI_CONFIG.healthBarHeight,barY=p.y-r-UI_CONFIG.healthBarYOffset;
      if(battle){ctx.fillStyle='#142220';ctx.fillRect(p.x-w/2,barY,w,barHeight);ctx.fillStyle=mine?'#7dc99c':'#dd8475';ctx.fillRect(p.x-w/2,barY,w*Math.max(0,c.hp/Math.max(1,c.maxHp)),barHeight);ctx.fillStyle='#68a9df';ctx.fillRect(p.x-w/2,p.y-r-UI_CONFIG.manaBarYOffset,w*Math.max(0,c.mana/Math.max(1,c.maxMana)),UI_CONFIG.manaBarHeight);}
      let buffs:UnitBuffView[];
      if(battle){const cached=this.buffCache.get(c);if(cached?.time===battle.time)buffs=cached.buffs;else{buffs=combatUnitBuffs(c,battle.time,this.buffDefinitions,battle.units);this.buffCache.set(c,{time:battle.time,buffs});}}
      else buffs=heroPersistentBuffs(u as Hero,this.buffDefinitions);
      const size=barHeight,gap=UI_CONFIG.buffIconGap,capacity=Math.floor((w+gap)/(size+gap));
      buffs.slice(0,capacity).forEach((buff,index)=>{const x=p.x-w/2+index*(size+gap),y=barY-gap-size;ctx.save();ctx.beginPath();ctx.rect(x,y,size,size);ctx.clip();ctx.fillStyle='#10231f';ctx.fillRect(x,y,size,size);if(buff.icon){let icon=this.buffIcons.get(buff.icon);if(!icon){icon=new Image();icon.src=buff.icon;this.buffIcons.set(buff.icon,icon);}if(icon.complete&&icon.naturalWidth)ctx.drawImage(icon,x,y,size,size);}drawBuffBorder(ctx,x,y,size,buff,time);if(buff.stacks>1){const label=String(buff.stacks);ctx.font=`bold ${UI_CONFIG.buffStackFontSize}px system-ui`;const fit=Math.min(1,(size-1)/Math.max(1,ctx.measureText(label).width));ctx.font=`bold ${UI_CONFIG.buffStackFontSize*fit}px system-ui`;ctx.textAlign='right';ctx.textBaseline='bottom';ctx.fillStyle='#fff';ctx.strokeStyle='#07100f';ctx.lineWidth=1;ctx.strokeText(label,x+size-.5,y+size);ctx.fillText(label,x+size-.5,y+size);}ctx.restore();});
    });ctx.globalAlpha=1;
    if(battle){const pixelsPerWorld=this.width/(this.camera.right-this.camera.left);for(const text of combatTextEvents(recentCombatEvents(battle.events,time),time)){const target=battle.units.find(u=>u.id===text.target);if(this.hiddenBodies.has(text.target)||(target?.summoned&&pixelsPerWorld<12&&text.amount<75&&!text.critical))continue;const age=time-text.time,p=this.project(text.x,text.y),pop=text.critical?1+Math.max(0,1-age/.16)*.3:1;ctx.globalAlpha=Math.max(0,1-age/COMBAT_TEXT_LIFETIME);ctx.font=`bold ${Math.round((text.critical?17:text.damageOverTime?11:13)*pop)}px system-ui`;ctx.textAlign='center';ctx.fillStyle=text.type==='heal'?DAMAGE_COLORS.healing:DAMAGE_COLORS[text.damageType];ctx.strokeStyle='#15231fe6';ctx.lineWidth=text.critical?3.2:2.5;const label=text.outcome==='miss'?'未命中':`${text.type==='heal'?'+':''}${Math.round(text.amount)}${text.critical?'!':''}`,x=p.x+text.lane*15,y=p.y-29-Math.min(age,.2)*40-Math.max(0,age-.2)*18;ctx.strokeText(label,x,y);ctx.fillText(label,x,y);}
      for(const e of battle.events.slice(-70)){const age=battle.time-e.time;if(e.type!=='attack'||e.toX===undefined||age<0||age>=.16)continue;const source=battle.units.find(u=>u.id===e.source);if(e.ranged===true||(e.ranged===undefined&&source&&isRangedAttackType(source)))continue;const a=this.project(e.x,e.y),b=this.project(e.toX,e.toY!);ctx.globalAlpha=1-age/.16;ctx.strokeStyle='#eacb8a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    }ctx.globalAlpha=1;
  }
}
