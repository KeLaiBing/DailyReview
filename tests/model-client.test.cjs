const test=require('node:test'),assert=require('node:assert/strict');
const client=require('../model-client.js');
const config={provider:'api',baseUrl:'https://example.invalid/v1/',apiModel:'model-a',apiKey:'test-secret'};
test('API URLs normalize once and reject credential-bearing or unsafe URLs',()=>{
  assert.equal(client.endpoint(config.baseUrl),'https://example.invalid/v1/chat/completions');
  assert.equal(client.endpoint('https://example.invalid/v1/chat/completions'),'https://example.invalid/v1/chat/completions');
  assert.equal(client.endpoint('http://localhost:53538/v1'),'http://localhost:53538/v1/chat/completions');
  for(const url of ['http://remote.invalid/v1','https://u:password@example.invalid/v1','https://example.invalid/v1?key=secret','javascript:alert(1)'])assert.throws(()=>client.endpoint(url));
  assert.ok(!JSON.stringify(client.preferences(config)).includes('test-secret'));
  assert.notEqual(client.modelTag(config),client.modelTag({...config,baseUrl:'https://other.invalid/v1'}));
});
test('API call uses chosen service and model, never cloud session credentials',async()=>{
  let captured;
  const result=await client.complete(config,{messages:[{role:'user',content:'sample'}],fetchImpl:async(url,options)=>{
    captured={url,options};return new Response(JSON.stringify({choices:[{message:{content:'result'},finish_reason:'stop'}]}));
  }});
  assert.equal(result,'result');assert.equal(captured.options.headers.Authorization,'Bearer test-secret');
  assert.equal(JSON.parse(captured.options.body).model,'model-a');assert.equal(captured.options.credentials,'omit');assert.equal(captured.options.redirect,'error');
});
test('API failures, oversized output, cancellation and incomplete output fail explicitly',async()=>{
  for(const code of [401,403,404,429,500])await assert.rejects(client.complete(config,{messages:[],fetchImpl:async()=>new Response('secret must not echo',{status:code})}),e=>e.message.includes(String(code))&&!e.message.includes('secret'));
  await assert.rejects(client.complete(config,{messages:[],fetchImpl:async()=>{throw Error('secret');}}),/CORS/);
  await assert.rejects(client.complete(config,{messages:[],fetchImpl:async()=>new Response('x'.repeat(100001))}),/过长/);
  await assert.rejects(client.complete(config,{messages:[],fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'partial'},finish_reason:'length'}]}))}),/未完成/);
  const controller=new AbortController();controller.abort();let called=false;
  await assert.rejects(client.complete(config,{signal:controller.signal,fetchImpl:async()=>{called=true;}}),/取消/);assert.equal(called,false);
});
