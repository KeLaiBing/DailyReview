const test=require('node:test');
const assert=require('node:assert/strict');
const {anchor,locate,dateTitle}=require('../collaboration-core.js');
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
