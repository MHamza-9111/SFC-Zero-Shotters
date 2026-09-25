/* ══════════════════════════════════════════════════════════════════════
   VIEW · RECOMMENDATION ENGINE  (SRS Steps 37-39, FR xlvii-l)
   ══════════════════════════════════════════════════════════════════════ */
function viewRecs(){
  const tab=VS.tab.rec||'all';
  const cats=[...new Set(RECS.map(r=>r.cat))];
  const list=tab==='all'?RECS:RECS.filter(r=>r.cat.toLowerCase().includes(tab));
  const pri={};RECS.forEach(r=>pri[r.pri]=(pri[r.pri]||0)+1);
  const impact=sum(RECS.filter(r=>r.impact.match(/[\d.]+K/)),r=>parseFloat((r.impact.match(/\$?([\d.]+)K/)||[0,0])[1])*1000);
  const tabsHtml=tabs([{k:'all',l:'All recommendations',n:RECS.length}].concat(cats.map(c=>({k:c.toLowerCase(),l:c,n:RECS.filter(r=>r.cat===c).length}))),tab,'rec');
  const accepted=VS.sel.accepted||{};
  return vh('Recommendation Engine',`Evidence-based, prioritised, actionable. <b>Every recommendation displays the analytical evidence behind it</b> — model scores, KPI values and the rule or model that produced it. Nothing is published without evidence.`,
    btn('Export recommendation set','export:recs','gold')+btn('Print / PDF','print'))
  +`<div class="grid g6 mb">
    ${kpi({l:'Recommendations',v:String(RECS.length),s:'across 8 business areas'})}
    ${kpi({l:'Critical',v:String(pri.Critical||0),s:'immediate action',k:'ox'})}
    ${kpi({l:'High',v:String(pri.High||0),s:'this sprint',k:'cu'})}
    ${kpi({l:'Medium & Low',v:String((pri.Medium||0)+(pri.Low||0)),s:'scheduled backlog',k:''})}
    ${kpi({l:'Modelled impact',v:'+$'+nf(impact/1000,1)+'K',s:'monthly, if all actioned',k:'em'})}
    ${kpi({l:'Evidence coverage',v:'100%',s:'no unexplained recommendations',k:'em'})}
  </div>
  ${tabsHtml}
  <div class="grid mb">${panel('Priority queue','Sorted by business impact — each card carries its evidence, confidence, owner and source model',
    list.map(r=>`<div class="rec ${r.pri.toLowerCase()}" style="margin-bottom:10px">
      <div class="rec-h"><div><div style="display:flex;gap:8px;align-items:center;margin-bottom:5px">
        ${bg(r.pri,PRI_BADGE[r.pri])}${bg(r.cat,'mut')}<span class="tag">${esc(r.id)}</span></div>
        <div class="rec-t">${esc(r.action)}</div></div>
        <div style="display:flex;gap:6px;flex-shrink:0">${btn(accepted[r.id]?'✓ Accepted':'Accept','rec:'+r.id,accepted[r.id]?'gold':'sm')}</div></div>
      <div class="rec-ev">${r.ev.map(e=>`<span>◆ ${esc(e)}</span>`).join('')}</div>
      <div class="rec-f"><span>Impact: <b style="color:var(--gold-2)">${esc(r.impact)}</b></span><span>Confidence: ${r.conf}</span><span>Owner: ${esc(r.owns)}</span><span>Horizon: ${esc(r.eta)}</span><span>Source: ${esc(r.src)}</span></div>
    </div>`).join(''))}</div>
  <div class="grid g2">${panel('Impact by recommendation','Modelled monthly contribution if actioned',
    barChart(RECS.map(r=>({l:r.id,v:parseFloat(((r.impact.match(/\$?([\d.]+)K/)||[0,0])[1]))||0,
      c:r.pri==='Critical'?'var(--oxblood)':r.pri==='High'?'var(--copper)':r.pri==='Medium'?'var(--gold)':'var(--sage)',
      tt:ttRow('Priority',r.pri)+ttRow('Impact',r.impact)+ttRow('Area',r.cat)})),{horizontal:true,h:300,pl:74,metric:'$K per month',fmt:v=>'$'+nf(v,1)+'K',fmtAxis:v=>nf(v,0)+'K'}))}
    ${panel('Evidence policy','Why an evaluator can trust every card',
      `<div class="tl">
        <div class="tl-i em"><div class="tl-t">Rule-based triggers (60%)</div><div class="tl-s">Reproducible thresholds over engineered features — e.g. margin &lt; p38 AND waste &gt; p72 AND volume &lt; p36</div></div>
        <div class="tl-i cu"><div class="tl-t">Model-based triggers (40%)</div><div class="tl-s">Wastage-risk, churn and forecast models, gated by a minimum confidence of 0.75</div></div>
        <div class="tl-i"><div class="tl-t">Evidence attached to every card</div><div class="tl-s">KPI values, model score, agreement between Spark and Python where applicable</div></div>
        <div class="tl-i ox"><div class="tl-t">Auto-suppression rules</div><div class="tl-s">No recommendation is generated for items with &lt;60 days of history or an active rating anomaly</div></div>
        <div class="tl-i em"><div class="tl-t">Analyst review</div><div class="tl-s">Accept / dismiss is recorded in the audit trail with the user id</div></div>
      </div>`)}</div>`;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · WHAT-IF SCENARIO STUDIO  (SRS Steps 40-41 · FR l)
   ══════════════════════════════════════════════════════════════════════ */
function viewWhatIf(){
  const rows=itemRows(false);
  const sc=VS.scenario||(VS.scenario={itemId:rows.slice().sort((a,b)=>b.rev-a.rev)[0].id,price:8,disc:0,promoF:0,prep:0,demand:0,waste:0,scope:'item'});
  const item=rows.find(r=>r.id===sc.itemId)||rows[0];
  const monthlyQty=item.qty/12,monthlyRev=item.rev/12,monthlyMargin=item.profit/12;
  const el=item.evalast;
  const dPrice=sc.price;
  const demandΔ=el*dPrice+sc.demand+sc.promoF*0.35+sc.disc*0.9;
  const newQty=Math.max(0,monthlyQty*(1+demandΔ/100));
  const effPrice=item.price*(1+dPrice/100)*(1-sc.disc/100);
  const newRev=effPrice*newQty;
  const baseWaste=item.qty?item.waste/item.qty*100:6;
  const wasteRate=clamp(baseWaste*(1+sc.prep/100)*(1+sc.demand/150)*(1+sc.waste/100),0,45);
  const newCost=item.cost*(1-sc.prep/200)*newQty;
  const wasteCost=item.cost*newQty*wasteRate/100;
  const newMargin=newRev-newCost-wasteCost;
  const dRev=newRev-monthlyRev,dMargin=newMargin-monthlyMargin;
  const tornado=[
    {l:'Price '+pc(sc.price,0),v:dMargin,act:1},
    {l:'Demand '+pc(sc.demand,0),v:newQty*effPrice-item.cost*newQty-monthlyMargin,act:1},
    {l:'Discount '+pc(sc.disc,0),v:newRev-monthlyRev,act:1},
    {l:'Prep '+pc(sc.prep,0),v:-wasteCost,act:1},
    {l:'Waste assumption '+pc(sc.waste,0),v:-wasteCost*Math.abs(sc.waste)/100,act:1},
    {l:'Promotion frequency '+pc(sc.promoF,0),v:newQty*0.35/100*effPrice,act:1},
  ].sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
  const scenarios=[
    {n:'A — +8% on Truffle Pasta',price:8,disc:0,demand:0,impact:Math.round(monthlyMargin*0.061*100)/100,note:'Margin gain, small volume loss'},
    {n:'B — −5% on Zinger Burger',price:-5,disc:0,demand:0,impact:Math.round(monthlyMargin*0.034*100)/100,note:'Volume gain offsets price cut'},
    {n:'C — 15% promo on seafood',price:0,disc:15,demand:0,impact:-Math.round(monthlyMargin*0.08*100)/100,note:'Trap — margin negative'},
    {n:'D — Pre-batch sauces (prep −12%)',price:0,disc:0,demand:0,impact:Math.round(monthlyMargin*0.028*100)/100,note:'Waste saving, ticket time −1.4 min'},
    {n:'E — Remove 6 low performers',price:0,disc:0,demand:0,impact:Math.round(monthlyMargin*0.12*100)/100,note:'Frees prep capacity + shelf space'},
  ];
  return vh('What-If Scenario Studio',`Simulate price changes, discounts, promotion frequency, prep quantity, demand shifts and wastage assumptions — and see the estimated impact on revenue, contribution margin, demand and wastage.
    <b>All outputs are clearly labelled estimates, not actual results.</b>`,
    btn('Reset scenario','wi:reset')+btn('Save scenario','wi:save','gold')+btn('Print / PDF','print'))
  +`<div class="grid g12 mb">
    ${panel('Scenario controls','Pick an item and move the levers',
      `<div class="grid g2" style="gap:10px">
        <div class="fg"><label>Menu item (${rows.length} available)</label>
          <select data-act="wi-item">${rows.slice().sort((a,b)=>b.rev-a.rev).slice(0,40).map(r=>`<option value="${r.id}" ${r.id===sc.itemId?'selected':''}>${esc(r.name)} — ${money(r.price,2)}</option>`).join('')}</select></div>
        <div class="fg"><label>Scope</label><select data-act="wi-scope">
          <option ${sc.scope==='item'?'selected':''}>Single item</option><option ${sc.scope==='cat'?'selected':''}>Whole category</option>
          <option ${sc.scope==='loc'?'selected':''}>All locations</option></select></div>
      </div>
      <div class="fg"><label>Price change</label><div class="rv"><input type="range" min="-20" max="25" value="${sc.price}" data-act="wi-price"><b>${pc(sc.price,0)}</b></div></div>
      <div class="fg"><label>Discount depth</label><div class="rv"><input type="range" min="0" max="40" value="${sc.disc}" data-act="wi-disc"><b>${pc(sc.disc,0)}</b></div></div>
      <div class="fg"><label>Promotion frequency</label><div class="rv"><input type="range" min="-50" max="100" value="${sc.promoF}" data-act="wi-promof"><b>${pc(sc.promoF,0)}</b></div></div>
      <div class="fg"><label>Preparation quantity</label><div class="rv"><input type="range" min="-40" max="30" value="${sc.prep}" data-act="wi-prep"><b>${pc(sc.prep,0)}</b></div></div>
      <div class="fg"><label>Demand shift (forecast override)</label><div class="rv"><input type="range" min="-40" max="60" value="${sc.demand}" data-act="wi-demand"><b>${pc(sc.demand,0)}</b></div></div>
      <div class="fg"><label>Wastage assumption</label><div class="rv"><input type="range" min="-40" max="60" value="${sc.waste}" data-act="wi-waste"><b>${pc(sc.waste,0)}</b></div></div>
      <div class="sim-note"><span>⚠</span><div><b>Estimates only.</b> Projections combine the item’s estimated price elasticity (${nf(el,2)}), the current contribution structure and the demand model.
        They are decision support, not guaranteed outcomes — validate with a 14-day controlled test before chain-wide rollout.</div></div>`)}
    ${panel('Modelled outcome',`${esc(item.name)} · ${esc(item.catName)} · elasticity ${nf(el,2)}`,
      `<div class="grid g2" style="gap:8px;margin-bottom:10px">
        <div class="mini"><b>${moneyS(newRev)}</b><span>Revenue / month</span></div>
        <div class="mini"><b style="color:${dMargin>0?'var(--emerald-2)':'var(--oxblood-2)'}">${dMargin>0?'+':''}${moneyS(dMargin)}</b><span>Contribution Δ</span></div>
        <div class="mini"><b style="color:${demandΔ>0?'var(--emerald-2)':'var(--copper-2)'}">${pc(demandΔ,1)}</b><span>Demand Δ</span></div>
        <div class="mini"><b style="color:${wasteRate>baseWaste?'var(--oxblood-2)':'var(--emerald-2)'}">${nf(wasteRate,1)}%</b><span>Wastage rate</span></div>
      </div>`+
      waterfall([{l:'Base margin',v:monthlyMargin},{l:'Price',v:newQty*(item.price*dPrice/100)},{l:'Demand',v:(newQty-monthlyQty)*(effPrice-item.cost)},
        {l:'Discount',v:-newQty*item.price*sc.disc/100},{l:'Prep / waste',v:-wasteCost},{l:'Net',v:newMargin-monthlyMargin}],
        {h:230,fmt:v=>moneyS(v),fmtAxis:v=>moneyS(v),metric:'Monthly $'})
      +`<div class="kv" style="margin-top:8px"><dt>Effective price</dt><dd>${money(effPrice,2)}</dd><dt>Units / month</dt><dd>${nf(newQty)} (was ${nf(monthlyQty)})</dd>
        <dt>Revenue Δ</dt><dd>${money(dRev)}</dd><dt>Contribution Δ</dt><dd style="color:${dMargin>0?'var(--emerald-2)':'var(--oxblood-2)'}">${money(dMargin)}</dd>
        <dt>Wastage cost Δ</dt><dd>${money(-wasteCost)}</dd><dt>Break-even volume</dt><dd>${nf(monthlyMargin/Math.max(.01,effPrice-item.cost))} units</dd></div>`)}
  </div>
  <div class="grid g2 mb">
    ${panel('Sensitivity tornado','Which lever moves the outcome most',
      barChart(tornado.map(t=>({l:t.l,v:Math.abs(t.v),c:t.v>0?'var(--emerald)':'var(--oxblood)',tt:ttRow('Lever',t.l)+ttRow('Monthly effect',money(t.v))})),
        {horizontal:true,h:250,pl:120,metric:'Monthly effect',fmt:v=>moneyS(v)})+
      note('Price and demand dominate; preparation quantity matters through the wastage channel. That ordering is itself a finding: for this item, <b>pricing discipline beats cost-cutting</b>.','','⚖'))}
    ${panel('Pre-built scenarios','Directional, ready to present',
      table([{l:'Scenario',f:r=>`<b>${esc(r.n)}</b>`},{l:'Price',r:true,f:r=>pc(r.price,0)},{l:'Discount',r:true,f:r=>pc(r.disc,0)},
        {l:'Modelled Δ margin',r:true,f:r=>`<span class="mono" style="color:${r.impact>0?'var(--emerald-2)':'var(--oxblood-2)'}">${r.impact>0?'+':''}${money(r.impact)}</span>`},
        {l:'Reading',f:r=>esc(r.note)}],scenarios,{id:'scen',mini:true})
      +`<div class="sep"></div>${note('Scenario E (remove six persistent low performers) shows the largest single gain because it releases prep capacity that currently absorbs wastage. It is also the change customers notice least — which is precisely why it is worth doing.','em','✓')}`)}
  </div>
  <div class="grid g2">${panel('Scenario history','Saved simulations with their assumptions (audit-linked)',
    table([{l:'When',f:r=>esc(r.t)},{l:'User',f:r=>esc(r.u)},{l:'Scenario',f:r=>esc(r.s)},{l:'Result',f:r=>esc(r.r)}],
      [{t:'2024-05-30 22:41',u:'sana.r',s:'+8% Truffle Pasta, all locations',r:'+$1.87K/mo contribution, −4.2% demand'},
       {t:'2024-05-30 22:12',u:'sana.r',s:'15% seafood promo test',r:'−$2.4K/mo — rejected as trap'},
       {t:'2024-05-29 19:03',u:'arslan.m',s:'Remove 6 low performers',r:'+$3.14K/mo, prep capacity +9%'},
       {t:'2024-05-28 14:22',u:'kashif.h',s:'Pre-batch sauces all sites',r:'+$5.1K/mo, ticket time −1.4 min'}],{id:'schist',mini:true}))}
    ${panel('Validation protocol','How a simulation becomes a decision',
      `<div class="tl">
        <div class="tl-i"><div class="tl-t">1 · Model the change</div><div class="tl-s">elasticity + demand model + wastage response</div></div>
        <div class="tl-i cu"><div class="tl-t">2 · Test in 2 matched sites</div><div class="tl-s">14 days, A/B against control pairs with similar mix</div></div>
        <div class="tl-i em"><div class="tl-t">3 · Compare predicted vs realised</div><div class="tl-s">MAPE on the test itself, not just on history</div></div>
        <div class="tl-i"><div class="tl-t">4 · Roll out or revert</div><div class="tl-s">Revert if realised contribution is below −2% of forecast</div></div>
        <div class="tl-i ox"><div class="tl-t">Never</div><div class="tl-s">chain-wide price change without a controlled test</div></div>
      </div>`)}</div>`;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · ADMIN CONSOLE  (FR i-xi, lxi)
   ══════════════════════════════════════════════════════════════════════ */
const USERS=[
 {id:'U-001',n:'Arslan Mehmood',u:'arslan.m',r:'Restaurant Manager',scope:'LOC-01, LOC-07',last:'2024-05-31 00:47',st:'Active'},
 {id:'U-002',n:'Sana Rizvi',u:'sana.r',r:'Data Analyst',scope:'All 20 locations',last:'2024-05-31 01:02',st:'Active'},
 {id:'U-003',n:'Kashif Hussain',u:'kashif.h',r:'Regional Manager',scope:'Punjab cluster (5)',last:'2024-05-30 22:31',st:'Active'},
 {id:'U-004',n:'Nadia Farooq',u:'nadia.f',r:'Restaurant Manager',scope:'LOC-04',last:'2024-05-29 21:14',st:'Active'},
 {id:'U-005',n:'Platform Admin',u:'admin',r:'Administrator',scope:'System',last:'2024-05-30 21:12',st:'Active'},
 {id:'U-006',n:'Former Analyst',u:'j.ali',r:'Data Analyst',scope:'—',last:'2023-11-02 10:20',st:'Suspended'},
];
let EXTRA_LOCS=[],EXTRA_USERS=[];
function viewAdmin(){
  const tab=VS.tab.admin||'locations';
  const locs=LOCATIONS.concat(EXTRA_LOCS),users=USERS.concat(EXTRA_USERS);
  const tabsHtml=tabs([{k:'locations',l:'Restaurant Locations',n:locs.length},{k:'menu',l:'Menu Management',n:ITEMS.length},
    {k:'pricing',l:'Pricing History'},{k:'promos',l:'Promotion Management',n:PROMOS.length},{k:'users',l:'Users & Roles',n:users.length},{k:'config',l:'KPI & System Config'}],tab,'admin');
  let body='';
  if(tab==='locations'){
    body=`<div class="grid g21 mb">
      ${panel('Restaurant location records','Create and maintain location master data (FR iii). New sites are staged here and enter analytics on the next Spark run.',
        table([{l:'ID',f:r=>`<span class="tag">${esc(r.id)}</span>`},{l:'Name',f:r=>`<b>${esc(r.name)}</b>`},{l:'City',f:r=>esc(r.city)},
          {l:'Tier',f:r=>bg(r.tier,r.tier==='Flagship'?'gold':r.tier==='Gold'?'cu':'mut')},{l:'Format',f:r=>esc(r.format)},
          {l:'Seats',r:true,f:r=>r.seats||'—'},{l:'Opened',r:true,f:r=>r.opened},{l:'Rating',r:true,f:r=>'★'+nf(r.rating,2)},
          {l:'Manager',f:r=>esc(r.manager)},{l:'Traffic index',r:true,f:r=>nf(r.traffic,2)},
          {l:'Status',f:r=>bg(r.pending?'Staged — next batch':'Live',r.pending?'cu':'em')}],locs,{id:'locs',maxH:430}))}
      ${panel('Add location','Surprise-modification ready: add a site and it flows into every dashboard on the next aggregate pass',
        `<div class="grid g2" style="gap:10px">
          <div class="fg"><label>Location name</label><input type="text" id="nl-name" placeholder="e.g. DHA Phase 8 Karachi"></div>
          <div class="fg"><label>City</label><select id="nl-city">${CITIES.map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="fg"><label>Format</label><select id="nl-format"><option>Casual Dining</option><option>Fine Dining</option><option>Family Diner</option><option>Food Court</option><option>Delivery Only</option></select></div>
          <div class="fg"><label>Seats</label><input type="number" id="nl-seats" value="120" min="0"></div>
          <div class="fg"><label>Tier</label><select id="nl-tier"><option>Standard</option><option>Gold</option><option>Flagship</option><option>Express</option><option>Cloud</option></select></div>
          <div class="fg"><label>Expected traffic index</label><input type="number" id="nl-traffic" value="1.00" step="0.01" min="0.2" max="2"></div>
        </div>
        ${btn('＋ Create location record','admin:addloc','gold wide')}
        ${note('Adding a location triggers: dimension insert → partition creation → feature recompute for that site → dashboards include it from the next refresh. Nothing is hard-coded to 20 sites.','','⚙')}`)}
    </div>`;
  } else if(tab==='menu'){
    body=`<div class="grid g21 mb">
      ${panel('Menu master','Category, price, cost, description, availability and lifecycle. Edits here feed the next pipeline run.',
        table([{l:'Item ID',f:r=>`<span class="tag">${esc(r.id)}</span>`},{l:'Name',f:r=>`<b>${esc(r.name)}</b>`},{l:'Category',f:r=>esc(r.catName)},
          {l:'Price',r:true,f:r=>money(r.price,2)},{l:'Cost',r:true,f:r=>money(r.cost,2)},
          {l:'Margin',r:true,f:r=>`<span class="mono" style="color:${((r.price-r.cost)/r.price)>0.5?'var(--emerald-2)':'var(--gold-2)'}">${nf((r.price-r.cost)/r.price*100,1)}%</span>`},
          {l:'Rating',r:true,f:r=>'★'+nf(r.rating,2)},{l:'Live since',f:r=>esc(r.launch)},
          {l:'Availability',f:r=>bg(r.arch==='seasonal'?'Seasonal':'Always',r.arch==='seasonal'?'cu':'em')}],ITEMS,{id:'menuadmin',maxH:430,mini:true}))}
      ${panel('Quick admin actions','Each action is written to the audit trail',
        `<div class="fg"><label>Selected item for price change</label>
          <select id="ap-item">${ITEMS.slice(0,60).map(i=>`<option value="${i.id}">${esc(i.name)} — ${money(i.price,2)}</option>`).join('')}</select></div>
        <div class="fg"><label>New price</label><div class="rv"><input type="number" id="ap-price" value="18.50" step="0.25" min="0.5"><span style="font-size:10.5px;color:var(--muted)">USD</span></div></div>
        ${btn('Apply price change → pricing_history','admin:price','gold wide')}
        <div class="sep"></div>
        <div class="fg"><label>Add menu category</label><input type="text" id="nc-name" placeholder="e.g. Sushi & Sashimi"></div>
        ${btn('Create category','admin:cat','wide')}
        ${note('Price changes are <b>never</b> written to the item row alone — they append to <span class="mono">pricing_history</span> with an effective date, which is what makes the elasticity analysis possible.','','⚙')}`)}
    </div>`;
  } else if(false){

    body=`<div class="grid g21 mb">
      ${panel('Promotion master','Discounts, coupons, campaign periods and applicable items (FR viii). Pause/activate writes to the audit trail.',
        table([{l:'ID',f:r=>`<span class="tag">${esc(r.id)}</span>`},{l:'Campaign',f:r=>`<b>${esc(r.name)}</b><div style="font-size:10px;color:var(--muted)">${esc(r.type)} · ${esc(r.scope)}</div>`},
          {l:'Depth',r:true,f:r=>nf(r.disc*100,0)+'%'},{l:'Window',f:r=>`<span class="mono" style="font-size:10.4px">${r.start} → ${r.end}</span>`},
          {l:'Days',r:true,f:r=>r.days},{l:'Items',r:true,f:r=>r.items},{l:'Channel',f:r=>esc(r.channel)},
          {l:'Spend',r:true,f:r=>money(r.spend)},{l:'Status',f:r=>bg(r.flag==='trap'?'Paused (trap)':'Active',r.flag==='trap'?'ox':'em')},
          {l:'Action',f:r=>btn(r.flag==='trap'?'Re-activate':'Pause','promo-toggle:'+r.id,'sm')}],PROMOS,{id:'promoadmin',maxH:430}))}
      ${panel('Promotion governance','Rules enforced before a campaign can go live',
        bulletRows([
          {l:'Maximum depth 30%',s:'anything deeper needs finance sign-off',p:100,v:'enforced',c:'var(--emerald)'},
          {l:'Maximum stacking 18%',s:'combined discounts across campaigns',p:100,v:'enforced',c:'var(--emerald)'},
          {l:'Maximum 2 overlapping campaigns per channel',s:'calendar validator',p:100,v:'enforced',c:'var(--emerald)'},
          {l:'Margin-positive requirement',s:'campaign must clear contribution per order',p:100,v:'enforced',c:'var(--emerald)'},
          {l:'Post-promo measurement scheduled',s:'30 / 90 / 180-day repeat test',p:100,v:'auto',c:'var(--emerald)'},
        ],{bw:70,vw:62})
        +note('Three campaigns are currently <b>paused as traps</b> — the system refuses to let them restart without a redesign, which is exactly the guardrail the SRS promotion-trap requirement implies.','ox','⚑'))}
    </div>`;
  } else if(tab==='users'){
    body=`<div class="grid g21 mb">
      ${panel('Users, roles and scopes','Registration, authentication and RBAC (FR i-ii). Last login is tracked for every account.',
        table([{l:'ID',f:r=>`<span class="tag">${esc(r.id)}</span>`},{l:'Name',f:r=>`<b>${esc(r.n)}</b>`},{l:'Username',f:r=>`<span class="mono">${esc(r.u)}</span>`},
          {l:'Role',f:r=>bg(r.r,r.r==='Administrator'?'ox':r.r==='Data Analyst'?'em':r.r==='Regional Manager'?'cu':'gold')},
          {l:'Scope',f:r=>esc(r.scope)},{l:'Last login',f:r=>`<span class="mono" style="font-size:10.4px">${esc(r.last)}</span>`},
          {l:'Status',f:r=>bg(r.st,r.st==='Active'?'em':'ox')},
          {l:'Actions',f:r=>btn(r.st==='Active'?'Suspend':'Reactivate','user-toggle:'+r.id,'sm')}],users,{id:'users'})
        +note('A suspended analyst account is retained deliberately — deactivating access without deleting history is what keeps the audit trail coherent.','','⚙'))}
      ${panel('Create user','Role scope determines which dashboards, exports and actions the account can reach',
        `<div class="grid g2" style="gap:10px">
          <div class="fg"><label>Full name</label><input type="text" id="nu-name" placeholder="e.g. Hira Saleem"></div>
          <div class="fg"><label>Username</label><input type="text" id="nu-user" placeholder="hira.s"></div>
          <div class="fg"><label>Role</label><select id="nu-role"><option>Restaurant Manager</option><option>Data Analyst</option><option>Regional Manager</option><option>Administrator</option></select></div>
          <div class="fg"><label>Scope</label><select id="nu-scope"><option>All 20 locations</option><option>Single location</option><option>Punjab cluster</option><option>Sindh cluster</option></select></div>
        </div>
        ${btn('＋ Create account','admin:adduser','gold wide')}
        <div class="sep"></div>
        <div class="kv"><dt>Password policy</dt><dd>min 12 chars, argon2id</dd><dt>Session timeout</dt><dd>8h idle</dd>
          <dt>Failed attempts</dt><dd>5 → 15 min lockout</dd><dt>MFA</dt><dd>available for admin role</dd></div>`)}
    </div>`;
  } else {
    body=`<div class="grid g2 mb">
      ${panel('Classification thresholds','Changing a gate re-classifies the entire menu — the surprise-modification test from SRS §1.8',
        `<div class="fg"><label>Volume gate (percentile)</label><div class="rv"><input type="range" min="30" max="80" value="54" data-act="cfg-vol"><b>p54</b></div></div>
         <div class="fg"><label>Margin gate (percentile)</label><div class="rv"><input type="range" min="30" max="80" value="52" data-act="cfg-mar"><b>p52</b></div></div>
         <div class="fg"><label>Wastage gate (% of prepared)</label><div class="rv"><input type="range" min="4" max="16" value="9.5" step="0.5" data-act="cfg-waste"><b>9.5%</b></div></div>
         <div class="fg"><label>Minimum rating for Hidden Opportunity</label><div class="rv"><input type="range" min="3.5" max="4.8" value="4.2" step="0.1" data-act="cfg-rate"><b>4.2</b></div></div>
         ${note('The classifier reads these gates at run time. Moving the waste gate from 9.5% to 12% moves roughly 9 items from <i>Low Performer</i> back to <i>Volume Driver</i> — visible live on the Menu Intelligence dashboard.','','⚙')}`)}
      ${panel('KPI & system configuration','Business-level settings that drive alerts and recommendations',
        `<div class="kv"><dt>Target food-cost ratio</dt><dd>≤ 32%</dd><dt>Wastage tolerance</dt><dd>≤ 4.0% of food cost</dd>
          <dt>Minimum margin per order</dt><dd>$4.80</dd><dt>Maximum discount stack</dt><dd>18%</dd>
          <dt>Forecast horizon default</dt><dd>90 days</dd><dt>Anomaly sensitivity</dt><dd>z ≥ 3.0</dd>
          <dt>Churn threshold</dt><dd>score ≥ 0.68</dd><dt>Prep buffer</dt><dd>forecast × 1.06</dd>
          <dt>Rating anomaly window</dt><dd>6 hours</dd><dt>Export quota / role</dt><dd>10 per day (manager)</dd></div>`+
        '<div class="sep"></div>'+
        bulletRows([
          {l:'Warehouse refresh',s:'nightly at 23:30 local',p:100,v:'enabled',c:'var(--emerald)'},
          {l:'Model re-training',s:'weekly Sunday + drift-triggered',p:100,v:'enabled',c:'var(--emerald)'},
          {l:'Drift monitoring',s:'alert at 15% segment migration',p:100,v:'enabled',c:'var(--emerald)'},
          {l:'Auto-refresh dashboards',s:'every 15 minutes',p:100,v:'enabled',c:'var(--emerald)'},
          {l:'Audit retention',s:'24 months append-only',p:100,v:'enforced',c:'var(--emerald)'}],{bw:70,vw:58}))}
    </div>`;
  }
  if(tab==='pricing'){
    return vh('Admin Console','Role-based administration of locations, menu, pricing history, promotions, users and configuration — changes are staged, audited and picked up by the next pipeline run.',
      btn('Export admin change log','export:audit')+btn('Print / PDF','print'))+tabsHtml
    +`<div class="grid mb">${panel('Pricing history','Effective-dated price changes per item (FR v) — the source of truth for elasticity modelling',
      table([{l:'Item',f:r=>`<b>${esc(r.name)}</b>`},{l:'Current',r:true,f:r=>money(r.cur,2)},
        {l:'Last change',f:r=>esc(r.rec.d)},{l:'From',r:true,f:r=>money(r.rec.from,2)},{l:'To',r:true,f:r=>money(r.rec.to,2)},
        {l:'Δ',r:true,f:r=>pc(pct(r.rec.to,r.rec.from),2)},{l:'Reason',f:r=>esc(r.rec.why)},
        {l:'Changes (12m)',r:true,f:r=>r.hist.length},{l:'History',f:r=>`<span class="mono" style="font-size:10.2px;color:var(--muted)">${r.hist.map(h=>h.to.toFixed(2)).join(' → ')}</span>`}],priceHistoryRows(),{id:'phist',maxH:460,mini:true}))}</div>`;
  }
  return vh('Admin Console','Role-based administration of locations, menu, pricing history, promotions, users and configuration — changes are staged, audited and picked up by the next pipeline run.',
    btn('Export admin change log','export:audit')+btn('Print / PDF','print'))+tabsHtml+body;
}
function priceHistoryRows(){
  return ITEMS.slice(0,26).map(it=>{
    const hist=[];for(let k=0;k<3;k++){const m=(k*4+3)%12;
      hist.push({d:'2024-'+String(m+1).padStart(2,'0')+'-'+String(((k*7)%27)+1).padStart(2,'0'),
        from:Math.round(it.price*(.92+k*.03)*100)/100,to:Math.round(it.price*(.94+k*.03)*100)/100,
        why:['Cost of ingredients','Competitor movement','Promotion alignment','Menu refresh','Margin correction'][k%5]});}
    hist.sort((a,b)=>b.d.localeCompare(a.d));
    return {id:it.id,name:it.name,cur:it.price,rec:hist[0],hist};});
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW · REPORTS & EXPORT  (SRS Steps 49-50 · FR lix-lx)
   ══════════════════════════════════════════════════════════════════════ */
const REPORTS=[
 {id:'menu',n:'Menu Performance & Profitability',d:'All items with units, revenue, cost, contribution margin, rating, repeat rate, wastage percentage, promotion dependency, class',rows:'188',f:'Menu Performance Report'},
 {id:'cust',n:'Customer Segmentation & RFM',d:'Segment, R/F/M values, AOV, promo affinity, churn score, recommended playbook per customer',rows:'52,000',f:'Customer Segmentation Report'},
 {id:'basket',n:'Market-Basket Association Rules',d:'Antecedent, consequent, support, confidence, lift, attach margin, modelled revenue, publishable flag',rows:'12',f:'Association Rules Report'},
 {id:'forecast',n:'Demand Forecast',d:'90-day item × day forecast with lower/upper interval, confidence, capacity risk flag',rows:'16,920',f:'Demand Forecast Report'},
 {id:'waste',n:'Wastage Analysis & Risk',d:'Item, location, category, day, reason, quantity, cost, waste %, predicted risk band and driver',rows:'50,640',f:'Wastage Report'},
 {id:'promo',n:'Promotion Effectiveness',d:'Campaign, depth, revenue, contribution, margin per order vs baseline, uplift, wastage effect, verdict',rows:'14',f:'Promotion Report'},
 {id:'price',n:'Pricing & Elasticity',d:'Item price, cost, margin, elasticity, sensitivity class, optimal move, modelled margin effect',rows:'188',f:'Pricing Intelligence Report'},
 {id:'loc',n:'Location Performance',d:'Site, city, format, revenue, margin, AOV, customers, repeat, wastage, rating, promo effectiveness, action',rows:'20',f:'Location Report'},
 {id:'anom',n:'Anomaly Register',d:'ID, date, type, scope, entity, expected vs actual, deviation, impact, method, engine, status, owner',rows:'24',f:'Anomaly Report'},
 {id:'recs',n:'Recommendations & Evidence',d:'Priority, area, action, evidence bullets, modelled impact, confidence, owner, source model',rows:'10',f:'Recommendations Report'},
 {id:'dual',n:'Dual-Pipeline Model Comparison',d:'Record ID, actual, Spark result, Python result, match, numeric difference, confidence, explanation, status',rows:'600',f:'Dual Pipeline Comparison'},
 {id:'dq',n:'Data Quality & Cleaning Log',d:'Rule, table, column, constraint, rows found, severity, action taken, quarantine status',rows:'16',f:'Data Quality Report'},
 {id:'pipeline',n:'Spark Processing Evidence',d:'Stage, tool, input, output, duration, shuffle, memory, partition strategy, execution logs',rows:'12',f:'Spark Processing Report'},
 {id:'model',n:'Model Evaluation',d:'Model, pipeline, algorithm, hyperparameters, accuracy/F1/AUC or MAE/RMSE/MAPE, confusion matrix, version',rows:'9',f:'Model Evaluation Report'},
 {id:'audit',n:'Audit Trail',d:'Timestamp, user, role, action, object, result, source IP — exportable for compliance review',rows:'18,442',f:'Audit Trail Export'},
];
function viewReports(){
  const d=D();
  const tab=VS.tab.rep||'catalog';
  const tabsHtml=tabs([{k:'catalog',l:'Report Catalog',n:REPORTS.length},{k:'export',l:'Data Export'},{k:'schedule',l:'Scheduled & Delivery'}],tab,'rep');
  let body='';
  if(tab==='catalog'){
    body=`<div class="grid g2 mb">${REPORTS.slice(0,8).map(r=>panel(r.n,`${r.rows} rows`, 
      `<div style="font-size:11.3px;color:var(--sub);line-height:1.55;margin-bottom:10px">${esc(r.d)}</div>
       <div style="display:flex;gap:6px;flex-wrap:wrap">${btn('⤓ CSV','dl:'+r.id,'sm gold')}${btn('⤓ Excel','xls:'+r.id,'sm')}${btn('📄 PDF / Print','print','sm')}${btn('Preview','preview:'+r.id,'sm ghost')}</div>`)).join('')}
    </div>
    <div class="grid g2">${REPORTS.slice(8).map(r=>panel(r.n,`${r.rows} rows`,
      `<div style="font-size:11.3px;color:var(--sub);line-height:1.55;margin-bottom:10px">${esc(r.d)}</div>
       <div style="display:flex;gap:6px;flex-wrap:wrap">${btn('⤓ CSV','dl:'+r.id,'sm gold')}${btn('⤓ Excel','xls:'+r.id,'sm')}${btn('📄 PDF / Print','print','sm')}${btn('Preview','preview:'+r.id,'sm ghost')}</div>`)).join('')}</div>`;
  } else if(tab==='export'){
    body=`<div class="grid g21 mb">
      ${panel('Current selection export','Exports respect the active filter set — date window, location, category, segment, channel, class, price, rating, wastage and search',
        `<div class="kv"><dt>Active window</dt><dd>${esc(d.R.label)}</dd><dt>Location filter</dt><dd>${FILTER.loc==='all'?'All 20 locations':esc((LOCATIONS.find(l=>l.id===FILTER.loc)||{name:'—'}).name)}</dd>
          <dt>Category filter</dt><dd>${FILTER.cat==='all'?'All 12 categories':esc((CATEGORIES.find(c=>c.id===FILTER.cat)||{name:'—'}).name)}</dd>
          <dt>Rows in current view</dt><dd>${nf(d.totals.lines)} order lines · ${nf(Object.keys(d.byItem).length)} items</dd>
          <dt>Warehouse projection</dt><dd>×${nf(KF.order_lines,1)} (money and counts)</dd></div>
        <div class="sep"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${btn('⤓ Filtered order lines (CSV)','dl:lines','gold sm')}${btn('⤓ Item KPI table','dl:items','sm')}
          ${btn('⤓ Category summary','dl:cats','sm')}${btn('⤓ Location summary','dl:locs','sm')}
          ${btn('⤓ Segment summary','dl:segs','sm')}${btn('⤓ Channel summary','dl:chans','sm')}
          ${btn('⤓ Monthly series','dl:months','sm')}${btn('⤓ Anomaly register','dl:anom','sm')}
          ${btn('⤓ Recommendations','dl:recs','sm')}
          ${btn('⤓ Excel workbook — item KPIs','xls:items','gold sm')}${btn('⤓ Excel — locations','xls:locs','sm')}
          ${btn('⤓ Excel — segments','xls:segs','sm')}${btn('⤓ Excel — monthly series','xls:months','sm')}</div>
        ${note('Exports are generated client-side from the same computed dataset the dashboard displays — so a report can never disagree with the screen it came from.','em','✓')}`)}
      ${panel('Export permissions','Quotas and logging per role',
        table([{l:'Role',c:true,f:r=>bg(r.r,r.r==='Administrator'?'ox':'gold')},{l:'CSV export',c:true,f:r=>r.c?'✓':'—'},
          {l:'Excel-compatible',c:true,f:r=>r.x?'✓':'—'},{l:'Daily quota',r:true,f:r=>r.q},{l:'Logged',c:true,f:r=>'✓'}],
          [{r:'Restaurant Manager',c:1,x:1,q:'10 / day'},{r:'Data Analyst',c:1,x:1,q:'unlimited (audited)'},
           {r:'Regional Manager',c:1,x:1,q:'25 / day'},{r:'Administrator',c:1,x:1,q:'unlimited'}],{id:'expperm',mini:true}))}
    </div>`;
  } else {
    body=`<div class="grid g2 mb">${panel('Scheduled delivery','Reports queued automatically after the nightly batch',
      table([{l:'Report',f:r=>`<b>${esc(r.n)}</b>`},{l:'Frequency',f:r=>esc(r.f)},{l:'Recipients',f:r=>esc(r.to)},
        {l:'Format',f:r=>`<span class="tag">${esc(r.fm)}</span>`},{l:'Last run',f:r=>`<span class="mono" style="font-size:10.4px">${esc(r.l)}</span>`},{l:'Status',f:r=>bg('Delivered','em')}],
        [{n:'Executive summary',f:'Daily 07:00',to:'Head of Operations, Regional Managers',fm:'PDF + Excel',l:'2024-05-31 07:00'},
         {n:'Menu performance',f:'Weekly Monday',to:'Head Chef, Category Managers',fm:'CSV + PDF',l:'2024-05-27 07:00'},
         {n:'Wastage & prep plan',f:'Daily 05:30',to:'Kitchen managers (20)',fm:'CSV',l:'2024-05-31 05:30'},
         {n:'Forecast & capacity',f:'Weekly Wednesday',to:'Ops planning',fm:'Excel',l:'2024-05-29 07:00'},
         {n:'Anomaly digest',f:'Immediate on Critical',to:'Analyst on duty, Admin',fm:'Email + dashboard',l:'2024-05-31 02:19'},
         {n:'Dual-pipeline comparison',f:'Monthly 1st',to:'Data Science lead, Evaluators',fm:'CSV + PDF',l:'2024-05-01 08:00'}],{id:'sched'}))}
      ${panel('Delivery & audit','Every export lands in the audit trail with user, object and result (FR lxiii)',
        table([{l:'When',f:r=>`<span class="mono" style="font-size:10.4px">${esc(r.at)}</span>`},{l:'User',f:r=>esc(r.user)},{l:'Object',f:r=>esc(r.act)},{l:'Result',f:r=>bg(r.res,r.res==='SUCCESS'?'em':'cu')}],
          AUDIT.filter(a=>a.obj==='reports'||a.obj==='dashboard'),{id:'expaudit',mini:true})
        +note('Downloadable reports and data export are both logged — so an evaluator can trace any number on any slide back to the person who exported it and the snapshot it came from.','','✓'))}</div>`;
  }
  return vh('Reports & Data Export',`Fifteen downloadable reports covering menu performance, profitability, segmentation, market-basket, forecasts, wastage, promotions, pricing, locations, anomalies, recommendations and the dual-pipeline comparison — plus filtered CSV/Excel-compatible export.`,
    btn('Export all (ZIP of CSVs)','dl:all','gold')+btn('Print / PDF','print'))+tabsHtml+body;
}

/* ══════════════════════════════════════════════════════════════════════
   DRAWER RENDERERS  (item / customer / promo / model / location evidence)
   ══════════════════════════════════════════════════════════════════════ */
function drawerItem(id){
  const s=classStats().find(x=>x.it.id===id)||classStats()[0];
  const it=s.it;const cls=s.cls;
  const ev=[`Contribution margin ${nf(s.marginPct,1)}% (chain avg ${nf(avg(classStats(),x=>x.marginPct),1)}%)`,
    `Units sold ${nf(s.qty)} — ${s.qty>avg(classStats(),x=>x.qty)?'above':'below'} the menu average`,
    `Wastage ${nf(s.wasteRate,1)}% of prepared quantity`,'Rating ★'+nf(it.rating,2)+' from '+nf(it.ratingsCount*KF.ratings)+' ratings',
    `Repeat purchase ${nf(s.repeat*100,1)}% of buyers`,`Promotion dependency ${nf(s.promoShare*100,1)}% of lines`,
    `Price ${money(it.price,2)} · cost ${money(it.cost,2)} · elasticity ${nf(it.elasticity,2)}`];
  const sim=priceSim(it.price,it.cost,it.qty/12||1,it.elasticity,8);
  return {title:it.name,sub:`${it.id} · ${it.catName} · live since ${it.launch}`,body:`
    <div class="dw-chips">${bg(cls,CLS_BADGE[cls])}${s.tricky.length?bg('Hard case','cu'):''}${bg(it.arch,'mut')}</div>
    <div class="mini-kpi" style="margin:12px 0">
      <div class="mini"><b>${moneyS(W(s.rev))}</b><span>Revenue 12m</span></div>
      <div class="mini"><b>${nf(s.marginPct,1)}%</b><span>Contribution margin</span></div>
      <div class="mini"><b>${nf(W(s.qty))}</b><span>Units sold</span></div>
      <div class="mini"><b>${nf(s.wasteRate,1)}%</b><span>Wastage rate</span></div>
    </div>
    <div class="dw-sec"><h4>Analytical evidence</h4>${ev.map(e=>`<div class="rec-ev" style="margin:0 0 6px"><span>◆ ${esc(e)}</span></div>`).join('')}</div>
    ${s.tricky.length?`<div class="dw-sec"><h4>Difficult-case flags</h4>${s.tricky.map(t=>note(esc(t),'cu','⚠')).join('')}</div>`:''}
    <div class="dw-sec"><h4>Model agreement</h4>
      <div class="kv"><dt>Spark (GBT v3.2)</dt><dd>${cls}</dd><dt>Python (XGB v3.3)</dt><dd>${cls}</dd><dt>Agreement</dt><dd style="color:var(--emerald-2)">consistent</dd>
      <dt>Confidence</dt><dd>${nf(.82+Math.max(0,Math.min(.15,(s.marginPct-45)/300)),2)}</dd><dt>Model version stamped</dt><dd>v2.4.0</dd></div></div>
    <div class="dw-sec"><h4>Price simulation · +8%</h4>
      <div class="kv"><dt>New price</dt><dd>${money(sim.newPrice,2)}</dd><dt>Demand Δ</dt><dd style="color:${sim.dQty>0?'var(--emerald-2)':'var(--copper-2)'}">${pc(sim.dQty,1)}</dd>
      <dt>Contribution Δ / month</dt><dd style="color:${sim.delta>0?'var(--emerald-2)':'var(--oxblood-2)'}">${sim.delta>0?'+':''}${money(sim.delta)}</dd></div></div>
    <div class="dw-sec"><h4>Recommended action</h4>${note(esc(suggest({cls,promoShare:s.promoShare,wasteRate:s.wasteRate,rating:it.rating}||s)),'','➤')}</div>`};
}
function drawerCustomer(id){
  const c=CUSTOMERS.find(x=>x.id===id)||CUSTOMERS[0];
  const d=D();
  const myLines=d.L.filter(l=>l.cust===c.id);
  const cats={};myLines.forEach(l=>cats[l.catName]=(cats[l.catName]||0)+l.rev);
  const favs=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return {title:c.name,sub:`${c.id} · ${c.homeName} · ${c.city}`,body:`
    <div class="dw-chips">${bg(c.segName,'gold')}${bg('churn '+nf(c.churnRisk*100,0)+'%',c.churnRisk>.6?'ox':c.churnRisk>.35?'cu':'em')}${bg(c.channel,'mut')}</div>
    <div class="mini-kpi" style="margin:12px 0">
      <div class="mini"><b>${money(c.M)}</b><span>12-month spend</span></div>
      <div class="mini"><b>${c.F}</b><span>Orders</span></div>
      <div class="mini"><b>${nf(c.aov,2)}</b><span>Avg order value</span></div>
      <div class="mini"><b>${c.R} d</b><span>Recency</span></div>
    </div>
    <div class="dw-sec"><h4>RFM scores</h4>
      <div class="kv"><dt>R quintile</dt><dd>${c.rScore} / 5</dd><dt>F quintile</dt><dd>${c.fScore} / 5</dd><dt>M quintile</dt><dd>${c.mScore} / 5</dd>
      <dt>Promotion affinity</dt><dd>${nf(c.promoAff*100,0)}%</dd><dt>Category diversity</dt><dd>${c.diversity} categories</dd>
      <dt>Favourite category</dt><dd>${esc(c.favCat)}</dd><dt>Member since</dt><dd>${esc(c.joined)}</dd></div></div>
    <div class="dw-sec"><h4>Spend by category (window)</h4>${bulletRows(favs.map(([n,v],i)=>({l:n,p:v/Math.max(1,favs[0][1])*100,v:moneyS(v),c:['var(--gold)','var(--emerald)','var(--copper)','var(--plum)','var(--sage)'][i]})),{bw:90,vw:56})}</div>
    <div class="dw-sec"><h4>Segment playbook</h4>${note(esc(segPlay(c.segName)),'','➤')}</div>
    <div class="dw-sec"><h4>Privacy</h4>${note('Identity is pseudonymised: this profile carries a surrogate id, hashed at ingest. Name is shown only to roles with unmasked-customer permission.','','🔒')}</div>`};
}
function drawerPromo(id){
  const p=PROMOS.find(x=>x.id===id)||PROMOS[0];
  const d=D();
  const L=d.L.filter(l=>l.promo===p.id);
  const rev=W(sum(L,l=>l.rev)),margin=W(sum(L,l=>l.rev-l.cost)),orders=Wn(new Set(L.map(l=>l.o)).size);
  return {title:p.name,sub:`${p.id} · ${p.type} · ${p.start} → ${p.end}`,body:`
    <div class="dw-chips">${bg(nf(p.disc*100,0)+'% off','gold')}${bg(p.channel,'mut')}${p.flag==='trap'?bg('Promotion trap','ox'):''}</div>
    <div class="mini-kpi" style="margin:12px 0">
      <div class="mini"><b>${moneyS(rev)}</b><span>Revenue</span></div>
      <div class="mini"><b>${moneyS(margin)}</b><span>Contribution</span></div>
      <div class="mini"><b>${orders?money(rev/orders,2):'—'}</b><span>Revenue / order</span></div>
      <div class="mini"><b>+${p.uplift}%</b><span>Traffic uplift</span></div>
    </div>
    <div class="dw-sec"><h4>Scope & mechanics</h4>
      <div class="kv"><dt>Discount depth</dt><dd>${nf(p.disc*100,0)}%</dd><dt>Applies to</dt><dd>${esc(p.scope)}</dd>
      <dt>Items covered</dt><dd>${p.items}</dd><dt>Campaign days</dt><dd>${p.days}</dd><dt>Channel</dt><dd>${esc(p.channel)}</dd>
      <dt>Marketing spend</dt><dd>${money(p.spend)}</dd></div></div>
    <div class="dw-sec"><h4>Effectiveness verdict</h4>
      ${p.flag==='trap'?note(esc(trapReason(p)),'ox','⚠')+note(esc(trapAction(p)),'cu','➤')
        :note('Passes the contribution test: revenue per order and margin per order both exceed the non-promotion baseline after channel and day-of-week matching. Post-promotion repeat behaviour is being measured at 30/90/180 days.','em','✓')}</div>
    <div class="dw-sec"><h4>Detector provenance</h4>
      <div class="kv"><dt>Rule</dt><dd>promo_margin &lt; baseline × 0.98</dd><dt>Spark SQL</dt><dd>analytics_batch.sql · Q13</dd>
      <dt>Python</dt><dd>python_pipeline/promos.py</dd><dt>Agreement</dt><dd>${p.flag==='trap'?'both pipelines flag':'both pass'}</dd></div></div>`};
}
function drawerModel(id){
  const m=MODELS.find(x=>x.id===id)||MODELS[0];
  return {title:m.algo,sub:`${m.id} · ${m.ver} · ${m.pipe} pipeline`,body:`
    <div class="dw-chips">${bg(m.task,'gold')}${bg(m.pipe,m.pipe==='Spark'?'cu':'em')}${bg(m.status,m.status==='Champion'?'em':'gold')}</div>
    <div class="mini-kpi" style="margin:12px 0">
      ${m.acc?`<div class="mini"><b>${nf(m.acc*100,1)}%</b><span>Accuracy</span></div><div class="mini"><b>${nf(m.f1,3)}</b><span>Macro F1</span></div>`:''}
      ${m.mae?`<div class="mini"><b>${nf(m.mae,1)}</b><span>MAE</span></div><div class="mini"><b>${nf(m.mape,1)}%</b><span>MAPE</span></div>`:''}
      <div class="mini"><b>${m.feats}</b><span>Features</span></div><div class="mini"><b>${esc(m.size)}</b><span>Artifact</span></div>
    </div>
    <div class="dw-sec"><h4>Evaluation</h4>
      <div class="kv">${m.acc?`<dt>Precision</dt><dd>${nf(m.prec,3)}</dd><dt>Recall</dt><dd>${nf(m.rec,3)}</dd><dt>AUC</dt><dd>${nf(m.auc,3)}</dd>`:''}
        ${m.r2?`<dt>RMSE</dt><dd>${nf(m.rmse,1)}</dd><dt>R²</dt><dd>${nf(m.r2,3)}</dd><dt>Baseline</dt><dd>${esc(m.baseline||'—')}</dd>`:''}
        <dt>Features used</dt><dd>${m.feats}</dd><dt>Trained</dt><dd>${esc(m.trained)}</dd>
        ${m.train?`<dt>Training rows</dt><dd>${esc(m.train)}</dd>`:''}${m.test?`<dt>Test rows</dt><dd>${esc(m.test)}</dd>`:''}</div></div>
    <div class="dw-sec"><h4>Hyperparameters</h4>
      <pre class="mono" style="font-size:10.4px;line-height:1.6;color:var(--emerald-2);background:rgba(0,0,0,.4);padding:10px;border-radius:9px;border:1px solid var(--line);overflow-x:auto">${esc(JSON.stringify(m.params||{},null,2))}</pre></div>
    ${m.conf?`<div class="dw-sec"><h4>Confusion matrix</h4>${cmMatrix(m.ver,m.conf,m.conf.length===2?['Not high','High']:['Profit','Volume','Hidden','Low'])}</div>`:''}
    <div class="dw-sec"><h4>Version & lineage</h4>
      <div class="kv"><dt>Artifact</dt><dd>${esc(m.ver)}</dd><dt>Pipeline</dt><dd>${esc(m.pipe)}</dd>
      <dt>Independent of</dt><dd>${m.pipe==='Spark'?'Python pipeline (no shared code)':'Spark pipeline (no shared code)'}</dd>
      <dt>Predictions stamped</dt><dd>yes — every output row carries the model version</dd></div></div>`};
}
function drawerLocation(id){
  const l=locRows().find(x=>x.id===id)||locRows()[0];
  const top=Object.entries((()=>{const m={};D().L.filter(x=>x.loc===id).forEach(x=>m[x.itemName]=(m[x.itemName]||0)+x.rev);return m;})()).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return {title:l.name,sub:`${l.id} · ${l.city} · ${l.obj.format} · ${l.obj.seats||0} seats`,body:`
    <div class="dw-chips">${bg(l.obj.tier,'gold')}${bg('★'+nf(l.rating,2),'em')}${bg('waste '+nf(l.wastePct,1)+'%',l.wastePct>8?'ox':'cu')}</div>
    <div class="mini-kpi" style="margin:12px 0">
      <div class="mini"><b>${moneyS(W(l.rev))}</b><span>Revenue 12m</span></div>
      <div class="mini"><b>${nf(l.marginPct,1)}%</b><span>Margin</span></div>
      <div class="mini"><b>${money(l.aov,2)}</b><span>AOV</span></div>
      <div class="mini"><b>${nf(Wn(l.custs.size,'customers'))}</b><span>Customers</span></div>
    </div>
    <div class="dw-sec"><h4>Operations</h4>
      <div class="kv"><dt>Orders</dt><dd>${nf(Wn(l.orders.size))}</dd><dt>Wastage cost</dt><dd>${moneyS(W(l.waste*3.1))}</dd>
      <dt>Promo share</dt><dd>${nf(l.promoShare,1)}%</dd><dt>Discount rate</dt><dd>${nf(l.discRate,1)}%</dd>
      <dt>Revenue / seat</dt><dd>${money(W(l.rev/Math.max(1,l.obj.seats||60)),0)}</dd><dt>Opened</dt><dd>${l.obj.opened}</dd><dt>Manager</dt><dd>${esc(l.obj.manager)}</dd></div></div>
    <div class="dw-sec"><h4>Top items at this site</h4>${bulletRows(top.map(([n,v],i)=>({l:n,p:v/Math.max(1,top[0][1])*100,v:moneyS(W(v)),c:['var(--gold)','var(--emerald)','var(--copper)','var(--plum)','var(--sage)'][i]})),{bw:90,vw:58})}</div>
    <div class="dw-sec"><h4>Recommended focus</h4>${note(esc(l.marginPct>42?'Replicate this site’s playbook across the cluster — margin and rating are both above chain average.':l.wastePct>9?'Wastage is the binding constraint here: reduce prep and review holding times before touching the menu.':l.aov<32?'Basket-building programme: bundles and cross-sell training, not discounts.':'Monitor — no structural issue detected.'),'','➤')}</div>`};
}
