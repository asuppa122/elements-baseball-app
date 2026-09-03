import io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from editor import EDITOR
R='https://pub-67aab109454d41809ce03ab0c1c9567d.r2.dev/card-images/'
IMG={1:'1925/SLS-John-Barnes.png',2:'1925/WMP-Toussaint-Allen.png',3:'1925/CSW-Felipe-Sierra.png',
     4:'1925/HBG-John-Shackelford.png',5:'2006/CIN-Rich-Aurilia.png',6:'1975/SFG-Gary-Thomasson.png',
     7:'1993/SEA-Ken-Griffey-Jr.png',8:'1925/DS-Harry-Kenyon.png',9:'1925/HIL-Phil-Cockrell.png'}
ST={3:('out','Out'),4:('onbase','On 1st'),5:('hero','At bat'),6:(None,'On deck'),7:(None,'In the hole')}
FIELDERS=[('LF','1925/TOT-Earl-Gurley.png',26.5,14.5),('CF','1925/CSW-Valentin-Dreke.png',50.5,11.0),
          ('RF','1925/HIL-Otto-Briggs.png',73.5,15.0),('SS','1925/CAG-Bobby-Williams.png',38.5,33.0),
          ('2B','1925/DS-Harry-Kenyon.png',61.5,33.0),('3B','2025/TBR-Tristan-Gray.png',25.5,40.5),
          ('1B','1925/HBG-Ben-Taylor.png',74.5,40.5),('C','1925/CAG-John-Hines.png',50.5,87.8)]
PEN=[('Charles Heywood','1925/NLG-Charles-Heywood.png','Ctrl 0 &middot; IP 4.33'),
     ('Rube Chambers','1925/TOT-Rube-Chambers.png','Ctrl 3 &middot; IP 5.67'),
     ('Omer Newsome','1925/TOT-Omer-Newsome.png','Ctrl 3 &middot; IP 4.0'),
     ('Lawrence Terrell','1925/DS-Lawrence-Terrell.png','Ctrl 3 &middot; IP 3.67'),
     ('Slim Branham','1925/DS-Slim-Branham.png','Ctrl 2 &middot; IP 3.67'),
     ('Dinelson Lamet','2024/LAD-Dinelson-Lamet.png','Ctrl 5 &middot; IP 1.33')]
# real bench from the frozen Lineup 2 snapshot (BN1 / BN2)
BENCH=[('Ed Pryor','1925/NLG-Ed-Pryor.png','OB 7 &middot; BsR 13 &middot; 2B +1'),
       ('Luther Farrell','1925/AC-Luther-Farrell.png','OB 10 &middot; BsR 13 &middot; Ctrl 5')]

