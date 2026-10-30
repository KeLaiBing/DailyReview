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
  const api={anchor,locate,dateTitle:date=>'日期：'+date.replaceAll('-','.')};
  if(typeof module!=='undefined') module.exports=api;
  else root.JournalCore=api;
})(globalThis);
