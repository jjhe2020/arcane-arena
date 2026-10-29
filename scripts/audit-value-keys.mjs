import ts from 'typescript';
import fs from 'node:fs';
const defs=new Map(JSON.parse(fs.readFileSync('public/data/skills.json','utf8')).map(d=>[d.id,d]));
const warnings=[];const audited=new Set();
for(const filename of ['src/skill-effects.ts','src/skill-effects-extra.ts','src/skill-effects-more.ts']){
 const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(node){
  let id,body;
  if(ts.isCallExpression(node)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&defs.has(node.arguments[0].text)){id=node.arguments[0].text;body=node;}
  if(ts.isBinaryExpression(node)&&ts.isElementAccessExpression(node.left)&&ts.isStringLiteral(node.left.argumentExpression)&&defs.has(node.left.argumentExpression.text)){id=node.left.argumentExpression.text;body=node.right;}
  if(id){audited.add(id);const keys=defs.get(id).values.map(v=>v.slice(0,v.indexOf(':')).trim().toUpperCase());
   function calls(n){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['v','value','skillValue'].includes(n.expression.text)&&n.arguments[1]&&ts.isStringLiteral(n.arguments[1])){const key=n.arguments[1].text.trim().toUpperCase();if(!keys.includes(key)){const fallback=n.arguments[2]?.getText(source)??'0';warnings.push({id,key,fallback,file:filename,line:source.getLineAndCharacterOfPosition(n.getStart()).line+1,availableKeys:keys});}}ts.forEachChild(n,calls);}calls(body);
   return;
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
const report={generatedAt:new Date().toISOString(),note:'Static requested-field audit. Warnings may be explicit reference gaps or deliberate fallbacks; each needs review. This does not prove semantics or dynamic-helper reads.',auditedSkills:audited.size,warningCount:warnings.length,warnings};
fs.writeFileSync('artifacts/value-key-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({auditedSkills:audited.size,warningCount:warnings.length,zeroFallback:warnings.filter(w=>w.fallback==='0').length}));
