const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=[...require('./assets.cjs').filter(n=>n.endsWith('.js')),...fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs')).map(n=>'scripts/'+n),...fs.readdirSync(path.join(root,'tests')).filter(n=>/\.(js|cjs)$/.test(n)).map(n=>'tests/'+n)];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('JavaScript syntax checks passed.');