CSS = """<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap">
<style>
:root{--ink:#070809;--soft:#0b0c0e;--panel:#111214;--gold:#d8ad2d;--bright:#f1ca45;--cream:#f5f1e6;
--gray:#aeafb2;--mut:#777a80;--line:rgba(216,173,45,.34);--soft-line:rgba(216,173,45,.2);
--good:#7fce8c;--pitch:#e08a5c;--bad:#e2726b}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--ink);color:var(--cream);font-family:Inter,system-ui,sans-serif;overflow:hidden}
.screen{position:relative;width:100vw;height:100dvh;padding:8px;display:flex;flex-direction:column;gap:8px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:11px;min-width:0;min-height:0}
  .top .recap .lbl{flex-shrink:0;font-size:10px}
.lbl{font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--bright)}
.num{font-variant-numeric:tabular-nums}

  .top{flex-shrink:0;height:clamp(56px,8vh,90px);display:flex;align-items:center;justify-content:space-between;
gap:26px;padding:0 26px;min-height:0}
.seg{display:flex;align-items:center;min-width:0}
.vr{flex:0 0 1px;align-self:stretch;margin:16px 0;background:var(--soft-line)}
.score{flex:0 0 auto;gap:30px}
.situ{flex:0 0 auto;gap:18px}
.recap{flex:1 1 auto;gap:18px}
.who{flex:0 0 auto;gap:12px;align-items:baseline}
.who h4{margin:0;font-size:clamp(13px,1.7vh,19px);font-weight:900;color:var(--cream);white-space:nowrap}

.team{display:flex;align-items:baseline;gap:11px}
.team span{font-size:clamp(11px,1.4vh,15px);font-weight:800;color:var(--gray);letter-spacing:.01em}
.team b{font-size:clamp(20px,2.6vh,31px);font-weight:900;line-height:1}
.team.up span,.team.up b{color:var(--bright)}
.top .inn{font-size:16px;font-weight:900}
.dia{position:relative;width:27px;height:27px}
.dia i{position:absolute;width:9.5px;height:9.5px;border:1px solid #6f5b1e;transform:rotate(45deg)}
.dia .b2{top:0;left:8.75px}.dia .b3{top:8.75px;left:0}.dia .b1{top:8.75px;right:0}
.dia i.on{background:var(--bright);border-color:var(--bright)}
.outs{display:flex;gap:5px}
.outs i{width:9px;height:9px;border-radius:50%;border:1px solid #6f5b1e}
.outs i.on{background:var(--bright);border-color:var(--bright)}
.recap{flex:1 1 auto;min-width:0;display:flex;align-items:baseline;gap:12px}
.recap h4{margin:0;font-size:clamp(13px,1.7vh,19px);font-weight:900;color:var(--good);white-space:nowrap;flex-shrink:0}
.recap p{margin:0;font-size:13px;color:var(--gray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto}
.menu{flex:0 0 48px;height:44px;font-size:19px;border:1px solid var(--soft-line);border-radius:8px;background:transparent;
color:var(--gray);font-size:16px;cursor:pointer}

.main{flex:1;min-height:0;display:flex;gap:8px}

/* ---- LEFT RAIL: the matchup, the order, the calls ---- */
.lrail{container-type:inline-size;flex:0 1 clamp(300px,30vw,580px);display:flex;flex-direction:column;gap:7px;min-height:0}
.man{flex:0 1 auto;display:flex;align-items:center;justify-content:center;gap:9px;padding:7px;min-width:0;
border:1px solid var(--line);border-radius:11px;background:linear-gradient(180deg,#16171a,#111214)}
.man.adv{border-color:var(--bright);box-shadow:0 0 0 1px var(--bright),0 0 22px rgba(241,202,69,.26)}
.man img{height:clamp(150px,27vh,295px);width:auto;max-width:min(58cqw,295px);object-position:top;aspect-ratio:820/1150;object-fit:cover;border-radius:6px;box-shadow:0 4px 18px rgba(7,8,9,.9);display:block;flex:0 0 auto}
.meta{flex:0 1 min(clamp(88px,11vw,160px),36cqw);min-width:0;display:flex;flex-direction:column;gap:6px}
.meta div{display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 4px;
border:1px solid var(--soft-line);border-radius:7px;background:#08090a;min-height:56px;justify-content:center}
.meta i{font-style:normal;font-size:7.5px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:var(--mut)}
.meta u{text-decoration:none;font-size:16px;font-weight:900;line-height:1;color:var(--cream);font-variant-numeric:tabular-nums}
.meta s{text-decoration:none;font-size:7px;font-weight:700;color:var(--mut);margin-top:3px;text-align:center}
.rollrow{flex:0 0 auto;display:flex;gap:8px;align-items:stretch}
.roll{flex:0 0 clamp(96px,10vw,132px);height:clamp(44px,6vh,60px);border:none;border-radius:9px;background:var(--gold);color:var(--ink);
font:inherit;font-size:13px;font-weight:900;letter-spacing:.09em;cursor:pointer}
.readout{flex:1 1 auto;display:flex;align-items:center;justify-content:space-around;gap:6px;
border:1px solid var(--soft-line);border-radius:9px;background:#08090a;padding:4px 8px}
.readout div{text-align:center}
.readout i{font-style:normal;display:block;font-size:7px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.readout u{text-decoration:none;font-size:16px;font-weight:900;color:var(--mut);font-variant-numeric:tabular-nums}
.readout .sep{width:1px;align-self:stretch;background:var(--soft-line)}
.order{flex:0 0 auto;display:flex;align-items:flex-end;justify-content:space-between;gap:4px;padding:8px 8px}
.oc{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px}
  .oc img{width:min(clamp(24px,4.4vh,50px),9.1cqw);height:auto;aspect-ratio:820/1150;object-fit:cover;border-radius:3px;border:1px solid var(--soft-line);display:block}
  .oc.hero img{width:min(clamp(29px,5.4vh,61px),11cqw);height:auto;border-color:var(--bright)}
.oc b{position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:3px;background:rgba(7,8,9,.9);
border:1px solid var(--soft-line);color:var(--gray);font-size:7px;font-weight:900;line-height:9px;text-align:center}
.oc em{font-style:normal;min-height:8px;font-size:6px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);white-space:nowrap}
.oc.hero em{color:var(--bright)}
.oc.onbase img{outline:2px solid var(--bright);outline-offset:2px}
.oc.onbase em{color:var(--bright)}
/* ---- half-inning transition ---- */
.halfx{position:absolute;inset:0;z-index:200;background:rgba(4,5,6,.9);display:flex;
align-items:center;justify-content:center;padding:24px}
.hcard{width:min(520px,92%);background:var(--panel);border:1px solid var(--line);border-radius:14px;
padding:22px 24px;display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center}
.hlbl{font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.hscore{display:flex;align-items:baseline;gap:14px}
.hscore span{display:flex;flex-direction:column;gap:2px}
.hscore i{font-style:normal;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.hscore u{text-decoration:none;font-size:34px;font-weight:900;line-height:1;color:var(--gray);
font-variant-numeric:tabular-nums}
.hscore .lead u{color:var(--bright)}
.hscore em{font-style:normal;color:var(--mut);font-size:18px}
.hplay{margin:0;font-size:12px;color:var(--cream)}
.hswap{display:flex;align-items:center;gap:16px;width:100%;padding:12px 0;
border-top:1px solid var(--soft-line);border-bottom:1px solid var(--soft-line)}
.hs{flex:1;display:flex;flex-direction:column;gap:3px}
.hs i{font-style:normal;font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.hs b{font-size:14px;font-weight:800;color:var(--cream)}
.hs s{text-decoration:none;font-size:9.5px;color:var(--mut)}
.harrow{font-size:20px;color:var(--gold);flex-shrink:0}
.hgo{border:0;background:var(--bright);color:var(--ink);border-radius:99px;font:inherit;font-size:12px;
font-weight:900;letter-spacing:.06em;text-transform:uppercase;padding:0 30px;min-height:44px;cursor:pointer}
/* ---- post-game recap ---- */
.screen.postgame{overflow:auto}
.rmain{flex:1 1 auto;display:flex;flex-direction:column;gap:8px;padding:8px;min-height:0}
.rbox{display:flex;flex-direction:column;gap:9px;padding:13px 15px}
.rsplit{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:stretch}
.rsplit>.rbox{min-width:0}
.rboxes{flex:1 1 auto;min-height:0}
.tscroll{overflow-x:auto;min-width:0}
.line,.box{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.line{min-width:520px}
.line th,.box th{text-align:left;font-weight:800;color:var(--cream);padding:5px 8px;white-space:nowrap}
.line th{font-size:13px;width:110px}
.line td{text-align:center;font-size:17px;color:var(--gray);padding:5px 8px;font-weight:700}
.line thead td{font-size:9.5px;font-weight:900;letter-spacing:.1em;color:var(--mut);padding-bottom:2px}
.line .tot{color:var(--cream);font-weight:900}
.line tr.lead th,.line tr.lead .tot{color:var(--bright)}
.box{min-width:430px}
.box th{font-size:10px}
.box td{text-align:center;font-size:12px;color:var(--gray);padding:4px 7px}
.box thead td{font-size:8.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.box .nm{text-align:left;font-size:12px;color:var(--cream);white-space:nowrap}
.box .ord{color:var(--mut);font-size:10px;width:16px}
.box .seq{text-align:left;font-size:9.5px;color:var(--mut);letter-spacing:.05em;white-space:nowrap}
.box tbody tr:nth-child(even){background:rgba(255,255,255,.022)}
.box tfoot td{border-top:1px solid var(--soft-line);color:var(--cream);font-weight:900;padding-top:6px}
.plays{display:flex;flex-direction:column;gap:7px}
.pl{display:flex;align-items:center;gap:10px;font-size:12px}
.pl i{font-style:normal;flex:0 0 30px;font-size:9px;font-weight:900;letter-spacing:.06em;
color:var(--ink);background:var(--gold);border-radius:4px;text-align:center;padding:3px 0}
.pl span{flex:1;color:var(--cream);display:flex;flex-direction:column;gap:2px;min-width:0}
.pl s{text-decoration:none;font-size:9.5px;color:var(--mut)}
.pl u{text-decoration:none;color:var(--bright);font-weight:800;font-size:11px;
font-variant-numeric:tabular-nums;white-space:nowrap}
/* play-by-play: collapsed by default, same drawer interaction as the live board */
.dr-plays{flex:0 0 auto}
.dr-plays .drb{display:none}
.dr-plays.open .drb{display:block}
.pbwrap{max-height:230px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding:2px 2px 0}
.pbhalf{margin-top:7px;font-size:8.5px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;
color:var(--gold);border-bottom:1px solid var(--soft-line);padding-bottom:3px}
.pbhalf:first-child{margin-top:0}
.pb{font-size:11px;color:var(--gray);padding:2px 0}
/* ---- recap on a phone: same content, stacked, each wide table scrolls in place ---- */
@media (max-width:1024px){
  /* the live board is a fixed stage; a recap is a document and must scroll.
     body{overflow:hidden} exists for the board and has to be lifted here too. */
  html:has(.swpost),body:has(.swpost){height:auto;overflow:visible}
  .stagewrap.swpost{position:static;inset:auto;height:auto;min-height:100%;
  overflow:visible;container-type:normal}
  .screen.postgame{height:auto;min-height:100%;overflow:visible}
  .postgame .top{flex-wrap:wrap;height:auto;gap:6px 10px;padding:9px 11px}
  .postgame .top .vr{display:none}
  .postgame .seg.score{flex:1 1 100%;justify-content:space-between}
  .postgame .seg.situ{flex:0 0 auto}
  .postgame .seg.recap{flex:1 1 100%}
  .postgame .seg.recap p{white-space:normal}
  .postgame .menu{position:absolute;top:9px;right:11px}
  .rmain{padding:7px;gap:7px}
  .rsplit{grid-template-columns:1fr}
  .rbox{padding:11px 12px;gap:8px}
  .line{min-width:470px}
  .line th{width:88px;font-size:12px}
  .line td{font-size:15px;padding:4px 6px}
  .box{min-width:380px}
  .pl{font-size:11.5px}
  .pbwrap{max-height:none}
  .dr-plays .drh{min-height:44px}
}
.zoom[hidden]{display:none}
.zoom{position:fixed;inset:0;z-index:300;background:rgba(4,5,6,.86);display:flex;
align-items:center;justify-content:center;padding:22px}
.zin{display:flex;flex-direction:column;align-items:center;gap:12px;max-height:100%}
.zin img{width:auto;height:auto;max-width:min(78vw,340px);max-height:70vh;border-radius:8px;
border:1px solid var(--line);display:block}
.zacts:empty{display:none}
.zsteal{border:0;background:var(--bright);color:var(--ink);border-radius:99px;
font:inherit;font-size:13px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;
padding:0 22px;min-height:44px;min-width:44px;cursor:pointer}
.zclose{border:1px solid var(--line);background:transparent;color:var(--gray);border-radius:99px;
font:inherit;font-size:11px;font-weight:800;padding:0 18px;min-height:44px;cursor:pointer}
/* the base tag IS the steal control; the card body stays free for tap-to-enlarge */
.oc .basetag{font:inherit;font-size:6px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;
white-space:nowrap;color:var(--ink);background:var(--bright);border:0;border-radius:99px;
padding:2px 5px;cursor:pointer}
.oc .basetag:hover,.oc .basetag:focus-visible{background:var(--cream);outline:none}
.oc.out img{outline:2px solid var(--bad);outline-offset:2px}
.oc.out em{color:var(--bad)}
.oc:not(.onbase):not(.out):not(.hero) em{visibility:hidden}
.calls{flex:1 1 auto;display:flex;flex-direction:column;gap:8px;padding:10px 11px;min-height:clamp(40px,5vh,46px)}
.acts{display:flex;flex-wrap:wrap;gap:6px}
.acts button{border:1px solid var(--line);background:transparent;color:var(--cream);border-radius:99px;
font:inherit;font-size:11px;font-weight:800;padding:8px 14px;min-height:38px;cursor:pointer}

/* only the actions legal for THIS state render at all; the rest are not in the layout */
.acts button{display:none}
.calls[data-show~="bunt"]   [data-a="bunt"],
.calls[data-show~="squeeze"] [data-a="squeeze"],
.calls[data-show~="ibb"]   [data-a="ibb"],
.calls[data-show~="infin"] [data-a="infin"]{display:inline-flex;align-items:center}
.rest-note{display:none;margin:0;font-size:9.5px;font-style:italic;color:var(--mut)}
.calls[data-show~="none"] .rest-note{display:block}
/* roster moves belong to the bullpen drawer, not the decisions box */
.penfoot{display:flex;gap:6px;margin-top:7px;padding-top:7px;border-top:1px solid var(--soft-line)}
.penfoot button{flex:1 1 0;border:1px solid var(--soft-line);background:transparent;color:var(--gray);
border-radius:6px;padding:6px 5px;font:inherit;font-size:9px;font-weight:800;cursor:pointer}
.penfoot button:hover{color:var(--bright);border-color:var(--line)}

/* ---- CENTRE: field ---- */
.fcol{flex:1 1 auto;min-width:320px;min-height:0;display:flex;flex-direction:column;gap:6px;justify-content:center}
.fwrap{flex:1 1 auto;min-height:0;container-type:size;display:flex;align-items:center;justify-content:center}
.field{position:relative;width:100%;height:100%;max-width:1100px;border-radius:11px;overflow:hidden;border:1px solid var(--line);background:#070809}
.finner{position:absolute;top:0;height:100%;aspect-ratio:1508/1043;left:50%;transform:translateX(-50%);container-type:size}
.finner>img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
.fc{position:absolute;left:var(--dx);top:var(--dy);transform:translate(-50%,-50%);z-index:3}
.fc img{width:10.0cqw;height:14.02cqw;border-radius:3px;border:1px solid rgba(216,173,45,.5);
box-shadow:0 3px 12px rgba(7,8,9,.8);display:block;object-fit:cover}
.dstrip{flex:0 0 auto;display:flex;gap:22px;align-items:center;justify-content:center;padding:8px 12px;font-size:11px}
.dstrip .g{display:flex;gap:7px;align-items:baseline}
.dstrip small{font-size:9px;color:var(--mut);font-weight:700}
.dstrip strong{font-size:11.5px;font-weight:800}

/* ---- RIGHT RAIL: accordion ---- */
.rrail{flex:0 1 clamp(190px,15vw,290px);display:flex;flex-direction:column;gap:7px;min-height:0}
.dr{border:1px solid var(--soft-line);border-radius:10px;background:var(--soft);display:flex;flex-direction:column;
min-height:0;flex:0 0 auto;overflow:hidden}
.dr.open{flex:1 1 auto;border-color:var(--gold)}
.drh{display:flex;align-items:center;gap:8px;padding:11px 10px;cursor:pointer;min-height:44px;flex-shrink:0}
.drh .car{font-size:9px;color:var(--mut);width:9px}
.dr.open .drh .car{color:var(--bright)}
.drh b{font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--gray)}
.dr.open .drh b{color:var(--bright)}
.drh span{margin-left:auto;font-size:9px;color:var(--mut);font-weight:700}
.drb{display:none;padding:0 7px 7px;overflow:auto;min-height:0}
.dr.open .drb{display:block}
.arm{display:flex;align-items:center;gap:7px;padding:5px;border:1px solid var(--soft-line);border-radius:8px;
background:#08090a;margin-bottom:5px}
.arm img{width:30px;height:42px;object-fit:cover;border-radius:4px;display:block;flex-shrink:0}
.arm .who{min-width:0;flex:1}
.arm .who b{display:block;font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.arm .who span{font-size:8px;color:var(--mut)}
.arm .rest{font-size:7.5px;font-weight:800;color:var(--good)}
.arm .rest.wait{color:var(--pitch)}
.arm button{border:1px solid var(--soft-line);background:transparent;color:var(--gray);border-radius:6px;
font:inherit;font-size:8.5px;font-weight:800;padding:6px 8px;flex-shrink:0}
.logline{display:flex;gap:8px;font-size:10px;padding:4px 2px;border-bottom:1px solid rgba(174,175,178,.07)}
.logline i{font-style:normal;color:var(--mut);font-size:8px;width:16px;flex-shrink:0}

/* ---------- the tab bar is mobile-only ---------- */
.tabbar{display:none}

/* ---------- PHONE: three columns become five tabs ---------- */
@media (max-width:1024px){
  :root{--m-hdr:52px;--m-card:23.4vh;--m-meta:118px;--m-roll:48px;--m-line:34px;
        --m-calls:52px;--m-fieldar:.95;--m-fc:10cqw;--m-tab:46px;--m-pad:6px}
  .screen{padding:var(--m-pad);gap:var(--m-pad);padding-bottom:0}
  .top{height:auto;min-height:var(--m-hdr);padding:6px 10px;gap:9px;justify-content:flex-start;flex-wrap:wrap}
  .seg{min-width:0}
  .recap{flex:1 0 100%;order:9}
  .top .vr,.top .who{display:none}
  .score{gap:16px}.situ{gap:11px}
  .team b{font-size:19px}.team span{font-size:11px}
  .recap{gap:9px;flex-wrap:wrap}
  .recap h4{font-size:13px}.recap p{font-size:10px}
  .screen:not(.m-matchup):not(.postgame) .recap{display:none}
  .menu{flex:0 0 40px;height:38px;font-size:16px}

  /* promote the columns so they can be shown one at a time */
  .main{display:contents}
  .lrail,.fcol,.rrail{flex:none;width:100%;min-width:0;order:2}
  .lrail{gap:6px;min-height:0}
  .man{padding:6px;gap:8px}
  .man img{height:clamp(120px,var(--m-card),260px)}
  .meta{flex:0 0 var(--m-meta);gap:5px}
  .meta div{min-height:52px}
  .roll{flex:0 0 var(--m-meta);height:var(--m-roll);font-size:12px}
  .order{padding:7px}
  .oc img{width:var(--m-line)}.oc.hero img{width:calc(var(--m-line) * 1.22)}
  .oc .basetag{pointer-events:none}
  .calls{min-height:var(--m-calls)}
  .acts button{min-height:44px;padding:9px 16px}

  .fcol{gap:6px}
  .fwrap{flex:none;aspect-ratio:var(--m-fieldar);container-type:normal}
  .field{max-width:none;width:100%;height:100%}
  .dstrip{display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:9px 11px}
  .dstrip .g{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
  .dstrip .g>.lbl{flex:0 0 30px}
  .rrail{gap:6px}
  .drh{min-height:44px}

  /* which tab shows what */
  .m-matchup .fcol,.m-matchup .rrail{display:none}
  .m-field .lrail,.m-field .rrail{display:none}
  .m-log .lrail,.m-log .fcol,.m-log .dr:not(.dr-log){display:none}
  .m-pen .lrail,.m-pen .fcol,.m-pen .dr:not(.dr-pen){display:none}
  .m-bench .lrail,.m-bench .fcol,.m-bench .dr:not(.dr-bench){display:none}
  .m-log .dr-log,.m-pen .dr-pen,.m-bench .dr-bench{flex:1 1 auto;border-color:var(--gold)}
  .m-log .dr-log .drb,.m-pen .dr-pen .drb,.m-bench .dr-bench .drb{display:block}
  .m-log .dr-log .car,.m-pen .dr-pen .car,.m-bench .dr-bench .car{color:var(--bright)}
  /* the phone crops the field to a different shape, so it keeps its own positions */
  .fc{left:var(--mx);top:var(--my)}
  .fc img{width:var(--m-fc);height:calc(var(--m-fc) * 1.4024)}

  .tabbar{display:flex;order:9;margin-top:auto;gap:4px;flex-shrink:0;
    padding:6px 4px calc(6px + env(safe-area-inset-bottom));background:var(--panel);
    border-top:1px solid var(--line);margin-left:-6px;margin-right:-6px}
  .tabbar button{flex:1;min-height:var(--m-tab);border:1px solid transparent;background:transparent;color:var(--mut);
    font:inherit;font-size:8.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;border-radius:8px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer}
  .tabbar button .ic{font-size:14px;line-height:1}
  .tabbar button.on{background:rgba(216,173,45,.14);border-color:var(--line);color:var(--bright)}
  #ed,.grab,.tag{display:none}
}
.tag{position:fixed;left:8px;bottom:8px;z-index:99;font-size:8.5px;font-weight:900;letter-spacing:.14em;
text-transform:uppercase;color:#07210c;background:var(--bright);padding:4px 9px;border-radius:5px}
</style>
"""

