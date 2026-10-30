'use strict';
window.Collaboration = (() => {
  let user=null, pendingOtp=null, authGeneration=0, templates=[], templateHTML='', commentDraft=null;
  let threads=[], replies=[], profiles=new Map(), commentsDoc=null, commentsVersion='', loadingComments=false;
  let highlightTimer, otpTimer, lastProfiles=0;
  let commentsGeneration=0;
  const replyDrafts=new Map();
  const table=name=>cloud.database.from(name);
  const run=async query=>unwrap(await query);
  const errorText=e=>e?.message || '操作失败，请重试';
  const nameOf=id=>profiles.get(id) || ('成员 '+String(id).slice(-6));
  function login() {
    if(!shared) {toast('请通过已发布的云端网址注册和登录');return;}
    $('authError').textContent=''; $('authDialog').showModal();
  }
  function requireUser() {if(user)return true;login();return false;}
  function applyAccess() {
    const allowed=Boolean(user);
    document.body.classList.toggle('read-only',!allowed);
    editor.contentEditable=String(allowed && Boolean(current)); editor.setAttribute('aria-readonly',String(!allowed || !current));
    ['docTitle','workspaceName','folderName'].forEach(id=>$(id).readOnly=!allowed);
    ['newDoc','addDay'].forEach(id=>$(id).disabled=!allowed);
    renderMember();
    $('accountButton').textContent=allowed?nameOf(user.id):'登录 / 注册';
    $('accessBanner').firstChild.textContent=allowed?'已登录 · 成员可共同编辑，也可划词评论。':'游客模式 · 登录后可编辑文档、保存模板和参与评论。';
    $('loginLink').hidden=allowed;
    $('retrySave').hidden=!allowed || savedRevision===revision;
    closeMenus(); renderList();window.dispatchEvent(new Event('journal-access-changed'));
  }
  async function refreshSession() {
    const generation=++authGeneration;
    try {
      const session=unwrap(await cloud.auth.getSession());
      if(generation!==authGeneration)return;
      const next=session?.user || null;
      if(user?.id!==next?.id) { templates=[]; templateHTML=''; $('templateForm').hidden=true; $('templatePreview').replaceChildren(); $('templateList').replaceChildren(); }
      user=next; applyAccess();
      if(user) await loadProfiles(true).catch(e=>toast('成员名称暂时无法读取：'+errorText(e)));
      applyAccess();
    } catch(e) {if(generation===authGeneration){user=null;applyAccess();toast('登录状态未能恢复，请重新登录');}}
  }
  async function loadProfiles(force=false) {
    if(!force && Date.now()-lastProfiles<30000)return;
    const data=await run(table('shared_profiles').select('owner_id,display_name'));
    profiles=new Map(data.map(p=>[p.owner_id,p.display_name])); lastProfiles=Date.now();
    renderMember();
  }
  function renderMember(){
    const select=$('documentMember');select.replaceChildren(new Option('未绑定成员',''));
    for(const [id,name] of profiles)select.add(new Option(name,id));
    if(current?.member_id&&!profiles.has(current.member_id))select.add(new Option(nameOf(current.member_id),current.member_id));
    select.value=current?.member_id||'';select.disabled=!user||!current;
  }
  $('documentMember').onchange=async()=>{
    if(!requireUser()||!current)return;
    const id=current.id,member=$('documentMember').value||null;
    $('documentMember').disabled=true;
    try{
      await persist();if(current?.id!==id)return;
      const rev=versions.get(id)||current.rev||0;
      const result=await run(table('shared_documents').update({member_id:member,rev:rev+1,updated:Date.now()}).eq('id',id).eq('rev',rev).select());
      if(!result?.length)throw Error('文档已被他人更新，请刷新后再设置所属成员');
      versions.set(id,rev+1);const doc=docs.find(d=>d.id===id);if(doc){doc.member_id=member;doc.rev=rev+1;}
      if(current?.id===id){current.member_id=member;current.rev=rev+1;window.dispatchEvent(new Event('journal-document-changed'));window.JournalAgent?.loadRemote();}
      toast('所属成员已保存，历史勋章已计入该成员');
    }catch(e){toast(errorText(e));}finally{renderMember();}
  };
  async function init() {
    applyAccess();
    if(!shared)return;
    cloud.auth.onAuthStateChange(()=>{refreshSession().catch(e=>toast(errorText(e)));});
    await refreshSession();
    setInterval(()=>{if(!document.hidden)loadComments().catch(()=>{});},5000);
  }
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('loginLink').onclick=login;
  $('accountButton').onclick=()=>{
    if(!user){login();return;}
    $('displayName').value=profiles.get(user.id)||''; $('accountDialog').showModal();
  };
  $('sendCode').onclick=async()=>{
    const phone=$('authPhone').value.trim(), button=$('sendCode');
    if(!/^1\d{10}$/.test(phone)){$('authError').textContent='请输入正确的 11 位手机号';return;}
    button.disabled=true; $('authError').textContent='';
    try {
      const data=unwrap(await cloud.auth.sendOtp({phone}));
      pendingOtp={phone,verificationId:data.verificationId,isExistingUser:data.isExistingUser};
      let seconds=60; button.textContent=seconds+' 秒后重发'; clearInterval(otpTimer);
      otpTimer=setInterval(()=>{seconds--;button.textContent=seconds?seconds+' 秒后重发':'获取验证码';if(!seconds){clearInterval(otpTimer);button.disabled=false;}},1000);
      $('authCode').focus();
    } catch(e){button.disabled=false;$('authError').textContent=errorText(e);}
  };
  $('authForm').onsubmit=async e=>{
    e.preventDefault();
    if(!pendingOtp || pendingOtp.phone!==$('authPhone').value.trim()){$('authError').textContent='请先获取当前手机号的验证码';return;}
    $('submitAuth').disabled=true;
    try {
      unwrap(await cloud.auth.verifyOtp({...pendingOtp,token:$('authCode').value.trim()}));
      await refreshSession();
      if(!user)throw Error('未建立登录会话，请重新登录');
      pendingOtp=null; $('authCode').value=''; $('authDialog').close(); toast('已登录，可以编辑和评论');
      if(!profiles.has(user.id)){$('displayName').value='';$('accountDialog').showModal();}
    } catch(err){$('authError').textContent=errorText(err);}
    finally{$('submitAuth').disabled=false;}
  };
  $('profileForm').onsubmit=async e=>{
    e.preventDefault(); if(!requireUser())return;
    const id=user.id, display_name=$('displayName').value.trim(); if(!display_name)return;
    const button=e.submitter; button.disabled=true;
    try {
      const existing=await run(table('shared_profiles').select('owner_id').eq('owner_id',id).maybeSingle());
      if(existing)await run(table('shared_profiles').update({display_name}).eq('owner_id',id));
      else await run(table('shared_profiles').insert({owner_id:id,display_name}));
      profiles.set(id,display_name);applyAccess();renderComments();$('accountDialog').close();toast('名称已保存');
    } catch(err){toast(errorText(err));}finally{button.disabled=false;}
  };
  $('signOut').onclick=async()=>{
    try {
      await persist(); await settingsQueue;
      if(savedRevision!==revision || settingsEditVersion!==settingsSavedVersion)throw Error('请先保存未完成的修改，再退出登录');
      unwrap(await cloud.auth.signOut()); user=null;applyAccess();$('accountDialog').close();toast('已退出，当前为只读模式');
    }catch(e){toast(errorText(e));}
  };
  $('retrySave').onclick=async()=>{try{await persist();applyAccess();}catch(e){toast(errorText(e));}};
  editor.addEventListener('beforeinput',e=>{if(!user)e.preventDefault();});

  function selectionHTML(range) {
    let fragment=document.createElement('div'); fragment.append(range.cloneContents());
    let ancestor=elementAt(range.commonAncestorContainer);
    while(ancestor && ancestor!==editor) {
      const wrapper=ancestor.cloneNode(false); wrapper.append(...fragment.childNodes);fragment.append(wrapper);ancestor=ancestor.parentElement;
    }
    return cleanHTML(fragment.innerHTML);
  }
  async function loadTemplates() {
    const id=user?.id; if(!id)return;
    $('templateList').textContent='正在读取模板…';
    const data=await run(table('shared_templates').select('*').eq('owner_id',id));
    if(user?.id!==id)return;
    templates=data.sort((a,b)=>b.created-a.created); renderTemplates();
  }
  function openTemplates(html='') {
    if(!requireUser())return;
    templateHTML=html; $('templateForm').hidden=!html; $('templateName').value='';
    $('templatePreview').innerHTML=html; $('templateDate').value=today(); $('templateDialog').showModal();
    loadTemplates().catch(e=>{$('templateList').textContent='模板暂时无法读取';toast(errorText(e));});
    if(html)$('templateName').focus();
  }
  $('templatesButton').onclick=()=>openTemplates();
  $('saveSelectionTemplate').onclick=()=>{
    if(!requireUser())return;
    const range=selectedRange?.cloneRange();
    if(!range || range.collapsed || !editor.contains(range.commonAncestorContainer)){toast('请先选中要保存的正文');return;}
    openTemplates(selectionHTML(range));closeMenus();
  };
  $('templateForm').onsubmit=async e=>{
    e.preventDefault();if(!requireUser() || !templateHTML)return;
    const name=$('templateName').value.trim();if(!name)return;
    const button=e.submitter;button.disabled=true;
    try {
      await run(table('shared_templates').insert({id:newId(),owner_id:user.id,name,html:templateHTML,created:Date.now()}));
      templateHTML='';$('templateForm').hidden=true;await loadTemplates();toast('已保存为日结模板');
    }catch(err){toast(errorText(err));}finally{button.disabled=false;}
  };
  function useTemplate(template) {
    if(!requireUser() || !current){toast('请先打开或新建成员文档');return;}
    if(!$('templateDate').reportValidity())return;
    const date=$('templateDate').value, title=JournalCore.dateTitle(date);
    const matches=[...editor.querySelectorAll('h1')].filter(h=>JournalCore.dateOf(h.textContent)===date);
    if(matches.length>1){toast('当天有多个大标题，请先合并后再使用模板');return;}
    const existing=matches[0];
    const range=document.createRange();
    if(existing){range.setStartAfter(existing);range.collapse(true);}
    else{range.setStart(editor,editor.childNodes.length);range.collapse(true);}
    const fragment=JournalCore.buildTemplateInsertion(document,cleanHTML(template.html),title,Boolean(existing));
    $('templateDialog').close();
    if(!requireEdit())return;
    range.insertNode(fragment);
    const heading=existing || [...editor.querySelectorAll('h1')].find(h=>h.textContent.trim()===title);
    if(heading)setCaret(heading.nextElementSibling||heading,true);
    selectedRange=capture();changed();renderOutline();
    heading?.scrollIntoView({block:'center'});toast('已插入 '+title+' 的模板内容');
  }
  function renderTemplates() {
    $('templateList').replaceChildren();
    if(!templates.length){$('templateList').textContent='还没有模板。选中一段日结内容即可保存。';return;}
    templates.forEach(t=>{
      const row=document.createElement('div');row.className='template-row';
      const label=document.createElement('strong');label.textContent=t.name;
      const use=document.createElement('button');use.textContent='用于日结';use.onclick=()=>useTemplate(t);
      const remove=document.createElement('button');remove.textContent='删除';remove.className='subtle';
      remove.onclick=async()=>{if(!requireUser() || !confirm('删除模板“'+t.name+'”？已插入的日结不受影响。'))return;remove.disabled=true;try{await run(table('shared_templates').delete().eq('id',t.id).eq('owner_id',user.id));await loadTemplates();}catch(e){remove.disabled=false;toast(errorText(e));}};
      row.append(label,use,remove);$('templateList').append(row);
    });
  }

  function panel(open=true) {$('commentsPanel').hidden=!open;document.body.classList.toggle('comments-open',open);}
  $('commentsButton').onclick=()=>{panel($('commentsPanel').hidden);loadComments(true).catch(e=>toast(errorText(e)));};
  $('closeComments').onclick=()=>panel(false);
  $('cancelComment').onclick=()=>{commentDraft=null;$('commentForm').hidden=true;$('commentBody').value='';};
  $('commentSelection').onclick=()=>{
    if(!requireUser())return;
    const range=selectedRange?.cloneRange();if(!current || !range || range.collapsed || !editor.contains(range.commonAncestorContainer))return;
    const before=document.createRange();before.selectNodeContents(editor);before.setEnd(range.startContainer,range.startOffset);
    const start=before.toString().length, quote=range.toString();
    if(!quote.trim()){toast('请选择需要讨论的文字');return;}
    if(quote.length>10000){toast('引用内容最多 10000 字，请缩小选区');return;}
    commentDraft={document_id:current.id,...JournalCore.anchor(editor.textContent,start,start+quote.length)};
    $('commentQuote').textContent=quote;$('commentForm').hidden=false;$('commentBody').value='';panel();closeMenus();$('commentBody').focus();
  };
  $('commentForm').onsubmit=async e=>{
    e.preventDefault();if(!requireUser() || !commentDraft)return;
    const body=$('commentBody').value.trim();if(!body)return;
    if(commentDraft.document_id!==current?.id){toast('文档已切换，请重新选中正文');return;}
    const button=e.submitter;button.disabled=true;
    try {
      await persist();
      await run(table('shared_comment_threads').insert({id:newId(),owner_id:user.id,...commentDraft,body,created:Date.now()}));
      $('cancelComment').click();await loadComments(true);toast('评论已发布');
    }catch(err){toast(errorText(err));}finally{button.disabled=false;}
  };
  function textRange(start,end) {
    const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let node,offset=0;
    const range=document.createRange();let found=false;
    while((node=walker.nextNode())){
      const next=offset+node.textContent.length;
      if(!found && start>=offset && start<next){range.setStart(node,start-offset);found=true;}
      if(found && end<=next){range.setEnd(node,end-offset);return range;}offset=next;
    }
    return null;
  }
  function refreshHighlights() {
    if(!globalThis.CSS?.highlights || !globalThis.Highlight)return;
    const ranges=[];
    threads.filter(t=>!CommentDeletion.deleted(t)).forEach(t=>{const p=JournalCore.locate(editor.textContent,t);if(p){const r=textRange(p.start,p.end);if(r)ranges.push(r);}});
    CSS.highlights.set('journal-comments',new Highlight(...ranges));
  }
  function locateThread(thread) {
    const pos=JournalCore.locate(editor.textContent,thread);
    if(!pos){toast('原文已更改或位置不唯一，引用内容仍保留在评论中');return;}
    const range=textRange(pos.start,pos.end);if(!range)return;
    elementAt(range.startContainer)?.scrollIntoView({block:'center',behavior:'smooth'});
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  }
  async function loadComments(force=false) {
    if(!shared || !current || loadingComments)return;
    loadingComments=true;const docId=current.id,generation=commentsGeneration;
    try {
      const data=await run(table('shared_comment_threads').select('*').eq('document_id',docId));
      const answer=data.length?await run(table('shared_comment_replies').select('*').in('thread_id',data.map(t=>t.id))):[];
      await loadProfiles();if(current?.id!==docId||generation!==commentsGeneration)return;
      const version=JSON.stringify([data,answer,[...profiles],user?.id]);
      threads=data.sort((a,b)=>a.created-b.created);replies=answer.sort((a,b)=>a.created-b.created);
      $('commentCount').textContent=CommentDeletion.visibleThreads(threads,replies).length;
      if(force || version!==commentsVersion){commentsVersion=version;renderComments(force);}
      refreshHighlights();
    }catch(e){if(force&&current?.id===docId&&generation===commentsGeneration){$('commentList').textContent='评论暂时无法加载，请稍后重试。';throw e;}}
    finally{loadingComments=false;}
  }
  function postContent(record, className='comment-content') {
    const content=document.createElement('div');content.className=className;
    const meta=document.createElement('div');meta.className='comment-meta';
    const author=document.createElement('b');author.textContent=nameOf(record.owner_id);
    const time=document.createElement('time');time.textContent=new Date(record.created).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const body=document.createElement('p');body.textContent=CommentDeletion.deleted(record)?'该评论已删除':record.body;
    if(CommentDeletion.deleted(record))body.className='deleted-comment';
    meta.append(author,time);content.append(meta,body);
    if(CommentDeletion.canDelete(record,user)){
      const remove=document.createElement('button');remove.type='button';remove.className='delete-comment';remove.textContent='删除';
      const kind=className==='comment-reply'?'reply':'thread',uid=user.id;
      remove.setAttribute('aria-label',kind==='reply'?'删除我的回复':'删除我的评论');
      remove.onclick=async()=>{
        if(!requireUser()||user.id!==uid||!CommentDeletion.canDelete(record,user)){toast('登录身份已变化，请重新打开评论');return;}
        if(!confirm(kind==='reply'?'删除这条回复？':'删除这条评论？其他成员的回复会保留。'))return;
        remove.disabled=true;
        try{
          const ok=await run(cloud.database.rpc('shared_delete_comment',{p_kind:kind,p_id:record.id}));
          if(ok!==true)throw Error('未能删除，请刷新评论并确认这是你发布的内容');
          if(user?.id!==uid)return;
          commentsGeneration++;record.deleted_at=Date.now();record.body='[已删除]';if(kind==='thread'){record.quote='[已删除]';record.prefix='';record.suffix='';replyDrafts.delete(record.id);}
          remove.blur();$('commentCount').textContent=CommentDeletion.visibleThreads(threads,replies).length;renderComments(true);refreshHighlights();
          toast(kind==='reply'?'回复已删除':'评论已删除');await loadComments(true);
        }catch(e){remove.disabled=false;toast(errorText(e));}
      };
      content.append(remove);
    }
    return content;
  }
  function renderComments(force=false) {
    const list=$('commentList');
    // Keep focused reply editors and their caret intact during background polling.
    if(!force && list.contains(document.activeElement))return;
    list.replaceChildren();
    const visible=CommentDeletion.visibleThreads(threads,replies);
    if(!visible.length){list.textContent='暂无评论，选中正文开始讨论。';return;}
    visible.forEach(thread=>{
      const card=document.createElement('section');card.className='comment-card';
      const quote=document.createElement('button');quote.className='quote-link';quote.textContent=thread.quote;quote.title='定位引用原文';quote.onclick=()=>locateThread(thread);
      if(!CommentDeletion.deleted(thread))card.append(quote);
      if(!CommentDeletion.deleted(thread)&&!JournalCore.locate(editor.textContent,thread)){const note=document.createElement('small');note.className='muted';note.textContent='原文已更改或无法唯一定位';card.append(note);}
      card.append(postContent(thread));
      replies.filter(r=>r.thread_id===thread.id&&!CommentDeletion.deleted(r)).forEach(r=>card.append(postContent(r,'comment-reply')));
      if(CommentDeletion.deleted(thread)){list.append(card);return;}
      const form=document.createElement('form');form.className='reply-form';
      const input=document.createElement('textarea');input.placeholder='回复 '+nameOf(thread.owner_id)+'…';input.setAttribute('aria-label','回复评论');input.maxLength=4000;input.required=true;input.rows=1;input.value=replyDrafts.get(thread.id)||'';input.oninput=()=>replyDrafts.set(thread.id,input.value);
      const send=document.createElement('button');send.type='submit';send.textContent='回复';
      form.onsubmit=async e=>{e.preventDefault();if(!requireUser())return;const body=input.value.trim();if(!body)return;send.disabled=true;try{await run(table('shared_comment_replies').insert({id:newId(),owner_id:user.id,thread_id:thread.id,body,created:Date.now()}));replyDrafts.delete(thread.id);input.value='';input.blur();send.blur();await loadComments(true);toast('回复已发布');}catch(err){toast(errorText(err));}finally{send.disabled=false;}};
      form.append(input,send);card.append(form);list.append(card);
    });
  }
  function documentChanged() {
    applyAccess();
    if(commentsDoc===current?.id){refreshHighlights();return;}
    commentsGeneration++;commentsDoc=current?.id;threads=[];replies=[];commentsVersion='';commentDraft=null;
    $('commentForm').hidden=true;$('commentBody').value='';$('commentCount').textContent='0';renderComments();refreshHighlights();
    loadComments(true).catch(e=>toast(errorText(e)));
  }
  editor.addEventListener('input',()=>{clearTimeout(highlightTimer);highlightTimer=setTimeout(refreshHighlights,250);});
  $('commentList').addEventListener('focusout',()=>setTimeout(()=>{if(!$('commentList').contains(document.activeElement))renderComments();},0));
  return {get user(){return user;},get displayName(){return user?nameOf(user.id):'新成员';},get memberId(){return profiles.has(user?.id)?user.id:null;},nameOf,init,login,documentChanged,refreshHighlights};
})();
