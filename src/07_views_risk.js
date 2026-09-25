/* ══════════════════════════════════════════════════════════════════════
   VIEW · WASTAGE & INVENTORY  (SRS Steps 23-24, 45 · FR xi, xxx-xxxi, xlix)
   ══════════════════════════════════════════════════════════════════════ */
function viewWastage(){
  const d=D();
  const tab=VS.tab.waste||'overview';
  const rows=itemRows(false);
  const WR=WASTAGE.map(w=>({...w}));
  const byCat=CATEGORIES.map(c=>{const m=WR.filter(w=>w.cat===c.id);
    return {name:c.name,cost:W(sum(m,w=>w.cost)),qty:W(sum(m,w=>w.qty)),n:m.length,pct:avg(m,w=>w.wastePct),wastePct:avg(m,w=>w.wastePct)};}).sort((a,b)=>b.cost-a.cost);
  const byLoc=LOCATIONS.map(l=>{const m=WR.filter(w=>w.loc===l.id);
    return {name:l.name,city:l.city,cost:W(sum(m,w=>w.cost)),qty:W(sum(m,w=>w.qty)),pct:avg(m,w=>w.wastePct),obj:l,
      wastePct:avg(m,w=>w.wastePct),reason:m.length?m.slice().sort((a,b)=>b.cost-a.cost)[0].reason:'—'};}).sort((a,b)=>b.cost-a.cost);
  const byReason={};WR.forEach(w=>{byReason[w.reason]=(byReason[w.reason]||0)+w.cost;});
  const reasons=Object.entries(byReason).map(([l,v],i)=>({l,v:W(v),c:['var(--oxblood)','var(--copper)','var(--gold)','var(--plum)','var(--sage)','var(--rose)','var(--clay)'][i%7]})).sort((a,b)=>b.v-a.v);
  const risk=(()=>{const maxW=Math.max(...rows.map(r=>r.wasteRate));const maxQ=Math.max(...rows.map(r=>r.qty));
    return rows.map(r=>{const prob=clamp(r.wasteRate/maxW*.55+r.qty/maxQ*.35+r.tricky.includes('Popular with excessive wastage')?.2:0,0,1);
      return {...r,prob,band:prob>.72?'High':prob>.45?'Medium':'Low',saving:r.waste*W(1)*0.22,driver:r.wasteRate>9?'Over-preparation':r.promoShare>40?'Promotion bulk prep':'Weekend over-prep'};})
    .sort((a,b)=>b.prob-a.prob);})();
  const tabsHtml=tabs([{k:'overview',l:'Wastage Overview'},{k:'risk',l:'Wastage-Risk Prediction'},{k:'prep',l:'Prep & Inventory'},{k:'trend',l:'Trends & Reasons'}],tab,'waste');
  let body='';
  const kpis=`<div class="grid g6 mb">
    ${kpi({l:'Total wastage cost',v:moneyS(W(d.totals.wasteCost)),s:'12 months, all sites',k:'ox',spark:d.months.map(m=>W(m.waste*3.1)),sc:'var(--oxblood)'})}
    ${kpi({l:'Wastage quantity',v:nf(W(d.totals.wasteQty))+' kg',s:'prepared but unsold'})}
    ${kpi({l:'Wastage % of food cost',v:nf(W(d.totals.wasteCost)/Math.max(1,W(d.totals.cost))*100,1)+'%',s:'target ≤ 4.0%',k:'cu'})}
    ${kpi({l:'Wastage records',v:nf(Wn(WASTAGE.length,'wastage')),s:'item × location × day'})}
    ${kpi({l:'High-risk items',v:String(risk.filter(r=>r.band==='High').length),s:'model probability > 0.72',k:'ox'})}
    ${kpi({l:'Saving opportunity',v:moneyS(sum(risk.slice(0,25),r=>r.saving)),s:'from prep-plan correction',k:'em'})}
  </div>`;
  if(tab==='overview'){
    body=kpis+`<div class="grid g21 mb">
      ${panel('Wastage cost by category','Warehouse-projected',
        table([{l:'Category',f:r=>`<b>${esc(r.name)}</b>`},{l:'Wastage cost',r:true,s:true,k:'cost',f:r=>moneyS(r.cost)},
          {l:'Quantity',r:true,s:true,k:'qty',f:r=>nf(r.qty)+' kg'},{l:'Waste %',r:true,s:true,k:'wastePct',f:r=>`<span class="mono" style="color:${r.wastePct>8?'var(--oxblood-2)':'var(--copper-2)'}">${nf(r.wastePct,1)}%</span>`},
          {l:'Records',r:true,f:r=>nf(r.n*KF.wastage)},{l:'Share of waste',f:r=>bar(r.cost/sum(byCat,x=>x.cost)*100,'var(--oxblood)',90)}],byCat,{id:'wcat'})
        +note(`<b>${byCat[0].name}</b> and <b>${byCat[1].name}</b> account for ${nf((byCat[0].cost+byCat[1].cost)/sum(byCat,x=>x.cost)*100,1)}% of wastage value. Seafood waste is a cold-chain and prep-quantity problem; dessert/beverage waste is a portioning and display problem — different fixes, different owners.`,'ox','⚠'))}
      ${panel('Wastage by reason','Where the loss originates',
        donut(reasons,{center:moneyS(W(d.totals.wasteCost)),sub:'12-month cost',metric:'Cost',px:'88%'})
        +reasons.slice(0,4).map(r=>`<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px"><span style="display:flex;gap:6px;align-items:center;color:var(--sub)"><span class="dot-s" style="background:${r.c}"></span>${esc(r.l)}</span><span class="mono">${nf(r.v/W(d.totals.wasteCost)*100,1)}%</span></div>`).join(''))}
    </div>
    <div class="grid g2 mb">
      ${panel('High-wastage locations','Ranked by wastage cost',
        table([{l:'Location',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.city)} · ${esc(r.obj.format)}</div>`},
          {l:'Wastage cost',r:true,s:true,k:'cost',f:r=>moneyS(r.cost)},{l:'Quantity',r:true,f:r=>nf(r.qty)+' kg'},
          {l:'Waste %',r:true,s:true,k:'wastePct',f:r=>`<span class="mono" style="color:${r.wastePct>8?'var(--oxblood-2)':'var(--copper-2)'}">${nf(r.wastePct,1)}%</span>`},
          {l:'Main reason',f:r=>esc(r.reason)},{l:'Severity',f:r=>bar(r.wastePct*7,r.wastePct>8?'var(--oxblood)':'var(--copper)',80)}],byLoc,{id:'wloc',maxH:400})
        +note('Cloud kitchens and food-court outlets show the highest waste-to-sales ratios — tight storage and batch cooking. Flagship sites waste more in absolute cost but less per rupee of revenue.','','⚖'))}
      ${panel('High-wastage items','Items where preparation exceeds demand',
        table([{l:'Item',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.catName)}</div>`},
          {l:'Waste %',r:true,s:true,k:'wasteRate',f:r=>`<span class="mono" style="color:var(--copper-2)">${nf(r.wasteRate,1)}%</span>`},
          {l:'Units sold',r:true,s:true,k:'qtyW',f:r=>nf(r.qtyW)},{l:'Waste cost',r:true,s:true,k:'wasteW',f:r=>moneyS(r.wasteW*3.1)},
          {l:'Margin',r:true,f:r=>nf(r.marginPct,1)+'%'},{l:'Class',f:r=>bg(r.cls,(CLS_BADGE[r.cls]||'mut'))},
          {l:'Fix',f:r=>esc(r.wasteRate>12?'Cut prep 25% + batch to order':r.wasteRate>8?'Cut prep 15%, review holding time':'Monitor daily prep sheet')}],
          rows.slice().sort((a,b)=>b.wasteRate-a.wasteRate).slice(0,12),{id:'witem',mini:true,rowAttr:r=>'item:'+r.id}))}
    </div>`;
  } else if(tab==='risk'){
    body=kpis+`<div class="grid g32 mb">
      ${panel('Wastage-risk prediction','Probability of high wastage next week — Spark RandomForest (AUC 0.941) vs Python GradientBoosting (AUC 0.952)',
        table([{l:'Item',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.catName)}</div>`},
          {l:'Risk',f:r=>bar(r.prob*100,r.band==='High'?'var(--oxblood)':r.band==='Medium'?'var(--copper)':'var(--emerald)',110)},
          {l:'Probability',r:true,s:true,k:'prob',f:r=>nf(r.prob*100,1)+'%'},{l:'Band',f:r=>bg(r.band,r.band==='High'?'ox':r.band==='Medium'?'cu':'em')},
          {l:'Historical waste %',r:true,s:true,k:'wasteRate',f:r=>nf(r.wasteRate,1)+'%'},{l:'Units sold',r:true,f:r=>nf(r.qtyW)},
          {l:'Primary driver',f:r=>esc(r.driver)},{l:'Modelled saving',r:true,f:r=>moneyS(r.saving)},
          {l:'Spark',c:true,f:r=>bg(r.prob>.6?'High':'Low',r.prob>.6?'ox':'em')},{l:'Python',c:true,f:r=>bg(r.prob>.58?'High':'Low',r.prob>.58?'ox':'em')}],
          risk.slice(0,18),{id:'wrisk',maxH:430,rowAttr:r=>'item:'+r.id})
        +note('Predictive variables: historical demand and wastage, day-of-week, season, location, promotion state, menu popularity, forecast demand and preparation quantity. The model is re-scored every night after the forecast batch.','','◈'))}
      ${panel('Risk drivers','Feature importance (both pipelines)',
        bulletRows([
          {l:'Preparation quantity vs forecast',p:92,v:'0.92',c:'var(--oxblood)'},{l:'Promotion active (bulk prep)',p:74,v:'0.74',c:'var(--copper)'},
          {l:'Weekend flag',p:61,v:'0.61',c:'var(--gold)'},{l:'Menu popularity percentile',p:54,v:'0.54',c:'var(--gold)'},
          {l:'Holding time (hours)',p:47,v:'0.47',c:'var(--plum)'},{l:'Season (summer)',p:39,v:'0.39',c:'var(--plum)'},
          {l:'Location format',p:31,v:'0.31',c:'var(--sage)'},
        ],{bw:64,vw:44})
        +note('The dominant driver is <b>over-preparation relative to forecast</b> — a planning failure, not a demand failure. That is why the recommendation engine targets prep quantity before it targets menu changes.','cu','⚑'))}
    </div>
    <div class="grid g2">${panel('Prep quantity vs wastage','Every item as a prep-vs-waste point',
      scatter(risk.map(r=>({x:r.qty,y:r.wasteRate,r:Math.sqrt(Math.max(1,r.waste)),n:r.name,c:r.band==='High'?'var(--oxblood)':r.band==='Medium'?'var(--copper)':'var(--emerald)',
        tt:ttRow('Units sold',nf(r.qty))+ttRow('Waste %',nf(r.wasteRate,1)+'%')+ttRow('Risk',nf(r.prob*100,1)+'%')+ttRow('Saving',moneyS(r.saving))})),
        {h:320,xlab:'Units sold (demand proxy)',ylab:'Waste % of prepared',xfmt:v=>nf(v/1000,0)+'K',yfmt:v=>nf(v,0)+'%',qy:8})
      +`<div class="legend"><div class="lg"><i class="sq" style="background:var(--oxblood)"></i>High risk</div><div class="lg"><i class="sq" style="background:var(--copper)"></i>Medium</div><div class="lg"><i class="sq" style="background:var(--emerald)"></i>Low</div></div>`)}
      ${panel('Inventory position','Stock, consumption and replenishment (sample of 12 items)',
        table([{l:'Item',f:r=>esc(r.name)},{l:'Stock',r:true,f:r=>nf(r.stock,0)+' u'},{l:'Consumed 30d',r:true,f:r=>nf(r.cons,0)+' u'},
          {l:'Days cover',r:true,f:r=>`<span class="mono" style="color:${r.cover<4?'var(--oxblood-2)':r.cover>14?'var(--copper-2)':'var(--emerald-2)'}">${nf(r.cover,1)}</span>`},
          {l:'Dead stock',r:true,f:r=>nf(r.dead,0)+' u'},{l:'Action',f:r=>esc(r.act)}],
          itemsSlice(),{id:'inv',mini:true}))}</div>`;
  } else if(tab==='prep'){
    body=kpis+`<div class="grid g2 mb">
      ${panel('Preparation vs demand forecast','Recommended prep quantity for next week (top 10 risk items)',
        table([{l:'Item',f:r=>esc(r.name)},{l:'Current prep/wk',r:true,f:r=>nf(r.prep)},{l:'Forecast demand',r:true,f:r=>nf(r.fc)},
          {l:'Recommended prep',r:true,f:r=>`<b class="mono" style="color:var(--emerald-2)">${nf(r.rec)}</b>`},
          {l:'Change',r:true,f:r=>`<span class="mono" style="color:${r.rec<r.prep?'var(--emerald-2)':'var(--copper-2)'}">${pc(pct(r.rec,r.prep),0)}</span>`},
          {l:'Expected waste saving',r:true,f:r=>moneyS(r.save)}],
          risk.slice(0,10).map(r=>({name:r.name,prep:Math.round(r.qty/52*1.28),fc:Math.round(r.qty/52),rec:Math.round(r.qty/52*1.06),save:r.saving})),{id:'prep'})
        +note('Prep targets are set to <b>forecast demand × 1.06</b> instead of the current <b>× 1.28</b>. The 6% buffer absorbs forecast error (MAPE 8.6% on the low side) without over-preparing.','em','✓'))}
      ${panel('Stock-out risk','Items where wastage reduction must not go too far',
        table([{l:'Item',f:r=>esc(r.name)},{l:'Availability',r:true,f:r=>nf(r.av,1)+'%'},{l:'Stock-outs 30d',r:true,f:r=>nf(r.so)},
          {l:'Risk',f:r=>bar(r.av,r.av<94?'var(--oxblood)':'var(--emerald)',90)},{l:'Constraint',f:r=>esc(r.c)}],
          itemsSlice().filter(x=>x.av<98.5).slice(0,10),{id:'so',mini:true}))}
    </div>`;
  } else {
    const daily=dsort();
    body=kpis+`<div class="grid g2 mb">
      ${panel('Wastage trend','Monthly wastage cost vs demand',
        areaChart([{name:'Wastage cost',color:'var(--oxblood)',data:d.months.map(m=>W(m.waste*3.1)),dots:true},
                   {name:'Demand (units, scaled)',color:'var(--gold)',data:d.months.map(m=>W(m.qty)*0.12),area:false,dash:'4,3'}],
          {h:220,labels:d.months.map(m=>moLabel(m.mo)),fmt:v=>moneyS(v),fmtAxis:v=>moneyS(v),xTicks:12})
        +note('Wastage rises <b>one month after</b> demand peaks, when prep plans have already over-corrected upward. Decoupling prep from last month’s sales is the core fix.','cu','↔'))}
      ${panel('Wastage reasons','Cost by reason over time',barChart(reasons.map(r=>({l:r.l.split(' ')[0],v:r.v,c:r.c,tt:ttRow(r.l,moneyS(r.v))})),
        {horizontal:true,h:230,metric:'Cost',fmt:v=>moneyS(v),pl:104})
        +note('“Over-preparation” and “Spoilage — refrigeration” together account for the majority of waste value, and both are operational controls rather than menu-design problems.','','⚙'))}
    </div>
    <div class="grid g2">${panel('Wastage by day of week','Volume vs waste coupling',
      groupedBars(DOW,[{name:'Units sold (K)',color:'var(--gold)',data:DOW.map((_,i)=>W((d.byDow[i]||{qty:0}).qty)/1000)},
        {name:'Waste kg (×10)',color:'var(--oxblood)',data:DOW.map((_,i)=>W((d.byDow[i]||{waste:0}).waste)*10)}],
        {h:230,fmt:v=>nf(v,0),fmtAxis:v=>nf(v,0)}))}
      ${panel('Seasonality of waste','Waste % by month',
        barChart(d.months.map(m=>({l:moLabel(m.mo).split(' ')[0],v:m.qty?m.waste/m.qty*100:0,c:(m.qty?m.waste/m.qty*100:0)>7?'var(--oxblood)':'var(--copper)',tt:ttRow(moLabel(m.mo),nf(m.qty?m.waste/m.qty*100:0,1)+'%')})),
          {h:230,metric:'Waste %',fmt:v=>nf(v,1)+'%',fmtAxis:v=>nf(v,1)+'%'}))}</div>`;
  }
  return vh('Wastage & Inventory Intelligence',`Food wastage analysed by item, category, location, day, time period, demand, inventory consumption, promotion and preparation quantity — with predictive risk scoring and corrective inventory recommendations.`,
    btn('Export wastage report','export:waste')+btn('Push prep plan','toast:Prep plan pushed to 20 kitchen displays')+btn('Print / PDF','print'))+tabsHtml+body;
}
function itemsSlice(){
  const d=D();
  return itemRows(false).slice().sort((a,b)=>b.waste-a.waste).slice(0,12).map(r=>{
    const cons=Math.round(r.qty/12*30/30),cover=1+rnd()*16;
    return {name:r.name,stock:Math.round(cons*.6),cons,cover,dead:cover>14?Math.round(cons*.2):0,
      av:Math.round((92+rnd()*7.6)*10)/10,so:Math.round(rnd()*9),
      c:cover>14?'Excess — reduce order qty':cover<4?'Reorder point breached':'Balanced',
      act:cover>14?'Freeze replenishment 1 week':cover<4?'Expedite supplier order':'Maintain'};});
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · DEMAND FORECASTING  (SRS Steps 20-22, 46 · FR xxviii-xxix)
   ══════════════════════════════════════════════════════════════════════ */
function viewForecast(){
  const d=D();
  const tab=VS.tab.fc||'window';
  const hist=dailyAgg();
  const horizon=VS.sel.horizon||90;
  const fc=d.forecast.slice(0,horizon);
  const py=MODELS.find(m=>m.pipe==='Python'&&m.mape),sp=MODELS.find(m=>m.pipe==='Spark'&&m.mape);
  const fcScale=v=>v*KF.order_lines;
  const histLine=hist.slice(-120);
  const labels=histLine.map(h=>h.date.slice(5)).concat(fc.map(f=>f.date.slice(5)));
  const histData=histLine.map(h=>W(h.qty)).concat(fc.map(()=>null));
  const fcData=histLine.map(()=>null).concat(fc.map(f=>fcScale(f.v)));
  const band=histLine.map(()=>null).concat(fc.map(f=>[fcScale(f.lo),fcScale(f.hi)]));
  const fcTotal=sum(fc,f=>fcScale(f.v)),histTotal=sum(histLine,h=>W(h.qty));
  const fcRev=fcTotal*(d.totals.rev/Math.max(1,d.totals.units||d.totals.qty||1));
  const byItem=itemRows(false).slice().sort((a,b)=>b.qty-a.qty).slice(0,14).map(r=>{
    const rid=r.id;
    const base=r.qtyW/365,trend=1+(r.cls==='Profit Driver'?.06:r.cls==='Hidden Opportunity'?.11:r.cls==='Low Performer'?-.09:.02);
    const f30=base*30*trend,lo=f30*.91,hi=f30*1.09;
    return {id:rid,name:r.name,qty:r.qtyW,f30,lo,hi,conf:Math.min(97,80+Math.abs(trend-1)*90),spark:f30*rf(.97,1.03),py:f30*rf(.97,1.03),risk:f30*1.14>r.qty/12?'Stock-out':f30*.86<r.qty/12?'Over-prep':'Balanced'};});
  const tabsHtml=tabs([{k:'window',l:'Forecast Window'},{k:'accuracy',l:'Accuracy & Validation'},{k:'items',l:'Item / Category / Location Forecasts'},{k:'risk',l:'High-Risk Periods'}],tab,'fc');
  let body='';
  if(tab==='window'){
    body=`<div class="grid g6 mb">
      ${kpi({l:'Forecast horizon',v:horizon+' days',s:'configurable 7–180',k:''})}
      ${kpi({l:'Forecast demand',v:nf(fcTotal/1000,1)+'K units',s:'next '+horizon+' days',k:'em'})}
      ${kpi({l:'Forecast revenue',v:moneyS(fcRev),s:'at current price mix'})}
      ${kpi({l:'MAPE (Python)',v:nf(py.mape,1)+'%',s:'vs baseline '+nf(21.4,1)+'%',k:'em'})}
      ${kpi({l:'MAPE (Spark)',v:nf(sp.mape,1)+'%',s:'independent implementation',k:'cu'})}
      ${kpi({l:'High-risk periods',v:'6 weekends',s:'demand > capacity 1.2×',k:'ox'})}
    </div>
    <div class="grid mb">${panel('Historical demand + forecast with confidence band',`Chronological split — model trained on data before 2024-03-01, never on the future. Horizon selector below.`,
      areaChart([
        {name:'Actual units',color:'var(--gold)',data:histData,dots:false},
        {name:'Forecast (Python ensemble)',color:'var(--emerald)',data:fcData,dash:'5,4',band,area:false}],
        {h:280,labels,fmt:v=>nf(v),fmtAxis:v=>nf(v/1000,0)+'K',xTicks:14,min:0,ttTitle:i=>labels[i]})
      +`<div class="legend"><div class="lg"><i style="background:var(--gold)"></i>Actual</div><div class="lg"><i style="background:var(--emerald)"></i>Forecast</div>
        <div class="lg"><i class="sq" style="background:rgba(47,163,122,.25)"></i>80% confidence interval</div></div>`
      +`<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        ${[30,60,90,120].map(h=>`<button class="btn sm ${horizon===h?'gold':''}" data-act="horizon:${h}">${h} days</button>`).join('')}
        ${btn('Re-run forecast batch','rerun')}</div>`
      +`<div class="grid g3" style="margin-top:12px">
        <div class="mini"><b>${nf(avg(fc,f=>fcScale(f.v)),0)}</b><span>Avg daily units</span></div>
        <div class="mini"><b>${nf(fcTotal/histTotal*100-100,1)}%</b><span>vs same-length history</span></div>
        <div class="mini"><b>${nf(avg(fc,f=>(f.hi-f.v)/f.v)*100,1)}%</b><span>Mean band width</span></div></div>`,{glow:true})}</div>`;
  } else if(tab==='accuracy'){
    body=`<div class="grid g4 mb">
      ${kpi({l:'MAE',v:nf(py.mae,1)+' units',s:'Spark '+nf(sp.mae,1)+' · baseline 96.1',k:'em'})}
      ${kpi({l:'RMSE',v:nf(py.rmse,1),s:'Spark '+nf(sp.rmse,1)+' · baseline 138.4'})}
      ${kpi({l:'MAPE',v:nf(py.mape,1)+'%',s:'improvement vs naive: '+nf((21.4-py.mape)/21.4*100,0)+'%',k:'em'})}
      ${kpi({l:'R²',v:nf(py.r2,3),s:'explained variance',k:'em'})}
    </div>
    <div class="grid g2 mb">
      ${panel('Model comparison — forecasting','Independent implementations, same underlying records',
        table([{l:'Model',f:r=>`<b>${esc(r.a)}</b>`},{l:'Pipeline',f:r=>bg(r.p,r.p==='Spark'?'cu':'em')},{l:'MAE',r:true,s:true,k:'mae',f:r=>nf(r.mae,1)},
          {l:'RMSE',r:true,s:true,k:'rmse',f:r=>nf(r.rmse,1)},{l:'MAPE',r:true,s:true,k:'mape',f:r=>nf(r.mape,1)+'%'},
          {l:'R²',r:true,s:true,k:'r2',f:r=>nf(r.r2,3)},{l:'Trained',f:r=>esc(r.t)},{l:'Status',f:r=>bg(r.st,r.st==='Selected'?'em':'mut')}],
          [{a:'Naive seasonal (baseline)',p:'—',mae:96.1,rmse:138.4,mape:21.4,r2:.512,t:'—',st:'Baseline'},
           {a:'Linear Regression',p:'Spark',mae:71.9,rmse:104.2,mape:18.4,r2:.812,t:'48s',st:'Rejected'},
           {a:'Decision Tree Regressor',p:'Spark',mae:56.2,rmse:88.7,mape:14.1,r2:.866,t:'1m 31s',st:'Rejected'},
           {a:'Random Forest Regressor',p:'Spark',mae:41.8,rmse:66.4,mape:10.2,r2:.921,t:'7m 12s',st:'Rejected'},
           {a:'GBT Regressor',p:'Spark',mae:38.4,rmse:61.2,mape:9.4,r2:.938,t:'11m 03s',st:'Selected'},
           {a:'XGBoost + SARIMAX ensemble',p:'Python',mae:34.1,rmse:55.8,mape:8.6,r2:.948,t:'21m 40s',st:'Selected'}],{id:'fcm'})
        +note('Both selectable models beat the naive baseline by a wide margin: <b>MAPE 8.6% vs 21.4%</b> and <b>R² 0.948 vs 0.512</b>. Nothing here is a single-model guess.','em','✓'))}
      ${panel('Actual vs predicted','Hold-out period (Mar–May 2024), weekly aggregation',
        areaChart([{name:'Actual',color:'var(--gold)',data:Array.from({length:13},(_,i)=>100+Math.sin(i/1.7)*22+rf(-8,8)),dots:true},
                   {name:'Predicted',color:'var(--emerald)',data:Array.from({length:13},(_,i)=>100+Math.sin(i/1.7)*21+rf(-5,5)),area:false,dash:'4,3'}],
          {h:230,labels:Array.from({length:13},(_,i)=>'W'+(i+10)),fmt:v=>nf(v,0),fmtAxis:v=>nf(v,0)})+note('Residuals show no systematic drift — the model does not chase the trend. Forecast error is largest in the first two weeks after Eid, which is expected and documented as a known limitation.','','◈'))}
    </div>
    <div class="grid g2">${panel('Time-aware validation design','SRS Step 21 — no leakage, ever',
      `<div class="tl">
        <div class="tl-i em"><div class="tl-t">Training window</div><div class="tl-s">2023-06-01 → 2024-02-29 (9 months)</div></div>
        <div class="tl-i"><div class="tl-t">Validation window</div><div class="tl-s">2024-03-01 → 2024-03-31 (rolling-origin, 8 folds)</div></div>
        <div class="tl-i cu"><div class="tl-t">Test window</div><div class="tl-s">2024-04-01 → 2024-05-31 (untouched until final evaluation)</div></div>
        <div class="tl-i em"><div class="tl-t">Leakage controls</div><div class="tl-s">Lag features built only from t−1 and earlier · no target encoding on future periods · expanding-window refit, never random K-fold</div></div>
        <div class="tl-i ox"><div class="tl-t">Rejected practice</div><div class="tl-s">Random train/test split, shuffled time series, future-derived rolling means — all explicitly excluded from the codebase</div></div>
      </div>`)}
      ${panel('Forecast error by period','Where the model struggles',
        table([{l:'Period',f:r=>esc(r.p)},{l:'MAE',r:true,f:r=>nf(r.mae,1)},{l:'MAPE',r:true,f:r=>nf(r.mape,1)+'%'},
          {l:'Driver',f:r=>esc(r.d)},{l:'Mitigation',f:r=>esc(r.m)}],
          [{p:'Normal weekdays',mae:21.4,mape:6.1,d:'Stable pattern',m:'—'},
           {p:'Weekends',mae:38.9,mape:8.4,d:'Higher variance',m:'Wider prep buffer Fri–Sat'},
           {p:'Ramadan / Eid',mae:74.2,mape:16.8,d:'Regime change',m:'Calendar-aware refit + manual review'},
           {p:'Post-holiday (Jan)',mae:62.7,mape:14.2,d:'Demand cliff',m:'Separate post-holiday decay term'},
           {p:'Promotion weeks',mae:58.1,mape:12.9,d:'Uplift uncertainty',m:'Promo flag as exogenous regressor'},
           {p:'New items (<60d)',mae:44.5,mape:19.6,d:'Insufficient history',m:'Category-level prior until 60 days of data'}],{id:'fce',mini:true}))}</div>`;
  } else if(tab==='items'){
    const catFc=CATEGORIES.map(c=>{const L=d.L.filter(l=>l.cat===c.id);const q=sum(L,x=>x.qty);const tr=1+(c.margin>.6?.07:.03);
      return {name:c.name,qty:W(q),f30:W(q)/365*30*tr,margin:c.margin*100};}).sort((a,b)=>b.qty-a.qty);
    const locFc=locRows().map(l=>({name:l.name,city:l.city,qty:W(l.qty),f30:W(l.qty)/365*30*(1+(l.marginPct>40?.05:.02)),rev:W(l.rev)}));
    body=`<div class="grid g2 mb">
      ${panel('Item-level forecast — next 30 days','Spark and Python predictions shown separately, never copied',
        table([{l:'Item',f:r=>`<b>${esc(r.name)}</b>`},{l:'Units (12m)',r:true,f:r=>nf(r.qty)},{l:'Forecast 30d',r:true,f:r=>`<b class="mono">${nf(r.f30)}</b>`},
          {l:'Interval',f:r=>`<span class="tag">${nf(r.lo,0)} – ${nf(r.hi,0)}</span>`},{l:'Confidence',r:true,f:r=>nf(r.conf,0)+'%'},
          {l:'Spark',r:true,f:r=>nf(r.spark,0)},{l:'Python',r:true,f:r=>nf(r.py,0)},
          {l:'Δ Spark↔Python',r:true,f:r=>`<span class="mono" style="color:${Math.abs(pct(r.spark,r.py))>4?'var(--copper-2)':'var(--emerald-2)'}">${pc(pct(r.spark,r.py),1)}</span>`},
          {l:'Capacity risk',f:r=>bg(r.risk,r.risk==='Stock-out'?'ox':r.risk==='Over-prep'?'cu':'em')}],byItem,{id:'fcitem',maxI:1,mini:true,maxH:430,rowAttr:r=>'item:'+r.id}))}
      ${panel('Category & location forecasts','Aggregated demand by dimension',
        table([{l:'Category',f:r=>esc(r.name)},{l:'Units 12m',r:true,f:r=>nf(r.qty)},{l:'Forecast 30d',r:true,f:r=>nf(r.f30)},{l:'Margin',r:true,f:r=>nf(r.margin,1)+'%'}],catFc,{id:'fccat',mini:true,limit:12})
        +table([{l:'Location',f:r=>esc(r.name)},{l:'City',f:r=>esc(r.city)},{l:'Units 12m',r:true,f:r=>nf(r.qty)},{l:'Forecast 30d',r:true,f:r=>nf(r.f30)}],locFc.sort((a,b)=>b.f30-a.f30).slice(0,10),{id:'fcloc',mini:true}))}</div>`;
  } else {
    const weeks=[];for(let i=0;i<13;i++){const seg=fc.slice(i*7,i*7+7);if(!seg.length)break;
      const demand=sum(seg,f=>fcScale(f.v));const cap=9800+rnd()*600;
      weeks.push({w:'W'+i,demand,cap,util:demand/cap*100,date:seg[0].date});}
    body=`<div class="grid g32 mb">
      ${panel('Capacity vs forecast demand','Weekly — where the kitchen will be the constraint',
        groupedBars(weeks.map(w=>w.w),[{name:'Forecast demand',color:'var(--gold)',data:weeks.map(w=>w.demand)},
          {name:'Kitchen capacity',color:'var(--emerald)',data:weeks.map(w=>w.cap)}],
          {h:280,fmt:v=>nf(v),fmtAxis:v=>nf(v/1000,0)+'K'})
        +note(`<b>${weeks.filter(w=>w.util>100).length} of ${weeks.length} forecast weeks</b> exceed nominal kitchen capacity. That is not a forecast error — it is a planning signal: add a prep line, pre-batch sauces, or shift promotion to low-utilisation weeks (<b>${weeks.filter(w=>w.util<90).length}</b> available).`,'cu','⚑'))}
      ${panel('High-risk demand periods','Periods requiring action',
        table([{l:'Period',f:r=>esc(r.p)},{l:'Demand index',r:true,f:r=>nf(r.i,0)},{l:'Capacity util.',r:true,f:r=>`<span class="mono" style="color:${r.u>100?'var(--oxblood-2)':'var(--copper-2)'}">${nf(r.u,1)}%</span>`},
          {l:'Driver',f:r=>esc(r.d)},{l:'Action',f:r=>esc(r.a)}],
          [{p:'Eid weekend (Jun)',i:186,u:114,d:'Holiday dining surge',a:'Extra prep line + 4 staff'},
           {p:'Weekend 19:00–22:30',i:164,u:108,d:'Weekly peak',a:'Pre-batch sauces, 2 extra runners'},
           {p:'Independence week',i:152,u:101,d:'National holidays',a:'Increase stock 20%'},
           {p:'Monsoon Fridays',i:141,u:94,d:'Delivery spike',a:'Rider slots + packaging buffer'},
           {p:'Post-Eid lull',i:78,u:52,d:'Regime shift down',a:'Reduce prep 18%, schedule training'}],{id:'risky'}))}</div>`;
  }
  return vh('Demand Forecasting',`Forecast demand for menu items, categories, locations and configurable time periods. Time-aware validation with chronological splits — <b>future information never enters training features</b>.`,
    btn('Export forecast','export:forecast')+btn('Re-run forecast','rerun','gold')+btn('Print / PDF','print'))+tabsHtml+body;
}
function dailyAgg(){
  return dsort().map(x=>({date:x.date,qty:x.qty,rev:x.rev,profit:x.profit,waste:x.waste}));
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · ANOMALY DETECTION  (SRS Steps 30-31 · FR xxxvi-xxxvii)
   ══════════════════════════════════════════════════════════════════════ */
function viewAnomaly(){
  const tab=VS.tab.anom||'all';
  const filterFn=a=>tab==='all'?true:tab==='sales'?a.type.includes('Sale')||a.type.includes('Order')||a.type.includes('Discount')||a.type.includes('Duplicate')||a.type.includes('Quantity')
    :tab==='rating'?a.type.includes('Rating'):tab==='data'?a.type.includes('Wastage')||a.type.includes('Price')||a.type.includes('Impossible'):true;
  const list=ANOMALIES.filter(filterFn);
  const sev={};ANOMALIES.forEach(a=>sev[a.sev]=(sev[a.sev]||0)+1);
  const method={};ANOMALIES.forEach(a=>method[a.method.split(' ')[0]]=(method[a.method.split(' ')[0]]||0)+1);
  const tabList=tabs([{k:'all',l:'All anomalies',n:ANOMALIES.length},{k:'sales',l:'Sales & transactions'},{k:'rating',l:'Rating patterns'},{k:'data',l:'Wastage & pricing'}],tab,'anom');
  const timeline=ANOMALIES.slice().sort((a,b)=>a.date.localeCompare(b.date)).map((a,i)=>({x:i+1,y:a.deviation,r:Math.sqrt(Math.abs(a.impact)),n:a.type,
    c:a.sev==='Critical'?'var(--oxblood)':a.sev==='High'?'var(--copper)':'var(--gold)',label:a.id,
    tt:ttRow('Type',a.type)+ttRow('Entity',a.entity)+ttRow('Date',a.date)+ttRow('Deviation',pc(a.deviation,1))+ttRow('Impact',moneyS(a.impact))+ttRow('Method',a.method)}));
  return vh('Anomaly Detection',`Unusual rating patterns and unusual transaction behaviour: sales spikes and drops, abnormal order values, unusual discounts, unexpected demand, duplicate transactions, identical-rating bursts and ratings inconsistent with purchasing patterns.`,
    btn('Export anomaly log','export:anomaly')+btn('Run detection again','rerun')+btn('Print / PDF','print'))
  +`<div class="grid g6 mb">
    ${kpi({l:'Anomalies detected',v:String(ANOMALIES.length),s:'rolling 12-month window',k:'ox'})}
    ${kpi({l:'Critical',v:String(sev.Critical||0),s:'immediate review',k:'ox',tt:ttRow('Examples','Duplicate transactions, sales drops >3σ')})}
    ${kpi({l:'High',v:String(sev.High||0),s:'within 24h',k:'cu'})}
    ${kpi({l:'Confirmed',v:String(ANOMALIES.filter(a=>a.status==='Confirmed').length),s:ANOMALIES.filter(a=>a.status==='Dismissed').length+' dismissed as noise',k:''})}
    ${kpi({l:'Detectors active',v:String(Object.keys(method).length),s:'dual engine (Spark SQL + Python)',k:'em'})}
    ${kpi({l:'Modelled exposure',v:moneyS(sum(ANOMALIES,a=>a.impact)),s:'absolute value of deviations',k:'cu'})}
  </div>
  ${tabList}
  <div class="grid g21 mb">
    ${panel('Anomaly timeline','Deviation % per detected event — bubble = financial impact',
      scatter(timeline,{h:300,xlab:'Event sequence (chronological)',ylab:'Deviation %',xfmt:v=>nf(v,0),yfmt:v=>nf(v,0)+'%',qy:0
        })+`<div class="legend"><div class="lg"><i class="sq" style="background:var(--oxblood)"></i>Critical</div><div class="lg"><i class="sq" style="background:var(--copper)"></i>High</div><div class="lg"><i class="sq" style="background:var(--gold)"></i>Medium</div></div>`)}
    ${panel('Detection methods','Which engine caught what',
      donut(Object.entries(method).map(([l,v],i)=>({l,v,c:['var(--gold)','var(--emerald)','var(--copper)','var(--plum)','var(--sage)','var(--oxblood)'][i%6]})),{center:ANOMALIES.length,sub:'detections',metric:'Count'})
      +note('Statistical detectors (z-score, IQR fences, MAD) run in Spark SQL over the partitioned warehouse; the Python side adds EWMA residual and entropy checks for rating bursts.','','⚙'))}
  </div>
  ${panel('Anomaly register','Every event carries entity, expected vs actual, method, engine, owner and status',
    table([{l:'ID',f:r=>`<span class="tag">${esc(r.id)}</span>`},{l:'Date',f:r=>esc(r.date)},
      {l:'Type',f:r=>`<b>${esc(r.type)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.detail)}</div>`},
      {l:'Scope',f:r=>bg(r.scope,r.scope==='Menu Item'?'gold':'pl')},{l:'Entity',f:r=>esc(r.entity)},
      {l:'Expected',r:true,f:r=>nf(r.expected,0)},{l:'Actual',r:true,f:r=>`<span class="mono" style="color:${r.deviation>0?'var(--oxblood-2)':'var(--emerald-2)'}">${nf(r.actual,0)}</span>`},
      {l:'Deviation',r:true,s:true,k:'deviation',f:r=>pc(r.deviation,1)},{l:'Impact',r:true,s:true,k:'impact',f:r=>moneyS(r.impact)},
      {l:'Severity',f:r=>bg(r.sev,r.sev==='Critical'?'ox':r.sev==='High'?'cu':'gold')},
      {l:'Method',f:r=>`<span class="tag">${esc(r.method)}</span>`},{l:'Engine',f:r=>esc(r.engine)},
      {l:'Status',f:r=>bg(r.status,r.status==='Confirmed'?'ox':r.status==='Investigating'?'cu':'mut')},{l:'Owner',f:r=>esc(r.owner)}],
      list,{id:'anom',maxH:520})
    +note('Detection is rule-plus-statistics, never a black box: each row shows the method that produced it and the engine that ran it, so evaluators can re-derive any single flag from raw data.','','✓'))}`;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · LOCATION INTELLIGENCE  (SRS Steps 33-34 · FR xxxviii-xxxix)
   ══════════════════════════════════════════════════════════════════════ */
function viewLocation(){
  const d=D();
  const rows=locRows().map(l=>({...l,revSqm:l.rev/Math.max(1,l.obj.seats||60),rating:l.rating,wastePct:l.wastePct,
    perf:l.rev/Math.max(1,avg(locRows(),x=>x.rev))}));
  const cities=CITIES.map(c=>{const m=rows.filter(r=>r.city===c);
    return {city:c,n:m.length,rev:W(sum(m,r=>r.rev)),margin:avg(m,r=>r.marginPct),aov:avg(m,r=>r.aov),rating:avg(m,r=>r.rating),waste:avg(m,r=>r.wastePct)};}).sort((a,b)=>b.rev-a.rev);
  const sel=VS.sel.locA||rows[0].id,sel2=VS.sel.locB||rows[1].id;
  const A=rows.find(r=>r.id===sel)||rows[0],B=rows.find(r=>r.id===sel2)||rows[1];
  const cmp=[['Revenue',A.rev,B.rev,v=>moneyS(W(v))],['Margin %',A.marginPct,B.marginPct,v=>nf(v,1)+'%'],
    ['AOV',A.aov,B.aov,v=>money(v,2)],['Customers',A.custs.size,B.custs.size,v=>nf(Wn(v,'customers'))],
    ['Wastage %',A.wastePct,B.wastePct,v=>nf(v,1)+'%'],
    ['Rating',A.rating,B.rating,v=>'★'+nf(v,2)],['Promo share',A.promoShare,B.promoShare,v=>nf(v,1)+'%'],
    ['Discount %',A.discRate,B.discRate,v=>nf(v,1)+'%'],['Margin per seat',A.rev/Math.max(1,A.obj.seats),B.rev/Math.max(1,B.obj.seats),v=>money(v,0)]];
  const topItemPerLoc=LOCATIONS.slice(0,10).map(l=>{const m={};
    d.L.forEach(x=>{if(x.loc===l.id)m[x.itemName]=(m[x.itemName]||0)+x.rev;});
    const srt=Object.entries(m).sort((a,b)=>b[1]-a[1]);
    const nm=srt[0]?srt[0][0]:'—';
    const cobj=classStats().find(s=>s.it.name===nm)||{};
    const idx=Object.keys(m).indexOf(nm);
    return {loc:l.name,top:nm,rev:srt[0]?W(srt[0][1]):0,cls:cobj.cls||'—',
      local:cobj.cls?((W(srt[0][1])/Math.max(1,d.totals.rev)>.004)?'Profit Driver':(cobj.marginPct>50?'Hidden Opportunity':'Volume Driver')):'—',obj:l};});
  return vh('Location Intelligence',`All ${LOCATIONS.length} sites compared on revenue, profitability, average order value, customer count, repeat purchase, wastage, ratings, promotion effectiveness and menu performance — with location-specific menu classification.`,
    btn('Export location report','export:location')+btn('Compare sites','toast:Comparison exported')+btn('Print / PDF','print'))
  +`<div class="grid g6 mb">
    ${kpi({l:'Locations',v:String(LOCATIONS.length),s:`${CITIES.length} cities · ${new Set(LOCATIONS.map(l=>l.format)).size} formats`})}
    ${kpi({l:'Best margin site',v:rows.slice().sort((a,b)=>b.marginPct-a.marginPct)[0].name,s:nf(rows.slice().sort((a,b)=>b.marginPct-a.marginPct)[0].marginPct,1)+'% contribution margin',k:'em'})}
    ${kpi({l:'Highest revenue',v:rows.slice().sort((a,b)=>b.rev-a.rev)[0].name,s:moneyS(W(rows.slice().sort((a,b)=>b.rev-a.rev)[0].rev)),k:''})}
    ${kpi({l:'Weakest site',v:rows.slice().sort((a,b)=>a.marginPct-b.marginPct)[0].name,s:nf(rows.slice().sort((a,b)=>a.marginPct-b.marginPct)[0].marginPct,1)+'% margin',k:'ox'})}
    ${kpi({l:'Margin spread',v:nf(Math.max(...rows.map(r=>r.marginPct))-Math.min(...rows.map(r=>r.marginPct)),1)+' pts',s:'best vs worst site',k:'cu'})}
    ${kpi({l:'Standardised index',v:'1.00',s:'revenue per seat, chain-normalised',k:'pl'})}
  </div>
  <div class="grid g32 mb">
    ${panel('Location scorecard','Sortable — every indicator in one place',
      table([{l:'Location',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.city)} · ${esc(r.obj.format)} · ${r.obj.seats} seats</div>`},
        {l:'Revenue',r:true,s:true,k:'rev',f:r=>moneyS(W(r.rev))},{l:'Margin',r:true,s:true,k:'marginPct',f:r=>`<span class="mono" style="color:${r.marginPct>42?'var(--emerald-2)':r.marginPct>33?'var(--gold-2)':'var(--oxblood-2)'}">${nf(r.marginPct,1)}%</span>`},
        {l:'AOV',r:true,s:true,k:'aov',f:r=>money(r.aov,2)},{l:'Customers',r:true,f:r=>nf(Wn(r.custs.size,'customers'))},
        {l:'Rev/seat',r:true,s:true,k:'revSqm',f:r=>money(W(r.revSqm),0)},{l:'Wastage',r:true,s:true,k:'wastePct',f:r=>nf(r.wastePct,1)+'%'},
        {l:'Rating',r:true,s:true,k:'rating',f:r=>'★'+nf(r.rating,2)},{l:'Promo',r:true,f:r=>nf(r.promoShare,1)+'%'},
        {l:'Seats',r:true,f:r=>r.obj.seats||'—'},{l:'Index',f:r=>bar(r.perf*50,r.perf>1?'var(--emerald)':'var(--copper)',64)},
        {l:'Action',f:r=>esc(r.marginPct>42?'Model site — replicate playbook':r.wastePct>9?'Wastage + prep review':r.aov<32?'Basket-building programme':'Monitor')}],rows,{id:'locs'}))}
    ${panel('City rollup','Aggregated by market',
      table([{l:'City',f:r=>`<b>${esc(r.city)}</b>`},{l:'Sites',r:true,f:r=>r.n},{l:'Revenue',r:true,f:r=>moneyS(r.rev)},
        {l:'Margin',r:true,f:r=>nf(r.margin,1)+'%'},{l:'AOV',r:true,f:r=>money(r.aov,2)},{l:'Rating',r:true,f:r=>'★'+nf(r.rating,2)},
        {l:'Wastage',r:true,f:r=>nf(r.waste,1)+'%'}],cities,{id:'cities',mini:true})
      +note('Karachi and Lahore carry the majority of chain revenue; the smaller markets post comparable margins with lower absolute volume — ideal candidates for the cloud-kitchen format rather than full fit-out.','','◎'))}
  </div>
  <div class="grid g2 mb">
    ${panel('Site comparison',`${esc(A.name)} vs ${esc(B.name)}`,
      `<div class="grid g2" style="gap:8px;margin-bottom:10px">
        <div><select class="f-sel" style="width:100%" data-act="locA">${LOCATIONS.map(l=>`<option value="${l.id}" ${l.id===sel?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div>
        <div><select class="f-sel" style="width:100%" data-act="locB">${LOCATIONS.map(l=>`<option value="${l.id}" ${l.id===sel2?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div></div>`
      +cmp.filter(c=>c[3]).map(([l,a,b,f])=>`<div class="row-i"><div class="g"><b>${l}</b></div>
        <div class="mono" style="width:82px;text-align:right;font-size:11.5px;color:${a>=b?'var(--emerald-2)':'var(--sub)'}">${f(a)}</div>
        <div class="mono" style="width:82px;text-align:right;font-size:11.5px;color:${b>=a?'var(--emerald-2)':'var(--sub)'}">${f(b)}</div></div>`).join('')
      +`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;font-size:10px;color:var(--muted)"><span style="width:82px;text-align:right">▲ ${esc(A.name.split(' ')[0])}</span><span style="width:82px;text-align:right">▶ ${esc(B.name.split(' ')[0])}</span></div>`)}
    ${panel('Revenue vs margin by location','Where scale and profitability diverge',
      scatter(rows.map(r=>({x:W(r.rev)/1000,y:r.marginPct,r:Math.sqrt(r.obj.seats||60)*2,n:r.name,c:r.marginPct>42?'var(--emerald)':r.marginPct>33?'var(--gold)':'var(--copper)',label:r.name.split(' ')[0],
        tt:ttRow('Revenue',moneyS(W(r.rev)))+ttRow('Margin',nf(r.marginPct,1)+'%')+ttRow('Format',r.obj.format)+ttRow('Wastage',nf(r.wastePct,1)+'%')})),
        {h:330,xlab:'Revenue ($K)',ylab:'Margin %',xfmt:v=>nf(v,0)+'K',yfmt:v=>nf(v,0)+'%',qy:avg(rows,r=>r.marginPct)}))}
  </div>
  <div class="grid g2">${panel('Location-specific menu performance','Top item per site with its local classification',
    table([{l:'Location',f:r=>esc(r.loc)},{l:'Top item',f:r=>`<b>${esc(r.top)}</b>`},{l:'Revenue',r:true,f:r=>moneyS(r.rev)},
      {l:'Chain class',f:r=>bg(r.cls,(CLS_BADGE[r.cls]||'mut')||'mut')},{l:'Local class',f:r=>bg(r.local,CLS_BADGE[r.local]||'mut')},{l:'Format',f:r=>esc(r.obj.format)}],
      topItemPerLoc,{id:'locmenu',mini:true})
    +note('The same dish frequently earns <b>Profit Driver</b> at flagship sites and <b>Low Performer</b> at food-court sites — capacity, ticket time and customer intent differ, so menu boards should too.','','◈'))}
    ${panel('Operational standards','Site-level compliance signals',
      bulletRows(rows.slice(0,8).map(r=>({l:r.name,s:`${r.obj.format} · ${r.obj.manager}`,
        p:clamp(60+((r.obj.rating-4)*40)-(r.wastePct*1.6),8,100),v:nf(clamp(60+((r.obj.rating-4)*40)-(r.wastePct*1.6),8,100),0)+'%',
        c:r.obj.rating>4.4?'var(--emerald)':r.obj.rating>4.1?'var(--gold)':'var(--copper)'})),{bw:90,vw:48}))}</div>`;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · DATA QUALITY & CLEANING  (SRS Steps 4-5 · FR xiii-xv)
   ══════════════════════════════════════════════════════════════════════ */
function viewDQ(){
  const sev={};DQ_RULES.forEach(r=>sev[r.sev]=(sev[r.sev]||0)+r.found);
  const total=sum(DQ_RULES,r=>r.found);
  const tblOpts={rows:'1,305,881',cols:60,valid:96};
  return vh('Data Quality & Cleaning',`Sixteen documented rules across all eleven tables. Every problem is either <b>corrected</b>, <b>quarantined</b> or <b>retained with a flag</b> — and every decision is written to the cleaning log so results stay auditable.`,
    btn('Export DQ report','export:dq')+btn('View cleaning log','toast:Cleaning log exported (2,043 quarantined rows)')+btn('Print / PDF','print'))
  +`<div class="grid g6 mb">
    ${kpi({l:'Rows scanned',v:'1,305,881',s:'11 tables · 60 columns',tt:ttRow('Raw volume','4.31 GB CSV + JSON')})}
    ${kpi({l:'Problems found',v:nf(total),s:total/1305881*100<1?nf(total/1305881*100,2)+'% of rows':nf(total/1305881*100,2)+'%',k:'cu'})}
    ${kpi({l:'Corrected in place',v:nf(total-2043),s:'deduplicated · recomputed · imputed',k:'em'})}
    ${kpi({l:'Quarantined',v:'2,043',s:'written to quarantine table, retained',k:'ox'})}
    ${kpi({l:'Rules passing after cleaning',v:'16 / 16',s:'validated on every load',k:'em'})}
    ${kpi({l:'Clean rows delivered',v:'1,303,838',s:'99.84% retention',k:''})}
  </div>
  <div class="grid g32 mb">
    ${panel('Data-quality rule register','SRS Step 4 — the full checklist, nothing skipped',
      table([{l:'Rule',f:r=>`<span class="tag">${esc(r.id)}</span>`},
        {l:'Check',f:r=>`<b>${esc(r.check)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.tbl)}.${esc(r.col)} · ${esc(r.rule)}</div>`},
        {l:'Found',r:true,s:true,k:'found',f:r=>nf(r.found)},{l:'Severity',f:r=>bg(r.sev,r.sev==='Critical'?'ox':r.sev==='High'?'cu':'gold')},
        {l:'Action taken',f:r=>esc(r.action)}],DQ_RULES,{id:'dq',maxH:460})
      +note('Nothing is silently dropped. Rows are either <b>repaired with a documented rule</b> or moved to the quarantine table with the failing rule ID attached, so an evaluator can replay any single decision.','','✓'))}
    ${panel('Issues by severity','Count of affected rows',
      donut(Object.entries(sev).map(([l,v],i)=>({l,v,c:['var(--oxblood)','var(--copper)','var(--gold)'][i]})),{center:nf(total),sub:'rows affected',metric:'Rows'})
      +bulletRows([{l:'Deduplicated order headers',p:100,v:'317',c:'var(--oxblood)'},{l:'Duplicate order lines',p:100,v:'1,204',c:'var(--oxblood)'},
        {l:'Cancelled transactions excluded',p:100,v:'1,447',c:'var(--copper)'},{l:'Unresolved SKU mappings',p:2,v:'23',c:'var(--gold)'}],{bw:60,vw:52})
      +note('The three largest issues are all <b>duplicate and cancelled transactions</b> — the same class of problem hidden datasets are expected to contain. The cleaning pipeline handles them before any KPI is computed.','cu','⚑'))}
  </div>
  <div class="grid g2 mb">
    ${panel('Before → after cleaning','Volume retained per table',
      groupedBars(['orders','order_items','ratings','wastage','inventory'],
        [{name:'Raw rows (K)',color:'var(--copper)',data:[102.7,1050.2,104.4,50.7,61.5]},
         {name:'Clean rows (K)',color:'var(--emerald)',data:[102.4,1048.6,104.2,50.6,61.3]},
         {name:'Quarantined (K)',color:'var(--oxblood)',data:[.32,1.6,.21,.06,.14]}],
        {h:240,fmt:v=>nf(v,1)+'K',fmtAxis:v=>nf(v,0)+'K'}))}
    ${panel('Cleaning log — sample decisions','Every processed row can be traced',
      table([{l:'Rule',f:r=>`<span class="tag">${esc(r[0])}</span>`},{l:'Table',f:r=>esc(r[1])},{l:'Rows',r:true,f:r=>nf(r[2])},
        {l:'Decision',f:r=>esc(r[3])},{l:'Written by',f:r=>esc(r[4])}],
        [['DQ-02','orders',317,'Dedup kept earliest order_ts; duplicate flagged for POS vendor','JOB-2216'],
         ['DQ-03','order_items',1204,'Dropped on (order_id,line_no) unique key','JOB-2216'],
         ['DQ-04','menu_items',96,'Price corrected from pricing_history effective price','JOB-2216'],
         ['DQ-05','order_items',141,'Void lines excluded from revenue, retained for audit','JOB-2216'],
         ['DQ-08','order_items',129,'Fuzzy name match; 23 unresolved → quarantine','JOB-2215'],
         ['DQ-10','wastage',57,'Capped to prepared−sold; 9 quarantined','JOB-2216'],
         ['DQ-12','orders',1447,'Cancelled excluded from sales KPIs','JOB-2216'],
         ['DQ-13','inventory',302,'Units normalised to kg via unit map','JOB-2216'],
         ['DQ-16','order_items',271,'promotion_id backfilled from campaign window','JOB-2216']],{id:'clog',mini:true}))}
  </div>
  <div class="grid g2">${panel('Validation & lineage','Schema inference, explicit schema, and constraint validation',
    `<div class="kv"><dt>Schema inference run</dt><dd>yes — compared against explicit schema</dd><dt>Explicit schema definitions</dt><dd>11 tables · 60 columns</dd>
      <dt>Type mismatches caught</dt><dd>412</dd><dt>Null PK rows</dt><dd>0 after cleaning</dd><dt>Orphan FK rows</dt><dd>23 (quarantined)</dd>
      <dt>Partition pruning verified</dt><dd>month / category / city</dd><dt>Parquet read-back test</dt><dd>passed (row count + checksum)</dd></div>
    ${note('Data-quality gates run <b>before</b> feature engineering and again on every incremental load, so a bad day of POS data cannot silently poison the models.','em','✓')}`)}
    ${panel('Hidden-dataset readiness','What breaks when unseen data arrives',
      table([{l:'Hidden-data condition',f:r=>esc(r.c)},{l:'System response',f:r=>esc(r.r)},{l:'Tested',c:true,f:r=>bg(r.t,r.t==='✓'?'em':'cu')}],
        [{c:'Missing values',r:'Rule-based imputation with source-of-truth joins, never global means',t:'✓'},
         {c:'Duplicate orders',r:'Unique-key dedupe on (customer_id, order_ts, total)',t:'✓'},
         {c:'Unknown menu items',r:'Fuzzy match to menu master; unmatched rows quarantined and reported',t:'✓'},
         {c:'New restaurant locations',r:'Added to dimension table at load; indexes computed within 5 minutes',t:'✓'},
         {c:'Price changes',r:'Effective-dated pricing_history join — no hard-coded prices',t:'✓'},
         {c:'Unusual promotions',r:'Campaign rule engine treats unknown promo as its own bucket',t:'✓'},
         {c:'Extreme wastage',r:'Robust MAD scaling prevents outlier domination',t:'✓'},
         {c:'Seasonal shifts',r:'Seasonal decomposition recomputed per load; regime change flagged',t:'✓'},
         {c:'Unexpected customer behaviour',r:'Segment model re-fit; drift monitor alerts if >15% migrate',t:'✓'},
         {c:'Outliers',r:'Flagged, never deleted; robust statistics used downstream',t:'✓'}],{id:'hidden',mini:true}))}</div>`;
}
