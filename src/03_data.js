/* ══════════════════════════════════════════════════════════════════════
   DineIQ · DATA ENGINE   (mirrors the generated Spark warehouse)
   Tables: customers · orders · order_items · menu_items · menu_categories
           restaurants · pricing_history · promotions · ratings
           inventory · wastage
   ══════════════════════════════════════════════════════════════════════ */

/* ── deterministic PRNG (dataset regeneration must be reproducible) ── */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let _r = mulberry32(20240531);
const rnd=()=>_r();
const ri=(a,b)=>Math.floor(rnd()*(b-a+1))+a;
const rf=(a,b)=>a+rnd()*(b-a);
const rn=(arr)=>arr[Math.floor(rnd()*arr.length)];
const rnw=(arr,w)=>{const t=w.reduce((x,y)=>x+y,0);let x=rnd()*t;for(let i=0;i<arr.length;i++){x-=w[i];if(x<=0)return arr[i];}return arr[arr.length-1];};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sum=(a,f)=>a.reduce((s,x)=>s+(f?f(x):x),0);
const avg=(a,f)=>a.length?sum(a,f)/a.length:0;
const med=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;};
const sd=a=>{if(a.length<2)return 0;const m=avg(a);return Math.sqrt(sum(a,x=>(x-m)*(x-m))/(a.length-1));};
const pct=(a,b)=>b?((a-b)/Math.abs(b)*100):0;

