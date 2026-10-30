'use strict';
const $ = id => document.getElementById(id);
const editor = $('editor');
const canEdit = () => Boolean(window.Collaboration?.user);
function requireEdit() { if(canEdit()) return true; window.Collaboration?.login(); return false; }
let shared = location.protocol !== 'file:', settings = {workspace:'我的日结', folder:'日常记录', rev:0}, savedRevision = 0, conflict = false;
const versions = new Map();
const savedLabel = () => shared ? '已保存到共享空间' : '已保存到此浏览器';
let db, docs = [], current = null, selectedRange = null, hoverBlock = null, menuBlock = null;
let saveQueue = Promise.resolve(), revision = 0, outlineTimer, activeCell = null, pickerContext;
const newId = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n=>n.toString(16).padStart(2,'0')).join('');
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4000); }
function database() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('daily-journal-local', 2);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('documents')) req.result.createObjectStore('documents', {keyPath:'id'}); req.result.createObjectStore('settings'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function readAll() { if(shared) return api('/api/documents'); return new Promise((resolve,reject) => { const req = db.transaction('documents').objectStore('documents').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function writeDoc(doc) { if(!canEdit()) return Promise.reject(httpError(401,'请先登录后保存'));  if(shared) return api('/api/documents/'+doc.id, {method:'PUT',body:JSON.stringify({...doc,rev:versions.get(doc.id) || 0})}).then(result => { versions.set(doc.id,result.rev); }); return new Promise((resolve,reject) => { const tx = db.transaction('documents','readwrite'); tx.objectStore('documents').put(doc); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
function persist() {
  if (!canEdit() || !current || (!db && !shared)) return saveQueue;
  if (conflict) return Promise.reject(new Error('请先处理版本冲突'));
  if (current.html === editor.innerHTML && current.title === $('docTitle').value && savedRevision === revision) return saveQueue;
  current.title = $('docTitle').value;
  current.html = editor.innerHTML;
  current.updated = Date.now();
  const snapshot = {...current}, version = ++revision;
  $('saveStatus').textContent = shared ? '正在保存到共享空间…' : '正在保存到此浏览器…';
  $('crumbTitle').textContent = current.title || '无标题文档';
  saveQueue = saveQueue.catch(() => {}).then(() => { if(conflict) throw new Error('版本冲突尚未处理'); return writeDoc(snapshot); }).then(() => {
    savedRevision = version;
    if (version === revision) { $('saveStatus').textContent = savedLabel(); $('modified').textContent = '刚刚修改'; }
  }).catch(err => { if(err.status === 409) { conflict = true; $('conflictBar').hidden = false; } $('saveStatus').textContent = '未保存，请保留此页面'; toast('无法保存：' + err.message); throw err; });
  saveQueue.catch(() => {});
  renderList();
  clearTimeout(outlineTimer); outlineTimer = setTimeout(renderOutline, 180);
  return saveQueue;
}
function renderList() {
  const q = $('search').value.trim().toLowerCase();
  $('docList').replaceChildren();
  docs.slice().sort((a,b) => (a.created || a.updated) - (b.created || b.updated)).filter(d => (d.title + d.date).toLowerCase().includes(q)).forEach(doc => {
    const b = document.createElement('button'); b.className = 'doc-link' + (current?.id === doc.id ? ' active' : '');
    b.innerHTML = '<span class="doc-icon">▤</span><span></span>'; b.lastChild.textContent = doc.title || '无标题文档'; b.title = doc.title || '无标题文档';
    b.onclick = () => openDoc(doc).catch(e => toast(e.message));
    const row = document.createElement('div'); row.className='doc-row'; row.append(b);
    const rename = document.createElement('button'); rename.className='rename-doc icon'; rename.textContent='✎'; rename.title='重命名文档'; rename.setAttribute('aria-label','重命名 '+(doc.title || '无标题文档'));
    rename.disabled=!canEdit(); rename.onclick = async () => { if(!requireEdit()) return; try { await openDoc(doc); $('docTitle').focus(); $('docTitle').select(); } catch(e) { toast(e.message); } };
    row.append(rename); $('docList').append(row);
  });
}
async function openDoc(doc) {
  if (current) await persist();
  current = doc; selectedRange = null; hoverBlock = null; menuBlock = null; activeCell = null;
  closeMenus(); $('insertPlus').classList.remove('visible');
  $('docTitle').value = doc.title; $('crumbTitle').textContent = doc.title || '无标题文档';
  editor.innerHTML = cleanHTML(doc.html || '<p><br></p>'); doc.html=editor.innerHTML;
  $('modified').textContent = new Date(doc.updated).toLocaleDateString('zh-CN') + ' 修改';
  $('saveStatus').textContent = savedLabel(); $('scrollArea').scrollTop = 0;
  renderList(); renderOutline(); window.Collaboration?.documentChanged();window.dispatchEvent(new Event('journal-document-changed'));
}
async function newDoc(title) {
  if(!requireEdit()) return;
  if (current) await persist();
  const now = Date.now();
  const doc = {id:newId(), member_id:window.Collaboration.memberId, date:today(), title:title || (window.Collaboration.displayName+'的日结'), html:'<p><br></p>', created:now, updated:now};
  await writeDoc(doc); docs.push(doc); await openDoc(doc); $('docTitle').focus(); $('docTitle').select();
}
function addDay() {
  if(!requireEdit()) return;
  if(!current) return;
  const title = '日期：' + today().replaceAll('-','.');
  const existing = [...editor.querySelectorAll('h1')].find(h => h.textContent.trim() === title);
  if(existing) { existing.scrollIntoView({block:'center'}); setCaret(existing.nextElementSibling || existing); return; }
  const range = document.createRange(); range.selectNodeContents(editor); range.collapse(true);
  insertHTML('<h1>'+title+'</h1><p><br></p>',range);
  const heading = editor.querySelector('h1'); heading.scrollIntoView({block:'center'}); setCaret(heading.nextElementSibling || heading);
}
$('addDay').onclick = addDay;
function renderOutline() {
  $('outlineItems').replaceChildren();
  editor.querySelectorAll('h1,h2,h3').forEach(heading => {
    const b = document.createElement('button'); b.textContent = heading.textContent || '未命名标题';
    b.style.paddingLeft = (10 + (+heading.tagName[1] - 1) * 12) + 'px';
    b.onclick = () => { heading.scrollIntoView({behavior:'smooth',block:'start'}); setCaret(heading); };
    $('outlineItems').append(b);
  });
  if (!$('outlineItems').children.length) $('outlineItems').innerHTML = '<span class="empty-outline">添加标题后显示目录</span>';
}
function setCaret(node, end=false) { const r = document.createRange(); r.selectNodeContents(node); r.collapse(!end); restore(r); }
function restore(range=selectedRange) {
  editor.focus({preventScroll:true});
  if (range && editor.contains(range.commonAncestorContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
}
function capture() { const s = getSelection(); return s.rangeCount && editor.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0).cloneRange() : null; }
function elementAt(node) { return node?.nodeType === 1 ? node : node?.parentElement; }
function blockAt(node) { let el = elementAt(node); if (!el || el === editor || !editor.contains(el)) return null; while (el.parentElement !== editor) el = el.parentElement; return el; }
function position(popover, x, y) { popover.hidden = false; const r = popover.getBoundingClientRect(); popover.style.left = Math.max(8, Math.min(x, innerWidth-r.width-8))+'px'; popover.style.top = Math.max(8, Math.min(y, innerHeight-r.height-8))+'px'; }
function closeMenus() { ['insertMenu','formatBar','tableBar'].forEach(id => $(id).hidden = true); }
function changed() { persist().catch(() => {}); }
editor.addEventListener('input', changed);
$('docTitle').addEventListener('input', changed);
$('search').oninput = renderList;
$('newDoc').onclick = () => newDoc().catch(e=>toast('无法新建：'+e.message));
$('closeSide').onclick = () => { document.body.classList.add('side-closed'); document.body.classList.remove('mobile-side'); };
$('openSide').onclick = () => { document.body.classList.remove('side-closed'); document.body.classList.toggle('mobile-side'); };

// All paragraphs and table cells share a single editing host. The browser handles
// arrow navigation, range selection, paragraph splitting, merging and undo.
document.addEventListener('selectionchange', () => {
  const range = capture(); if (!range) return;
  selectedRange = range;
  activeCell = elementAt(range.startContainer)?.closest('td,th');
  if (range.collapsed) $('formatBar').hidden = true;
  else { const r = range.getBoundingClientRect(); position($('formatBar'), r.left, r.top-48); }
  if (canEdit() && activeCell && range.collapsed) { const r = activeCell.closest('table').getBoundingClientRect(); position($('tableBar'), r.left, r.top-40); }
  else $('tableBar').hidden = true;
});
$('formatBar').onmousedown = e => e.preventDefault();
$('formatBar').onclick = e => {
  const b = e.target.closest('button'); if (!b || b.dataset.action) return; if(!requireEdit()) return; restore();
  if (b.dataset.format) document.execCommand('formatBlock', false, b.dataset.format);
  else {
    const cmd = b.dataset.cmd; let value = cmd === 'hiliteColor' ? '#fff2a8' : null;
    if (cmd === 'createLink') { value = prompt('链接地址（https://…）'); if (!value) return; if (!/^(https?:|mailto:)/i.test(value)) { toast('请输入 http、https 或 mailto 链接'); return; } }
    document.execCommand(cmd,false,value);
  }
  changed();
};

// Hit-test the entire gutter, including the gap between the button and text.
$('scrollArea').addEventListener('mousemove', e => {
  if(!canEdit()) return;
  if (!$('insertMenu').hidden || e.target.closest('#insertPlus')) return;
  let b = blockAt(e.target);
  if (!b) b = [...editor.children].find(el => { const r = el.getBoundingClientRect(); return e.clientY >= r.top-4 && e.clientY <= r.bottom+4; });
  if (!b) { $('insertPlus').classList.remove('visible'); return; }
  hoverBlock = b;
  const r = b.getBoundingClientRect(), area = $('scrollArea'), a = area.getBoundingClientRect();
  $('insertPlus').style.left = Math.max(2,r.left-a.left-34)+'px';
  $('insertPlus').style.top = (r.top-a.top+area.scrollTop+2)+'px';
  $('insertPlus').classList.add('visible');
});
$('scrollArea').addEventListener('mouseleave', () => { if ($('insertMenu').hidden) $('insertPlus').classList.remove('visible'); });
$('scrollArea').addEventListener('scroll', () => { closeMenus(); $('insertPlus').classList.remove('visible'); });
$('insertPlus').onmousedown = e => e.preventDefault();
$('insertPlus').onclick = () => {
  if(!requireEdit()) return;
  menuBlock = hoverBlock;
  const r = $('insertPlus').getBoundingClientRect();
  closeMenus(); position($('insertMenu'),r.left,r.bottom+4);
};
$('insertMenu').onmousedown = e => e.preventDefault();
function insertionRange() {
  if (menuBlock?.isConnected) { const r = document.createRange(); r.setStartAfter(menuBlock); r.collapse(true); return r; }
  return capture() || selectedRange;
}
function insertHTML(html, range) { if(!requireEdit() || !current) return; restore(range); document.execCommand('insertHTML',false,html); selectedRange = capture(); changed(); }
$('insertMenu').onclick = e => {
  if(!requireEdit()) return;
  const kind = e.target.closest('[data-insert]')?.dataset.insert; if (!kind) return;
  const range = insertionRange();
  closeMenus();
  if(kind === 'day') { addDay(); menuBlock=null; return; }
  if (kind === 'image') { pickerContext = {range, docId:current.id}; $('imagePicker').click(); return; }
  let html;
  if (kind === 'table') html = '<table><tbody>'+('<tr>'+ '<td><br></td>'.repeat(3)+'</tr>').repeat(3)+'</tbody></table><p><br></p>';
  else if (kind === 'hr') html = '<hr><p><br></p>';
  else if (kind === 'todo') html = '<p class="todo" data-done="false"><br></p>';
  else if (kind === 'ul' || kind === 'ol') html = `<${kind}><li><br></li></${kind}>`;
  else html = `<${kind}><br></${kind}>`;
  insertHTML(html,range); menuBlock = null;
};
editor.addEventListener('keydown', e => {
  if (e.isComposing || !canEdit()) return;
  if (e.key === 'Escape') closeMenus();
  if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
    const b = blockAt(getSelection().anchorNode);
    if (b && !b.textContent.trim() && !b.querySelector('table,img')) { e.preventDefault(); menuBlock = null; selectedRange = capture(); const r = b.getBoundingClientRect(); position($('insertMenu'), r.left, r.bottom); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); changed(); }
  if (e.key === 'Tab' && activeCell) {
    e.preventDefault(); const cells = [...activeCell.closest('table').querySelectorAll('td,th')], next = cells[cells.indexOf(activeCell)+(e.shiftKey?-1:1)];
    if (next) setCaret(next); else if (!e.shiftKey) { const table = activeCell.closest('table'); const row = table.insertRow(); for(let i=0;i<table.rows[0].cells.length;i++) row.insertCell().innerHTML='<br>'; setCaret(row.cells[0]); changed(); }
  }
});
editor.addEventListener('click', e => {
  if(!canEdit()) return;
  const todo = e.target.closest('.todo');
  if (todo && e.clientX < todo.getBoundingClientRect().left + 25) { todo.dataset.done = todo.dataset.done !== 'true'; changed(); }
  if (e.target === editor && e.clientY > (editor.lastElementChild?.getBoundingClientRect().bottom || 0)) {
    if (!editor.lastElementChild || editor.lastElementChild.textContent || editor.lastElementChild.tagName !== 'P') { const p = document.createElement('p'); p.innerHTML='<br>'; editor.append(p); changed(); }
    setCaret(editor.lastElementChild,true);
  }
});
$('tableBar').onmousedown = e => e.preventDefault();
$('tableBar').onclick = e => {
  if(!requireEdit()) return;
  const op = e.target.dataset.table; if (!op || !activeCell?.isConnected) return;
  const table = activeCell.closest('table'), row = activeCell.parentElement, index = activeCell.cellIndex;
  if (op === 'row') { const tr = table.insertRow(row.rowIndex+1); for(let i=0;i<row.cells.length;i++) tr.insertCell().innerHTML='<br>'; setCaret(tr.cells[0]); }
  if (op === 'col') { [...table.rows].forEach(tr => tr.insertCell(index+1).innerHTML='<br>'); }
  if (op === 'deleteRow') { if (table.rows.length === 1) table.remove(); else row.remove(); }
  if (op === 'deleteCol') { if (row.cells.length === 1) table.remove(); else [...table.rows].forEach(tr => tr.deleteCell(index)); }
  $('tableBar').hidden = true; changed();
};

function readImage(file) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
async function insertImages(files, context) {
  if(!requireEdit()) return;
  const images = files.filter(file => /^image\//.test(file.type)); if (!images.length) return;
  try {
    const html = [];
    for (const file of images) { if (file.size > 10*1024*1024) throw new Error('单张图片不能超过 10 MB'); const data = await readImage(file); html.push(`<img src="${data}" alt="${escapeHTML(file.name || '粘贴的图片')}">`); }
    if (current.id !== context.docId || !editor.contains(context.range?.commonAncestorContainer)) { toast('插入位置已变更，请在目标文档重新粘贴'); return; }
    insertHTML(html.join('<br>'), context.range);
  } catch(e) { toast('图片插入失败：'+e.message); }
}
$('imagePicker').onchange = async e => { const files = [...e.target.files], context = pickerContext; e.target.value=''; if(context) await insertImages(files,context); };
// Only allow document formatting from rich clipboard HTML. Strip executable
// content, event handlers and external image URLs; clipboard image files use data URLs.
function cleanHTML(html) {
  const source = new DOMParser().parseFromString(html,'text/html');
  source.querySelectorAll('script,style,iframe,object,embed,svg,math,form,input,button,link,meta').forEach(n => n.remove());
  const allowed = new Set('P DIV BR SPAN B STRONG I EM U S STRIKE MARK A H1 H2 H3 BLOCKQUOTE UL OL LI TABLE TBODY THEAD TR TD TH IMG HR'.split(' '));
  [...source.body.querySelectorAll('*')].reverse().forEach(el => {
    if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
    const src = el.getAttribute('src'), href = el.getAttribute('href'), todo=el.classList.contains('todo'), done=el.dataset.done;
    const spans={colspan:el.getAttribute('colspan'),rowspan:el.getAttribute('rowspan')};
    const styles={}; ['color','background-color','font-weight','font-style','text-decoration','text-align'].forEach(k=>{const v=el.style.getPropertyValue(k); if(v && !/url|expression|var\(/i.test(v)) styles[k]=v;});
    [...el.attributes].forEach(a => el.removeAttribute(a.name));
    if(todo && ['P','DIV','LI'].includes(el.tagName)) {el.className='todo';el.dataset.done=done==='true'?'true':'false';}
    if(['TD','TH'].includes(el.tagName)) Object.entries(spans).forEach(([k,v])=>{if(/^[1-9][0-9]?$/.test(v||''))el.setAttribute(k,v);});
    Object.entries(styles).forEach(([k,v])=>el.style.setProperty(k,v));
    if (el.tagName === 'IMG') { if (src && /^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(src)) el.src = src; else el.remove(); }
    if (el.tagName === 'A' && /^(https?:|mailto:)/i.test(href || '')) { el.href = href; el.rel='noopener noreferrer'; }
  });
  return source.body.innerHTML;
}
editor.addEventListener('paste', e => {
  if(!canEdit()){e.preventDefault();return;}
  const data = e.clipboardData; if (!data) return;
  const files = [...data.items].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
  const range = capture();
  if (files.length) { e.preventDefault(); insertImages(files,{range,docId:current.id}); return; }
  e.preventDefault();
  const html = data.getData('text/html');
  if (html) insertHTML(cleanHTML(html),range);
  else { restore(range); document.execCommand('insertText',false,data.getData('text/plain')); changed(); }
});
editor.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
editor.addEventListener('drop', e => {
  if(!canEdit()){e.preventDefault();return;}
  const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')); if (!files.length) return;
  e.preventDefault();
  const point = document.caretRangeFromPoint?.(e.clientX,e.clientY);
  const range = point && editor.contains(point.commonAncestorContainer) ? point : capture();
  insertImages(files,{range,docId:current.id});
});
document.addEventListener('mousedown', e => { if (!e.target.closest('.popover,#insertPlus,#formatToggle')) closeMenus(); });
window.addEventListener('beforeunload', e => { if ((savedRevision!==revision || settingsEditVersion!==settingsSavedVersion) && current) { e.preventDefault(); e.returnValue=''; } });
// 共享模式后端：游客可读；写入必须登录，服务端 RLS 独立验证权限。
// 接口形状保持不变：/api/documents、/api/documents/:id、/api/settings，rev 乐观锁防多人冲突。
const cloud = WorkBuddyCloud.createWorkBuddyCloud({
  endpoint: "https://daily-journal-80695.app.workbuddy.host",
  publishableKey: "wbpk_kz8XqnJPqUZ8pGCrTsLoA2_2nmuvy4XkoJtArBU5NAuMkLZr9HUtVoi"
});
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function unwrap(r) { if (r.error) throw httpError(500, r.error.message || '共享服务不可用'); return r.data; }
const DOC_FIELDS = d => ({date:d.date || null, title:d.title || '', html:d.html || '', created:d.created || Date.now(), updated:d.updated || Date.now()});
async function api(path, options={}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  if(method!=='GET' && !canEdit()) throw httpError(401,'请先登录');
  // ---- 空间设置 ----
  if (path === '/api/settings') {
    if (method === 'GET') {
      const row = unwrap(await cloud.database.from('shared_settings').select('*').eq('id','workspace').maybeSingle());
      return row || {workspace:'我的日结', folder:'日常记录', rev:0};
    }
    const rev = (body.rev || 0) + 1;
    const updated = unwrap(await cloud.database.from('shared_settings').update({workspace:body.workspace, folder:body.folder, rev}).eq('id','workspace').eq('rev',body.rev || 0).select());
    if (updated && updated.length) return updated[0];
    const exists = unwrap(await cloud.database.from('shared_settings').select('id').eq('id','workspace').maybeSingle());
    if (exists) throw httpError(409,'设置已被他人修改');
    const inserted = unwrap(await cloud.database.from('shared_settings').insert({id:'workspace', workspace:body.workspace, folder:body.folder, rev}).select());
    return inserted[0];
  }
  // ---- 文档列表 / 摘要（摘要不带 html 正文，节省同步流量） ----
  if (path === '/api/documents') {
    return unwrap(await cloud.database.from('shared_documents').select('*'));
  }
  if (path === '/api/documents?summary=1') {
    return unwrap(await cloud.database.from('shared_documents').select('id,date,title,created,updated,rev,member_id'));
  }
  // ---- 单个文档 ----
  const match = path.match(/^\/api\/documents\/(.+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (method === 'PUT') {
      const oldRev = body.rev || 0, rev = oldRev + 1;
      const updated = unwrap(await cloud.database.from('shared_documents').update({...DOC_FIELDS(body), rev}).eq('id',id).eq('rev',oldRev).select());
      if (updated && updated.length) return {rev};
      const exists = unwrap(await cloud.database.from('shared_documents').select('id').eq('id',id).maybeSingle());
      if (exists) throw httpError(409,'文档已被他人修改');
      unwrap(await cloud.database.from('shared_documents').insert({id, ...DOC_FIELDS(body), member_id:body.member_id||null, rev}).select());
      return {rev};
    }
    const row = unwrap(await cloud.database.from('shared_documents').select('*').eq('id',id).maybeSingle());
    if (!row) throw httpError(404,'文档不存在');
    return row;
  }
  throw httpError(404,'接口不存在');
}
function applySettings() {
  $('workspaceName').value=settings.workspace; $('folderName').value=settings.folder;
  $('crumbWorkspace').textContent=settings.workspace; $('crumbFolder').textContent=settings.folder;
}
async function readSettings() {
  if(shared) return api('/api/settings');
  return new Promise((resolve,reject) => { const req=db.transaction('settings').objectStore('settings').get('workspace'); req.onsuccess=()=>resolve(req.result || settings); req.onerror=()=>reject(req.error); });
}
let settingsQueue=Promise.resolve(), settingsTimer, settingsEditVersion=0, settingsSavedVersion=0;
function saveSettings() {
  if(!canEdit()) return;
  clearTimeout(settingsTimer);
  const editVersion=settingsEditVersion;
  const values={workspace:$('workspaceName').value.trim() || '我的日结',folder:$('folderName').value.trim() || '日常记录'};
  settingsQueue=settingsQueue.catch(()=>{}).then(async()=>{
    if(shared) settings=await api('/api/settings',{method:'PUT',body:JSON.stringify({...values,rev:settings.rev})});
    else { settings={...values,rev:settings.rev+1}; await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite'); tx.objectStore('settings').put(settings,'workspace'); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);}); }
    settingsSavedVersion=editVersion; if(editVersion===settingsEditVersion) applySettings();
  }).catch(async e=>{toast(e.message); if(e.status===409){settings=await readSettings();applySettings();}});
}
['workspaceName','folderName'].forEach(id=>{
  $(id).addEventListener('input',()=>{settingsEditVersion++;clearTimeout(settingsTimer);settingsTimer=setTimeout(saveSettings,350);});
  $(id).addEventListener('blur',()=>{if(settingsEditVersion!==settingsSavedVersion)saveSettings();});
  $(id).addEventListener('keydown',e=>{if(e.key==='Enter'){saveSettings();e.target.blur();}});
});
$('saveCopy').onclick = async () => {
  if(!requireEdit()) return;
  const doc={id:newId(),title:$('docTitle').value+'（我的副本）',html:editor.innerHTML,date:today(),created:Date.now(),updated:Date.now()};
  try { await saveQueue.catch(()=>{}); await writeDoc(doc); docs.push(doc); conflict=false; savedRevision=revision; saveQueue=Promise.resolve(); current=null; $('conflictBar').hidden=true; await openDoc(doc); toast('你的内容已保存为独立副本'); } catch(e) { toast(e.message); }
};
$('loadLatest').onclick = async () => {
  if(!confirm('读取最新版本将替换当前未保存内容。可先另存为副本。继续？')) return;
  try { const latest=await api('/api/documents/'+current.id); await saveQueue.catch(()=>{}); versions.set(latest.id,latest.rev); docs=docs.map(d=>d.id===latest.id?latest:d); current=null; conflict=false; savedRevision=revision; saveQueue=Promise.resolve(); $('conflictBar').hidden=true; await openDoc(latest); } catch(e){toast(e.message);}
};
async function sync() {
  if(!shared || document.hidden) return;
  try {
    // Metadata endpoint excludes document/image payloads; fetch full text only on revision change.
    const remote=await api('/api/documents?summary=1');
    if(savedRevision!==revision || conflict) return;
    const active=remote.find(d=>d.id===current?.id);
    if(active && active.rev!==versions.get(active.id)) {
      const latest=await api('/api/documents/'+active.id);
      if(savedRevision!==revision || conflict || current?.id!==latest.id) return;
      versions.set(latest.id,latest.rev); current=latest;
      $('docTitle').value=latest.title; editor.innerHTML=cleanHTML(latest.html || '<p><br></p>'); latest.html=editor.innerHTML; window.Collaboration?.refreshHighlights();
      $('crumbTitle').textContent=latest.title; $('modified').textContent='已同步其他人的修改'; renderOutline();window.Collaboration?.documentChanged();
    }
    for(const item of remote) {
      const i=docs.findIndex(d=>d.id===item.id);
      if(i<0 || versions.get(item.id)!==item.rev) { const full=await api('/api/documents/'+item.id); if(savedRevision!==revision || conflict) return; versions.set(item.id,full.rev); if(i<0) docs.push(full); else docs[i]=full; }
      else if(current?.id===item.id) docs[i]=current;
    }
    renderList();
    if(settingsEditVersion===settingsSavedVersion && !['workspaceName','folderName'].includes(document.activeElement.id)) { await settingsQueue; settings=await readSettings(); applySettings(); }
  } catch(e) { $('saveStatus').textContent='连接中断，修改保留在当前页面'; }
}
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.Collaboration.init();
    if(!shared) db=await database();
    settings=await readSettings(); applySettings(); docs=await readAll(); docs.forEach(d=>versions.set(d.id,d.rev || 0));
    $('spaceMode').textContent=shared ? '共享空间' : '本地空间';
    $('storageHint').textContent=shared ? '共享空间 · 登录成员可编辑' : '本地预览 · 共享请打开云端链接';
    document.execCommand('defaultParagraphSeparator',false,'p');
    if(docs.length) await openDoc(docs.sort((a,b)=>b.updated-a.updated)[0]); else { $('saveStatus').textContent='空间中还没有文档'; editor.innerHTML='<p>登录后点击左侧 ＋ 新建成员文档。</p>'; }
    if(shared) { let syncing=false; setInterval(async()=>{if(syncing)return; syncing=true; try{await sync();}finally{syncing=false;}},2500); }
  } catch(e) { $('saveStatus').textContent='无法连接文档存储'; toast('无法连接共享空间：'+e.message); }
});
