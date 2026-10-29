import {compileConfiguration} from './config-compiler.mjs';
try{const result=await compileConfiguration({check:true});console.log(`配置一致 ${result.config.hash}`);}catch(error){console.error(error.message);process.exitCode=1;}