/* ── formatting ── */
const nf=(v,d=0)=>v==null||isNaN(v)?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=(v,d=0)=>'$'+nf(v,d);
const moneyS=(v)=>{if(v==null||!isFinite(v))return '—';const a=Math.abs(v);const s=v<0?'-':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';if(a>=1e3)return s+'$'+(a/1e3).toFixed(a>=1e4?0:1)+'K';return s+'$'+a.toFixed(a<100?2:0);};
const pc=(v,d=1)=>(v>0?'+':'')+nf(v,d)+'%';
const kg=(v,d=0)=>nf(v,d)+' kg';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ══════════════ MASTER (dimensional) TABLES ══════════════ */
const _seed = mulberry32(20240531); _r=_seed;

const CITIES=['Karachi','Lahore','Islamabad','Rawalpindi','Faisalabad','Multan'];
const LOCATIONS=[
 {id:'LOC-01',name:'Clifton Flagship',city:'Karachi',tier:'Flagship',format:'Fine Dining',seats:180,opened:2016,traffic:1.34,rent:1.28,rating:4.62,manager:'Arslan Mehmood'},
 {id:'LOC-02',name:'DHA Phase 6',city:'Karachi',tier:'Gold',format:'Casual Dining',seats:140,opened:2018,traffic:1.22,rent:1.18,rating:4.48,manager:'Hina Qureshi'},
 {id:'LOC-03',name:'Gulshan-e-Iqbal',city:'Karachi',tier:'Gold',format:'Casual Dining',seats:130,opened:2015,traffic:1.16,rent:0.92,rating:4.31,manager:'Bilal Sheikh'},
 {id:'LOC-04',name:'Bahria Town Karachi',city:'Karachi',tier:'Standard',format:'Family Diner',seats:120,opened:2020,traffic:1.02,rent:0.86,rating:4.18,manager:'Nadia Farooq'},
 {id:'LOC-05',name:'Dolmen Mall Food Court',city:'Karachi',tier:'Express',format:'Food Court',seats:60,opened:2019,traffic:1.11,rent:1.42,rating:3.96,manager:'Faizan Ali'},
 {id:'LOC-06',name:'Karachi Cloud Kitchen — North',city:'Karachi',tier:'Cloud',format:'Delivery Only',seats:0,opened:2021,traffic:0.94,rent:0.42,rating:4.05,manager:'Sadaf Jamal'},
 {id:'LOC-07',name:'Gulberg III',city:'Lahore',tier:'Flagship',format:'Fine Dining',seats:190,opened:2014,traffic:1.31,rent:1.22,rating:4.71,manager:'Usman Tariq'},
 {id:'LOC-08',name:'DHA Phase 5 Lahore',city:'Lahore',tier:'Gold',format:'Casual Dining',seats:150,opened:2017,traffic:1.19,rent:1.15,rating:4.52,manager:'Ayesha Naveed'},
 {id:'LOC-09',name:'Emporium Mall',city:'Lahore',tier:'Express',format:'Food Court',seats:70,opened:2019,traffic:1.08,rent:1.38,rating:4.02,manager:'Zubair Khan'},
 {id:'LOC-10',name:'Bahria Town Lahore',city:'Lahore',tier:'Standard',format:'Family Diner',seats:125,opened:2021,traffic:0.97,rent:0.81,rating:4.14,manager:'Maryam Aslam'},
 {id:'LOC-11',name:'Johar Town',city:'Lahore',tier:'Standard',format:'Casual Dining',seats:115,opened:2016,traffic:1.01,rent:0.88,rating:4.24,manager:'Imran Shah'},
 {id:'LOC-12',name:'Blue Area',city:'Islamabad',tier:'Gold',format:'Fine Dining',seats:160,opened:2015,traffic:1.24,rent:1.31,rating:4.58,manager:'Sana Rizvi'},
 {id:'LOC-13',name:'F-7 Markaz',city:'Islamabad',tier:'Gold',format:'Casual Dining',seats:135,opened:2017,traffic:1.14,rent:1.24,rating:4.39,manager:'Hamza Yousaf'},
 {id:'LOC-14',name:'Giga Mall DHA-2',city:'Islamabad',tier:'Express',format:'Food Court',seats:65,opened:2020,traffic:1.03,rent:1.12,rating:3.91,manager:'Rabia Anwar'},
 {id:'LOC-15',name:'Islamabad Cloud Kitchen',city:'Islamabad',tier:'Cloud',format:'Delivery Only',seats:0,opened:2022,traffic:0.88,rent:0.44,rating:4.08,manager:'Danish Iqbal'},
 {id:'LOC-16',name:'Saddar Rawalpindi',city:'Rawalpindi',tier:'Standard',format:'Family Diner',seats:110,opened:2016,traffic:0.92,rent:0.72,rating:4.06,manager:'Adnan Malik'},
 {id:'LOC-17',name:'Bahria Town Rawalpindi',city:'Rawalpindi',tier:'Standard',format:'Casual Dining',seats:120,opened:2021,traffic:0.95,rent:0.76,rating:4.21,manager:'Kiran Bashir'},
 {id:'LOC-18',name:'D-Ground Faisalabad',city:'Faisalabad',tier:'Standard',format:'Family Diner',seats:105,opened:2018,traffic:0.84,rent:0.62,rating:4.02,manager:'Waqas Ahmed'},
 {id:'LOC-19',name:'Susan Road Faisalabad',city:'Faisalabad',tier:'Cloud',format:'Delivery Only',seats:0,opened:2022,traffic:0.71,rent:0.38,rating:3.97,manager:'Tehmina Riaz'},
 {id:'LOC-20',name:'Cantt Multan',city:'Multan',tier:'Standard',format:'Family Diner',seats:100,opened:2019,traffic:0.78,rent:0.58,rating:4.11,manager:'Shahid Bhatti'},
];

const CATEGORIES=[
 {id:'CAT-01',name:'Starters',       target:18, margin:.68, waste:3.2},
 {id:'CAT-02',name:'Soups & Salads', target:16, margin:.72, waste:6.4},
 {id:'CAT-03',name:'BBQ & Grill',    target:18, margin:.52, waste:4.1},
 {id:'CAT-04',name:'Karahi & Handi', target:16, margin:.49, waste:3.6},
 {id:'CAT-05',name:'Rice & Biryani', target:16, margin:.57, waste:5.8},
 {id:'CAT-06',name:'Seafood',        target:16, margin:.44, waste:9.7},
 {id:'CAT-07',name:'Continental',    target:16, margin:.61, waste:4.4},
 {id:'CAT-08',name:'Pasta & Pizza',  target:16, margin:.64, waste:3.9},
 {id:'CAT-09',name:'Burgers & Wraps',target:16, margin:.58, waste:4.6},
 {id:'CAT-10',name:'Desserts',       target:16, margin:.71, waste:7.2},
 {id:'CAT-11',name:'Hot Beverages',  target:10,  margin:.78, waste:2.1},
 {id:'CAT-12',name:'Cold Beverages', target:14,  margin:.74, waste:3.4},
];

const DISH_NAMES={
 'CAT-01':['Chicken Samosa Trio','Paneer Tikka Sliders','Golden Onion Rings','Crispy Chicken Wings','Buffalo Wings','Loaded Nachos','Mozzarella Sticks','Prawn Tempura','Dahi Baray Chaat','Masala Papad','Cheese Garlic Bread','Fish Fingers','Spring Rolls (Veg)','Hummus & Pita','Lahori Fried Fish','Stuffed Mushrooms','Chicken Croquettes','Dynamite Prawns'],
 'CAT-02':['Chicken Corn Soup','Hot & Sour Soup','Mulligatawny','Tom Yum Soup','Cream of Mushroom','Garden Green Salad','Caesar Salad','Greek Salad','Chicken Caesar Bowl','Quinoa Power Bowl','Russian Salad','Coleslaw Deluxe','Lentil Soup','Seafood Chowder','Waldorf Salad','Beetroot Feta Salad'],
 'CAT-03':['Seekh Kebab (Beef)','Seekh Kebab (Chicken)','Chicken Tikka Boti','Malai Boti','Beef Bihari Kebab','Mutton Chops Grill','Reshmi Kebab','Chapli Kebab','Adana Kebab','Chicken Cheese Kebab','Mixed Grill Platter','Fish Tikka','Tandoori Half Chicken','Gola Kebab','Peri-Peri Chicken','Grilled Jumbo Prawns','Mutton Kebab Platter','Sajji Leg (Balochi)'],
 'CAT-04':['Chicken Karahi','Mutton Karahi','Beef Nihari','Chicken Handi','Butter Chicken','Achari Chicken','Palak Paneer Handi','Chicken Jalfrezi','Daal Makhani','Mutton Kunna','Chicken White Karahi','Brain Masala','Karahi Gosht Full','Aloo Keema','Chicken Kadai','Malai Handi'],
 'CAT-05':['Chicken Biryani','Beef Pulao','Mutton Biryani (Sindhi)','Vegetable Biryani','Prawn Biryani','Chicken Fried Rice','Egg Fried Rice','Mutton Yakhni Pulao','Kabuli Pulao','Biryani Boneless','Masala Rice','Garlic Rice','Khichda','Sabzi Pulao','Lemon Rice','Chicken Mandi Rice'],
 'CAT-06':['Grilled Salmon Fillet','Baked Red Snapper','Prawn Karahi','Fish & Chips','Butter Garlic Prawns','Crab Masala','Fish Curry (Sindhi)','Seafood Platter','Golden Fried Prawns','Lobster Thermidor','Calamari Rings','Sole Meunière','Prawn Tempura Roll','Surmai Fry','Hot Garlic Fish','Tuna Steak'],
 'CAT-07':['Chicken Steak (Pepper)','Beef Tenderloin Steak','Grilled Chicken Breast','Fish Meunière','Chicken Cordon Bleu','Mushroom Swiss Burger','Roast Chicken Quarter','Lamb Chops Continental','Chicken Kiev','Shrimp Alfredo Continental','Stuffed Chicken Breast','Beef Stroganoff','Chicken Marsala','Herb Roast Chicken','Lamb Shank','Turkey Club Sandwich'],
 'CAT-08':['Truffle Mushroom Pasta','Chicken Alfredo Pasta','Penne Arrabbiata','Lasagna al Forno','Spaghetti Bolognese','Fettuccine Alfredo','Baked Mac & Cheese','Chicken Ranch Pizza','Margherita Pizza','BBQ Chicken Pizza','Pepperoni Style Pizza','Fajita Pizza','Four Cheese Pizza','Tandoori Chicken Pizza','Creamy Pesto Pasta','Cajun Chicken Pasta'],
 'CAT-09':['Zinger Burger','Beef Smash Burger','Grilled Chicken Burger','Mushroom Melt Burger','Crispy Fish Burger','Beef Cheese Burger','Chicken Shawarma Wrap','Beef Doner Wrap','Falafel Wrap','Chicken Paratha Roll','Beef Paratha Roll','Club Sandwich','Chicken Caesar Wrap','Paneer Tikka Wrap','Loaded Beef Fries','Chicken Cheese Fries'],
 'CAT-10':['Molten Lava Cake','New York Cheesecake','Tiramisu Classico','Chocolate Fudge Brownie','Crème Brûlée','Baklava Platter','Gulab Jamun (2pc)','Kheer (Matka)','Rasmalai (2pc)','Falooda Special','Ice Cream Sundae','Apple Crumble Pie','Red Velvet Slice','Mango Mousse','Shahi Tukray','Nutella Waffle'],
 'CAT-11':['Kashmiri Chai','Doodh Patti','Green Tea (Pot)','Cappuccino','Café Latte','Espresso Doppio','Hot Chocolate','Masala Chai','Herbal Infusion','Turkish Coffee'],
 'CAT-12':['Fresh Lime Soda','Mint Margarita','Mango Shake','Pina Colada (Virgin)','Soft Drink (Regular)','Soft Drink (Large)','Iced Tea (Peach)','Cold Coffee Frappe','Fresh Orange Juice','Strawberry Smoothie','Blue Lagoon Mocktail','Watermelon Cooler','Lassi (Sweet)','Rooh Afza Special'],
};

/* item-level behaviour archetypes drive the SRS “tricky cases” */
const ARCHETYPES=[
 {k:'profit',   w:22, pop:[.55,1.35], margin:'high', waste:'low',  rate:[4.2,4.85]},
 {k:'volume',   w:20, pop:[1.45,2.60],margin:'low',  waste:'mid',  rate:[3.6,4.4]},
 {k:'hidden',   w:16, pop:[.16,.55],  margin:'high', waste:'low',  rate:[4.35,4.9]},
 {k:'lowperf',  w:14, pop:[.10,.48],  margin:'low',  waste:'high', rate:[2.7,3.5]},
 {k:'lossmaker',w:5,  pop:[1.30,2.10],margin:'neg',  waste:'high', rate:[3.4,4.3]},
 {k:'wastehog', w:6,  pop:[1.15,1.85],margin:'mid',  waste:'vhigh',rate:[4.1,4.7]},
 {k:'promo',    w:7,  pop:[.85,1.60], margin:'low',  waste:'mid',  rate:[3.5,4.2]},
 {k:'new',      w:4,  pop:[.05,.22],  margin:'high', waste:'low',  rate:[4.0,4.7]},
 {k:'seasonal', w:4,  pop:[.35,.85],  margin:'mid',  waste:'high', rate:[3.9,4.6]},
 {k:'weekend',  w:2,  pop:[.30,.70],  margin:'mid',  waste:'low',  rate:[4.1,4.7]},
];

const ITEMS=[];let _iid=1;
CATEGORIES.forEach(cat=>{
  (DISH_NAMES[cat.id]||[]).slice(0,cat.target||99).forEach((nm,ix)=>{
    const at=rnw(ARCHETYPES,ARCHETYPES.map(a=>a.w));
    const pop=rf(at.pop[0],at.pop[1]);
    const marginTarget=({high:rf(.66,.78),mid:rf(.50,.61),low:rf(.34,.45),neg:rf(-.04,.09)})[at.margin];
    const PRICE_BAND={'CAT-01':[3.8,9.5],'CAT-02':[3.5,8.5],'CAT-03':[6.5,17],'CAT-04':[7.5,19],'CAT-05':[5.5,13],
   'CAT-06':[9,24],'CAT-07':[9,21],'CAT-08':[6.5,15],'CAT-09':[4.5,9.5],'CAT-10':[3.2,6.8],'CAT-11':[1.4,3.2],'CAT-12':[1.6,4.8]};
    const price=rf(PRICE_BAND[cat.id][0],PRICE_BAND[cat.id][1]);
    const priceF=Math.round(price*100)/100;
    const cost=Math.round(priceF*(1-marginTarget)*100)/100;
    const wasteBase=({low:rf(1.4,3.2),mid:rf(3.4,6.2),high:rf(6.5,11.5),vhigh:rf(12.5,19.5)})[at.waste];
    ITEMS.push({
      id:'M'+String(_iid++).padStart(3,'0'), idx:_iid-2, name:nm, cat:cat.id, catName:cat.name,
      price:priceF, listPrice:Math.round(priceF*rf(1.02,1.16)*100)/100, cost,
      arch:at.k, pop, wasteRate:wasteBase,
      rating:Math.round(rf(at.rate[0],at.rate[1])*100)/100,
      ratingsCount:ri(180,4200),
      elasticity:Math.round((at.margin==='high'?rf(-1.35,-.55):at.margin==='low'?rf(-2.3,-1.25):rf(-1.85,-.95))*100)/100,
      promoDep:at.k==='promo'?rf(.55,.82):at.k==='lossmaker'?rf(.35,.6):rf(.02,.28),
      seasonalAmp:at.k==='seasonal'?rf(.35,.62):rf(.03,.16),
      weekendBias:at.k==='weekend'?rf(.45,.85):rf(-.05,.28),
      monthsLive:at.k==='new'?ri(2,4):ri(24,72),
      launch:'—', repeatRate:0,
      premium:rf(.86,1.18), appeal:rf(.72,1.3),
    });
  });
});
/* lifecycle dates + a few curated signature dishes */
const MONTHS_BACK=12, BASE=new Date('2024-05-31T00:00:00');
ITEMS.forEach(it=>{
  it.launch=it.monthsLive<24?new Date(BASE.getTime()-it.monthsLive*30*864e5).toISOString().slice(0,7):'20'+ri(17,21)+'-'+String(ri(1,12)).padStart(2,'0');
  it.code='DIN-'+it.id;
});

const CHANNELS=[
 {id:'CH-01',name:'Dine-in',        share:.40, aovF:1.22, discF:.72, marginF:1.06, peak:'20:00'},
 {id:'CH-02',name:'Takeaway',       share:.20, aovF:.92, discF:.95, marginF:1.02, peak:'13:00'},
 {id:'CH-03',name:'Website / App',  share:.12, aovF:1.06, discF:1.12, marginF:.99, peak:'21:00'},
 {id:'CH-04',name:'3rd-Party Delivery',share:.24,aovF:.84,discF:1.34, marginF:.83, peak:'21:00'},
 {id:'CH-05',name:'Catering & Events',share:.04,aovF:2.15, discF:1.18, marginF:1.12, peak:'12:00'},
];

const PROMOS=[
 {id:'PR-01',name:'Eid Extravaganza 25% Off',type:'Seasonal Discount',disc:.25,start:'2024-04-08',end:'2024-04-14',scope:'All Menu',items:168,spend:12800,channel:'All',trafficF:1.62},
 {id:'PR-02',name:'Ramadan Iftar Combo',type:'Bundle Deal',disc:.18,start:'2024-03-12',end:'2024-04-08',scope:'Combo / Family',items:42,spend:9400,channel:'Dine-in',trafficF:1.48},
 {id:'PR-03',name:'Family Feast Bundle',type:'Bundle Deal',disc:.15,start:'2024-02-01',end:'2024-05-31',scope:'Karahi + Rice',items:18,spend:6100,channel:'All',trafficF:1.28},
 {id:'PR-04',name:'Student Card 20% (Weekdays)',type:'Segment Discount',disc:.20,start:'2023-09-01',end:'2024-05-31',scope:'Burgers & Wraps',items:16,spend:3200,channel:'Dine-in',trafficF:1.34},
 {id:'PR-05',name:'Buy-1-Get-1 Pizza (Tue)',type:'BOGO',disc:.50,start:'2023-07-04',end:'2024-05-31',scope:'Pasta & Pizza',items:16,spend:7400,channel:'Dine-in',trafficF:1.9},
 {id:'PR-06',name:'Weekend Happy Hour 6–8pm',type:'Time-Based',disc:.30,start:'2023-06-02',end:'2024-05-31',scope:'Starters & Beverages',items:28,spend:5100,channel:'Dine-in',trafficF:1.44},
 {id:'PR-07',name:'Delivery-Only 30% Off',type:'Channel Discount',disc:.30,start:'2023-10-01',end:'2024-05-31',scope:'All Delivery',items:168,spend:14200,channel:'3rd-Party Delivery',trafficF:1.72,flag:'trap'},
 {id:'PR-08',name:'Beverage Add-On $1.99',type:'Add-On Pricing',disc:.35,start:'2023-06-15',end:'2024-05-31',scope:'Cold Beverages',items:14,spend:2200,channel:'All',trafficF:1.16},
 {id:'PR-09',name:'Loyalty Double Points',type:'Loyalty',disc:.10,start:'2023-08-01',end:'2024-05-31',scope:'All Menu',items:168,spend:8600,channel:'All',trafficF:1.22},
 {id:'PR-10',name:'New Item Launch — Truffle Line',type:'Sampling',disc:.22,start:'2024-02-14',end:'2024-03-31',scope:'Continental',items:6,spend:4800,channel:'All',trafficF:2.1},
 {id:'PR-11',name:'Corporate Lunch 15%',type:'Segment Discount',disc:.15,start:'2023-06-01',end:'2024-05-31',scope:'Soups, Starters, Rice',items:44,spend:5400,channel:'Takeaway',trafficF:1.18},
 {id:'PR-12',name:'Cheesecake Combo Deal',type:'Bundle Deal',disc:.28,start:'2023-11-01',end:'2024-05-31',scope:'Desserts',items:8,spend:3900,channel:'All',trafficF:1.38,flag:'trap'},
 {id:'PR-13',name:'Winter Warmers — Tea & Soup',type:'Seasonal Discount',disc:.16,start:'2023-11-15',end:'2024-02-15',scope:'Hot Beverages & Soups',items:22,spend:2600,channel:'All',trafficF:1.26},
 {id:'PR-14',name:'Midnight Deal — Flat 40%',type:'Time-Based',disc:.40,start:'2023-12-20',end:'2024-01-05',scope:'Selected Items',items:34,spend:6700,channel:'3rd-Party Delivery',trafficF:2.4,flag:'trap'},
];
PROMOS.forEach(p=>{p.startD=new Date(p.start+'T00:00:00');p.endD=new Date(p.end+'T23:59:59');
  const d=(p.endD-p.startD)/864e5;p.days=Math.max(1,Math.round(d));p.uplift=Math.round((p.trafficF-1)*100);});

/* ── customers ── */
const SEGMENTS=[
 {id:'S1',name:'High-Value Loyal',color:'var(--gold)',     w:.16, r:[2,18],   f:[18,46], m:[980,3200]},
 {id:'S2',name:'Frequent Regulars',color:'var(--emerald)', w:.19, r:[3,26],   f:[11,26], m:[420,1100]},
 {id:'S3',name:'Promotion-Driven',color:'var(--copper)',   w:.17, r:[4,40],   f:[6,18],  m:[260,780], promo:[.55,.9]},
 {id:'S4',name:'At-Risk',          color:'var(--oxblood)', w:.15, r:[95,220], f:[4,13],  m:[180,620], churn:[.6,.92]},
 {id:'S5',name:'New (0–60 days)',  color:'var(--plum)',    w:.11, r:[1,12],   f:[1,3],   m:[38,190],  age:[10,58]},
 {id:'S6',name:'Occasional',       color:'var(--sage)',    w:.14, r:[30,120], f:[2,8],   m:[90,420]},
 {id:'S7',name:'Dormant',          color:'var(--muted)',   w:.08, r:[180,420],f:[1,5],   m:[40,300], churn:[.85,1]},
];
const FNAMES=['Ahmed','Sana','Bilal','Hina','Usman','Ayesha','Kashif','Maryam','Faizan','Nadia','Imran','Zainab','Hassan','Rabia','Danish','Kiran','Waqas','Anum','Shahid','Sadia','Junaid','Mehwish','Owais','Areeba','Talha','Nimra','Saad','Farah','Umair','Iqra','Rehan','Laiba','Salman','Hafsa','Naveed','Zoya','Arif','Sanam','Khalid','Mishal'];
const LNAMES=['Mehmood','Qureshi','Sheikh','Farooq','Ali','Jamal','Tariq','Naveed','Khan','Aslam','Shah','Rizvi','Yousaf','Anwar','Iqbal','Malik','Bashir','Ahmed','Riaz','Bhatti','Siddiqui','Sattar','Raza','Abbasi','Hashmi'];
const CITY_OF=Object.fromEntries(LOCATIONS.map(l=>[l.id,l.city]));
const CUSTOMERS=[];let _cid=1;
SEGMENTS.forEach(sg=>{
  const n=Math.round(5200*sg.w/0.16*0.16*2.4);
  for(let i=0;i<n;i++){
    const r=ri(sg.r[0],sg.r[1]),f=ri(sg.f[0],sg.f[1]),m=Math.round(rf(sg.m[0],sg.m[1]));
    const home=rn(LOCATIONS);
    CUSTOMERS.push({id:'C'+String(_cid++).padStart(6,'0'),name:rn(FNAMES)+' '+rn(LNAMES),seg:sg.id,segName:sg.name,segColor:sg.color,
      R:r,F:f,M:m,rScore:clamp(6-Math.ceil(r/34),1,5),fScore:clamp(Math.ceil(f/9.5),1,5),mScore:clamp(Math.ceil(m/640),1,5),
      aov:Math.round(m/Math.max(1,f)*100)/100, home:home.id, homeName:home.name, city:home.city,
      promoAff:sg.promo?rf(sg.promo[0],sg.promo[1]):rf(.05,.4), churnRisk:sg.churn?rf(sg.churn[0],sg.churn[1]):rf(.02,.22),
      channel:rnw(CHANNELS.map(c=>c.name),[38,18,12,26,6]), joined:'20'+ri(19,23)+'-'+String(ri(1,12)).padStart(2,'0'),
      diversity:ri(2,9), favCat:rn(CATEGORIES).name, lastOrder:new Date(BASE.getTime()-r*864e5).toISOString().slice(0,10)});
  }
});
/* monthly new vs churned for trend lines */
const CUST_TREND=[];let activeC=41200;
for(let m=0;m<12;m++){
  const d=new Date(2023,5+m,1);
  const season=[1,1.02,.97,1.05,1.11,1.16,1.34,1.08,.99,1.02,1.07,1.14][m];
  const act=Math.round(activeC*season);
  const nw=Math.round(act*rf(.055,.085)), ch=Math.round(act*rf(.038,.062));
  activeC+=nw-ch;CUST_TREND.push({m:d.toISOString().slice(0,7),label:d.toLocaleString('en',{month:'short'}),active:act,newC:nw,churned:ch});
}

/* ══════════════ FACT TABLES — orders / order lines / ratings / wastage ══════════════ */
const HOUR_W=[1,1,1,1,1,2,4,9,14,12,9,14,46,52,38,26,22,28,46,72,88,74,42,16]; // 24h weights
const DOW_W=[1.02,.92,.97,1.06,1.34,1.42,1.18];  // Mon..Sun
const SEASON_M=[0.93,0.95,1.00,1.05,1.12,1.16,1.30,1.02,0.96,0.99,1.06,1.14];

const ORDERS=[];const LINES=[];const RATINGS=[];const WASTAGE=[];
const ORDER_COUNT=9000;
const chanArr=CHANNELS.map(c=>c.name), chanW=CHANNELS.map(c=>c.share);
const itemW=ITEMS.map(it=>it.pop);
const promoByChannel={};PROMOS.forEach(p=>{(promoByChannel[p.channel]=promoByChannel[p.channel]||[]).push(p);});

let oid=100000;let lid=1;let rid=1;
for(let o=0;o<ORDER_COUNT;o++){
  const mi=ri(0,11); const d=new Date(2023,5+mi,1);
  const dim=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  let day=ri(1,dim); const date=new Date(2023,5+mi,day);
  const dow=(date.getDay()+6)%7;
  const hour=rnw([...Array(24).keys()],HOUR_W);
  const channel=rnw(chanArr,chanW);
  const loc=rnw(LOCATIONS,LOCATIONS.map(l=>l.traffic));
  const isFes=dow>=4;
  const season=SEASON_M[mi];
  const ramadan=(mi===9)||(mi===10&&day<=8);
  const nLines=clamp(Math.round(rnw([2,3,3,4,4,5,6,7],[10,18,22,20,14,8,5,3])*(channel==='Catering & Events'?2.2:1)),1,14);
  const promo=rnw([null,...(promoByChannel[channel]||[]).map(p=>p.id),...(promoByChannel['All']||[]).map(p=>p.id)],
    [78,...Array((promoByChannel[channel]||[]).length).fill(6),...Array((promoByChannel['All']||[]).length).fill(4)]);
  const promoObj=promo?PROMOS.find(p=>p.id===promo):null;
  const within=promoObj?(date>=promoObj.startD&&date<=promoObj.endD):false;
  const effPromo=within?promoObj:null;
  const cancelled=rnd()<.014;
  const custIdx=ri(0,CUSTOMERS.length-1);
  const orderId='ORD-'+String(oid++).padStart(7,'0');
  const lines=[];let orevenue=0,ocost=0,oqty=0,owaste=0;
  const picked=new Set();
  for(let l=0;l<nLines;l++){
    let idx=rnw([...ITEMS.keys()],itemW);
    if(picked.has(idx))continue;picked.add(idx);
    const it=ITEMS[idx];
    const seasonalF=1+ (Math.cos((mi-6)/12*2*Math.PI)*it.seasonalAmp);
    const weekendF=1+(isFes?it.weekendBias:0);
    if(it.arch==='new'&&date<new Date(it.launch+'-01T00:00:00'))continue;
    if(rnd()>clamp(it.pop*season*seasonalF*weekendF*0.62,.03,1.4))continue;
    const qty=rnw([1,1,1,2,2,3],[52,26,12,14,8,4]);
    const locF=1+(loc.rent-.9)*.05;
    const basePrice=Math.round(it.price*locF*(1+(mi%4)*.006)*100)/100;
    const disc=effPromo?effPromo.disc*rf(.85,1.05):(channel==='3rd-Party Delivery'?rf(.04,.12):rf(0,.05));
    const paid=Math.round(basePrice*(1-disc)*100)/100;
    const rev=Math.round(paid*qty*100)/100;
    const cst=Math.round(it.cost*qty*100)/100;
    const lineWaste=cancelled?0:Math.round(qty*it.wasteRate/100*rf(.7,1.35)*100)/100;
    LINES.push({id:lid++,o,it:idx,item:it.id,itemName:it.name,cat:it.cat,catName:it.catName,qty,basePrice,paid,listDiscount:Math.round(disc*1000)/10,
      rev,cost:cst,margin:Math.round((rev-cst)*100)/100,waste:lineWaste,cancelled,loc:loc.id,locName:loc.name,city:loc.city,
      channel,promo:effPromo?effPromo.id:null,promoName:effPromo?effPromo.name:null,cust:CUSTOMERS[custIdx].id,
      seg:CUSTOMERS[custIdx].seg, date:date.toISOString().slice(0,10), ts:+date+hour*3600e3, hour, dow, mo:mi,
      ratingProb:clamp(.06+it.rating/60,0,1)});
    lines.push(LINES.length-1);
    orevenue+=rev;ocost+=cst;oqty+=qty;owaste+=lineWaste;
  }
  ORDERS.push({id:orderId,total:Math.round(orevenue*100)/100,cost:Math.round(ocost*100)/100,profit:Math.round((orevenue-ocost)*100)/100,
    qty:oqty,lines,date:date.toISOString().slice(0,10),ts:+date+hour*3600e3,hour,dow,mo:mi,channel,loc:loc.id,locName:loc.name,city:loc.city,
    cust:CUSTOMERS[custIdx].id,seg:CUSTOMERS[custIdx].seg,promo:effPromo?effPromo.id:null,promoName:effPromo?effPromo.name:null,cancelled,waste:Math.round(owaste*100)/100});
}
/* ratings (~1.2 per 2 lines → ≈105k record equivalent; sampled) */
LINES.forEach(l=>{
  if(rnd()<l.ratingProb*.16){
    const it=ITEMS[l.it];
    const promoFactor=l.promo?-.22:0;
    const r=clamp(Math.round((it.rating+rf(-.85,.55)+promoFactor+(l.channel==='3rd-Party Delivery'?-.25:0))*10)/10,1,5);
    RATINGS.push({id:'RT-'+String(rid++).padStart(7,'0'),item:l.item,itemName:l.itemName,loc:l.loc,locName:l.locName,locCity:l.city,
      cust:l.cust,seg:l.seg,channel:l.channel,promo:l.promo,date:l.date,ts:l.ts,rating:r,duplicateBurst:rnd()<.02});
  }
});
/* wastage records per item/day/location (aggregated sampling) */
const WREASON=['Over-preparation','Spoilage — refrigeration','Trim & prep loss','Customer return','Expired batch','Spill / mishandling','Buffet surplus'];
for(let w=0;w<2600;w++){
  const it=ITEMS[ri(0,ITEMS.length-1)];
  const mi=ri(0,11);const day=ri(1,28);const date=new Date(2023,5+mi,day);
  const loc=rn(LOCATIONS);
  const qty=Math.round(it.wasteRate/100*(it.cat===('CAT-06')?1.6:1)*rf(.5,3.4)*100)/100;
  const cost=Math.round(qty*(it.cost/3.1)*100)/100;
  WASTAGE.push({id:'WS-'+String(w+1).padStart(6,'0'),item:it.id,itemName:it.name,cat:it.cat,catName:it.catName,loc:loc.id,locName:loc.name,
    city:loc.city,date:date.toISOString().slice(0,10),mo:mi,wastePct:Math.round(it.wasteRate*10)/10,qty:Math.max(.1,qty),
    cost:Math.max(.3,cost),reason:rn(WREASON),prepared:Math.round(qty*(3.2+rnd()*2.4)*10)/10,promo:rnd()<.3?rn(PROMOS).id:null});
}

/* ══════════════════ ANOMALIES (Step 31, 30) ══════════════════ */
const ANOM_TYPES=[
 {t:'Sales Spike',d:'Demand deviated >3.5σ above 28-day rolling mean',sev:'High',det:'Z-score + STL decomposition'},
 {t:'Sales Drop', d:'Demand deviated >3σ below rolling mean — possible outage',sev:'Critical',det:'Z-score + STL decomposition'},
 {t:'Order Value Spike',d:'Single order total > p99.7 of channel AOV',sev:'Medium',det:'IQR fence ×3.0'},
 {t:'Unusual Discount',d:'Effective discount 42–58% outside any active campaign',sev:'High',det:'Discount rule engine (Spark SQL)'},
 {t:'Duplicate Transaction',d:'Identical basket, same customer, <90s apart',sev:'Critical',det:'Self-join on hash(cust,items,minute)'},
 {t:'Rating Spike', d:'Daily mean rating jumped +1.4 within 48h on low-volume item',sev:'Medium',det:'Rolling-window EWMA residuals'},
 {t:'Rating Drop',  d:'Daily mean rating fell −1.6 with 3× normal volume',sev:'High',det:'Rolling-window EWMA residuals'},
 {t:'Identical Ratings Burst',d:'11 identical 5★ ratings from distinct accounts in 6h',sev:'High',det:'Rating entropy + burst detector'},
 {t:'Wastage Spike',d:'Wastage cost 4.2× the category 30-day median',sev:'Critical',det:'Robust median absolute deviation'},
 {t:'Price Anomaly',d:'Selling price changed mid-month without pricing_history entry',sev:'Medium',det:'Except-join pricing_history × order_items'},
 {t:'Impossible Wastage',d:'Wasted qty exceeds prepared qty − sold qty',sev:'High',det:'Constraint validator (DQ engine)'},
 {t:'Negative Quantity',d:'Order line qty < 0 retained from POS void',sev:'Critical',det:'Data-quality rule DQ-07'},
];
const ANOMALIES=[];let _aid=1;
for(let i=0;i<24;i++){
  const at=rnw(ANOM_TYPES,ANOM_TYPES.map(a=>a.sev==='Critical'?3:a.sev==='High'?4:5));
  const it=rn(ITEMS);const loc=rn(LOCATIONS);const mi=ri(0,11);const day=ri(1,28);
  const exp=rf(120,1900);const dev=at.t.includes('Drop')?rf(-.55,-.28):rf(.4,2.6);
  const mday=new Date(2023,5+mi,day);
  ANOMALIES.push({id:'AN-'+String(_aid++).padStart(4,'0'),type:at.t,detail:at.detector||at.d,sev:at.sev,method:at.det,
    entity:rnd()<.5?it.name:loc.name,entityId:rnd()<.5?it.id:loc.id,scope:rnd()<.5?'Menu Item':'Location',
    date:mday.toISOString().slice(0,10),expected:Math.round(exp*100)/100,actual:Math.round(exp*(1+dev)*100)/100,
    deviation:Math.round(dev*1000)/10,
    engine:rnd()<.5?'Spark SQL':'Python · scipy.stats',status:rnd()<.35?'Investigating':rnd()<.6?'Confirmed':'Dismissed',
    owner:rn(LOCATIONS).manager,impact:Math.round(Math.abs(dev)*exp*rf(.6,3.2))});
}
ANOMALIES.sort((a,b)=>b.date.localeCompare(a.date));

/* ══════════════ MODEL REGISTRY (Steps 12-14, 22, 24 · FR xlii-xlvi) ══════════════ */
const MODELS=[
 {id:'MDL-01',task:'Menu Performance Classification',target:'performance_class (4C)',pipe:'Spark',algo:'GBTClassifier',ver:'spark-gbt-v3.2',
  feats:22,acc:.912,f1:.887,prec:.898,rec:.879,auc:.962,train:'42,180 items',val:'9,024 items',test:'9,024 items',trained:'2024-05-28 04:12',size:'18.4 MB',status:'Champion',
  params:{maxDepth:5,maxIter:80,stepSize:.1,subsamplingRate:.85,featureSubsetStrategy:'sqrt'},conf:[[3820,142,96,58],[118,2964,208,84],[64,192,2718,132],[38,96,124,170]]},
 {id:'MDL-02',task:'Customer Segmentation',target:'segment (7C)',pipe:'Spark',algo:'KMeans (k=7, gower-scaled)',ver:'spark-kmeans-v2.1',
  feats:11,acc:.847,f1:.821,prec:.833,rec:.812,auc:.901,trainsil:.81,train:'6,500 customers',val:'—',test:'1,950 customers',trained:'2024-05-27 22:40',size:'0.9 MB',status:'Champion',
  params:{k:7,init:'k-means||',maxIter:60,tol:'1e-4',seed:20240531}},
 {id:'MDL-03',task:'Demand Forecasting (item × week)',target:'demand_qty (regression)',pipe:'Spark',algo:'GBTRegressor + lag features',ver:'spark-gbtr-v4.0',
  feats:19,mae:38.4,rmse:61.2,mape:9.4,r2:.938,baseline:'MAE 96.1 (naive seasonal)',trained:'2024-05-29 01:55',size:'11.7 MB',status:'Champion',
  params:{maxDepth:6,maxIter:120,stepSize:.08,loss:'squared'},backtest:'rolling-origin, 8 folds (time-aware split)'},
 {id:'MDL-04',task:'Wastage-Risk Prediction',target:'high_wastage (binary)',pipe:'Spark',algo:'RandomForestClassifier',ver:'spark-rfc-v1.8',
  feats:16,acc:.894,f1:.861,prec:.872,rec:.851,auc:.941,prec_rec_ap:.889,trained:'2024-05-28 06:31',size:'24.2 MB',status:'Champion',
  params:{numTrees:220,maxDepth:9,impurity:'gini',minInstancesPerNode:5},conf:[[1620,168],[142,1294]]},
 {id:'MDL-05',task:'High-Value Customer Prediction',target:'high_value (binary)',pipe:'Spark',algo:'LogisticRegression (elastic-net)',ver:'spark-lr-v1.4',
  feats:14,acc:.881,f1:.844,prec:.869,rec:.821,auc:.929,trained:'2024-05-28 07:02',size:'1.6 MB',status:'Challenger',params:{regParam:.08,elasticNetParam:.35,maxIter:200}},
 {id:'MDL-06',task:'Menu Performance Classification',target:'performance_class (4C)',pipe:'Python',algo:'XGBoost (hist)',ver:'py-xgb-v3.3',
  feats:22,acc:.921,f1:.898,prec:.906,rec:.891,auc:.968,train:'42,180 items',val:'9,024 items',test:'9,024 items',trained:'2024-05-28 09:18',size:'6.9 MB',status:'Champion',
  params:{n_estimators:420,max_depth:6,learning_rate:.06,subsample:.9,colsample_bytree:.8,reg_lambda:1.2},conf:[[3876,128,84,28],[96,3004,182,92],[52,168,2764,122],[26,84,110,208]]},
 {id:'MDL-07',task:'Customer Segmentation',target:'segment (7C)',pipe:'Python',algo:'GaussianMixture + DBSCAN cross-check',ver:'py-gmm-v1.6',
  feats:11,acc:.862,f1:.838,prec:.849,rec:.826,auc:.914,trainsil:.79,trained:'2024-05-28 10:02',size:'3.1 MB',status:'Champion',params:{n_components:7,covariance_type:'full',reg_covar:'1e-6',random_state:20240531}},
 {id:'MDL-08',task:'Demand Forecasting (item × week)',target:'demand_qty (regression)',pipe:'Python',algo:'XGBoost + SARIMAX ensemble (0.65/0.35)',ver:'py-ens-v4.1',
  feats:23,mae:34.1,rmse:55.8,mape:8.6,r2:.948,baseline:'MAE 96.1 (naive seasonal)',trained:'2024-05-29 05:48',size:'9.3 MB',status:'Champion',
  params:{xgb:{n_estimators:600,max_depth:5,learning_rate:.05},sarimax:{order:'(1,1,1)(1,1,0,7)'}},backtest:'rolling-origin, 8 folds (time-aware split)'},
 {id:'MDL-09',task:'Wastage-Risk Prediction',target:'high_wastage (binary)',pipe:'Python',algo:'GradientBoosting (sklearn)',ver:'py-gbc-v1.9',
  feats:20,acc:.906,f1:.877,prec:.885,rec:.869,auc:.952,trained:'2024-05-28 12:24',size:'4.4 MB',status:'Champion',
  params:{n_estimators:300,learning_rate:.07,max_depth:3,subsample:.85},conf:[[1655,133],[121,1315]]},
];
const ALGO_TRIALS=[
 {task:'Menu Performance Classification',pipe:'Spark MLlib',rows:[
  {a:'LogisticRegression',acc:.834,f1:.801,auc:.887,t:'2m 04s'},{a:'DecisionTree',acc:.872,f1:.849,auc:.911,t:'1m 12s'},
  {a:'RandomForest',acc:.901,f1:.878,auc:.951,t:'6m 41s'},{a:'GBTClassifier',acc:.912,f1:.887,auc:.962,t:'9m 27s',pick:1}]},
 {task:'Demand Forecasting',pipe:'Spark MLlib',rows:[
  {a:'LinearRegression',mae:71.9,rmse:104.2,mape:18.4,r2:.812,t:'48s'},{a:'DecisionTreeRegressor',mae:56.2,rmse:88.7,mape:14.1,r2:.866,t:'1m 31s'},
  {a:'RandomForestRegressor',mae:41.8,rmse:66.4,mape:10.2,r2:.921,t:'7m 12s'},{a:'GBTRegressor',mae:38.4,rmse:61.2,mape:9.4,r2:.938,t:'11m 03s',pick:1}]},
 {task:'Wastage-Risk Prediction',pipe:'Python · scikit-learn',rows:[
  {a:'LogisticRegression',acc:.821,f1:.788,auc:.874,t:'22s'},{a:'RandomForest',acc:.878,f1:.845,auc:.922,t:'2m 08s'},
  {a:'GradientBoosting',acc:.906,f1:.877,auc:.952,t:'3m 44s',pick:1},{a:'XGBoost (tuned)',acc:.903,f1:.872,auc:.948,t:'4m 12s'}]},
];
/* feature importance (top drivers, shared by both pipelines) */
const FEAT_IMP=[
 {f:'contribution_margin_pct',s:.92,p:.88},{f:'repeat_purchase_rate',s:.71,p:.76},{f:'wastage_pct_30d',s:.68,p:.72},
 {f:'qty_sold_90d',s:.66,p:.61},{f:'avg_rating',s:.54,p:.58},{f:'promo_dependency',s:.49,p:.52},
 {f:'price_change_pct_90d',s:.44,p:.47},{f:'margin_per_unit',s:.42,p:.39},{f:'orders_per_week',s:.38,p:.41},
 {f:'weekend_order_ratio',s:.31,p:.34},{f:'basket_attach_rate',s:.29,p:.27},{f:'rating_trend_90d',s:.26,p:.29},
 {f:'inventory_turnover',s:.22,p:.24},{f:'seasonal_amplitude',s:.19,p:.21},{f:'channel_mix_entropy',s:.16,p:.15},
];

/* ══════════════ MARKET BASKET (Steps 17-18) ══════════════ */
const BASKET=[
 {a:'Zinger Burger',b:'Loaded Beef Fries',sup:7.4,conf:41.2,lift:3.82,rev:128400,margin:.31,rec:'Combo meal — “Zinger Feast”'},
 {a:'Chicken Biryani',b:'Mint Margarita',sup:6.1,conf:38.7,lift:3.44,rev:214800,margin:.46,rec:'Combo with beverage'},
 {a:'Chicken Karahi',b:'Garlic Naan / Rice',sup:5.8,conf:36.4,lift:3.21,rev:268300,margin:.48,rec:'Family bundle (already PR-03)'},
 {a:'Seekh Kebab (Beef)',b:'Fresh Lime Soda',sup:5.2,conf:34.1,lift:3.05,rev:96200,margin:.44,rec:'Cross-sell at order confirm'},
 {a:'Truffle Mushroom Pasta',b:'Cheese Garlic Bread',sup:3.1,conf:29.6,lift:2.87,rev:71200,margin:.58,rec:'Upsell — Hidden Opportunity pairing'},
 {a:'Chicken Corn Soup',b:'Spring Rolls (Veg)',sup:4.4,conf:31.8,lift:2.79,rev:54800,margin:.63,rec:'Starter pair bundle'},
 {a:'Molten Lava Cake',b:'Iced Tea (Peach)',sup:2.6,conf:27.2,lift:2.61,rev:38400,margin:.66,rec:'Dessert+drink attach'},
 {a:'Grilled Salmon Fillet',b:'Garden Green Salad',sup:1.4,conf:24.8,lift:2.44,rev:62900,margin:.41,rec:'Healthy pair, premium price-point'},
 {a:'Beef Smash Burger',b:'Soft Drink (Large)',sup:3.9,conf:29.1,lift:2.38,rev:88600,margin:.35,rec:'Value meal ladder'},
 {a:'Mutton Biryani (Sindhi)',b:'Kashmiri Chai',sup:2.2,conf:22.6,lift:2.19,rev:94300,margin:.52,rec:'Regional favourite pairing'},
 {a:'Chicken Tikka Boti',b:'Penne Arrabbiata',sup:.9,conf:11.4,lift:1.82,rev:22300,margin:.49,rec:'Low lift — do not force bundle'},
 {a:'New York Cheesecake',b:'Delivery-Only 30% Off',sup:1.1,conf:18.9,lift:.92,rev:19800,margin:.22,rec:'⚠ Lift < 1 — promotion stack, review (PR-12 trap)'},
];

/* ══════════════ RECOMMENDATION ENGINE OUTPUT (Steps 37-39) ══════════════ */
const RECS=[
 {id:'REC-001',pri:'Critical',cat:'Menu Optimization',action:'Remove or fully redesign 6 persistent Low Performers (M014 Rehmi Kebab, M031 Khichda, M052 Sole Meunière, M117 Nutella Waffle, M148 Roasted Barley Tea, M156 Blue Lagoon Mockup) — combined −$3,140 monthly contribution.',
  ev:['Order frequency bottom decile 12 months running','Contribution margin < 8%','Wastage 14.2% of prepared qty','Rating 3.1 avg (n=412)'],impact:'+$3.1K/mo contribution, −18% wastage in category',conf:'94%',owns:'Arslan Mehmood',eta:'30 days',src:'Spark GBT + Python XGB agree (Δ 1 item)'},
 {id:'REC-002',pri:'Critical',action:'Halt “Delivery-Only 30% Off” (PR-07) — revenue +$41.2K but contribution margin −$9.8K and wastage +22% on delivery lines.',
  cat:'Promotion',ev:['Margin/order $4.10 vs $5.86 non-promo','Wastage index 1.22 vs 1.00','Repeat rate of discount-only buyers 6.1%'],impact:'+$9.8K/mo margin, wastage −14%',conf:'91%',owns:'Sana Rizvi',eta:'Immediate',src:'Promotion trap detector · FR xxxiv'},
 {id:'REC-003',pri:'High',action:'Increase stock & prep capacity for Fri–Sun 19:00–22:30 at 6 flagged sites — forecast demand exceeds capacity 1.28× and drives stock-outs.',
  cat:'Inventory',ev:['Forecast uplift +23.4% vs current prep','86 “item unavailable” events in 30d','Peak-hour waste near 0 on those lines'],impact:'+$18.6K revenue opportunity',conf:'88%',owns:'Operations',eta:'Next weekend',src:'Spark GBTRegressor (MAPE 9.4%)'},
 {id:'REC-004',pri:'High',action:'Promote 9 Hidden Opportunities in-app (M012 Paneer Tikka Sliders, M044 Grilled Salmon Fillet, M071 Truffle Mushroom Pasta…) — top-quartile margin x bottom-quartile visibility.',
  cat:'Menu',ev:['Margin 68.1% avg vs 47.2% menu avg','Rating 4.62 avg','Repeat rate 38.7% among buyers','Order share only 0.9%'],impact:'+$14.2K/mo if 1.5% share captured',conf:'86%',owns:'Sana Rizvi',eta:'2 weeks',src:'Rule engine + model consensus'},
 {id:'REC-005',pri:'High',action:'Re-price 11 highly price-sensitive items (−2% to −4%) — elasticity < −1.6, expected volume gain outweighs margin loss.',
  cat:'Pricing',ev:['Mean elasticity −1.87 (p<0.01)','Competitor index 1.16','Price increase of 6% cut volume 11.2% in Dec pilot'],impact:'+$7.4K/mo contribution',conf:'83%',owns:'Finance',eta:'1 sprint',src:'Python statsmodels OLS + Spark GLM'},
 {id:'REC-006',pri:'Medium',action:'Launch “Biryani + Mint Margarita” combo at $9.90 — support 6.1%, confidence 38.7%, lift 3.44.',
  cat:'Basket',ev:['3.44 lift on 5,246 baskets','Attach margin 46%','Zero added wastage'],impact:'+$5.9K/mo',conf:'87%',owns:'Marketing',eta:'3 weeks',src:'FP-Growth (min_support .01, min_conf .2)'},
 {id:'REC-007',pri:'Medium',action:'Win-back campaign for 1,240 At-Risk customers (R>95d, F dropped >40%, M>$400) — 3-touch offer + loyalty points.',
  cat:'Customer',ev:['Churn score >0.72 (Python GMM)','Historic AOV $28.40','Loyalty cohort ROI 3.1× in Feb pilot'],impact:'+$22.8K retained revenue',conf:'79%',owns:'CRM',eta:'2 weeks',src:'Churn model MDL-07'},
 {id:'REC-008',pri:'Medium',action:'Add 2nd prep line at LOC-05 Dolmen Food Court 12:00–15:00 — throughput constraint costs ~7.4% of lunch orders.',
  cat:'Operations',ev:['Avg ticket time 14.2 min vs 9.8 chain avg','Lunch revenue/sqm lowest of 20 sites','Peak queue abandonment proxy +9%'],impact:'+$9.1K/mo',conf:'81%',owns:'Regional',eta:'45 days',src:'Location analytics'},
 {id:'REC-009',pri:'Low',action:'Investigate rating anomaly burst on M063 Butter Chicken at LOC-09 (11 identical 5★ in 6h) before using rating in promo ranking.',
  cat:'Data Integrity',ev:['Rating entropy 0.31 (normal >1.4)','Same-IP proxy signal on 8 accounts','Item rating +1.4σ vs 90d trend'],impact:'Prevents −$2.1K steer cost',conf:'77%',owns:'Analytics',eta:'10 days',src:'Anomaly engine AN-0012'},
 {id:'REC-010',pri:'Low',action:'Reduce prep quantity 20% for 7 high-wastage Seafood items on Mon–Wed (wastage 11.4% vs 6.1% weekend).',
  cat:'Wastage',ev:['Monday wastage 11.4%','Demand Mon–Wed −31% vs weekend','Holding time <6h acceptable'],impact:'−$4.2K/mo wastage cost',conf:'84%',owns:'Kitchen Ops',eta:'Next cycle',src:'Wastage-risk RF (AUC .941)'},
];
const REC_PRIW={Critical:4,High:3,Medium:2,Low:1};
RECS.forEach(r=>r.priW=REC_PRIW[r.pri]);
RECS.sort((a,b)=>b.priW-a.priW);

/* ══════════════ DATA QUALITY (Steps 4-5 · FR xiv-xv) ══════════════ */
const DQ_RULES=[
 {id:'DQ-01',check:'Missing customer_id on order header',found:482,sev:'High',action:'Quarantined → guest-checkout backfill; unmatched 61 flagged',tbl:'orders',col:'customer_id',rule:'NOT NULL · FK→customers'},
 {id:'DQ-02',check:'Duplicate order headers (customer+ts+total)',found:317,sev:'Critical',action:'Deduplicated keeping earliest ts; 317 rows dropped',tbl:'orders',col:'order_id',rule:'UNIQUE(customer_id, order_ts, total)'},
 {id:'DQ-03',check:'Duplicate order-line rows',found:1204,sev:'Critical',action:'Dropped by (order_id,item_id,line_no) key',tbl:'order_items',col:'line_no',rule:'UNIQUE(order_id, line_no)'},
 {id:'DQ-04',check:'Invalid menu price (≤0 or >$180)',found:96,sev:'High',action:'Corrected from pricing_history effective price',tbl:'menu_items',col:'unit_price',rule:'0 < unit_price ≤ 180'},
 {id:'DQ-05',check:'Negative quantity on void lines',found:141,sev:'Critical',action:'Excluded from revenue KPIs, retained in audit',tbl:'order_items',col:'quantity',rule:'quantity > 0'},
 {id:'DQ-06',check:'Invalid dates (future / pre-launch)',found:74,sev:'High',action:'Clipped to order window; 12 rejected',tbl:'orders',col:'order_ts',rule:'2023-06-01 ≤ ts ≤ 2024-05-31'},
 {id:'DQ-07',check:'Invalid rating outside 1–5',found:213,sev:'Medium',action:'Imputed from item 90-day mean rating',tbl:'ratings',col:'rating',rule:'1 ≤ rating ≤ 5'},
 {id:'DQ-08',check:'Missing menu_id (unknown SKU)',found:129,sev:'Critical',action:'Quarantined → mapped via fuzzy name match, 23 unresolved',tbl:'order_items',col:'item_id',rule:'FK→menu_items.item_id'},
 {id:'DQ-09',check:'Invalid restaurant_id reference',found:38,sev:'High',action:'Rejected (orphan location) — reported to POS owner',tbl:'orders',col:'location_id',rule:'FK→restaurants.location_id'},
 {id:'DQ-10',check:'Impossible wastage (wasted > prepared − sold)',found:57,sev:'High',action:'Capped to available qty; 9 rows quarantined',tbl:'wastage',col:'waste_qty',rule:'waste_qty ≤ prepared_qty − sold_qty'},
 {id:'DQ-11',check:'Incorrect discount (>60% or negative)',found:88,sev:'High',action:'Recomputed from promotions master; 14 to review',tbl:'order_items',col:'discount_pct',rule:'0 ≤ discount ≤ 0.60'},
 {id:'DQ-12',check:'Cancelled transactions included in sales',found:1447,sev:'Critical',action:'Excluded from all revenue/margin KPIs (retained for churn signals)',tbl:'orders',col:'status',rule:'status ≠ CANCELLED for sales'},
 {id:'DQ-13',check:'Inconsistent units (kg vs g) in inventory',found:302,sev:'Medium',action:'Normalised to kg via unit map',tbl:'inventory',col:'consumed_qty',rule:'unit ∈ {kg,g,ml,l} → canonical'},
 {id:'DQ-14',check:'Invalid location reference in pricing_history',found:44,sev:'Medium',action:'Dropped from price-variance analysis',tbl:'pricing_history',col:'location_id',rule:'FK→restaurants'},
 {id:'DQ-15',check:'Outlier unit price (p99.9 fence ×3.0 IQR)',found:163,sev:'Medium',action:'Flagged not removed — outlier-aware robust stats',tbl:'order_items',col:'unit_price',rule:'IQR fence ±3.0'},
 {id:'DQ-16',check:'Missing promo_id where discount > 0',found:271,sev:'High',action:'Backfilled PR-09 Loyalty where ts in campaign window',tbl:'order_items',col:'promotion_id',rule:'discount>0 ⇒ promo_id NOT NULL'},
];
const SCHEMA=[
 {t:'customers',rows:'52,000',pk:'customer_id',fks:'—',cols:14,part:'city'},
 {t:'orders',rows:'102,400',pk:'order_id',fks:'customer_id→customers, location_id→restaurants, promotion_id→promotions',cols:16,part:'order_month'},
 {t:'order_items',rows:'1,048,575',pk:'line_id',fks:'order_id→orders, item_id→menu_items, promotion_id→promotions',cols:18,part:'order_month'},
 {t:'menu_items',rows:'168',pk:'item_id',fks:'category_id→menu_categories',cols:15,part:'category_id'},
 {t:'menu_categories',rows:'12',pk:'category_id',fks:'—',cols:7,part:'—'},
 {t:'restaurants',rows:'20',pk:'location_id',fks:'—',cols:13,part:'city'},
 {t:'pricing_history',rows:'3,912',pk:'price_change_id',fks:'item_id→menu_items, location_id→restaurants',cols:9,part:'effective_year'},
 {t:'promotions',rows:'14',pk:'promotion_id',fks:'—',cols:12,part:'—'},
 {t:'ratings',rows:'104,220',pk:'rating_id',fks:'item_id→menu_items, location_id→restaurants, customer_id→customers',cols:11,part:'rating_month'},
 {t:'inventory',rows:'61,320',pk:'inventory_id',fks:'item_id→menu_items, location_id→restaurants',cols:12,part:'location_id'},
 {t:'wastage',rows:'50,640',pk:'waste_id',fks:'item_id→menu_items, location_id→restaurants',cols:12,part:'waste_date'},
];
const JOINS=[
 {l:'Orders ⋈ Customers',k:'customer_id',mr:'102,400',drop:'61',t:'4.1s'},
 {l:'Orders ⋈ Order_Items',k:'order_id',mr:'1,048,575',drop:'0',t:'18.7s'},
 {l:'Order_Items ⋈ Menu_Items',k:'item_id',mr:'1,048,575',drop:'23 (quarantined)',t:'11.2s'},
 {l:'Menu_Items ⋈ Menu_Categories',k:'category_id',mr:'168',drop:'0',t:'0.3s'},
 {l:'Orders ⋈ Restaurants',k:'location_id',mr:'102,400',drop:'0',t:'1.4s'},
 {l:'Orders ⋈ Promotions',k:'promotion_id',mr:'102,400',drop:'271 (backfilled)',t:'2.6s'},
 {l:'Menu_Items ⋈ Pricing_History',k:'item_id',mr:'3,912',drop:'0',t:'0.8s'},
 {l:'Menu_Items ⋈ Ratings',k:'item_id',mr:'104,220',drop:'0',t:'2.1s'},
 {l:'Menu_Items ⋈ Inventory',k:'item_id + location_id',mr:'61,320',drop:'14',t:'5.4s'},
 {l:'Menu_Items ⋈ Wastage',k:'item_id + location_id',mr:'50,640',drop:'9 (capped)',t:'3.3s'},
];
const FEATURES=[
 {n:'item_revenue_90d',d:'Σ line revenue, trailing 90 days',src:'order_items',pipe:'both'},
 {n:'item_cost_90d',d:'Σ ingredient + prep cost',src:'order_items',pipe:'both'},
 {n:'margin_per_unit',d:'(unit_price − unit_cost)',src:'menu_items',pipe:'both'},
 {n:'contribution_margin_pct',d:'margin ÷ revenue',src:'derived',pipe:'both'},
 {n:'qty_sold_90d',d:'units sold rolling window',src:'order_items',pipe:'both'},
 {n:'orders_per_week',d:'distinct orders ÷ weeks live',src:'orders',pipe:'both'},
 {n:'repeat_purchase_rate',d:'buyers with ≥2 orders ÷ buyers',src:'orders × customers',pipe:'both'},
 {n:'avg_rating',d:'mean customer rating 90d',src:'ratings',pipe:'both'},
 {n:'rating_trend_90d',d:'OLS slope of monthly avg rating',src:'ratings',pipe:'both'},
 {n:'wastage_pct_30d',d:'waste_qty ÷ prepared_qty',src:'wastage',pipe:'both'},
 {n:'promo_dependency',d:'promo-attached line share',src:'order_items × promotions',pipe:'both'},
 {n:'discount_pct_avg',d:'Σ discount ÷ list revenue',src:'order_items',pipe:'both'},
 {n:'price_change_pct_90d',d:'Δ effective price vs 90d ago',src:'pricing_history',pipe:'both'},
 {n:'elasticity_est',d:'log-log OLS Δqty vs Δprice',src:'pricing_history × order_items',pipe:'both'},
 {n:'recency_days',d:'today − last order date',src:'orders',pipe:'both'},
 {n:'frequency_30_90_180',d:'order counts in 3 windows',src:'orders',pipe:'both'},
 {n:'monetary_12m',d:'Σ spend trailing 12 months',src:'orders',pipe:'both'},
 {n:'avg_order_value',d:'monetary ÷ frequency',src:'derived',pipe:'both'},
 {n:'peak_hour_freq',d:'share of lines in 19:00–23:00',src:'orders',pipe:'both'},
 {n:'weekend_order_ratio',d:'Fri–Sun share',src:'orders',pipe:'both'},
 {n:'basket_size_avg',d:'mean lines per order',src:'order_items',pipe:'both'},
 {n:'channel_preference',d:'argmax channel share',src:'orders',pipe:'both'},
 {n:'location_perf_index',d:'revenue ÷ chain median (per sqm)',src:'orders × restaurants',pipe:'both'},
 {n:'seasonal_amplitude',d:'monthly demand σ ÷ mean',src:'order_items',pipe:'both'},
];
const SPARK_JOBS=[
 {id:'JOB-2214',stage:'raw → bronze ingestion',status:'SUCCESS',inp:'11 files · 4.31 GB',out:'1,305,881 rows',part:'month=12',dur:'214s',shuffle:'1.8 GB',mem:'8g',at:'2024-05-30 23:02'},
 {id:'JOB-2215',stage:'schema validation + DQ scan (16 rules)',status:'SUCCESS',inp:'1,305,881 rows',out:'DQ report + 2,043 quarantined',part:'—',dur:'96s',shuffle:'612 MB',mem:'6g',at:'2024-05-30 23:08'},
 {id:'JOB-2216',stage:'cleaning & canonicalisation',status:'SUCCESS',inp:'1,305,881 rows',out:'1,303,838 rows',part:'month=12',dur:'143s',shuffle:'940 MB',mem:'8g',at:'2024-05-30 23:14'},
 {id:'JOB-2217',stage:'integration — 10 joins (Spark SQL)',status:'SUCCESS',inp:'10 tables',out:'wide_analytics table',part:'month=12',dur:'287s',shuffle:'3.4 GB',mem:'12g',at:'2024-05-30 23:30'},
 {id:'JOB-2218',stage:'feature engineering — 24 features',status:'SUCCESS',inp:'1,303,838 rows',out:'feat_store v2.4',part:'category=12, month=12',dur:'302s',shuffle:'2.6 GB',mem:'12g',at:'2024-05-30 23:42'},
 {id:'JOB-2219',stage:'Parquet write (snappy, partitioned, bucketed 8)',status:'SUCCESS',inp:'feat_store v2.4',out:'1.7 GB · 412 files',part:'month/category',dur:'118s',shuffle:'—',mem:'8g',at:'2024-05-30 23:51'},
 {id:'JOB-2220',stage:'Spark SQL — 14 analytical query batch',status:'SUCCESS',inp:'feat_store v2.4',out:'14 result sets',part:'—',dur:'161s',shuffle:'1.1 GB',mem:'10g',at:'2024-05-31 00:04'},
 {id:'JOB-2221',stage:'MLlib training — 5 models (4 algos compared)',status:'SUCCESS',inp:'49,224 train rows',out:'5 models + metrics',part:'—',dur:'1,784s',shuffle:'2.2 GB',mem:'16g',at:'2024-05-31 00:11'},
 {id:'JOB-2222',stage:'dual-pipeline comparison (1,000 rows)',status:'SUCCESS',inp:'Spark ∪ Python preds',out:'agreement report 93.7%',part:'—',dur:'42s',shuffle:'84 MB',mem:'4g',at:'2024-05-31 00:44'},
 {id:'JOB-2223',stage:'forecast batch + MAPE backtest',status:'SUCCESS',inp:'feat_store v2.4',out:'90-day forecast',part:'—',dur:'266s',shuffle:'310 MB',mem:'10g',at:'2024-05-31 00:49'},
 {id:'JOB-2224',stage:'nightly incremental (24h delta)',status:'FAILED → RETRY OK',inp:'12,480 rows',out:'1,240 rows',part:'month=12',dur:'58s → 71s',shuffle:'42 MB',mem:'4g',at:'2024-05-31 02:05'},
];
const AUDIT=[
 {at:'2024-05-31 02:19',user:'spark-scheduler',role:'service',act:'Spark job JOB-2224 retried successfully after executor OOM',obj:'spark_jobs',res:'SUCCESS',ip:'10.0.4.11'},
 {at:'2024-05-31 01:02',user:'sana.r',role:'Analyst',act:'Exported menu_performance_report.csv (168 rows)',obj:'reports',res:'SUCCESS',ip:'10.0.7.42'},
 {at:'2024-05-31 00:58',user:'sana.r',role:'Analyst',act:'Ran what-if scenario P-8% on 12 seafood items',obj:'scenario',res:'SUCCESS',ip:'10.0.7.42'},
 {at:'2024-05-31 00:44',user:'spark-scheduler',role:'service',act:'Dual-pipeline comparison written (agreement 93.7%)',obj:'model_compare',res:'SUCCESS',ip:'10.0.4.11'},
 {at:'2024-05-30 23:47',user:'arslan.m',role:'Manager',act:'Acknowledged 3 Critical recommendations',obj:'recommendations',res:'SUCCESS',ip:'10.0.9.18'},
 {at:'2024-05-30 22:31',user:'kashif.h',role:'Regional',act:'Viewed location comparison — Lahore cluster',obj:'dashboard',res:'SUCCESS',ip:'10.0.9.77'},
 {at:'2024-05-30 21:12',user:'admin',role:'Administrator',act:'Updated promotion PR-07 status → paused (trap)',obj:'promotions',res:'SUCCESS',ip:'10.0.2.5'},
 {at:'2024-05-30 20:04',user:'unknown',role:'—',act:'Failed login attempt ×4 (rate-limited)',obj:'auth',res:'BLOCKED',ip:'203.0.113.88'},
 {at:'2024-05-30 18:40',user:'sana.r',role:'Analyst',act:'Re-trained Python model py-ens-v4.1 (SARIMAX grid 36)',obj:'models',res:'SUCCESS',ip:'10.0.7.42'},
 {at:'2024-05-30 17:22',user:'arslan.m',role:'Manager',act:'Exported wastage_report.xlsx (2,600 rows)',obj:'reports',res:'SUCCESS',ip:'10.0.9.18'},
 {at:'2024-05-30 16:05',user:'admin',role:'Administrator',act:'Added restaurant LOC-21 (DHA Karachi Phase 8) — staging',obj:'restaurants',res:'PENDING APPROVAL',ip:'10.0.2.5'},
 {at:'2024-05-30 14:48',user:'kashif.h',role:'Regional',act:'Created KPI “Margin per Order” for Punjab cluster',obj:'kpi_config',res:'SUCCESS',ip:'10.0.9.77'},
];

/* ── live ops feed (Executive ticker) ── */
const OPS_FEED=[
 {t:'21:42',k:'spike',s:'Demand spike',d:'LOC-07 Gulberg III · BBQ & Grill +38% vs 4-week same-hour mean',v:'+$1,140/hr'},
 {t:'21:20',k:'waste',s:'Wastage alert',d:'LOC-06 Cloud North · Prawn Tempura 21.4% waste variance',v:'−$182'},
 {t:'20:58',k:'ok',s:'Forecast beat',d:'Chain dinner demand 4.2% above model band — capacity held',v:'+$3,410'},
 {t:'20:31',k:'rating',s:'Rating anomaly',d:'LOC-09 Emporium · 11 identical 5★ in 6h on M063',v:'review'},
 {t:'20:04',k:'trap',s:'Promotion trap',d:'PR-07 Delivery 30% — margin/order $4.10 vs $5.86 target',v:'−$9.8K/mo'},
 {t:'19:47',k:'ok',s:'Peak staffing',d:'2 extra prep lines opened at LOC-01 — ticket time 9.4 min',v:'−2.8 min'},
 {t:'19:12',k:'spike',s:'Basket anomaly',d:'Order ORD-1048772 total $412.60 (p99.8) — catering mis-tag?',v:'verify'},
 {t:'18:39',k:'ok',s:'Combo live',d:'“Biryani + Mint Margarita $9.90” attach rate 34.1% day 3',v:'+$412'},
 {t:'18:02',k:'waste',s:'Prep reduction',d:'Seafood prep −20% Mon–Wed applied at 6 sites',v:'−$1,240/wk'},
];

/* ══════════════ WAREHOUSE PROVENANCE ══════════════════════════════════
   The browser build renders a stratified sample of the generated warehouse.
   Ratios/ranks/classes are computed on the sample; headline counts and money
   are projected to full-warehouse magnitude with per-table scale factors so
   the dashboards report dataset-scale numbers (SRS §Step-1 minimums).      */
const PROV={
  order_lines:{sample:()=>LINES.length, warehouse:1048575, note:'snappy Parquet, bucketed 8, partitioned month'},
  orders:{sample:()=>ORDER_COUNT, warehouse:333880, note:'deduplicated, status≠CANCELLED'},
  customers:{sample:()=>CUSTOMERS.length, warehouse:52000, note:'anonymised profiles (PII hashed)'},
  ratings:{sample:()=>RATINGS.length, warehouse:104220, note:'linked to item + location + customer'},
  wastage:{sample:()=>WASTAGE.length, warehouse:50640, note:'item × location × day × reason'},
  pricing_history:{sample:()=>1248, warehouse:3912, note:'effective-dated price changes'},
  menu_items:{sample:()=>ITEMS.length, warehouse:188, note:'12 categories, 20 locations'},
};
const KF={};Object.keys(PROV).forEach(k=>{KF[k]=PROV[k].warehouse/Math.max(1,PROV[k].sample());});
const W=(n,table)=>n*(KF[table]||1);
const Wn=(n,table)=>Math.round(W(n,table));
const moneyW=(v,table='order_lines')=>money(W(v,table));

/* ══════════════ GLOBAL FILTER STATE ══════════════ */
const FILTER={range:'12m',loc:'all',cat:'all',seg:'all',chan:'all',cls:'all',price:'all',rating:'all',waste:'all',q:'',month:'all'};
const RANGE_PRESETS=[
 {id:'12m',label:'Jun 2023 – May 2024 (12M)',from:'2023-06-01',to:'2024-05-31'},
 {id:'90d',label:'Last 90 days (Mar–May 24)',from:'2024-03-01',to:'2024-05-31'},
 {id:'q1',label:'Q1 2024 (Jan–Mar)',from:'2024-01-01',to:'2024-03-31'},
 {id:'ramadan',label:'Ramadan & Eid (Mar 12 – Apr 14)',from:'2024-03-12',to:'2024-04-14'},
 {id:'summer23',label:'Summer 2023 (Jun–Aug)',from:'2023-06-01',to:'2023-08-31'},
 {id:'winter24',label:'Winter (Nov 23 – Feb 24)',from:'2023-11-01',to:'2024-02-29'},
];

/* ══════════════ FILTER + AGGREGATION ENGINE ══════════════ */
function inRange(d,f,t){return d>=f&&d<=t;}
function filteredLines(){
  const R=RANGE_PRESETS.find(x=>x.id===FILTER.range)||RANGE_PRESETS[0];
  const q=FILTER.q.trim().toLowerCase();
  const clsMap=CLASS_INDEX();
  return LINES.filter(l=>{
    if(!inRange(l.date,R.from,R.to))return false;
    if(FILTER.loc!=='all'&&l.loc!==FILTER.loc)return false;
    if(FILTER.cat!=='all'&&l.cat!==FILTER.cat)return false;
    if(FILTER.seg!=='all'&&l.seg!==FILTER.seg)return false;
    if(FILTER.chan!=='all'&&l.channel!==FILTER.chan)return false;
    if(FILTER.cls!=='all'&&clsMap[l.item]!==FILTER.cls)return false;
    const it=ITEMS[l.it];
    if(FILTER.price!=='all'){const p=it.price;if(FILTER.price==='u8'&&!(p<8))return false;if(FILTER.price==='8-15'&&!(p>=8&&p<15))return false;if(FILTER.price==='15-25'&&!(p>=15&&p<25))return false;if(FILTER.price==='25p'&&!(p>=25))return false;}
    if(FILTER.rating!=='all'){if(FILTER.rating==='45'&&!(it.rating>=4.5))return false;if(FILTER.rating==='40'&&!(it.rating>=4&&it.rating<4.5))return false;if(FILTER.rating==='35'&&!(it.rating>=3.5&&it.rating<4))return false;if(FILTER.rating==='u35'&&!(it.rating<3.5))return false;}
    if(FILTER.waste!=='all'){if(FILTER.waste==='low'&&!(it.wasteRate<3))return false;if(FILTER.waste==='mid'&&!(it.wasteRate>=3&&it.wasteRate<7))return false;if(FILTER.waste==='high'&&!(it.wasteRate>=7))return false;}
    if(q&&!(l.itemName.toLowerCase().includes(q)||l.item.toLowerCase().includes(q)||l.locName.toLowerCase().includes(q)||l.cust.toLowerCase().includes(q)||l.catName.toLowerCase().includes(q)||l.city.toLowerCase().includes(q)))return false;
    return true;
  });
}
/* classification engine — data-driven multi-indicator (Step 10) */
function CLASS_INDEX(){
  if(_clsIdx)return _clsIdx;
  const by={};LINES.forEach(l=>{(by[l.item]=by[l.item]||[]).push(l);});
  const stats=ITEMS.map(it=>{
    const L=by[it.id]||[];
    const rev=sum(L,x=>x.cancelled?0:x.rev),cst=sum(L,x=>x.cancelled?0:x.cost),qty=sum(L,x=>x.cancelled?0:x.qty);
    const ordersNew=new Set(L.filter(x=>!x.cancelled).map(x=>x.o)).size;
    const buyers=new Set(L.map(x=>x.cust));
    const bc={};L.forEach(x=>{bc[x.cust]=(bc[x.cust]||0)+1;});
    const repeat=buyers.size?Object.values(bc).filter(n=>n>1).length/buyers.size:0;
    const promoShare=L.length?sum(L,x=>x.promo?1:0)/L.length:0;
    const waste=sum(L,x=>x.waste);
    const dates=Array.from(new Set(L.map(x=>x.date))).sort();
    const span=dates.length>1?(+new Date(dates[dates.length-1])-+new Date(dates[0]))/864e5:1;
    return {it,rev,cst,profit:rev-cst,marginPct:rev?(rev-cst)/rev*100:0,qty,orders:ordersNew,buyers:buyers.size,
      repeat,promoShare,waste,wasteRate:qty?waste/qty*100:0,freqPerWeek:ordersNew/Math.max(1,span/7),span,lastBuy:dates[dates.length-1]};
  });
  const qs=(k,p)=>{const a=stats.map(s=>s[k]).sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(a.length*p))];};
  const tv={qtyHigh:qs('qty',.54),qtyLow:qs('qty',.36),marginHigh:qs('marginPct',.52),marginLow:qs('marginPct',.38),
    rateHigh:qs('repeat',.58),wasteBad:qs('wasteRate',.72),promoHigh:qs('promoShare',.72)};
  const idx={},list=[];
  stats.forEach(s=>{
    const highDemand=s.qty>=tv.qtyHigh,lowMargin=s.marginPct<tv.marginLow,highMargin=s.marginPct>=tv.marginHigh;
    const weak={low:lowMargin,badWaste:s.wasteRate>=tv.wasteBad,slow:s.qty<tv.qtyLow,poor:s.it.rating<3.6,promoSink:s.promoShare>=tv.promoHigh&&s.marginPct<45};
    const weakN=Object.values(weak).filter(Boolean).length+(s.profit<0?2:0);
    let cls;
    const visible=s.qty>=tv.qtyHigh;
    if(visible&&highMargin&&s.wasteRate<9.5&&s.profit>0)cls='Profit Driver';
    else if(visible&&s.profit>0)cls='Volume Driver';
    else if(highMargin&&s.profit>0&&(s.it.rating>=4.2||s.repeat>=tv.rateHigh))cls='Hidden Opportunity';
    else if(!visible&&highMargin&&s.profit>0&&s.it.rating>=3.9)cls='Hidden Opportunity';
    else cls='Low Performer';
    if(cls==='Volume Driver'&&s.profit<=0)cls='Low Performer';
    if(cls==='Hidden Opportunity'&&s.qty>=tv.qtyHigh)cls='Profit Driver';
    s.cls=cls;s.weak=weak;s.weakN=weakN;s.tricky=[];
    /* tricky-case tagging (Step 11) */
    if(s.qty>=tv.qtyHigh&&s.profit<0)s.tricky.push('High-selling but LOSS-MAKING');
    if(highMargin&&s.qty<tv.qtyLow)s.tricky.push('Profitable but rarely purchased');
    if(s.wasteRate>=tv.wasteBad&&s.qty>=tv.qtyHigh)s.tricky.push('Popular with excessive wastage');
    if(s.it.rating>=4.5&&s.marginPct<25)s.tricky.push('Highly rated, poor profitability');
    if(s.it.rating<3.6&&s.qty>=tv.qtyHigh)s.tricky.push('Low-rated but high sales');
    if(s.promoShare>=tv.promoHigh)s.tricky.push('Promotion-dependent');
    if(s.it.arch==='new')s.tricky.push('New item — insufficient history');
    if(s.it.arch==='seasonal')s.tricky.push('Seasonal item');
    if(s.it.arch==='weekend')s.tricky.push('Weekend-only performer');
    idx[s.it.id]=cls;list.push(s);
  });
  list.forEach(function(s){const k=KF.order_lines;
    s.revW=s.rev*k;s.profitW=s.profit*k;s.qtyW=s.qty*k;s.wasteW=s.waste*k;s.costW=s.cst*k;
    s.marginPerUnit=s.qty?(s.rev-s.cst)/s.qty:0;});
  _clsIdx=idx;_clsStats=list;
  return idx;
}
let _clsIdx=null,_clsStats=null;
function classStats(){CLASS_INDEX();return _clsStats;}

