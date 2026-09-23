const assert=require('node:assert/strict');
const fs=require('node:fs');
const {optimize,parseCSV}=require('./optimizer.js');
const rows=parseCSV(fs.readFileSync(__dirname+'/sample_quotes.csv','utf8'));
const sample=optimize({rows});
assert.equal(sample.status,'optimal');
assert.equal(sample.optimized.total_krw,1081500);
assert.equal(sample.baseline.total_krw,1584000);
assert.equal(sample.assignments.length,12);
assert.equal(optimize({rows:rows.map(r=>({...r,match_status:r.candidate_id==='SY-002'?'review':r.match_status}))}).status,'missing');
assert.equal(optimize({rows:rows.filter(r=>r.vendor!=='Mcule'),options:{max_vendors:1}}).status,'infeasible');
assert.throws(()=>optimize({rows:rows.map((r,i)=>({...r,price_krw:i===0?'':r.price_krw}))}));
let seed=20260923;
const rand=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
for(let test=0;test<50;test++){
  const vfees=[rand(120),rand(120),rand(120)],gfees=[rand(40),rand(40),rand(40)];
  const generated=[];
  for(let i=0;i<5;i++)for(let v=0;v<3;v++)generated.push({candidate_id:'C'+i,smiles:'C'.repeat(i+1),vendor:'V'+v,supplier_group:'G'+(i%2),price_krw:rand(200)+1,vendor_fee_krw:vfees[v],group_fee_krw:gfees[v],quantity_mg:10,purity_pct:98,lead_days:7,match_status:'exact_confirmed'});
  const cap=1+rand(3);let truth=Infinity;
  for(let assignment=0;assignment<243;assignment++){
    let x=assignment,price=0;const vs=new Set(),gs=new Map();
    for(let i=0;i<5;i++){const v=x%3;x=Math.floor(x/3);const r=generated[i*3+v];price+=r.price_krw;vs.add(v);gs.set(v+':'+(i%2),v);}
    if(vs.size>cap)continue;
    price+=[...vs].reduce((s,v)=>s+vfees[v],0)+[...gs.values()].reduce((s,v)=>s+gfees[v],0);
    truth=Math.min(truth,price);
  }
  const result=optimize({rows:generated,options:{max_vendors:cap}});
  assert.equal(result.status,'optimal');assert.equal(result.optimized.total_krw,truth,'Exhaustive comparison '+test);
}
console.log('PASS: sample parity, missing quotes, vendor cap, invalid input, 50 exhaustive reference comparisons');
