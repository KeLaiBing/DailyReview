// Static, isolated development preview. No real cloud writes or SMS requests.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets=new Set([...require('./assets.cjs'),'tests/cloud-fixture.js']);
const port=Number(process.env.PORT||5173);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be 1..65535');
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';}catch{res.writeHead(400);res.end();return;}
  if(!assets.has(name)){res.writeHead(404);res.end('Not found');return;}
  try{
    let data=fs.readFileSync(path.join(root,name));
    if(name==='index.html')data=Buffer.from(data.toString('utf8')
      .replace(/<script src="https:\/\/cdn\.jsdelivr[^\"]+"><\/script>/,'<script src="tests/cloud-fixture.js"></script>')
      .replace('<title>反馈机</title>','<title>反馈机 · 本地演示</title>')
      .replace('</body>','<div style="position:fixed;bottom:0;left:0;right:0;z-index:100;background:#fff4d6;text-align:center;font:12px/24px sans-serif">本地演示 · 不连接云端或发送短信 · 测试验证码 123456 · 刷新后重置</div></body>'));
    res.writeHead(200,{'Content-Type':(name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript')+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(500);res.end('Unable to read preview asset');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local fixture preview: http://127.0.0.1:${port} (no production writes)`));
