// Actual Next App Router + Proxy + Server Action, in a disposable local app.
// No real authentication, Supabase client, env file or production writes.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),temp=mkdtempSync(path.join(tmpdir(),'retail-upload-'));
const env={PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'};
let server;
try {
 mkdirSync(path.join(temp,'app'));mkdirSync(path.join(temp,'lib'));
 symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 symlinkSync(path.join(root,'lib/spreadsheets'),path.join(temp,'lib/spreadsheets'),'dir');
 writeFileSync(path.join(temp,'package.json'),JSON.stringify({name:'isolated-upload-check',private:true}));
 const config=readFileSync(path.join(root,'next.config.ts'),'utf8');
 assert.match(config,/bodySizeLimit: "16mb"/);assert.match(config,/proxyClientMaxBodySize: "16mb"/);
 writeFileSync(path.join(temp,'next.config.js'),`module.exports={experimental:{serverActions:{bodySizeLimit:'16mb'},proxyClientMaxBodySize:'16mb'},serverExternalPackages:['xlsx','jszip']};`);
 writeFileSync(path.join(temp,'app/layout.jsx'),`export default function Layout({children}){return <html><body>{children}</body></html>}`);
 writeFileSync(path.join(temp,'app/page.jsx'),`import {redirect} from 'next/navigation';import {readSpreadsheet} from '../lib/spreadsheets/read';export default function Page(){async function upload(form){'use server';const file=form.get('file');let valid=false;try{await readSpreadsheet(file);valid=true;}catch{}redirect(valid?'/verified?bytes='+file.size:'/rejected');}return <form action={upload}><input name="file" type="file"/><button>Upload</button></form>}`);
 writeFileSync(path.join(temp,'proxy.js'),`import {NextResponse} from 'next/server';export function proxy(){return NextResponse.next()}export const config={matcher:'/'};`);
 execFileSync(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:temp,env,stdio:'pipe'});
 server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','55441'],{cwd:temp,env,stdio:'ignore'});
 let html;for(let i=0;i<100;i++){try{html=await(await fetch('http://127.0.0.1:55441')).text();break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const action=html?.match(/name="(\$ACTION_ID_[^"]+)"/);assert.ok(action,'Server action form missing');
 const length=15*1024*1024;const bytes=Buffer.alloc(length,0x78);for(let i=7999;i<length;i+=8000)bytes[i]=10;
 for(const [payload,expected] of [[bytes,`/verified?bytes=${length}`],[Buffer.concat([bytes,Buffer.from('x')]),'/rejected']]){
  const form=new FormData();form.set(action[1],'');form.set('file',new File([payload],'limit.csv',{type:'text/csv'}));
  const response=await fetch('http://127.0.0.1:55441/',{method:'POST',body:form,redirect:'manual',headers:{Origin:'http://127.0.0.1:55441'}});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),expected);
 }
 console.log('PASS: actual Next Proxy/Server Action accepts a valid 15 MiB spreadsheet; parser rejects 15 MiB + 1 byte.');
} finally {
 if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
 rmSync(temp,{recursive:true,force:true});
}