def order_strip():
    c=[]
    for n in range(1,10):
        cls,lab=ST.get(n,(None,''))
        if cls=='onbase':
            tag=f'<button class="basetag" data-a="steal">{lab}</button>'
        else:
            tag=f'<em>{lab or "x"}</em>'
        c.append(f'      <div class="oc{" "+cls if cls else ""}"><b>{n}</b><img loading="eager" src="{R}{IMG[n]}">{tag}</div>')
    return '    <div class="panel order">\n'+'\n'.join(c)+'\n    </div>'

def field():
    rows=['        <img class="bg" src="/gameplay-field-v3.webp">']
    for pos,img,l,t in FIELDERS:
        rows.append(f'        <div class="fc" data-pos="{pos}" '
                    f'style="--dx:{l}%;--dy:{t}%;--mx:{l}%;--my:{t}%">'
                    f'<img loading="eager" src="{R}{img}"></div>')
    return ('    <div class="fcol">\n      <div class="fwrap"><div class="field"><div class="finner">\n'
            +'\n'.join(rows)+'\n        </div></div></div>\n'
            '      <div class="panel dstrip">\n'
            '        <span class="g"><b class="lbl">C</b><small>C</small><strong>+3</strong></span>\n'
            '        <span class="g"><b class="lbl">Inf</b><small>1B</small><strong>+1</strong><small>2B</small><strong>+0</strong><small>3B</small><strong>+0</strong><small>SS</small><strong>+8</strong></span>\n'
            '        <span class="g"><b class="lbl">Of</b><small>LF</small><strong>+0</strong><small>CF</small><strong>+2</strong><small>RF</small><strong>+2</strong></span>\n'
            '      </div>\n    </div>')

