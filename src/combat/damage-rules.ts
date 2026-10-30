/** Independent percentage sources combine by multiplying their complements.
 * Source exceptions (for example one shared aura group) must be selected before
 * entering this function; it deliberately does not guess stacking groups. */
export function independentFraction(values:readonly number[],minimum=0,maximum=1):number {
  return 1-values.reduce((remaining,value)=>remaining*(1-Math.max(minimum,Math.min(maximum,Number.isFinite(value)?value:0))),1);
}
export interface CriticalRoll { key:string; multiplier:number; roll:()=>boolean; lifesteal?:number;priority?:number;onSelected?:()=>void }
/** Since 7.30 chance-based criticals roll strongest first and stop on success.
 * Counter consumption belongs to each caller's contact hook. This selector
 * does not establish native ready-counter or variable-versus-fixed ordering. */
export function selectCritical(choices:CriticalRoll[]):{multiplier:number;lifesteal:number;key?:string} {
  for(const choice of [...choices].sort((a,b)=>b.multiplier-a.multiplier||(b.priority??0)-(a.priority??0)||a.key.localeCompare(b.key))) {
    if(choice.multiplier>1&&choice.roll()){choice.onSelected?.();return{multiplier:choice.multiplier,lifesteal:choice.lifesteal??0,key:choice.key};}
  }
  return{multiplier:1,lifesteal:0};
}
