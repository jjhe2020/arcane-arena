import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createBattle,stepBattle,FIXED_STEP,battleStats,statusValue} from '../src/combat';
import {validateUnitStatistics} from '../src/combat/statistics';
import type {CombatUnit,Player,SkillDefinition,SkillStack} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';

const TETHER='wisp_tether',VAMP='custom_skeleton_king_vampiric_aura',TRANCE='troll_warlord_battle_trance',ARC='custom_zuus_arc_lightning',PURGE='custom_oracle_fortunes_end';
const catalog=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const player=(id:number,skills:SkillStack[]=[],count=1):Player=>({id,name:'P',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:Array.from({length:count},(_,i)=>({id:`h${i}`,name:'H',role:'mage',skin:'male',x:i,y:-3,skills:i?[]:skills}))});
function world(providers:SkillStack[]=[{id:VAMP,points:3}]){
 const definitions=structuredClone(catalog),b=createBattle(player(0,[{id:TETHER,points:3},...providers],2),player(1),712,definitions),u=b.units[0],ally=b.units[1],t=b.units[2];
 for(const unit of b.units){unit.hp=unit.maxHp=10000;unit.mana=unit.maxMana=10000;unit.armor=unit.magicResist=unit.moveSpeed=0;unit.attack=unit.attackMin=unit.attackMax=100;unit.nextAttack=99999;unit.cooldowns=unit.skills.map(()=>99999);unit.statuses.push({kind:'disarm',until:100,dispel:'none'} as EffectStatus);}
 u.x=u.y=t.y=0;u.facing=0;t.x=1;t.facing=Math.PI;ally.x=0;ally.y=1;ally.hp=5000;
 const step=(seconds:number)=>stepBattle(b,seconds,definitions);
 const cast=(id:string)=>{const slot=u.skills.findIndex(s=>s?.id===id),before=b.events.length;u.cooldowns[slot]=0;for(let i=0;i<40;i++){step(FIXED_STEP);const event=b.events.slice(before).find(e=>e.type==='cast'&&e.skill===id&&e.source===u.id);if(event){u.cooldowns=u.skills.map(()=>99999);return event;}}throw Error(`No actual cast:${id}`);};
 cast(TETHER);
 const attack=()=>{u.statuses=u.statuses.filter(s=>s.kind!=='disarm');u.attack=u.attackMin=u.attackMax=100;u.attackCapability='melee';u.range=2;u.attackPoint=0;u.attackInterval=100;u.nextAttack=b.time;step(.1);u.nextAttack=99999;};
 const healing=(id:string)=>(u.abilityStats??[]).filter(s=>s.abilityId===id).reduce((n,s)=>n+s.healing,0),hits=()=>b.events.filter(e=>e.type==='hit'&&e.source===u.id&&e.target===t.id&&Number(e.amount)>0);
 return{b,u,ally,t,definitions,step,cast,attack,healing,hits};
}
const mark=(u:CombatUnit,kind:string,value:number)=>u.statuses.push({kind,value,until:100});
const valid=(w:ReturnType<typeof world>)=>expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);