PEN_FOOT = ('\n            <div class="penfoot">'
            '<button>Pitching change</button><button>Double switch</button></div>')
BENCH_FOOT = ('\n            <div class="penfoot">'
            '<button>Pinch hit</button><button>Pinch run</button><button>Def sub</button></div>')

def arms():
    return ''.join(f'''            <div class="arm"><img loading="eager" src="{R}{i}">
              <div class="who"><b>{n}</b><span>{s}</span></div>
              <button>Bring in</button></div>''' for n,i,s in PEN)

def benchmen():
    return ''.join(f'''            <div class="arm"><img loading="eager" src="{R}{i}">
              <div class="who"><b>{n}</b><span>{s}</span></div>
              <button>Sub in</button></div>''' for n,i,s in BENCH)

def build_log(rows):
    return ''.join(f'            <div class="logline"><i>{i}</i>{x}</div>' for i,x in rows)

def rrail(open_id, st):
    def dr(k,label,count,body):
        o=' open' if k==open_id else ''
        car='&#9662;' if k==open_id else '&#9656;'
        return (f'      <div class="dr dr-{k}{o}"><div class="drh"><span class="car">{car}</span><b>{label}</b>'
                f'<span>{count}</span></div>\n        <div class="drb">{body}</div></div>')
    return ('    <div class="rrail">\n'+dr('log','Game log',st['nlog'],build_log(st['log']))+'\n'
            +dr('pen','Bullpen','6 available',arms()+PEN_FOOT)+'\n'
            +dr('bench','Bench','2 available',benchmen()+BENCH_FOOT)+'\n    </div>')

