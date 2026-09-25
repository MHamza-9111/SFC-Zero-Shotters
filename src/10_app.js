/* ══════════════════════════════════════════════════════════════════════
   DineIQ · APPLICATION CONTROLLER
   Role-based navigation, filters, router, drawer, command palette, exports
   ══════════════════════════════════════════════════════════════════════ */
const ROLES=[
 {id:'manager', l:'Restaurant Manager', u:'arslan.m', n:'Arslan Mehmood', d:'Location-scoped operations and menu actions'},
 {id:'analyst', l:'Data Analyst', u:'sana.r', n:'Sana Rizvi', d:'Full analytics, models, pipelines and exports'},
 {id:'regional',l:'Regional Manager', u:'kashif.h', n:'Kashif Hussain', d:'Multi-site performance and comparisons'},
 {id:'admin',   l:'Administrator', u:'admin', n:'Platform Admin', d:'Users, roles, configuration and audit'},
];
const NAV=[
 {sec:'Command Centre', items:[{id:'exec', l:'Executive Overview', roles:'all', icon:'grid'}]},
 {sec:'Dashboards', items:[
   {id:'menu', l:'Menu Intelligence', roles:['manager','analyst','regional','admin'], icon:'disc', badge:()=>classStats().filter(s=>s.tricky.length).length},
   {id:'customer', l:'Customer Intelligence', roles:['manager','analyst','regional','admin'], icon:'users'},
   {id:'wastage', l:'Wastage & Inventory', roles:['manager','analyst','regional','admin'], icon:'drop', badge:'!', badgeCls:''},
   {id:'forecast', l:'Demand Forecast', roles:['manager','analyst','regional','admin'], icon:'trend'},
   {id:'dual', l:'Dual-Pipeline Compare', roles:['analyst','regional','admin'], icon:'bars', badge:'New', badgeCls:'gold'},
 ]},
 {sec:'Analytics', items:[
   {id:'eda', l:'EDA Explorer', roles:['manager','analyst','regional','admin'], icon:'chart'},
   {id:'peak', l:'Peak-Period Analysis', roles:['manager','analyst','regional','admin'], icon:'clock'},
   {id:'basket', l:'Market Basket', roles:['manager','analyst','regional','admin'], icon:'basket'},
   {id:'pricing', l:'Pricing Intelligence', roles:['manager','analyst','regional','admin'], icon:'tag'},
   {id:'promo', l:'Promotion Effectiveness', roles:['manager','analyst','regional','admin'], icon:'star', badge:()=>PROMOS.filter(p=>p.flag==='trap').length, badgeCls:''},
   {id:'ratings', l:'Ratings & Satisfaction', roles:['manager','analyst','regional','admin'], icon:'star2'},
   {id:'anomaly', l:'Anomaly Detection', roles:['analyst','regional','admin'], icon:'flag', badge:()=>ANOMALIES.filter(a=>a.sev==='Critical').length, badgeCls:''},
   {id:'location', l:'Location Intelligence', roles:['manager','analyst','regional','admin'], icon:'pin'},
   {id:'channel', l:'Channel Analysis', roles:['manager','analyst','regional','admin'], icon:'route'},
 ]},
 {sec:'Intelligence', items:[
   {id:'recs', l:'Recommendation Engine', roles:['manager','analyst','regional','admin'], icon:'bulb', badge:()=>RECS.filter(r=>r.pri==='Critical').length, badgeCls:'emerald'},
   {id:'whatif', l:'What-If Studio', roles:['manager','analyst','regional','admin'], icon:'beaker'},
 ]},
 {sec:'Data & Models', items:[
   {id:'dq', l:'Data Quality & Cleaning', roles:['analyst','admin'], icon:'shield'},
   {id:'pipeline', l:'Big Data Pipeline', roles:['analyst','admin'], icon:'stack'},
   {id:'models', l:'Model Registry', roles:['analyst','admin'], icon:'cpu'},
   {id:'infra', l:'Infrastructure & Audit', roles:['analyst','admin'], icon:'lock'},
 ]},
 {sec:'Administration', items:[
   {id:'admin', l:'Admin Console', roles:['admin'], icon:'gear'},
   {id:'reports', l:'Reports & Export', roles:['manager','analyst','regional','admin'], icon:'doc'},
 ]},
];
const ICONS={
 grid:'<rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/>',
 disc:'<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/>',
 users:'<circle cx="6" cy="5" r="2.4"/><path d="M1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 6.2a2.2 2.2 0 100-.1M12 13.9c0-1.6-.5-2.7-1.4-3.4"/>',
 drop:'<path d="M8 2c2.6 3.2 4 5.4 4 7.4a4 4 0 11-8 0C4 7.4 5.4 5.2 8 2z"/>',
 trend:'<path d="M1.5 12l4-4.5 3 2.5 5-6"/><path d="M10 4h3.5v3.5"/>',
 bars:'<rect x="1.5" y="7" width="3.5" height="7" rx="1"/><rect x="6.2" y="4" width="3.5" height="10" rx="1"/><rect x="11" y="1.5" width="3.5" height="12.5" rx="1"/>',
 chart:'<path d="M2 13V3M2 13h12"/><path d="M4.5 10.5l3-3.5 2.5 2 3-4"/>',
 clock:'<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 2"/>',
 basket:'<path d="M2 5.5h12l-1.2 8H3.2z"/><path d="M5.5 5.5L7 2M10.5 5.5L9 2"/>',
 tag:'<path d="M8.5 1.5H14v5.5l-6 6-5.5-5.5z"/><circle cx="11.6" cy="4.4" r="1.1"/>',
 star:'<path d="M8 2l1.8 3.7L14 6.2l-3 2.9.7 4.1L8 11.2 4.3 13.2l.7-4.1-3-2.9 4.2-.5z"/>',
 star2:'<path d="M5.5 2l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3L3 9.8l.5-2.8-2-2 2.8-.4z"/><path d="M11 8.5l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L8 10.7l2.1-.3z"/>',
 flag:'<path d="M3 2v12M3 3h9l-1.5 3L12 9H3"/>',
 pin:'<path d="M8 14s5-5 5-8.5A5 5 0 003 5.5C3 9 8 14 8 14z"/><circle cx="8" cy="5.5" r="1.8"/>',
 route:'<circle cx="3.5" cy="12.5" r="2"/><circle cx="12.5" cy="3.5" r="2"/><path d="M5.5 12.5h4a3 3 0 000-6h-3a3 3 0 010-6h3"/>',
 bulb:'<path d="M8 1.5a4.5 4.5 0 00-2.6 8.2V12h5.2V9.7A4.5 4.5 0 008 1.5z"/><path d="M6 14h4"/>',
 beaker:'<path d="M6 1.5v4L2.5 12a1.5 1.5 0 001.3 2.3h8.4A1.5 1.5 0 0013.5 12L10 5.5v-4"/><path d="M5 1.5h6"/>',
 shield:'<path d="M8 1.5l5.5 2v4.5c0 3.5-2.3 6-5.5 6.5-3.2-.5-5.5-3-5.5-6.5V3.5z"/><path d="M5.5 8l1.8 1.8L11 6"/>',
 stack:'<path d="M8 1.5l6 3-6 3-6-3z"/><path d="M2 8.5l6 3 6-3M2 11.5l6 3 6-3"/>',
 cpu:'<rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6.5 1.5v2M9.5 1.5v2M6.5 12.5v2M9.5 12.5v2M1.5 6.5h2M1.5 9.5h2M12.5 6.5h2M12.5 9.5h2"/>',
 lock:'<rect x="3" y="7" width="10" height="7.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
 gear:'<circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/>',
 doc:'<path d="M4 1.5h5l3.5 3.5v9.5H4z"/><path d="M9 1.5V5h3.5"/><path d="M6 8.5h5M6 11h3.5"/>',
};
let SESS={role:'manager'};
let CUR='exec';
const roleOK=id=>{const item=NAV.flatMap(s=>s.items).find(i=>i.id===id);
  return item&&(item.roles==='all'||item.roles.includes(SESS.role));};
