const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const core=require('../agent-core.js');
const valid=(scores=[4,4,4])=>({summary:'总结',dimensions:Object.fromEntries(core.keys.map((k,i)=>[k,{score:scores[i],reason:'依据',evidence:['完成三项测试']} ])),suggestions:['明天复查失败样例']});
function withEditor(html,fn){const dom=new JSDOM('<article>'+html+'</article>');try{fn(dom.window.document.querySelector('article'));}finally{dom.window.close();}}
test('Shanghai date changes at UTC 16:00 and rejects invalid calendar dates',()=>{
  assert.equal(core.shanghaiDate(new Date('2026-10-30T15:59:59Z')),'2026-10-30');
  assert.equal(core.shanghaiDate(new Date('2026-10-30T16:00:00Z')),'2026-10-31');
  assert.equal(core.dateOf('日期：2026.2.30'),null);assert.equal(core.dateOf('日期：2026年10月30日'),'2026-10-30');
});
test('today extraction excludes other days and image URLs while retaining table text',()=>{
  withEditor('<h1>2026.10.29</h1><p>yesterday secret</p><h1>2026.10.30</h1><table><tr><td>完成三项测试</td><td><img src="https://secret.invalid/image"></td></tr></table><h1>2026.10.31</h1><p>tomorrow secret</p>',e=>{
    const daily=core.daily(e,'2026-10-30');assert.match(daily.text,/完成三项测试/);assert.doesNotMatch(daily.text,/secret|https/);assert.equal(daily.images,1);
    assert.doesNotMatch(JSON.stringify(core.messages(daily,'成员文档')),/yesterday|tomorrow|secret.invalid/);
  });
});
test('missing, duplicate and empty day headings fail before inference',()=>{
  for(const html of ['<h1>2026.10.29</h1><p>记录</p>','<h1>2026.10.30</h1><p>一</p><h1>2026.10.30</h1><p>二</p>','<h1>2026.10.30</h1><p>前言：</p><p>任务目标：</p><img src="data:image/png;base64,a">'])withEditor(html,e=>assert.throws(()=>core.daily(e,'2026-10-30')));
  withEditor('<h1>2026.10.30</h1><p>'+'字'.repeat(20001)+'</p>',e=>assert.throws(()=>core.daily(e,'2026-10-30'),/20,000/));
});
test('model results require strict scores, non-template exact evidence and complete JSON',()=>{
  assert.equal(core.parse('```json\n'+JSON.stringify(valid())+'\n```','完成三项测试').summary,'总结');
  for(const change of [r=>r.dimensions.action.score='4',r=>r.dimensions.action.score=4.5,r=>r.dimensions.action.evidence=[],r=>r.dimensions.action.evidence=['不存在'],r=>r.summary=' ',r=>r.suggestions=[],r=>r.dimensions.action.evidence=['任务目标']]){const r=valid();change(r);assert.throws(()=>core.validate(r,'完成三项测试\n任务目标'));}
  assert.throws(()=>core.parse('{"summary":','完成三项测试'));
  assert.equal(core.delta({choices:[{delta:{reasoning_content:'private'}}]}),'');
});
test('quality requires all dimensions >=3 and score >=80; milestones count unique dates',()=>{
  assert.deepEqual(core.grade(valid([5,5,2])),{score:80,qualified:false,criteria:[]});
  assert.deepEqual(core.grade(valid([5,4,3])),{score:80,qualified:true,criteria:['specificity','reflection']});
  assert.equal(core.grade(valid([4,4,3])).qualified,false);
  const days=Array.from({length:30},(_,i)=>({review_date:String(i),criteria:['specificity']}));
  assert.equal(core.collection([...days,...days]).count,30);
  assert.deepEqual(core.collection(days).earned,['specificity','quality_3','quality_7','quality_30']);
});
