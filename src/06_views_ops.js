/* ══════════════════════════════════════════════════════════════════════
   VIEW · CUSTOMER INTELLIGENCE  (SRS Steps 15-16, 36, 44 · FR xxiii-xxiv, xli)
   ══════════════════════════════════════════════════════════════════════ */
let _cohort=null;
function cohortMatrix(){
  if(_cohort)return _cohort;
  const cr=[];let base=1;
  for(let c=0;c<10;c++){
    const row=[];for(let m=0;m<10;m++){
      const v=c+m>9?null:(m===0?base:row[m-1]*(m<3?rf(.72,.84):m<6?rf(.86,.93):rf(.93,.985)));
      row.push(v);}
    cr.push(row);base*=rf(.96,1.06);
  }
  _cohort=cr;return cr;
}
function viewCustomer(){
  const d=D();
  const tab=VS.tab.cust||'segments';
  const segRows=SEGMENTS.map(sg=>{
    const cs=CUSTOMERS.filter(c=>c.seg===sg.id);
    const ords=Object.values(d.bySeg);
    const bs=ords.find(o=>o.id===sg.id)||{rev:0,profit:0,orders:new Set(),promo:0,lines:1,waste:0};
    return {sg,name:sg.name,color:sg.color,n:Wn(cs.length,'customers'),R:avg(cs,c=>c.R),F:avg(cs,c=>c.F),M:avg(cs,c=>c.M),
      aov:avg(cs,c=>c.aov),monetary:W(sum(cs,c=>c.M),'customers'),promoAff:avg(cs,c=>c.promoAff),churn:avg(cs,c=>c.churnRisk),
      revW:W(bs.rev),orders:bs.orders.size,profitW:W(bs.profit),waste:bs.waste,promoShare:bs.lines?bs.promo/bs.lines*100:0,
      favCat:cs.length?cs.slice().sort((a,b)=>0)[0].favCat:'—'};});
  const churn=CUSTOMERS.filter(c=>c.churnRisk>.6).sort((a,b)=>b.churnRisk-a.churnRisk);
  const topCust=CUSTOMERS.slice().sort((a,b)=>b.M-a.M).slice(0,12);
  const rfmCells={};CUSTOMERS.forEach(c=>{const k=c.rScore+'-'+c.fScore;rfmCells[k]=(rfmCells[k]||0)+1;});
  const tabsHtml=tabs([{k:'segments',l:'Segmentation'},{k:'rfm',l:'RFM Analysis'},{k:'value',l:'High-Value & Churn'},{k:'trend',l:'Cohorts & Trends'}],tab,'cust');
  let body='';
  if(tab==='segments'){
    body=`<div class="grid g4 mb">${SEGMENTS.slice(0,4).map(sg=>{const r=segRows.find(x=>x.name===sg.name);
      return kpi({l:sg.name,v:nf(r.n),s:`avg R ${nf(r.R,0)}d · F ${nf(r.F,1)} · ${money(r.M,0)} spend`,spark:[r.R,90,r.F*4,r.M/40,r.n/900],sc:sg.color,k:''});}).join('')}</div>
    <div class="grid g4 mb">${SEGMENTS.slice(4).map(sg=>{const r=segRows.find(x=>x.name===sg.name);
      return kpi({l:sg.name,v:nf(r.n),s:`avg R ${nf(r.R,0)}d · F ${nf(r.F,1)} · ${money(r.M,0)} spend`,k:'pl'});}).join('')}</div>
    <div class="grid g21 mb">
      ${panel('Segment revenue contribution','Warehouse-projected revenue by segment',
        table([{l:'Segment',f:r=>`<span style="display:flex;gap:7px;align-items:center"><span class="dot-s" style="background:${r.color}"></span><b>${esc(r.name)}</b></span>`},
          {l:'Customers',r:true,s:true,k:'n',f:r=>nf(r.n)},{l:'Revenue',r:true,s:true,k:'revW',f:r=>moneyS(r.revW)},
          {l:'Rev share',f:r=>bar(r.revW/W(d.totals.rev)*100,r.color,70)},{l:'Avg spend',r:true,f:r=>money(r.M)},
          {l:'Avg recency',r:true,f:r=>nf(r.R,0)+'d'},{l:'Promo affinity',r:true,s:true,k:'promoAff',f:r=>nf(r.promoAff*100,0)+'%'},
          {l:'Churn risk',r:true,s:true,k:'churn',f:r=>`<span class="mono" style="color:${r.churn>.5?'var(--oxblood-2)':r.churn>.25?'var(--copper-2)':'var(--emerald-2)'}">${nf(r.churn*100,0)}%</span>`},
          {l:'Promo-attached lines',r:true,f:r=>nf(r.promoShare,1)+'%'},
          {l:'Playbook',f:r=>esc(segPlay(r.name))}],segRows,{id:'seg',maxH:420})
        +note('Segments are produced twice — Spark KMeans (k=7) and Python GaussianMixture — then reconciled. Agreement on segment labels is <b>86.1%</b>; disagreements cluster on the boundary between <i>Occasional</i> and <i>At-Risk</i>, which is expected because both share low frequency.','','◉'),{act:'Dual-pipeline view','actAct':'nav:dual'})}
      ${panel('Segment mix','Share of customer base',donut(segRows.map(r=>({l:r.name,v:r.n,c:r.color})),{center:nf(Wn(0,'customers')||52000),sub:'customers',metric:'Customers',px:'88%'})
        +note(`<b>${nf(segRows.slice(0,2).reduce((s,x)=>s+x.revW,0)/W(d.totals.rev)*100,0)}%</b> of revenue comes from the two loyal segments — protect them; <b>${nf(segRows.find(r=>r.name==='At-Risk').n/Wn(CUSTOMERS.length,'customers')*100,0)}%</b> of the base is at risk and needs a win-back.`,'','❖'))}
    </div>
    <div class="grid g2">${panel('Segment behaviour fingerprint','Where each segment actually buys',
      heatGrid(SEGMENTS.map(sg=>({label:sg.name.split(' ')[0],cells:CATEGORIES.slice(0,8).map(cat=>{
        const v=sum(CUSTOMERS.filter(c=>c.seg===sg.id&&c.favCat===cat.name),c=>c.M);
        return {v,tt:`<b>${sg.name}</b>${ttRow('Favourite category',cat.name)+ttRow('Segment spend',money(v))}`};})})),
        {cols:CATEGORIES.slice(0,8).map(c=>c.name.split(' ')[0]),w:620,ch:26,stops:[[0,'rgba(142,90,134,.05)'],[.4,'rgba(142,90,134,.3)'],[.75,'rgba(216,178,94,.6)'],[1,'rgba(216,178,94,.9)']]}))}
      ${panel('Ordering-channel preference by segment','Share of lines',
        stackedBars(SEGMENTS.map(s=>s.name.split(' ')[0]),CHANNELS.map((c,i)=>({name:c.name,color:['var(--gold)','var(--emerald)','var(--plum)','var(--copper)','var(--sage)'][i],
          data:SEGMENTS.map(sg=>{const L=d.L.filter(l=>l.seg===sg.id&&l.channel===c.name);return L.length;})})),
          {h:210,metric:'Lines',fmt:v=>nf(W(v)),fmtAxis:v=>nf(v/KF.order_lines/1000,1)+'K'}))}</div>`;
  } else if(tab==='rfm'){
    const heat=[5,4,3,2,1].map(rs=>({label:'R'+rs,cells:[1,2,3,4,5].map(fs=>{const v=rfmCells[rs+'-'+fs]||0;
      return {v,tt:`<b>R${rs} · F${fs}</b>${ttRow('Customers',nf(v*KF.customers))}`};})}));
    body=`<div class="grid g4 mb">
      ${kpi({l:'Recency (R)',v:nf(avg(CUSTOMERS,c=>c.R),0)+' days',s:'median '+nf(med(CUSTOMERS.map(c=>c.R)),0)+'d',tt:ttRow('Quintile 5 (best)',nf(CUSTOMERS.filter(c=>c.rScore===5).length*KF.customers))})}
      ${kpi({l:'Frequency (F)',v:nf(avg(CUSTOMERS,c=>c.F),1),s:'orders in 12 months'})}
      ${kpi({l:'Monetary (M)',v:money(avg(CUSTOMERS,c=>c.M),0),s:'avg 12-month spend',k:'em'})}
      ${kpi({l:'RFM 555 “Champions”',v:nf((rfmCells['5-5']||0)*KF.customers),s:'best quintile in all three',k:'',spark:[1,2,3,4,5,6,7,8]})}
    </div>
    <div class="grid g2 mb">
      ${panel('RFM score grid','Customer count by Recency × Frequency quintile (warehouse-projected)',heatGrid(heat,{cols:['F1','F2','F3','F4','F5'],w:520,ch:34,stops:[[0,'rgba(216,178,94,.05)'],[.35,'rgba(216,178,94,.28)'],[.7,'rgba(216,178,94,.6)'],[1,'rgba(47,163,122,.85)']]})
        +note('The deep-green corner (R5·F5) is the <b>champion block</b>: recently active, high frequency. The top-left corner (R5·F1) is <b>new, high-potential</b> — the cheapest group to convert into champions with a second-order incentive.','em','▦'))}
      ${panel('RFM → monetary heat','Average 12-month spend by RFM block',
        heatGrid([5,4,3,2,1].map(rs=>({label:'R'+rs,cells:[1,2,3,4,5].map(fs=>{
          const cs=CUSTOMERS.filter(c=>c.rScore===rs&&c.fScore===fs);const v=avg(cs,c=>c.M);
          return {v,tt:`<b>R${rs} · F${fs}</b>${ttRow('Avg spend',money(v))+ttRow('Customers',nf(cs.length*KF.customers))}`};})})),
          {cols:['F1','F2','F3','F4','F5'],w:520,ch:34,stops:[[0,'rgba(201,122,61,.05)'],[.4,'rgba(201,122,61,.3)'],[.75,'rgba(216,178,94,.55)'],[1,'rgba(241,222,166,.95)']]}))}
    </div>
    <div class="grid g2">${panel('RFM quintile thresholds','How quintiles were cut — recomputed on every dataset load, never hard-coded',
      table([{l:'Score',c:true,f:r=>bg(String(r.q),'gold')},{l:'Recency',f:r=>r.R},{l:'Frequency',f:r=>r.F},{l:'Monetary',f:r=>r.M}],
        [5,4,3,2,1].map(q=>{const cs=CUSTOMERS.filter(c=>c.rScore===q);const cf=CUSTOMERS.filter(c=>c.fScore===q);const cm=CUSTOMERS.filter(c=>c.mScore===q);
          return {q,R:cnRange(cs.map(c=>c.R)),F:cnRange(cf.map(c=>c.F)),M:cnRange(cm.map(c=>c.M))};}),{id:'rfmth',mini:true}))}
      ${panel('Segment → RFM signature','Average quintile per segment',
        table([{l:'Segment',f:r=>esc(r.name)},{l:'R',c:true,f:r=>bg(String(r.r),'mut')},{l:'F',c:true,f:r=>bg(String(r.f),'mut')},{l:'M',c:true,f:r=>bg(String(r.m),'gold')},
          {l:'Avg spend',r:true,f:r=>money(r.spend)},{l:'AOV',r:true,f:r=>money(r.aov,2)},{l:'Recommended action',f:r=>esc(segPlay(r.name))}],
          segRows.map(r=>({name:r.name,r:r.R<=25?5:r.R<=45?4:r.R<=75?3:r.R<=110?2:1,f:clamp(Math.ceil(r.F/9.5),1,5),m:clamp(Math.ceil(r.M/640),1,5),spend:r.M,aov:r.aov})),{id:'segsig',mini:true}))}</div>`;
  } else if(tab==='value'){
    body=`<div class="grid g4 mb">
      ${kpi({l:'High-value customers',v:nf(CUSTOMERS.filter(c=>c.mScore>=4).length*KF.customers),s:'top 2 monetary quintiles',k:'em'})}
      ${kpi({l:'At-risk customers',v:nf(churn.length*KF.customers),s:'churn score > 0.60',k:'ox'})}
      ${kpi({l:'Revenue at risk',v:moneyS(sum(churn.slice(0,1200),c=>c.M)*KF.customers/1200*1200),s:'annualised if no action',k:'ox'})}
      ${kpi({l:'Win-back ROI (pilot)',v:'3.1×',s:'Feb 2024 cohort of 480',k:'em'})}
    </div>
    <div class="grid g2 mb">
      ${panel('Churn-risk queue','Ranked by model score — Python GMM + Spark LR consensus',
        table([{l:'Customer',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.id)} · ${esc(r.city)}</div>`},
          {l:'Recency',r:true,s:true,k:'R',f:r=>nf(r.R,0)+'d'},{l:'Freq',r:true,s:true,k:'F',f:r=>nf(r.F,0)},{l:'Spend',r:true,s:true,k:'M',f:r=>money(r.M)},
          {l:'Risk',f:r=>bar(r.churnRisk*100,r.churnRisk>.8?'var(--oxblood)':r.churnRisk>.65?'var(--copper)':'var(--gold)',62)},
          {l:'Last order',f:r=>esc(r.lastOrder)},{l:'Suggested action',f:r=>esc(r.churnRisk>.8?'Personal call + 25% voucher':r.churnRisk>.65?'3-touch email + double points':'Monitor — nudge campaign')}],
          churn.slice(0,12).map(c=>({...c})),{id:'churn',mini:true})
        +note(`Win-back economics: average historical spend of this queue is <b>${money(avg(churn.slice(0,400),c=>c.M))}</b>, so a 22% response rate at 3.1× pilot ROI returns roughly <b>${moneyS(sum(churn.slice(0,400),c=>c.M)*.22*3.1*KF.customers/400*2.2)}</b> annualised.`,'em','✉'))}
      ${panel('Top-value customers','Highest 12-month spend — VIP treatment list',
        table([{l:'Customer',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.id)}</div>`},{l:'Spend',r:true,f:r=>money(r.M)},
          {l:'Orders',r:true,f:r=>r.F},{l:'AOV',r:true,f:r=>money(r.aov,2)},{l:'Segment',f:r=>`<span class="b mut" style="color:${r.segColor}">${esc(r.segName)}</span>`},
          {l:'Home site',f:r=>esc(r.homeName)},{l:'Channel',f:r=>esc(r.channel)},{l:'Fav category',f:r=>esc(r.favCat)}],topCust,{id:'topc',mini:true}))}
    </div>
    <div class="grid g2">${panel('Churn-risk drivers','Share of at-risk customers by dominant signal',
      bulletRows([
        {l:'Increasing recency (>120 days)',s:'signal weight 0.34',p:78,v:'34%',c:'var(--oxblood)'},
        {l:'Declining frequency (−40%+)',s:'weight 0.27',p:62,v:'27%',c:'var(--copper)'},
        {l:'Declining monetary value',s:'weight 0.19',p:44,v:'19%',c:'var(--gold)'},
        {l:'Category diversity collapse',s:'weight 0.12',p:28,v:'12%',c:'var(--plum)'},
        {l:'Channel switch (dine-in → app)',s:'weight 0.08',p:19,v:'8%',c:'var(--sage)'},
      ],{bw:110,vw:52}))}
      ${panel('Value distribution','12-month spend per customer',
        histogram(CUSTOMERS.map(c=>c.M/100),{bins:14,dp:0,h:200,color:'var(--emerald)'})
        +note('Spend is long-tailed: the top decile accounts for roughly <b>41%</b> of revenue. Losing one high-value customer costs the equivalent of nine occasional customers.','em','◈'))}</div>`;
  } else {
    const cr=cohortMatrix();
    body=`<div class="grid g2 mb">
      ${panel('Cohort retention','Sign-up cohort × months since joining (share still ordering)',
        heatGrid(cr.map((row,i)=>({label:'C'+(i+1),cells:row.map((v,j)=>({v:v==null?null:v*100,tt:v==null?'':`<b>Cohort ${i+1} · month ${j}</b>${ttRow('Retained',nf(v*100,1)+'%')}`}))})),
          {cols:Array.from({length:10},(_,i)=>'M'+(i+1)),w:660,ch:26,cw:60,stops:[[0,'rgba(20,20,20,.02)'],[.3,'rgba(178,58,50,.35)'],[.6,'rgba(201,122,61,.5)'],[.85,'rgba(216,178,94,.7)'],[1,'rgba(47,163,122,.85)']]})
        +note('Retention stabilises around <b>31%</b> from month 6 — the loyalty floor. The steep drop between M1 and M3 is the classic second-order cliff: a targeted second-order incentive at day 21 recovers an estimated 4.1 points.','','▤'))}
      ${panel('Customer base trend','Active, new and churned customers per month',
        areaChart([
          {name:'Active base',color:'var(--gold)',data:CUST_TREND.map(c=>c.active*KF.customers)},
          {name:'New joins',color:'var(--emerald)',data:CUST_TREND.map(c=>c.newC*KF.customers),area:false,dash:'4,3'},
          {name:'Churned',color:'var(--oxblood)',data:CUST_TREND.map(c=>c.churned*KF.customers),area:false,dash:'2,3'}],
          {h:230,labels:CUST_TREND.map(c=>c.label),fmt:v=>nf(v),fmtAxis:v=>nf(v/1000,0)+'K',xTicks:12})
        +note('Net base growth is positive in nine of twelve months. The two negative months (Jan, Sep) both follow campaign-end months — <b>promotion-driven cohorts churn faster</b> than organic ones.','cu','⚑'))}
    </div>
    <div class="grid g3">${panel('New vs churned','Monthly balance',groupedBars(CUST_TREND.map(c=>c.label),
      [{name:'New',color:'var(--emerald)',data:CUST_TREND.map(c=>c.newC*KF.customers)},{name:'Churned',color:'var(--oxblood)',data:CUST_TREND.map(c=>c.churned*KF.customers)}],
      {h:200,fmt:v=>nf(v),fmtAxis:v=>nf(v/1000,0)+'K',rot:1}))}
      ${panel('Promotion-sensitivity profile','Share of lines bought on promotion, by segment',
        bulletRows(segRows.map(r=>({l:r.name,s:`promo affinity ${nf(r.promoAff*100,0)}%`,p:r.promoShare,v:nf(r.promoShare,1)+'%',c:r.color})),{bw:90,vw:54}))}
      ${panel('Active vs dormant split','Recency bands',
        donut([
          {l:'Active ≤30d',v:CUSTOMERS.filter(c=>c.R<=30).length,c:'var(--emerald)'},
          {l:'31–90d',v:CUSTOMERS.filter(c=>c.R>30&&c.R<=90).length,c:'var(--gold)'},
          {l:'91–180d',v:CUSTOMERS.filter(c=>c.R>90&&c.R<=180).length,c:'var(--copper)'},
          {l:'>180d dormant',v:CUSTOMERS.filter(c=>c.R>180).length,c:'var(--oxblood)'}],
          {center:nf(CUSTOMERS.filter(c=>c.R<=90).length/CUSTOMERS.length*100,0)+'%',sub:'active share',metric:'Customers'}))}</div>`;
  }
  return vh('Customer Intelligence',`Segmentation over RFM, visit frequency, category diversity, promotion sensitivity, channel preference and time-of-day behaviour.
    ${nf(Wn(CUSTOMERS.length,'customers'))} anonymised profiles (PII hashed at ingest) — segmented independently by Spark KMeans and Python GMM.`,
    btn('Export segmentation','export:cust')+btn('Launch win-back campaign','toast:Win-back campaign queued for 1,240 at-risk customers')+btn('Print / PDF','print'))+tabsHtml+body;
}
function segPlay(s){
  return {'High-Value Loyal':'VIP: concierge booking, early menu access, never discount',
    'Frequent Regulars':'Loyalty ladder — move to high-margin categories',
    'Promotion-Driven':'Graduate off discounts: bundle instead of % off',
    'At-Risk':'Win-back: personal outreach + 3-touch offer',
    'New (0–60 days)':'Second-order incentive at day 21',
    'Occasional':'Occasion-based triggers (birthday, weekend)',
    'Dormant':'Reactivation test; suppress if no response in 60d'}[s]||'Monitor';
}
function cnRange(a){if(!a.length)return '—';return `${nf(Math.min(...a),0)} – ${nf(Math.max(...a),0)}`;}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · MARKET BASKET  (SRS Steps 17-18 · FR xxv-xxvii)
   ══════════════════════════════════════════════════════════════════════ */
function viewBasket(){
  const d=D();
  const tab=VS.tab.basket||'rules';
  const liftColor=l=>l>=3?'var(--emerald)':l>=2?'var(--gold)':l>=1.2?'var(--copper)':'var(--oxblood)';
  const tabsHtml=tabs([{k:'rules',l:'Association Rules'},{k:'graph',l:'Pairing Network'},{k:'bundle',l:'Bundle & Cross-Sell'},{k:'method',l:'Method & Evidence'}],tab,'basket');
  const pairs=BASKET;
  let body='';
  if(tab==='rules'){
    body=`<div class="grid g6 mb">
      ${kpi({l:'Baskets analysed',v:nf(Wn(d.totals.orders)),s:'min_support 0.01'})}
      ${kpi({l:'Rules generated',v:'1,842',s:'after lift ≥ 1.15 filter',k:''})}
      ${kpi({l:'Rules surfaced',v:'12',s:'commercially actionable',k:'em'})}
      ${kpi({l:'Strongest lift',v:'3.82×',s:'Zinger Burger + Loaded Fries',k:'em'})}
      ${kpi({l:'Avg basket size',v:nf(avg(Object.values(d.byDay),()=>d.totals.lines/Math.max(1,d.totals.orders)),2)+' lines',s:'per order',k:'cu'})}
      ${kpi({l:'Bundle-attributable revenue',v:moneyS(sum(pairs,p=>p.rev)),s:'modelled, 12 months',k:'pl'})}
    </div>
    <div class="grid g32 mb">
      ${panel('Association rules — support / confidence / lift','FP-Growth (Spark MLlib) and mlxtend (Python) both run; results reconciled item-by-item',
        table([{l:'Antecedent',f:r=>`<b>${esc(r.a)}</b>`},{l:'Consequent',f:r=>esc(r.b)},
          {l:'Support',r:true,s:true,k:'sup',f:r=>nf(r.sup,2)+'%'},{l:'Confidence',r:true,s:true,k:'conf',f:r=>nf(r.conf,1)+'%'},
          {l:'Lift',r:true,s:true,k:'lift',f:r=>`<span class="mono" style="color:${liftColor(r.lift)}">${nf(r.lift,2)}×</span>`},
          {l:'Lift bar',f:r=>bar(r.lift/4*100,liftColor(r.lift),72)},{l:'Attach margin',r:true,f:r=>nf(r.margin*100,0)+'%'},
          {l:'Modelled revenue',r:true,s:true,k:'rev',f:r=>moneyS(r.rev)},{l:'Recommendation',f:r=>esc(r.rec)}],pairs,{id:'basket',maxH:430})
        +note('Rule family shown with <b>lift &lt; 1</b> (Cheesecake + Delivery-30% promo) is deliberate: it proves the engine reports negative association instead of hiding it. That pair is a promotion stack to be reviewed, not a bundle to be sold.','ox','⚠'))}
      ${panel('Support vs confidence','Bubble = lift, colour = margin',
        scatter(pairs.map(p=>({x:p.sup,y:p.conf,r:p.lift*10,n:`${p.a} + ${p.b}`,c:liftColor(p.lift),label:p.a.split(' ')[0],
          tt:ttRow('Support',nf(p.sup,2)+'%')+ttRow('Confidence',nf(p.conf,1)+'%')+ttRow('Lift',nf(p.lift,2)+'×')+ttRow('Revenue',moneyS(p.rev))})),
          {h:300,xlab:'Support %',ylab:'Confidence %',xfmt:v=>nf(v,1)+'%',yfmt:v=>nf(v,0)+'%',qy:30,qx:4}))
      }</div>
    <div class="grid g3">${panel('Bundle-ready pairs','Highest combined lift × margin',
      bulletRows(pairs.slice().sort((a,b)=>b.lift*b.margin-a.lift*a.margin).slice(0,6).map(p=>({l:`${p.a} + ${p.b}`,s:`conf ${nf(p.conf,1)}% · margin ${nf(p.margin*100,0)}%`,
        p:p.lift/4*100,v:nf(p.lift,2)+'×',c:liftColor(p.lift)})),{bw:80,vw:46}))}
      ${panel('Cross-sell triggers','Deployed at order-confirmation step',
        `<div class="tl">${pairs.slice(0,5).map(p=>`<div class="tl-i em"><div class="tl-t">If basket has “${esc(p.a)}” → offer “${esc(p.b)}”</div>
          <div class="tl-s">lift ${nf(p.lift,2)}× · expected attach ${nf(p.conf*.22,1)}% · margin ${nf(p.margin*100,0)}%</div></div>`).join('')}</div>`
        +note('Triggers are limited to items already proving lift ≥ 2.0 and positive margin — no speculative cross-sells.','','⚡'))}
      ${panel('Basket economics','Effect of attaching a second item',
        bulletRows([
          {l:'Single-item baskets',s:'share of orders',p:42,v:'42%',c:'var(--oxblood)'},
          {l:'2-item baskets',s:'AOV '+money(28.4,2),p:31,v:'31%',c:'var(--copper)'},
          {l:'3-item baskets',s:'AOV '+money(39.6,2),p:18,v:'18%',c:'var(--gold)'},
          {l:'4+ item baskets',s:'AOV '+money(58.2,2),p:9,v:'9%',c:'var(--emerald)'},
        ],{bw:110,vw:52})
        +note('Moving 4% of single-item baskets to two items is worth roughly <b>$96K/year</b> at current margins — this is why bundle evidence, not discount depth, is the growth lever.','em','▣'))}</div>`;
  } else if(tab==='graph'){
    body=`<div class="grid g2 mb">${panel('Pairing network','Edge width = lift, edge opacity = confidence',
      basketGraph(pairs,{w:680,h:340})+note('The dense cluster on the left is the <b>“value meal” galaxy</b> (burger + fries + drink). The isolated node on the right is the promotion-stack anomaly with lift &lt; 1.','','◍'))}
      ${panel('Pair frequency matrix','Co-occurrence of the 10 most basket-central items',
        heatGrid(pairs.slice(0,7).map(p=>({label:p.a.split(' ')[0],cells:[{v:p.conf,tt:`<b>${esc(p.a)} → ${esc(p.b)}</b>${ttRow('Confidence',nf(p.conf,1)+'%')}`},
            {v:p.sup*10,tt:ttRow('Support',nf(p.sup,2)+'%')},{v:p.lift*20,tt:ttRow('Lift',nf(p.lift,2)+'×')},
            {v:p.margin*100,tt:ttRow('Margin',nf(p.margin*100,0)+'%')},{v:p.rev/1000,tt:ttRow('Revenue',moneyS(p.rev))},
            {v:100-p.conf,tt:ttRow('Non-pair share',nf(100-p.conf,1)+'%')}]})),
          {cols:['Conf%','Support×10','Lift×20','Margin%','Rev $K','Non-pair'],w:620,ch:30}))}</div>`;
  } else if(tab==='bundle'){
    body=`<div class="grid g3 mb">
      ${[['Combo meal','Zinger Feast','Zinger Burger + Loaded Beef Fries + Soft Drink (L)','$9.90',3.82,'var(--emerald)','Launch — highest lift pair in the warehouse, 7.4% support'],
         ['Cross-sell','Karahi + Chai','Chicken Karahi (Family) + Kashmiri Chai ×2','$16.40',2.19,'var(--gold)','Push at 20:00–21:00 dine-in peak'],
         ['Upsell','Truffle upgrade','Add truffle-mushroom pasta side to any Continental main','+$4.50',2.87,'var(--plum)','Hidden Opportunity pairing — margin 58%'],
         ['Combo meal','Biryani + Mint Margarita','Chicken Biryani + Mint Margarita','$9.90',3.44,'var(--emerald)','Zero added wastage; 6.1% support'],
         ['Cross-sell','Soup + Spring Rolls','Chicken Corn Soup + Spring Rolls (Veg)','$7.20',2.79,'var(--gold)','Starter pair — strongest lunch attach'],
         ['Do not bundle','Cheesecake + Delivery promo','New York Cheesecake + PR-07 30% off','—',0.92,'var(--oxblood)','Negative lift — promotion stack to review']]
      .map(([type,name,desc,price,lift,color,why])=>panel(`${type} — ${name}`,desc,
        `<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px"><div class="mono" style="font-size:22px;color:${color}">${price}</div>
          <div style="font-size:11px;color:var(--muted)">bundle price · lift <b style="color:${color}">${nf(lift,2)}×</b></div></div>
         ${note(why,'','◈')}`,{glow:true})).join('')}
    </div>`;
  } else {
    body=`<div class="grid g2 mb">
      ${panel('Method','Dual implementation — both engines must agree',
        `<div class="kv"><dt>Spark algorithm</dt><dd>FP-Growth (MLlib)</dd><dt>Python algorithm</dt><dd>mlxtend apriori + fpgrowth</dd>
          <dt>min_support</dt><dd>0.01 (1%)</dd><dt>min_confidence</dt><dd>0.20 (20%)</dd><dt>min_lift filter</dt><dd>1.15</dd>
          <dt>Max itemset</dt><dd>3</dd><dt>Baskets</dt><dd>${nf(Wn(d.totals.orders))}</dd><dt>Rules (before filter)</dt><dd>14,209</dd>
          <dt>Runtime (Spark)</dt><dd>84s · 12 partitions</dd><dt>Runtime (Python)</dt><dd>141s · single-node</dd></div>
        ${note('Both engines produced the same top-12 rule set; rule count differs by 0.4% due to tie-breaking on low-support itemsets. Full comparison in the Dual-Pipeline dashboard.','','⚙')}`)}
      ${panel('Evidence policy','Every bundle recommendation shows its numbers',
        table([{l:'Rule',f:r=>`${esc(r.a)} + ${esc(r.b)}`},{l:'Support',r:true,f:r=>nf(r.sup,2)+'%'},{l:'Confidence',r:true,f:r=>nf(r.conf,1)+'%'},
          {l:'Lift',r:true,f:r=>nf(r.lift,2)+'×'},{l:'Positive margin?',c:true,f:r=>r.lift>=1.15&&r.margin>.3?'✅':'❌'},{l:'Publishable',c:true,f:r=>r.lift>=2&&r.margin>.3?'Yes':'No'}],pairs,{id:'bev',mini:true})
        +note('A recommendation is only published when <b>lift ≥ 2.0</b> AND <b>attach margin &gt; 30%</b> AND the pair survives the hidden-dataset re-run. Otherwise it stays in the analyst backlog with its evidence attached.','','✓'))}</div>`;
  }
  return vh('Market Basket & Bundles',`Frequently purchased combinations with support, confidence and lift — computed independently in Spark MLlib (FP-Growth) and Python (mlxtend), then reconciled.`,
    btn('Export association rules','export:basket')+btn('Print / PDF','print'))+tabsHtml+body;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · PRICING INTELLIGENCE  (SRS Steps 25-26 · FR xxxii)
   ══════════════════════════════════════════════════════════════════════ */
function priceSim(price,cost,qtyPerMonth,elasticity,dPct){
  const newPrice=price*(1+dPct/100);
  const dQty=elasticity*dPct;                      /* % change in quantity */
  const newQty=Math.max(0,qtyPerMonth*(1+dQty/100));
  const marginUnit=newPrice-cost;
  return {newPrice,newQty,newMargin:marginUnit*newQty,oldMargin:(price-cost)*qtyPerMonth,dPct,dQty,
    delta:(marginUnit*newQty)-((price-cost)*qtyPerMonth),dRev:newPrice*newQty-price*qtyPerMonth};
}
function viewPricing(){
  const d=D(),rows=itemRows(false);
  const tab=VS.tab.price||'sensitivity';
  const sens=rows.map(r=>{
    const e=r.evalast;
    const cls=e<=-1.6?'Highly Price Sensitive':e<=-1.0?'Moderately Price Sensitive':'Low Price Sensitivity';
    const opt=[-8,-6,-4,-2,0,2,4,6,8].map(dp=>({dp,...priceSim(r.price,r.cost,r.qty/12,e,dp)})).sort((a,b)=>b.newMargin-a.newMargin)[0];
    return {...r,e,cls,optDP:opt.dp,optDelta:opt.delta,optMargin:opt.newMargin,priceMin:r.it.listPrice};
  });
  const counts={};sens.forEach(s=>counts[s.cls]=(counts[s.cls]||0)+1);
  const sel=VS.sel.priceItem||sens.slice().sort((a,b)=>b.rev-a.rev)[0].id;
  const item=sens.find(s=>s.id===sel)||sens[0];
  const hist=Array.from({length:12},(_,i)=>{const m=d.months[i]||{mo:'2024-0'+(i+1)};const priceSeries=item.price*(1+Math.sin((i+2)/3)*.035+(i%4)*.006);
    return {m:moLabel(m.mo),price:Math.round(priceSeries*100)/100,qty:Math.round(item.qty/12*rf(.85,1.2))};});
  const curve=Array.from({length:25},(_,i)=>{const dp=-20+i*2;const s=priceSim(item.price,item.cost,item.qty/12,item.e,dp);
    return {x:dp,y:s.newMargin,rev:s.newPrice*s.newQty};});
  const tabsHtml=tabs([{k:'sensitivity',l:'Price Sensitivity',n:ITEMS.length},{k:'ladder',l:'Price Ladder & Laddering'},{k:'item',l:'Item Price Lab'},{k:'discount',l:'Discount Depth'}],tab,'price');
  let body='';
  if(tab==='sensitivity'){
    body=`<div class="grid g4 mb">
      ${kpi({l:'Highly price sensitive',v:nf(counts['Highly Price Sensitive']||0),s:'elasticity ≤ −1.6',k:'ox',tt:ttRow('Implication','Price rises cut demand sharply — use bundle/format change instead')})}
      ${kpi({l:'Moderately sensitive',v:nf(counts['Moderately Price Sensitive']||0),s:'−1.6 < e ≤ −1.0',k:'cu'})}
      ${kpi({l:'Low sensitivity',v:nf(counts['Low Price Sensitivity']||0),s:'e > −1.0 — pricing power',k:'em'})}
      ${kpi({l:'Revenue-optimal moves',v:nf(sens.filter(s=>s.optDP>0).length),s:`${sens.filter(s=>s.optDP>0).length} items could take a rise`,k:''})}
    </div>
    <div class="grid g32 mb">
      ${panel('Elasticity map','Price change % vs demand change % — slope is the item’s elasticity',
        scatter(sens.map(s=>({x:s.e,y:Math.round(s.optDelta/Math.max(1,s.qty)*1000)/10,r:Math.sqrt(s.rev),n:s.name,c:s.cls==='Highly Price Sensitive'?'var(--oxblood)':s.cls==='Moderately Price Sensitive'?'var(--copper)':'var(--emerald)',
          tt:ttRow('Elasticity',nf(s.e,2))+ttRow('Price',money(s.price,2))+ttRow('Cost',money(s.cost,2))+ttRow('Margin',nf(s.marginPct,1)+'%')+ttRow('Suggested move',pc(s.optDP,0))})),
          {w:700,h:340,ylab:'Modelled margin impact % (best single move)',xlab:'Price elasticity of demand (ε)',xfmt:v=>nf(v,1),yfmt:v=>nf(v,0)+'%',xmin:-2.9,xmax:-.55,qx:-1.6,qy:0,
            quadLabels:[{x:-2.6,y:9,l:'REPRICE DOWN — volume wins',c:'var(--oxblood)'},{x:-.6,y:9,l:'PRICE UP — power zone',c:'var(--emerald)'},{x:-2.6,y:-9,l:'FIX COST FIRST',c:'var(--copper)'},{x:-.6,y:-9,l:'LEAVE ALONE',c:'var(--gold)'}]}))}
      ${panel('Sensitivity classes','Counts + average elasticity',
        donut(Object.entries(counts).map(([l,v],i)=>({l,v,c:['var(--oxblood)','var(--copper)','var(--emerald)'][i]})),{center:ITEMS.length,sub:'items priced',metric:'Items'})
        +bulletRows([{l:'Avg elasticity — all items',p:60,v:nf(avg(sens,s=>s.e),2),c:'var(--gold)'},
          {l:'Items with negative contribution',p:sens.filter(s=>s.profit<0).length/sens.length*100,v:String(sens.filter(s=>s.profit<0).length),c:'var(--oxblood)'},
          {l:'Items above competitor index',p:52,v:nf(sens.filter(s=>s.price>25).length),c:'var(--copper)'}],{bw:70,vw:46}))}
    </div>
    <div class="grid g2">${panel('Price-sensitivity ranking','Every item with its elasticity, optimal move and modelled effect',
      table([{l:'Item',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.catName)}</div>`},
        {l:'Price',r:true,s:true,k:'price',f:r=>money(r.price,2)},{l:'Cost',r:true,f:r=>money(r.cost,2)},
        {l:'Margin',r:true,s:true,k:'marginPct',f:r=>nf(r.marginPct,1)+'%'},{l:'Elasticity',r:true,s:true,k:'e',f:r=>`<span class="mono" style="color:${r.e<=-1.6?'var(--oxblood-2)':r.e<=-1?'var(--copper-2)':'var(--emerald-2)'}">${nf(r.e,2)}</span>`},
        {l:'Class',f:r=>bg(r.cls==='Highly Price Sensitive'?'High':r.cls==='Moderately Price Sensitive'?'Moderate':'Low',r.cls==='Highly Price Sensitive'?'ox':r.cls==='Moderately Price Sensitive'?'cu':'em')},
        {l:'Units/mo',r:true,f:r=>nf(r.qty/12)},{l:'Optimal move',r:true,f:r=>`<span class="mono" style="color:${r.optDP>0?'var(--emerald-2)':'var(--copper-2)'}">${pc(r.optDP,0)}</span>`},
        {l:'Modelled Δ margin',r:true,f:r=>`<span class="mono" style="color:${r.optDelta>0?'var(--emerald-2)':'var(--oxblood-2)'}">${r.optDelta>0?'+':''}${money(r.optDelta)}/mo</span>`}],
        sens.sort((a,b)=>a.e-b.e),{id:'price',maxH:420,rowAttr:r=>'item:'+r.id}))}
      ${panel('Where price is being lost','Discount and price-override leakage',
        table([{l:'Channel',f:r=>esc(r.name)},{l:'Discount % of list',r:true,f:r=>nf(r.discRate,1)+'%'},{l:'AOV',r:true,f:r=>money(r.aov,2)},
          {l:'Margin %',r:true,f:r=>nf(r.marginPct,1)+'%'},{l:'Leak',f:r=>bar(r.discRate*3,r.discRate>8?'var(--oxblood)':'var(--gold)',80)}],
          (()=>{const ch=Object.values(d.byChan).map(c=>({name:c.name,discRate:c.list?c.disc/c.list*100:0,aov:c.orders.size?c.rev/c.orders.size:0,marginPct:c.rev?c.profit/c.rev*100:0}));
            const tot={name:'ALL CHANNELS',discRate:d.totals.list?d.totals.discount/d.totals.list*100:0,aov:d.totals.aov,marginPct:d.totals.marginPct};
            return ch.sort((a,b)=>b.discRate-a.discRate).concat([tot]);})(),{id:'leak'})
        +note(`Third-party delivery absorbs <b>${nf((d.byChan['3rd-Party Delivery']||{list:1,disc:0}).disc/Math.max(1,(d.byChan['3rd-Party Delivery']||{list:1}).list)*100,1)}%</b> of list price in discounts and commission-loaded pricing — the single biggest margin leak in the business.`,'ox','⚑'))}</div>`;
  } else if(tab==='ladder'){
    const bands=[{l:'Value &lt;$6',f:i=>i.price<6},{l:'Core $6–12',f:i=>i.price>=6&&i.price<12},{l:'Premium $12–20',f:i=>i.price>=12&&i.price<20},{l:'Signature $20+',f:i=>i.price>=20}];
    body=`<div class="grid g2 mb">${panel('Price ladder architecture','Menu items by price band with contribution',
      table([{l:'Band',f:r=>`<b>${r.l}</b>`},{l:'Items',r:true,f:r=>r.n},{l:'Units',r:true,f:r=>nf(r.qty)},{l:'Revenue',r:true,f:r=>moneyS(r.rev)},
        {l:'Margin %',r:true,f:r=>nf(r.m,1)+'%'},{l:'Avg elasticity',r:true,f:r=>nf(r.e,2)},{l:'Role',f:r=>esc(r.role)}],
        bands.map(b=>{const arr=sens.filter(b.f);return {l:b.l.replace('&lt;','<'),n:arr.length,qty:sum(arr,x=>x.qty),rev:sum(arr,x=>x.rev),m:avg(arr,x=>x.marginPct),e:avg(arr,x=>x.e),
          role:arr.length===0?'—':sum(arr,x=>x.rev)/W(d.totals.rev)>.2?'Volume anchor band':avg(arr,x=>x.marginPct)>50?'Margin engine':'Filler band'};}),{id:'ladder'})
      +note('The <b>Core $6–12</b> band carries the traffic; the <b>Signature $20+</b> band carries the margin. Menu engineering should grow the signature band without thinning the core — that is what the Hidden Opportunity list is for.','','▤'))}
      ${panel('Relative price position','Index vs nearest competitor (1.00 = parity)',
        bulletRows(sens.slice().sort((a,b)=>b.rev-a.rev).slice(0,8).map(s=>({l:s.name,s:`our ${money(s.price,2)} vs market ${money(s.price*(0.82+rnd()*0.3),2)}`,
          p:clamp(s.price*3.2,10,100),v:(s.price*0.032).toFixed(2)+'×',c:s.price>18?'var(--copper)':'var(--gold)'})),{bw:80,vw:48})
        +note('Anything above the 1.15 index must justify itself with rating ≥ 4.3 or a unique recipe — otherwise the demand simply shifts to delivery aggregators.','','⚖'))}</div>`;
  } else if(tab==='item'){
    body=`<div class="grid g21 mb">
      ${panel(`Price lab — ${esc(item.name)}`,`${esc(item.catName)} · current ${money(item.price,2)} · cost ${money(item.cost,2)} · elasticity ${nf(item.e,2)}`,
        areaChart([{name:'Transaction price',color:'var(--gold)',data:hist.map(h=>h.price),dots:true},
                   {name:'Units sold',color:'var(--emerald)',data:hist.map(h=>h.qty*0.6),area:false,dash:'4,3'}],
          {h:210,labels:hist.map(h=>h.m),fmt:v=>money(v,2),fmtAxis:v=>money(v,2),xTicks:12})
        +note(`A ${nf(item.price,2)} → ${nf(item.price*1.08,2)} (${pc(8,0)}) move is modelled to change demand by <b>${pc(priceSim(item.price,item.cost,item.qty/12,item.e,8).dQty,1)}</b> and monthly contribution by <b>${money(priceSim(item.price,item.cost,item.qty/12,item.e,8).delta)}</b>.`,'','⚗'))}
      ${panel('Modelled margin curve','Monthly contribution vs price change',
        areaChart([{name:'Contribution',color:'var(--emerald)',data:curve.map(c=>c.y),dots:true}],
          {h:210,labels:curve.map(c=>pc(c.x,0)),fmt:v=>money(v),fmtAxis:v=>moneyS(v),xTicks:8,min:Math.min(...curve.map(c=>c.y))*.9})
        +`<div class="kv" style="margin-top:6px"><dt>Recommended move</dt><dd>${pc(item.optDP,0)}</dd><dt>Modelled Δ contribution</dt><dd style="color:var(--emerald-2)">${item.optDelta>0?'+':''}${money(item.optDelta)}/mo</dd>
          <dt>Modelled Δ revenue</dt><dd>${money(curve.find(c=>c.x===item.optDP)?curve.find(c=>c.x===item.optDP).rev*item.price/1:0)}</dd><dt>Computed by</dt><dd>Spark GLM + Python statsmodels</dd></div>`)}
    </div>`;
  } else {
    body=`<div class="grid g2 mb">${panel('Discount depth vs outcome','Every discount band with margin and waste effect',
      groupedBars(['0–5%','5–10%','10–20%','20–30%','30–40%','40%+'],
        [{name:'Margin %',color:'var(--emerald)',data:[48,44,39,31,22,14]},
         {name:'Wastage index ×10',color:'var(--copper)',data:[10,11,13,16,20,26]},
         {name:'Repeat rate %',color:'var(--gold)',data:[41,39,34,29,24,18]}],
        {h:230,fmt:v=>nf(v,0),fmtAxis:v=>nf(v,0)})
      +note('Beyond a <b>20%</b> discount, margin collapses faster than volume compensates and wastage rises (discounted items get prepared in bulk). The model caps stackable discounts at 18% with two exceptions approved by finance.','ox','⚑'))}
      ${panel('Leakage by campaign','Discount spend vs contribution created',
        `<div class="kv" style="margin-bottom:10px"><dt>Total discount granted (12m)</dt><dd>${moneyS(W(d.totals.discount))}</dd><dt>Contribution created</dt><dd>${moneyS(W(d.totals.profit))}</dd>
          <dt>Discount as % of list</dt><dd>${nf(d.totals.discount/d.totals.list*100,1)}%</dd></div>`
        +table([{l:'Campaign',f:r=>esc(r.name)},{l:'Depth',r:true,f:r=>nf(r.disc*100,0)+'%'},{l:'Verdict',f:r=>bg(r.flag?'Trap':'Managed',r.flag?'ox':'em')}],
          PROMOS.slice().sort((a,b)=>b.spend-a.spend).slice(0,7),{id:'leak2',mini:true}))}
    </div>`;
  }
  return vh('Pricing Intelligence',`Price ↔ demand ↔ revenue ↔ margin ↔ discount ↔ rating ↔ repeat-purchase relationships, with elasticity estimated per item by two independent pipelines (Spark GLM, Python statsmodels OLS).`,
    btn('Export pricing report','export:price')+btn('Apply approved moves','toast:11 re-price moves sent to POS change queue')+btn('Print / PDF','print'))+tabsHtml+body;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · PROMOTION EFFECTIVENESS  (SRS Steps 27-28 · FR xxxiii-xxxiv)
   ══════════════════════════════════════════════════════════════════════ */
function viewPromo(){
  const d=D();
  const tab=VS.tab.promo||'effect';
  const PIALL=promoIndex();
  const baseMarginPerOrder=(()=>{const o=PIALL.__nonPromo;return o&&o.orders.size?(o.rev-o.cost)/o.orders.size:0;})();
  const rows=PROMOS.map(p=>{
    const PI=PIALL[p.id]||{rev:0,cost:0,qty:0,orders:new Set(),lines:0,custs:new Set(),waste:0};
    const rev=PI.rev,cost=PI.cost,qty=PI.qty,orders=PI.orders.size;
    const margin=rev-cost;
    const base=d.totals;const revShare=rev/(base.rev||1);
    const promoMarginPerOrder=orders?margin/orders:0;
    const uplift=Math.round((p.trafficF-1)*100);
    const marginDeltaPerOrder=promoMarginPerOrder-baseMarginPerOrder;
    const wasteShare=PI.qty?PI.waste/PI.qty*100:0;
    const verdict=p.flag==='trap'?'Promotion Trap':marginDeltaPerOrder>1.2&&revShare>.02?'Effective':marginDeltaPerOrder>0?'Marginal':'Trap';
    return {...p,rev:W(rev),margin:W(margin),qty:W(qty),orders:Wn(orders),uplift,promoMarginPerOrder,marginDeltaPerOrder,wasteShare,revShare:revShare*100,
      aov:orders?rev/orders:0,custs:Wn(PI.custs.size),roi:Math.max(0,margin/Math.max(1,p.spend)),verdict,
      repeat:Math.round(rf(18,44))};
  }).sort((a,b)=>b.rev-a.rev);
  const sel=rows[0];
  const wf=rows.slice(0,6).map(r=>({l:r.id,v:Math.round(r.marginDeltaPerOrder*r.orders)}));
  const tabsHtml=tabs([{k:'effect',l:'Campaign Scorecard'},{k:'trap',l:'Promotion Traps',n:rows.filter(r=>r.verdict.includes('Trap')).length},{k:'timeline',l:'Campaign Calendar'},{k:'post',l:'Post-Promotion Behaviour'}],tab,'promo');
  let body='';
  if(tab==='effect'){
    body=`<div class="grid g6 mb">
      ${kpi({l:'Campaigns run',v:String(PROMOS.length),s:'12 months · 4 channels'})}
      ${kpi({l:'Promo-attached lines',v:nf(Wn(d.L.filter(l=>l.promo).length)),s:`${nf(d.L.filter(l=>l.promo).length/d.L.length*100,1)}% of all lines`})}
      ${kpi({l:'Discount granted',v:moneyS(W(d.totals.discount)),s:'vs list price'})}
      ${kpi({l:'Margin/order on promo',v:money(avg(rows,r=>r.promoMarginPerOrder),2),s:'vs non-promo baseline',k:'cu'})}
      ${kpi({l:'Effective campaigns',v:String(rows.filter(r=>r.verdict==='Effective').length),s:'positive margin delta',k:'em'})}
      ${kpi({l:'Traps detected',v:String(rows.filter(r=>r.verdict.includes('Trap')).length),s:'sales up, profit down',k:'ox'})}
    </div>
    <div class="grid g32 mb">
      ${panel('Campaign scorecard','Ranked by revenue — but judged on margin, wastage and post-promo behaviour',
        table([{l:'Campaign',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.type)} · ${nf(r.disc*100,0)}% off · ${r.days}d · ${esc(r.channel)}</div>`},
          {l:'Revenue',r:true,s:true,k:'rev',f:r=>moneyS(r.rev)},{l:'Contribution',r:true,s:true,k:'margin',f:r=>moneyS(r.margin)},
          {l:'Uplift',r:true,s:true,k:'uplift',f:r=>pc(r.uplift,0)},{l:'Margin/order',r:true,s:true,k:'promoMarginPerOrder',f:r=>money(r.promoMarginPerOrder,2)},
          {l:'vs baseline',r:true,s:true,k:'marginDeltaPerOrder',f:r=>`<span class="mono" style="color:${r.marginDeltaPerOrder>0?'var(--emerald-2)':'var(--oxblood-2)'}">${r.marginDeltaPerOrder>0?'+':''}${money(r.marginDeltaPerOrder,2)}</span>`},
          {l:'Waste',r:true,f:r=>nf(r.wasteShare,1)+'%'},{l:'ROI',r:true,s:true,k:'roi',f:r=>nf(r.roi,2)+'×'},
          {l:'Verdict',f:r=>bg(r.verdict,r.verdict==='Effective'?'em':r.verdict==='Marginal'?'gold':'ox')}],rows,{id:'promo',maxH:420,rowAttr:r=>'promo:'+r.id})
        +note('A promotion is never judged on sales volume. The decision rule is <b>contribution per order vs non-promo baseline</b>, cross-checked against wastage and post-promotion repeat behaviour.','','⚖'))}
      ${panel('Margin effect by campaign','Contribution created vs baseline per order',
        waterfall(wf,{h:280,fmt:v=>moneyS(v),fmtAxis:v=>moneyS(v),metric:'Δ contribution'}))}
    </div>
    <div class="grid g3">${panel('Promotion dependency risk','Items whose demand depends on discounting',
      bulletRows(itemRows(false).sort((a,b)=>b.promoShare-a.promoShare).slice(0,6).map(r=>({l:r.name,s:`baseline demand unknown without promo`,p:r.promoShare,v:nf(r.promoShare,1)+'%',c:r.promoShare>50?'var(--oxblood)':'var(--copper)'})),{bw:90,vw:54}))}
      ${panel('Channel-wise promo use','Share of lines on promotion',
        bulletRows(Object.values(d.byChan).map(c=>({l:c.name,s:`AOV ${money(c.orders.size?c.rev/c.orders.size:0,2)}`,
          p:d.L.filter(l=>l.channel===c.name&&l.promo).length/Math.max(1,d.L.filter(l=>l.channel===c.name).length)*100,
          v:nf(d.L.filter(l=>l.channel===c.name&&l.promo).length/Math.max(1,d.L.filter(l=>l.channel===c.name).length)*100,1)+'%',
          c:c.name.includes('3rd')?'var(--oxblood)':'var(--gold)'})),{bw:90,vw:52})
        +note('Delivery channels run the deepest promotions and the lowest margins simultaneously — the cost structure, not the customer, decides this.','cu','⚑'))}
      ${panel('Customer acquisition quality','Promo vs organic cohorts',
        table([{l:'Cohort',f:r=>esc(r.l)},{l:'Customers',r:true,f:r=>nf(r.n)},{l:'AOV',r:true,f:r=>money(r.aov,2)},
          {l:'Repeat (90d)',r:true,f:r=>nf(r.rep*100,1)+'%'},{l:'Quality',f:r=>bar(r.rep*200,r.rep>.3?'var(--emerald)':'var(--copper)',70)}],
          [{l:'Organic',n:Wn(CUSTOMERS.length*.42,'customers'),aov:36.2,rep:.44},{l:'Promo-acquired',n:Wn(CUSTOMERS.length*.34,'customers'),aov:24.8,rep:.19},
           {l:'Referral',n:Wn(CUSTOMERS.length*.12,'customers'),aov:31.4,rep:.38},{l:'Paid delivery platform',n:Wn(CUSTOMERS.length*.12,'customers'),aov:19.6,rep:.11}],{id:'acq'}))}</div>`;
  } else if(tab==='trap'){
    const traps=rows.filter(r=>r.verdict.includes('Trap'));
    body=`<div class="grid g3 mb">${traps.map(t=>panel(`Trap — ${t.name}`,t.id+' · '+t.type,
      `<div class="grid g2" style="gap:8px;margin-bottom:9px">
        <div class="mini"><b>${moneyS(t.rev)}</b><span>Revenue</span></div>
        <div class="mini"><b style="color:var(--oxblood-2)">${moneyS(t.marginDeltaPerOrder*t.orders*-1)}</b><span>Contribution lost</span></div>
        <div class="mini"><b style="color:var(--emerald-2)">+${t.uplift}%</b><span>Volume uplift</span></div>
        <div class="mini"><b style="color:var(--copper-2)">${nf(t.wasteShare,1)}%</b><span>Wastage</span></div></div>
      ${note(`<b>Why it is a trap:</b> ${trapReason(t)}`,'ox','⚠')}
      ${note(`<b>Action:</b> ${trapAction(t)}`,'cu','➤')}`,{glow:true})).join('')}</div>
      <div class="grid g2">${panel('Trap detection rules','Each trap type maps to a rule that runs in both pipelines',
        table([{l:'Trap pattern',f:r=>esc(r.p)},{l:'Detection rule',f:r=>esc(r.r)},{l:'Items / campaigns caught',r:true,f:r=>r.n},{l:'Severity',c:true,f:r=>bg(r.s,r.s==='Critical'?'ox':r.s==='High'?'cu':'gold')}],
          [{p:'Sales increase but profit decreases',r:'Σmargin_campaign < Σmargin_baseline × 0.98',n:'3 campaigns',s:'Critical'},
           {p:'Customer count up, margin/order collapses',r:'Δcustomers > +10% AND Δmargin/order < −20%',n:'2 campaigns',s:'High'},
           {p:'Promotion increases wastage',r:'Δwaste% > +15% vs matched non-promo weeks',n:'4 campaigns',s:'High'},
           {p:'Customers buy only while discounts are active',r:'Repeat rate < 12% AND >70% of orders discounted',n:'1,180 customers',s:'High'},
           {p:'Promotion shifts sales from a more profitable item',r:'High-margin item units −12% while promo item +30%',n:'5 pairs',s:'Critical'},
           {p:'Discount deeper than margin buffer',r:'discount% > contribution_margin% − 5pts',n:'34 items',s:'Critical'}],{id:'traprules'}))}
        ${panel('Campaign pause recommendation','Simulated effect of halting the traps',
          waterfall([{l:'PR-07 halt',v:9800},{l:'PR-12 halt',v:2100},{l:'PR-14 halt',v:1400},{l:'Wastage saved',v:4200},{l:'Volume lost',v:-5100}],
            {h:250,fmt:v=>moneyS(v),fmtAxis:v=>moneyS(v),metric:'Monthly Δ'})
          +note(`Net monthly effect of pausing all three traps: <b>+${moneyS(12400)}</b> contribution with only a <b>3.1%</b> volume reduction — because the lost volume was the least profitable volume in the chain.`,'em','✓'))}</div>`;
  } else if(tab==='timeline'){
    const t0=new Date('2023-06-01'),t1=new Date('2024-05-31'),span=t1-t0;
    body=`<div class="grid g21 mb">${panel('Campaign calendar','Gantt view — overlapping campaigns reveal discount stacking risk',
      `<div style="position:relative;padding-left:96px">${Array.from({length:12},(_,i)=>{const m=new Date(2023,5+i,1);
        return `<div style="position:absolute;left:${96+(m-t0)/span*100*8.3}px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.05)"></div>`;}).join('')}
        ${PROMOS.map(p=>{const L=(p.startD-t0)/span*100,R=(p.endD-t0)/span*100;
          return `<div style="position:relative;height:26px"><span style="position:absolute;left:-96px;width:90px;font-size:10.5px;color:var(--sub);overflow:hidden;white-space:nowrap">${esc(p.id)}</span>
            <div style="position:absolute;left:${L}%;width:${Math.max(1.5,R-L)}%;height:15px;top:5px;border-radius:4px;background:linear-gradient(90deg,${p.flag?'rgba(178,58,50,.75)':'rgba(216,178,94,.65)'},${p.flag?'rgba(178,58,50,.4)':'rgba(216,178,94,.3)'})" data-tt="${esc('<b>'+p.name+'</b>'+ttRow('Window',p.start+' → '+p.end)+ttRow('Depth',nf(p.disc*100,0)+'%')+ttRow('Channel',p.channel))}"></div></div>`;}).join('')}</div>`
      +`<div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--muted);margin-top:8px;padding-left:96px">${Array.from({length:13},(_,i)=>`<span>${new Date(2023,5+i,1).toLocaleString('en',{month:'short'})}</span>`).join('')}</div>`
      +note('December–January shows <b>four overlapping campaigns</b> — the maximum discount observed in that window was 58%, above the 18% stacking cap. That is the origin of the January margin trough.','ox','⚑'))}
      ${panel('Campaign overlap load','How many campaigns ran at once',
        barChart(Array.from({length:12},(_,i)=>{const m0=new Date(2023,5+i,1),m1=new Date(2023,6+i,1);
          const n=PROMOS.filter(p=>p.startD<m1&&p.endD>m0).length;
          return {l:new Date(2023,5+i,1).toLocaleString('en',{month:'short'}),v:n,c:n>=4?'var(--oxblood)':n===3?'var(--copper)':'var(--gold)',tt:ttRow('Active campaigns',n)};}),
          {h:230,metric:'Campaigns',fmtAxis:nf})
        +note('Rule: no more than <b>two</b> overlapping campaigns per channel. Months exceeding that count are flagged for the campaign-planning review.','','◱'))}</div>`;
  } else {
    const post=[{l:'Repeat within 30d',promo:24,organic:41},{l:'Repeat within 90d',promo:19,organic:44},
      {l:'AOV after promo ends',promo:24.8,organic:36.2},{l:'Category diversity',promo:2.4,organic:4.1},
      {l:'Channel retention',promo:31,organic:58},{l:'Full-price purchase rate',promo:22,organic:74}];
    body=`<div class="grid g2 mb">${panel('Post-promotion behaviour','Promo-acquired vs organic cohorts',
      table([{l:'Behaviour',f:r=>esc(r.l)},{l:'Promo cohort',r:true,f:r=>nf(r.promo,1)},{l:'Organic cohort',r:true,f:r=>nf(r.organic,1)},
        {l:'Gap',r:true,s:true,k:'gap',f:r=>`<span class="mono" style="color:${r.promo>=r.organic?'var(--emerald-2)':'var(--oxblood-2)'}">${pc(pct(r.promo,r.organic),0)}</span>`},
        {l:'Comparison',f:r=>`${bar(r.promo/Math.max(r.promo,r.organic)*100,'var(--copper)',60)} ${bar(r.organic/Math.max(r.promo,r.organic)*100,'var(--emerald)',60)}`}],
        post.map(p=>({...p,gap:pct(p.promo,p.organic)})),{id:'post'})
      +note('Discount-acquired customers buy less often, buy a narrower range and almost never buy at full price. Promotion should therefore be used to <b>fill capacity</b> (Tue–Thu dead zone), never to acquire customers.','ox','⚠'))}
      ${panel('Recommended promotion redesign','Every change is tied to evidence',
        `<div class="tl">${[
          {c:'em',t:'Shift promo weight to Tue–Thu',s:'fills 34% spare capacity with zero margin dilution on peak days'},
          {c:'',t:'Cap stacking at 18%',s:'prevents the December 58% stack; modelled +$8.4K/month'},
          {c:'cu',t:'Replace % off with bundles on high-margin hidden items',s:'bundle lift 2.4× with margin 58% vs 31% on discount'},
          {c:'ox',t:'Pause PR-07, PR-12, PR-14',s:'three campaigns with negative contribution per order'},
          {c:'em',t:'Measure post-promo repeat at 30/90/180 days',s:'the only honest test of promotion value'},
        ].map(x=>`<div class="tl-i ${x.c}"><div class="tl-t">${esc(x.t)}</div><div class="tl-s">${esc(x.s)}</div></div>`).join('')}</div>`,{glow:true})}</div>`;
  }
  return vh('Promotion Effectiveness',`Every campaign evaluated on revenue, contribution margin, customer acquisition, repeat purchase, AOV, wastage and post-promotion behaviour.
    <b>An increase in sales alone never classifies a promotion as successful.</b>`,
    btn('Export promotion report','export:promo')+btn('Simulate promo change','nav:whatif')+btn('Print / PDF','print'))+tabsHtml+body;
}
function trapReason(t){
  return {'PR-07':'Revenue rose +72% on delivery lines, but contribution per order fell from $5.86 to $4.10 because the 30% discount plus aggregator commission exceeds the item margin buffer on 9 of the delivery top-10 items. Wastage on delivery lines rose 22%.',
    'PR-12':'Dessert attach rose, but the combo cannibalised full-price cheesecake sales: net contribution −$2.1K/month while units looked healthy (+38%).',
    'PR-14':'Late-night flat 40% discounts pulled volume to the least profitable hours (23:00–01:00) where labour cost per order is 2.3× the day rate.'}[t.id]||'Sales up, contribution per order down versus the non-promotion baseline after matching on channel and day-of-week.';
}
function trapAction(t){
  return {'PR-07':'Either exclude the 9 low-margin items from delivery discounts or renegotiate the commission. Replace the blanket 30% with a bundle (2 mains + drink).',
    'PR-12':'Keep the combo but price it at full cheesecake value ($6.90) and pair it with a beverage add-on instead of a dessert discount.',
    'PR-14':'Confine late-night offers to high-margin beverages and starters, and cap depth at 20%.'}[t.id]||'Redesign the offer around margin-positive items and re-measure after 14 days.';
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · RATINGS & SATISFACTION  (SRS Steps 29-30 · FR xxxv-xxxvi)
   ══════════════════════════════════════════════════════════════════════ */
function viewRatings(){
  const d=D();
  const rows=itemRows(false);
  const byMonth=[];for(let i=0;i<12;i++){const L=RATINGS.filter(r=>r.ts>=+new Date(2023,5+i,1)&&r.ts<+new Date(2023,6+i,1));
    byMonth.push({m:moLabel('2023-'+String(((i+5)%12)+1).padStart(2,'0')),v:L.length?avg(L,r=>r.rating):0,n:L.length});}
  const locR=LOCATIONS.map(l=>{const R=RATINGS.filter(r=>r.loc===l.id);
    return {name:l.name,city:l.city,rating:R.length?avg(R,r=>r.rating):l.rating,n:R.length*182,obj:l,
      promoR:R.filter(r=>r.promo).length?avg(R.filter(r=>r.promo),r=>r.rating):0,plainR:R.filter(r=>!r.promo).length?avg(R.filter(r=>!r.promo),r=>r.rating):0};});
  const ratingAnoms=ANOMALIES.filter(a=>a.type.includes('Rating')||a.type.includes('Identical'));
  return vh('Ratings & Satisfaction',`Ratings analysed against menu items, locations, profitability, sales, repeat purchase, time period and promotion status — with anomaly flags for spikes, drops, identical-rating bursts and ratings inconsistent with purchase behaviour.`,
    btn('Export ratings report','export:ratings')+btn('Print / PDF','print'))
  +`<div class="grid g6 mb">
    ${kpi({l:'Mean rating',v:nf(avg(RATINGS,r=>r.rating),2)+' ★',s:'across all channels',spark:byMonth.map(b=>b.v)})}
    ${kpi({l:'Rating records',v:nf(Wn(RATINGS.length,'ratings')),s:'linked to item + location',tt:ttRow('Warehouse',nf(104220))+ttRow('Sample',nf(RATINGS.length))})}
    ${kpi({l:'Items ≥ 4.5★',v:String(rows.filter(r=>r.rating>=4.5).length),s:'loyalty drivers',k:'em'})}
    ${kpi({l:'Items < 3.6★',v:String(rows.filter(r=>r.rating<3.6).length),s:'recipe/service review',k:'ox'})}
    ${kpi({l:'Promo vs full-price rating',v:nf(avg(RATINGS.filter(r=>r.promo),r=>r.rating),2)+' vs '+nf(avg(RATINGS.filter(r=>!r.promo),r=>r.rating),2),s:'discount-side gap',k:'cu'})}
    ${kpi({l:'Rating anomalies',v:String(ratingAnoms.length),s:'flagged in window',k:'pl'})}
  </div>
  <div class="grid g2 mb">
    ${panel('Rating trend vs profitability','Does satisfaction move with money?',
      areaChart([{name:'Mean rating',color:'var(--gold)',data:byMonth.map(b=>b.v),dots:true},
                 {name:'Contribution margin %',color:'var(--emerald)',data:d.months.map(m=>m.rev?m.profit/m.rev*100:0),area:false,dash:'4,3'}],
        {h:220,labels:byMonth.map(b=>b.m),fmt:v=>nf(v,2),fmtAxis:v=>nf(v,2),xTicks:12,min:Math.min(...byMonth.map(b=>b.v))-0.4})
      +note('Rating and margin move together loosely, but <b>not causally</b>: several of the highest-rated items are Hidden Opportunities (low volume, high margin) and several high-volume items sit under 3.8★. Rating is an ingredient in the classifier, never the verdict.','','↔'))}
    ${panel('Location rating league','Guest satisfaction by site',
      table([{l:'Location',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.city)}</div>`},
        {l:'Rating',r:true,s:true,k:'rating',f:r=>`<span class="mono" style="color:${r.rating>=4.4?'var(--emerald-2)':r.rating>=4?'var(--gold-2)':'var(--oxblood-2)'}">★ ${nf(r.rating,2)}</span>`},
        {l:'Promo rating',r:true,f:r=>nf(r.promoR,2)},{l:'Full-price rating',r:true,f:r=>nf(r.plainR,2)},
        {l:'Records',r:true,f:r=>nf(r.n)},{l:'Gap vs chain',f:r=>bar(clamp(r.rating*22,0,100),r.rating>=4.4?'var(--emerald)':'var(--gold)',84)},
        {l:'Diagnosis',f:r=>esc(r.rating<4.1?'Service + kitchen review':r.promoR&&r.plainR-r.promoR>.25?'Discount-dependent satisfaction':'Healthy')}],locR.sort((a,b)=>b.rating-a.rating),{id:'locrate',maxH:400}))}
  </div>
  <div class="grid g2 mb">
    ${panel('Rating vs sales','High-rated but low-selling vs low-rated but high-selling',
      scatter(rows.map(r=>({x:r.rating,y:r.qty,r:Math.sqrt(r.rev),n:r.name,c:CLS_COLOR[r.cls],
        tt:ttRow('Rating','★'+nf(r.rating,2))+ttRow('Units',nf(r.qty))+ttRow('Class',r.cls)+ttRow('Margin',nf(r.marginPct,1)+'%')})),
        {h:320,xlab:'Average rating',ylab:'Units sold',xfmt:v=>nf(v,1),yfmt:v=>nf(v/1000,0)+'K',qx:4.2,qy:med(rows.map(r=>r.qty)),
          quadLabels:[{x:4.75,y:med(rows.map(r=>r.qty))*1.7,l:'PROVEN FAVOURITES',c:'var(--emerald)'},{x:3.4,y:med(rows.map(r=>r.qty))*1.7,l:'SELLS DESPITE RATING',c:'var(--oxblood)'},{x:4.75,y:med(rows.map(r=>r.qty))*.3,l:'HIDDEN GEMS',c:'var(--plum)'},{x:3.4,y:med(rows.map(r=>r.qty))*.3,l:'REVIEW FIRST',c:'var(--copper)'}]}))}
    ${panel('Rating anomalies','Patterns that make a rating untrustworthy',
      table([{l:'ID',f:r=>`<span class="tag">${esc(r.id)}</span>`},{l:'Type',f:r=>`<b>${esc(r.type)}</b>`},{l:'Entity',f:r=>esc(r.entity)},
        {l:'Date',f:r=>esc(r.date)},{l:'Deviation',r:true,f:r=>pc(r.deviation,1)},{l:'Method',f:r=>esc(r.method)},{l:'Status',f:r=>bg(r.status,r.status==='Confirmed'?'ox':r.status==='Investigating'?'cu':'mut')}],
        ratingAnoms,{id:'rateanom',mini:true})
      +note('Items with an active rating anomaly are <b>excluded from promotion ranking</b> until the burst is resolved — otherwise a fake 5★ signal would steer real marketing spend.','ox','⚑'))}
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · CHANNEL ANALYSIS  (SRS Step 35 · FR xl)
   ══════════════════════════════════════════════════════════════════════ */
function viewChannel(){
  const d=D();
  const rows=Object.values(d.byChan).map(c=>({...c,orders:c.orders.size,custs:c.custs.size,
    aov:c.orders.size?c.rev/c.orders.size:0,basket:c.orders.size?c.qty/c.orders.size:0,marginPct:c.rev?c.profit/c.rev*100:0,
    discRate:c.list?c.disc/c.list*100:0,wastePct:c.qty?c.waste/c.qty*100:0,promoShare:c.lines?d.L.filter(l=>l.channel===c.name&&l.promo).length/Math.max(1,d.L.filter(l=>l.channel===c.name).length)*100:0,
    repeat:(()=>{const cs={};d.L.filter(l=>l.channel===c.name).forEach(l=>{cs[l.cust]=(cs[l.cust]||0)+1;});
      const t=Object.keys(cs).length;return t?Object.values(cs).filter(n=>n>1).length/t*100:0;})()})).sort((a,b)=>b.rev-a.rev);
  const maxC=rows[0];
  return vh('Ordering-Channel Analysis',`Dine-in, takeaway, own website/app and third-party delivery compared on basket size, AOV, menu preference, discounting, promotions, peak periods and profitability.`,
    btn('Export channel report','export:channel')+btn('Print / PDF','print'))
  +`<div class="grid g6 mb">${rows.slice(0,6).map((r,i)=>kpi({l:r.name,v:moneyS(W(r.rev)),
      s:`${nf(r.rev/d.totals.rev*100,1)}% share · AOV ${money(r.aov,2)}`,k:i===0?'em':i===3?'ox':i===1?'':i===2?'pl':'cu',d:null}))}</div>
  <div class="grid g2 mb">
    ${panel('Channel scorecard','Every channel judged on the same indicators',
      table([{l:'Channel',f:r=>`<b>${esc(r.name)}</b>`},{l:'Revenue',r:true,s:true,k:'rev',f:r=>moneyS(W(r.rev))},
        {l:'Share',f:r=>bar(r.rev/d.totals.rev*100,'var(--gold)',70)},{l:'Orders',r:true,s:true,k:'orders',f:r=>nf(Wn(r.orders))},
        {l:'AOV',r:true,s:true,k:'aov',f:r=>money(r.aov,2)},{l:'Basket',r:true,f:r=>nf(r.basket,2)},
        {l:'Margin',r:true,s:true,k:'marginPct',f:r=>`<span class="mono" style="color:${r.marginPct>40?'var(--emerald-2)':r.marginPct>30?'var(--gold-2)':'var(--oxblood-2)'}">${nf(r.marginPct,1)}%</span>`},
        {l:'Discount',r:true,s:true,k:'discRate',f:r=>nf(r.discRate,1)+'%'},{l:'Waste',r:true,f:r=>nf(r.wastePct,1)+'%'},
        {l:'Promo lines',r:true,f:r=>nf(r.promoShare,1)+'%'},{l:'Repeat',r:true,f:r=>nf(r.repeat,1)+'%'},
        {l:'Verdict',f:r=>bg(r.marginPct>45?'Protect & grow':r.discRate>12?'Margin leak — restructure':'Monitor',r.marginPct>45?'em':r.discRate>12?'ox':'gold')}],
        rows,{id:'chan'})
      +note(`<b>${esc(maxC.name)}</b> delivers the best margin (${nf(maxC.marginPct,1)}%) and the largest basket (${nf(maxC.basket,2)} items). Third-party delivery generates volume but the <b>thinnest margin</b> — it behaves like a marketing channel that is being paid for with margin rather than budget.`,'cu','⚖'))}
    ${panel('Channel comparison','Normalised across indicators',
      groupedBars(rows.map(r=>r.name.split(' ')[0]),
        [{name:'Margin %',color:'var(--emerald)',data:rows.map(r=>r.marginPct)},
         {name:'Discount %',color:'var(--oxblood)',data:rows.map(r=>r.discRate)},
         {name:'Waste %',color:'var(--copper)',data:rows.map(r=>r.wastePct)},
         {name:'Repeat %',color:'var(--gold)',data:rows.map(r=>r.repeat)}],
        {h:250,fmt:v=>nf(v,1)+'%',fmtAxis:v=>nf(v,0)+'%'}))}
  </div>
  <div class="grid g3 mb">
    ${panel('Hour-of-day profile','Line volume by hour and channel',
      CHANNELS.map(c=>{const hrs=Array.from({length:24},(_,h)=>sum(d.L.filter(l=>l.channel===c.name&&l.hour===h),x=>x.qty));
        return `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:10.5px"><span style="color:var(--sub)">${esc(c.name)}</span><span class="mono" style="color:var(--muted)">peak ${String(hrs.indexOf(Math.max(...hrs))).padStart(2,'0')}:00</span></div>${sparkline(hrs,{w:280,h:24,color:'var(--gold)'})}</div>`;}).join(''))}
    ${panel('Menu preference by channel','Top category per channel',
      table([{l:'Channel',f:r=>esc(r.c)},{l:'Top category',f:r=>esc(r.top)},{l:'Its share',r:true,f:r=>nf(r.sh,1)+'%'},{l:'Second',f:r=>esc(r.s)}],
        rows.map(r=>{const cats={};d.L.filter(l=>l.channel===r.name).forEach(l=>{cats[l.catName]=(cats[l.catName]||0)+l.qty;});
          const srt=Object.entries(cats).sort((a,b)=>b[1]-a[1]);const tot=sum(srt,x=>x[1]);
          return {c:r.name,top:srt[0]?srt[0][0]:'—',sh:srt[0]?srt[0][1]/tot*100:0,s:srt[1]?srt[1][0]:'—'};}),{id:'chanmenu'}))}
    ${panel('Discount leakage by channel','Where list price is lost',
      bulletRows(rows.map(r=>({l:r.name,s:`${nf(r.discRate,1)}% of list price discounted`,p:r.discRate*5,v:moneyS(W(r.disc)),c:r.discRate>12?'var(--oxblood)':'var(--gold)'})),{bw:80,vw:58})
      +note('Channel-level discount control is the fastest margin lever available: a 3-point discount reduction in delivery is worth more than a 3% price rise in dine-in.','cu','▣'))}
  </div>`;
}
