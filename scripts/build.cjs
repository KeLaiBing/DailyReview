// Explicit allowlist prevents tests, credentials and local documents entering deployment.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assets=require('./assets.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'dist');
if(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw Error('dist must not be a symlink');
fs.mkdirSync(output,{recursive:true});
const extra=fs.readdirSync(output).filter(name=>!assets.includes(name));
if(extra.length)throw Error('dist contains unexpected files: '+extra.join(', ')+'. Use an empty build directory.');
for(const name of assets){
  const target=path.join(output,name);
  if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('Build target must not be a symlink: '+name);
  const data=fs.readFileSync(path.join(root,name));fs.writeFileSync(target,data);
  console.log(name+'  '+crypto.createHash('sha256').update(data).digest('hex'));
}
console.log('dist contains only six public static assets. Deploy through WorkBuddy.');
