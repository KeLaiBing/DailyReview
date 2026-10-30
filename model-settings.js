'use strict';
window.JournalModelSettings=(()=>{
  const client=JournalModelClient,core=JournalAgentCore;
  let account=null,config=client.preferences(),apiKey='',models=[],loading=null,testController=null;
  const storageKey=()=>`journal.model-settings.v1.${account||'guest'}`;
  const status=text=>{$('modelSettingsStatus').textContent=text;};
  const persistPreferences=()=>{try{localStorage.setItem(storageKey(),JSON.stringify(client.preferences(config)));}catch{status('浏览器未允许保存偏好，本次页面内仍可使用。');}};
  function context(){
    const next=Collaboration.user?.id||null;if(account===next)return;
    account=next;apiKey='';$('apiKey').value='';testController?.abort();testController=null;
    try{config=client.preferences(JSON.parse(localStorage.getItem(storageKey())||'{}'));}catch{config=client.preferences();}
    $('modelSettingsDialog').close();render();
  }
  function render(){
    const select=$('reviewModel');
    select.replaceChildren();
    if(config.provider==='api'){
      select.add(new Option(config.apiModel||'请设置 API 模型','api'));
      $('reviewModelHint').textContent='自定义 API · 由所填服务计费';
    }else{
      for(const m of models)select.add(new Option(m.name&&m.name!==m.id?`${m.name} · ${m.id}`:m.id,m.id));
      select.value=config.nativeModel;
      $('reviewModelHint').textContent=models.length?'WorkBuddy 云端模型':'打开设置以读取云端模型';
    }
    const native=$('nativeModel');native.replaceChildren(...models.map(m=>new Option(m.name&&m.name!==m.id?`${m.name} · ${m.id}`:m.id,m.id)));native.value=config.nativeModel;
  }
  async function loadModels(force=false){
    if(force)loading=null;
    if(!loading)loading=(async()=>{
      if(!cloud?.llm)throw Error('云端模型服务尚未连接');
      models=core.selectableModels(await cloud.llm.models.list());
      if(!models.some(m=>m.id===config.nativeModel)){config.nativeModel=core.defaultModelId(models)||'';persistPreferences();}
      render();return models;
    })().catch(e=>{loading=null;throw e;});
    return loading;
  }
  function fields(){
    const provider=$('modelProvider').value;
    return {...client.preferences({provider,nativeModel:$('nativeModel').value||config.nativeModel,baseUrl:$('apiBaseUrl').value.trim(),apiModel:$('apiModel').value}),apiKey:$('apiKey').value.trim()};
  }
  function validate(value){
    if(value.provider==='api'){client.endpoint(value.baseUrl);if(!value.apiModel)throw Error('请填写 API 模型 ID。');}
    else if(!models.some(m=>m.id===value.nativeModel))throw Error('请选择可用的 WorkBuddy 模型。');
    return value;
  }
  function providerView(){const custom=$('modelProvider').value==='api';$('nativeModelFields').hidden=custom;$('apiModelFields').hidden=!custom;}
  function open(){
    if(!requireEdit())return;context();
    $('modelProvider').value=config.provider;$('apiBaseUrl').value=config.baseUrl;$('apiModel').value=config.apiModel;$('apiKey').value=apiKey;
    render();providerView();status('');$('modelSettingsDialog').showModal();
    loadModels().catch(()=>status('WorkBuddy 模型目录暂时无法读取，可重试或配置自己的 API。'));
  }
  async function selected(){
    context();if(config.provider==='workbuddy')await loadModels();
    return validate({...config,apiKey});
  }
  $('modelSettingsButton').onclick=open;$('modelProvider').onchange=providerView;
  $('reloadModels').onclick=async()=>{status('正在读取模型…');try{await loadModels(true);status(`已读取 ${models.length} 个文字模型。`);}catch{status('模型目录读取失败，请稍后重试。');}};
  $('reviewModel').onchange=()=>{if(config.provider==='workbuddy'){config.nativeModel=$('reviewModel').value;persistPreferences();}};
  $('modelSettingsForm').onsubmit=e=>{
    e.preventDefault();if(!requireEdit())return;
    try{const value=validate(fields());config=client.preferences(value);apiKey=value.apiKey;persistPreferences();render();$('modelSettingsDialog').close();toast('模型设置已保存');}catch(e){status(e.message);}
  };
  $('testModelConnection').onclick=async()=>{
    if(testController){testController.abort();return;}
    let value;try{value=validate(fields());}catch(e){status(e.message);return;}
    const controller=new AbortController(),uid=account;testController=controller;
    $('testModelConnection').textContent='停止测试';status('正在测试连接（只发送测试短句，不发送日结）…');
    const timer=setTimeout(()=>controller.abort(),30000);
    try{await client.complete(value,{cloud,messages:[{role:'system',content:'你是连接测试助手，只回复简短文字。'},{role:'user',content:'连接测试，请只回复“连接成功”。'}],signal:controller.signal});if(uid===account&&!controller.signal.aborted)status('连接成功，可以保存并进行日结点评。');}
    catch(e){if(uid===account)status(controller.signal.aborted?'测试已停止或超时。':e.message);}
    finally{clearTimeout(timer);if(testController===controller)testController=null;$('testModelConnection').textContent='测试连接';}
  };
  $('modelSettingsDialog').addEventListener('close',()=>{testController?.abort();$('apiKey').value='';});
  window.addEventListener('journal-access-changed',context);
  return {open,selected,loadModels,context,modelTag:()=>client.modelTag(config)};
})();
