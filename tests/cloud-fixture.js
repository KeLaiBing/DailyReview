// Isolated test data only. Never include this file in the published site.
(function() {
  const initial='<h1>日期：2026.10.30</h1><p>前言：今天完成了报告</p><hr><p>任务目标：</p><p class="todo" data-done="false">阅读论文</p><table><tbody><tr><td>事件</td><td>打卡记录（图片）</td><td>感受总结（吐槽也行）</td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>';
  const rows={shared_documents:[{id:'doc-a',title:'小林的日结',date:'2026-10-30',html:initial,created:1,updated:Date.now(),rev:1},{id:'doc-b',title:'小周的日结',date:'2026-10-30',html:'<h1>日期：2026.10.30</h1><p>小周今天完成了报告</p>',created:2,updated:Date.now()-1,rev:1}],shared_settings:[],shared_profiles:[{owner_id:'user-a',display_name:'小林'},{owner_id:'user-b',display_name:'小周'}],shared_templates:[],shared_comment_threads:[],shared_comment_replies:[]};
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
  const mock={deleteError:false};
  const rpc=async(name,{p_kind,p_id})=>{
    if(!user)return {error:{message:'authentication required'}};
    if(name!=='shared_delete_comment'||!['thread','reply'].includes(p_kind))return {error:{message:'invalid RPC'}};
    if(mock.deleteError)return {error:{message:'删除暂时失败'}};
    const list=p_kind==='thread'?rows.shared_comment_threads:rows.shared_comment_replies;
    const record=list.find(r=>r.id===p_id&&r.owner_id===user.id);
    if(!record)return {data:false};
    record.deleted_at=record.deleted_at||Date.now();record.body='[已删除]';
    if(p_kind==='thread'){record.quote='[已删除]';record.prefix='';record.suffix='';}
    return {data:true};
  };
  globalThis.WorkBuddyCloud={createWorkBuddyCloud:options=>{storage=options.storage;if(user)persistUser();return {auth,database:{from:name=>new Query(name),rpc}};}};
  globalThis.__fixture={rows,mock,setUser:async id=>{user=id?{id}:null;persistUser();events.forEach(f=>f(id?'SIGNED_IN':'SIGNED_OUT'));}};
})();
