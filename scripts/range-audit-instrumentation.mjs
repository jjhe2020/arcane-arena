import ts from 'typescript';
import path from 'node:path';

/** Audit-only function provenance. No repository source is rewritten. The
 * final registry callbacks retain their behavior and receive their original
 * TypeScript file/line, so overridden earlier registrations are not mistaken
 * for the program which actually executes. */
export function rangeAuditProvenance(root){return {
 name:'range-audit-function-provenance',enforce:'pre',
 transform(code,id){
  const filename=id.split('?')[0];if(!filename.startsWith(path.join(root,'src'))&&!filename.replaceAll('\\','/').startsWith(root.replaceAll('\\','/')+'src/'))return;
  if(!filename.endsWith('.ts'))return;
  const original=ts.createSourceFile(filename,code,ts.ScriptTarget.Latest,true);
  const transformer=context=>{
   const f=context.factory;
   const location=node=>f.createObjectLiteralExpression([
    f.createPropertyAssignment('file',f.createStringLiteral(path.relative(root,filename).replaceAll('\\','/'))),
    f.createPropertyAssignment('line',f.createNumericLiteral(original.getLineAndCharacterOfPosition(node.getStart(original)).line+1))
   ]);
   const metadata=node=>f.createObjectLiteralExpression([f.createPropertyAssignment('__rangeAuditLocation',location(node))]);
   const visitor=node=>{
    const visited=ts.visitEachChild(node,visitor,context);
    if(ts.isArrowFunction(node)||ts.isFunctionExpression(node))return f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('Object'),'assign'),undefined,[visited,metadata(node)]);
    if(ts.isFunctionDeclaration(node)&&node.name&&node.body)return[visited,f.createExpressionStatement(f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('Object'),'assign'),undefined,[f.createIdentifier(node.name.text),metadata(node)]))];
    return visited;
   };
   return source=>ts.visitNode(source,visitor);
  };
  return {code:ts.transpileModule(code,{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},transformers:{before:[transformer]}}).outputText,map:null};
 }
};}
