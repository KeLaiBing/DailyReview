'use strict';
window.JournalAgent=(()=>{
  const core=JournalAgentCore;
  let documentId=null,userId=null,date='',generation=0,fetchGeneration=0,preparing=false,request=null,cached=null,pendingSave=null,days=null,refreshTimer;
  const setStatus=text=>{$('reviewStatus').textContent=text;};
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  function same(source){
    if(!source||source.documentId!==current?.id||source.userId!==Collaboration.user?.id||source.date!==core.shanghaiDate())return false;
    try{return core.daily(editor,source.date).text===source.text;}catch{return false;}
  }
  function controls(){
    $('reviewToday').disabled=!current||preparing||Boolean(request);
    $('reviewToday').textContent=request?'正在点评…':'✦ 点评今日日结';
    $('cancelDailyReview').hidden=!request;$('cancelDailyReview').disabled=Boolean(pendingSave);$('retryReviewSave').hidden=!pendingSave||Boolean(request);
  }
  function cancel(message){if(request){request.controller.abort();request=null;}controls();if(message)setStatus(message);}
  function badgeView(){
    const collection=days===null?null:core.collection(days);
    $('badgeCount').textContent=collection?`${collection.earned.length} / 6`:'—';
    $('qualityDayCount').textContent=collection?`累计 ${collection.count} 天优质日结`:'正在读取勋章…';
    $('badgeGrid').replaceChildren(...core.badges.map(b=>{
      const unlocked=collection?.earned.includes(b.id),tile=node('div',null,'badge-tile'+(unlocked?' earned':''));tile.title=b.description;
      tile.append(node('span',b.symbol,'badge-symbol'),node('strong',b.name),node('small',unlocked?'已获得':b.days?`${collection?.count||0} / ${b.days} 天`:'待解锁'));
      tile.setAttribute('aria-label',b.name+'，'+(unlocked?'已获得':b.description));return tile;
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
      d.evidence.forEach(e=>section.append(node('blockquote',e)));container.append(section);
    }
    container.append(node('strong','下一步可以试试'));const list=node('ul');review.suggestions.forEach(s=>list.append(node('li',s)));container.append(list);
    container.append(node('p',saved?'点评已保存到此文档 · AI 判断供复盘参考':'点评尚未保存，勋章尚未发放','review-footnote'));
  }
  async function loadRemote(){
    if(!current||!shared)return;
    const id=current.id,day=core.shanghaiDate(),serial=++fetchGeneration;
    try{
      const [reviewResult,dayResult]=await Promise.all([
        cloud.database.from('shared_daily_reviews').select('*').eq('document_id',id).eq('review_date',day).maybeSingle(),
        cloud.database.from('shared_quality_days').select('review_date,criteria,awarded_at').eq('document_id',id)
      ]);
      const row=unwrap(reviewResult),awards=unwrap(dayResult);
      if(id!==current?.id||serial!==fetchGeneration||day!==core.shanghaiDate())return;
      cached=row;days=awards;badgeView();
      if(!request&&!pendingSave){renderReview(cached);if(cached){let unchanged=false;try{unchanged=core.daily(editor,day).text===cached.source_text;}catch{}setStatus(unchanged?'今日点评已保存；重复查看不会重复消耗模型或增加天数。':'已显示今天上次点评，正文变化后可重新点评。');}}
    }catch(e){if(id===current?.id&&serial===fetchGeneration){$('qualityDayCount').textContent='勋章暂时无法读取';if(!request)setStatus('点评记录暂时无法加载，请稍后重试。');}}
  }
  function context(){
    const id=current?.id||null,uid=Collaboration.user?.id||null,day=core.shanghaiDate();
    if(id!==documentId||uid!==userId||day!==date){
      generation++;fetchGeneration++;cancel();documentId=id;userId=uid;date=day;cached=null;pendingSave=null;days=null;
      $('dailyReviewResult').replaceChildren();badgeView();setStatus('点评当前成员文档中今天的文字，结果和勋章将保存在此文档。');loadRemote();
    }
    $('reviewTarget').textContent=($('docTitle').value||'当前文档')+' · '+day.replaceAll('-','.');
    if(request&&!same(request.source))cancel('今日日结或登录身份已变化，已停止点评。');
    if(pendingSave&&!same(pendingSave.source)){pendingSave=null;setStatus('日结内容已变化，请重新点评。');}
    controls();
  }
  function show(){context();$('dailyAgent').hidden=false;}
  async function saveReview(item){
    if(!same(item.source))throw Error('日结内容已变化，请重新点评。');
    const response=unwrap(await cloud.database.rpc('shared_save_daily_review',{
      p_document_id:item.source.documentId,p_date:item.source.date,p_source_rev:item.source.rev,p_source_text:item.source.text,p_review:item.review,p_model:item.model
    }));
    if(!same(item.source))return;
    if(!response?.review)throw Error('云端没有确认保存，请重试保存。');
    cached=response.review;pendingSave=null;renderReview(cached,true);controls();
    setStatus(core.grade(cached.review).qualified?'点评已保存，达标勋章已记录到此成员文档。':'点评已保存。补充具体的复盘与下一步，再来试试。');
    await loadRemote();
  }
  async function reviewToday(){
    show();if(!requireEdit())return;if(request||preparing)return;
    let section;try{section=core.daily(editor);}catch(e){setStatus(e.message);return;}
    if(cached?.source_text===section.text){renderReview(cached);setStatus('已展示今天这份内容的点评，不会重复发放勋章。');return;}
    const startGeneration=generation;
    preparing=true;controls();
    try{await persist();}catch(e){setStatus('请先保存日结再点评：'+e.message);return;}finally{preparing=false;controls();}
    if(startGeneration!==generation||!current)return;
    try{section=core.daily(editor);}catch(e){setStatus(e.message);return;}
    const source={documentId:current.id,userId:Collaboration.user?.id,date:core.shanghaiDate(),text:section.text,rev:versions.get(current.id)||current.rev||0};
    if(!source.userId)return;
    const task={source,controller:new AbortController()};request=task;pendingSave=null;controls();$('dailyReviewResult').replaceChildren();setStatus('正在阅读今日日结…');
    const timeout=setTimeout(()=>task.controller.abort(),90000);
    const valid=()=>request===task&&!task.controller.signal.aborted&&same(source);
    try{
      if(!cloud.llm)throw Error('当前云服务未提供大模型点评能力。');
      const models=await cloud.llm.models.list(task.controller.signal);if(!valid())return;
      const available=models.filter(m=>m.enabled!==false&&m.disabled!==true&&(m.id==='hunyuan-chat'||m.modalities?.output?.includes('text')||(m.supportsToolCall===true&&m.maxOutputTokens>0)));
      const model=available.find(m=>m.id==='hunyuan-chat')||available.find(m=>!m.onlyReasoning)||available[0];
      if(!model)throw Error('没有可用的文字点评模型。');
      let raw='';
      for await(const chunk of cloud.llm.chat.completions.create({model:model.id,messages:core.messages(section,$('docTitle').value),stream:true,max_tokens:3000,signal:task.controller.signal})){
        if(!valid())return;const finish=chunk.choices?.[0]?.finish_reason;
        if(finish&&finish!=='stop')throw Error('模型未能完成点评，请稍后重试。');
        raw+=core.delta(chunk);if(raw.length>20000)throw Error('模型返回内容过长，请重试。');setStatus('正在整理评分与原文依据…');
      }
      if(!valid())return;
      const review=core.parse(raw,source.text);pendingSave={source,review,model:model.id};
      renderReview({review,source_text:source.text},false);controls();setStatus('正在保存点评与勋章…');
      await saveReview(pendingSave);
    }catch(e){if(request===task){setStatus(pendingSave?'点评已生成，但保存失败：'+friendly(e)+'。可重试保存。':'点评未完成：'+friendly(e));}}
    finally{clearTimeout(timeout);if(request===task){if(task.controller.signal.aborted)setStatus('点评超时，请稍后重试。');request=null;controls();}}
  }
  function friendly(e){const message=e?.message||'连接暂时不可用';if(message.includes('stale_document'))return '文档版本已更新，请重新点评';return message.slice(0,220);}
  $('reviewToday').onclick=reviewToday;
  $('openBadges').onclick=()=>{show();loadRemote();};
  $('closeDailyAgent').onclick=()=>{$('dailyAgent').hidden=true;if(!pendingSave)cancel('已停止点评。');};
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
  return {context,loadRemote,show};
})();
