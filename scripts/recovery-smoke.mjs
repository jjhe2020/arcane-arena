import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const b=await chromium.launch({headless:true});
await fs.mkdir('artifacts',{recursive:true});
try{const p=await b.newPage({viewport:{width:1280,height:720},acceptDownloads:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const old=JSON.stringify({state:JSON.stringify({version:-1,seed:743,round:12}),note:'preserve old save'});
 await p.addInitScript(raw=>{if(!localStorage.getItem('recovery-test-seeded')){localStorage.setItem('arcane-arena.save.v1',raw);localStorage.setItem('recovery-test-seeded','1');}},old);
 await p.goto(process.env.ARENA_TEST_URL??'http://localhost:4173');await p.waitForFunction(()=>window.arena);
 await p.locator('.recovery-notice').waitFor();const stored=await p.evaluate(()=>({current:localStorage.getItem('arcane-arena.save.v1'),backup:localStorage.getItem('arcane-arena.save.v1.previous')}));if(stored.current!==old||stored.backup!==old)throw Error('旧存档未原样保留');
 const download=p.waitForEvent('download');await p.locator('[data-action=backupSave]').click();const file=await download;await file.saveAs('artifacts/recovery-export.json');if(await fs.readFile('artifacts/recovery-export.json','utf8')!==old)throw Error('导出内容改变');
 await p.locator('[data-action=newGame]').click();const after=await p.evaluate(()=>({current:localStorage.getItem('arcane-arena.save.v1'),backup:localStorage.getItem('arcane-arena.save.v1.previous')}));if(after.current===old||after.backup!==old)throw Error('新对局未保存或覆盖备份');
 await p.reload();await p.waitForFunction(()=>window.arena);if(await p.locator('.recovery-notice').count())throw Error('新版本对局重复拒绝恢复');if(errors.length)throw Error(errors.join('\n'));
 await p.waitForTimeout(500);const loadErrors=await p.evaluate(()=>window.arena.renderer.loadErrors);if(errors.length||loadErrors.length)throw Error(JSON.stringify({errors,loadErrors}));
 await fs.writeFile('artifacts/recovery-smoke.json',JSON.stringify({status:'passed',checks:['旧存档原样保留','备份下载逐字节一致','开始新对局后保留原备份','新版本存档可再次恢复'],errors,loadErrors},null,2));console.log('Save recovery browser test passed');
}finally{await b.close();}