TABJS = """
<script>
document.addEventListener('click',function(e){
  var b=e.target.closest('.tabbar button'); if(!b) return;
  var sc=document.querySelector('.screen');
  ['matchup','field','log','pen','bench'].forEach(function(k){sc.classList.remove('m-'+k)});
  sc.classList.add('m-'+b.dataset.t);
  document.querySelectorAll('.tabbar button').forEach(function(x){x.classList.toggle('on',x===b)});
});

/* A lineup card enlarges on click. On desktop the base tag is its own control and
   stops there; on mobile the tag is inert (too small to be a touch target) and the
   steal lives on the enlarged card instead, so the gesture is one already specified. */
var z=document.querySelector('.zoom');
document.addEventListener('click',function(e){
  if(e.target.closest('.zclose')||e.target===z){z.hidden=true;return}
  var tag=e.target.closest('.basetag');
  if(tag&&window.innerWidth>1024){e.stopPropagation();return}
  var oc=e.target.closest('.oc'); if(!oc||!z) return;
  var img=oc.querySelector('img');
  z.querySelector('img').src=img.currentSrc||img.src;
  var acts=z.querySelector('.zacts');
  acts.innerHTML = oc.classList.contains('onbase')
    ? '<button class="zsteal">Steal 2nd</button>' : '';
  z.hidden=false;
});
</script>"""


# ---------------------------------------------------------------------------
# TYPE 2 — proportional scaling. Everything on the desktop board is expressed
# as a fraction of the stage height, so the whole composition scales as one
# locked unit instead of reflowing. Design height is the locked baseline's
# 1130px viewport; --u is one hundredth of the stage height, resolved once on
# .screen so nested field containers cannot capture the cq units.
H = 1130.0
def u(px):            # a locked pixel value -> stage-relative
    return 'calc(var(--u) * %.3f)' % (px / H * 100.0)
def uf(px, floor):    # text: scales, but never below a readable floor
    return 'max(%dpx, calc(var(--u) * %.3f))' % (floor, px / H * 100.0)

SCALE = """
<style>
/* ---------- TYPE 2: the desktop board scales as one unit ---------- */
@property --u{syntax:"<length>";inherits:true;initial-value:0px}
.stagewrap{position:fixed;inset:0;container-type:size}
@media (min-width:1025px){
  .stagewrap{overflow:hidden}
  .screen{--u:1cqh;width:100%%;height:100%%;padding:%(p8)s;gap:%(p8)s}
  .main{gap:%(p8)s}

  .top{height:%(h90)s;gap:%(g26)s;padding:0 %(g26)s}
  .score{gap:%(g30)s}.situ{gap:%(g18)s}.recap{gap:%(g18)s}.who{gap:%(g12)s}
  .team{gap:%(g11)s}
  .team b{font-size:%(f31)s}
  .team span{font-size:%(f15)s}
  .top .inn{font-size:%(f16)s}
  .dia{width:%(d27)s;height:%(d27)s}
  .dia i{width:%(d95)s;height:%(d95)s}
  .dia .b2{top:0;left:%(d475)s}.dia .b3{top:%(d475)s;left:0}.dia .b1{top:%(d475)s;right:0}
  .outs{gap:%(g5)s}
  .outs i{width:%(d9)s;height:%(d9)s}
  .recap h4,.who h4{font-size:%(f19)s}
  .recap p{font-size:%(f13)s}
  .lbl{font-size:%(f9)s}
  .menu{flex:0 0 %(m48)s;height:%(m44)s;font-size:%(f19)s}
  .vr{margin:%(g16)s 0}

  .lrail{flex:0 0 %(r580)s;gap:%(g7)s;container-type:inline-size}
  .man{padding:%(g7)s;gap:%(g9)s}
  .man img{width:%(c210)s;height:%(c295)s;aspect-ratio:auto;max-width:none}
  .meta{flex:0 0 %(m160)s;gap:%(g6)s}
  .meta div{padding:%(g6)s %(g4)s;min-height:%(m56)s}
  .meta i{font-size:%(f75)s}
  .meta u{font-size:%(f16)s}
  .meta s{font-size:%(f7)s}
  .rollrow{gap:%(g8)s}
  .roll{flex:0 0 %(w132)s;height:%(h60)s;font-size:%(f13b)s}
  .readout{padding:%(g4)s %(g8)s;gap:%(g6)s}
  .readout i{font-size:%(f7)s}
  .readout u{font-size:%(f16)s}
  .order{padding:%(g8)s;gap:%(g4)s}
  .oc img{width:%(l50)s;height:auto}
  .oc.hero img{width:%(l61)s;height:auto}
  .oc b{width:%(b11)s;height:%(b11)s;line-height:%(b9)s;font-size:%(f7)s}
  .oc em{font-size:%(f6)s}
  .oc .basetag{font-size:%(f6)s;padding:%(g2)s %(g5)s}
  .calls{padding:%(g10)s %(g11)s;gap:%(g8)s;min-height:%(h46)s}
  .acts{gap:%(g6)s}
  .acts button{font-size:%(f11)s;padding:%(g8)s %(g14)s;min-height:%(h38)s}

  .fcol{gap:%(g6)s;min-width:0}
  .dstrip{padding:%(g8)s %(g12)s;gap:%(g22)s;font-size:%(f11)s}
  .dstrip small{font-size:%(f9)s}
  .dstrip strong{font-size:%(f115)s}

  .rrail{flex:0 0 %(r290)s;gap:%(g7)s}
  .drh{padding:%(g11)s %(g10)s;min-height:%(h44)s}
  .drh b{font-size:%(f10)s}
  .drh span{font-size:%(f9)s}
  .arm{gap:%(g7)s;padding:%(g5)s}
  .arm img{width:%(a30)s;height:%(a42)s}
  .arm .who b{font-size:%(f10)s}
  .arm .who span{font-size:%(f8)s}
  .arm .rest{font-size:%(f75)s}
  .arm button{font-size:%(f85)s;padding:%(g6)s %(g8)s}
  .logline{font-size:%(f10)s;padding:%(g4)s %(g2)s}
  .logline i{font-size:%(f8)s;width:%(w16)s}
}
</style>
""" % dict(
  p8=u(8), g2=u(2), g4=u(4), g5=u(5), g6=u(6), g7=u(7), g8=u(8), g9=u(9), g10=u(10),
  g11=u(11), g12=u(12), g14=u(14), g16=u(16), g18=u(18), g22=u(22), g26=u(26), g30=u(30),
  h90=u(90), h60=u(60), h46=u(46), h44=u(44), h38=u(38),
  d27=u(27), d95=u(9.5), d475=u(4.75), d9=u(9),
  m48=u(48), m44=u(44), m160=u(160), m56=u(56),
  r580=u(580), r290=u(290),
  c210=u(210), c295=u(295), w132=u(132), w16=u(16),
  l50=u(50), l61=u(61), b11=u(11), b9=u(9), a30=u(30), a42=u(42),
  f31=uf(31,18), f15=uf(15,11), f16=uf(16,11), f19=uf(19,13), f13=uf(13,11),
  f13b=uf(13,10), f11=uf(11,10), f115=uf(11.5,10), f10=uf(10,9), f9=uf(9,8),
  f85=uf(8.5,8), f8=uf(8,8), f75=uf(7.5,7), f7=uf(7,7), f6=uf(6,6),
)

