// Overprint headless balance simulator.
// Loads the real game in jsdom with fake timers, stubs all visuals, and drives it with a greedy bot.
// Usage: node sim.js <gameDir> <outJson> [runs] [cap]
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');const path=require('path');
const SRC=process.argv[2],OUT=process.argv[3],RUNS=+(process.argv[4]||30),CAP=+(process.argv[5]||200);

// build an instrumented copy: eval hook inside the game's IIFE
const tmp=path.join(__dirname,'game');fs.mkdirSync(tmp,{recursive:true});
const html=fs.readFileSync(path.join(SRC,'index.html'),'utf8');const i=html.indexOf("'use strict';")+13;
fs.writeFileSync(path.join(tmp,'index.html'),html.slice(0,i)+'\nwindow.__E=s=>eval(s);'+html.slice(i));
for(const f of ['riso.js','meta.js','sfx.js'])fs.copyFileSync(path.join(SRC,f),path.join(tmp,f));

const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/animate/.test(e.message))console.log('JSERR',e.message)});
JSDOM.fromFile(path.join(tmp,'index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:false,virtualConsole:vc,
 beforeParse(w){
  const mkctx=cv=>new Proxy({canvas:cv},{get:(t,k)=>k in t?t[k]:(k==='measureText'?()=>({width:1}):(()=>({addColorStop(){},data:new Uint8ClampedArray(4)}))),set:(t,k,v)=>{t[k]=v;return true}});
  w.HTMLCanvasElement.prototype.getContext=function(){return this.__c||(this.__c=mkctx(this))};
  w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.navigator.vibrate=()=>true;w.ResizeObserver=class{observe(){}disconnect(){}};
  // fake clock
  let now=0,seq=0;const Q=[];
  w.setTimeout=(fn,ms)=>{const id=++seq;Q.push({t:now+(ms||0),id,fn});return id};
  w.clearTimeout=id=>{const k=Q.findIndex(x=>x.id===id);if(k>=0)Q.splice(k,1)};
  w.requestAnimationFrame=()=>0;
  w.__flush=()=>{let n=0;while(Q.length&&n++<100000){let m=0;for(let k=1;k<Q.length;k++)if(Q[k].t<Q[m].t||(Q[k].t===Q[m].t&&Q[k].id<Q[m].id))m=k;const x=Q.splice(m,1)[0];now=x.t;try{x.fn()}catch(e){console.log('TIMERR',e.message)}}};
  // seeded random
  let s=1;w.__seed=n=>{s=n>>>0||1};w.Math.random=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
 }}).then(dom=>{const w=dom.window;w.addEventListener('load',()=>setTimeout(()=>main(w),300))});