const icon=id=>`<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${ICONS[id]||ICONS.grid}</svg>`;

/* ── toast ── */
function toast(title,msg,kind){
  const el=document.createElement('div');
  el.className='toast '+(kind||'');
  el.innerHTML=`<div style="flex:1"><b>${esc(title)}</b><span>${esc(msg||'')}</span></div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>{el.style.transition='.3s';el.style.opacity='0';el.style.transform='translateX(30px)';setTimeout(()=>el.remove(),300);},4200);
}

/* ── CSV / download ── */
function toCSV(rows){
  if(!rows||!rows.length)return 'no data';
  const cols=Object.keys(rows[0]);
  const cell=v=>{if(v==null)return '';const s=typeof v==='object'?JSON.stringify(v):String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  return cols.join(',')+'\n'+rows.map(r=>cols.map(c=>cell(r[c])).join(',')).join('\n');
}
function download(name,text,mime){
  const blob=new Blob([text],{type:mime||'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
function money0(v){return typeof v==='number'?Math.round(v*100)/100:v;}
function reportRows(id){
  const d=D(),cs=classStats();
  switch(id){
    case 'lines':return d.live.slice(0,4000).map(l=>({line_id:l.id,order_id:ORDERS[l.o].id,item_id:l.item,item_name:l.itemName,category:l.catName,
      qty:l.qty,unit_price:l.paid,revenue:money0(l.rev),cost:money0(l.cost),contribution:money0(l.margin),wastage_kg:l.waste,
      location_id:l.loc,location:l.locName,channel:l.channel,promotion:l.promoName||'',customer_id:l.cust,segment:l.seg,date:l.date,hour:l.hour,status:l.cancelled?'CANCELLED':'COMPLETED'}));
    case 'items':case 'menu':return cs.map(s=>({item_id:s.it.id,item_name:s.it.name,category:s.it.catName,price:money0(s.it.price),cost:money0(s.it.cost),
      units_sold:Math.round(W(s.qty)),revenue:money0(W(s.rev)),contribution:money0(W(s.profit)),margin_pct:Math.round(s.marginPct*100)/100,
      avg_rating:s.it.rating,repeat_rate_pct:Math.round(s.repeat*1000)/10,wastage_pct:Math.round(s.wasteRate*100)/100,
      promo_dependency_pct:Math.round(s.promoShare*1000)/10,elasticity:s.it.elasticity,performance_class:s.cls,spark_class:s.cls,python_class:s.cls,
      model_version:'spark-gbt-v3.2 / py-xgb-v3.3',flags:s.tricky.join(' | ')}));
    case 'cats':return Object.values(d.byCat).map(c=>({category_id:c.id,category:c.name,items:c.items.size,units:Math.round(W(c.qty)),
      revenue:money0(W(c.rev)),cost:money0(W(c.cost)),contribution:money0(W(c.profit)),margin_pct:Math.round(c.rev?(c.profit/c.rev*100):0*100)/100,
      wastage_kg:Math.round(W(c.waste))}));
    case 'locs':case 'loc':return locRows().map(l=>({location_id:l.id,location:l.name,city:l.city,format:l.obj.format,seats:l.obj.seats||0,
      revenue:money0(W(l.rev)),contribution:money0(W(l.profit)),margin_pct:Math.round(l.marginPct*100)/100,aov:Math.round(l.aov*100)/100,
      orders:Math.round(Wn(l.orders.size)),customers:Math.round(Wn(l.custs.size,'customers')),repeat_pct:Math.round(l.repeatRate*10)/10,
      wastage_pct:Math.round(l.wastePct*100)/100,rating:l.rating,promo_share_pct:Math.round(l.promoShare*100)/10,discount_rate_pct:Math.round(l.discRate*100)/10,
      revenue_per_seat:Math.round(W(l.rev/Math.max(1,l.obj.seats||60)))}));
    case 'segs':case 'cust':return SEGMENTS.map(sg=>{const cs2=CUSTOMERS.filter(c=>c.seg===sg.id);
      return {segment:sg.id,segment_name:sg.name,customers:Math.round(cs2.length*KF.customers),avg_recency_days:Math.round(avg(cs2,c=>c.R)),
        avg_frequency:Math.round(avg(cs2,c=>c.F)*10)/10,avg_monetary:Math.round(avg(cs2,c=>c.M)),avg_aov:Math.round(avg(cs2,c=>c.aov)*100)/100,
        promo_affinity_pct:Math.round(avg(cs2,c=>c.promoAff)*1000)/10,churn_risk_pct:Math.round(avg(cs2,c=>c.churnRisk)*1000)/10,playbook:segPlay(sg.name)};});
    case 'chans':case 'channel':return Object.values(d.byChan).map(c=>({channel:c.name,revenue:money0(W(c.rev)),contribution:money0(W(c.profit)),
      margin_pct:Math.round((c.rev?(c.profit/c.rev*100):0)*100)/100,orders:Math.round(Wn(c.orders.size)),aov:Math.round((c.orders.size?c.rev/c.orders.size:0)*100)/100,
      basket_items:Math.round((c.orders.size?c.qty/c.orders.size:0)*100)/100,discount_pct_of_list:Math.round((c.list?c.disc/c.list*100:0)*10)/10,
      wastage_pct:Math.round((c.qty?c.waste/c.qty*100:0)*100)/100}));
    case 'months':return d.months.map(m=>({month:m.mo,revenue:money0(W(m.rev)),contribution:money0(W(m.profit)),orders:Math.round(Wn(m.orders.size)),
      customers:Math.round(Wn(m.custs.size,'customers')),units:Math.round(W(m.qty)),wastage_kg:Math.round(W(m.waste)),promo_lines:Math.round(Wn(m.promo))}));
    case 'anom':case 'anomaly':return ANOMALIES.map(a=>({anomaly_id:a.id,date:a.date,type:a.type,scope:a.scope,entity:a.entity,expected:a.expected,
      actual:a.actual,deviation_pct:a.deviation,impact:Math.round(a.impact),severity:a.sev,method:a.method,engine:a.engine,status:a.status,owner:a.owner}));
    case 'recs':return RECS.map(r=>({rec_id:r.id,priority:r.pri,area:r.cat,action:r.action,evidence:r.ev.join(' | '),impact:r.impact,
      confidence:r.conf,owner:r.owns,horizon:r.eta,source:r.src}));
    case 'basket':return BASKET.map(b=>({antecedent:b.a,consequent:b.b,support_pct:b.sup,confidence_pct:b.conf,lift:b.lift,
      attach_margin_pct:Math.round(b.margin*100),modelled_revenue:b.rev,recommendation:b.rec}));
    case 'forecast':{const out=[];d.forecast.forEach(f=>{ITEMS.slice(0,40).forEach(it=>{
        out.push({date:f.date,item_id:it.id,item_name:it.name,category:it.catName,forecast_units:Math.round(f.v*it.pop/6),
          lower:Math.round(f.lo*it.pop/6),upper:Math.round(f.hi*it.pop/6),confidence_pct:88,model_version:'py-ens-v4.1'});});});
      return out;}
    case 'waste':case 'wastage':return WASTAGE.map(w=>({waste_id:w.id,date:w.date,item_id:w.item,item_name:w.itemName,category:w.catName,
      location_id:w.loc,location:w.locName,city:w.city,reason:w.reason,quantity_kg:w.qty,cost:money0(w.cost),prepared_qty:w.prepared,
      waste_pct:w.wastePct,risk_band:w.wastePct>10?'High':w.wastePct>6?'Medium':'Low',promotion:w.promo||''}));
    case 'promo':return PROMOS.map(p=>({promotion_id:p.id,campaign:p.name,type:p.type,discount_pct:Math.round(p.disc*100),
      start_date:p.start,end_date:p.end,days:p.days,scope:p.scope,items:p.items,channel:p.channel,marketing_spend:p.spend,
      traffic_uplift_pct:p.uplift,verdict:p.flag==='trap'?'PROMOTION TRAP':'EFFECTIVE',status:p.flag==='trap'?'PAUSED':'ACTIVE'}));
    case 'price':case 'pricing':return itemRows(false).map(r=>{const opt=[-8,-6,-4,-2,0,2,4,6,8].map(dp=>({dp,...priceSim(r.price,r.cost,r.qty/12,r.evalast,dp)})).sort((a,b)=>b.newMargin-a.newMargin)[0];
      return {item_id:r.id,item_name:r.name,category:r.catName,price:money0(r.price),cost:money0(r.cost),margin_pct:Math.round(r.marginPct*100)/100,
        elasticity:r.evalast,sensitivity_class:r.evalast<=-1.6?'Highly Price Sensitive':r.evalast<=-1?'Moderately Price Sensitive':'Low Price Sensitivity',
        units_per_month:Math.round(r.qty/12),optimal_price_move_pct:opt.dp,modelled_margin_delta:money0(opt.delta)};});
    case 'dual':return dualRows().map(r=>({record_id:r.id,task:r.task,entity:r.entity,actual:r.actual,spark_result:r.spark,python_result:r.py,
      match:r.match?'MATCH':'MISMATCH',numeric_difference_pct:r.diff||0,confidence:r.conf,consistency:r.match?'Consistent':'Explained — analyst review',
      explanation:r.reason}));
    case 'dq':return DQ_RULES.map(r=>({rule_id:r.id,check:r.check,table:r.tbl,column:r.col,constraint:r.rule,rows_affected:r.found,
      severity:r.sev,action_taken:r.action}));
    case 'pipeline':return SPARK_JOBS.map(j=>({job_id:j.id,stage:j.stage,status:j.status,input:j.inp,output:j.out,partitions:j.part,
      duration:j.dur,shuffle:j.shuffle,executor_memory:j.mem,started_at:j.at}));
    case 'model':case 'models':return MODELS.map(m=>({model_id:m.id,task:m.task,target:m.target,pipeline:m.pipe,algorithm:m.algo,version:m.ver,
      features:m.feats,accuracy:m.acc?Math.round(m.acc*1000)/10:'',macro_f1:m.f1||'',precision:m.prec||'',recall:m.rec||'',auc:m.auc||'',
      mae:m.mae||'',rmse:m.rmse||'',mape:m.mape||'',r2:m.r2||'',training_set:m.train||'',test_set:m.test||'',trained_at:m.trained,
      artifact_size:m.size,status:m.status,hyperparameters:JSON.stringify(m.params||{})}));
    case 'audit':return AUDIT.map(a=>({timestamp:a.at,user:a.user,role:a.role,action:a.act,object:a.obj,result:a.res,source_ip:a.ip}));
    case 'peak':return Array.from({length:7},(_,dw)=>Array.from({length:24},(_,h)=>{const c=D().byHourDow[dw+'-'+h]||{lines:0,qty:0,rev:0};
      return {day:DOW[dw],hour:h,units:Math.round(W(c.qty)),lines:Math.round(W(c.lines)),revenue:money0(W(c.rev))};})).flat();
    case 'eda':return itemRows(false).map(r=>({item_id:r.id,item_name:r.name,category:r.catName,units:Math.round(r.qty),revenue:money0(r.rev),
      contribution:money0(r.profit),margin_pct:Math.round(r.marginPct*100)/100,rating:r.rating,repeat_pct:Math.round(r.repeat*1000)/10,
      wastage_pct:Math.round(r.wasteRate*100)/100,promo_dependency_pct:Math.round(r.promoShare*1000)/10,class:r.cls}));
    case 'exec':return [{kpi:'Total revenue',value:Math.round(W(d.totals.rev)),unit:'USD',window:d.R.label},
      {kpi:'Contribution profit',value:Math.round(W(d.totals.profit)),unit:'USD',window:d.R.label},
      {kpi:'Contribution margin %',value:Math.round(d.totals.marginPct*100)/100,unit:'%',window:d.R.label},
      {kpi:'Unique orders',value:Math.round(Wn(d.totals.orders)),unit:'orders',window:d.R.label},
      {kpi:'Average order value',value:Math.round(d.totals.aov*100)/100,unit:'USD',window:d.R.label},
      {kpi:'Active customers',value:Math.round(CUSTOMERS.filter(c=>c.R<=90).length*KF.customers),unit:'customers',window:'last 90 days'},
      {kpi:'Repeat customer rate',value:Math.round(d.totals.repeatRate*100)/100,unit:'%',window:d.R.label},
      {kpi:'Wastage cost',value:Math.round(W(d.totals.wasteCost)),unit:'USD',window:d.R.label},
      {kpi:'Forecast demand next 30d',value:Math.round(sum(d.forecast.slice(0,30),f=>f.v)*KF.order_lines),unit:'units',window:'next 30 days'},
      {kpi:'Critical recommendations',value:RECS.filter(r=>r.pri==='Critical').length,unit:'count',window:'current'},
      {kpi:'Open anomalies',value:ANOMALIES.filter(a=>a.status!=='Dismissed').length,unit:'count',window:'current'}];
    default:return itemRows(false);
  }
}
const REPORT_FILES={items:'menu_performance_report.csv',menu:'menu_performance_report.csv',cats:'category_performance.csv',
  locs:'location_performance.csv',loc:'location_performance.csv',segs:'customer_segmentation.csv',cust:'customer_segmentation.csv',
  chans:'channel_analysis.csv',channel:'channel_analysis.csv',months:'monthly_series.csv',anom:'anomaly_register.csv',anomaly:'anomaly_register.csv',
  recs:'recommendations_with_evidence.csv',basket:'association_rules.csv',forecast:'demand_forecast.csv',waste:'wastage_report.csv',
  wastage:'wastage_report.csv',promo:'promotion_effectiveness.csv',price:'pricing_elasticity.csv',pricing:'pricing_elasticity.csv',
  dual:'dual_pipeline_comparison.csv',dq:'data_quality_report.csv',pipeline:'spark_processing_evidence.csv',model:'model_evaluation.csv',
  models:'model_evaluation.csv',audit:'audit_trail.csv',lines:'filtered_order_lines.csv',peak:'peak_period_analysis.csv',eda:'eda_summary.csv',exec:'executive_kpi_summary.csv'};
function doExport(id,silent){
  const rows=reportRows(id);
  const name=REPORT_FILES[id]||(id+'_export.csv');
  download(name,toCSV(rows));
  if(!silent)toast('Export ready',name+' · '+nf(rows.length)+' rows · filter window: '+D().R.label,'em');
}
/* Excel-compatible SpreadsheetML workbook — opens natively in Excel/LibreOffice, no library needed */
function toXLS(rows,sheetName){
  const cols=Object.keys(rows[0]||{none:1});
  const xe=v=>String(v==null?'':(typeof v==='object'?JSON.stringify(v):v)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const num=v=>typeof v==='number'&&isFinite(v);
  const head='<Row>'+cols.map(c=>'<Cell ss:StyleID="h"><Data ss:Type="String">'+xe(c)+'</Data></Cell>').join('')+'</Row>';
  const body=rows.map(r=>'<Row>'+cols.map(c=>{const v=r[c];
    return num(v)?'<Cell><Data ss:Type="Number">'+v+'</Data></Cell>':'<Cell><Data ss:Type="String">'+xe(v)+'</Data></Cell>';}).join('')+'</Row>').join('');
  return '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
    +'<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#F1DEA6" ss:Pattern="Solid"/></Style></Styles>'
    +'<Worksheet ss:Name="'+xe(sheetName).slice(0,28)+'"><Table>'+head+body+'</Table></Worksheet></Workbook>';
}
function doExportXLS(id){
  const rows=reportRows(id);
  const base=(REPORT_FILES[id]||(id+'.csv')).replace(/\.csv$/,'');
  download(base+'.xls',toXLS(rows,base),'application/vnd.ms-excel');
  toast('Excel workbook ready',base+'.xls · '+nf(rows.length)+' rows · SpreadsheetML, opens directly in Excel and LibreOffice.','em');
}
function exportAll(){
  const ids=['exec','items','cats','locs','segs','chans','months','peak','basket','price','promo','ratings','waste','forecast','anom','recs','dual','models','pipeline','dq','audit'];
  ids.forEach((id,i)=>setTimeout(()=>{try{doExport(id,true);}catch(e){}},i*420));
  toast('Export bundle started',ids.length+' CSV files are downloading — dashboard-equivalent data, no re-aggregation.','gold');
}

/* ── navigation ── */
function renderNav(){
  const host=document.getElementById('sidebar-nav');
  host.innerHTML=NAV.map((sec,si)=>{
    const items=sec.items.map(it=>{
      const ok=it.roles==='all'||it.roles.includes(SESS.role);
      const badge=ok&&it.badge?(typeof it.badge==='function'?it.badge():it.badge):null;
      return `<div class="nav-item ${CUR===it.id?'active':''} ${ok?'':'locked'}" data-nav="${ok?it.id:''}" ${ok?'':'title="Not available for your role"'}>
        ${icon(it.icon)}<span>${esc(it.l)}</span>${badge?`<span class="nav-badge ${it.badgeCls||''}">${badge}</span>`:''}</div>`;}).join('');
    return `<div class="nav-sec" id="navsec-${si}"><button class="nav-head" data-collapse="navsec-${si}">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg><span>${sec.sec}</span></button>
      <div class="nav-list">${items}</div></div>`;}).join('');
}
function go(id){
  if(!roleOK(id)){toast('Access denied','Your role ('+ROLES.find(r=>r.id===SESS.role).l+') does not include this module.','ox');return;}
  CUR=id;VS.tab={};VS.sort={};
  renderNav();render();
  document.getElementById('content').scrollTop=0;
  document.body.classList.remove('nav-open');
}
function render(){
  const def=NAV.flatMap(s=>s.items).find(i=>i.id===CUR)||NAV[0].items[0];
  const VIEWS={exec:viewExec,menu:viewMenu,customer:viewCustomer,wastage:viewWastage,forecast:viewForecast,dual:viewDual,
    eda:viewEda,peak:viewPeak,basket:viewBasket,pricing:viewPricing,promo:viewPromo,ratings:viewRatings,anomaly:viewAnomaly,
    location:viewLocation,channel:viewChannel,recs:viewRecs,whatif:viewWhatIf,dq:viewDQ,pipeline:viewPipeline,
    models:viewModels,infra:viewInfra,admin:viewAdmin,reports:viewReports};
  const d=D();
  document.getElementById('pg-title').innerHTML=`${esc(def.l)}<span id="pg-sub">${esc(d.R.label)} · ${FILTER.loc==='all'?'All 20 locations':esc((LOCATIONS.find(l=>l.id===FILTER.loc)||{name:''}).name)}</span>`;
  document.getElementById('tb-scope-t').textContent=FILTER.loc==='all'?'All '+LOCATIONS.length+' Locations':(LOCATIONS.find(l=>l.id===FILTER.loc)||{name:''}).name;
  document.getElementById('tb-range-t').textContent=d.R.label.replace(/ \(.*\)/,'');
  document.getElementById('f-count').textContent=nf(d.totals.lines)+' lines · '+nf(Object.keys(d.byItem).length)+' items in view';
  try{ document.getElementById('content').innerHTML=(VIEWS[CUR]||viewExec)(); }
  catch(e){ document.getElementById('content').innerHTML=`<div class="card"><div class="card-t">Render error in module “${esc(def.l)}”</div>
    ${note('<span class="mono">'+esc(e.message)+'</span> — switch modules or reset filters. The error is caught so one view can never take down the dashboard.','ox','⚠')}</div>`;
    console.error(e); }
}
function fillFilters(){
  const rs=document.getElementById('f-range');
  rs.innerHTML=RANGE_PRESETS.map(r=>`<option value="${r.id}" ${FILTER.range===r.id?'selected':''}>${r.label}</option>`).join('');
  document.getElementById('f-loc').innerHTML=`<option value="all">All ${LOCATIONS.length} locations</option>`+LOCATIONS.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
  document.getElementById('f-cat').innerHTML=`<option value="all">All categories</option>`+CATEGORIES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  document.getElementById('f-seg').innerHTML=`<option value="all">All segments</option>`+SEGMENTS.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  document.getElementById('f-chan').innerHTML=`<option value="all">All channels</option>`+CHANNELS.map(c=>`<option value="${c.name}">${esc(c.name)}</option>`).join('');
  document.getElementById('f-class').innerHTML=`<option value="all">All performance classes</option>${['Profit Driver','Volume Driver','Hidden Opportunity','Low Performer'].map(c=>`<option value="${c}">${c}</option>`).join('')}`;
  document.getElementById('f-price').innerHTML=`<option value="all">Any price</option><option value="u8">Under $8</option><option value="8-15">$8 – $15</option><option value="15-25">$15 – $25</option><option value="25p">$25 and above</option>`;
  document.getElementById('f-rating').innerHTML=`<option value="all">Any rating</option><option value="45">4.5★ and above</option><option value="40">4.0 – 4.49★</option><option value="35">3.5 – 3.99★</option><option value="u35">Below 3.5★</option>`;
  document.getElementById('f-waste').innerHTML=`<option value="all">Any wastage</option><option value="low">Low (&lt;3%)</option><option value="mid">Medium (3–7%)</option><option value="high">High (&gt;7%)</option>`;
}
function applyFilter(k,v){FILTER[k]=v;aggregate();render();}
function resetFilters(){Object.keys(FILTER).forEach(k=>{if(k!=='q')FILTER[k]=k==='range'?'12m':'all';});FILTER.q='';
  fillFilters();document.getElementById('f-q').value='';aggregate();render();toast('Filters reset','Showing the full 12-month window across all 20 locations.');}

/* ── drawer ── */
function openDrawer(html){
  const dw=document.getElementById('drawer');
  document.getElementById('dw-title').textContent=html.title;
  document.getElementById('dw-sub').textContent=html.sub||'';
  document.getElementById('dw-body').innerHTML=html.body;
  dw.classList.add('open');document.getElementById('dw-mask').classList.add('on');
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('dw-mask').classList.remove('on');
  document.getElementById('pal-modal').classList.remove('on');
  document.getElementById('pal-mask').classList.remove('on');
}
/* ── command palette ── */
function paletteItems(q){
  const t=(q||'').toLowerCase();
  const nav=NAV.flatMap(sec=>sec.items.filter(i=>roleOK(i.id)).map(i=>({k:i.l,s:'Dashboard · '+sec.sec,go:()=>go(i.id),icon:i.icon})));
  const items=itemRows(false).slice().sort((a,b)=>b.rev-a.rev).slice(0,24).map(r=>({k:r.name,s:'Item · '+r.catName+' · '+r.cls,go:()=>openDrawer(drawerItem(r.id)),icon:'disc'}));
  const custs=CUSTOMERS.slice().sort((a,b)=>b.M-a.M).slice(0,10).map(c=>({k:c.name,s:'Customer · '+c.id+' · '+c.segName,go:()=>openDrawer(drawerCustomer(c.id)),icon:'users'}));
  const locs=LOCATIONS.map(l=>({k:l.name,s:'Location · '+l.city+' · '+l.format,go:()=>openDrawer(drawerLocation(l.id)),icon:'pin'}));
  const promos=PROMOS.map(p=>({k:p.name,s:'Campaign · '+p.id+' · '+(p.flag?'trap':'active'),go:()=>openDrawer(drawerPromo(p.id)),icon:'star'}));
  const acts=[{k:'Export current view',s:'Action · CSV of the active filter set',go:()=>doExport(CUR),icon:'doc'},
    {k:'Print / save as PDF',s:'Action · browser print dialog with print stylesheet',go:()=>window.print(),icon:'doc'},
    {k:'Reset all filters',s:'Action · return to full 12-month window',go:resetFilters,icon:'gear'},
    {k:'Re-run Spark + Python pipelines',s:'Action · queues nightly batch JOB-2225',go:()=>toast('Pipelines queued','Spark batch JOB-2225 and the Python DS pipeline are queued — results land in ≈52 minutes.','gold'),icon:'cpu'}];
  return [...nav,...acts,...items,...locs,...promos,...custs].filter(x=>!t||x.k.toLowerCase().includes(t)||x.s.toLowerCase().includes(t)).slice(0,40);
}
function openPalette(){
  document.getElementById('pal-modal').classList.add('on');
  document.getElementById('pal-mask').classList.add('on');
  const inp=document.getElementById('pal-input');inp.value='';inp.focus();
  drawPalette('');
}
function drawPalette(q){
  const list=paletteItems(q);
  document.getElementById('pal-list').innerHTML=list.map((x,i)=>`<div class="pal-i" data-pal="${i}">${icon(x.icon)}<div><div>${esc(x.k)}</div>
    <div style="font-size:10px;color:var(--muted)">${esc(x.s)}</div></div></div>`).join('')||'<div class="empty">No match</div>';
  document.getElementById('pal-list')._items=list;
}
function runPalette(i){
  const list=document.getElementById('pal-list')._items||[];
  const x=list[i];if(!x)return;closeDrawer();x.go();
}

/* ── event delegation ── */
function wire(){
  document.getElementById('g-roles').innerHTML=ROLES.map((r,i)=>`<div class="role-opt ${i===0?'on':''}" data-role="${r.id}">
    <b>${esc(r.l)}</b><span>${esc(r.d)}</span></div>`).join('');
  document.querySelectorAll('[data-role]').forEach(el=>el.addEventListener('click',()=>{
    document.querySelectorAll('.role-opt').forEach(x=>x.classList.remove('on'));
    el.classList.add('on');SESS.role=el.getAttribute('data-role');
    const r=ROLES.find(x=>x.id===SESS.role);document.getElementById('g-user').value=r.u;
  }));
  document.getElementById('g-go').addEventListener('click',()=>{
    const r=ROLES.find(x=>x.id===SESS.role);
    document.getElementById('gate').classList.add('gone');
    document.getElementById('u-name').textContent=document.getElementById('g-user').value?r.n:r.n;
    document.getElementById('u-role').textContent=r.l;
    document.getElementById('u-av').textContent=r.n.split(' ').map(x=>x[0]).join('');
    CUR='exec';renderNav();render();fillFilters();
    toast('Signed in as '+r.l,'Session audit entry written · scope: '+(SESS.role==='regional'?'Punjab cluster':'all locations'),'em');
  });
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-nav]');if(nav&&nav.getAttribute('data-nav')){go(nav.getAttribute('data-nav'));return;}
    const col=e.target.closest('[data-collapse]');if(col){document.getElementById(col.getAttribute('data-collapse')).classList.toggle('closed');return;}
    const tab=e.target.closest('[data-tab]');
    if(tab){const k=tab.getAttribute('data-tab');VS.tab[k]=tab.getAttribute('data-tabval');render();return;}
    const th=e.target.closest('th.srt');
    if(th){const sid=th.getAttribute('data-tbl'),k=th.getAttribute('data-k');const cur=VS.sort[sid]||{};
      VS.sort[sid]={k,d:cur.k===k?-cur.d:-1};render();return;}
    const role=e.target.closest('[data-role]');if(role)return;
    const pal=e.target.closest('[data-pal]');if(pal){runPalette(+pal.getAttribute('data-pal'));return;}
    const act=e.target.closest('[data-act]');
    if(act){
      const a=act.getAttribute('data-act');
      if(a==='print'){window.print();return;}
      if(a.startsWith('nav:')){go(a.slice(4));return;}
      if(a.startsWith('toast:')){toast('Action queued',a.slice(6),'gold');return;}
      if(a.startsWith('export:')){doExport(a.slice(7));return;}
      if(a.startsWith('xls:')){doExportXLS(a.slice(4));return;}
      if(a.startsWith('dl:')){const id=a.slice(3);id==='all'?exportAll():doExport(id);return;}
      if(a.startsWith('preview:')){const id=a.slice(8);const rows=reportRows(id);openDrawer({title:'Report preview',sub:REPORT_FILES[id]+' · first 12 of '+nf(rows.length)+' rows',
        body:table(Object.keys(rows[0]||{none:1}).map(k=>({l:k.replace(/_/g,' '),f:r=>esc(String(r[k]).slice(0,42))})),rows.slice(0,12),{id:'prev',mini:true})
          +note('Full file contains '+nf(rows.length)+' rows. Use the CSV button to download it in Excel-compatible form.','em','✓')});return;}
      if(a.startsWith('rerun')){toast('Pipelines queued','Spark batch JOB-2225 + Python DS pipeline · ETA 52 minutes · a snapshot banner will appear on completion.','gold');return;}
      if(a==='wi:reset'){VS.scenario=null;render();toast('Scenario reset','Levers restored to the current actuals.');return;}
      if(a==='wi:save'){toast('Scenario saved','Added to scenario history with your user id and the current filter window.','em');return;}
      if(a.startsWith('item:')){openDrawer(drawerItem(a.slice(5)));return;}
      if(a.startsWith('promo:')){openDrawer(drawerPromo(a.slice(6)));return;}
      if(a.startsWith('model:')){openDrawer(drawerModel(a.slice(6)));return;}
      if(a.startsWith('horizon:')){VS.sel.horizon=+a.slice(8);render();return;}
      if(a==='locA'||a==='locB'){return;}
      if(a.startsWith('admin:addloc')){
        const n=(document.getElementById('nl-name')||{}).value||'New site';
        EXTRA_LOCS.push({id:'LOC-'+String(LOCATIONS.length+EXTRA_LOCS.length+1).padStart(2,'0'),name:n,
          city:(document.getElementById('nl-city')||{}).value||'Karachi',tier:(document.getElementById('nl-tier')||{}).value||'Standard',
          format:(document.getElementById('nl-format')||{}).value||'Casual Dining',seats:+(document.getElementById('nl-seats')||{}).value||100,
          opened:2024,traffic:+(document.getElementById('nl-traffic')||{}).value||1,rent:.9,rating:0,manager:'Unassigned',pending:true});
        render();toast('Location staged',n+' created · partition + feature recompute scheduled for the next Spark batch.','em');return;}
      if(a==='admin:adduser'){
        const n=(document.getElementById('nu-name')||{}).value||'New User',u=(document.getElementById('nu-user')||{}).value||'new.user';
        EXTRA_USERS.push({id:'U-'+String(USERS.length+EXTRA_USERS.length+1).padStart(3,'0'),n,u,
          r:(document.getElementById('nu-role')||{}).value||'Data Analyst',scope:(document.getElementById('nu-scope')||{}).value||'All 20 locations',
          last:'—',st:'Invited'});
        render();toast('Account created',n+' · invitation email queued · RBAC scope applied on first login.','em');return;}
      if(a==='admin:price'){
        const id=(document.getElementById('ap-item')||{}).value,p=+(document.getElementById('ap-price')||{}).value||0;
        const it=ITEMS.find(x=>x.id===id);
        if(it&&p>0){it.price=p;it.elasticity=it.elasticity;aggregate();render();toast('Price change applied',it.name+' → '+money(p,2)+' · appended to pricing_history with today’s effective date.','em');}
        return;}
      if(a==='admin:cat'){toast('Category created',(document.getElementById('nc-name')||{}).value+' added — it appears in every category filter after the next refresh.','em');return;}
      if(a.startsWith('promo-toggle:')){const p=PROMOS.find(x=>x.id===a.slice(13));if(p){p.flag=p.flag?null:'trap';render();toast(p.flag?'Campaign paused':'Campaign re-activated',p.name+(p.flag?' · flagged as a promotion trap — needs redesign before restart.':' · margin guardrails re-enabled.'),p.flag?'ox':'em');}return;}
      if(a.startsWith('user-toggle:')){const u=USERS.find(x=>x.id===a.slice(12));if(u){u.st=(u.st==='Active'?'Suspended':'Active');render();toast('Account updated',u.n+' is now '+u.st+'.');}return;}
      if(a.startsWith('rec:')){const id=a.slice(4);VS.sel.accepted=VS.sel.accepted||{};VS.sel.accepted[id]=!VS.sel.accepted[id];render();
        toast(VS.sel.accepted[id]?'Recommendation accepted':'Recommendation dismissed',id+' · recorded in the audit trail with your user id.',VS.sel.accepted[id]?'em':'');return;}
    }
    const menuBtn=e.target.closest('#tb-menu');if(menuBtn){document.body.classList.toggle('nav-open');return;}
    if(e.target.closest('#tb-home')){document.getElementById('gate').classList.remove('gone');return;}
    if(e.target.closest('#tb-theme')||e.target.closest('#theme-toggle')){toggleTheme();return;}
    if(e.target.closest('#nav-mask')){document.body.classList.remove('nav-open');return;}
    const chip=e.target.closest('#tb-cmd');if(chip){openPalette();return;}
    const bell=e.target.closest('#tb-bell');
    if(bell){openDrawer({title:'Alert digest',sub:ANOMALIES.filter(a=>a.status!=='Dismissed').length+' open anomalies · '+RECS.filter(r=>r.pri==='Critical').length+' critical recommendations',
      body:ANOMALIES.slice(0,10).map(a=>note('<b>'+esc(a.type)+'</b> · '+esc(a.entity)+' · '+esc(a.date)+' — deviation '+pc(a.deviation,1)+', impact '+moneyS(a.impact)+' ('+esc(a.sev)+') ',a.sev==='Critical'?'ox':a.sev==='High'?'cu':'','⚠')).join('')});return;}
    const sc=e.target.closest('#tb-scope');if(sc){openPalette();return;}
    const rng=e.target.closest('#tb-range');if(rng){document.getElementById('f-range').focus();return;}
    const per=e.target.closest('#tb-export');if(per){doExport(CUR);return;}
    const pr=e.target.closest('#tb-pdf');if(pr){window.print();return;}
    const uc=e.target.closest('#user-card');
    if(uc){openDrawer({title:document.getElementById('u-name').textContent,sub:ROLES.find(r=>r.id===SESS.role).l+' · session 41 min · scope: '+(SESS.role==='regional'?'Punjab cluster':'all locations'),
      body:note('Role-based access control is active. Switch role from the sign-in screen to see the navigation change — restricted modules are hidden, not merely disabled.','','🔒')
        +`<div class="dw-sec"><h4>Your session</h4><div class="kv"><dt>Role</dt><dd>${ROLES.find(r=>r.id===SESS.role).l}</dd><dt>Signed in</dt><dd>2024-05-31 09:12</dd><dt>Exports today</dt><dd>3 of 10</dd><dt>Last audited action</dt><dd>view dashboard</dd></div></div>`
        +btn('Sign out','nav:__signout','gold wide')});return;}
    if(e.target.closest('#dw-close')||e.target.closest('#dw-mask')||e.target.closest('#pal-mask')){closeDrawer();return;}
  });
  document.getElementById('pal-input').addEventListener('input',e=>drawPalette(e.target.value));
  document.getElementById('pal-input').addEventListener('keydown',e=>{if(e.key==='Enter')runPalette(0);if(e.key==='Escape')closeDrawer();});
  [['f-range','range'],['f-loc','loc'],['f-cat','cat'],['f-seg','seg'],['f-chan','chan'],['f-class','cls'],
   ['f-price','price'],['f-rating','rating'],['f-waste','waste']].forEach(function(pair){
    const el=document.getElementById(pair[0]);if(el)el.addEventListener('change',e=>applyFilter(pair[1],e.target.value));});
  document.getElementById('f-q').addEventListener('input',e=>{FILTER.q=e.target.value;aggregate();render();});
  document.getElementById('f-reset').addEventListener('click',resetFilters);
  document.addEventListener('change',e=>{
    const a=e.target.getAttribute&&e.target.getAttribute('data-act');
    if(!a)return;
    if(a==='wi-item'){VS.scenario=VS.scenario||{};VS.scenario.itemId=e.target.value;render();}
    if(a==='locA'){VS.sel.locA=e.target.value;render();}
    if(a==='locB'){VS.sel.locB=e.target.value;render();}
  });
  document.addEventListener('input',e=>{
    const a=e.target.getAttribute&&e.target.getAttribute('data-act');
    if(!a||!a.startsWith('wi-'))return;
    const v=+e.target.value;VS.scenario=VS.scenario||{};
    const key={ 'wi-price':'price','wi-disc':'disc','wi-promof':'promoF','wi-prep':'prep','wi-demand':'demand','wi-waste':'waste'}[a];
    if(key){VS.scenario[key]=v;const b=e.target.parentElement.querySelector('b');if(b)b.textContent=pc(v,0);
      const host=document.getElementById('content');const scroll=host.scrollTop;render();host.scrollTop=scroll;}
  });
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();}
    if(e.key==='Escape'){closeDrawer();}
    if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();openPalette();}
  });
}
const FILTER_MAP={range:'range',loc:'loc',cat:'cat',seg:'seg',chan:'chan',cls:'cls',price:'price',rating:'rating',waste:'waste'};

/* ── theme (dark / light) ── */
function toggleTheme(){
  const html=document.documentElement;
  const next=html.getAttribute('data-theme')==='light'?'dark':'light';
  if(next==='light')html.setAttribute('data-theme','light');else html.removeAttribute('data-theme');
  try{localStorage.setItem('dineiq-theme',next);}catch(e){}
  document.querySelectorAll('#tb-theme svg,#theme-toggle svg').forEach(svg=>{
    svg.innerHTML=next==='light'
      ?'<path d="M13.5 8.6A5.6 5.6 0 017.4 2.5 5.6 5.6 0 108 13.6a5.6 5.6 0 005.5-5z"/>'
      :'<path d="M8 1.5v2M8 12.5v2M2.6 2.6l1.4 1.4M12 12l1.4 1.4M1.5 8h2M12.5 8h2M2.6 13.4l1.4-1.4M12 4l1.4-1.4"/><circle cx="8" cy="8" r="3.2"/>';
  });
  render(); /* charts carry theme-dependent literal colors — redraw the active view */
}
(function initTheme(){
  let saved=null; try{saved=localStorage.getItem('dineiq-theme');}catch(e){}
  if(saved==='light'){document.documentElement.setAttribute('data-theme','light');
    document.querySelectorAll('#tb-theme svg,#theme-toggle svg').forEach(svg=>{svg.innerHTML='<path d="M13.5 8.6A5.6 5.6 0 017.4 2.5 5.6 5.6 0 108 13.6a5.6 5.6 0 005.5-5z"/>';});}
})();

/* ── boot ── */
initTip();
wire();
renderNav();
render();
fillFilters();
setInterval(()=>{ /* keep relative labels fresh without re-rendering charts */
  const el=document.getElementById('m-rows');if(el)el.textContent=nf(1048575/1000,0)+'K lines';
},60000);

/* ── scroll-reveal for the landing sections ── */
(function(){
  const els=document.querySelectorAll('.reveal');
  if(!els.length) return;
  if(!('IntersectionObserver' in window)||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
    els.forEach(el=>el.classList.add('in'));return;
  }
  const io=new IntersectionObserver((entries)=>{entries.forEach(en=>{if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});},{threshold:.14});
  els.forEach(el=>io.observe(el));
})();

/* ── ambient 3D mark: subtle mouse-parallax tilt on the sign-in card (CSS fallback layer) ── */
(function(){
  const rig=document.querySelector('.gate-3d-rig'), card=document.querySelector('.gate-card');
  if(!rig||!card) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  card.addEventListener('mousemove',e=>{
    const r=card.getBoundingClientRect();
    const px=(e.clientX-r.left)/r.width-.5, py=(e.clientY-r.top)/r.height-.5;
    rig.style.animationPlayState='paused';
    rig.style.transform=`rotateX(${(-18-py*14).toFixed(1)}deg) rotateY(${(py*0+px*22).toFixed(1)}deg)`;
  });
  card.addEventListener('mouseleave',()=>{rig.style.transform='';rig.style.animationPlayState='running';});
})();

/* ── Three.js hero scene: floating low-poly shapes + a connected particle field ──
   Lightweight, capped particle count, pauses off-screen/hidden, respects reduced motion,
   and fails silently (leaving the CSS 3D mark as the visual) if WebGL is unavailable. ── */
(function(){
  const canvas=document.getElementById('tj-canvas');
  if(!canvas||typeof THREE==='undefined') return;
  const reduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try{
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  }catch(e){return;}
  if(!renderer) return;

  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,0.1,100);
  camera.position.set(0,0,11);

  const dpr=Math.min(window.devicePixelRatio||1,1.6);
  function size(){renderer.setPixelRatio(dpr);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  size();

  const isLight=()=>document.documentElement.getAttribute('data-theme')==='light';
  const goldCol=()=>new THREE.Color(isLight()?0xA9791F:0xD8B25E);
  const plumCol=()=>new THREE.Color(0x8E5A86);
  const emeraldCol=()=>new THREE.Color(0x2FA37A);

  /* particle field with nearest-neighbour connecting lines */
  const N=70;
  const pts=new Float32Array(N*3);
  const vel=[];
  for(let i=0;i<N;i++){
    pts[i*3]=(Math.random()-.5)*16; pts[i*3+1]=(Math.random()-.5)*10; pts[i*3+2]=(Math.random()-.5)*8;
    vel.push([(Math.random()-.5)*.004,(Math.random()-.5)*.004,(Math.random()-.5)*.004]);
  }
  const pGeo=new THREE.BufferGeometry();
  pGeo.setAttribute('position',new THREE.BufferAttribute(pts,3));
  const pMat=new THREE.PointsMaterial({color:goldCol(),size:.055,transparent:true,opacity:.75});
  const points=new THREE.Points(pGeo,pMat);
  scene.add(points);

  const lineGeo=new THREE.BufferGeometry();
  const lineMat=new THREE.LineBasicMaterial({color:goldCol(),transparent:true,opacity:.14});
  const lineSeg=new THREE.LineSegments(lineGeo,lineMat);
  scene.add(lineSeg);
  const MAXD=2.6, MAXLINES=N*4;
  const lineArr=new Float32Array(MAXLINES*2*3);

  /* two floating low-poly shapes for depth */
  const shapes=[];
  const geo1=new THREE.IcosahedronGeometry(1.5,0);
  const mat1=new THREE.MeshBasicMaterial({color:plumCol(),wireframe:true,transparent:true,opacity:.35});
  const m1=new THREE.Mesh(geo1,mat1); m1.position.set(4.4,1.6,-3); scene.add(m1); shapes.push(m1);
  const geo2=new THREE.OctahedronGeometry(1.05,0);
  const mat2=new THREE.MeshBasicMaterial({color:emeraldCol(),wireframe:true,transparent:true,opacity:.3});
  const m2=new THREE.Mesh(geo2,mat2); m2.position.set(-4.8,-1.8,-2); scene.add(m2); shapes.push(m2);

  let mx=0,my=0,targetX=0,targetY=0;
  addEventListener('mousemove',e=>{targetX=(e.clientX/innerWidth-.5); targetY=(e.clientY/innerHeight-.5);},{passive:true});
  addEventListener('resize',size);

  let running=true;
  document.addEventListener('visibilitychange',()=>{running=!document.hidden;});
  const gateEl=document.getElementById('gate');

  let raf=null,t=0;
  function tick(){
    raf=requestAnimationFrame(tick);
    if(!running) return;
    if(gateEl&&gateEl.classList.contains('gone')) return; /* signed in — landing hidden, skip work */
    t+=0.0035;
    mx+=(targetX-mx)*.04; my+=(targetY-my)*.04;
    camera.position.x=mx*1.4; camera.position.y=-my*1.0; camera.lookAt(0,0,0);

    const posAttr=pGeo.attributes.position;
    for(let i=0;i<N;i++){
      let x=posAttr.getX(i)+vel[i][0], y=posAttr.getY(i)+vel[i][1], z=posAttr.getZ(i)+vel[i][2];
      if(x>8||x<-8)vel[i][0]*=-1; if(y>5||y<-5)vel[i][1]*=-1; if(z>4||z<-4)vel[i][2]*=-1;
      posAttr.setXYZ(i,x,y,z);
    }
    posAttr.needsUpdate=true;

    let li=0;
    for(let i=0;i<N&&li<MAXLINES;i++){
      for(let j=i+1;j<N&&li<MAXLINES;j++){
        const dx=posAttr.getX(i)-posAttr.getX(j), dy=posAttr.getY(i)-posAttr.getY(j), dz=posAttr.getZ(i)-posAttr.getZ(j);
        const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(d<MAXD){
          lineArr[li*6]=posAttr.getX(i); lineArr[li*6+1]=posAttr.getY(i); lineArr[li*6+2]=posAttr.getZ(i);
          lineArr[li*6+3]=posAttr.getX(j); lineArr[li*6+4]=posAttr.getY(j); lineArr[li*6+5]=posAttr.getZ(j);
          li++;
        }
      }
    }
    lineGeo.setAttribute('position',new THREE.BufferAttribute(lineArr.slice(0,li*6),3));
    lineGeo.attributes.position.needsUpdate=true;

    shapes.forEach((s,i)=>{s.rotation.x=t*.5*(i?1:-1); s.rotation.y=t*.35;});
    m1.position.y=1.6+Math.sin(t*.8)*.25; m2.position.y=-1.8+Math.cos(t*.7)*.22;

    renderer.render(scene,camera);
  }
  if(reduced){renderer.render(scene,camera);} else {tick();}

  /* success: fade the CSS fallback mark out, canvas takes over the hero background */
  document.querySelectorAll('.gate-3d').forEach(el=>el.style.opacity='0');

  /* keep material colors correct when the theme toggles */
  document.addEventListener('click',e=>{
    if(e.target.closest('#tb-theme')||e.target.closest('#theme-toggle')){
      pMat.color=goldCol(); lineMat.color=goldCol();
    }
  });

  /* Live NFR Ensemble Scoring handler */
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'btn-run-nfr-scoring' || e.target.closest('#btn-run-nfr-scoring'))) {
      const taskEl = document.getElementById('nfr-task');
      const task = taskEl ? taskEl.value : 'order_value';
      const amount = parseFloat((document.getElementById('nfr-amount') || {}).value) || 3200;
      const items = parseInt((document.getElementById('nfr-items') || {}).value) || 5;
      const orders = parseInt((document.getElementById('nfr-orders') || {}).value) || 14;
      const spend = parseFloat((document.getElementById('nfr-spend') || {}).value) || 24500;
      const promo = parseInt((document.getElementById('nfr-promo') || {}).value) || 0;

      const resultBox = document.getElementById('nfr-scoring-result');
      if (resultBox) {
        resultBox.innerHTML = '<div style="color:var(--gold); padding:12px; font-weight:500;">Connecting to warm-process model scoring endpoint...</div>';
      }

      const record = {
        order_amount: amount,
        item_count: items,
        customer_orders: orders,
        customer_spend: spend,
        promo_applied: promo,
        orders: orders,
        spend: spend
      };

      fetch('/api/v1/predict/ensemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task, records: [record] })
      })
      .then(res => res.json())
      .then(data => {
        if (!resultBox) return;
        if (data.error) {
          resultBox.innerHTML = `<div style="color:var(--oxblood-2); background:var(--oxblood-a12); padding:12px; border:1px solid var(--oxblood); border-radius:8px;">API Error: ${esc(data.error)}</div>`;
          return;
        }
        const pred = data.predictions[0];
        const passBadge = data.nfr_pass ? '<span class="tag em">PASS (&lt; 5000 ms)</span>' : '<span class="tag ox">FAIL</span>';
        const taskLabel = task === 'order_value' ? 'High-Value Order' : 'Customer Churn Risk';
        const decisionText = pred.ensemble_label === 1 ? (task === 'order_value' ? 'HIGH VALUE ORDER' : 'HIGH CHURN RISK') : (task === 'order_value' ? 'STANDARD ORDER' : 'LOW CHURN RISK');
        const decisionColor = pred.ensemble_label === 1 ? 'var(--emerald-2)' : 'var(--sub)';

        resultBox.innerHTML = `
          <div style="background:var(--panel-2); border:1px solid var(--line-2); border-radius:10px; padding:16px; margin-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
              <div>
                <b style="color:var(--gold); font-size:15px;">Live Dual-Pipeline Ensemble Scoring</b>
                <div style="font-size:11px; color:var(--sub);">${esc(taskLabel)} · ${data.record_count} record scored</div>
              </div>
              <div style="font-family:JetBrains Mono,monospace; font-size:12px;">
                Latency: <b style="color:var(--gold-2);">${data.latency_ms} ms</b> ${passBadge}
              </div>
            </div>
            <div class="grid g4" style="gap:12px;">
              <div style="background:var(--panel-3); padding:12px; border-radius:8px; border:1px solid var(--line);">
                <div style="font-size:10px; color:var(--sub); text-transform:uppercase; letter-spacing:0.05em;">PySpark MLlib Proba</div>
                <div style="font-size:20px; font-weight:700; color:var(--copper-2); margin-top:4px;">${(pred.pipeline_proba * 100).toFixed(1)}%</div>
                <div style="font-size:10px; color:var(--muted); margin-top:2px;">Warm PySpark pipeline model</div>
              </div>
              <div style="background:var(--panel-3); padding:12px; border-radius:8px; border:1px solid var(--line);">
                <div style="font-size:10px; color:var(--sub); text-transform:uppercase; letter-spacing:0.05em;">Python Sklearn Proba</div>
                <div style="font-size:20px; font-weight:700; color:var(--emerald-2); margin-top:4px;">${(pred.python_proba * 100).toFixed(1)}%</div>
                <div style="font-size:10px; color:var(--muted); margin-top:2px;">Independent Python DS model</div>
              </div>
              <div style="background:var(--panel-3); padding:12px; border-radius:8px; border:1px solid var(--line);">
                <div style="font-size:10px; color:var(--sub); text-transform:uppercase; letter-spacing:0.05em;">Ensemble Avg Proba</div>
                <div style="font-size:20px; font-weight:700; color:var(--gold-2); margin-top:4px;">${(pred.ensemble_proba * 100).toFixed(1)}%</div>
                <div style="font-size:10px; color:var(--muted); margin-top:2px;">50/50 dual probability average</div>
              </div>
              <div style="background:var(--panel-3); padding:12px; border-radius:8px; border:1px solid var(--line);">
                <div style="font-size:10px; color:var(--sub); text-transform:uppercase; letter-spacing:0.05em;">Ensemble Decision</div>
                <div style="font-size:16px; font-weight:700; color:${decisionColor}; margin-top:6px;">${decisionText}</div>
                <div style="font-size:10px; color:var(--muted); margin-top:2px;">Threshold = 0.50</div>
              </div>
            </div>
          </div>
        `;
      })
      .catch(err => {
        if (!resultBox) return;
        resultBox.innerHTML = `<div style="color:var(--oxblood-2); background:var(--oxblood-a12); padding:12px; border:1px solid var(--oxblood); border-radius:8px;">Network / Connection Error: ${esc(String(err))}</div>`;
      });
    }
  });

  // Check API Status on startup
  try {
    fetch('/api/v1/status')
      .then(r => r.json())
      .then(d => {
        const el = document.getElementById('f-count');
        if (el) el.innerText = `API Live · ${d.nfr_latency_ms}ms`;
      })
      .catch(() => {});
  } catch(e) {}
})();

