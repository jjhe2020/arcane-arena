import type {BattleReplayFile} from './replay';

const memory=new Map<string,BattleReplayFile>();
let database:Promise<IDBDatabase>|undefined;
function open():Promise<IDBDatabase>{
  return database??=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('浏览器不支持录像存储'));return;}
    const request=indexedDB.open('arcane-arena-replays',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('battles',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(request.error??Error('录像存储不可用'));};
    request.onblocked=()=>{database=undefined;reject(Error('录像存储被另一个页面占用'));};
  });
}
async function transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('battles',mode),request=action(tx.objectStore('battles'));let result:T;
    request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error??request.error);tx.onabort=()=>reject(tx.error??Error('录像存储事务中断'));
  });
}
export async function archiveReplay(file:BattleReplayFile):Promise<void>{memory.set(file.id,file);await transaction('readwrite',store=>store.put(file));}
export async function readReplay(id:string):Promise<BattleReplayFile|undefined>{return memory.get(id)??await transaction('readonly',store=>store.get(id)) as BattleReplayFile|undefined;}
export async function clearReplayArchive():Promise<void>{await transaction('readwrite',store=>store.clear());memory.clear();}
export async function replayArchiveCount():Promise<number>{return transaction('readonly',store=>store.count());}
