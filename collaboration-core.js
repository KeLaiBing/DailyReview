'use strict';
(function(root) {
  function anchor(text, start, end) {
    return {quote:text.slice(start,end), start_offset:start, end_offset:end,
      prefix:text.slice(Math.max(0,start-40),start), suffix:text.slice(end,end+40)};
  }
  // Never silently attach an ambiguous comment to the wrong repeated phrase.
  function locate(text, item) {
    if(!item.quote) return null;
    const hits=[]; let from=0, at;
    while((at=text.indexOf(item.quote,from))!==-1) {
      const end=at+item.quote.length;
      const left=text.slice(Math.max(0,at-(item.prefix||'').length),at);
      const right=text.slice(end,end+(item.suffix||'').length);
      let score=0;
      if(item.prefix && left===item.prefix) score+=2;
      if(item.suffix && right===item.suffix) score+=2;
      hits.push({start:at,end,score}); from=at+1;
    }
    if(hits.length===1) return hits[0];
    hits.sort((a,b)=>b.score-a.score);
    if(hits.length>1 && hits[0].score>hits[1].score) return hits[0];
    return null;
  }
  // 构造模板插入片段：当天大标题由显式 DOM 节点生成，不经过 execCommand 的块级合并，
  // 避免标题被吞掉；模板里保存过的旧日期大标题一律移除，防止旧日期残留。
  function buildTemplateInsertion(document, cleanedHtml, title) {
    const container=document.createElement('div'); container.innerHTML=cleanedHtml;
    [...container.querySelectorAll('h1')].forEach(h=>{
      if(dateOf(h.textContent))h.remove();
      else {const sub=document.createElement('h2');sub.append(...h.childNodes);h.replaceWith(sub);}
    });
    const fragment=document.createDocumentFragment();
    const heading=document.createElement('h1');heading.textContent=title;fragment.append(heading);
    while(container.firstChild)fragment.append(container.firstChild);
    const tail=document.createElement('p');tail.append(document.createElement('br'));fragment.append(tail);
    return fragment;
  }
  function dateOf(label){
    const match=String(label).match(/(?:^|[^\d])(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})(?:日|$|[^\d])/);
    if(!match)return null;const [y,m,d]=match.slice(1).map(Number),check=new Date(Date.UTC(y,m-1,d));
    return check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
  }
  const api={anchor,locate,dateOf,dateTitle:date=>'日期：'+date.replaceAll('-','.'),buildTemplateInsertion};
  if(typeof module!=='undefined') module.exports=api;
  else root.JournalCore=api;
})(globalThis);
