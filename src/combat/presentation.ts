import type {CombatUnit,UnitTransform} from '../model';

/** Presentation-only interpolation; never writes back to deterministic state. */
export function interpolatedTransform(unit:CombatUnit,alpha=1):UnitTransform{
 const current={x:unit.x,y:unit.y,facing:unit.facing,warpSequence:unit.warpSequence??0},previous=unit.previousTransform;
 if(!previous||previous.warpSequence!==current.warpSequence)return current;
 const blend=Math.max(0,Math.min(1,Number.isFinite(alpha)?alpha:1));
 const arc=Math.atan2(Math.sin(current.facing-previous.facing),Math.cos(current.facing-previous.facing));
 return{x:previous.x+(current.x-previous.x)*blend,y:previous.y+(current.y-previous.y)*blend,facing:previous.facing+arc*blend,warpSequence:current.warpSequence};
}
