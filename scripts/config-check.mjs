import {compileConfiguration} from './config-compiler.mjs';
import {compileUltimateIcons} from './ultimate-icon-assets.mjs';
try{const result=await compileConfiguration({check:true}),icons=await compileUltimateIcons({check:true});console.log(`配置一致 ${result.config.hash}；大招图标 ${icons.count}`);}catch(error){console.error(error.message);process.exitCode=1;}
