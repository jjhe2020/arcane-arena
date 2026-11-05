import {equippedGodPoints,godTarget,ogreMulticastChance} from '../gods';
import type {BattleState,CombatUnit,Player,SkillStack} from '../model';

export function initializeGods(battle:BattleState,players:Player[],round:number,random:()=>number):void {
  for(const player of players){
    if(!player.god)continue;
    const god=player.god,heroes=battle.units.filter(unit=>unit.side===player.id);
    for(const hero of heroes){
      hero.godId=god.id;
      if(god.id==='phantomAssassin')hero.godTravel=0;
      if(god.id==='selemene')hero.godSpellAmp=0;
    }
    const blessed=heroes.find(hero=>hero.heroId===godTarget(player)?.id);
    if(blessed){
      if(god.id==='centaur'){
        blessed.hp+=70*round;blessed.maxHp+=70*round;
        blessed.godRetaliate=.35;
      }else if(god.id==='legionCommander')blessed.attack+=god.legionAttack??0;
      else if(god.id==='ogreMagi')blessed.godMulticast=ogreMulticastChance(equippedGodPoints(player));
      else if(god.id==='kanna')blessed.godSummonAttackSpeed=0;
    }
    if(god.id==='bathtimeAghanim'){
      const skills=heroes.flatMap(unit=>unit.skills).filter((skill):skill is SkillStack=>!!skill);
      // Resolve each bracket from the actual equipped points so an upgraded
      // skill cannot receive another threshold in the same combat.
      for(const [shopLevel,min,max]of [[5,6,9],[4,3,6],[2,1,3]]){
        if(player.shopLevel<shopLevel)continue;
        const options=skills.filter(skill=>skill.points>=min&&skill.points<max);
        if(!options.length)continue;
        const skill=options[Math.floor(random()*options.length)];
        if(skill.points<6&&max>=6)skill.superRound=round;
        skill.points=max;
      }
    }
  }
}

export function recordGodManaSpend(battle:BattleState,caster:CombatUnit,mana:number):void {
  if(caster.godId!=='selemene'||mana<=0)return;
  for(const unit of battle.units)if(unit.side===caster.side&&unit.godSpellAmp!==undefined)unit.godSpellAmp+=mana*.00015;
}

export function recordGodSummon(battle:BattleState,unit:CombatUnit):void {
  if(unit.godId!=='kanna'||unit.illusion)return;
  const blessed=battle.units.find(hero=>hero.side===unit.side&&!hero.summoned&&hero.godSummonAttackSpeed!==undefined);
  if(!blessed)return;
  const speed=(blessed.godSummonAttackSpeed??0)+5;
  blessed.godSummonAttackSpeed=speed;
  for(const ally of battle.units)if(ally.side===unit.side&&ally.summoned&&!ally.illusion)ally.godSummonAttackSpeed=speed;
}
