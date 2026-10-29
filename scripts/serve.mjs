import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream';
import path from 'node:path';
import {spawn} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
if(!existsSync(path.join(root,'index.html'))){console.error('请先运行 npm install 和 npm run build');process.exit(1);}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const port=Number(process.env.PORT)||4173;
const server=createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  let target,stat;
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.includes('\0')){res.writeHead(400).end();return;}
    target=path.resolve(root,'.'+pathname);
    if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    stat=statSync(target);
    if(stat.isDirectory()){target=path.join(target,'index.html');stat=statSync(target);}
    if(!stat.isFile()){res.writeHead(404).end();return;}
  }catch{res.writeHead(404).end('Not found');return;}
  const type=types[path.extname(target)]||'application/octet-stream';
  const etag=`"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const compressible=/^text\/|application\/json|image\/svg/.test(type);
  res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-cache');res.setHeader('ETag',etag);
  if(compressible)res.setHeader('Vary','Accept-Encoding');
  if(req.headers['if-none-match']?.split(/\s*,\s*/).includes(etag)){res.writeHead(304).end();return;}
  const gzip=compressible&&/\bgzip\b/.test(req.headers['accept-encoding']??'');
  if(gzip)res.setHeader('Content-Encoding','gzip');else res.setHeader('Content-Length',stat.size);
  if(req.method==='HEAD'){res.end();return;}
  const streams=[createReadStream(target),...(gzip?[createGzip()]:[]),res];
  pipeline(streams,error=>{if(error&&!res.destroyed)res.destroy(error);});
});
server.on('error',error=>{console.error(`游戏服务启动失败：${error.message}`);process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>{
  const url=`http://localhost:${port}`;
  console.log(`秘境竞技场已启动：${url}\n手机可通过此电脑的局域网IP和端口${port}访问。\n关闭此窗口可停止服务。`);
  if(process.argv.includes('--open')&&process.platform==='win32')spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});
});