BADGE = """
<style>
#vpbadge{position:fixed;left:0;top:0;z-index:400;max-width:96vw;
  font:11px/1 ui-monospace,Menlo,monospace;font-weight:700;padding:5px 12px;
  border-radius:0 0 8px 0;pointer-events:none;white-space:normal}
#vpbadge.desk{background:#1d4ed8;color:#fff}
#vpbadge.mob{background:#15803d;color:#fff}
#vpbadge.warn{background:#b91c1c;color:#fff}
</style>
<div id="vpbadge"></div>
<script>
(function(){
  var b=document.getElementById('vpbadge');
  function upd(){
    var w=window.innerWidth,h=window.innerHeight;
    var mob=window.matchMedia('(max-width:1024px)').matches;
    var sc=document.querySelector('.screen');
    var over=sc?Math.max(sc.scrollWidth-w,0):0;
    // innerWidth is CSS pixels. Zooming out inflates it well past the real window,
    // so the page can report 1440 inside a 720-wide window and pick desktop wrongly.
    var ow=window.outerWidth||w, zoom=Math.round((ow/w)*100);
    var zoomed=Math.abs(zoom-100)>12;
    // a window can be wider than the space left of the screen edge: the browser
    // reports its full size, but the overhang is simply not visible
    var sx=(window.screenX!==undefined?window.screenX:0);
    var avail=(screen.availWidth||screen.width||ow);
    var off=Math.max(0,Math.round((sx+ow)-avail));
    b.className=(over>1||zoomed||off>8)?'warn':(mob?'mob':'desk');
    var lead='';
    if(off>8) lead='\u26a0 '+off+'px OF THIS PAGE IS OFF-SCREEN \u2014 the window is '+ow
      +'px wide but starts at x'+sx+' on a '+avail+'px screen. Drag it left, or narrow it from the LEFT edge.  \u00b7  ';
    else if(zoomed) lead='\u26a0 CSS VIEWPORT '+w+' DOES NOT MATCH WINDOW '+ow
      +' \u2014 DevTools device emulation (Cmd Shift M) or browser zoom (Cmd 0). Resizing the window will not change the layout until this is off.  \u00b7  ';
    else if(over>1) lead='\u26a0 CONTENT OVERFLOWS by '+over+'px.  \u00b7  ';
    b.textContent=lead+'css '+w+' x '+h+'  \u00b7  window '+ow+'  \u00b7  '+(mob?'MOBILE':'DESKTOP')
      +'  \u00b7  dpr '+(window.devicePixelRatio||1)+'  \u00b7  screen '+avail+' @x'+sx
      +(lead?'':'  \u00b7  fits');
  }
  // resize alone is unreliable: it does not fire when a window is merely moved,
  // and Chrome throttles it for background tabs. Observe and poll instead.
  addEventListener('resize',upd);
  addEventListener('focus',upd);
  if(window.ResizeObserver) new ResizeObserver(upd).observe(document.documentElement);
  setInterval(upd,400);
  upd(); setTimeout(upd,300);
})();
</script>"""

# Header state per artboard. PARITY is game 0c37ba41 at V16; SIXTH is game
# da3b3772 at the end of the bottom of the 6th, the moment the transition covers.
PARITY = dict(away=1, home=0, inn='&#9650; 1', b1='b1 on', b2='b2', outs=2,
  rh='Shackelford walks',
  rp='Ball four on the pitcher&rsquo;s chart; Shackelford aboard at first. Two away, Aurilia to the plate.',
  log=[(16,'Shackelford walks.'),(14,'Sierra flies out.'),(12,'Allen grounds out.'),
       (10,'Barnes homers. 1&ndash;0.'),(0,'<b style="color:var(--bright)">Play ball!</b>')],
  nlog='8 events')
SIXTH = dict(away=0, home=5, inn='&#9660; 6', b1='b1', b2='b2', outs=3,
  rh='Gray grounds out',
  rp='Tristan Gray grounds out to end the inning. Anthony leads 5&ndash;0 through six.',
  log=[(125,'Gray grounds out. Side retired.'),(120,'Williams homers, three runs. 0&ndash;5.'),
       (98,'Hines walks, run scores. 0&ndash;2.'),(96,'Taylor walks, run scores. 0&ndash;1.'),
       (0,'<b style="color:var(--bright)">Play ball!</b>')],
  nlog='125 events')

