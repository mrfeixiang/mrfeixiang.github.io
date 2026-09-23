/* SyFlow Order browser solver. No external packages or network calls. */
(function (root) {
'use strict';
const FIELDS=['candidate_id','smiles','vendor','supplier_group','price_krw','vendor_fee_krw','group_fee_krw','quantity_mg','purity_pct','lead_days','match_status'];
function numeric(value, label, min=0) {
  if (value===null || value===undefined || String(value).trim()==='') throw Error('Missing '+label);
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>1e12) throw Error('Invalid '+label);
  return n;
}
function parseCSV(text) {
  let out=[], row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()!==''))out.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw Error('Unclosed CSV quote');
  row.push(field);if(row.some(x=>x.trim()!==''))out.push(row);
  const header=(out.shift()||[]).map(x=>x.trim().replace(/^\uFEFF/,''));
  if(header.length!==new Set(header).size)throw Error('Duplicate CSV header');
  if(FIELDS.some(f=>!header.includes(f)))throw Error('Required CSV columns are missing');
  return out.map((r,i)=>{if(r.length!==header.length)throw Error('CSV row '+(i+2)+' has a different number of cells');return Object.fromEntries(header.map((h,j)=>[h,r[j]]));});
}
function optimize(payload, limits={}) {
  if(!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>10000)throw Error('Provide 1 to 10,000 quote rows');
  const vendorFees=new Map(),groupFees=new Map(),candidates=new Map();
  const rows=payload.rows.map((input,i)=>{
    if(!input||FIELDS.some(f=>input[f]===undefined||input[f]===null))throw Error('Row '+(i+1)+': required columns are missing');
    const r=Object.fromEntries(FIELDS.map(f=>[f,String(input[f]).trim()]));
    for(const f of FIELDS.slice(0,4))if(!r[f])throw Error('Row '+(i+1)+': '+f+' is empty');
    for(const f of FIELDS.slice(4,10))r[f]=numeric(r[f],f);
    if(r.quantity_mg<=0||r.purity_pct>100)throw Error('Invalid quantity or purity');
    if(!['exact_confirmed','review','mismatch'].includes(r.match_status))throw Error('Invalid match_status');
    if(candidates.has(r.candidate_id)&&candidates.get(r.candidate_id)!==r.smiles)throw Error('Conflicting SMILES for '+r.candidate_id);
    candidates.set(r.candidate_id,r.smiles);
    const g=JSON.stringify([r.vendor,r.supplier_group]);
    if(vendorFees.has(r.vendor)&&vendorFees.get(r.vendor)!==r.vendor_fee_krw)throw Error('Inconsistent vendor fee: '+r.vendor);
    if(groupFees.has(g)&&groupFees.get(g)!==r.group_fee_krw)throw Error('Inconsistent group fee: '+r.supplier_group);
    vendorFees.set(r.vendor,r.vendor_fee_krw);groupFees.set(g,r.group_fee_krw);
    return {...r,groupKey:g,row_number:i+1};
  });
  if(candidates.size>2000)throw Error('MVP limit: 2,000 candidates');
  const o=payload.options||{};
  const purity=numeric(o.min_purity??95,'minimum purity'),quantity=numeric(o.min_quantity??5,'minimum quantity'),lead=numeric(o.max_lead??21,'maximum lead time'),cap=numeric(o.max_vendors??3,'maximum channels');
  if(purity>100||quantity<=0||cap<1||cap>100||!Number.isInteger(cap))throw Error('Purchase settings are outside supported ranges');
  const eligible=rows.filter(r=>r.match_status==='exact_confirmed'&&r.purity_pct>=purity&&r.quantity_mg>=quantity&&r.lead_days<=lead);
  const ids=[...candidates.keys()].sort(), byId=ids.map(id=>eligible.filter(r=>r.candidate_id===id));
  const meta={candidate_count:ids.length,eligible_count:eligible.length};
  const missing=ids.filter((id,i)=>!byId[i].length);
  if(missing.length)return {...meta,status:'missing',missing};
  const cost=selected=>{
    const vs=new Set(selected.map(r=>r.vendor)),gs=new Set(selected.map(r=>r.groupKey));
    const compound=selected.reduce((s,r)=>s+r.price_krw,0),vf=[...vs].reduce((s,v)=>s+vendorFees.get(v),0),gf=[...gs].reduce((s,g)=>s+groupFees.get(g),0);
    return {compound_krw:compound,vendor_fees_krw:vf,group_fees_krw:gf,total_krw:compound+vf+gf,vendor_count:vs.size,group_count:gs.size};
  };
  const cheapest=list=>list.reduce((a,b)=>a.price_krw<=b.price_krw?a:b);
  const baselineRows=byId.map(cheapest),baseline=cost(baselineRows);
  let best=null,bestCost=Infinity;
  function consider(selected){const c=cost(selected);if(c.vendor_count<=cap&&c.total_krw<bestCost){best=selected.slice();bestCost=c.total_krw;}}
  consider(baselineRows);
  for(const v of vendorFees.keys()){const sets=byId.map(rs=>rs.filter(r=>r.vendor===v));if(sets.every(rs=>rs.length))consider(sets.map(cheapest));}
  // Branch on paid supplier groups. At each complete subset, the cheapest
  // eligible offer per candidate is exact because activation fees are fixed.
  const grouped=new Map();for(const r of eligible){if(!grouped.has(r.groupKey))grouped.set(r.groupKey,[]);grouped.get(r.groupKey).push(r);}
  const groups=[...grouped.entries()].sort((a,b)=>new Set(b[1].map(r=>r.candidate_id)).size-new Set(a[1].map(r=>r.candidate_id)).size);
  if(groups.length>100)throw Error('Browser MVP limit: 100 supplier groups');
  const position=new Map(groups.map(([g],i)=>[g,i]));
  const start=Date.now(),timeLimit=limits.timeMs??10000,nodeLimit=limits.nodes??250000;
  let visited=0,timedOut=false;
  function visit(at,active,vs,fees){
    if(++visited>nodeLimit||Date.now()-start>timeLimit){timedOut=true;return;}
    if(fees>=bestCost)return;
    const possible=byId.map(rs=>rs.filter(r=>active.has(r.groupKey)||(position.get(r.groupKey)>=at&&(vs.has(r.vendor)||vs.size<cap))));
    if(possible.some(rs=>!rs.length))return;
    const lower=fees+possible.reduce((s,rs)=>s+cheapest(rs).price_krw,0);
    if(lower>=bestCost-1e-8)return;
    const chosen=byId.map(rs=>rs.filter(r=>active.has(r.groupKey)));
    if(chosen.every(rs=>rs.length))consider(chosen.map(cheapest));
    if(at===groups.length)return;
    const [key,offers]=groups[at],vendor=offers[0].vendor;
    if(vs.has(vendor)||vs.size<cap){
      const nextActive=new Set(active);nextActive.add(key);
      const nextVs=new Set(vs);nextVs.add(vendor);
      visit(at+1,nextActive,nextVs,fees+groupFees.get(key)+(vs.has(vendor)?0:vendorFees.get(vendor)));
    }
    if(!timedOut)visit(at+1,active,vs,fees);
  }
  visit(0,new Set(),new Set(),0);
  if(!best)return {...meta,baseline,status:timedOut?'search_limit':'infeasible'};
  const optimized=cost(best);
  return {...meta,status:timedOut?'feasible_unproven':'optimal',baseline,optimized,savings_krw:baseline.total_krw-optimized.total_krw,assignments:best,visited_nodes:visited,
    vendors:[...new Set(best.map(r=>r.vendor))].sort().map(name=>({name,items:best.filter(r=>r.vendor===name).length}))};
}
const api={optimize,parseCSV};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.SyFlow=api;
})(typeof self!=='undefined'?self:this);
