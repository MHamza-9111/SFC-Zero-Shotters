/* ══════════════════════════════════════════════════════════════════════
   DineIQ · CHART ENGINE  (hand-rolled SVG — no external libraries)
   Every chart element carries data-tt for the shared hover tooltip.
   ══════════════════════════════════════════════════════════════════════ */
const __uid=(()=>{let i=0;return p=>p+(++i);})();
const esc2=s=>esc(s);
/* theme-aware chart ink (axis/grid) — reads the live theme so charts redraw correctly on toggle */
function isLightTheme(){return document.documentElement.getAttribute('data-theme')==='light';}
function axisColor(){return isLightTheme()?'#6B5F52':'#8A7F72';}
function gridColor(a=1){return isLightTheme()?`rgba(20,16,12,${(.09*a).toFixed(3)})`:`rgba(255,255,255,${(.05*a).toFixed(3)})`;}

/* shared hover tooltip */
let TT;
function initTip(){
  TT=document.createElement('div');
  TT.style.cssText='position:fixed;z-index:600;pointer-events:none;opacity:0;transition:opacity .12s;max-width:280px;'+
    'border-radius:9px;padding:8px 11px;font-size:11px;line-height:1.5;font-family:Inter,sans-serif;';
  document.body.appendChild(TT);
  document.addEventListener('mousemove',e=>{
    const t=e.target.closest('[data-tt]');
    if(!t){TT.style.opacity=0;return;}
    TT.innerHTML=t.getAttribute('data-tt');
    TT.style.opacity=1;
    TT.style.background=isLightTheme()?'linear-gradient(160deg,#FFFDF8,#F3EDE0)':'linear-gradient(160deg,#231C15,#15110E)';
    TT.style.border='1px solid '+(isLightTheme()?'rgba(120,90,30,.28)':'rgba(216,178,94,.3)');
    TT.style.color=isLightTheme()?'#221C14':'#F6F1E7';
    TT.style.boxShadow=isLightTheme()?'0 18px 40px -18px rgba(80,60,20,.35)':'0 18px 40px -18px #000';
    const pad=14, w=TT.offsetWidth,h=TT.offsetHeight;
    let x=e.clientX+pad,y=e.clientY+pad;
    if(x+w>innerWidth-8)x=e.clientX-w-pad;
    if(y+h>innerHeight-8)y=e.clientY-h-pad;
    TT.style.left=x+'px';TT.style.top=y+'px';
  });
}
const ttRow=(k,v)=>`<div style="display:flex;gap:14px;justify-content:space-between"><span style="color:${axisColor()}">${esc(k)}</span><b style="font-family:JetBrains Mono,monospace">${v}</b></div>`;

/* ── axis helpers ── */
function niceMax(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v)));const n=v/p;return (n<=1?1:n<=1.5?1.5:n<=2?2:n<=2.5?2.5:n<=3?3:n<=4?4:n<=5?5:n<=7.5?7.5:10)*p;}
function ticks(max,n=4){const out=[];for(let i=0;i<=n;i++)out.push(max/n*i);return out;}

