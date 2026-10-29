import {compileConfiguration} from './config-compiler.mjs';
try{const result=await compileConfiguration();console.log(`配置编译完成 ${result.config.hash} ${JSON.stringify(result.report.counts)}`);}catch(error){console.error(error.message);process.exitCode=1;}