def screen(open_id, tag, overlay='', st=None):
    st = st or PARITY
    away, home = st['away'], st['home']
    aw = ' up' if away > home else ''
    hm = ' up' if home > away else ''
    inn, b1, b2, rh, rp = st['inn'], st['b1'], st['b2'], st['rh'], st['rp']
    outs = ''.join('<i class="on"></i>' for _ in range(st['outs'])) \
         + ''.join('<i></i>' for _ in range(3 - st['outs']))
    return CSS+f'''<title>Elements — gameplay</title>
<div class="stagewrap">
<div class="screen m-matchup">
  <div class="panel top">
    <div class="seg score">
      <span class="team{aw}"><span>Jeremiah</span><b class="num">{away}</b></span>
      <span class="team{hm}"><span>Anthony</span><b class="num">{home}</b></span>
    </div>
    <i class="vr"></i>
    <div class="seg situ">
      <span class="inn num">{inn}</span>
      <span class="dia"><i class="{b2}"></i><i class="b3"></i><i class="{b1}"></i></span>
      <span class="outs">{outs}</span>
    </div>
    <i class="vr"></i>
    <div class="seg recap"><b class="lbl">Play recap</b>
      <h4>{rh}</h4>
      <p>{rp}</p></div>
    <i class="vr"></i>
    <div class="seg who"><b class="lbl">Fielding</b><h4>Anthony</h4></div>
    <button class="menu">&#9776;</button>
  </div>
  <div class="main">
    <div class="lrail">
      <div class="man">
        <img loading="eager" src="{R}2006/CIN-Rich-Aurilia.png">
        <div class="meta">
          <div><i>Season</i><u class="num">.291</u><s>8 HR &middot; 31 RBI</s></div>
          <div><i>This game</i><u class="num">0&ndash;0</u><s>first at-bat</s></div>
        </div>
      </div>
      <div class="rollrow">
        <button class="roll">ROLL PITCH</button>
        <div class="readout"><div><i>Pitch</i><u>&ndash;</u></div><span class="sep"></span>
          <div><i>Swing</i><u>&ndash;</u></div><span class="sep"></span><div><i>Result</i><u>&ndash;</u></div></div>
      </div>
      <div class="man">
        <img loading="eager" src="{R}1925/KCM-Nelson-Dean.png">
        <div class="meta">
          <div><i>IP left</i><u class="num">7.33</u></div>
          <div><i>Control</i><u class="num">5</u></div>
        </div>
      </div>
{order_strip()}
      <div class="panel calls" data-show="ibb">
        <b class="lbl">Manager decisions</b>
        <div class="acts">
          <button data-a="bunt">Sac bunt</button>
          <button data-a="squeeze">Squeeze</button>
          <button data-a="ibb">IBB</button>
          <button data-a="infin">INF in</button>
        </div>
        <p class="rest-note">No decisions this pitch.</p>
      </div>
    </div>
{field()}
{rrail(open_id, st)}
  </div>
  <div class="zoom" hidden><div class="zin"><img alt=""><div class="zacts"></div>
    <button class="zclose">Close</button></div></div>
  <div class="tabbar">
    <button data-t="matchup" class="on"><span class="ic">&#9678;</span>Matchup</button>
    <button data-t="field"><span class="ic">&#9670;</span>Field</button>
    <button data-t="log"><span class="ic">&#9776;</span>Log</button>
    <button data-t="pen"><span class="ic">&#9679;</span>Bullpen</button>
    <button data-t="bench"><span class="ic">&#9634;</span>Bench</button>
  </div>
</div>
{overlay}
</div>
<div class="tag">{tag}</div>
'''+SCALE+BADGE+TABJS+(EDITOR if open_id is None else '')

# Real transition from game da3b3772 (v125): bottom 6 ends on a Tristan Gray
# ground ball, Anthony leads 5-0, and the sides swap for the top of the 7th.
HALF = '''<div class="halfx">
  <div class="hcard">
    <b class="hlbl">End of the 6th</b>
    <div class="hscore"><span><i>Jeremiah</i><u>0</u></span><em>&ndash;</em><span class="lead"><i>Anthony</i><u>5</u></span></div>
    <p class="hplay">Tristan Gray grounds out to end the inning.</p>
    <div class="hswap">
      <div class="hs"><i>Now batting</i><b>Jeremiah</b><s>Barnes leads off</s></div>
      <span class="harrow">&#8644;</span>
      <div class="hs"><i>Taking the field</i><b>Anthony</b><s>Dean stays in &middot; Control &minus;2</s></div>
    </div>
    <button class="hgo">Take the field</button>
  </div>
</div>'''

# ---- post-game recap, derived entirely from the 159 persisted events ----
PLAYSRC = """
T1|John Barnes flies out.
T1|Toussaint Allen singles.
T1|Felipe Sierra grounds out.
B1|Otto Briggs grounds out.
B1|Earl Gurley grounds out.
B1|Valent&iacute;n Dreke flies out.
T2|John Shackelford flies out.
T2|Rich Aurilia singles.
T2|Gary Thomasson grounds out.
T2|Ken Griffey Jr. grounds out.
B2|Ben Taylor grounds out.
B2|Harry Kenyon pops out.
B2|John Hines strikes out.
T3|Harry Kenyon grounds out.
T3|Phil Cockrell flies out.
T3|John Barnes strikes out.
B3|Bobby Williams strikes out.
B3|Tristan Gray grounds out.
B3|Nelson Dean grounds out.
T4|Toussaint Allen flies out.
T4|Felipe Sierra walks.
T4|John Shackelford grounds out.
T4|Rich Aurilia grounds out.
B4|Otto Briggs singles.
B4|Earl Gurley singles.
B4|Valent&iacute;n Dreke singles.
B4|Ben Taylor walks, run scores.
B4|Harry Kenyon flies out.
B4|John Hines walks, run scores.
B4|Bobby Williams grounds out.
T5|Gary Thomasson flies out.
T5|Ken Griffey Jr. walks.
T5|Harry Kenyon flies out.
T5|Phil Cockrell flies out.
B5|Tristan Gray grounds out.
B5|Nelson Dean flies out.
B5|Otto Briggs singles.
B5|Earl Gurley grounds out.
T6|John Barnes flies out.
T6|Toussaint Allen flies out.
T6|Felipe Sierra flies out.
B6|Valent&iacute;n Dreke strikes out.
B6|Ben Taylor doubles.
B6|Harry Kenyon grounds out.
B6|John Hines walks.
B6|Bobby Williams homers, 3 runs score.
B6|Tristan Gray grounds out.
T7|John Shackelford flies out.
T7|Rich Aurilia strikes out.
T7|Gary Thomasson flies out.
B7|Nelson Dean grounds out.
B7|Otto Briggs flies out.
B7|Earl Gurley triples.
B7|Valent&iacute;n Dreke grounds out.
T8|Ken Griffey Jr. grounds out.
T8|Harry Kenyon strikes out.
T8|Phil Cockrell pops out.
B8|Ben Taylor flies out.
B8|Harry Kenyon flies out.
B8|John Hines grounds out.
T9|John Barnes grounds out.
T9|Toussaint Allen singles.
T9|Felipe Sierra grounds out.
T9|John Shackelford singles.
T9|Rich Aurilia singles, run scores.
T9|Gary Thomasson flies out. Side retired.
"""

# Box scores derived from the 159 persisted events of game da3b3772, split by
# half-inning (the lab mirrors one roster onto both sides, so Harry Kenyon bats
# for both teams and must be attributed per side). RBI is the run delta credited
# to the batter on each SWING_RESOLVED.
AWAY_BOX=[('1','John Barnes',4,0,0,0,1,'FB K FB GB'),
  ('2','Toussaint Allen',4,2,0,0,0,'1B FB FB 1B'),
  ('3','Felipe Sierra',3,0,0,1,0,'GB BB FB GB'),
  ('4','John Shackelford',4,1,0,0,0,'FB GB FB 1B'),
  ('5','Rich Aurilia',4,2,1,0,1,'1B GB K 1B'),
  ('6','Gary Thomasson',4,0,0,0,0,'GB FB FB FB'),
  ('7','Ken Griffey Jr.',2,0,0,1,0,'GB BB GB'),
  ('8','Harry Kenyon',3,0,0,0,1,'GB FB K'),
  ('9','Phil Cockrell',3,0,0,0,0,'FB FB PU')]
