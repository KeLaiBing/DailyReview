const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canDelete,visibleThreads}=require('../comment-deletion.js');
test('only author can delete live content, including records before migration',()=>{
 const record={owner_id:'A'};
 assert.equal(canDelete(record,null),false);assert.equal(canDelete(record,{id:'B'}),false);assert.equal(canDelete(record,{id:'A'}),true);assert.equal(canDelete({...record,deleted_at:1},{id:'A'}),false);
});
test('deleted root remains while another live reply exists, disappears when none remain',()=>{
 const threads=[{id:'1',deleted_at:1},{id:'2'}];
 assert.deepEqual(visibleThreads(threads,[]).map(t=>t.id),['2']);
 assert.deepEqual(visibleThreads(threads,[{thread_id:'1',owner_id:'B'}]).map(t=>t.id),['1','2']);
 assert.deepEqual(visibleThreads(threads,[{thread_id:'1',owner_id:'B',deleted_at:2}]).map(t=>t.id),['2']);
});