/* ── LINE / AREA ─────────────────────────────────────────────────────── */
function areaChart(series,o={}){
  const w=o.w||620,h=o.h||190,pl=o.pl??48,pr=o.pr??14,pt=o.pt??14,pb=o.pb??26;
  const labels=o.labels||[], n=Math.max(...series.map(s=>s.data.length),1);
  const all=series.flatMap(s=>s.data.filter(v=>v!=null));
  const max=niceMax(Math.max(...all,0)), min=o.min!=null?o.min:(Math.min(...all)<0?Math.floor(Math.min(...all)*1.1):0);
  const X=i=>pl+(w-pl-pr)*(n<2?.5:i/(n-1)), Y=v=>pt+(h-pt-pb)*(1-(v-min)/(max-min||1));
  let g='';
  ticks(max,4).forEach(t=>{const y=Y(t);g+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="${gridColor()}"/>`+
    `<text x="${pl-7}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${axisColor()}">${o.fmtAxis?o.fmtAxis(t):nf(t)}</text>`;});
  if(labels.length){const step=Math.ceil(n/(o.xTicks||8));labels.forEach((l,i)=>{if(i%step)return;
    g+=`<text x="${X(i).toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="9" fill="${axisColor()}">${esc(l)}</text>`;});}
  let s='';
  series.forEach((se,si)=>{
    const pts=se.data.map((v,i)=>v==null?null:[X(i),Y(v)]).filter(Boolean);
    if(!pts.length)return;
    const d='M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L');
    if(se.area!==false){
      const gid=__uid('grad');
      s+=`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${se.color}" stop-opacity=".28"/><stop offset="100%" stop-color="${se.color}" stop-opacity="0"/></linearGradient></defs>`;
      s+=`<path d="${d}L${pts[pts.length-1][0].toFixed(1)},${Y(min-(max-min)*0)}L${pts[0][0].toFixed(1)},${Y(0)}Z" fill="url(#${gid})" opacity="${se.areaOp??1}"/>`;
    }
    if(se.band){ /* confidence band: [lo,hi] pairs */
      const up=se.band.map((b,i)=>b?[X(i),Y(b[1])]:null).filter(Boolean);
      const lo=se.band.slice().reverse().map((b,i)=>b?[X(se.band.length-1-i),Y(b[0])]:null).filter(Boolean);
      s+=`<path d="M${up.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')}L${lo.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')}Z" fill="${se.color}" opacity=".13"/>`;
    }
    s+=`<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width||2}" stroke-linejoin="round" stroke-linecap="round" ${se.dash?`stroke-dasharray="${se.dash}"`:''}/>`;
    if(se.dots||o.dots)pts.forEach((p,i)=>{const v=se.data[i];
      s+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${o.dots?2.6:2.2}" fill="#12100E" stroke="${se.color}" stroke-width="1.6" data-tt="${esc(ttRow(se.name,v!=null?(o.fmt?o.fmt(v):nf(v)):'')+(labels[i]?'<div style=\'color:#635A50;font-size:10px\'>'+labels[i]+'</div>':''))}"/>`;});
    if(o.hit!==false)pts.forEach((p,i)=>{const v=se.data[i];
      s+=`<rect x="${(p[0]-Math.max(6,(w-pl-pr)/n/2)).toFixed(1)}" y="${pt}" width="${Math.max(12,(w-pl-pr)/n).toFixed(1)}" height="${h-pt-pb}" fill="transparent" class="tt" data-tt="${esc('<b>'+(o.ttTitle?o.ttTitle(i):labels[i]||'')+'</b>'+ttRow(se.name,o.fmt?o.fmt(v):nf(v)))}"/>`;});
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${g}${s}</svg>`;
}

/* ── VERTICAL / HORIZONTAL BARS ──────────────────────────────────────── */
function barChart(data,o={}){
  const w=o.w||620,h=o.h||200,pl=o.pl??46,pr=o.pr??12,pt=o.pt??12,pb=o.pb??34;
  const horizontal=!!o.horizontal, max=niceMax(Math.max(...data.map(d=>d.v),0));
  let g='',s='';
  if(horizontal){
    const rowH=(h-pt-pb)/Math.max(1,data.length);
    data.forEach((d,i)=>{
      const y=pt+i*rowH, bw=(w-pl-pr)*(d.v/max);
      g+=`<text x="${pl-8}" y="${y+rowH/2+3}" text-anchor="end" font-size="9.6" fill="#C6B9A6">${esc(d.l)}</text>`;
      s+=`<rect x="${pl}" y="${y+rowH*.18}" width="${Math.max(1,bw).toFixed(1)}" height="${rowH*.62}" rx="3" fill="${d.c||o.color||'var(--gold)'}" opacity="${d.dim?.45:.9}" data-tt="${esc('<b>'+d.l+'</b>'+(d.tt||ttRow(o.metric||'Value',o.fmt?o.fmt(d.v):nf(d.v))))}"/>`;
      if(d.showVal)s+=`<text x="${pl+bw+7}" y="${y+rowH/2+3.4}" font-size="9.4" fill="${axisColor()}" font-family="JetBrains Mono,monospace">${o.fmt?o.fmt(d.v):nf(d.v)}</text>`;
    });
  } else {
    const bw=(w-pl-pr)/Math.max(1,data.length);
    ticks(max,4).forEach(t=>{const y=pt+(h-pt-pb)*(1-t/max);
      g+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="${gridColor()}"/><text x="${pl-7}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${axisColor()}">${o.fmtAxis?o.fmtAxis(t):nf(t)}</text>`;});
    data.forEach((d,i)=>{
      const bh=(h-pt-pb)*(d.v/max), x=pl+i*bw+bw*.16, y=pt+(h-pt-pb)-bh;
      s+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*.68).toFixed(1)}" height="${Math.max(1,bh).toFixed(1)}" rx="3" fill="${d.c||o.color||'var(--gold)'}" opacity="${d.dim?.5:.88}" data-tt="${esc('<b>'+d.l+'</b>'+(d.tt||ttRow(o.metric||'Value',o.fmt?o.fmt(d.v):nf(d.v))))}"/>`;
      if(o.rotate) s+=`<text x="${(x+bw*.34).toFixed(1)}" y="${h-8}" text-anchor="end" font-size="9" fill="${axisColor()}" transform="rotate(-38 ${(x+bw*.34).toFixed(1)} ${h-8})">${esc(d.l)}</text>`;
      else s+=`<text x="${(x+bw*.34).toFixed(1)}" y="${h-10}" text-anchor="middle" font-size="9" fill="${axisColor()}">${esc(d.l)}</text>`;
    });
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${g}${s}</svg>`;
}
function groupedBars(labels,series,o={}){
  const w=o.w||620,h=o.h||210,pl=o.pl??48,pr=o.pr??12,pt=o.pt??12,pb=o.pb??30;
  const max=niceMax(Math.max(...series.flatMap(s=>s.data),0)),gx=(w-pl-pr)/labels.length, bw=gx/(series.length+.5);
  let g='',s='';
  ticks(max,4).forEach(t=>{const y=pt+(h-pt-pb)*(1-t/max);
    g+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="${gridColor()}"/><text x="${pl-7}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${axisColor()}">${o.fmtAxis?o.fmtAxis(t):nf(t)}</text>`;});
  labels.forEach((l,i)=>{
    s+=`<text x="${(pl+gx*i+gx/2).toFixed(1)}" y="${h-9}" text-anchor="middle" font-size="9" fill="${axisColor()}">${esc(l)}</text>`;
    series.forEach((se,si)=>{
      const v=se.data[i]||0,bh=(h-pt-pb)*(v/max),x=pl+gx*i+bw*(si+.25),y=pt+(h-pt-pb)-bh;
      s+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*.86).toFixed(1)}" height="${Math.max(.6,bh).toFixed(1)}" rx="2.5" fill="${se.color}" opacity=".9" data-tt="${esc('<b>'+l+'</b>'+ttRow(se.name,o.fmt?o.fmt(v):nf(v)))}"/>`;});
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${g}${s}</svg>`;
}
/* stacked bars (composition) */
function stackedBars(labels,series,o={}){
  const w=o.w||620,h=o.h||210,pl=o.pl??48,pr=o.pr??12,pt=o.pt??12,pb=o.pb??30;
  const totals=labels.map((_,i)=>sum(series,s=>s.data[i]||0));
  const max=niceMax(Math.max(...totals,1)),gx=(w-pl-pr)/labels.length;let g='',s='';
  ticks(max,4).forEach(t=>{const y=pt+(h-pt-pb)*(1-t/max);
    g+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="${gridColor()}"/><text x="${pl-7}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${axisColor()}">${o.fmtAxis?o.fmtAxis(t):nf(t)}</text>`;});
  labels.forEach((l,i)=>{
    let acc=0;
    series.forEach(se=>{const v=se.data[i]||0;if(!v)return;
      const y0=pt+(h-pt-pb)*(1-acc/max),y1=pt+(h-pt-pb)*(1-(acc+v)/max);
      s+=`<rect x="${(pl+gx*i+gx*.18).toFixed(1)}" y="${y1.toFixed(1)}" width="${(gx*.64).toFixed(1)}" height="${Math.max(.6,y0-y1).toFixed(1)}" rx="2" fill="${se.color}" data-tt="${esc('<b>'+l+'</b>'+ttRow(se.name,o.fmt?o.fmt(v):nf(v)))}"/>`;
      acc+=v;});
    s+=`<text x="${(pl+gx*i+gx/2).toFixed(1)}" y="${h-9}" text-anchor="middle" font-size="9" fill="${axisColor()}">${esc(l)}</text>`;});
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${g}${s}</svg>`;
}
/* waterfall — promo / scenario impact decomposition */
function waterfall(items,o={}){
  const w=o.w||620,h=o.h||220,pl=44,pr=14,pt=16,pb=42;
  let acc=0;const rows=items.map(it=>{const start=acc;acc+=it.v;return {...it,start,end:acc};});
  const vals=[0,...rows.map(r=>r.start),...rows.map(r=>r.end)];
  const max=niceMax(Math.max(...vals)),min=Math.min(0,...vals);
  const X=i=>pl+(w-pl-pr)*(i/(rows.length-1||1)),Y=v=>pt+(h-pt-pb)*(1-(v-min)/(max-min||1));
  let s='',g='';
  ticks(max,4).forEach(t=>{const y=Y(t);g+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="${gridColor()}"/><text x="${pl-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${axisColor()}">${o.fmtAxis?o.fmtAxis(t):nf(t)}</text>`;});
  rows.forEach((r,i)=>{
    const col=r.v>=0?'var(--emerald)':'var(--oxblood)';
    const y0=Y(r.start),y1=Y(r.end);const top=Math.min(y0,y1),hh=Math.abs(y1-y0);
    s+=`<rect x="${(X(i)-14).toFixed(1)}" y="${top.toFixed(1)}" width="28" height="${Math.max(2,hh).toFixed(1)}" rx="3" fill="${col}" opacity=".9" data-tt="${esc('<b>'+r.l+'</b>'+ttRow(o.metric||'Delta',(r.v>=0?'+':'')+(o.fmt?o.fmt(r.v):nf(r.v))))}"/>`;
    if(i<rows.length-1)s+=`<line x1="${X(i)+14}" y1="${Y(r.end).toFixed(1)}" x2="${X(i+1)-14}" y2="${Y(r.end).toFixed(1)}" stroke="rgba(216,178,94,.35)" stroke-dasharray="3,3"/>`;
    s+=`<text x="${X(i).toFixed(1)}" y="${h-24}" text-anchor="middle" font-size="8.6" fill="${axisColor()}">${esc(r.l)}</text>`;
    s+=`<text x="${X(i).toFixed(1)}" y="${h-12}" text-anchor="middle" font-size="9" fill="${r.v>=0?'#7FD3B0':'#E8847A'}" font-family="JetBrains Mono,monospace">${r.v>=0?'+':''}${o.fmt?o.fmt(r.v):nf(r.v)}</text>`;});
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${g}${s}</svg>`;
}

/* ── DONUT ───────────────────────────────────────────────────────────── */
function donut(data,o={}){
  const size=o.size||168,r=o.r||62,sw=o.sw||20,cx=size/2,cy=size/2,C=2*Math.PI*r;
  const total=sum(data,d=>d.v)||1;let off=0,s='';
  data.forEach(d=>{
    const frac=d.v/total,len=frac*C;
    s+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.c}" stroke-width="${sw}" stroke-dasharray="${(len-1.6).toFixed(2)} ${(C-len+1.6).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" data-tt="${esc('<b>'+d.l+'</b>'+ttRow(o.metric||'Share',(o.fmt?o.fmt(d.v):nf(d.v))+' · '+(frac*100).toFixed(1)+'%'))}"/>`;
    off+=len;});
  return `<div style="display:flex;justify-content:center"><svg viewBox="0 0 ${size} ${size}" style="width:${o.px||'100%'};max-width:${size}px;height:auto">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.045)" stroke-width="${sw}"/>${s}
    <text x="${cx}" y="${cy-3}" text-anchor="middle" font-size="${o.big||15}" font-family="JetBrains Mono,monospace" fill="#F6F1E7">${o.center||''}</text>
    <text x="${cx}" y="${cy+12}" text-anchor="middle" font-size="8.4" fill="${axisColor()}" letter-spacing="1">${(o.sub||'').toUpperCase()}</text></svg></div>`;
}

