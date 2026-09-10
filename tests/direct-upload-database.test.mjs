import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const sql=q=>execFileSync('psql',['-XqAt','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const owner='00000000-0000-0000-0000-000000000001',manager='00000000-0000-0000-0000-000000000002';
const gp=sql("select id from stores where code='GP'");const bm=sql("select id from stores where code='BM'");
const as=id=>`set local request.jwt.claim.sub='${id}';set local role authenticated;`;
const create=`select create_upload_intent('${gp}','sales','fixture.csv','text/csv',100,'${'a'.repeat(64)}') as intent \\gset
select :'intent'::jsonb->>'id' id,:'intent'::jsonb->>'file_path' path \\gset\n`;
const uploaded=`insert into storage.objects(bucket_id,name,metadata) values('reports',:'path','{"size":100,"mimetype":"text/csv"}');`;
const check=q=>`do $$begin if not (${q}) then raise exception 'Fixture assertion';end if;end$$;`;
test('Intent created by active manager permits only canonical path and exact object metadata',()=>{
 sql(`begin;${as(manager)}${create}${uploaded}${check("(select status='uploaded' from upload_intents limit 1)")}rollback;`);
});
for(const [name,request]of [['cross-store',`create_upload_intent('${bm}','sales','fixture.csv','text/csv',100,'${'a'.repeat(64)}')`],['manager payroll',`create_upload_intent('${gp}','payroll','fixture.csv','text/csv',100,'${'a'.repeat(64)}')`],['oversized',`create_upload_intent('${gp}','sales','fixture.csv','text/csv',15728641,'${'a'.repeat(64)}')`],['bad MIME',`create_upload_intent('${gp}','sales','fixture.csv','text/html',100,'${'a'.repeat(64)}')`]])test(`Database denies ${name} intent`,()=>{
 assert.throws(()=>sql(`begin;${as(manager)}select ${request};rollback;`));
});
for(const state of ['inactive','unassigned'])test(`Database rejects ${state} intent actor`,()=>{
 const setup=state==='inactive'?`update profiles set is_active=false where id='${manager}';`:`delete from store_users where user_id='${manager}';`;
 assert.throws(()=>sql(`begin;${setup}${as(manager)}${create}rollback;`));
});
test('Expired intent cannot authorize Storage insert',()=>{
 assert.throws(()=>sql(`begin;${as(manager)}${create}reset role;update upload_intents set expires_at=now()-interval '1 second';${as(manager)}${uploaded}rollback;`));
});
test('Uploaded object with different size is rejected in its Storage transaction',()=>{
 assert.throws(()=>sql(`begin;${as(manager)}${create}${uploaded.replace('"size":100','"size":101')}rollback;`));
});
test('Anonymous and authenticated users cannot invoke privileged claim/verify/bind/finish',()=>{
 for(const role of ['anon','authenticated'])for(const fn of ['claim_upload_intent(uuid,uuid,text,text)','verify_upload_intent(uuid,uuid,text)','bind_upload_import(uuid,uuid,uuid,boolean)','finish_upload_intent(uuid,uuid,boolean,jsonb)'])assert.equal(sql(`select has_function_privilege('${role}','public.${fn}','EXECUTE')`),'f');
});
test('Claims lock concurrent attempts and consumed intents cannot publish again',()=>{
 sql(`begin;${as(owner)}${create}${uploaded}reset role;
 select claim_upload_intent(:'id','${owner}','sales','request') as claimed \\gset
 select :'claimed'::jsonb->>'lease_id' lease \\gset
 select set_config('fixture.intent',:'id',true);
 do $$begin perform claim_upload_intent(current_setting('fixture.intent')::uuid,'${owner}','sales','request');raise exception 'Expected lease denial' using errcode='XX001';exception when sqlstate 'XX001' then raise;when others then null;end$$;
 select verify_upload_intent(:'id',:'lease','${'a'.repeat(64)}');select finish_upload_intent(:'id',:'lease',true,'{"ok":true,"message":"done"}');
 ${check("(select status='processed' from upload_intents limit 1)")}
 select claim_upload_intent(:'id','${owner}','sales','request');rollback;`);
});
test('Wrong actor and fingerprint cannot verify or claim an intent',()=>{
 assert.throws(()=>sql(`begin;${as(owner)}${create}${uploaded}reset role;select claim_upload_intent(:'id','${manager}','sales','request');rollback;`));
 assert.throws(()=>sql(`begin;${as(owner)}${create}${uploaded}reset role;select claim_upload_intent(:'id','${owner}','sales','request') as claimed \\gset
 select :'claimed'::jsonb->>'lease_id' lease \\gset
 select verify_upload_intent(:'id',:'lease','${'b'.repeat(64)}');rollback;`));
});

const photoReady=`${as(owner)}${create.replace("'sales','fixture.csv','text/csv'","'rack','fixture.png','image/png'")}
insert into storage.objects(bucket_id,name,metadata) values('review-photos',:'path','{"size":100,"mimetype":"image/png"}');reset role;
select claim_upload_intent(:'id','${owner}','rack','photo-request') as claimed \\gset
select :'claimed'::jsonb->>'lease_id' lease \\gset
select verify_upload_intent(:'id',:'lease','${'a'.repeat(64)}');`;
const photoInsert=actor=>`insert into rack_reviews(store_id,reviewed_by,review_date,photo_path) values('${gp}','${actor}','2099-12-31',:'path');`;
test('Verified photo publication consumes matching intent atomically and preserves unchanged photo on edits',()=>{
 sql(`begin;${photoReady}${as(owner)}${photoInsert(owner)}${check("(select status='processed' from upload_intents limit 1)")}update rack_reviews set photo_path=photo_path where review_date='2099-12-31';rollback;`);
});
test('Another assigned user cannot consume an uploader photo intent',()=>{
 assert.throws(()=>sql(`begin;${photoReady}${as(manager)}${photoInsert(manager)}rollback;`));
});
test('Expired lease and incorrect photo module cannot publish',()=>{
 for(const change of ["lease_until=now()-interval '1 second'","kind='cleaning'"])assert.throws(()=>sql(`begin;${photoReady}update upload_intents set ${change};${as(owner)}${photoInsert(owner)}rollback;`));
});

for(const metadata of ['{}','{"contentLength":100,"mimetype":"text/csv"}'])test(`Storage permission probe ${metadata} does not consume upload intent`,()=>{
 sql(`begin;${as(manager)}${create}insert into storage.objects(bucket_id,name,metadata) values('reports',:'path','${metadata}');${check("(select status='created' from upload_intents limit 1)")}rollback;`);
 assert.throws(()=>sql(`begin;${as(manager)}${create}insert into storage.objects(bucket_id,name,metadata) values('reports',:'path','${metadata}');reset role;select claim_upload_intent(:'id','${manager}','sales','probe');rollback;`));
});
