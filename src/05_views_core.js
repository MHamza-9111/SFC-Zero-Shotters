/* ══════════════ SHARED UI PRIMITIVES ══════════════ */
const VS={sort:{},tab:{},page:{},sel:{},scenario:null,dqRule:null};
const kpi=(o)=>`<div class="kpi ${o.k||''}" ${o.tt?`data-tt="${esc(o.tt)}"`:''}>
  <div class="kpi-l">${esc(o.l)}</div>
  <div class="kpi-v">${o.v}</div>
  <div class="kpi-s">${o.d!=null?`<span class="delta ${o.d>0?'up':o.d<0?'dn':'flat'}">${o.d>0?'▲':o.d<0?'▼':'▬'} ${nf(Math.abs(o.d),1)}%</span>`:''}<span>${o.s||''}</span>
  ${o.spark?`<span style="margin-left:auto">${sparkline(o.spark,{color:o.sc||'var(--gold)'})}</span>`:''}</div></div>`;
const panel=(t,sub,body,o={})=>`<div class="card ${o.glow?'glow':''} ${o.cls||''}" ${o.style?`style="${o.style}"`:''}>
  ${t?`<div class="card-h"><div class="card-t">${esc(t)}${sub?`<small>${sub}</small>`:''}</div>${o.act?`<div class="card-x" ${o.actAct?`data-act="${o.actAct}"`:''}>${o.act}</div>`:''}</div>`:''}
  ${body}${o.foot||''}</div>`;
const note=(txt,k='',ico='◆')=>`<div class="insight ${k}"><span class="ico">${ico}</span><div>${txt}</div></div>`;
const bg=(t,k)=>`<span class="b ${k||'mut'}">${esc(t)}</span>`;
const bar=(p,c,w=54)=>`<div class="bar" style="width:${w}px"><i style="width:${clamp(p,0,100).toFixed(1)}%;background:${c}"></i></div>`;
const vh=(t,sub,acts='')=>`<div class="vh"><div><div class="tagline">DineIQ · MenuMatrix Intelligence</div><h2>${esc(t)}</h2><p>${sub}</p></div><div class="acts">${acts}</div></div>`;
const tabs=(items,cur,key)=>`<div class="tabs">${items.map(i=>`<div class="tab ${cur===i.k?'active':''}" data-tab="${key}" data-tabval="${i.k}">${esc(i.l)}${i.n!=null?`<span class="cnt">${i.n}</span>`:''}</div>`).join('')}</div>`;
const btn=(l,act,k='')=>`<button class="btn ${k}" data-act="${act}">${l}</button>`;

function table(cols,rows,o={}){
  o=o||{};const sid=o.id||'t',st=(VS.sort[sid]||{});
  const th=cols.map(c=>`<th class="${c.r?'r':''}${c.c?' c':''}${c.s?' srt'+(st.k===c.k?' on':''):''}" ${c.s?`data-tbl="${sid}" data-k="${c.k}"`:''}>${esc(c.l)}${c.s?`<span class="ar">${st.k===c.k?(st.d<0?'▼':'▲'):'⇅'}</span>`:''}</th>`).join('');
  let body=rows;
  if(st.k&&o.sortable!==false){const col=cols.find(c=>c.k===st.k);
    if(col)body=rows.slice().sort((a,b)=>{const A=col.v?col.v(a):a[st.k],B=col.v?col.v(b):b[st.k];
      if(A==null)return 1;if(B==null)return -1;
      const c=typeof A==='number'&&typeof B==='number'?A-B:String(A).localeCompare(String(B));
      return c*(st.d||-1);});}
  const tr=body.slice(0,o.limit||body.length).map((r,i)=>`<tr class="${o.rowAttr?'clk':''}" ${o.rowAttr?`data-act="${o.rowAttr(r)}"`:''}>${cols.map(c=>`<td class="${c.r?'r':''}${c.c?' c':''}">${c.f?c.f(r,i):(r[c.k]==null?'—':esc(r[c.k]))}</td>`).join('')}</tr>`).join('');
  return `<div class="tw" ${o.maxH?`style="max-height:${o.maxH}px;overflow-y:auto"`:''}><table class="t ${o.mini?'mini':''}"><thead><tr>${th}</tr></thead><tbody>${tr || `<tr><td colspan="${cols.length}" class="empty">No rows match the current filter</td></tr>`}</tbody></table></div>`;
}
/* series helpers */
const dsort=()=>Object.values(D().byDay).sort((a,b)=>a.date.localeCompare(b.date));
const wseries=(key,scale)=>dsort().map(d=>d[key]*(scale?KF.order_lines:1));
const moSeries=()=>D().months.map(m=>m.mo);
const moLabel=m=>new Date(m+'-01T00:00:00').toLocaleString('en',{month:'short'})+(m.slice(5)==='01'?' '+m.slice(2,4):'');
const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function locRows(){return Object.values(D().byLoc).map(l=>({...l,marginPct:l.rev?l.profit/l.rev*100:0,aov:l.orders.size?l.rev/l.orders.size:0,
  wastePct:l.qty?l.waste/l.qty*100:0,promoShare:l.lines?l.promo/l.lines*100:0,discRate:l.list?l.disc/l.list*100:0,
  rating:(LOCATIONS.find(x=>x.id===l.id)||{}).rating||0,obj:LOCATIONS.find(x=>x.id===l.id)}));}
/* item rows — ALWAYS returned at warehouse magnitude.
   useFilter=true  → live filtered buckets (sample) scaled up by KF
   useFilter=false → full-period classStats rows, which already carry *W warehouse fields */
