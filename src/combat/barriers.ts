import type { BattleState,CombatUnit } from '../model';
export interface Point {x:number;y:number}
export interface BattleBarrier {side?:number;blocks?:'all'|'enemies';id:string;source:string;skill:string;from:Point;to:Point;width:number;until:number;createdAt:number;visual?:{group:string;centerX:number;centerY:number;angle:number}}
const RADIUS=.4;
const bounds={x:14.57-RADIUS,y:12.916-RADIUS};
const clamp=(p:Point):Point=>({x:Math.max(-bounds.x,Math.min(bounds.x,p.x)),y:Math.max(-bounds.y,Math.min(bounds.y,p.y))});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
function closest(p:Point,a:Point,b:Point):Point {const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return {x:a.x+t*dx,y:a.y+t*dy};}
const pointDistance=(p:Point,a:Point,b:Point)=>distance(p,closest(p,a,b));
function cross(a:Point,b:Point,c:Point){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function segmentDistance(a:Point,b:Point,c:Point,d:Point):number{
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
  return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
export function barriers(b:BattleState):BattleBarrier[]{return (b.barriers??[]) as BattleBarrier[];}
function phased(u:CombatUnit){return u.statuses.some(s=>['phased','banished','freePathing','fly','flying'].includes(s.kind));}
export function addBarrier(b:BattleState,source:CombatUnit,skill:string,from:Point,to:Point,width:number,duration:number,visual?:BattleBarrier['visual'],blocks:'all'|'enemies'='all'):void{
  if(![from.x,from.y,to.x,to.y,width,duration].every(Number.isFinite)||width<=0||duration<=0)return;
  b.nextBarrierId=Number(b.nextBarrierId??0)+1;
  barriers(b).push({id:`wall:${b.nextBarrierId}`,source:source.id,side:source.side,blocks,skill,from:clamp(from),to:clamp(to),width,until:b.time+duration,createdAt:b.time,visual:visual?{...visual}:undefined});
  for(const u of b.units)if(!u.dead)resolveBarrierOverlap(b,u);
}
function clearSegment(a:Point,b:Point,walls:BattleBarrier[],allowExit=false):boolean{
  return walls.every(w=>{const clearance=w.width/2+RADIUS;if(allowExit&&pointDistance(a,w.from,w.to)<clearance-1e-6&&pointDistance(b,w.from,w.to)>pointDistance(a,w.from,w.to))return true;return segmentDistance(a,b,w.from,w.to)>=clearance-1e-6;});
}
interface Graph { signature:string;points:Point[];edges:{to:number;cost:number}[][] }
const graphs=new WeakMap<BattleState,Graph>();
function graph(b:BattleState,walls:BattleBarrier[]):Graph{
  const signature=walls.map(w=>w.id).join('|'),old=graphs.get(b);if(old?.signature===signature)return old;
  const points:Point[]=[];
  for(const wall of walls){const radius=(wall.width/2+RADIUS)*1.2+.03;for(const end of [wall.from,wall.to])for(let i=0;i<8;i++){const p=clamp({x:end.x+Math.cos(i*Math.PI/4)*radius,y:end.y+Math.sin(i*Math.PI/4)*radius});if(walls.every(w=>pointDistance(p,w.from,w.to)>=w.width/2+RADIUS+.01)&&!points.some(t=>distance(t,p)<.01))points.push(p);}}
  const edges=points.map(()=>[] as {to:number;cost:number}[]);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(clearSegment(points[i],points[j],walls)){const cost=distance(points[i],points[j]);edges[i].push({to:j,cost});edges[j].push({to:i,cost});}
  const value={signature,points,edges};graphs.set(b,value);return value;
}
/** Deterministic visibility-graph routing around wall endpoints. Static edges
 * are cached while the barrier set is unchanged; origin/target edges are live. */
export function routeAroundBarriers(b:BattleState,u:CombatUnit,target:Point):Point{
  const walls=barriers(b).filter(w=>w.blocks!=='enemies'||w.side!==u.side);if(phased(u)||!walls.length||clearSegment(u,target,walls,true))return target;
  const g=graph(b,walls),points=[u,target,...g.points],count=points.length,costs=new Array<number>(count).fill(Infinity),previous=new Array<number>(count).fill(-1),visited=new Set<number>();costs[0]=0;
  const startEdges=g.points.map((p,i)=>({to:i+2,cost:distance(u,p)})).filter(e=>clearSegment(u,points[e.to],walls,true));
  const goalEdges=g.points.map(p=>clearSegment(p,target,walls));
  for(let iteration=0;iteration<count;iteration++){
    let node=-1;for(let i=0;i<count;i++)if(!visited.has(i)&&Number.isFinite(costs[i])&&(node<0||costs[i]<costs[node]-1e-8))node=i;
    if(node<0||node===1)break;visited.add(node);
    const edges=node===0?startEdges:[...g.edges[node-2].map(e=>({to:e.to+2,cost:e.cost})),...(goalEdges[node-2]?[{to:1,cost:distance(points[node],target)}]:[])];
    for(const edge of edges){const candidate=costs[node]+edge.cost;if(candidate<costs[edge.to]-1e-8){costs[edge.to]=candidate;previous[edge.to]=node;}}
  }
  if(previous[1]<0)return {x:u.x,y:u.y};let next=1;while(previous[next]>0)next=previous[next];return points[next];
}
export function resolveBarrierOverlap(b:BattleState,u:CombatUnit):void{
  if(phased(u))return;
  for(let pass=0;pass<4;pass++){let moved=false;for(const wall of barriers(b).filter(w=>w.blocks!=='enemies'||w.side!==u.side)){const foot=closest(u,wall.from,wall.to),gap=distance(u,foot),clearance=wall.width/2+RADIUS;if(gap>=clearance-1e-8)continue;let dx=u.x-foot.x,dy=u.y-foot.y;if(gap<1e-8){dx=wall.to.y-wall.from.y;dy=wall.from.x-wall.to.x;if(!dx&&!dy)dx=1;const sign=u.id.charCodeAt(u.id.length-1)%2?1:-1;dx*=sign;dy*=sign;}const length=Math.hypot(dx,dy)||1,p=clamp({x:foot.x+dx/length*(clearance+.001),y:foot.y+dy/length*(clearance+.001)});u.x=p.x;u.y=p.y;moved=true;}if(!moved)break;}
}
