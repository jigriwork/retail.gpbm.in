import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

function analyticsFixture(count, baseline = false) {
  const f=fixture({role:'owner',baseline});
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  f.db.stock_rows=Array.from({length:count},(_,i)=>({id:`stock-${i}`,store_id:'gp',stock_month:'2026-09-01',item_name:`Item ${i%128}`,brand:'Brand',category:'Category',sku:`SKU${i%128}`,barcode:null,size:'M',color:'Blue',quantity:i%7,mrp:100.25}));
  f.db.sales_rows=Array.from({length:count},(_,i)=>({id:`sale-${i}`,store_id:'gp',sale_date:today,bill_no:String(i%100),item_name:`Item ${i%128}`,brand:'Brand',category:'Category',sku:`SKU${i%128}`,barcode:null,size:'M',color:'Blue',quantity:i%10===0?-1:1,net_sale:i%10===0?-100.25:100.25,staff_name:'Alice',source_row_count:1}));
  f.db.reports=[{id:'sales',store_id:'gp',report_type:'sales',report_date:today,status:'processed',is_current:true},{id:'stock',store_id:'gp',report_type:'stock',period_month:'2026-09-01',status:'processed',is_current:true},{id:'stock-bm',store_id:'bm',report_type:'stock',period_month:'2026-09-01',status:'processed',is_current:true}];
  const rpc=f.client.rpc;
  f.client.rpc=async(name,args)=>{
    if(name!=='analytics_data')return rpc(name,args);
    f.calls.push({operation:'rpc',name});
    const sales=f.db.sales_rows.filter(row=>args.p_store_ids.includes(row.store_id)&&row.sale_date>=args.p_start&&row.sale_date<=args.p_end);
    const stock=f.db.stock_rows.filter(row=>args.p_store_ids.includes(row.store_id)&&args.p_months.includes(row.stock_month));
    return {error:null,data:{sales,stock,aliases:[],sales_row_count:sales.length,stock_row_count:stock.length}};
  };
  return {...f,today};
}
for(const count of [999,1000,1001,23209,38129]) {
 test(`H01 sales/stock/staff/business results reconcile all ${count} rows`,async()=>{
  const f=analyticsFixture(count);
  const filters={storeIds:['gp'],dateRange:{startDate:f.today,endDate:f.today}};
  const sales=f.load('@/lib/analytics/sales');
  const summary=await sales.getSalesSummary(filters,f.db.stores);
  const staff=await sales.getStaffSalesSummary(filters);
  const expected=f.db.sales_rows.reduce((n,row)=>n+row.net_sale,0);
  assert.equal(summary.totalNetSale,expected);assert.equal(summary.rowCount,count);assert.equal(summary.topBrands[0].totalSale,expected);
  assert.equal(staff[0].totalSale,expected);assert.equal(summary.billCount,Math.min(count,100));
  const stock=await f.load('@/lib/analytics/stock').getStockSummary({storeIds:['gp'],stockMonth:'2026-09-01',lookbackDays:30,stores:f.db.stores});
  const expectedStock=f.db.stock_rows.reduce((n,row)=>n+row.quantity,0);
  assert.equal(stock.totalStockQuantity,expectedStock);
  assert.equal(stock.totalStockMrpValue,expectedStock*100.25);
  const business=await f.load('@/lib/analytics/business').getBusinessReport({storeIds:['gp'],period:'custom',startDate:f.today,endDate:f.today,brand:'',category:'',size:'',itemSearch:''},f.db.stores);
  assert.equal(business.summary.netSales,expected);assert.equal(business.summary.stockQuantity,expectedStock);
  assert.ok(!('sales_rows' in business));assert.ok(!('stock_rows' in business));
 });
}
test('H01 RPC failure produces an error rather than zero/partial analytics',async()=>{
 const f=analyticsFixture(1001);f.client.rpc=async()=>({data:null,error:{message:'Fixture outage'}});
 await assert.rejects(f.load('@/lib/analytics/sales').getSalesSummary({storeIds:['gp'],dateRange:{startDate:f.today,endDate:f.today}},f.db.stores),/unavailable/);
 await assert.rejects(f.load('@/lib/analytics/stock').getStockSummary({storeIds:['gp'],stockMonth:'2026-09-01',lookbackDays:30,stores:f.db.stores}),/unavailable/);
});
for(const scenario of ['error','missing count','changing count','short response']) {
 test(`H01 deterministic detail pagination detects ${scenario}`,async()=>{
  const f=fixture();let calls=0;
  const query={order(){return this;},async range(){calls++;
    if(scenario==='error')return {data:null,error:{message:'fail'},count:1001};
    if(scenario==='missing count')return {data:[],error:null,count:null};
    if(scenario==='changing count')return {data:Array(1000).fill({}),error:null,count:calls===1?1001:1002};
    return {data:[],error:null,count:1001};
  }};
  await assert.rejects(f.load('@/lib/supabase/complete-query').completeQuery(query));
 });
}
test('H01 detail retrieval tolerates a smaller server page cap without truncation',async()=>{
 const f=fixture();const all=Array.from({length:1001},(_,id)=>({id}));
 const query={order(){return this;},async range(start){return {data:all.slice(start,start+500),error:null,count:all.length};}};
 assert.deepEqual(Array.from((await f.load('@/lib/supabase/complete-query').completeQuery(query)).data,row=>row.id),all.map(row=>row.id));
});
test('H01 measured request fan-out before/after on identical fixtures',async()=>{
 const rows=[];
 for(const baseline of [true,false]){
  const f=analyticsFixture(1001,baseline);
  let started=performance.now();
  const stock=await f.load('@/lib/analytics/stock').getStockSummary({storeIds:['gp'],stockMonth:'2026-09-01',lookbackDays:30,stores:f.db.stores});
  rows.push({version:baseline?'before':'after',flow:'stock summary',requests:f.calls.length,ms:Math.round(performance.now()-started),quantity:stock.totalStockQuantity});
  const w=analyticsFixture(1001,baseline);started=performance.now();
  await w.load('@/lib/audit/weekly').getWeeklyAuditSummaries(w.db.stores,{startDate:w.today,endDate:w.today});
  rows.push({version:baseline?'before':'after',flow:'weekly audit (two stores)',requests:w.calls.length,ms:Math.round(performance.now()-started)});
 }
 const oldStock=rows.find(r=>r.version==='before'&&r.flow==='stock summary');
 const newStock=rows.find(r=>r.version==='after'&&r.flow==='stock summary');
 assert.equal(oldStock.requests,12);assert.equal(newStock.requests,1);
 assert.ok(rows.find(r=>r.version==='after'&&r.flow.startsWith('weekly')).requests<rows.find(r=>r.version==='before'&&r.flow.startsWith('weekly')).requests);
 console.log('PERFORMANCE_FIXTURE',JSON.stringify(rows));
});
test('H01 dashboard and AI stock counts include candidates beyond the ten displayed',async()=>{
 const f=analyticsFixture(1001);f.db.sales_rows=[];
 const summary=await f.load('@/lib/analytics/stock').getStockSummary({storeIds:['gp'],stockMonth:'2026-09-01',lookbackDays:30,stores:f.db.stores});
 assert.equal(summary.candidateCounts.dead,128);
 assert.equal(summary.candidateCounts.slow,128);
 assert.equal(summary.deadStockCandidates.length,10);
 assert.equal(summary.slowStockCandidates.length,10);
});
