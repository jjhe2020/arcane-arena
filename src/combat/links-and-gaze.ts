import {balanceNumber,skillBalance,UNIT_CONFIG} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as value,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const STEP=1/30;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const statuses=(unit:CombatUnit)=>unit.statuses as EffectStatus[];
const hero=(unit:CombatUnit)=>!unit.summoned||!!unit.illusion||!!unit.consideredHero;
const has=(unit:CombatUnit,kind:string)=>unit.statuses.some(status=>status.kind===kind);

/** Narrow acceptance fixes. AA balance rows remain authoritative; the reference
 * requirements and unverified combinations live in links-and-gaze.json. */
export function applyLinksAndGazeAcceptance(registry:Record<string,SkillProgram>):void{
  const link=registry.custom_razor_static_link;
  const alreadyLinked=(c:C,target:CombatUnit)=>statuses(c.caster).some(status=>status.kind==='staticLinkActive'&&status.skill===c.skill.id&&status.data?.targetId===target.id&&status.until>c.battle.time);
  link.targetSelector=(c,candidates)=>candidates.filter(target=>hero(target)&&!alreadyLinked(c,target)).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
  link.canCast=c=>hero(c.target)&&!alreadyLinked(c,c.target);
  link.cast=c=>{
    const target=c.target,seconds=value(c,'LINK DURATION'),buff=value(c,'BUFF DURATION'),step=.1;
    const rate=value(c,'DAMAGE DRAIN RATE')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?5:0);
    const token=`${c.caster.id}:${c.skill.instanceId??c.caster.skills.indexOf(c.skill)}:${target.id}:${c.battle.time}`;
    let drained=0,broken=false;
    c.status(c.caster,'staticLinkActive',seconds,0,{dispel:'none',maxStacks:32,data:{targetId:target.id,token}});
    const apply=(unit:CombatUnit,kind:string,amount:number)=>{
      const old=statuses(unit).find(status=>status.kind===kind&&status.skill===c.skill.id&&status.source===c.caster.id&&status.data?.linkToken===token);
      if(old){old.value=amount;old.until=c.battle.time+buff;}
      else c.status(unit,kind,buff,amount,{harmful:unit.side!==c.caster.side,dispel:'none',maxStacks:32,data:{linkToken:token}});
    };
    const finish=()=>{
      broken=true;
      c.caster.statuses=statuses(c.caster).filter(status=>status.kind!=='staticLinkActive'||status.data?.token!==token);
      for(const unit of[c.caster,target])for(const status of statuses(unit))if(status.data?.linkToken===token)status.until=c.battle.time+buff;
    };
    apply(c.caster,'attackBonus',0);apply(target,'attackBonus',0);
    if(c.skill.points>=9){apply(c.caster,'attackSpeed',0);apply(target,'attackSpeed',0);}
    for(let elapsed=step;elapsed<=seconds+1e-8;elapsed+=step)c.delay(elapsed,()=>{
      if(broken)return;
      // The historical 550 cast range + 250 buffer and Wiki both give 800.
      if(c.caster.dead||target.dead||distance(c.caster,target)>8){finish();return;}
      drained+=rate*step;
      apply(c.caster,'attackBonus',drained);apply(target,'attackBonus',-drained);
      if(c.skill.points>=9){apply(c.caster,'attackSpeed',drained);apply(target,'attackSpeed',-drained);}
      if(elapsed>=seconds-1e-8)finish();
    });
  };
  link.implemented.push('Independent per-target damage/attack-speed ledgers sum across simultaneous Soulbind links; retained modifiers start their AA buff lifetime when a link ends');
  link.remaining=link.remaining.filter(item=>!item.includes('eight-world-unit'));
  link.remaining.push('AA strong-dispel label conflicts with native non-dispellability; attack-while-moving order/launch behavior and cast-range-bonus break range remain unverified');

  const gaze=registry.medusa_stone_gaze;
  gaze.cast=c=>{
    const seconds=value(c,'DURATION')+(c.skill.points>=6?1:0),interval=.1,exposure=new Map<string,number>();
    const token=`${c.caster.id}:${c.battle.time}`,own=(status:EffectStatus)=>status.skill===c.skill.id&&status.source===c.caster.id&&status.data?.gazeToken===token;
    const removeSlow=(unit:CombatUnit)=>{unit.statuses=statuses(unit).filter(status=>!own(status)||!['slow','attackSpeed','turnRatePct'].includes(status.kind));};
    c.status(c.caster,'haste',seconds,Math.abs(value(c,'SPEED BOOST'))/100);
    c.zone({follow:true,radius:value(c,'RADIUS')/100,duration:seconds,interval,effect:target=>{
      if(has(target,'invulnerable')||has(target,'banished'))return;
      if(statuses(target).some(status=>own(status)&&status.kind==='stun')){exposure.set(target.id,0);return;}
      const toward=Math.atan2(c.caster.y-target.y,c.caster.x-target.x),angle=Math.atan2(Math.sin(target.facing-toward),Math.cos(target.facing-toward));
      // The Valve KV is cos(85 degrees), not a 90-degree half-plane.
      if(Math.abs(angle)>85*Math.PI/180){removeSlow(target);return;}
      const options:Partial<EffectStatus>={harmful:true,dispel:'none',piercesImmunity:true,ignoreStatusResistance:true,data:{gazeToken:token}};
      c.status(target,'slow',interval+STEP,Math.abs(value(c,'SLOW'))/100,options);
      c.status(target,'attackSpeed',interval+STEP,-Math.abs(value(c,'SLOW')),options);
      c.status(target,'turnRatePct',interval+STEP,-Math.abs(value(c,'SLOW'))/100,options);
      const total=(exposure.get(target.id)??0)+interval;exposure.set(target.id,total);
      if(total<2-1e-8)return;
      exposure.set(target.id,0);removeSlow(target);
      c.status(target,'stun',value(c,'STONE DURATION'),0,{harmful:true,dispel:'strong',piercesImmunity:true,data:{gazeToken:token}});
      const stone=statuses(target).find(status=>own(status)&&status.kind==='stun');if(!stone)return;
      const amp=value(c,'BONUS PHYSICAL ATTACK DAMAGE')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?10:0);
      c.status(target,'physicalVulnerability',stone.until-c.battle.time,amp/100,{harmful:true,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:true,data:{gazeToken:token}});
      if(c.skill.points>=9){
        const raw=UNIT_CONFIG.npc_dota_neutral_mud_golem;
        const bodies=c.summon({name:'泥土傀儡',count:1,hp:raw.StatusHealth,attack:(raw.AttackDamageMin+raw.AttackDamageMax)/2,armor:raw.ArmorPhysical,range:raw.AttackRange/100,interval:raw.AttackRate/(raw.BaseAttackSpeed/100),speed:raw.MovementSpeed/100,lifetime:120});
        for(const body of bodies){body.sourceUnitType='npc_dota_neutral_mud_golem';body.magicResist=raw.MagicalResistance/100;body.mana=body.maxMana=raw.StatusMana;c.status(body,'regen',120,raw.StatusHealthRegen);c.status(body,'manaRegen',120,raw.StatusManaRegen-3);c.warp(body,target.x,target.y);}
      }
    }});
  };
  gaze.implemented.push('85-degree facing threshold, additive attack-speed slow and turn-rate slow; cumulative facing restarts after each completed petrification');
  gaze.remaining=gaze.remaining.filter(item=>!item.includes('View cone angle')&&!item.includes('percent attack-speed'));
  gaze.remaining.push('Vision prerequisites are outside the all-visible arena; neutral/illusion special classifications and exact aura linger remain unverified');

  const walk=registry.faceless_void_time_walk;
  walk.cast=c=>{
    const window=value(c,'BACKTRACK DURATION')+(c.skill.points>=6?.5:0),history=(c.caster.damageHistory??[]) as {time:number;amount:number}[];
    c.heal(c.caster,history.filter(item=>item.time>=c.battle.time-window).reduce((sum,item)=>sum+item.amount,0));
    const dx=c.target.x-c.caster.x,dy=c.target.y-c.caster.y,gap=distance(c.caster,c.target)||1,travel=Math.max(0,Math.min(gap-.8,value(c,'RANGE')/100));
    // Both Wiki and the pinned native speed field specify 3000 units/second.
    const duration=Math.max(STEP,travel/(balanceNumber(c,'acceptance.timeWalk.speed',3000)/100));
    c.status(c.caster,'invulnerable',duration,0,{dispel:'none'});c.status(c.caster,'selfStun',duration,0,{dispel:'none'});c.status(c.caster,'phased',duration,0,{dispel:'none'});
    c.moveContinuous(c.caster,c.caster.x+dx/gap*travel,c.caster.y+dy/gap*travel,{duration,ignoreBarriers:true});
    if(c.skill.points>=6&&c.skill.points<9)c.status(c.caster,'damageDodge',2,.2);
  };
  walk.implemented.push('Pinned 3000-speed continuous travel grants travel invulnerability and action lock; cast heals recorded damage without projectile disjoint');
  walk.remaining=walk.remaining.filter(item=>!item.includes('movement invulnerability'));
  walk.remaining.push('Damage-dodge PRD/mitigation-order parity and HP-removal damage-counter eligibility require engine-level acceptance; endpoint choice remains autonomous AI policy');
}