describe('Tether transfers uncapped lifesteal intent while statistics retain effective restoration',()=>{
 it('TL-01 a full-health actual Vampiric Spirit attacker still transfers34lifesteal times1point2',()=>{const w=world();expect(statusValue(w.u,'lifesteal')).toBe(.34);w.attack();expect(w.hits()[0].amount).toBe(100);expect(w.u.hp).toBe(10000);expect(w.ally.hp).toBeCloseTo(5040.8);expect(w.healing(VAMP)).toBe(0);expect(w.healing(TETHER)).toBeCloseTo(40.8);valid(w);});
 it('TL-02 two real providers split10effective self healing proportionally and transfer the complete114intent once',()=>{const w=world([{id:VAMP,points:3},{id:TRANCE,points:3}]);w.u.hp=4000;w.cast(TRANCE);w.u.hp=9990;w.attack();expect(w.u.hp).toBe(10000);expect(w.ally.hp).toBeCloseTo(5136.8);expect(w.healing(VAMP)).toBeCloseTo(10*34/114);expect(w.healing(TRANCE)).toBeCloseTo(10*80/114);expect(w.healing(TETHER)).toBeCloseTo(136.8);expect(w.b.events.filter(e=>e.type==='heal'&&e.skill===TETHER)).toHaveLength(1);valid(w);});
 it('TL-03 partially missing10health retains effective10self healing while the ally receives the full40point8',()=>{const w=world();w.u.hp=9990;w.attack();expect(w.u.hp).toBe(10000);expect(w.healing(VAMP)).toBe(10);expect(w.ally.hp).toBeCloseTo(5040.8);valid(w);});
 it('TL-04 a real Gaben Arc Lightning at full health transfers its complete20percent spell lifesteal',()=>{const w=world([{id:ARC,points:9}]);expect(statusValue(w.u,'spellLifesteal')).toBe(.2);w.cast(ARC);expect(w.hits()[0].amount).toBe(300);expect(w.u.hp).toBe(10000);expect(w.healing(ARC)).toBe(0);expect(w.ally.hp).toBe(5072);expect(w.healing(TETHER)).toBe(72);valid(w);});
 it('TL-05 partially missing5health preserves5effective spell-lifesteal statistics but transfers the complete72',()=>{const w=world([{id:ARC,points:9}]);w.u.hp=9995;w.cast(ARC);expect(w.u.hp).toBe(10000);expect(w.healing(ARC)).toBe(5);expect(w.ally.hp).toBe(5072);expect(w.healing(TETHER)).toBe(72);valid(w);});
 it('TL-06 source restoration reduction and lifesteal amplification apply before transfer then the ally applies its own heal amplification',()=>{const w=world();mark(w.u,'healReduction',.25);mark(w.u,'lifestealAmplification',.5);mark(w.ally,'healAmplification',.2);w.attack();expect(w.u.hp).toBe(10000);expect(w.healing(VAMP)).toBe(0);expect(w.ally.hp).toBeCloseTo(5000+34*.75*1.5*1.2*1.2);valid(w);});
 it('TL-07 Break does not disable the active Battle Trance lifesteal or active Tether transfer',()=>{const w=world([{id:TRANCE,points:3}]);w.u.hp=4000;w.cast(TRANCE);w.u.hp=10000;mark(w.u,'break',0);w.attack();expect(w.u.hp).toBe(10000);expect(w.ally.hp).toBe(5096);expect(w.healing(TRANCE)).toBe(0);expect(w.healing(TETHER)).toBe(96);valid(w);});
 it('TL-08 exceeding the real1000break distance stops transfer without changing ordinary effective lifesteal',()=>{const w=world();w.ally.y=11;w.step(.2);expect(w.u.statuses.some(s=>s.kind==='tether')).toBe(false);w.u.hp=9990;const before=w.ally.hp;w.attack();expect(w.u.hp).toBe(10000);expect(w.healing(VAMP)).toBe(10);expect(w.ally.hp).toBe(before);expect(w.healing(TETHER)).toBe(0);valid(w);});
 it('TL-09 returning to range and actually recasting Tether restores the same original damage and uncapped transfer',()=>{const w=world();w.ally.y=11;w.step(.2);w.ally.y=1;w.cast(TETHER);w.u.hp=10000;w.ally.hp=5000;w.attack();expect(w.hits()[0].amount).toBe(100);expect(w.u.hp).toBe(10000);expect(w.ally.hp).toBeCloseTo(5040.8);valid(w);});
 it('TL-10 an actual enemy Fortunes End purges the link and prevents a stale transfer',()=>{const w=world();w.t.skills=[{id:PURGE,points:1}];w.t.cooldowns=[0];w.step(.7);w.t.cooldowns=[99999];expect(w.b.events.some(e=>e.type==='cast'&&e.skill===PURGE)).toBe(true);expect(w.u.statuses.some(s=>s.kind==='tether')).toBe(false);w.u.hp=10000;w.ally.hp=5000;w.attack();expect(w.ally.hp).toBe(5000);expect(w.healing(TETHER)).toBe(0);valid(w);});
 it('TL-11 the tethered ally own10missinghealth cap records only10effective healing despite the40point8transfer intent',()=>{const w=world();w.ally.hp=9990;w.attack();expect(w.ally.hp).toBe(10000);expect(w.u.hp).toBe(10000);expect(w.healing(VAMP)).toBe(0);expect(w.healing(TETHER)).toBe(10);expect(w.u.healing).toBe(10);valid(w);});
 it('TL-12 complete source restoration prevention blocks the lifesteal intent before Tether can relay it',()=>{const w=world();mark(w.u,'healReduction',1);w.u.hp=9990;w.attack();expect(w.u.hp).toBe(9990);expect(w.ally.hp).toBe(5000);expect(w.healing(VAMP)).toBe(0);expect(w.healing(TETHER)).toBe(0);valid(w);});
});
