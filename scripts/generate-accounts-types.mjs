// Regenerate the accounts tables, the new sales/stock columns and the accounts
// RPC signatures from the isolated migrated schema. Fixed loopback connection;
// never loads an environment or production URL.
// Run: node scripts/test-accounts-local.mjs scripts/generate-accounts-types.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const sql=q=>JSON.parse(execFileSync('psql',['-XqAt','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}));
const tables=JSON.parse(readFileSync('scripts/accounts-types.json','utf8')).tables;
const file='lib/supabase/database.types.ts';let text=readFileSync(file,'utf8');
const type=t=>({uuid:'string',text:'string',date:'string',timestamp:'string',timestamptz:'string',numeric:'number',int4:'number',int8:'number',bool:'boolean',jsonb:'Json',_uuid:'string[]',_text:'string[]'})[t]??(()=>{throw Error(`Unsupported SQL type ${t}`);})();
for(const table of tables){
 const columns=sql(`select json_agg(json_build_object('name',a.attname,'type',t.typname,'nullable',not a.attnotnull,'default',d.oid is not null or a.attidentity<>'','generated',a.attgenerated<>'') order by a.attnum) from pg_attribute a join pg_type t on t.oid=a.atttypid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.${table}'::regclass and a.attnum>0 and not a.attisdropped`);
 const fks=sql(`select coalesce(json_agg(json_build_object('foreignKeyName',c.conname,'columns',(select json_agg(a.attname order by u.ordinality) from unnest(c.conkey) with ordinality u(k,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.k),'isOneToOne',exists(select 1 from pg_constraint q where q.conrelid=c.conrelid and q.contype in('u','p') and q.conkey=c.conkey),'referencedRelation',r.relname,'referencedColumns',(select json_agg(a.attname order by u.ordinality) from unnest(c.confkey) with ordinality u(k,ordinality) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=u.k)) order by c.conname), '[]') from pg_constraint c join pg_class r on r.oid=c.confrelid where c.conrelid='public.${table}'::regclass and c.contype='f'`);
 const block=`      ${table}: {\n`+['Row','Insert','Update'].map(mode=>`        ${mode}: {\n`+columns.filter(c=>mode==='Row'||!c.generated).map(c=>`          ${c.name}${mode==='Update'||(mode==='Insert'&&(c.nullable||c.default))?'?':''}: ${type(c.type)}${c.nullable?' | null':''}\n`).join('')+'        }\n').join('')+`        Relationships: ${JSON.stringify(fks,null,2).replaceAll('\n','\n        ')}\n      }\n`;
 const re=new RegExp(`      ${table}: \\{[\\s\\S]*?^      \\}\\n`,'m');if(re.test(text))text=text.replace(re,()=>block);else text=text.replace('    Tables: {\n','    Tables: {\n'+block);
}
const functions=JSON.parse(readFileSync('scripts/accounts-types.json','utf8')).functions;
for(const [name,[args,returns]] of Object.entries(functions)){const block=`      ${name}: { Args: { ${args} }; Returns: ${returns} }\n`;const re=new RegExp(`      ${name}: .*\\n`);text=re.test(text)?text.replace(re,block):text.replace('    Functions: {\n','    Functions: {\n'+block);}
writeFileSync(file,text);console.log(`Regenerated ${tables.length} table types and ${Object.keys(functions).length} RPC signatures from the isolated schema.`);
