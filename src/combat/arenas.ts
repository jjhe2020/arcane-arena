import type {CombatUnit} from '../model';
export interface ArenaRegion {source:string;side:number;x:number;y:number;radius:number;until:number}
export function arenaBlocksAttack(b:{time:number;arenas?:unknown},source:CombatUnit,from:{x:number;y:number},to:{x:number;y:number}):boolean{
 for(const arena of (b.arenas??[]) as ArenaRegion[]){if(arena.until<=b.time||arena.side===source.side)continue;const ax=from.x-arena.x,ay=from.y-arena.y,bx=to.x-arena.x,by=to.y-arena.y,a=Math.hypot(ax,ay),d=Math.hypot(bx,by),r=arena.radius;if((a<r)!==(d<r))return true;const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len)):0;if(a>=r&&d>=r&&Math.hypot(ax+t*dx,ay+t*dy)<r)return true;}return false;
}
