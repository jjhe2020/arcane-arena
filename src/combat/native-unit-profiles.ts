import {UNIT_CONFIG} from '../config';
import type {CombatUnit} from '../model';

/** A native template supplies attack/motion identity, never AA-authored HP,
 * damage, armor, range, movement speed, duration or inherited abilities.
 * Values are authored in the workbook and compiled before battle creation. */
export function applyNativeUnitProfile(unit:CombatUnit,nativeTemplateId:string):void {
 const profile=UNIT_CONFIG[nativeTemplateId];
 if(!profile)throw new Error(`Unknown native unit profile: ${nativeTemplateId}`);
 const capability=profile.attackCapability;
 if(capability!==0&&capability!==1&&capability!==2)throw new Error(`Invalid native attack capability: ${nativeTemplateId}`);
 if(!(profile.BaseAttackSpeed>0))throw new Error(`Invalid native base attack speed: ${nativeTemplateId}`);
 unit.nativeTemplateId=nativeTemplateId;
 unit.sourceUnitType=nativeTemplateId;
 unit.nativeBaseAttackSpeed=profile.BaseAttackSpeed;
 unit.attackCapability=capability===0?'none':capability===1?'melee':'ranged';
 for(const key of ['attackPoint','attackBackswing','projectileSpeed','turnRate','attackRangeBuffer'] as const){
  const value=profile[key];
  if(!Number.isFinite(value)||value<0)throw new Error(`Invalid native ${key}: ${nativeTemplateId}`);
  unit[key]=value;
 }
}