/** Runs after the existing Tether latch wrapper so its callbacks retain these
 * controls as well as the original summoned-body behavior for other skills. */
export function applyTetherAcceptance(registry:Record<string,SkillProgram>):void{
  const program=registry.wisp_tether,previousCast=program.cast!;
  program.cast=c=>{
    const nextCrossing=new Map<string,number>(),blocked=new Set<string>();
    const wrapped:C={...c,
      damage:(target,amount,type,pierces)=>{
        if((nextCrossing.get(target.id)??0)>c.battle.time){blocked.add(target.id);return 0;}
        blocked.delete(target.id);nextCrossing.set(target.id,c.battle.time+balanceNumber(c,'acceptance.tether.crossingCooldown',7));
        return c.damage(target,amount,type,pierces);
      },
      status:(target,kind,seconds,amount=0,options={})=>{
        if(kind==='stun'&&blocked.has(target.id))return;
        if(kind==='attackSpeedPct')c.status(target,'attackSpeed',seconds,amount*100,options);
        else c.status(target,kind,seconds,amount,options);
      },
      moveContinuous:(target,x,y,options)=>{
        if(target.id===c.caster.id&&['stun','selfStun','hex','banished'].some(kind=>has(target,kind))){
          target.statuses=statuses(target).filter(status=>!(status.skill===c.skill.id&&status.kind==='tether'));
          return false;
        }
        return c.moveContinuous(target,x,y,{...options,ignoreBarriers:true});
      },
    };
    previousCast(wrapped);
  };
  program.onAllyAttack=undefined;
  program.onAllyAttackPoint=c=>{
    if(c.skill.points<9||c.target.side===c.caster.side)return;
    if(['stun','selfStun','hex','banished','disarm'].some(kind=>has(c.caster,kind)))return;
    const link=statuses(c.caster).find(status=>status.kind==='tether'&&status.source===c.caster.id),ally=c.battle.units.find(unit=>unit.id===link?.data?.partnerId);
    if(!link||!ally||ally.dead||link.until<=c.battle.time||link.data?.partnerId!==c.triggerUnitId||distance(c.caster,ally)>Number(link.data?.maxDistance??10))return;
    if(ally?.illusion&&ally.owner===c.caster.id)return;
    c.attack(c.target,1,true,undefined,false,{suppressAllyAttackPoint:true});
  };
  program.implemented.push('Old Shard crossing uses a seven-second per-victim cooldown; flat attack-speed slow; latch crosses terrain and cancels on disabling control; Gaben respects disarm/disable');
  program.implemented.push('Gaben follows the linked ally attack point before accuracy/flight; its own follow-up cannot recursively dispatch another ally-point hook');
  program.remaining.push('Target-speed matching, interrupted latch distance policy and native eligibility of every secondary instant-attack family still need dedicated acceptance');
}