function main(w){
 const E=s=>w.__E(s);
 // stub visuals + side effects; record chains
 E(`ui=function(){};flashCard=function(){};flashMeter=function(){};flyTag=function(){};multStamp=function(){};cleanSheet=function(){};
    addToken=function(){};resetRibbon=function(){};renderPot=function(){};S=function(){};streakBump=function(){};
    R.pop=function(){};R.burst=function(){};R.shake=function(){};
    gameOver=function(){G.over=true;G.win=null;G.q=[];G.pumping=false};
    showLevelUp=function(){G.lv+=G.pendingLv;G.pendingLv=0;checkStuck()};
    window.__REC=null;
    const __cw=closeWindow;closeWindow=function(){const w=G.win;if(w&&!G.pumping&&window.__REC){const sx=streakX();
      window.__REC.chains.push({mult:w.mult,pot:w.pot,total:Math.round(w.pot*w.mult*sx*scoreMult()),log:w.log.slice(),clean:!!w.clean,wetIn:w.wetIn||0,streak:G.streak,rescue:!!w.last})}
      __cw()};`);
 const results=[];
 function runConfig(cfg){
  const agg={name:cfg.name,group:cfg.group,runs:[]};
  for(let r=0;r<RUNS;r++){
   w.__seed(1000+r*7919);
   E('newRun();G.rack='+JSON.stringify(cfg.rack||[])+';G.plv='+JSON.stringify(cfg.plv||{})+';G.slots=12;');
   (cfg.curses||[]).forEach(c=>E('addCurse("'+c+'")'));
   if(cfg.curses&&cfg.curses.includes('blind'))E('genTray()');
   if(cfg.curses&&cfg.curses.includes('heavy'))E('genTray()');
   E('window.__REC={chains:[]}');
   let guard=0;
   while(!E('G.over')&&E('G.placements')<CAP&&guard++<CAP*3){
     if(cfg.arm)E(`G.rack.forEach(id=>{const p=PERKS[id];if(p.cost&&!isMaxed(id)&&!G.armed.has(id)&&canAfford(p,0))toggleArm(id)})`);
     const mv=E(`(function(){let best=null,bs=-1e9;const left=G.tray.filter(p=>!p.used);
       G.tray.forEach((p,pi)=>{if(p.used)return;for(let r=0;r<N;r++)for(let c=0;c<N;c++){if(!canPlace(p.cells,r,c))continue;
         const b=G.board.map(x=>x.slice());p.cells.forEach(([a,d])=>b[r+a][c+d]={k:p.k});
         const rows=[],cols=[];for(let i=0;i<N;i++){if(b[i].every(v=>v))rows.push(i);let f=true,allL=true;for(let j=0;j<N;j++){if(!b[j][i]){f=false;break}if(b[j][i].k!=='L')allL=false}if(f&&!allL)cols.push(i)}
         rows.forEach(i=>{for(let j=0;j<N;j++)if(b[i][j].k!=='L')b[i][j]=null});cols.forEach(i=>{for(let j=0;j<N;j++)if(b[j][i]&&b[j][i].k!=='L')b[j][i]=null});
         let h3=0,h4=0,filled=0;for(let i=0;i<N;i++)for(let j=0;j<N;j++){if(b[i][j]){filled++;continue}let nb=0;[[i-1,j],[i+1,j],[i,j-1],[i,j+1]].forEach(([x,y])=>{if(x<0||y<0||x>=N||y>=N||b[x][y])nb++});if(nb===4)h4++;else if(nb===3)h3++}
         let contact=0;p.cells.forEach(([a,d])=>{[[r+a-1,c+d],[r+a+1,c+d],[r+a,c+d-1],[r+a,c+d+1]].forEach(([x,y])=>{if(x<0||y<0||x>=N||y>=N)contact++;else if(G.board[x][y])contact++})});
         const fitsB=cells=>{let n=0;for(let x=0;x<N;x++)for(let y=0;y<N;y++){let ok=true;for(const[a,d]of cells){const xx=x+a,yy=y+d;if(xx>=N||yy>=N||b[xx][yy]){ok=false;break}}if(ok)n++}return n};
         const PROBE=window.__PROBE||(window.__PROBE=[[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]],[[0,0],[0,1],[0,2],[0,3],[0,4]],[[0,0],[1,0],[2,0],[3,0],[4,0]],[[0,0],[0,1],[1,0],[1,1]]]);
         let open=0;PROBE.forEach(q=>{open+=Math.min(6,fitsB(q))});
         let fit=0;left.forEach(q=>{if(q!==p&&fitsB(q.cells)>0)fit++});
         const sc=(rows.length+cols.length)*120+fit*200+open*6+contact*3-h4*25-h3*8-filled*0.5+Math.random();
         if(sc>bs){bs=sc;best=[pi,r,c]}}});return best?best.join(','):''})()`);
     if(!mv){E('checkStuck()');w.__flush();continue}
     const[a,b,c]=mv.split(',').map(Number);
     E('place('+a+','+b+','+c+')');w.__flush();
   }
   if(process.env.DEBUG&&r===0)console.log('\n'+E(`G.board.map(r=>r.map(v=>v?(v.k==='L'?'#':v.k):'.').join('')).join('\\n')`)+'\nTRAY '+E('JSON.stringify(G.tray.map(p=>[p.used,p.cells]))')+' lines '+E('G.lines')+' pl '+E('G.placements'));
   const st=JSON.parse(E('JSON.stringify({score:G.score,placements:G.placements,lines:G.lines,over:G.over,lv:G.lv})'));
   const rec=JSON.parse(E('JSON.stringify(window.__REC)'));
   agg.runs.push({lv:st.lv,score:st.score,placements:st.placements,lines:st.lines,died:st.over,chains:rec.chains});
  }
  results.push(summarize(agg));process.stdout.write('.');
 }
 function summarize(a){
  const n=a.runs.length,avg=f=>a.runs.reduce((s,r)=>s+f(r),0)/n;
  const all=[].concat(...a.runs.map(r=>r.chains));const ch=all.length||1;
  const fires={};all.forEach(c=>c.log.forEach(x=>{if(x!=='LINE CLEAR'&&!/LINES|PURE/.test(x))fires[x]=(fires[x]||0)+1}));
  Object.keys(fires).forEach(k=>fires[k]=+(fires[k]/ch).toFixed(2));
  const scores=a.runs.map(r=>r.score).sort((x,y)=>x-y);
  return{name:a.name,group:a.group,avgScore:Math.round(avg(r=>r.score)),medScore:scores[n>>1],avgPlacements:+avg(r=>r.placements).toFixed(1),avgLv:+avg(r=>r.lv||0).toFixed(1),deathRate:+avg(r=>r.died?1:0).toFixed(2),
   scorePerPlace:+(avg(r=>r.score/Math.max(1,r.placements))).toFixed(1),chainsPerRun:+(all.length/n).toFixed(1),avgMult:+(all.reduce((s,c)=>s+c.mult,0)/ch).toFixed(2),
   maxMult:Math.max(0,...all.map(c=>c.mult)),cleanRate:+(all.filter(c=>c.clean).length/ch).toFixed(3),avgWetIn:+(all.reduce((s,c)=>s+c.wetIn,0)/ch).toFixed(2),firesPerChain:fires}
 }
 const PERK_IDS=E('JSON.stringify(Object.keys(PERKS).filter(k=>PERKS[k].type!=="curse"))');const perks=JSON.parse(PERK_IDS);
 const CURSES=JSON.parse(E('JSON.stringify(Object.keys(PERKS).filter(k=>PERKS[k].type==="curse"))'));
 const cfgs=[{name:'none',group:'base',rack:[]}];
 perks.forEach(id=>cfgs.push({name:id+' Lv1',group:'solo1',rack:[id],plv:{[id]:1},arm:true}));
 perks.forEach(id=>cfgs.push({name:id+' Lv3',group:'solo3',rack:[id],plv:{[id]:3},arm:true}));
 const MID=['domino','pebble','shatter'];
 cfgs.push({name:'MID',group:'marg',rack:MID,arm:true});
 perks.filter(id=>!MID.includes(id)).forEach(id=>cfgs.push({name:'MID+'+id,group:'marg',rack:MID.concat(id),arm:true}));
 const EARLY={rack:['domino'],plv:{}},LATE={rack:['domino','pebble','shatter','nudge','golddust','wetink'],plv:{domino:2,pebble:2,shatter:2,nudge:2,golddust:2,wetink:2}};
 [['early',EARLY],['late',LATE]].forEach(([g,b])=>{cfgs.push({name:g+' none',group:'curse_'+g,rack:b.rack,plv:b.plv,arm:true});
   CURSES.forEach(c=>cfgs.push({name:g+' +'+c,group:'curse_'+g,rack:b.rack,plv:b.plv,curses:[c],arm:true}))});
 if(process.env.CFGS){cfgs.length=0;JSON.parse(process.env.CFGS).forEach(c=>cfgs.push(Object.assign({group:"custom",arm:true},c)))}
 const only=process.env.ONLY;const list=only?cfgs.filter(c=>c.group===only||c.name===only):cfgs;
 const t0=Date.now();list.forEach(runConfig);
 fs.writeFileSync(OUT,JSON.stringify({runs:RUNS,cap:CAP,ms:Date.now()-t0,results},null,1));
 console.log('\ndone',list.length,'configs in',Math.round((Date.now()-t0)/1000)+'s');process.exit(0);
}
