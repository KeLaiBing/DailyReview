(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JournalModelClient=api;})(globalThis,()=>{
  'use strict';
  function endpoint(value){
    let url;try{url=new URL(String(value).trim());}catch{throw Error('请输入完整的 API 地址，例如 https://服务域名/v1');}
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.search||url.hash)
      throw Error('API 地址须使用 HTTPS（本机可用 HTTP），不能包含账号、查询参数或片段。');
    url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'')+'/chat/completions';
    return url.href;
  }
  function preferences(value={}){
    return {provider:value.provider==='api'?'api':'workbuddy',nativeModel:String(value.nativeModel||'hunyuan-chat').slice(0,110),
      baseUrl:String(value.baseUrl||'').slice(0,500),apiModel:String(value.apiModel||'').trim().slice(0,110)};
  }
  function modelTag(config){
    if(config.provider!=='api')return config.nativeModel;
    let hash=2166136261;for(const char of endpoint(config.baseUrl)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return 'api:'+config.apiModel.slice(0,95)+'@'+(hash>>>0).toString(16);
  }
  async function complete(config,{cloud,messages,signal,fetchImpl=globalThis.fetch,onProgress=()=>{}}){
    if(signal?.aborted)throw new DOMException('已取消','AbortError');
    if(config.provider!=='api'){
      if(!cloud?.llm)throw Error('当前云服务未提供大模型能力。');
      let raw='';
      for await(const chunk of cloud.llm.chat.completions.create({model:config.nativeModel,messages,stream:true,max_tokens:8192,signal})){
        if(signal?.aborted)throw new DOMException('已取消','AbortError');
        const finish=chunk.choices?.[0]?.finish_reason;
        if(finish&&finish!=='stop')throw Error('模型未完成点评，请重试或切换模型。');
        const value=chunk.choices?.[0]?.delta?.content;if(typeof value==='string')raw+=value;
        if(raw.length>20000)throw Error('模型返回内容过长。');onProgress();
      }
      return raw;
    }
    const url=endpoint(config.baseUrl);
    if(!config.apiModel?.trim())throw Error('请在模型设置中填写模型 ID。');
    const headers={'Content-Type':'application/json'};
    if(config.apiKey)headers.Authorization='Bearer '+config.apiKey;
    let response;
    try{response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify({model:config.apiModel,messages,stream:false,max_tokens:3000}),signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});}
    catch(e){if(signal?.aborted||e.name==='AbortError')throw e;throw Error('API 连接失败。请检查地址、浏览器跨域许可（CORS）及服务状态。');}
    if(!response.ok){
      const reasons={401:'Key 无效或已过期',403:'没有访问该模型的权限',404:'地址或模型不存在',429:'额度不足或请求过于频繁'};
      throw Error(`API 请求失败（${response.status}）：${reasons[response.status]||'服务暂时不可用'}`);
    }
    let body='';
    if(response.body?.getReader){
      const reader=response.body.getReader(),decoder=new TextDecoder();
      try{while(true){const {value,done}=await reader.read();if(done)break;body+=decoder.decode(value,{stream:true});if(body.length>100000){await reader.cancel();throw Error('API 返回内容过长。');}}body+=decoder.decode();}finally{reader.releaseLock();}
    }else body=await response.text();
    if(body.length>100000)throw Error('API 返回内容过长。');
    let data;try{data=JSON.parse(body);}catch{throw Error('API 返回的不是有效 JSON，请检查兼容接口地址。');}
    const choice=data.choices?.[0],raw=choice?.message?.content;
    if(choice?.finish_reason&&choice.finish_reason!=='stop')throw Error('API 未完成点评，请检查模型输出限制。');
    if(typeof raw!=='string'||!raw.trim()||raw.length>20000)throw Error('API 没有返回有效的文字结果。');
    return raw;
  }
  return {endpoint,preferences,modelTag,complete};
});
