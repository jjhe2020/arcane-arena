import {compileConfiguration} from './config-compiler.mjs';
import {compileUltimateIcons} from './ultimate-icon-assets.mjs';
try{const result=await compileConfiguration(),icons=await compileUltimateIcons();console.log(`配置编译完成 ${result.config.hash} ${JSON.stringify(result.report.counts)}；大招图标 ${icons.count}`);}catch(error){console.error(error.message);process.exitCode=1;}