/* ── SCATTER / QUADRANT ─────────────────────────────────────────────── */
function scatter(pts,o={}){
  const w=o.w||640,h=o.h||330,pl=54,pr=18,pt=16,pb=40;
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),rs=pts.map(p=>p.r||6);
  const xmin=o.xmin??Math.min(...xs)*.9,xmax=o.xmax??Math.max(...xs)*1.06;
  const ymin=o.ymin??0,ymax=o.ymax??Math.max(...ys)*1.08;
  const xsc=o.xsqrt?function(v){return Math.sqrt(Math.max(0,v));}:function(v){return v;};
  const X=v=>pl+(w-pl-pr)*(xsc(v)-xsc(xmin))/((xsc(xmax)-xsc(xmin))||1),Y=v=>pt+(h-pt-pb)*(1-(v-ymin)/(ymax-ymin||1));
  const rr=Math.max(...rs),rscale=v=>4+13*Math.sqrt(v/rr);
  let g='';
  ticks(ymax,4).forEach(t=>{const y=Y(t);g+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w-pr}" y2="${y.toFixed(1)}" stroke="${gridColor()}"/><text x="${pl-7}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="8.8" fill="${axisColor()}">${o.yfmt?o.yfmt(t):nf(t)}</text>`;});
  const xticks=o.xsqrt?[0,.0625,.25,.5625,1].map(f=>xmax*f):ticks(xmax,4);
  xticks.forEach(t=>{const x=X(t);if(x<pl)return;g+=`<line x1="${x.toFixed(1)}" y1="${pt}" x2="${x.toFixed(1)}" y2="${h-pb}" stroke="${gridColor(.5)}"/><text x="${x.toFixed(1)}" y="${h-16}" text-anchor="middle" font-size="8.8" fill="${axisColor()}">${o.xfmt?o.xfmt(t):nf(t)}</text>`;});
  if(o.xlab)g+=`<text x="${(pl+(w-pl-pr)/2).toFixed(1)}" y="${h-3}" text-anchor="middle" font-size="9.4" fill="${axisColor()}">${esc(o.xlab)}</text>`;
  if(o.ylab)g+=`<text x="12" y="${pt+8}" font-size="9.4" fill="${axisColor()}">${esc(o.ylab)}</text>`;
  if(o.qx!=null)g+=`<line x1="${X(o.qx).toFixed(1)}" y1="${pt}" x2="${X(o.qx).toFixed(1)}" y2="${h-pb}" stroke="rgba(216,178,94,.3)" stroke-dasharray="4,4"/>`;
  if(o.qy!=null)g+=`<line x1="${pl}" y1="${Y(o.qy).toFixed(1)}" x2="${w-pr}" y2="${Y(o.qy).toFixed(1)}" stroke="rgba(216,178,94,.3)" stroke-dasharray="4,4"/>`;
  if(o.quadLabels)(o.quadLabels||[]).forEach(q=>{g+=`<text x="${X(q.x).toFixed(1)}" y="${Y(q.y).toFixed(1)}" font-size="9" fill="${q.c}" opacity=".55" text-anchor="middle">${esc(q.l)}</text>`;});
  let s='';
  pts.forEach(p=>{
    const d=p.open?`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${rscale(p.r||6).toFixed(1)}" fill="none" stroke="${p.c||'var(--gold)'}`+'"'+` stroke-width="1.4" opacity=".85"/>`
      :`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${rscale(p.r||6).toFixed(1)}" fill="${p.c||'var(--gold)'}" opacity=".62" stroke="${p.c||'var(--gold)'}" stroke-width="1"/>`;
    s+=d.replace('/>',` data-tt="${esc('<b>'+p.n+'</b>'+(p.tt||''))}" />`);
    if(p.label)s+=`<text x="${X(p.x).toFixed(1)}" y="${(Y(p.y)-rscale(p.r||6)-4).toFixed(1)}" text-anchor="middle" font-size="8.6" fill="#C6B9A6">${esc(p.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${g}${s}</svg>`;
}

