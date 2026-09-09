import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { test, after } from 'node:test';
const sql=text=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const actors=[1,2,3,4,5].map(n=>`00000000-0000-0000-0000-00000000000${n}`);
const ids=[1,2].map(n=>`20000000-0000-0000-0000-00000000000${n}`);
const gp=sql("select id from stores where code='GP'");const bm=sql("select id from stores where code='BM'");
const secret='isolated-fixture-secret-never-use-in-production';
const token=actor=>{const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const value=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:actor,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}`;return `${value}.${createHmac('sha256',secret).update(value).digest('base64url')}`;};
const tokens=actors.map(token);
async function api(path,actor=0,options={}){
 const response=await fetch(`http://127.0.0.1:55440/${path}`,{...options,headers:{...(actor===null?{}:{Authorization:`Bearer ${tokens[actor]}`}),...options.headers}});
 return {status:response.status,data:await response.json()};
}
sql(`insert into reports(id,store_id,report_type,report_date,file_path,status) values('${ids[0]}','${gp}','sales','2026-05-01','http/gp.xlsx','processed'),('${ids[1]}','${bm}','sales','2026-05-01','http/bm.xlsx','processed');insert into storage.objects(bucket_id,name) values('reports','http/gp.xlsx'),('reports','http/bm.xlsx');`);
after(()=>sql(`update profiles set is_active=true where id='${actors[1]}';delete from reports where id in('${ids.join("','")}');delete from storage.objects where name in('http/gp.xlsx','http/bm.xlsx');`));
for(const [actor,expected] of [[0,2],[1,1],[2,1],[3,0],[4,0]])test(`H03/H04 real PostgREST JWT scope for disposable actor ${actor+1}`,async()=>{
 const reports=await api(`reports?select=id&id=in.(${ids.join(',')})`,actor);assert.equal(reports.status,200);assert.equal(reports.data.length,expected);
 const objects=await api('objects?select=name&name=in.(http/gp.xlsx,http/bm.xlsx)',actor,{headers:{'Accept-Profile':'storage'}});assert.equal(objects.status,200);assert.equal(objects.data.length,expected);
});
test('H04 same JWT loses direct HTTP access immediately after profile deactivation',async()=>{
 const path=`reports?select=id&id=eq.${ids[0]}`;
 assert.equal((await api(path,1)).data.length,1);
 try{sql(`update profiles set is_active=false where id='${actors[1]}'`);assert.deepEqual((await api(path,1)).data,[]);}finally{sql(`update profiles set is_active=true where id='${actors[1]}'`);}
});
test('H03/H01 cross-store and anonymous HTTP RPC requests are denied',async()=>{
 const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_store_ids:[bm],p_start:'2026-05-01',p_end:'2026-05-01'})};
 assert.equal((await api('rpc/analytics_data',1,options)).status,400);
 const anonymous=await api('rpc/analytics_data',null,options);assert.ok([401,403].includes(anonymous.status));
});
