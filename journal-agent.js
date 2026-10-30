'use strict';
window.JournalAgent=(()=>{
  const core=JournalAgentCore;
  let documentId=null,userId=null,memberId=null,selectedId=null,generation=0,fetchGeneration=0,preparing=false,request=null,cached=null,pendingSave=null,days=null,reviews=[],refreshTimer;
  const setStatus=text=>{$('reviewStatus').textContent=text;};
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  function same(source){
    if(!source||source.documentId!==current?.id||source.memberId!==(current?.member_id||null)||source.userId!==Collaboration.user?.id||source.sectionId!==selectedId)return false;
    try{return core.section(editor,source.sectionId).text===source.text&&$('reviewDate').value===source.date;}catch{return false;}
  }
  function controls(){
    $('reviewToday').disabled=!current;
    $('startDailyReview').disabled=!current||!selectedId||preparing||Boolean(request);
    $('reviewDate').disabled=Boolean(cached)||preparing||Boolean(request);
    $('startDailyReview').textContent=request?'正在点评…':'点评所选日结';
    $('reviewModel').disabled=preparing||Boolean(request);
    $('modelSettingsButton').disabled=preparing||Boolean(request);
    $('cancelDailyReview').hidden=!request;$('cancelDailyReview').disabled=Boolean(pendingSave);$('retryReviewSave').hidden=!pendingSave||Boolean(request);
  }
  function cancel(message){if(request){request.controller.abort();request=null;}controls();if(message)setStatus(message);}
  function badgeView(){
    const collection=days===null?null:core.collection(days);
    $('badgeOwner').textContent=current?.member_id?Collaboration.nameOf(current.member_id)+'的累计勋章':'此文档的勋章（未绑定成员）';
    $('badgeScope').textContent=current?.member_id?'汇总该成员所有文档、所有日期的已获勋章。':'请在文档标题下选择所属成员，再汇总个人勋章。现有记录会保留。';
    $('badgeCount').textContent=collection?`${collection.total} 枚`:'—';
    $('qualityDayCount').textContent=collection?`累计 ${collection.count} 天优质日结 · ${collection.total} 枚勋章`:'正在读取勋章…';
    $('badgeGrid').replaceChildren(...core.badges.map(b=>{
      const amount=collection?.counts[b.id]||0,unlocked=amount>0,tile=node('div',null,'badge-tile'+(unlocked?' earned':''));tile.title=b.description;
      tile.append(node('span',b.symbol,'badge-symbol'),node('strong',b.name),node('small',unlocked?`× ${amount}`:b.days?`${collection?.count||0} / ${b.days} 天`:'待解锁'));
      tile.setAttribute('aria-label',b.name+'，'+(unlocked?`已获得 ${amount} 枚`:b.description));return tile;
    }));
  }
  function renderReview(row,saved=true){
    const container=$('dailyReviewResult');container.replaceChildren();
    if(!row)return;
    let review;try{review=core.validate(row.review,row.source_text);}catch{setStatus('已保存的点评格式无法读取，请重新点评。');return;}
    const grade=core.grade(review),heading=node('div',null,'review-score-row');
    heading.append(node('b',String(grade.score),'review-score'),node('span','/ 100'),node('strong',grade.qualified?'优质日结':'继续打磨','review-verdict'));
    container.append(heading,node('p',review.summary,'review-summary'));
    for(const key of core.keys){const d=review.dimensions[key],section=node('section',null,'review-dimension'),title=node('div',null,'dimension-title');
      title.append(node('strong',core.labels[key]),node('span',`${d.score} / 5`));section.append(title,node('p',d.reason));
      if(d.evidence.length){const evidence=node('details');evidence.append(node('summary','查看原文依据'));d.evidence.forEach(e=>evidence.append(node('blockquote',e)));section.append(evidence);}container.append(section);
    }
    container.append(node('strong','下一步可以试试'));const list=node('ul');review.suggestions.forEach(s=>list.append(node('li',s)));container.append(list);
    container.append(node('p',(saved?'点评已保存到此文档 · ':'点评尚未保存，勋章尚未发放 · ')+(row.model?'模型：'+row.model+' · ':'')+'AI 判断供复盘参考','review-footnote'));
  }
  function selectSection(id){
    if(id===selectedId)return;
    generation++;fetchGeneration++;cancel();selectedId=id;cached=null;pendingSave=null;
    renderSelected(true);controls();
  }
  function renderSelected(resetDate=false){
    const section=core.sections(editor).find(s=>s.id===selectedId);
    cached=reviews.find(r=>r.document_id===current?.id&&r.section_id===selectedId)||null;
    if(cached||resetDate||!$('reviewDate').value)$('reviewDate').value=cached?.review_date||section?.date||core.shanghaiDate();
    $('reviewTarget').textContent=($('docTitle').value||'当前文档')+' · '+(section?.label||'请选择日结');
    if(!request&&!pendingSave){
      renderReview(cached);
      setStatus(cached?(cached.source_text===section?.text?'已保存此篇点评；同模型、同正文不会重复调用。':'显示上次点评，正文已变化，可重新点评。'):'选好大标题和统计日期后，点击“点评所选日结”。');
    }
  }
  async function loadRemote(){
    if(!current||!shared)return;
    const id=current.id,member=current.member_id||null,serial=++fetchGeneration;
    try{
      const memberDocs=member?unwrap(await cloud.database.from('shared_documents').select('id,member_id').eq('member_id',member)):[current];
      const ids=core.memberDocumentIds({id,member_id:member},memberDocs);
      const [reviewResult,dayResult]=await Promise.all([
        cloud.database.from('shared_section_reviews').select('*').in('document_id',ids),
        cloud.database.from('shared_section_quality').select('document_id,review_date,criteria,awarded_at').in('document_id',ids)
      ]);
      const rows=unwrap(reviewResult),awards=unwrap(dayResult);
      if(id!==current?.id||member!==(current?.member_id||null)||serial!==fetchGeneration)return;
      reviews=rows;days=awards;badgeView();
      const stats=core.statistics(rows);
      $('reviewStatistics').textContent=`已点评 ${stats.count} 篇 · 平均 ${stats.average} 分 · 优质率 ${stats.qualifiedRate}%（每篇最新点评）`;
      if(!request&&!pendingSave&&!preparing){renderSelected();controls();}
    }catch(e){if(id===current?.id&&serial===fetchGeneration){$('qualityDayCount').textContent='勋章暂时无法读取';if(!request)setStatus('点评记录暂时无法加载，请稍后重试。');}}
  }
  function context(){
    const id=current?.id||null,uid=Collaboration.user?.id||null,member=current?.member_id||null;
    const changedDocument=id!==documentId||uid!==userId||member!==memberId;
    if(changedDocument){
      generation++;fetchGeneration++;cancel();documentId=id;userId=uid;memberId=member;selectedId=null;cached=null;pendingSave=null;days=null;reviews=[];
      $('dailyReviewResult').replaceChildren();$('reviewStatistics').textContent='';badgeView();
    }
    if(current&&uid){const before=editor.innerHTML;core.identify(editor,newId);if(before!==editor.innerHTML)changed();}
    const sections=core.sections(editor),picker=$('reviewSection');
    const options=sections.map(s=>({id:s.id,label:`${s.index+1}. ${s.label}`}));
    if(JSON.stringify([...picker.options].map(o=>({id:o.value,label:o.textContent})))!==JSON.stringify(options)){
      picker.replaceChildren(...options.map(o=>{const option=node('option',o.label);option.value=o.id;return option;}));
    }
    if(!sections.some(s=>s.id===selectedId))selectSection(sections[0]?.id||null);
    picker.value=selectedId||'';
    const section=sections.find(s=>s.id===selectedId);
    $('reviewTarget').textContent=($('docTitle').value||'当前文档')+' · '+(section?.label||'请先添加大标题');
    $('reviewPreview').textContent=section?`${section.text.length} 字 · ${section.images} 张图片 · ${section.text.replace(/\s+/g,' ').slice(0,90)}${section.text.length>90?'…':''}`:'暂无日结大标题。插入模板或一级标题后即可选择。';
    if(request&&!same(request.source))cancel('所选日结或登录身份已变化，已停止点评。');
    if(pendingSave&&!same(pendingSave.source)){pendingSave=null;setStatus('日结内容已变化，请重新点评。');}
    controls();if(changedDocument)loadRemote();
  }
  function setView(mode){
    const ai=mode==='ai';$('dailyAgent').hidden=!ai;$('discussionArea').hidden=ai;
    $('reviewToday').setAttribute('aria-pressed',String(ai));$('showDiscussion').setAttribute('aria-pressed',String(!ai));
  }
  function show(){context();Collaboration.openComments(true,'ai');JournalModelSettings.loadModels().catch(()=>{});}
  function selectedHeading(){
    const selection=getSelection();if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0);
    const parent=n=>n.nodeType===1?n:n.parentElement;
    const start=parent(range.startContainer)?.closest('h1'),end=parent(range.endContainer)?.closest('h1');
    if(!start||start!==end||!editor.contains(start))return null;
    return start;
  }
  function trackHeading(){
    const heading=selectedHeading();if(!heading)return;
    context();const item=core.sections(editor).find(s=>s.heading===heading);
    if(item){selectSection(item.id);context();}
  }
  document.addEventListener('selectionchange',trackHeading);
  $('reviewSelection').onclick=async()=>{
    if(!selectedHeading()){toast('请选中一个日期大标题，再发起 AI 点评。');return;}
    trackHeading();closeMenus();await reviewToday();
  };
  $('showDiscussion').onclick=()=>setView('comments');
  async function saveReview(item){
    if(!same(item.source))throw Error('日结内容已变化，请重新点评。');
    const response=unwrap(await cloud.database.rpc('shared_save_section_review',{
      p_document_id:item.source.documentId,p_section_id:item.source.sectionId,p_heading:item.source.label,p_date:item.source.date,p_source_rev:item.source.rev,p_source_text:item.source.text,p_review:item.review,p_model:item.model
    }));
    if(!same(item.source))return;
    if(!response?.review)throw Error('云端没有确认保存，请重试保存。');
    cached=response.review;reviews=reviews.filter(r=>r.document_id!==cached.document_id||r.section_id!==cached.section_id).concat(cached);pendingSave=null;renderReview(cached,true);controls();
    setStatus(core.grade(cached.review).qualified?'点评已保存，达标勋章已记录到此成员文档。':'点评已保存。补充具体的复盘与下一步，再来试试。');
    await loadRemote();
  }
  async function reviewToday(){
    show();if(!requireEdit())return;if(request||preparing)return;
    let section;try{section=core.section(editor,selectedId);}catch(e){setStatus(e.message);return;}
    if(cached?.source_text===section.text&&cached.model===JournalModelSettings.modelTag()&&cached.review.format_version===2){renderReview(cached);setStatus('已展示此模型对这篇内容的点评，不会重复发放勋章。');return;}
    if(!$('reviewDate').reportValidity())return;
    const startGeneration=generation,chosenDate=$('reviewDate').value;
    section.heading.dataset.journalDate=chosenDate;
    preparing=true;controls();
    try{await persist();}catch(e){setStatus('请先保存日结再点评：'+e.message);return;}finally{preparing=false;controls();}
    if(startGeneration!==generation||!current)return;
    try{section=core.section(editor,selectedId);}catch(e){setStatus(e.message);return;}
    const source={documentId:current.id,memberId:current.member_id||null,userId:Collaboration.user?.id,sectionId:section.id,label:section.label,date:chosenDate,text:section.text,rev:versions.get(current.id)||current.rev||0};
    if(!source.userId)return;
    const task={source,controller:new AbortController()};request=task;pendingSave=null;controls();$('dailyReviewResult').replaceChildren();setStatus('正在阅读所选大标题下的日结…');
    const timeout=setTimeout(()=>task.controller.abort(),180000);
    const valid=()=>request===task&&!task.controller.signal.aborted&&same(source);
    try{
      const config=await JournalModelSettings.selected();if(!valid())return;
      const model=JournalModelClient.modelTag(config);
      const raw=await JournalModelClient.complete(config,{cloud,messages:core.messages(section,$('docTitle').value),signal:task.controller.signal,
        onProgress:()=>{if(valid())setStatus('正在整理评分与原文依据…');}});
      if(!valid())return;
      const review={...core.parse(raw,source.text),format_version:2};pendingSave={source,review,model};
      renderReview({review,source_text:source.text,model},false);controls();setStatus('正在保存点评与勋章…');
      await saveReview(pendingSave);
    }catch(e){if(request===task){setStatus(pendingSave?'点评已生成，但保存失败：'+friendly(e)+'。可重试保存。':'点评未完成：'+friendly(e));}}
    finally{clearTimeout(timeout);if(request===task){if(task.controller.signal.aborted)setStatus('点评超时，请稍后重试。');request=null;controls();}}
  }
  function friendly(e){const message=e?.message||'连接暂时不可用';if(message.includes('stale_document'))return '文档版本已更新，请重新点评';return message.slice(0,220);}
  $('reviewToday').onclick=()=>{show();loadRemote();};
  $('startDailyReview').onclick=reviewToday;
  $('reviewSection').onchange=()=>{selectSection($('reviewSection').value);context();};
  $('locateReviewSection').onclick=()=>core.sections(editor).find(s=>s.id===selectedId)?.heading.scrollIntoView({behavior:'smooth',block:'center'});
  $('openBadges').onclick=()=>{show();$('medalDetails').open=true;$('medalDetails').scrollIntoView({block:'start',behavior:'smooth'});loadRemote();};
  $('closeDailyAgent').onclick=()=>{setView('comments');if(!pendingSave)cancel('已停止点评。');};
  $('cancelDailyReview').onclick=()=>cancel('已停止点评，未完成的结果不会发放勋章。');
  $('retryReviewSave').onclick=async()=>{
    if(!requireEdit()||!pendingSave)return;const button=$('retryReviewSave');button.disabled=true;
    try{await saveReview(pendingSave);}catch(e){setStatus('保存失败：'+friendly(e));}finally{button.disabled=false;}
  };
  const observer=new MutationObserver(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(context,100);});
  observer.observe(editor,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-done']});
  window.addEventListener('journal-document-changed',context);window.addEventListener('journal-access-changed',context);
  $('docTitle').addEventListener('input',context);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){context();if(!$('dailyAgent').hidden)loadRemote();}});
  setInterval(()=>{if(!document.hidden){context();if(!$('dailyAgent').hidden&&!request&&!pendingSave)loadRemote();}},30000);
  return {context,loadRemote,show,setView};
})();
