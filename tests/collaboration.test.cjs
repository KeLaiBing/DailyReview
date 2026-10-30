const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {anchor,locate,dateTitle,buildTemplateInsertion}=require('../collaboration-core.js');
test('selected Chinese text survives insertions before its anchor',()=>{
  const s='今天的任务：完成报告。晚上复盘。', a=anchor(s,6,10);
  assert.equal(a.quote,'完成报告');
  assert.equal(locate('新增内容'+s,a).start,10);
});
test('context distinguishes repeated daily task labels',()=>{
  const s='日期一 任务目标：读书。日期二 任务目标：写作。';
  const start=s.lastIndexOf('任务目标');
  const a=anchor(s,start,start+4);
  assert.equal(locate(s,a).start,start);
});
test('deleted and ambiguous quotes remain detached',()=>{
  assert.equal(locate('原文已删除',{quote:'原来的内容'}),null);
  assert.equal(locate('任务任务',{quote:'任务',start_offset:0}),null);
});
test('offsets use DOM UTF-16 positions including emoji',()=>{
  const text='🐙今天完成日结'; const a=anchor(text,4,8);
  const found=locate(text,a); assert.equal(found.start,4);assert.equal(found.end,8);
});
test('date headings use the chosen day',()=>{
  assert.equal(dateTitle('2026-10-30'),'日期：2026.10.30');
});
// 与 useTemplate 相同的插入路径：Range.insertNode 直接插入显式构造的片段。
function insertTemplate(editorHtml,templateHtml,title){
  const dom=new JSDOM('<div id="editor" contenteditable="true">'+editorHtml+'</div>');
  const {document}=dom.window,editor=document.getElementById('editor');
  editor.prepend(buildTemplateInsertion(document,templateHtml,title));
  const result=editor.innerHTML;dom.window.close();return result;
}
test('template without a heading gains the chosen day heading at the document start',()=>{
  const html=insertTemplate('<h1>日期：2026.10.29</h1><p>昨天</p>','<p>任务目标：</p><p>今日总结：</p>','日期：2026.10.30');
  assert.match(html,/<h1>日期：2026\.10\.30<\/h1><p>任务目标：<\/p><p>今日总结：<\/p><p><br><\/p><h1>日期：2026\.10\.29/);
  assert.equal((html.match(/日期：2026\.10\.30/g)||[]).length,1);
});
test('stale saved date headings are replaced by the chosen day instead of lingering',()=>{
  const html=insertTemplate('<p><br></p>','<h1>日期：2026.10.01</h1><p>任务目标：</p>','日期：2026.10.30');
  assert.doesNotMatch(html,/2026\.10\.01/);
  assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.match(html,/<h1>日期：2026\.10\.30<\/h1><p>任务目标：<\/p>/);
});
test('same-date templates still prepend an independent heading',()=>{
  const html=insertTemplate('<h1>日期：2026.10.30</h1><p>已有内容</p>','<p>任务目标：</p>','日期：2026.10.30');
  assert.equal((html.match(/<h1>/g)||[]).length,2);
  assert.match(html,/^<h1>日期：2026\.10\.30<\/h1><p>任务目标：<\/p>/);
  assert.ok(html.endsWith('<p>已有内容</p>'));
});
test('non-date headings inside a template become subsections beneath the day heading',()=>{
  const html=insertTemplate('<p><br></p>','<h1>我的复盘</h1><p>任务目标：</p>','日期：2026.10.30');
  assert.match(html,/<h1>日期：2026\.10\.30<\/h1><h2>我的复盘<\/h2><p>任务目标：<\/p>/);
});
