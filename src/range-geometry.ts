import zoneCalibration from './zone-art-calibration.json';

/** All values in this module are world units. Reference Dota distances are
 * converted once by the skill/configuration boundary (100 Dota = 1 world). */
export interface Annulus {innerRadius:number;outerRadius:number}
export interface RadialMapping extends Annulus {sourceInner:number;sourceOuter:number}
export function plasmaAnnulus(wave:number,offset:number,width:number):Annulus {
  const innerRadius=Math.max(0,offset+wave);
  return {innerRadius,outerRadius:innerRadius+Math.max(0,width)};
}
/** A swept band is the union of the previous and current annulus. The body
 * radius belongs to hit testing, never to the displayed spell boundary. */
export function sweptAnnulusIntersects(distance:number,previous:number,current:number,offset:number,width:number,bodyRadius=0):boolean {
  const inner=plasmaAnnulus(Math.min(previous,current),offset,width).innerRadius;
  const outer=plasmaAnnulus(Math.max(previous,current),offset,width).outerRadius;
  return distance+bodyRadius>=inner-1e-8&&distance-bodyRadius<=outer+1e-8;
}
export function radialSourceRadius(distance:number,mapping:RadialMapping):number {
  return mapping.sourceInner+(distance-mapping.innerRadius)/(mapping.outerRadius-mapping.innerRadius)*(mapping.sourceOuter-mapping.sourceInner);
}
/** Full cell diameter. A fixed art worldSize must not override live AoE. */
export function zoneVisualSize(radius:number,clip?:{image:string}):number {
  const calibration=clip?(zoneCalibration as Record<string,{outerRadius95:number}>)[clip.image]:undefined;
  return Math.max(0,radius)/(calibration?.outerRadius95||.5);
}
