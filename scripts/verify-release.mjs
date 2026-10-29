import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const readJSON=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const [assets,skills,coverage,config,configReport]=await Promise.all(['assets','skills','mechanics-coverage','game-config','config-report'].map(name=>readJSON(`dist/data/${name}.json`)));
for(const name of ['assets','skills','mechanics-coverage','game-config','config-report'])assert.equal(await fs.readFile(`dist/data/${name}.json`,'utf8'),await fs.readFile(`public/data/${name}.json`,'utf8'),`Stale production ${name}`);
assert.equal(await fs.readFile('src/generated/game-config.json','utf8'),await fs.readFile('dist/data/game-config.json','utf8'),'Compiled runtime configuration mismatch');
assert.equal(config.hash,configReport.hash);assert.equal(config.hash,coverage.configHash);
assert.equal(configReport.counts.skills,230);assert.equal(configReport.counts.granted,73);
assert.ok(skills.every(skill=>skill.configHash===config.hash&&[1,2,3,6,9].every(tier=>skill.balanceLevels[String(tier)])), 'Missing configured AA tier');
const images=new Set();
function collect(value){if(typeof value==='string'&&/^\/art\/.*\.(png|webp|jpg)$/.test(value))images.add(value);else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
collect(assets);collect(skills);
await Promise.all([...images].map(path=>fs.access(`dist${path}`)));
assert.equal(skills.length,230);assert.equal(Object.keys(assets.characters).length,8);
const assetsReport={status:'passed',generatedAt:new Date().toISOString(),simulationRevision:coverage.simulationRevision,configHash:config.hash,configuration:configReport.counts,imageReferences:images.size,characterAppearances:Object.keys(assets.characters).length,mobileAtlases:Object.keys(assets.mobileAtlases??{}).length,sourceAndProductionDataIdentical:true};
await fs.writeFile('artifacts/release-assets-check.json',JSON.stringify(assetsReport,null,2));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.ARENA_TEST_URL??'http://localhost:4173');await page.waitForFunction(()=>window.arena?.renderer?.diagnostics().gpuTextures>0);
 const actual=await page.evaluate(async()=>({revision:(await(await fetch('/data/mechanics-coverage.json')).json()).simulationRevision,poolSize:window.arena.state.matchSkillIds.length,diagnostics:window.arena.renderer.diagnostics()}));
 assert.equal(actual.revision,coverage.simulationRevision);assert.equal(actual.poolSize,100);assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
 await fs.writeFile('artifacts/production-release-check.json',JSON.stringify({status:'passed',generatedAt:new Date().toISOString(),...actual,errors},null,2));
 console.log({status:'passed',revision:actual.revision,images:images.size,mobileAtlases:assetsReport.mobileAtlases});
}finally{await browser.close();}