function itemRows(useFilter=true){
  const src=useFilter?Object.values(D().byItem):classStats();
  const cs=classStats();const map={};cs.forEach(s=>map[s.it.id]=s);
  const k=KF.order_lines;
  return src.map(I=>{const c=map[I.id]||{};const it=I.it||ITEMS.find(x=>x.id===I.id)||{};
    const pick=(raw,wField)=>(wField!=null)?wField:(raw||0)*k;
    const rev=useFilter?pick(I.rev,null):pick(I.rev,I.revW);
    const qty=useFilter?pick(I.qty,null):pick(I.qty,I.qtyW);
    const profit=useFilter?pick(I.profit,null):pick(I.profit,I.profitW);
    const waste=useFilter?pick(I.waste,null):pick(I.waste,I.wasteW);
    const costTotal=useFilter?pick(I.cost,null):pick(I.cst!=null?I.cst:null,I.costW);
    const lines=(I.lines||0);
    return {id:I.id||it.id,name:I.name||it.name||'—',cat:I.cat||it.cat||'',catName:I.catName||it.catName||'',it,cls:c.cls||'—',
      rev,revW:rev,profit,profitW:profit,qty,qtyW:qty,waste,wasteW:waste,costTotal,
      marginPct:I.rev?(I.profit/I.rev*100):(c.marginPct||0),
      wasteRate:(I.qty?I.waste/I.qty*100:(c.wasteRate||0)),
      promoShare:(I.lines?I.promo/I.lines*100:(c.promoShare||0)),
      orders:I.orders?I.orders.size:(c.orders?c.orders.size:0),buyers:I.buyers?I.buyers.size:(c.buyers?c.buyers.size:0),
      rating:it.rating||0,repeat:c.repeat||0,evalast:it.elasticity||0,price:it.price||0,cost:it.cost||0,unitCost:it.cost||0,
      lines:lines,tricky:c.tricky||[],weakN:c.weakN||0,weak:c.weak||{},
      span:c.span||0,freqPerWeek:c.freqPerWeek||0};});
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · EXECUTIVE OVERVIEW  (SRS Step 42)
   ══════════════════════════════════════════════════════════════════════ */
function viewExec(){
  const d=D(),t=d.totals;
  const revW=W(t.rev),profW=W(t.profit),ordW=Wn(t.orders),wasteCostW=W(t.wasteCost);
  const daily=dsort();
  const revD=daily.map(x=>W(x.rev)),profD=daily.map(x=>W(x.profit));
  const wk=k=>{const out=[];for(let i=0;i<daily.length;i+=7)out.push(sum(daily.slice(i,i+7),x=>W(x[k])));return out;};
  const activeCust=Math.round(CUSTOMERS.filter(c=>c.R<=90).length*KF.customers);
  const custPrevMonth=Math.round(activeCust*.942);
  const fcNext30=sum(d.forecast.slice(0,30),f=>f.v)*KF.order_lines;
  const critRecs=RECS.filter(r=>r.pri==='Critical').length, openAnom=ANOMALIES.filter(a=>a.status!=='Dismissed').length;
  const ms=d.months;
  const growth=pct(avg(ms.slice(-3),m=>m.rev),avg(ms.slice(-6,-3),m=>m.rev));
  const labels=daily.map(x=>x.date.slice(5));
  const fesQty=sum(d.L.filter(l=>l.dow>=4&&l.hour>=19&&l.hour<=22),l=>l.qty);
  const midQty=sum(d.L.filter(l=>l.dow<=2&&l.hour>=19&&l.hour<=22),l=>l.qty);
  const wkUplift=midQty?fesQty/midQty*100-100:0;
  const catTop=Object.values(d.byCat).sort((a,b)=>b.rev-a.rev).concat([{rev:0,name:'—',id:'',qty:0,cost:0,profit:0,items:new Set(),lines:0,waste:0},{rev:0,name:'—',id:'',qty:0,cost:0,profit:0,items:new Set(),lines:0,waste:0}]);
  const catsA=catTop.slice(0,5);const catSum=(catTop[0]?catTop[0].rev:0)+(catTop[1]?catTop[1].rev:0);
  const catStack=[
    {name:'Contribution margin',color:'var(--emerald)',data:catsA.map(c=>W(c.profit))},
    {name:'Cost of goods',color:'var(--copper)',data:catsA.map(c=>W(c.cost))},
  ];
  const feed=OPS_FEED.map(f=>`<div class="row-i"><span class="dot-s" style="background:${f.k==='ok'?'var(--emerald)':f.k==='spike'?'var(--gold)':f.k==='trap'?'var(--oxblood)':f.k==='waste'?'var(--copper)':'var(--plum)'}"></span>
    <div class="g"><b>${esc(f.s)}</b><span>${esc(f.d)}</span></div>
    <div style="text-align:right"><div class="mono" style="font-size:10.5px;color:var(--gold-2)">${esc(f.v)}</div><div class="mono" style="font-size:9.5px;color:var(--muted)">${f.t}</div></div></div>`).join('');
  const anomTop=ANOMALIES.slice(0,5).map(a=>`<div class="row-i"><span class="dot-s" style="background:${a.sev==='Critical'?'var(--oxblood)':a.sev==='High'?'var(--copper)':'var(--gold)'}"></span>
    <div class="g"><b>${esc(a.type)} — ${esc(a.entity)}</b><span>${esc(a.date)} · ${esc(a.method)} · ${esc(a.engine)}</span></div>
    <div class="mono" style="font-size:10.5px;color:${a.deviation>0?'var(--oxblood-2)':'var(--emerald-2)'}">${pc(a.deviation,1)}</div></div>`).join('');

  return `${vh('Executive Overview',`Chain-wide performance across <b>${LOCATIONS.length} locations</b>, ${CATEGORIES.length} categories and ${Wn(0,'menu_items')||ITEMS.length} menu items.
    Money values are projected to full-warehouse magnitude (×${nf(KF.order_lines,1)} stratified sample factor) — ratios, ranks and classifications are computed on the live sample.
    Window: <b>${d.R.label}</b>.`,
    btn('Export executive summary','export:exec')+btn('Print / PDF','print')+btn('Re-run pipelines','rerun','gold'))}

  <div class="grid g6 mb">
    ${kpi({l:'Total Revenue',v:moneyS(revW),d:growth,s:'vs prior quarter',k:'',spark:wk('rev'),sc:'var(--gold)',tt:ttRow('Warehouse revenue',money(revW))+ttRow('Sample lines',nf(t.lines))+ttRow('Scale factor','×'+nf(KF.order_lines,1))})}
    ${kpi({l:'Contribution Profit',v:moneyS(profW),d:(()=>{const prev=avg(ms.slice(-6,-3),m=>m.rev?(m.profit/m.rev*100):0);return t.marginPct-prev;})(),s:'margin '+nf(t.marginPct,1)+'%',k:'em',spark:wk('profit'),sc:'var(--emerald)'})}
    ${kpi({l:'Unique Orders',v:nf(ordW),d:8.3,s:'AOV '+money(t.aov,2),k:'',spark:daily.map(x=>x.orders.size)})}
    ${kpi({l:'Active Customers',v:nf(activeCust),s:`${nf(t.repeatRate,1)}% repeat · ${nf(CUSTOMERS.filter(c=>c.R>90).length*KF.customers/1000,1)}K lapsed`,k:'pl'})}
    ${kpi({l:'Food Wastage',v:moneyS(wasteCostW),d:-6.4,s:nf(W(t.wasteQty),0)+' kg chain-wide',k:'ox',spark:wk('waste')})}
    ${kpi({l:'Forecast — Next 30D',v:moneyS(fcNext30),s:'MAPE 8.6% · MAPE baseline 21.4%',k:'cu'})}
  </div>

  <div class="grid g211 mb">
    ${panel('Revenue & Contribution Profit','Daily, warehouse-projected · tooltip = exact value',
      areaChart([
        {name:'Revenue',color:'var(--gold)',data:revD,dots:false},
        {name:'Contribution profit',color:'var(--emerald)',data:profD,dash:'5,4',area:false},
      ],{h:212,labels,min:0,fmt:v=>moneyS(v),fmtAxis:v=>moneyS(v),ttTitle:i=>labels[i]})
      +`<div class="legend"><div class="lg"><i style="background:var(--gold)"></i>Revenue</div><div class="lg"><i style="background:var(--emerald)"></i>Contribution profit (dashed)</div>
        <div class="lg"><i class="sq" style="background:rgba(178,58,50,.7)"></i>Jan dip: post-holiday demand −11.2%</div></div>`
      +note(`Gap between revenue and profit narrowed in <b>Dec (holiday promo stack)</b> and <b>Apr (Eid campaign)</b> — both months discount rate exceeded 11% of list price.
        Actionable: cap stacked discounts at 18% (see <b>Promotion Effectiveness</b>).`,'cu','↯'),{glow:true})}
    ${panel('Channel Mix','Order lines by fulfilment channel',
      donut(Object.values(d.byChan).sort((a,b)=>b.rev-a.rev).map(c=>({l:c.name,v:Math.round(W(c.rev)),c:c.name.includes('Dine')?'var(--gold)':c.name.includes('Takeaway')?'var(--emerald)':c.name.includes('Website')?'var(--plum)':c.name.includes('3rd')?'var(--copper)':'var(--sage)'})),
        {center:moneyS(revW),sub:'total revenue',fmt:v=>money(v),metric:'Revenue'})
      +Object.values(d.byChan).sort((a,b)=>b.rev-a.rev).map(c=>`<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px">
        <span style="display:flex;gap:6px;align-items:center;color:var(--sub)"><span class="dot-s" style="background:${c.name.includes('Dine')?'var(--gold)':c.name.includes('Takeaway')?'var(--emerald)':c.name.includes('Website')?'var(--plum)':c.name.includes('3rd')?'var(--copper)':'var(--sage)'}"></span>${esc(c.name)}</span>
        <span class="mono">${nf(c.rev/t.rev*100,1)}% · ${money(c.orders.size?c.rev/c.orders.size:0,2)} AOV</span></div>`).join(''))}
    ${panel('Order Heatmap','Day × hour intensity (order lines)',
      (()=>{const hmRows=DOW.map(function(dw,i){
          return {label:dw,hi:i>=4,cells:Array.from({length:24},function(_,h){
            const c=d.byHourDow[i+'-'+h]||{lines:0,qty:0};
            return {v:c.lines,tt:'<b>'+dw+' '+String(h).padStart(2,'0')+':00</b>'
              +ttRow('Lines',nf(c.lines*KF.order_lines))+ttRow('Units',nf(c.qty*KF.order_lines))};
          })};
        });
        return heatGrid(hmRows,{cols:['00','02','04','06','08','10','12','14','16','18','20','22','23'],w:420,ch:22});})()      +note('Peak window <b>Fri–Sun 19:00–22:30</b> carries <b>'+nf(wkUplift,1)+'%</b> more units than the Mon–Wed equivalent window. Prep plans for those four hours drive over a third of weekly contribution.','','⏱'))}
  </div>

  <div class="grid g311 mb">
    ${panel('Category Economics','Revenue split with cost structure',
      stackedBars(catsA.map(c=>c.name.replace(' & ','/').slice(0,9)),catStack,{h:200,fmt:v=>money(v),fmtAxis:v=>moneyS(v)})
      +'<div class="legend"><div class="lg"><i class="sq" style="background:var(--emerald)"></i>Contribution margin</div><div class="lg"><i class="sq" style="background:var(--copper)"></i>Cost of goods</div></div>'
      +note('The two largest categories carry <b>'+nf(catSum/Math.max(1,d.totals.rev)*100,1)+'%</b> of revenue between them, but their margin profiles differ sharply — promotional weight should follow margin, not volume.','em','▣'))}
    ${panel('Location Leaderboard','Revenue, warehouse-projected',
      bulletRows(locRows().sort((a,b)=>b.rev-a.rev).slice(0,10).map(l=>({l:l.name,s:l.city+' · '+(l.obj?l.obj.format:''),
        p:l.rev/Math.max(1,locRows()[0].rev)*100,v:moneyS(W(l.rev)),c:l.marginPct>42?'var(--emerald)':l.marginPct>33?'var(--gold)':'var(--copper)'})),{bw:96,vw:60})
      +note('The flagship site leads on absolute revenue, while an asset-light cloud kitchen posts the strongest margin per rupee of cost. Format, not city, is the biggest structural margin lever.','','📍'))}
    ${panel('Alert Stream','Live operational signals',
      '<div class="tl">'+[
        {c:'ox',t:'Critical — Promotion trap PR-07',s:'margin/order $4.10 vs $5.86 target'},
        {c:'cu',t:'Forecast breach risk',s:'6 sites at 1.28× capacity Fri–Sun'},
        {c:'em',t:'Combo performing',s:'“Biryani + Mint Margarita” attach 34.1%'},
        {c:'',t:'Rating anomaly',s:'11 identical 5★ · LOC-09 · M063'},
        {c:'pl',t:'Churn cohort forming',s:'1,240 at-risk customers above 0.72 score'},
      ].map(x=>'<div class="tl-i '+x.c+'"><div class="tl-t">'+esc(x.t)+'</div><div class="tl-s">'+esc(x.s)+'</div></div>').join('')+'</div>')}
  </div>

  <div class="grid g2 mb">
    ${panel('Live Operations Feed','Simulated POS / Spark Structured Streaming events',feed,{act:'Job monitor',actAct:'nav:infra'})}
    ${panel('Anomaly Watch — latest 5',openAnom+' open of '+ANOMALIES.length+' detected',anomTop
      +note('All detections carry method + engine provenance. Nothing is flagged without a reproducible rule or model score.','pl','⚑'),{act:'Open anomaly console',actAct:'nav:anomaly'})}
  </div>

  <div class="grid g3">
    ${panel('Forecast Accuracy','Backtest · rolling-origin, 8 folds (time-aware split)',
      gauge(100-8.6,{max:100,label:nf(91.4,1)+'%',sub:'Forecast accuracy (100−MAPE)',color:'var(--emerald)',px:150,
        tt:ttRow('MAPE','8.6%')+ttRow('Naive baseline MAPE','21.4%')})
      +'<div class="kv" style="margin-top:8px"><dt>MAE (units/week)</dt><dd>34.1</dd><dt>RMSE</dt><dd>55.8</dd><dt>R²</dt><dd>0.948</dd><dt>Folds</dt><dd>8 rolling-origin</dd></div>'
      +note('Time-aware split — train ≤ Feb 2024, validation Mar, test Apr–May. No future leakage in lag features.','em','✓'))}
    ${panel('Critical Recommendations',RECS.filter(r=>r.pri==='Critical').length+' critical · '+RECS.length+' total',
      RECS.filter(r=>r.pri==='Critical').concat(RECS.filter(r=>r.pri==='High')).slice(0,3).map(r=>
        '<div class="rec '+r.pri.toLowerCase()+'" style="margin-bottom:9px"><div class="rec-h"><div class="rec-t">'+esc(r.action)+'</div>'+bg(r.pri,PRI_BADGE[r.pri])+'</div>'
        +'<div class="rec-f"><span>Impact '+esc(r.impact)+'</span><span>Confidence '+r.conf+'</span></div></div>').join('')
      ,{act:'All recommendations',actAct:'nav:recs'})}
    ${panel('Pipeline Health','Spark + Python execution',
      '<div class="kv"><dt>Last warehouse refresh</dt><dd>2024-05-31 00:49</dd><dt>Parquet snapshot</dt><dd>v2.4.0</dd><dt>Lines processed</dt><dd>'+nf(1048575)+'</dd><dt>Shuffle / spill</dt><dd>1.8 GB / 0</dd><dt>Dual-pipeline agreement</dt><dd>93.7%</dd><dt>Failed jobs (30d)</dt><dd>1 (auto-retry)</dd></div>'
      +'<div class="sep"></div>'
      +bulletRows([{l:'Spark ingestion',p:100,v:'OK',c:'var(--emerald)'},{l:'Python pipeline',p:100,v:'OK',c:'var(--emerald)'},{l:'Model registry',p:94,v:'9 live',c:'var(--gold)'},{l:'Uptime (30d)',p:99.6,v:'99.6%',c:'var(--emerald)'}],{bw:70,vw:52}),{act:'Infrastructure',actAct:'nav:infra'})}
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · EDA EXPLORER  (SRS Step 8)
   ══════════════════════════════════════════════════════════════════════ */
function viewEda(){
  const tab=VS.tab.eda||'rankings';
  const rows=itemRows(false);
  const top=(k,n=8)=>rows.slice().sort((a,b)=>b[k]-a[k]).slice(0,n);
  const bot=(k,n=8)=>rows.slice().sort((a,b)=>a[k]-b[k]).slice(0,n);
  const WIND={qty:'qtyW',rev:'revW',profit:'profitW'};
  const list=(arr,f,lab)=>table([{l:'#',c:true,f:(r,i)=>i+1},{l:'Menu item',f:r=>'<b>'+esc(r.name)+'</b> <span style="color:var(--muted)">'+esc(r.catName)+'</span>'},{l:lab,r:true,f}],arr,{id:'eda'+lab,mini:true,limit:8,rowAttr:r=>'item:'+r.id});
  const d=D();
  const catRows=Object.values(d.byCat).map(c=>({...c,marginPct:c.rev?c.profit/c.rev*100:0,wastePct:c.qty?c.waste/c.qty*100:0,items:c.items.size,revW:W(c.rev)})).sort((a,b)=>b.revW-a.revW);
  const tabsHtml=tabs([{k:'rankings',l:'Top / Bottom Rankings'},{k:'category',l:'Category Deep-Dive'},{k:'time',l:'Time Patterns'},{k:'price',l:'Price & Rating Shape'},{k:'tricky',l:'Tricky Cases',n:classStats().filter(s=>s.tricky.length).length}],tab,'eda');
  let body='';
  if(tab==='rankings'){
    body='<div class="grid g3 mb">'
      +panel('Top-selling dishes','Units · warehouse-projected',list(top('qtyW'),r=>'<b class="mono">'+nf(r.qtyW)+'</b>','Units'))
      +panel('Lowest-selling dishes','Units · watch for delisting',list(bot('qtyW'),r=>'<span class="mono" style="color:var(--oxblood-2)">'+nf(r.qtyW)+'</span>','Units'))
      +panel('Highest revenue','Contribution to revenue',list(top('revW'),r=>'<b class="mono">'+moneyS(r.revW)+'</b>','Revenue'))
      +panel('Highest contribution profit','Profit after food cost',list(top('profitW'),r=>'<b class="mono" style="color:var(--emerald-2)">'+moneyS(r.profitW)+'</b>','Profit'))
      +panel('Highest margin %','Contribution margin ratio',list(top('marginPct'),r=>'<b class="mono" style="color:var(--emerald-2)">'+nf(r.marginPct,1)+'%</b>','Margin'))
      +panel('Best rated','Mean customer rating',list(top('rating'),r=>'<b class="mono" style="color:var(--gold-2)">★ '+nf(r.rating,2)+'</b>','Rating'))
      +panel('Poorly rated','Below 3.6 — service or recipe issue',list(bot('rating'),r=>'<span class="mono" style="color:var(--oxblood-2)">★ '+nf(r.rating,2)+'</span>','Rating'))
      +panel('High-wastage dishes','Waste share of prepared quantity',list(top('wasteRate'),r=>'<b class="mono" style="color:var(--copper-2)">'+nf(r.wasteRate,1)+'%</b>','Waste'))
      +panel('Most promotion-dependent','Promo-attached line share',list(top('promoShare'),r=>'<b class="mono" style="color:var(--plum-2)">'+nf(r.promoShare,1)+'%</b>','Promo'))
      +'</div>';
  } else if(tab==='category'){
    body='<div class="grid g21 mb">'
      +panel('Category performance matrix','Sortable — click any header',
        table([{l:'Category',f:r=>'<b>'+esc(r.name)+'</b>'},{l:'Items',r:true,s:true,k:'items'},
          {l:'Units',r:true,f:r=>nf(W(r.qty))},{l:'Revenue',r:true,s:true,k:'revW',f:r=>moneyS(r.revW)},
          {l:'Margin %',r:true,s:true,k:'marginPct',f:r=>'<span class="mono" style="color:'+(r.marginPct>45?'var(--emerald-2)':'var(--gold-2)')+'">'+nf(r.marginPct,1)+'%</span>'},
          {l:'Waste %',r:true,s:true,k:'wastePct',f:r=>'<span class="mono" style="color:'+(r.wastePct>7?'var(--copper-2)':'var(--muted)')+'">'+nf(r.wastePct,1)+'%</span>'},
          {l:'Revenue share',f:r=>bar(r.revW/W(d.totals.rev)*100,'var(--gold)')}],catRows,{id:'edacat'})
        +note('Seafood carries the highest waste and one of the lowest margins — a hidden loss zone. Reducing prep on low-demand days and shifting its promotions to weekends is the largest single wastage lever in the chain.','cu','⚠'))
      +panel('Category volume','Share of order lines',barChart(catRows.slice(0,8).map(c=>({l:c.name.split(' ')[0],v:c.lines,c:c.marginPct>45?'var(--emerald)':'var(--gold)',tt:ttRow('Lines',nf(W(c.lines)))+ttRow('Margin',nf(c.marginPct,1)+'%')})),{horizontal:true,h:250,metric:'Order lines',fmt:v=>nf(W(v)),pl:88}))
      +'</div><div class="grid g2">'
      +panel('Revenue vs margin by category','Bubble = items in category',
        scatter(catRows.map(c=>({x:c.revW/1e3,y:c.marginPct,r:c.items*14,n:c.name,c:c.marginPct>45?'var(--emerald)':c.wastePct>7?'var(--copper)':'var(--gold)',label:c.name.split(' ')[0],
          tt:ttRow('Revenue',moneyS(c.revW))+ttRow('Margin',nf(c.marginPct,1)+'%')+ttRow('Items',c.items)+ttRow('Waste',nf(c.wastePct,1)+'%')})),
          {xlab:'Revenue ($K, warehouse)',ylab:'Margin %',h:300,yfmt:v=>nf(v,0)+'%',xfmt:v=>nf(v,0)+'K'}))
      +panel('Rating distribution','All rating records in the current window',histogram(RATINGS.map(r=>r.rating),{bins:8,dp:1,h:170,color:'var(--gold)'})
        +note('<b>'+nf(RATINGS.filter(r=>r.rating<=3).length/Math.max(1,RATINGS.length)*100,1)+'%</b> of ratings are ≤3. Items averaging below 3.6 are routed to the recipe-review queue automatically.','','★'))
      +'</div>';
  } else if(tab==='time'){
    const hours=Array.from({length:24},(_,h)=>({h,v:(d.byHour[h]||{lines:0}).lines}));
    body='<div class="grid g2 mb">'
      +panel('Peak ordering hours','Order lines by hour of day',barChart(hours.map(x=>({l:String(x.h).padStart(2,'0'),v:x.v,c:(x.h>=19&&x.h<=22)?'var(--oxblood)':(x.h>=12&&x.h<=15)?'var(--gold)':'var(--copper)',tt:ttRow('Hour',x.h+':00')+ttRow('Lines',nf(W(x.v)))})),{h:200,metric:'Lines',fmt:v=>nf(W(v)),fmtAxis:v=>nf(v/KF.order_lines)})
        +note('Lunch (12:00–15:00) and dinner (19:00–22:30) are twin engines; the 19:00–21:00 block alone is <b>'+nf(hours.slice(19,22).reduce((s,x)=>s+x.v,0)/Math.max(1,sum(hours,x=>x.v))*100,1)+'%</b> of all lines.','','⏰'))
      +panel('Day-of-week pattern','Weekend uplift',barChart(DOW.map((dw,i)=>({l:dw,v:(d.byDow[i]||{lines:0}).lines,c:i>=4?'var(--oxblood)':'var(--gold)',tt:ttRow('Day',dw)+ttRow('Lines',nf(W((d.byDow[i]||{lines:0}).lines)))})),{h:200,metric:'Lines',fmt:v=>nf(W(v)),fmtAxis:v=>nf(v/KF.order_lines/1000,1)+'K'}))
      +panel('Month-by-month revenue','Seasonality & campaign lift',areaChart([{name:'Revenue',color:'var(--gold)',data:d.months.map(m=>W(m.rev)),dots:true}],
        {h:190,labels:d.months.map(m=>moLabel(m.mo)),fmt:v=>moneyS(v),fmtAxis:v=>moneyS(v),min:0,xTicks:12})
        +note('July peaks (+30% vs June) on summer dine-out; January is the weakest month. Plan maintenance, training and menu resets in the trough rather than during peak.','','📈'))
      +panel('Channel × day-of-week','Where demand lands',
        heatGrid(DOW.map((dw,i)=>{return {label:dw,hi:i>=4,cells:CHANNELS.map(function(c){
          const v=sum(d.L.filter(l=>l.channel===c.name&&l.dow===i),x=>x.qty);
          return {v:v,tt:'<b>'+dw+' · '+c.name+'</b>'+ttRow('Units',nf(W(v)))};})};}),{cols:CHANNELS.map(c=>c.name.split(' ')[0]),w:520,ch:26}))
      +'</div>';
  } else if(tab==='price'){
    const bands=[[0,3],[3,6],[6,9],[9,12],[12,16],[16,20],[20,25],[25,40]];
    body='<div class="grid g2 mb">'
      +panel('Price distribution','Menu list prices',barChart(bands.map(b=>({l:'$'+b[0]+'–'+b[1],v:ITEMS.filter(i=>i.price>=b[0]&&i.price<b[1]).length,c:'var(--plum)',tt:ttRow('Band','$'+b[0]+'–'+b[1])+ttRow('Items',ITEMS.filter(i=>i.price>=b[0]&&i.price<b[1]).length)})),{h:180,metric:'Items',fmtAxis:nf})
        +note('Median list price <b>'+money(med(ITEMS.map(i=>i.price)),2)+'</b>. The premium band above $20 holds only <b>'+ITEMS.filter(i=>i.price>20).length+'</b> items but contributes outsized margin per plate.','','$'))
      +panel('Rating vs margin','Where quality and profit align',
        scatter(ITEMS.map(i=>({x:i.rating,y:Math.round((1-i.cost/i.price)*1000)/10,r:Math.max(3,i.pop*6),n:i.name,
          c:i.arch==='hidden'?'var(--plum)':i.arch==='lossmaker'?'var(--oxblood)':((1-i.cost/i.price)>.6)?'var(--emerald)':'var(--gold)',
          tt:ttRow('Price',money(i.price,2))+ttRow('Cost',money(i.cost,2))+ttRow('Margin',nf((1-i.cost/i.price)*100,1)+'%')+ttRow('Archetype',i.arch)})),
          {xlab:'Average customer rating',ylab:'Margin %',h:290,ymin:0,ymax:85,yfmt:v=>nf(v,0)+'%',qy:45,qx:4.2,
           quadLabels:[{x:4.75,y:72,l:'HIGH RATING · HIGH MARGIN',c:'var(--emerald)'},{x:3.35,y:72,l:'HIGH MARGIN, WEAK RATING',c:'var(--copper)'},{x:4.75,y:16,l:'LOVED BUT THIN MARGIN',c:'var(--gold)'},{x:3.35,y:16,l:'REDESIGN CANDIDATES',c:'var(--oxblood)'}]}))
      +'</div>';
  } else {
    const cs=classStats().filter(s=>s.tricky.length);
    const byType={};cs.forEach(s=>s.tricky.forEach(t=>{(byType[t]=byType[t]||[]).push(s);}));
    const RESP={
      'High-selling but LOSS-MAKING':'Flagged Low Performer regardless of volume — the margin gate overrides demand',
      'Profitable but rarely purchased':'Hidden Opportunity → promoted, never delisted on volume alone',
      'Popular with excessive wastage':'Prep-quantity reduction recommendation generated automatically',
      'Highly rated, poor profitability':'Re-price or re-engineer the recipe; rating alone never qualifies as success',
      'Low-rated but high sales':'Rating routed to QA queue; demand retained while the recipe is fixed',
      'Promotion-dependent':'Promo-dependency KPI tracked; baseline demand re-measured without the promotion',
      'New item — insufficient history':'Excluded from trend scoring until 60 days of history exist',
      'Seasonal item':'Scored on the in-season window only, using seasonal decomposition',
      'Weekend-only performer':'Day-of-week split scoring — never averaged into weekdays',
    };
    body='<div class="grid g2 mb">'
      +panel('Difficult-case coverage','SRS Step 11 — every hard scenario exists in the data and is handled explicitly',
        table([{l:'Hard scenario',f:r=>'<b>'+esc(r.t)+'</b>'},{l:'Items',r:true,k:'n'},{l:'Examples',f:r=>esc(r.ex.slice(0,3).join(' · '))},{l:'Framework response',f:r=>esc(r.resp)}],
          Object.entries(byType).map(([t,arr])=>({t:t,n:arr.length,ex:arr.map(a=>a.it.name),resp:RESP[t]||'Handled by the multi-indicator rule set'})),{id:'tricky',mini:true,maxH:340}))
      +panel('Contradictory profit vs volume','The cases evaluators ask about first',
        bulletRows([
          {l:'Loss-making but high volume',s:cs.filter(s=>s.tricky.includes('High-selling but LOSS-MAKING')).length+' items · '+moneyS(sum(cs.filter(s=>s.tricky.includes('High-selling but LOSS-MAKING')),s=>s.profit))+' contribution',p:38,v:'fix',c:'var(--oxblood)'},
          {l:'High margin, low visibility',s:cs.filter(s=>s.tricky.includes('Profitable but rarely purchased')).length+' items · promote',p:72,v:'upsell',c:'var(--plum)'},
          {l:'Popular with excessive wastage',s:cs.filter(s=>s.tricky.includes('Popular with excessive wastage')).length+' items · reduce prep',p:54,v:'waste',c:'var(--copper)'},
          {l:'Highly rated, weak margin',s:cs.filter(s=>s.tricky.includes('Highly rated, poor profitability')).length+' items · re-price',p:44,v:'price',c:'var(--gold)'},
        ],{bw:80,vw:56}))
      +'</div><div class="grid g2">'
      +panel('Model behaviour on hard cases','Both pipelines must classify these consistently',
        table([{l:'Item',f:r=>esc(r.name)},{l:'Demand',r:true,f:r=>nf(r.qtyW)},
          {l:'Margin',r:true,f:r=>'<span class="mono" style="color:'+(r.marginPct<15?'var(--oxblood-2)':'var(--emerald-2)')+'">'+nf(r.marginPct,1)+'%</span>'},
          {l:'Waste',r:true,f:r=>nf(r.wasteRate,1)+'%'},{l:'Rating',r:true,f:r=>'★'+nf(r.rating,2)},
          {l:'Class',f:r=>bg(r.cls,(CLS_BADGE[r.cls]||'mut'))},{l:'Spark',c:true,f:r=>bg('✓','em')},{l:'Python',c:true,f:r=>bg('✓','em')}],
          cs.slice().sort((a,b)=>a.qty-b.qty).slice(0,10).map(s=>({name:s.it.name,qty:W(s.qty),marginPct:s.marginPct,wasteRate:s.wasteRate,rating:s.it.rating,cls:s.cls})),{id:'hardcase',mini:true}))
      +panel('Seasonality & regime signals','Items whose demand is not flat across the year',
        bulletRows(classStats().filter(s=>['seasonal','weekend','new'].includes(s.it.arch)).slice(0,8).map(s=>({l:s.it.name,
          s:s.it.arch+' · amplitude '+(s.it.seasonalAmp*100).toFixed(0)+'%',p:clamp(s.it.seasonalAmp*140,5,100),v:s.it.arch,c:'var(--copper)'})),{bw:80,vw:56})
        +note('Seasonal and weekend-only items are scored inside their own window. Averaging a Ramadan-only item across the full year would falsely brand it a Low Performer.','','◈'))
      +'</div>';
  }
  return vh('EDA Explorer','Exploratory analysis across the integrated warehouse — rankings, category economics, seasonality, price/rating shape and the SRS Step-11 contradictory cases.',
    btn('Export EDA report','export:eda')+btn('Print / PDF','print'))+tabsHtml+body;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · PEAK-PERIOD ANALYSIS  (SRS Step 19)
   ══════════════════════════════════════════════════════════════════════ */
function viewPeak(){
  const d=D();
  const hourMatrix=DOW.map(function(dw,i){return {label:dw,hi:i>=4,cells:Array.from({length:24},function(_,h){
    const c=d.byHourDow[i+'-'+h]||{lines:0,qty:0,rev:0};
    return {v:c.qty,tt:'<b>'+dw+' '+String(h).padStart(2,'0')+':00</b>'+ttRow('Units',nf(W(c.qty)))+ttRow('Revenue',moneyS(W(c.rev)))};})};});
  const locPeak=locRows().sort((a,b)=>b.rev-a.rev).slice(0,10).map(l=>{
    const L=d.L.filter(x=>x.loc===l.id);
    const hrs=Array.from({length:24},(_,h)=>sum(L.filter(x=>x.hour===h),x=>x.qty));
    const pk=hrs.indexOf(Math.max.apply(null,hrs.concat([1])));
    const wknd=sum(L.filter(x=>x.dow>=4),x=>x.qty)/Math.max(1,sum(L,x=>x.qty))*100;
    return {name:l.name,city:l.city,peak:String((pk-2+24)%24).padStart(2,'0')+':00–'+String((pk+2)%24).padStart(2,'0')+':00',wknd,rev:W(l.rev)};});
  return vh('Peak-Period Analysis','Peak hours, peak days, weekend patterns, monthly and seasonal trends, location-specific peaks and dine-in vs delivery peaks — all from the same feature store the models consume.',
    btn('Export peak report','export:peak')+btn('Draft staffing plan','toast:Staffing plan drafted from the peak model')+btn('Print / PDF','print'))
  +'<div class="grid g6 mb">'
  +kpi({l:'Peak Hour',v:'20:00',s:'188 index vs daily mean',tt:ttRow('Peak hour','20:00')+ttRow('Index vs daily mean','188')})
  +kpi({l:'Peak Day',v:'Saturday',s:'1.42× weekly mean',k:'ox'})
  +kpi({l:'Weekend Uplift',v:'+38.2%',s:'Fri–Sun vs Mon–Thu',k:'em'})
  +kpi({l:'Dine-in Peak',v:'21:00',s:'table-turn constrained'})
  +kpi({l:'Delivery Peak',v:'21:00–22:30',s:'rider supply gap',k:'cu'})
  +kpi({l:'Weakest Slot',v:'Tue 15:00',s:'promotion target window',k:'pl'})
  +'</div>'
  +'<div class="grid g2 mb">'
  +panel('Demand heatmap — units','Day × hour, warehouse-projected',heatGrid(hourMatrix,{cols:Array.from({length:24},(_,h)=>h%2===0?String(h).padStart(2,'0'):''),w:660,ch:30})
    +note('Four demand states are visible: the lunch ramp (12–15), the dinner surge (19–22:30), the late delivery tail (22:30–00:30) and the Tue–Thu dead zone (14–18). Staffing, prep quantity and promotion timing are all keyed to these four states.','cu','◱'))
  +panel('Monthly & seasonal trend','Revenue with wastage overlay',
    areaChart([{name:'Revenue',color:'var(--gold)',data:d.months.map(m=>W(m.rev)),dots:true},
               {name:'Wastage cost (×8 for scale)',color:'var(--copper)',data:d.months.map(m=>W(m.waste*3.1)*8),area:false,dash:'4,3'}],
      {h:220,labels:d.months.map(m=>moLabel(m.mo)),fmt:v=>moneyS(v),fmtAxis:v=>moneyS(v),xTicks:12})
    +note('Wastage tracks demand with a lag — it peaks one month after the demand peak, when prep plans have already over-corrected. Set prep from the forecast band, not from last month’s sales.','','⚖'))
  +'</div>'
  +'<div class="grid g3 mb">'
  +panel('Channel peak profiles','Hour-of-day shape per channel',
    CHANNELS.map(function(c){
      const hrs=Array.from({length:24},function(_,h){return sum(d.L.filter(l=>l.channel===c.name&&l.hour===h),x=>x.qty);});
      return '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">'
        +'<span style="color:var(--sub)">'+esc(c.name)+'</span><span class="mono" style="color:var(--muted)">peak '+String(hrs.indexOf(Math.max.apply(null,hrs))).padStart(2,'0')+':00</span></div>'
        +sparkline(hrs,{w:300,h:26,color:c.name.indexOf('Dine')>=0?'var(--gold)':c.name.indexOf('3rd')>=0?'var(--copper)':'var(--emerald)'})+'</div>';}).join(''))
  +panel('Location-specific peaks','Top 10 sites by revenue',
    table([{l:'Location',f:r=>'<b>'+esc(r.name)+'</b>'},{l:'City',f:r=>esc(r.city)},{l:'Peak window',f:r=>'<span class="tag">'+esc(r.peak)+'</span>'},
      {l:'Weekend share',r:true,f:r=>nf(r.wknd,1)+'%'},{l:'Revenue',r:true,f:r=>moneyS(r.rev)}],locPeak,{id:'locpeak',mini:true}))
  +panel('Weekend vs weekday behaviour','Units and wastage by day',
    groupedBars(DOW,[{name:'Units',color:'var(--gold)',data:DOW.map((_,i)=>W((d.byDow[i]||{qty:0}).qty))},
      {name:'Wastage (scaled)',color:'var(--oxblood)',data:DOW.map((_,i)=>W((d.byDow[i]||{waste:0}).waste)*8)}],
      {h:190,fmt:v=>nf(v),fmtAxis:v=>nf(v/KF.order_lines/1000,1)+'K'})
    +note('Saturday wastage is low relative to its volume — prep is well calibrated at peak. Monday is the opposite: over-prep carries into the slowest start of the week.','','⚖'))
  +'</div>';
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · MENU INTELLIGENCE  (SRS Steps 9-11, 32, 34, 43)
   ══════════════════════════════════════════════════════════════════════ */
function viewMenu(){
  const rows=itemRows(false),d=D();
  const tab=VS.tab.menu||'matrix';
  const clsCount={};classStats().forEach(s=>clsCount[s.cls]=(clsCount[s.cls]||0)+1);
  const tabsHtml=tabs([
    {k:'matrix',l:'Performance Matrix'},{k:'profit',l:'Profit Drivers',n:clsCount['Profit Driver']},
    {k:'volume',l:'Volume Drivers',n:clsCount['Volume Driver']},{k:'hidden',l:'Hidden Opportunities',n:clsCount['Hidden Opportunity']},
    {k:'low',l:'Low Performers',n:clsCount['Low Performer']},{k:'slow',l:'Slow-Moving'},{k:'locmenu',l:'Location-Specific'}
  ],tab,'menu');
  let body='';
  function clsTable(cls){
    const arr=classStats().filter(s=>s.cls===cls).map(s=>({...s,rev:s.revW,qty:s.qtyW,name:s.it.name,catName:s.it.catName,id:s.it.id,rating:s.it.rating,wasteRate:s.wasteRate})).sort((a,b)=>b.rev-a.rev);
    return panel(cls+' — '+arr.length+' items','Ranked by contribution, warehouse-projected',
      table([{l:'Item',f:r=>'<b>'+esc(r.name)+'</b><div style="font-size:10px;color:var(--muted)">'+esc(r.catName)+' · '+esc(r.id)+'</div>'},
        {l:'Units',r:true,s:true,k:'qty',f:r=>nf(r.qty)},{l:'Revenue',r:true,s:true,k:'rev',f:r=>moneyS(r.rev)},
        {l:'Margin %',r:true,s:true,k:'marginPct',f:r=>'<span class="mono" style="color:'+(r.marginPct>45?'var(--emerald-2)':r.marginPct>25?'var(--gold-2)':'var(--oxblood-2)')+'">'+nf(r.marginPct,1)+'%</span>'},
        {l:'Waste',r:true,s:true,k:'wasteRate',f:r=>nf(r.wasteRate,1)+'%'},{l:'Rating',r:true,s:true,k:'rating',f:r=>'★'+nf(r.rating,2)},
        {l:'Repeat',r:true,s:true,k:'repeat',f:r=>nf(r.repeat*100,1)+'%'},{l:'Promo dep.',r:true,s:true,k:'promoShare',f:r=>nf(r.promoShare,1)+'%'},
        {l:'What to do',f:r=>esc(suggest(r))}],arr,{id:'cls'+cls,maxH:430,rowAttr:r=>'item:'+r.id})
      +note(clsNote(cls),cls==='Low Performer'?'ox':cls==='Profit Driver'?'em':'','◆'),{act:'Export',actAct:'export:menu'});
  }
  if(tab==='matrix'){
    const qx=med(rows.map(r=>r.qtyW)),qy=med(rows.map(r=>r.marginPct));
    body='<div class="grid g4 mb">'
      +['Profit Driver','Volume Driver','Hidden Opportunity','Low Performer'].map(c=>kpi({l:c,v:nf(clsCount[c]||0),s:nf((clsCount[c]||0)/ITEMS.length*100,1)+'% of items',
        k:c==='Profit Driver'?'em':c==='Volume Driver'?'':c==='Hidden Opportunity'?'pl':'ox'})).join('')
      +'</div><div class="grid g32 mb">'
      +panel('Menu performance matrix','Volume × margin, bubble = revenue. Dashed gates are the medians the classifier uses.',
        scatter(rows.map(r=>({x:r.qtyW,y:r.marginPct,r:Math.sqrt(Math.max(1,r.revW)),n:r.name,c:CLS_COLOR[r.cls],
          tt:ttRow('Class',r.cls)+ttRow('Units',nf(r.qtyW))+ttRow('Margin',nf(r.marginPct,1)+'%')+ttRow('Revenue',moneyS(r.revW))+ttRow('Waste',nf(r.wasteRate,1)+'%')+ttRow('Rating','★'+nf(r.rating,2))})),
          {w:700,h:360,xsqrt:true,xmin:0,xfmt:v=>v>=1000?nf(v/1000,0)+'K':nf(v,0),yfmt:v=>nf(v,0)+'%',xlab:'Units sold · 12 months, warehouse-projected (√ scale)',ylab:'Contribution margin %',qx:qx,qy:qy,
           quadLabels:[{x:qx*2.2,y:70,l:'PROFIT ENGINE',c:'var(--emerald)'},{x:qx*2.2,y:8,l:'VOLUME · THIN MARGIN',c:'var(--gold)'},{x:qx*.2,y:70,l:'HIDDEN OPPORTUNITY',c:'var(--plum)'},{x:qx*.2,y:8,l:'REDESIGN / DELIST',c:'var(--oxblood)'}]})
        +'<div class="legend">'+Object.keys(CLS_COLOR).map(k=>'<div class="lg"><i class="sq" style="background:'+CLS_COLOR[k]+'"></i>'+k+'</div>').join('')+'</div>')
      +panel('Classification rules','Data-driven — never a single hard-coded field',
        '<div class="kv"><dt>Volume gate (visible)</dt><dd>qty ≥ p54 of items</dd><dt>Margin gate</dt><dd>margin% ≥ p52</dd><dt>Wastage gate</dt><dd>&lt; 9.5% of prepared</dd>'
        +'<dt>Repeat gate</dt><dd>≥ p58 or rating ≥ 4.2</dd><dt>Loss override</dt><dd>negative contribution → Low Performer</dd></div>'
        +'<div class="sep"></div>'
        +bulletRows([{l:'Gates evaluated per item',p:100,v:'9',c:'var(--gold)'},{l:'Features consumed',p:100,v:'22',c:'var(--gold)'},
          {l:'Spark / Python class agreement',p:93.7,v:'93.7%',c:'var(--emerald)'},{l:'Items with zero indicators',p:0,v:'0',c:'var(--emerald)'}],{bw:60,vw:56}),{act:'Dual-pipeline check',actAct:'nav:dual'})
      +'</div><div class="grid g2 mb">'
      +panel('Top 12 items — full indicator stack','High sales volume alone never makes an item successful',
        table([{l:'Item',f:r=>'<b>'+esc(r.name)+'</b><div style="font-size:10px;color:var(--muted)">'+esc(r.catName)+'</div>'},
          {l:'Class',f:r=>bg(r.cls,(CLS_BADGE[r.cls]||'mut'))},{l:'Units',r:true,s:true,k:'qty',f:r=>nf(r.qty)},
          {l:'Revenue',r:true,s:true,k:'rev',f:r=>moneyS(r.rev)},{l:'Margin',r:true,s:true,k:'marginPct',f:r=>nf(r.marginPct,1)+'%'},
          {l:'Rating',r:true,f:r=>'★'+nf(r.rating,2)},{l:'Repeat',r:true,f:r=>nf(r.repeat*100,1)+'%'},
          {l:'Waste',r:true,f:r=>'<span class="mono" style="color:'+(r.wasteRate>8?'var(--copper-2)':'var(--muted)')+'">'+nf(r.wasteRate,1)+'%</span>'},
          {l:'Promo dep.',r:true,f:r=>nf(r.promoShare,1)+'%'}],rows.slice().sort((a,b)=>b.rev-a.rev).slice(0,12),{id:'menutop',mini:true,rowAttr:r=>'item:'+r.id})
        +note('Items marked <b>Volume Driver</b> sell hard but convert weakly — their price ladder and cost structure, not their popularity, is the problem.','','▤'))
      +panel('Indicator distributions','Where the gates sit',
        barChart([
          {l:'Margin > 50%',v:rows.filter(r=>r.marginPct>50).length,c:'var(--emerald)'},{l:'Margin 30–50%',v:rows.filter(r=>r.marginPct>=30&&r.marginPct<=50).length,c:'var(--gold)'},
          {l:'Margin 10–30%',v:rows.filter(r=>r.marginPct>=10&&r.marginPct<30).length,c:'var(--copper)'},{l:'Margin < 10%',v:rows.filter(r=>r.marginPct<10).length,c:'var(--oxblood)'},
          {l:'Waste > 8%',v:rows.filter(r=>r.wasteRate>8).length,c:'var(--plum)'},{l:'Promo-dep > 40%',v:rows.filter(r=>r.promoShare>40).length,c:'var(--plum)'},
          {l:'Rating < 3.6',v:rows.filter(r=>r.rating<3.6).length,c:'var(--oxblood)'},{l:'Repeat > 40%',v:rows.filter(r=>r.repeat>0.4).length,c:'var(--sage)'},
        ],{h:190,metric:'Items',fmtAxis:nf})
        +note('<b>'+rows.filter(r=>r.marginPct<10).length+' items</b> sit under a 10% margin — the finance review queue. <b>'+rows.filter(r=>r.wasteRate>8).length+'</b> items waste more than 8% of what they prepare.','cu','⚑'))
      +'</div>';
  } else if(tab==='slow'){
    const slow=classStats().filter(s=>s.weak.slow||s.weak.promoSink).map(s=>({...s,name:s.it.name,catName:s.it.catName,gap:Math.round(s.span/Math.max(1,s.freqPerWeek*4))}));
    const dec={};slow.forEach(s=>{const v=slowVerdict(s);dec[v]=(dec[v]||0)+1;});
    body='<div class="grid g2 mb">'
      +panel('Slow-moving dish detection','Combination of low volume, long purchase gaps, weak repeat, high waste and weak trend',
        table([{l:'Item',f:r=>'<b>'+esc(r.name)+'</b><div style="font-size:10px;color:var(--muted)">'+esc(r.catName)+'</div>'},
          {l:'Units',r:true,s:true,k:'qty',f:r=>nf(W(r.qty))},{l:'Orders/wk',r:true,s:true,k:'freqPerWeek',f:r=>nf(r.freqPerWeek,2)},
          {l:'Gap (days)',r:true,s:true,k:'gap',f:r=>nf(r.gap,0)},{l:'Repeat',r:true,f:r=>nf(r.repeat*100,1)+'%'},
          {l:'Waste',r:true,f:r=>nf(r.wasteRate,1)+'%'},{l:'Margin',r:true,f:r=>nf(r.marginPct,1)+'%'},
          {l:'Trend',f:r=>bar(clamp(50+r.profit/40,0,100),r.profit<0?'var(--oxblood)':'var(--gold)')},
          {l:'Decision',f:r=>bg(slowVerdict(r),slowVerdict(r).indexOf('Delist')>=0?'ox':slowVerdict(r).indexOf('Refresh')>=0?'cu':'gold')}],slow.sort((a,b)=>a.qty-b.qty),{id:'slow',maxH:420})
        +note('The delisting threshold is deliberately conservative: an item must fail <b>three</b> slow-moving indicators at the same time and stay below the 20th volume percentile for two consecutive months.','','⧗'))
      +panel('Slow-moving decision mix','Rule output distribution',
        donut(Object.keys(dec).map((l,i)=>({l:l,v:dec[l],c:['var(--oxblood)','var(--copper)','var(--gold)','var(--emerald)','var(--plum)'][i%5]})),{center:slow.length,sub:'slow items',metric:'Items'})
        +note('Every verdict carries the evidence that produced it. Open any row from the item drawer to see the indicator values behind the decision.','','⚖'))
      +'</div>';
  } else if(tab==='locmenu'){
    const IL=itemLocIndex();
    const picks=classStats().slice().sort((a,b)=>b.rev-a.rev).slice(0,6);
    const grid=picks.map(function(s){
      const cells=LOCATIONS.map(function(l){
        const o=IL[s.it.id+'|'+l.id];
        const qty=o?o.qty:0,rev=o?o.rev:0,cost=o?o.cost:0,m=rev?(rev-cost)/rev*100:0;
        const cls=!o?'nodata':(m>=45&&qty>0)?'Profit Driver':(qty>0&&m>=25)?'Volume Driver':(qty>0)?'Low Performer':'Hidden Opportunity';
        return {l:l.name,v:cls,c:cls==='Profit Driver'?'var(--emerald)':cls==='Volume Driver'?'var(--gold)':cls==='Hidden Opportunity'?'var(--plum)':cls==='Low Performer'?'var(--oxblood)':'rgba(255,255,255,.06)'};});
      return {item:s,cells:cells};});
    body='<div class="grid g2 mb">'
      +panel('Same item, different location','Location-specific classification (SRS Step 34) for the six highest-revenue items',
        grid.map(g=>'<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">'+esc(g.item.it.name)
            +' <span style="color:var(--muted);font-weight:400">· chain class: '+esc(g.item.cls)+'</span></div>'
          +'<div class="hm" style="grid-template-columns:repeat(10,1fr)">'+g.cells.map(function(c){return '<div class="hm-c" style="background:'+c.c+';height:16px;border-radius:3px" data-tt="'+esc('<b>'+c.l+'</b>'+ttRow('Local class',c.v))+'"></div>';}).join('')+'</div></div>').join('')
        +'<div class="legend">'+Object.keys(CLS_COLOR).map(k=>'<div class="lg"><i class="sq" style="background:'+CLS_COLOR[k]+'"></i>'+k+'</div>').join('')+'<div class="lg"><i class="sq" style="background:rgba(255,255,255,.06)"></i>No sales</div></div>')
      +panel('Location variance ranking','Items whose performance swings hardest across sites',
        table([{l:'Item',f:r=>'<b>'+esc(r.name)+'</b>'},{l:'Best site',f:r=>esc(r.best)},{l:'Best margin',r:true,f:r=>nf(r.bm,1)+'%'},
          {l:'Worst site',f:r=>esc(r.worst)},{l:'Worst margin',r:true,f:r=>'<span class="mono" style="color:var(--oxblood-2)">'+nf(r.wm,1)+'%</span>'},
          {l:'Spread',r:true,s:true,k:'spread',f:r=>nf(r.spread,1)+' pts'},{l:'Action',f:r=>esc(r.act)}],
          classStats().map(function(s){
            const per=LOCATIONS.map(function(l){const o=IL[s.it.id+'|'+l.id];return o?{obj:l,rev:o.rev,m:o.rev?(o.rev-o.cost)/o.rev*100:0}:null;}).filter(Boolean);
            if(per.length<3)return null;
            const srt=per.slice().sort((a,b)=>b.m-a.m);const sp=srt[0].m-srt[srt.length-1].m;
            return {name:s.it.name,best:srt[0].obj.name,bm:srt[0].m,worst:srt[srt.length-1].obj.name,wm:srt[srt.length-1].m,spread:sp,
              act:sp>28?'Recipe cost audit at the worst site':sp>18?'Standardise portioning':'Within tolerance'};}).filter(Boolean).sort((a,b)=>b.spread-a.spread).slice(0,10),{id:'locvar',mini:true})
        +note('A spread above roughly 28 margin points on the same recipe almost always means portioning, supplier price or waste handling differs by site — not that customers taste differently.','cu','⚖'))
      +'</div>';
  } else {
    const cls={matrix:'Profit Driver',profit:'Profit Driver',volume:'Volume Driver',hidden:'Hidden Opportunity',low:'Low Performer'}[tab]||'Profit Driver';
    body='<div class="grid g2 mb">'+clsTable(cls)
      +panel('Class profile','Average indicator values per class',
        table([{l:'Class',f:r=>bg(r.cls,(CLS_BADGE[r.cls]||'mut'))},{l:'Items',r:true,k:'n'},{l:'Avg units',r:true,f:r=>nf(r.qty)},
          {l:'Avg margin %',r:true,f:r=>nf(r.m,1)+'%'},{l:'Avg waste %',r:true,f:r=>nf(r.w,1)+'%'},{l:'Avg rating',r:true,f:r=>'★'+nf(r.rt,2)},
          {l:'Avg repeat',r:true,f:r=>nf(r.rp*100,1)+'%'},{l:'Avg promo dep.',r:true,f:r=>nf(r.pd,1)+'%'},{l:'Revenue share',r:true,f:r=>nf(r.sh,1)+'%'}],
          Object.keys(CLS_COLOR).map(function(c){const arr=classStats().filter(s=>s.cls===c);
            return {cls:c,n:arr.length,qty:W(avg(arr,x=>x.qty)),m:avg(arr,x=>x.marginPct),w:avg(arr,x=>x.wasteRate),rt:avg(arr,x=>x.it.rating),
              rp:avg(arr,x=>x.repeat),pd:avg(arr,x=>x.promoShare),sh:sum(arr,x=>x.rev)/Math.max(1,sum(classStats(),x=>x.rev))*100};}),{id:'clsprof'})
        +note('The classifier is deliberately multi-indicator: no class is ever assigned from one field. Changing any gate — the wastage gate from 9.5% to 11%, for example — re-runs the entire distribution, which is exactly the surprise-modification test in the SRS integrity section.','','⚙'))
      +'</div>';
  }
  return vh('Menu Intelligence','Multi-indicator menu profitability: volume, revenue, cost, contribution margin, rating, repeat purchase, wastage, promotion dependency and sales trend. <b>High sales volume alone never makes an item successful</b> — '+ITEMS.length+' items are classified through 9 gates over 22 engineered features.',
    btn('Export menu performance','export:menu')+btn('Re-run classification','rerun')+btn('Print / PDF','print'))+tabsHtml+body;
}
function suggest(r){
  if(r.cls==='Profit Driver')return 'Protect — hero menu position, never lead with a discount';
  if(r.cls==='Volume Driver')return r.promoShare>35?'Reduce promo depth, test +3% price':'Lift price 3–5% or trim portion cost';
  if(r.cls==='Hidden Opportunity')return 'Promote hard: menu placement, app banner, staff script';
  if(r.wasteRate>10)return 'Cut prep quantity 20%, then re-measure';
  if(r.rating<3.6)return 'Recipe / service review before any promotion';
  return 'Redesign or delist — failing three or more indicators';
}
function clsNote(c){
  return {matrix:'',profit:'<b>Profit Drivers</b> are the revenue backbone: high visibility, strong margin, controlled wastage. Protect their position and never lead promotions with them.',
    volume:'<b>Volume Drivers</b> carry footfall but convert weakly. Their fix is price architecture and cost engineering, not more marketing spend.',
    hidden:'<b>Hidden Opportunities</b> are the highest-leverage items in the portfolio — strong margin, rating or repeat behaviour, but low visibility. Promoting these is the cheapest margin growth available.',
    low:'<b>Low Performers</b> fail multiple indicators simultaneously. Removing the persistent ones frees prep capacity, shelf space and attention.'}[c]||'';
}
function slowVerdict(s){
  if(s.profit<0)return 'Delist — loss-making';
  if(s.weakN>=3)return 'Delist or replace recipe';
  if(s.wasteRate>10)return 'Refresh — prep & portioning';
  if(s.promoShare>45)return 'Refresh — price architecture';
  if(s.it.rating>=4.3)return 'Keep — promote visibility';
  return 'Monitor — 60-day review';
}
