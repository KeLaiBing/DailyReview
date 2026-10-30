(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CommentDeletion=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const deleted=record=>record.deleted_at!=null;
  const canDelete=(record,user)=>Boolean(user?.id&&record.owner_id===user.id&&!deleted(record));
  const visibleThreads=(threads,replies)=>threads.filter(t=>!deleted(t)||replies.some(r=>r.thread_id===t.id&&!deleted(r)));
  return {deleted,canDelete,visibleThreads};
});
