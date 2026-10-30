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
  ['tests/cloud-fixture.js','collaboration-core.js','editor.js','comment-deletion.js','collaboration.js'].forEach(file=>new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}).runInContext(dom.getInternalVMContext()));
  await tick();await tick();return {dom,w,$:id=>w.document.getElementById(id)};
}
function select(w,node){const r=w.document.createRange();r.selectNodeContents(node);const s=w.getSelection();s.removeAllRanges();s.addRange(r);w.document.dispatchEvent(new w.Event('selectionchange'));}
function submit(w,form){const button=form.querySelector('button[type="submit"]')||form.querySelector('button.primary');form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));}
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
    assert.equal($('editor').querySelector('h1').textContent,'日期：2026.11.02');
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
