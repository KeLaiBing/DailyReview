const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const tick=()=>new Promise(r=>setTimeout(r,25));
async function app(guest=false){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url:'https://fixture.invalid/',runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window;w.__TEST_GUEST=guest;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.Range.prototype.getBoundingClientRect=()=>({left:20,top:100,bottom:120,width:200,height:20});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.confirm=()=>true;
  w.document.execCommand=(cmd,_,html)=>{if(cmd==='insertHTML'){const s=w.getSelection(),r=s.getRangeAt(0);r.deleteContents();const fragment=r.createContextualFragment(html),last=fragment.lastChild;r.insertNode(fragment);r.setStartAfter(last);r.collapse(true);s.removeAllRanges();s.addRange(r);}return true;};
  ['tests/cloud-fixture.js','collaboration-core.js','editor.js','comment-deletion.js','collaboration.js','agent-core.js','model-client.js','model-settings.js','journal-agent.js'].forEach(file=>new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}).runInContext(dom.getInternalVMContext()));
  await tick();await tick();return {dom,w,$:id=>w.document.getElementById(id)};
}
function select(w,node){const r=w.document.createRange();r.selectNodeContents(node);const s=w.getSelection();s.removeAllRanges();s.addRange(r);w.document.dispatchEvent(new w.Event('selectionchange'));}
function submit(w,form){const button=form.querySelector('button[type="submit"]')||form.querySelector('button.primary');form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));}
function setToday(w,$){$('editor').querySelector('h1').textContent='日期：'+w.JournalAgentCore.shanghaiDate().replaceAll('-','.');}
test('reviewing another member awards that document once and survives reload',async()=>{
 const {dom,w,$}=await app();try{
  $('docList').querySelectorAll('.doc-link')[1].click();await tick();setToday(w,$);
  await $('reviewToday').onclick();await tick();
  assert.equal(w.__fixture.rows.shared_daily_reviews.length,1,$('reviewStatus').textContent);
  const review=w.__fixture.rows.shared_daily_reviews[0];assert.equal(review.document_id,'doc-b');assert.equal(review.reviewer_id,'user-a');
  assert.equal(w.__fixture.rows.shared_quality_days.length,1);assert.match($('badgeCount').textContent,/3 枚/);assert.match($('badgeOwner').textContent,/小周/);
  await $('reviewToday').onclick();assert.equal(w.__fixture.mock.modelCalls,1);assert.equal(w.__fixture.rows.shared_quality_days.length,1);
  await w.__fixture.setUser('user-b');await tick();await w.JournalAgent.loadRemote();assert.match($('dailyReviewResult').textContent,/80/);assert.match($('qualityDayCount').textContent,/1 天/);
 }finally{dom.window.close();}
});
test('guest review requires login; invalid model output and network failures award nothing',async()=>{
 const {dom,w,$}=await app(true);try{
  await $('reviewToday').onclick();assert.ok($('authDialog').open);assert.equal(w.__fixture.mock.modelCalls,0);
  await w.__fixture.setUser('user-a');await tick();setToday(w,$);
  w.__fixture.mock.review='not json';await $('reviewToday').onclick();assert.equal(w.__fixture.rows.shared_daily_reviews.length,0);
  assert.match($('reviewStatus').textContent,/未完成/);
  w.__fixture.mock.modelError=true;await $('reviewToday').onclick();assert.equal(w.__fixture.rows.shared_quality_days.length,0);
 }finally{dom.window.close();}
});
test('save retry persists validated result without spending another model call',async()=>{
 const {dom,w,$}=await app();try{
  setToday(w,$);w.__fixture.mock.saveError=true;await $('reviewToday').onclick();assert.equal(w.__fixture.rows.shared_quality_days.length,0);assert.equal($('retryReviewSave').hidden,false);
  w.__fixture.mock.saveError=false;await $('retryReviewSave').onclick();assert.equal(w.__fixture.rows.shared_quality_days.length,1);assert.equal(w.__fixture.mock.modelCalls,1);
 }finally{dom.window.close();}
});
test('switching documents while inference runs discards the old response',async()=>{
 const {dom,w,$}=await app();try{
  setToday(w,$);let release;w.__fixture.mock.modelGate=new Promise(r=>release=r);
  const pending=$('reviewToday').onclick();await tick();assert.equal(w.__fixture.mock.modelCalls,1);
  $('docList').querySelectorAll('.doc-link')[1].click();await tick();release();await pending;
  assert.equal(w.__fixture.rows.shared_daily_reviews.length,0);assert.equal(w.__fixture.rows.shared_quality_days.length,0);
  assert.match($('reviewTarget').textContent,/小周/);
 }finally{dom.window.close();}
});
test('edited text or an expired session discards an in-flight review',async()=>{
 for(const expire of [false,true]){
  const {dom,w,$}=await app();try{
   setToday(w,$);let release;w.__fixture.mock.modelGate=new Promise(r=>release=r);
   const pending=$('reviewToday').onclick();await tick();
   if(expire){await w.__fixture.setUser(null);await tick();}else $('editor').querySelector('p').textContent='已经改写的日结正文';
   release();await pending;assert.equal(w.__fixture.rows.shared_daily_reviews.length,0);assert.equal(w.__fixture.rows.shared_quality_days.length,0);
  }finally{dom.window.close();}
 }
});
test('rapid repeated review clicks start only one inference',async()=>{
 const {dom,w,$}=await app();try{
  setToday(w,$);await Promise.all([$('reviewToday').onclick(),$('reviewToday').onclick()]);
  assert.equal(w.__fixture.mock.modelCalls,1);assert.equal(w.__fixture.rows.shared_quality_days.length,1);
 }finally{dom.window.close();}
});
test('guest can read but cannot mutate via editor controls, todo or paste',async()=>{
  const {dom,w,$}=await app(true);try{
    assert.equal($('editor').contentEditable,'false');assert.ok($('docTitle').readOnly);
    const original=$('editor').innerHTML;
    $('editor').querySelector('.todo').dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:0}));
    assert.equal($('editor').innerHTML,original);
    assert.ok($('newDoc').disabled);assert.ok($('addDay').disabled);
    const before=new w.Event('beforeinput',{bubbles:true,cancelable:true});$('editor').dispatchEvent(before);assert.ok(before.defaultPrevented);
    select(w,$('editor').querySelector('p'));$('commentSelection').click();assert.ok($('authDialog').open);
    assert.equal(w.__fixture.rows.shared_comment_threads.length,0);
  }finally{dom.window.close();}
});
test('selected template retains tables, images and todos; inserts a chosen daily heading',async()=>{
  const {dom,w,$}=await app();try{
    const image=w.document.createElement('img');image.src='data:image/png;base64,aGVsbG8=';$('editor').querySelectorAll('td')[4].append(image);
    select(w,$('editor'));$('saveSelectionTemplate').click();
    assert.ok($('templatePreview').querySelector('table'));assert.ok($('templatePreview').querySelector('.todo'));assert.ok($('templatePreview').querySelector('img'));
    $('templateName').value='每日复盘';submit(w,$('templateForm'));await tick();
    assert.equal(w.__fixture.rows.shared_templates.length,1);
    $('templateDate').value='2026-11-02';$('templateList').querySelector('button').click();await tick();
    assert.equal([...$('editor').querySelectorAll('h1')].filter(h=>h.textContent==='日期：2026.11.02').length,1);
    assert.ok($('editor').querySelector('h1').textContent.includes('2026.10.30'));
    assert.ok(w.__fixture.rows.shared_documents[0].html.includes('2026.11.02'));
  }finally{dom.window.close();}
});
test('comment on another member document and reply as a second user',async()=>{
  const {dom,w,$}=await app();try{
    $('docList').querySelectorAll('.doc-link')[1].click();await tick();
    select(w,$('editor').querySelector('p'));$('commentSelection').click();$('commentBody').value='这里可以补充过程';submit(w,$('commentForm'));await tick();
    const thread=w.__fixture.rows.shared_comment_threads[0];assert.equal(thread.document_id,'doc-b');assert.equal(thread.owner_id,'user-a');
    await w.__fixture.setUser('user-b');await tick();
    const reply=$('commentList').querySelector('.reply-form');reply.querySelector('textarea').value='已经补充，谢谢';reply.querySelector('button').focus();submit(w,reply);await tick();
    assert.equal(w.__fixture.rows.shared_comment_replies[0].owner_id,'user-b');assert.ok($('commentList').textContent.includes('已经补充，谢谢'),JSON.stringify({active:w.document.activeElement.outerHTML,list:$('commentList').textContent}));
  }finally{dom.window.close();}
});
test('a selection inside a cell remains a valid table in its template',async()=>{
  const {dom,w,$}=await app();try{
    select(w,$('editor').querySelector('td'));$('saveSelectionTemplate').click();
    assert.equal($('templatePreview').querySelector('table td').textContent,'事件');await tick();
  }finally{dom.window.close();}
});
test('image clipboard paste inserts the image within the selected table cell',async()=>{
  const {dom,w,$}=await app();try{
    const cell=$('editor').querySelectorAll('td')[4],r=w.document.createRange();r.selectNodeContents(cell);r.collapse(true);w.getSelection().removeAllRanges();w.getSelection().addRange(r);
    const file=new w.File([Uint8Array.from([137,80,78,71])],'test.png',{type:'image/png'});
    const event=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[{type:'image/png',getAsFile:()=>file}]}});
    $('editor').dispatchEvent(event);await tick();
    assert.ok(cell.querySelector('img'));assert.ok(event.defaultPrevented);
  }finally{dom.window.close();}
});
test('session expiry switches to read-only and retains the visible document',async()=>{
  const {dom,w,$}=await app();try{
    const html=$('editor').innerHTML;await w.__fixture.setUser(null);await tick();
    assert.equal($('editor').contentEditable,'false');assert.equal($('editor').innerHTML,html);
    assert.ok($('docTitle').readOnly);assert.ok($('newDoc').disabled);
  }finally{dom.window.close();}
});
test('stored rich HTML strips scripts, handler attributes and unsafe links',async()=>{
  const {dom,w,$}=await app();try{
    const doc=w.__fixture.rows.shared_documents[1];doc.html='<p onclick="alert(1)">安全文字<script>alert(1)</script></p><a href="javascript:alert(1)">链接</a><img src="x" onerror="alert(1)"><p class="todo" data-done="true">任务</p>';
    // Polling is unnecessary: the same sanitizer is applied to pasted and stored content.
    const safe=w.eval('cleanHTML('+JSON.stringify(doc.html)+')');
    assert.ok(!/script|onclick|onerror|javascript:/i.test(safe));assert.ok(safe.includes('data-done="true"'));
  }finally{dom.window.close();}
});
test('comment author can delete own root while another member reply remains',async()=>{
 const {dom,w,$}=await app();try{
  select(w,$('editor').querySelector('p'));$('commentSelection').click();$('commentBody').value='待删除的评论';submit(w,$('commentForm'));await tick();
  const thread=w.__fixture.rows.shared_comment_threads[0];
  w.__fixture.rows.shared_comment_replies.push({id:'reply-b',thread_id:thread.id,owner_id:'user-b',body:'别人的回复应保留',created:2});
  $('commentsButton').click();await tick();
  assert.equal($('commentList').querySelectorAll('.delete-comment').length,1);
  $('commentList').querySelector('.delete-comment').click();await tick();await tick();
  assert.ok(thread.deleted_at);assert.equal(thread.body,'[已删除]');assert.equal(thread.quote,'[已删除]');
  assert.match($('commentList').textContent,/该评论已删除/);assert.match($('commentList').textContent,/别人的回复应保留/);
  assert.equal($('commentList').querySelector('.quote-link'),null);assert.equal($('commentList').querySelector('.reply-form'),null);
  await w.__fixture.setUser('user-b');await tick();$('commentsButton').click();await tick();
  $('commentList').querySelector('.delete-comment').click();await tick();await tick();
  assert.equal($('commentCount').textContent,'0');assert.match($('commentList').textContent,/暂无评论/);
 }finally{dom.window.close();}
});
test('delete cancellation, failure and stale ownership retain content',async()=>{
 const {dom,w,$}=await app();try{
  select(w,$('editor').querySelector('p'));$('commentSelection').click();$('commentBody').value='保留我的评论';submit(w,$('commentForm'));await tick();
  w.confirm=()=>false;$('commentList').querySelector('.delete-comment').click();await tick();assert.equal(w.__fixture.rows.shared_comment_threads[0].deleted_at,undefined);
  w.confirm=()=>true;w.__fixture.mock.deleteError=true;$('commentList').querySelector('.delete-comment').click();await tick();assert.match($('commentList').textContent,/保留我的评论/);assert.match($('toast').textContent,/删除暂时失败/);
  const button=$('commentList').querySelector('.delete-comment');await w.__fixture.setUser('user-b');await tick();button.click();await tick();assert.equal(w.__fixture.rows.shared_comment_threads[0].deleted_at,undefined);
  $('commentsButton').click();await tick();assert.equal($('commentList').querySelector('.delete-comment'),null);
 }finally{dom.window.close();}
});
test('member badges aggregate all owned documents and days but never other members',async()=>{
  const {dom,w,$}=await app();try{
    const rows=w.__fixture.rows;
    rows.shared_documents.push({id:'doc-a2',member_id:'user-a',owner_id:'user-b'});
    rows.shared_quality_days.push(
      {document_id:'doc-a',review_date:'2026-10-27',criteria:['specificity','action']},
      {document_id:'doc-a2',review_date:'2026-10-27',criteria:['specificity','reflection']},
      {document_id:'doc-a2',review_date:'2026-10-28',criteria:['specificity']},
      {document_id:'doc-a',review_date:'2026-10-29',criteria:['specificity']},
      {document_id:'doc-b',review_date:'2026-10-26',criteria:['action']});
    await w.JournalAgent.loadRemote();
    assert.match($('qualityDayCount').textContent,/3 天.*6 枚/);assert.match($('badgeOwner').textContent,/小林/);
    assert.match($('badgeGrid').children[0].textContent,/× 3/);assert.match($('badgeGrid').children[2].textContent,/× 1/);
    await w.__fixture.setUser('user-b');await tick();await w.JournalAgent.loadRemote();assert.match($('badgeCount').textContent,/6 枚/);
    $('documentMember').value='user-b';await $('documentMember').onchange();await tick();
    assert.equal(rows.shared_documents[0].member_id,'user-b');assert.match($('badgeOwner').textContent,/小周/);
    assert.equal(rows.shared_documents[0].owner_id,'user-a');
  }finally{dom.window.close();}
});
test('switching native models re-evaluates one day without duplicating its badges',async()=>{
  const {dom,w,$}=await app();try{
    $('editor').innerHTML=require('./daily-review-sample.cjs')(w.JournalAgentCore.shanghaiDate());
    await $('reviewToday').onclick();assert.equal(w.__fixture.mock.modelCalls,1);
    assert.doesNotMatch(w.__fixture.mock.lastRequest.messages[1].content,/NEIGHBOR_ONLY|FUTURE_ONLY/);
    assert.match(w.__fixture.mock.lastRequest.messages[1].content,/明天9点到10点/);
    $('reviewModel').value='fixture-second';$('reviewModel').onchange();await $('reviewToday').onclick();
    assert.equal(w.__fixture.mock.modelCalls,2);assert.equal(w.__fixture.rows.shared_daily_reviews[0].model,'fixture-second');
    assert.equal(w.__fixture.rows.shared_quality_days.length,1);assert.match($('badgeCount').textContent,/3 枚/);
    await $('reviewToday').onclick();assert.equal(w.__fixture.mock.modelCalls,2);
  }finally{dom.window.close();}
});
test('API preferences survive reopening, keys stay out of storage and are cleared on account switch',async()=>{
  const {dom,w,$}=await app();try{
    $('modelSettingsButton').click();await tick();$('modelProvider').value='api';$('modelProvider').onchange();
    $('apiBaseUrl').value='https://sample.invalid/v1';$('apiModel').value='sample-model';$('apiKey').value='test-only-secret';
    submit(w,$('modelSettingsForm'));assert.equal($('modelSettingsDialog').open,false);
    assert.ok(!JSON.stringify({...w.localStorage}).includes('test-only-secret'));
    assert.equal((await w.JournalModelSettings.selected()).apiKey,'test-only-secret');
    $('modelSettingsButton').click();assert.equal($('apiModel').value,'sample-model');$('modelSettingsDialog').close();
    await w.__fixture.setUser('user-b');await tick();assert.equal((await w.JournalModelSettings.selected()).provider,'workbuddy');
    await w.__fixture.setUser('user-a');await tick();const restored=await w.JournalModelSettings.selected();
    assert.equal(restored.provider,'api');assert.equal(restored.apiModel,'sample-model');assert.equal(restored.apiKey,'');
  }finally{dom.window.close();}
});
test('custom API review saves validated output; failures never fall back or award badges',async()=>{
  const {dom,w,$}=await app();try{
    setToday(w,$);$('modelSettingsButton').click();await tick();$('modelProvider').value='api';$('apiBaseUrl').value='https://sample.invalid/v1';$('apiModel').value='sample';$('apiKey').value='test-only-secret';submit(w,$('modelSettingsForm'));
    w.fetch=async()=>({ok:false,status:401});await $('reviewToday').onclick();
    assert.equal(w.__fixture.mock.modelCalls,0);assert.equal(w.__fixture.rows.shared_quality_days.length,0);assert.match($('reviewStatus').textContent,/401/);
    let request;
    w.fetch=async(url,options)=>{request=options;const source=JSON.parse(JSON.parse(options.body).messages[1].content).record;
      const review={summary:'API 测试',dimensions:Object.fromEntries(['specificity','reflection','action'].map(k=>[k,{score:4,reason:'测试依据',evidence:[source.split('\n')[0]]}])),suggestions:['明确下一步']};
      return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(review)},finish_reason:'stop'}]})};};
    await $('reviewToday').onclick();assert.equal(w.__fixture.rows.shared_daily_reviews.length,1,$('reviewStatus').textContent);
    assert.equal(request.headers.Authorization,'Bearer test-only-secret');assert.equal(w.__fixture.mock.modelCalls,0);
    assert.ok(!JSON.stringify(w.__fixture.rows).includes('test-only-secret'));
  }finally{dom.window.close();}
});
test('template reuses equivalent dates and saves exactly one top-level date heading',async()=>{
  const {dom,w,$}=await app();try{
    $('editor').innerHTML='<h1>日期：2026年11月2日</h1><p>保留已有记录</p>';
    w.__fixture.rows.shared_templates.push({id:'template-test',owner_id:'user-a',name:'测试模板',created:1,html:'<h1>2020-1-1</h1><h1>任务</h1><table><tr><td>复盘内容</td></tr></table><p class="todo" data-done="false">行动</p>'});
    $('templatesButton').click();await tick();$('templateDate').value='2026-11-02';$('templateList').querySelector('button').click();await tick();
    assert.equal($('editor').querySelectorAll('h1').length,1);assert.ok($('editor').querySelector('h2'));
    assert.match($('editor').textContent,/保留已有记录/);assert.doesNotMatch($('editor').textContent,/2020/);
    assert.equal(w.__fixture.rows.shared_documents[0].html,$('editor').innerHTML);
    assert.match($('outlineItems').textContent,/2026年11月2日/);
  }finally{dom.window.close();}
});
test('connection testing sends only a test sentence and no journal or cloud write',async()=>{
  const {dom,w,$}=await app();try{
    $('modelSettingsButton').click();await tick();await $('testModelConnection').onclick();
    assert.match($('modelSettingsStatus').textContent,/连接成功/);
    assert.equal(w.__fixture.mock.lastRequest.messages[0].role,'system');
    assert.equal(w.__fixture.mock.lastRequest.messages[1].content,'连接测试，请只回复“连接成功”。');
    assert.equal(w.__fixture.rows.shared_daily_reviews.length,0);assert.equal(w.__fixture.rows.shared_quality_days.length,0);
  }finally{dom.window.close();}
});
test('changing the member during inference discards the result instead of awarding someone else',async()=>{
  const {dom,w,$}=await app();try{
    setToday(w,$);let release;w.__fixture.mock.modelGate=new Promise(r=>release=r);
    const pending=$('reviewToday').onclick();await tick();
    $('documentMember').value='user-b';await $('documentMember').onchange();release();await pending;
    assert.equal(w.__fixture.rows.shared_daily_reviews.length,0);assert.equal(w.__fixture.rows.shared_quality_days.length,0);
    assert.match($('badgeOwner').textContent,/小周/);
  }finally{dom.window.close();}
});
test('remote member changes update the selector and badge owner on synchronization',async()=>{
  const {dom,w,$}=await app();try{
    w.__fixture.rows.shared_documents[0].member_id='user-b';w.__fixture.rows.shared_documents[0].rev++;
    await w.eval('sync()');await tick();
    assert.equal($('documentMember').value,'user-b');assert.match($('badgeOwner').textContent,/小周/);
  }finally{dom.window.close();}
});
test('a real-style multiline evidence response completes review and saves only once',async()=>{
  const {dom,w,$}=await app();try{
    setToday(w,$);$('editor').innerHTML+='<p>完成三项测试<br>逐一复核结果</p>';
    const evidence='完成三项测试\n逐一复核结果';
    const review={summary:'跨行引文测试',dimensions:Object.fromEntries(['specificity','reflection','action'].map(k=>[k,{score:4,reason:'有明确记录',evidence:[evidence]}])),suggestions:['明天核对结果']};
    w.__fixture.mock.review=JSON.stringify(review).replaceAll('\\n','\n');
    await $('reviewToday').onclick();
    assert.equal(w.__fixture.rows.shared_daily_reviews.length,1,$('reviewStatus').textContent);
    assert.equal(w.__fixture.rows.shared_daily_reviews[0].review.dimensions.action.evidence[0],evidence);
    assert.match($('dailyReviewResult').textContent,/跨行引文测试/);
    assert.match($('badgeCount').textContent,/3 枚/);
    await $('reviewToday').onclick();assert.equal(w.__fixture.mock.modelCalls,1);assert.equal(w.__fixture.rows.shared_quality_days.length,1);
  }finally{dom.window.close();}
});