/* ── HEAT GRID (dow × hour, cohort, RFM) ────────────────────────────── */
function heatGrid(matrix,o={}){
  /* matrix: rows[] of {label, cells:[{v,tt}]}, o.colors:[low,mid,high] */
  const cols=o.cols||[], rows=matrix, cw=o.cw||((o.w||620)-46)/Math.max(1,cols.length), ch=o.ch||20;
  const w=o.w||620,h=(rows.length+1)*ch+14,pl=46;
  const all=rows.flatMap(r=>r.cells.map(c=>c.v)).filter(v=>v!=null);
  const max=Math.max(...all,1),min=Math.min(...all,0);
  const col=v=>{const t=(v-min)/(max-min||1);
    const stops=o.stops||[[0,'rgba(216,178,94,.06)'],[.45,'rgba(216,178,94,.35)'],[.72,'rgba(216,178,94,.62)'],[1,'rgba(178,58,50,.92)']];
    for(let i=1;i<stops.length;i++){if(t<=stops[i][0]){const a=stops[i-1],b=stops[i];const k=(t-a[0])/(b[0]-a[0]||1);
      return o.blend?(o.blend(a[1],b[1],k)):mixColor(a[1],b[1],k);}}
    return stops[stops.length-1][1];};
  let s='';
  cols.forEach((c,i)=>s+=`<text x="${(pl+cw*i+cw/2).toFixed(1)}" y="10" text-anchor="middle" font-size="8.4" fill="${axisColor()}">${esc(c)}</text>`);
  rows.forEach((r,ri)=>{
    s+=`<text x="${pl-7}" y="${(14+ch*ri+ch*.68).toFixed(1)}" text-anchor="end" font-size="8.8" fill="${r.hi?'#D8B25E':axisColor()}">${esc(r.label)}</text>`;
    r.cells.forEach((c,ci)=>{
      const v=c.v==null?null:c.v;
      s+=`<rect x="${(pl+cw*ci+1).toFixed(1)}" y="${(13+ch*ri+1).toFixed(1)}" width="${(cw-2).toFixed(1)}" height="${ch-2}" rx="2.5" fill="${v==null?'rgba(255,255,255,.03)':col(v)}" data-tt="${esc(c.tt||(r.label+' '+cols[ci]+' · '+nf(v)))}"/>`;});
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${s}</svg>`;
}
function parseRGBA(s){const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return [216,178,94,1];const p=m[1].split(',').map(x=>parseFloat(x));return [p[0],p[1],p[2],p[3]==null?1:p[3]];}
function mixColor(a,b,k){const A=parseRGBA(a),B=parseRGBA(b);return `rgba(${Math.round(A[0]+(B[0]-A[0])*k)},${Math.round(A[1]+(B[1]-A[1])*k)},${Math.round(A[2]+(B[2]-A[2])*k)},${(A[3]+(B[3]-A[3])*k).toFixed(3)})`;}

/* ── GAUGE ──────────────────────────────────────────────────────────── */
function gauge(v,o={}){
  const size=o.size||150,r=54,sw=13,cx=size/2,cy=size/2+8;
  const frac=clamp(v/(o.max||100),0,1), startA=-Math.PI*.75, endA=Math.PI*.75;
  const a=startA+(endA-startA)*frac;
  const P=(ang,rad)=>[cx+Math.cos(ang)*rad,cy+Math.sin(ang)*rad];
  const arc=(a1,a2,rad)=>{const [x1,y1]=P(a1,rad),[x2,y2]=P(a2,rad);const large=(a2-a1)>Math.PI?1:0;
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${rad},${rad} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;};
  return `<div class="gauge-wrap"><svg viewBox="0 0 ${size} ${size*.86}" style="width:${o.px||140}px;height:auto">
    <path d="${arc(startA,endA,r)}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${sw}" stroke-linecap="round"/>
    <path d="${arc(startA,a,r)}" fill="none" stroke="${o.color||'var(--gold)'}" stroke-width="${sw}" stroke-linecap="round" data-tt="${esc(o.tt||'')}"/>
    <text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="20" font-family="JetBrains Mono,monospace" fill="#F6F1E7">${o.label||nf(v,1)+(o.unit||'')}</text>
    <text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="8.2" fill="${axisColor()}" letter-spacing="1">${(o.sub||'').toUpperCase()}</text></svg></div>`;
}
/* ── SPARKLINE ──────────────────────────────────────────────────────── */
function sparkline(data,o={}){
  const w=o.w||92,h=o.h||26,mx=Math.max(...data),mn=Math.min(...data);
  const X=i=>i*(w-2)/(data.length-1||1)+1, Y=v=>h-2-(h-4)*((v-mn)/((mx-mn)||1));
  const d='M'+data.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join('L');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px"><path d="${d}" fill="none" stroke="${o.color||'var(--gold)'}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${X(data.length-1).toFixed(1)}" cy="${Y(data[data.length-1]).toFixed(1)}" r="2" fill="${o.color||'var(--gold)'}"/></svg>`;
}
/* ── HISTOGRAM ──────────────────────────────────────────────────────── */
function histogram(vals,o={}){
  const bins=o.bins||10,mx=Math.max(...vals),mn=Math.min(...vals),bw=(mx-mn)/bins||1;
  const counts=Array(bins).fill(0);vals.forEach(v=>counts[clamp(Math.floor((v-mn)/bw),0,bins-1)]++);
  return barChart(counts.map((c,i)=>({l:(mn+bw*i).toFixed(o.dp??0)+'–'+(mn+bw*(i+1)).toFixed(o.dp??0),v:c,c:o.color||'var(--plum)',
    tt:ttRow('Range',(mn+bw*i).toFixed(o.dp??0)+'–'+(mn+bw*(i+1)).toFixed(o.dp??0))+ttRow('Records',nf(c))})),{w:o.w||600,h:o.h||180,metric:'Records',fmtAxis:nf});
}
/* ── BULLET / PROGRESS ROWS ─────────────────────────────────────────── */
function bulletRows(rows,o={}){
  return `<div>${rows.map(r=>`<div class="row-i">
    <div class="g"><b>${esc(r.l)}</b>${r.s?`<span>${esc(r.s)}</span>`:''}</div>
    <div class="bar" style="width:${o.bw||120}px"><i style="width:${clamp(r.p,0,100).toFixed(1)}%;background:${r.c||'var(--gold)'}"></i></div>
    <div class="mono" style="width:${o.vw||62}px;text-align:right;font-size:11px;color:${r.c||'var(--gold)'}">${esc(r.v)}</div></div>`).join('')}</div>`;
}
/* ── NETWORK (basket graph) ─────────────────────────────────────────── */
function basketGraph(pairs,o={}){
  const w=o.w||640,h=o.h||300,cx=w/2,cy=h/2;
  const nodes=[];const seen={};
  pairs.slice(0,8).forEach(p=>{[p.a,p.b].forEach(n=>{if(!seen[n]){seen[n]=(nodes.push({n,c:1})&&0)||0;}else{}});});
  const uniq=Object.keys(seen);
  uniq.forEach((n,i)=>{const a=(i/uniq.length)*Math.PI*2-Math.PI/2;seen[n]={x:cx+Math.cos(a)*w*.31,y:cy+Math.sin(a)*h*.33};});
  let s='';
  pairs.slice(0,8).forEach(p=>{const A=seen[p.a],B=seen[p.b];if(!A||!B)return;
    s+=`<line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" stroke="var(--gold)" stroke-width="${clamp(p.lift*.9,1,5).toFixed(1)}" opacity="${clamp(p.conf/50,.15,.7).toFixed(2)}" data-tt="${esc('<b>'+p.a+' + '+p.b+'</b>'+ttRow('Lift',nf(p.lift,2))+ttRow('Confidence',nf(p.conf,1)+'%')+ttRow('Support',nf(p.sup,2)+'%'))}"/>`;});
  uniq.forEach((n,i)=>{const P=seen[n];
    s+=`<circle cx="${P.x.toFixed(1)}" cy="${P.y.toFixed(1)}" r="7" fill="#1B1714" stroke="var(--gold)" stroke-width="1.6"/>
        <text x="${P.x.toFixed(1)}" y="${(P.y-11).toFixed(1)}" text-anchor="middle" font-size="8.6" fill="#C6B9A6">${esc(n.length>17?n.slice(0,16)+'…':n)}</text>`;});
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${s}</svg>`;
}
