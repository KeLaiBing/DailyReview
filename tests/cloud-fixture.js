// Isolated test data only. Never include this file in the published site.
(function() {
  const initial='<h1>日期：2026.10.30</h1><p>前言：今天完成了报告</p><hr><p>任务目标：</p><p class="todo" data-done="false">阅读论文</p><table><tbody><tr><td>事件</td><td>打卡记录（图片）</td><td>感受总结（吐槽也行）</td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>';
  const rows={shared_documents:[{id:'doc-a',owner_id:'user-a',member_id:'user-a',title:'小林的日结',date:'2026-10-30',html:initial,created:1,updated:Date.now(),rev:1},{id:'doc-b',owner_id:'user-a',member_id:'user-b',title:'小周的日结',date:'2026-10-30',html:'<h1>日期：2026.10.30</h1><p>小周今天完成了报告</p>',created:2,updated:Date.now()-1,rev:1}],shared_settings:[],shared_profiles:[{owner_id:'user-a',display_name:'小林'},{owner_id:'user-b',display_name:'小周'}],shared_templates:[],shared_comment_threads:[],shared_comment_replies:[]};
  let user=globalThis.__TEST_GUEST?null:{id:'user-a'}, events=[];
  if(new URLSearchParams(location.search).has('comments')){
    rows.shared_comment_threads.push({id:'preview-thread',document_id:'doc-a',owner_id:'user-a',quote:'今天完成了报告',start_offset:0,end_offset:8,prefix:'前言：',suffix:'',body:'明天把报告里的实验结果再核对一次。',created:Date.now()});
    rows.shared_comment_replies.push({id:'preview-reply',thread_id:'preview-thread',owner_id:'user-b',body:'好的，我帮你核对图表。',created:Date.now()+1});
  }
  class Query {
    constructor(name){this.name=name;this.filters=[];this.op='read';}
    select(){return this;}
    eq(key,value){this.filters.push(r=>r[key]===value);return this;}
    in(key,values){this.filters.push(r=>values.includes(r[key]));return this;}
    maybeSingle(){this.single=true;return this;}
    insert(value){this.op='insert';this.value=value;return this;}
    update(value){this.op='update';this.value=value;return this;}
    delete(){this.op='delete';return this;}
    then(resolve,reject){return Promise.resolve().then(()=>{
      if(this.op!=='read' && !user)return {data:null,error:{message:'authentication required'}};
      let found=rows[this.name].filter(r=>this.filters.every(f=>f(r)));
      if(this.name==='shared_templates')found=found.filter(r=>r.owner_id===user?.id);
      if(this.op==='insert'){const row={...this.value};rows[this.name].push(row);found=[row];}
      if(this.op==='update')found.forEach(r=>Object.assign(r,this.value));
      if(this.op==='delete')rows[this.name]=rows[this.name].filter(r=>!found.includes(r));
      return {data:JSON.parse(JSON.stringify(this.single?(found[0]||null):found)),error:null};
    }).then(resolve,reject);}
  }
  let storage;
  const sessionKey='workbuddy-cloud.session.fixture';
  const persistUser=()=>{if(!storage)return;if(user)storage.setItem(sessionKey,JSON.stringify({user,accessToken:'fixture-token',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000}));else storage.removeItem(sessionKey);};
  const auth={
    getSession:async()=>{if(storage){const stored=storage.getItem(sessionKey);user=stored?JSON.parse(stored).user:null;}return {data:user?{user}:null};},
    onAuthStateChange:fn=>events.push(fn),
    sendOtp:async({phone})=>({data:{verificationId:'fixture-verification',isExistingUser:false}}),
    verifyOtp:async({verificationId,token})=>{
      if(verificationId!=='fixture-verification'||token!=='123456')return {error:{message:'测试验证码为 123456'}};
      user={id:'user-a'};persistUser();events.forEach(f=>f('SIGNED_IN'));return {data:{user}};
    },
    signOut:async()=>{user=null;persistUser();events.forEach(f=>f('SIGNED_OUT'));return {data:null};}
  };
  rows.shared_daily_reviews=[];rows.shared_quality_days=[];
  const mock={deleteError:false,modelCalls:0,modelError:false,saveError:false,modelGate:null,review:null};
  const rpc=async(name,args)=>{
    if(!user)return {error:{message:'authentication required'}};
    if(name==='shared_save_daily_review'){
      if(mock.saveError)return {error:{message:'fixture save unavailable'}};
      const {p_document_id:id,p_date:date,p_source_rev:rev,p_source_text:source,p_review:review,p_model:model}=args;
      const doc=rows.shared_documents.find(d=>d.id===id);
      if(!doc||doc.rev!==rev)return {error:{message:'stale_document'}};
      const core=globalThis.JournalAgentCore;
      if(date!==core.shanghaiDate())return {error:{message:'review_date must be today'}};
      try{core.validate(review,source);}catch(e){return {error:{message:e.message}};}
      let row=rows.shared_daily_reviews.find(r=>r.document_id===id&&r.review_date===date);
      if(!row||row.source_text!==source||row.model!==model){
        const next={document_id:id,review_date:date,source_text:source,source_rev:rev,review,model,reviewer_id:user.id,updated:Date.now()};
        if(row)Object.assign(row,next);else {row=next;rows.shared_daily_reviews.push(row);}
        const grade=core.grade(review);
        if(grade.qualified){let day=rows.shared_quality_days.find(r=>r.document_id===id&&r.review_date===date);
          if(day)day.criteria=[...new Set([...day.criteria,...grade.criteria])];
          else rows.shared_quality_days.push({document_id:id,review_date:date,criteria:grade.criteria,awarded_at:Date.now()});
        }
      }
      const collection=core.collection(rows.shared_quality_days.filter(d=>d.document_id===id));
      return {data:{review:row,qualified_days:collection.count,earned:collection.earned}};
    }
    const {p_kind,p_id}=args;
    if(name!=='shared_delete_comment'||!['thread','reply'].includes(p_kind))return {error:{message:'invalid RPC'}};
    if(mock.deleteError)return {error:{message:'删除暂时失败'}};
    const list=p_kind==='thread'?rows.shared_comment_threads:rows.shared_comment_replies;
    const record=list.find(r=>r.id===p_id&&r.owner_id===user.id);
    if(!record)return {data:false};
    record.deleted_at=record.deleted_at||Date.now();record.body='[已删除]';
    if(p_kind==='thread'){record.quote='[已删除]';record.prefix='';record.suffix='';}
    return {data:true};
  };
  const llm={models:{list:async()=>[{id:'hunyuan-chat',enabled:true,modalities:{output:['text']}},{id:'fixture-second',enabled:true,modalities:{output:['text']}}]},chat:{completions:{create:async function*(options){
    mock.modelCalls++;mock.lastRequest=options;if(mock.modelGate)await mock.modelGate;if(mock.modelError)throw Error('fixture model unavailable');
    if(options.messages[1].content==='连接测试，请只回复“连接成功”。'){yield {choices:[{delta:{content:'连接成功'},finish_reason:'stop'}]};return;}
    const record=JSON.parse(options.messages[1].content).record;
    const evidence=record.split('\n').find(s=>s.trim())?.slice(0,200)||record;
    const review=mock.review||{summary:'演示点评：记录了具体成果，可以补充反思与下一步。',dimensions:Object.fromEntries(['specificity','reflection','action'].map(k=>[k,{score:4,reason:'测试数据，仅用于验证界面和保存流程。',evidence:[evidence]}])),suggestions:['说明一个关键原因，并给出明天的验收标准。']};
    const raw=typeof review==='string'?review:JSON.stringify(review);
    yield {choices:[{delta:{content:raw.slice(0,40)}}]};yield {choices:[{delta:{content:raw.slice(40)},finish_reason:'stop'}]};
  }}}};
  globalThis.WorkBuddyCloud={createWorkBuddyCloud:options=>{storage=options.storage;if(user)persistUser();return {auth,database:{from:name=>new Query(name),rpc},llm};}};
  globalThis.__fixture={rows,mock,setUser:async id=>{user=id?{id}:null;persistUser();events.forEach(f=>f(id?'SIGNED_IN':'SIGNED_OUT'));}};
})();