HOME_BOX=[('1','Otto Briggs',4,2,0,0,0,'GB 1B 1B FB'),
  ('2','Earl Gurley',4,2,0,0,0,'GB 1B GB 3B'),
  ('3','Valent&iacute;n Dreke',4,1,0,0,1,'FB 1B K GB'),
  ('4','Ben Taylor',3,1,1,1,0,'GB BB 2B FB'),
  ('5','Harry Kenyon',4,0,0,0,0,'PU FB GB FB'),
  ('6','John Hines',2,0,1,2,1,'K BB BB GB'),
  ('7','Bobby Williams',3,1,3,0,1,'K GB HR'),
  ('8','Tristan Gray',3,0,0,0,0,'GB GB GB'),
  ('9','Nelson Dean',3,0,0,0,0,'GB FB GB')]
AWAY_TOT=(31,5,1,2,3); HOME_TOT=(30,7,5,3,3)
LINE=[('Jeremiah',[0,0,0,0,0,0,0,0,1],1,5,0),('Anthony',[0,0,0,2,0,3,0,0,None],5,7,0)]
SCORING=[('B4','Ben Taylor walks with the bases loaded.','0&ndash;1'),
         ('B4','John Hines walks with the bases loaded.','0&ndash;2'),
         ('B6','Bobby Williams homers, three runs score.','0&ndash;5'),
         ('T9','Rich Aurilia singles, one run scores.','1&ndash;5')]
PLAYS=[l.split('|',1) for l in PLAYSRC.strip().split('\n')]

def boxrows(rows):
    return ''.join(f'<tr><td class="ord">{o}</td><td class="nm">{nm}</td>'
                   f'<td>{ab}</td><td>{h}</td><td>{r}</td><td>{bb}</td><td>{k}</td>'
                   f'<td class="seq">{sq}</td></tr>'
                   for o,nm,ab,h,r,bb,k,sq in rows)

def boxtable(title, rows, tot):
    ab,h,r,bb,k = tot
    return (f'<div class="panel rbox"><b class="lbl">{title}</b><div class="tscroll">'
            '<table class="box"><thead><tr><th></th><th class="nm">Batter</th>'
            '<td>AB</td><td>H</td><td>RBI</td><td>BB</td><td>K</td>'
            '<td class="seq">By plate appearance</td></tr></thead>'
            f'<tbody>{boxrows(rows)}</tbody>'
            f'<tfoot><tr><td></td><td class="nm">Totals</td><td>{ab}</td><td>{h}</td>'
            f'<td>{r}</td><td>{bb}</td><td>{k}</td><td class="seq"></td></tr></tfoot>'
            '</table></div></div>')

def linerow(name,inns,r,h,e,lead):
    cells=''.join(f'<td>{"X" if v is None else v}</td>' for v in inns)
    cls=' class="lead"' if lead else ''
    return (f'<tr{cls}><th>{name}</th>{cells}<td class="tot">{r}</td>'
            f'<td class="tot">{h}</td><td class="tot">{e}</td></tr>')

def playlog():
    out=[]; last=None
    for half,txt in PLAYS:
        if half!=last:
            lab='Top' if half[0]=='T' else 'Bottom'
            out.append(f'<div class="pbhalf">{lab} {half[1:]}</div>')
            last=half
        out.append(f'<div class="pb">{txt}</div>')
    return ''.join(out)

PBJS = """
<script>
/* the recap log uses the same collapsed-drawer interaction as the live board */
document.addEventListener('click',function(e){
  var h=e.target.closest('.dr-plays .drh'); if(!h) return;
  var d=h.parentElement, open=d.classList.toggle('open');
  h.querySelector('.car').innerHTML = open ? '&#9662;' : '&#9656;';
});
</script>"""

def final_screen():
    innhead=''.join(f'<td>{i}</td>' for i in range(1,10))
    scoring=''.join(f'<div class="pl"><i>{w}</i><span>{d}</span><u>{s}</u></div>'
                    for w,d,s in SCORING)
    return CSS+'<title>Elements &mdash; final</title>' + f'''
<div class="stagewrap swpost"><div class="screen postgame">
  <div class="panel top">
    <div class="seg score"><span class="team"><span>Jeremiah</span><b class="num">1</b></span>
      <span class="team up"><span>Anthony</span><b class="num">5</b></span></div>
    <i class="vr"></i>
    <div class="seg situ"><span class="inn num">Final</span></div>
    <i class="vr"></i>
    <div class="seg recap"><b class="lbl">Result</b><h4>Anthony wins 5&ndash;1</h4>
      <p>Nelson Dean goes the distance; Bobby Williams&rsquo; three-run homer breaks it open.</p></div>
    <button class="menu">&#9776;</button>
  </div>
  <div class="rmain">
    <div class="panel rbox rline"><b class="lbl">Line score</b>
      <div class="tscroll"><table class="line"><thead><tr><th></th>{innhead}<td class="tot">R</td><td class="tot">H</td><td class="tot">E</td></tr></thead>
      <tbody>{linerow(*LINE[0],False)}{linerow(*LINE[1],True)}</tbody></table></div></div>
    <div class="rsplit">
      <div class="panel rbox"><b class="lbl">Scoring plays</b>
        <div class="plays">{scoring}</div></div>
      <div class="panel rbox"><b class="lbl">Pitching</b>
        <div class="plays">
          <div class="pl"><i>W</i><span>Nelson Dean<s>Complete game &middot; 33 BF &middot; 5 H &middot; 2 BB &middot; 3 K &middot; 1 R</s></span><u>Ctrl 5 &rarr; &minus;4</u></div>
          <div class="pl"><i>L</i><span>Phil Cockrell<s>Complete game &middot; 33 BF &middot; 7 H &middot; 3 BB &middot; 3 K &middot; 5 R</s></span><u>IP 7.0</u></div>
        </div></div>
    </div>
    <div class="rsplit rboxes">{boxtable('Jeremiah &mdash; batting',AWAY_BOX,AWAY_TOT)}{boxtable('Anthony &mdash; batting',HOME_BOX,HOME_TOT)}</div>
    <div class="dr dr-plays"><div class="drh"><span class="car">&#9656;</span><b>Play by play</b><span>66 plays</span></div>
      <div class="drb"><div class="pbwrap">{playlog()}</div></div></div>
  </div>
</div>
<div class="tag">Desktop &mdash; post-game recap</div>
</div>''' + SCALE + BADGE + PBJS


os.makedirs('.design-mockup',exist_ok=True)
for name,html in {'gameplay-desktop.html':screen(None,'Desktop &mdash; drawers collapsed'),
                  'gameplay-desktop-half.html':screen('log','Desktop &mdash; half-inning transition',HALF,SIXTH),
                  'gameplay-desktop-final.html':final_screen(),
                  'gameplay-desktop-bullpen.html':screen('pen','Desktop &mdash; bullpen open')}.items():
    io.open('.design-mockup/'+name,'w',encoding='utf-8').write(html)
    io.open('public/_'+name.replace('gameplay-',''),'w',encoding='utf-8').write(html)
print('written')
