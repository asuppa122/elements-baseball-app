EDITOR = r'''
<style>
#ed{position:fixed;right:10px;bottom:10px;width:262px;z-index:300;background:#111214;border:1px solid var(--line);
border-radius:11px;padding:11px;font:11px/1.4 Inter,system-ui,sans-serif;color:var(--cream);box-shadow:0 12px 44px rgba(0,0,0,.8)}
#ed h5{margin:0 0 3px;font-size:9.5px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--bright)}
#ed .tip{color:var(--mut);font-size:9.5px;line-height:1.45;margin-bottom:8px}
#ed .r{display:flex;align-items:center;gap:8px;margin-bottom:5px}
#ed .r label{flex:0 0 92px;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}
#ed .r input{flex:1;accent-color:var(--gold);min-width:0}
#ed .r b{flex:0 0 34px;text-align:right;font-size:10px;font-variant-numeric:tabular-nums}
#ed .fit{margin:7px 0;padding:6px 8px;border-radius:6px;font-size:10px;font-weight:800;text-align:center}
#ed .fit.ok{background:rgba(127,206,140,.14);color:var(--good);border:1px solid rgba(127,206,140,.4)}
#ed .fit.bad{background:rgba(226,114,107,.16);color:var(--bad);border:1px solid rgba(226,114,107,.5)}
#ed pre{margin:0 0 8px;max-height:150px;overflow:auto;background:#08090a;border:1px solid var(--soft-line);
border-radius:7px;padding:7px;font:10px/1.5 ui-monospace,Menlo,monospace;color:var(--gray);white-space:pre}
#ed .btns{display:flex;gap:6px}
#ed button{flex:1;border:1px solid var(--soft-line);background:transparent;color:var(--gray);border-radius:6px;
font:inherit;font-size:10px;font-weight:800;padding:7px 4px;cursor:pointer}
#ed button.go{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.fc{cursor:grab;touch-action:none}
.fc.drag{cursor:grabbing;z-index:40}
.fc.sel img{outline:2px solid var(--bright);outline-offset:3px}
.grab{position:fixed;top:0;width:11px;z-index:290;cursor:col-resize;background:transparent}
.grab::after{content:"";position:absolute;left:4px;top:0;bottom:0;width:3px;border-radius:2px;background:rgba(216,173,45,.34)}
.grab:hover::after,.grab.on::after{background:var(--bright);box-shadow:0 0 10px rgba(241,202,69,.7)}
body.dragging{user-select:none;cursor:col-resize}
</style>
<div class="grab" id="g1"></div>
<div class="grab" id="g2"></div>
<div id="ed">
  <h5>Layout editor</h5>
  <div class="tip">Drag the gold bars for column widths, sliders for contents, and drag any fielder on the grass. Click a fielder then arrow-key to nudge (Shift = 5&times;).</div>
  <div class="r"><label>Left rail</label><input id="s_lrail" type="range" min="240" max="620" step="2"><b id="v_lrail"></b></div>
  <div class="r"><label>Right rail</label><input id="s_rrail" type="range" min="140" max="460" step="2"><b id="v_rrail"></b></div>
  <div class="r"><label>Header</label><input id="s_header" type="range" min="36" max="130" step="2"><b id="v_header"></b></div>
  <div class="r"><label>Matchup</label><input id="s_card" type="range" min="90" max="300" step="2"><b id="v_card"></b></div>
  <div class="r"><label>Meta tiles</label><input id="s_meta" type="range" min="0" max="220" step="2"><b id="v_meta"></b></div>
  <div class="r"><label>Roll row</label><input id="s_roll" type="range" min="34" max="110" step="2"><b id="v_roll"></b></div>
  <div class="r"><label>Lineup</label><input id="s_line" type="range" min="18" max="90" step="1"><b id="v_line"></b></div>
  <div class="r"><label>Decisions</label><input id="s_calls" type="range" min="44" max="220" step="2"><b id="v_calls"></b></div>
  <div class="r"><label>Fielders</label><input id="s_field" type="range" min="3" max="16" step="0.2"><b id="v_field"></b></div>
  <div class="fit" id="fit"></div>
  <pre id="out"></pre>
  <pre id="pos"></pre>
  <div class="btns"><button class="go" id="copy">Copy</button><button id="reset">Reset</button></div>
</div>
<script>
(function(){
  var KEY='elements-desktop-layout-v1';
  var D={lrail:580,rrail:290,header:90,card:210,meta:160,roll:60,line:50,calls:46,field:10.0};
  var S=Object.assign({},D);
  try{var raw=localStorage.getItem(KEY); if(raw) S=Object.assign(S,JSON.parse(raw));}catch(e){}
  var q=function(s){return document.querySelector(s)};
  var qa=function(s){return [].slice.call(document.querySelectorAll(s))};
  var AR=1150/820; // card height / width

  var dirty={};
  function apply(){
    if(window.innerWidth<=1024){  // phone rules own the layout; clear anything the editor set
      ['.lrail','.rrail','.top','.roll','.calls'].forEach(function(sel){var el=q(sel);if(el)el.removeAttribute('style');});
      qa('.man img, .meta, .oc img, .fc img').forEach(function(el){el.removeAttribute('style');});
      requestAnimationFrame(report); return;
    }
    if(dirty.lrail) q('.lrail').style.flex='0 0 '+S.lrail+'px';
    if(dirty.rrail) q('.rrail').style.flex='0 0 '+S.rrail+'px';
    if(dirty.header) q('.top').style.height=S.header+'px';
    if(dirty.card) qa('.man img').forEach(function(im){im.style.width=S.card+'px';im.style.height=Math.round(S.card*AR)+'px';});
    if(dirty.meta) qa('.meta').forEach(function(m){m.style.flex='0 0 '+S.meta+'px';m.style.display=S.meta<20?'none':'flex';});
    if(dirty.roll){q('.roll').style.height=S.roll+'px';q('.readout').style.minHeight=S.roll+'px';}
    if(dirty.line) qa('.oc img').forEach(function(im){
      var w=im.parentNode.classList.contains('hero')?Math.round(S.line*1.22):S.line;
      im.style.width=w+'px';im.style.height=Math.round(w*AR)+'px';});
    if(dirty.calls) q('.calls').style.minHeight=S.calls+'px';
    if(dirty.field) qa('.fc img').forEach(function(im){im.style.width=S.field+'cqw';im.style.height=(S.field*AR).toFixed(2)+'cqw';});
    ['lrail','rrail','header','card','meta','roll','line','calls','field'].forEach(function(k){
      var el=q('#s_'+k); if(el&&el.value!=S[k]) el.value=S[k];
      var b=q('#v_'+k); if(b) b.textContent=(k==='field'?S[k].toFixed(1):S[k]);
    });
    try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}
    requestAnimationFrame(report);
  }
  function report(){
    var lr=q('.lrail'), f=q('.field');
    var over=lr.scrollHeight-lr.clientHeight;
    var fit=q('#fit');
    fit.className='fit '+(over<=1?'ok':'bad');
    fit.textContent=over<=1?('Left rail fits · '+lr.scrollHeight+'/'+lr.clientHeight):('Left rail overflows by '+over+'px');
    var fr=f.getBoundingClientRect();
    var pl=[];
    qa('.fc').forEach(function(el){
      var b=el.closest('.finner').getBoundingClientRect(), r=el.getBoundingClientRect();
      pl.push((el.dataset.pos+'   ').slice(0,3)+' '+
        (((r.left+r.width/2)-b.left)/b.width*100).toFixed(1).padStart(5)+'  '+
        (((r.top+r.height/2)-b.top)/b.height*100).toFixed(1).padStart(5));
    });
    q('#pos').textContent='DESKTOP fielders (left / top %)\nmobile keeps its own set\n'+pl.join('\n');
    q('#out').textContent=
      'left rail   '+S.lrail+'\n'+
      'right rail  '+S.rrail+'\n'+
      'header      '+S.header+'\n'+
      'matchup     '+S.card+' x '+Math.round(S.card*AR)+'\n'+
      'meta tiles  '+S.meta+'\n'+
      'roll row    '+S.roll+'\n'+
      'lineup      '+S.line+' x '+Math.round(S.line*AR)+'\n'+
      'decisions   '+S.calls+'\n'+
      'fielders    '+S.field.toFixed(1)+'cqw\n'+
      '\nfield       '+Math.round(fr.width)+' x '+Math.round(fr.height)+
      '\nviewport    '+window.innerWidth+' x '+window.innerHeight;
    place();
  }
  function place(){
    var lr=q('.lrail').getBoundingClientRect(), rr=q('.rrail').getBoundingClientRect();
    var g1=q('#g1'), g2=q('#g2');
    g1.style.left=(lr.right-1)+'px'; g1.style.height=lr.height+'px'; g1.style.top=lr.top+'px';
    g2.style.left=(rr.left-9)+'px';  g2.style.height=rr.height+'px'; g2.style.top=rr.top+'px';
  }
  ['lrail','rrail','header','card','meta','roll','line','calls','field'].forEach(function(k){
    var el=q('#s_'+k); if(!el) return;
    el.addEventListener('input',function(){S[k]=k==='field'?parseFloat(el.value):parseInt(el.value,10);apply();});
  });
  function drag(id,key,sign){
    var g=q(id);
    g.addEventListener('pointerdown',function(e){
      e.preventDefault(); g.classList.add('on'); document.body.classList.add('dragging');
      g.setPointerCapture(e.pointerId);
      var x0=e.clientX, v0=S[key];
      function mv(ev){ dirty[key]=true; S[key]=Math.max(140,Math.min(640, v0+sign*(ev.clientX-x0))); apply(); }
      function up(){ g.classList.remove('on'); document.body.classList.remove('dragging');
        g.removeEventListener('pointermove',mv); g.removeEventListener('pointerup',up); }
      g.addEventListener('pointermove',mv); g.addEventListener('pointerup',up);
    });
  }
  drag('#g1','lrail',1); drag('#g2','rrail',-1);
  function readLive(){
    if(window.innerWidth<=1024) return;
    var R=Math.round, gb=function(sel){var e=q(sel);return e?e.getBoundingClientRect():null};
    if(!dirty.lrail) S.lrail=R(gb('.lrail').width);
    if(!dirty.rrail) S.rrail=R(gb('.rrail').width);
    if(!dirty.header) S.header=R(gb('.top').height);
    if(!dirty.card) S.card=R(gb('.man img').width);
    if(!dirty.meta) S.meta=R(gb('.meta').width);
    if(!dirty.roll) S.roll=R(gb('.roll').height);
    if(!dirty.line) S.line=R(gb('.oc img').width);
    if(!dirty.calls) S.calls=R(gb('.calls').height);
  }
  window.addEventListener('resize',function(){readLive();apply();});
  readLive();
  // drag a fielder anywhere on the grass; arrows nudge the selected one
  var sel=null;
  function pctOf(el){var b=el.closest('.finner').getBoundingClientRect(),r=el.getBoundingClientRect();
    return [((r.left+r.width/2)-b.left)/b.width*100,((r.top+r.height/2)-b.top)/b.height*100];}
  function put(el,l,t){
    el.style.setProperty('--dx',Math.max(0,Math.min(100,l)).toFixed(2)+'%');
    el.style.setProperty('--dy',Math.max(0,Math.min(100,t)).toFixed(2)+'%');
    savePos();requestAnimationFrame(report);}
  function savePos(){var m={};qa('.fc').forEach(function(el){
      m[el.dataset.pos]=[el.style.getPropertyValue('--dx'),el.style.getPropertyValue('--dy')];});
    try{localStorage.setItem('elements-desktop-fielders-v1',JSON.stringify(m));}catch(e){}}
  try{var fp=localStorage.getItem('elements-desktop-fielders-v1');
    if(fp){var m=JSON.parse(fp);qa('.fc').forEach(function(el){if(m[el.dataset.pos]){
      el.style.setProperty('--dx',m[el.dataset.pos][0]);el.style.setProperty('--dy',m[el.dataset.pos][1]);}});}}catch(e){}
  var dg=null;
  document.addEventListener('pointerdown',function(e){
    if(window.innerWidth<=1024) return;   // mobile editor owns --mx/--my
    var el=e.target.closest('.fc'); if(!el) return;
    e.preventDefault(); qa('.fc').forEach(function(n){n.classList.remove('sel')}); el.classList.add('sel'); sel=el;
    el.classList.add('drag'); el.setPointerCapture(e.pointerId);
    var b=el.closest('.finner').getBoundingClientRect(), r=el.getBoundingClientRect();
    dg={el:el,box:b,dx:e.clientX-(r.left+r.width/2),dy:e.clientY-(r.top+r.height/2)};
  });
  document.addEventListener('pointermove',function(e){ if(!dg) return;
    put(dg.el,(e.clientX-dg.dx-dg.box.left)/dg.box.width*100,(e.clientY-dg.dy-dg.box.top)/dg.box.height*100); });
  document.addEventListener('pointerup',function(){ if(dg){dg.el.classList.remove('drag');dg=null;} });
  document.addEventListener('keydown',function(e){
    if(window.innerWidth<=1024) return;
    if(!sel||e.key.indexOf('Arrow')!==0||document.activeElement.tagName==='INPUT') return;
    e.preventDefault(); var st=e.shiftKey?2.5:0.5, p=pctOf(sel);
    put(sel,p[0]+(e.key=='ArrowRight'?st:e.key=='ArrowLeft'?-st:0),p[1]+(e.key=='ArrowDown'?st:e.key=='ArrowUp'?-st:0)); });

  q('#copy').onclick=function(){var b=q('#copy');
    try{navigator.clipboard.writeText(q('#out').textContent+'\n\n'+q('#pos').textContent);b.textContent='Copied';}
    catch(e){b.textContent='Select + ⌘C';}
    setTimeout(function(){b.textContent='Copy';},1200);};
  q('#reset').onclick=function(){S=Object.assign({},D);dirty={};
    try{localStorage.removeItem('elements-desktop-fielders-v1');}catch(e){}
    location.reload();};
  window.addEventListener('resize',function(){requestAnimationFrame(report);});
  apply();
})();
</script>'''