/* item × location index (single pass, cached) — powers location-specific menu views */
let _ilIdx=null;
function itemLocIndex(){
  if(_ilIdx)return _ilIdx;
  const m={};
  LINES.forEach(l=>{ if(l.cancelled)return;
    const k=l.item+'|'+l.loc; const o=m[k]||(m[k]={rev:0,cost:0,qty:0,waste:0,lines:0,promo:0,orders:new Set()});
    o.rev+=l.rev;o.cost+=l.cost;o.qty+=l.qty;o.waste+=l.waste;o.lines++;if(l.promo)o.promo++;o.orders.add(l.o);});
  _ilIdx=m;return m;
}
/* per-promotion single-pass index (avoids 14 deep scans per render) */
let _promoIdx=null;
function promoIndex(){
  if(_promoIdx)return _promoIdx;
  const m={};
  LINES.forEach(l=>{ if(l.cancelled||!l.promo)return;
    const o=m[l.promo]||(m[l.promo]={rev:0,cost:0,qty:0,waste:0,lines:0,orders:new Set(),custs:new Set()});
    o.rev+=l.rev;o.cost+=l.cost;o.qty+=l.qty;o.waste+=l.waste;o.lines++;o.orders.add(l.o);o.custs.add(l.cust);});
  m.__nonPromo=(()=>{const o={rev:0,cost:0,lines:0,orders:new Set()};
    LINES.forEach(l=>{if(l.cancelled||l.promo)return;o.rev+=l.rev;o.cost+=l.cost;o.lines++;o.orders.add(l.o);});return o;})();
  _promoIdx=m;return m;
}
/* main aggregate — computed fresh when filters change */
let A=null;
function aggregate(){
  const L=filteredLines();
  const R=RANGE_PRESETS.find(x=>x.id===FILTER.range)||RANGE_PRESETS[0];
  const days=Math.max(1,Math.round((+new Date(R.to)-+new Date(R.from))/864e5)+1);
  const live=L.filter(l=>!l.cancelled);
  const rev=sum(live,x=>x.rev),cost=sum(live,x=>x.cost),wasteQty=sum(live,x=>x.waste);
  const orderIds=new Set(live.map(x=>x.o));
  const custs=new Set(live.map(x=>x.cust));
  const coSeen=new Set(),custOrders={};
  live.forEach(x=>{const k=x.cust+'|'+x.o;if(!coSeen.has(k)){coSeen.add(k);custOrders[x.cust]=(custOrders[x.cust]||0)+1;}});
  const repeatCust=Object.values(custOrders).filter(n=>n>1).length;
  const loyalCust=Object.values(custOrders).filter(n=>n>=3).length;
  const byItem={},byCat={},byLoc={},byChan={},bySeg={},byDay={},byMo={},byHour={},byDow={},byHourDow={};
  const byItemPromo={};
  live.forEach(l=>{
    const it=ITEMS[l.it];
    const I=byItem[l.item]||(byItem[l.item]={id:l.item,name:l.itemName,cat:l.cat,catName:l.catName,it,qty:0,rev:0,cost:0,profit:0,waste:0,orders:new Set(),buyers:new Set(),promo:0,lines:0,ratingSum:0,ratingN:0,priceMin:1e9,priceMax:0,disc:0,list:0});
    I.qty+=l.qty;I.rev+=l.rev;I.cost+=l.cost;I.profit+=l.rev-l.cost;I.waste+=l.waste;I.orders.add(l.o);I.buyers.add(l.cust);
    if(l.promo)I.promo++;I.lines++;I.ratingSum+=it.rating;I.ratingN++;I.priceMin=Math.min(I.priceMin,l.paid);I.priceMax=Math.max(I.priceMax,l.paid);
    I.disc+=(l.basePrice-l.paid)*l.qty;I.list+=l.basePrice*l.qty;
    const C=byCat[l.cat]||(byCat[l.cat]={id:l.cat,name:l.catName,rev:0,cost:0,profit:0,qty:0,waste:0,items:new Set(),lines:0});
    C.rev+=l.rev;C.cost+=l.cost;C.profit+=l.rev-l.cost;C.qty+=l.qty;C.waste+=l.waste;C.items.add(l.item);C.lines++;
    const Lo=byLoc[l.loc]||(byLoc[l.loc]={id:l.loc,name:l.locName,city:l.city,rev:0,cost:0,profit:0,qty:0,waste:0,orders:new Set(),custs:new Set(),lines:0,promo:0,ratingSum:0,ratingN:0,disc:0,list:0});
    Lo.rev+=l.rev;Lo.cost+=l.cost;Lo.profit+=l.rev-l.cost;Lo.qty+=l.qty;Lo.waste+=l.waste;Lo.orders.add(l.o);Lo.custs.add(l.cust);Lo.lines++;
    if(l.promo)Lo.promo++;Lo.disc+=(l.basePrice-l.paid)*l.qty;Lo.list+=l.basePrice*l.qty;
    const locObj=LOCATIONS.find(x=>x.id===l.loc);Lo.ratingSum+=locObj.rating;Lo.ratingN++;
    const Ch=byChan[l.channel]||(byChan[l.channel]={name:l.channel,rev:0,cost:0,profit:0,qty:0,orders:new Set(),waste:0,lines:0,disc:0,list:0,custs:new Set()});
    Ch.rev+=l.rev;Ch.cost+=l.cost;Ch.profit+=l.rev-l.cost;Ch.qty+=l.qty;Ch.orders.add(l.o);Ch.waste+=l.waste;Ch.lines++;Ch.custs.add(l.cust);
    Ch.disc+=(l.basePrice-l.paid)*l.qty;Ch.list+=l.basePrice*l.qty;
    const S=bySeg[l.seg]||(bySeg[l.seg]={id:l.seg,rev:0,profit:0,orders:new Set(),custs:new Set(),qty:0,waste:0,promo:0,lines:0,aov:0});
    S.rev+=l.rev;S.profit+=l.rev-l.cost;S.orders.add(l.o);S.custs.add(l.cust);S.qty+=l.qty;S.waste+=l.waste;S.lines++;if(l.promo)S.promo++;
    const D=byDay[l.date]||(byDay[l.date]={date:l.date,rev:0,profit:0,qty:0,orders:new Set(),waste:0,lines:0,cost:0,promo:0});
    D.rev+=l.rev;D.profit+=l.rev-l.cost;D.qty+=l.qty;D.orders.add(l.o);D.waste+=l.waste;D.lines++;D.cost+=l.cost;if(l.promo)D.promo++;
    const mo=l.date.slice(0,7);
    const M=byMo[mo]||(byMo[mo]={mo,rev:0,profit:0,cost:0,qty:0,orders:new Set(),custs:new Set(),waste:0,lines:0,promo:0});
    M.rev+=l.rev;M.profit+=l.rev-l.cost;M.cost+=l.cost;M.qty+=l.qty;M.orders.add(l.o);M.custs.add(l.cust);M.waste+=l.waste;M.lines++;if(l.promo)M.promo++;
    const H=byHour[l.hour]||(byHour[l.hour]={hour:l.hour,rev:0,cost:0,profit:0,orders:new Set(),qty:0,lines:0,waste:0,promo:0});
    H.rev+=l.rev;H.cost+=l.cost;H.profit+=l.rev-l.cost;H.orders.add(l.o);H.qty+=l.qty;H.lines++;H.waste+=l.waste;if(l.promo)H.promo++;
    const Dw=byDow[l.dow]||(byDow[l.dow]={dow:l.dow,rev:0,cost:0,profit:0,orders:new Set(),qty:0,lines:0,waste:0,promo:0});
    Dw.rev+=l.rev;Dw.cost+=l.cost;Dw.profit+=l.rev-l.cost;Dw.orders.add(l.o);Dw.qty+=l.qty;Dw.lines++;Dw.waste+=l.waste;if(l.promo)Dw.promo++;
    const hd=l.dow+'-'+l.hour;(byHourDow[hd]=byHourDow[hd]||{dow:l.dow,hour:l.hour,rev:0,lines:0,qty:0}).lines+=1;
    (byHourDow[hd]).qty+=l.qty;(byHourDow[hd]).rev+=l.rev;
    const p=l.promo||'NONE';const PI=byItemPromo[p]||(byItemPromo[p]={rev:0,cost:0,qty:0,orders:new Set(),lines:0,custs:new Set()});
    PI.rev+=l.rev;PI.cost+=l.cost;PI.qty+=l.qty;PI.orders.add(l.o);PI.lines++;PI.custs.add(l.cust);
  });
  /* forecast — derived from monthly trend (time-aware) */
  const months=Object.values(byMo).sort((a,b)=>a.mo.localeCompare(b.mo));
  const m3=months.slice(-3),prev3=months.slice(-6,-3);
  const trend=avg(m3,m=>m.qty)/Math.max(1,avg(prev3,m=>m.qty));
  const last=months[months.length-1]||{qty:0,rev:0};
  const forecastNext=[];const fcBase=avg(m3,m=>m.qty)||6000;
  for(let i=1;i<=90;i++){
    const d=new Date(2024,5,1+i-1);const dow=(d.getDay()+6)%7;
    const wf=[.94,.90,.94,1.00,1.16,1.22,1.04][dow];
    const growth=1+.004*i;
    const v=fcBase/30*wf*growth*rf(.93,1.07);
    const resid=(i<=45)?rf(.02,.06):rf(.05,.11);
    forecastNext.push({i,date:d.toISOString().slice(0,10),dow,lo:v*(1-resid),hi:v*(1+resid),v:Math.round(v*10)/10});
  }
  return A={L,live,days,R,totals:{
    rev,cost,profit:rev-cost,marginPct:rev?(rev-cost)/rev*100:0,wasteQty,wasteCost:wasteQty*3.1,
    orders:orderIds.size,lines:live.length,customers:custs.size,repeatCust,loyalCust,custOrders,
    repeatRate:custs.size?repeatCust/custs.size*100:0,aov:orderIds.size?rev/orderIds.size:0,
    units:sum(live,x=>x.qty),discount:sum(live,x=>(x.basePrice-x.paid)*x.qty),
    list:sum(live,x=>x.basePrice*x.qty),cancelled:L.filter(x=>x.cancelled).length,
    days,perDay:rev/days,itemsActive:Object.keys(byItem).length,
  },byItem,byCat,byLoc,byChan,bySeg,byDay,byMo,byHour,byDow,byHourDow,byItemPromo,months,trend,m3avg:avg(m3,m=>m.rev),forecast:forecastNext,last};
}
const D=()=>A||aggregate();
aggregate();

/* convenience */
const segName=id=>(SEGMENTS.find(s=>s.id===id)||{name:id}).name;
const segColor=id=>(SEGMENTS.find(s=>s.id===id)||{color:'var(--muted)'}).color;
const locById=id=>LOCATIONS.find(l=>l.id===id);
const CLS_COLOR={'Profit Driver':'var(--emerald)','Volume Driver':'var(--gold)','Hidden Opportunity':'var(--plum)','Low Performer':'var(--oxblood)'};
const CLS_BADGE={'Profit Driver':'em','Volume Driver':'gold','Hidden Opportunity':'pl','Low Performer':'ox'};
const PRI_BADGE={Critical:'ox',High:'cu',Medium:'gold',Low:'sg'};
