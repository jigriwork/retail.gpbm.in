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
 symlinkSync(path.join(root,'lib/uploads/validation.ts'),path.join(temp,'lib/validation.ts'));
 symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 symlinkSync(path.join(root,'lib/spreadsheets'),path.join(temp,'lib/spreadsheets'),'dir');
 writeFileSync(path.join(temp,'package.json'),JSON.stringify({name:'isolated-upload-check',private:true}));
 const config=readFileSync(path.join(root,'next.config.ts'),'utf8');
 assert.match(config,/bodySizeLimit: "128kb"/);assert.match(config,/proxyClientMaxBodySize: "128kb"/);
 writeFileSync(path.join(temp,'next.config.js'),`module.exports={experimental:{serverActions:{bodySizeLimit:'128kb'},proxyClientMaxBodySize:'128kb'},serverExternalPackages:['xlsx','jszip']};`);
 writeFileSync(path.join(temp,'app/layout.jsx'),`export default function Layout({children}){return <html><body>{children}</body></html>}`);
 writeFileSync(path.join(temp,'app/page.jsx'),`import {redirect} from 'next/navigation';import {metadataOnly} from '../lib/validation';export default function Page(){async function upload(form){'use server';let valid=false;try{metadataOnly(form);valid=true;}catch{}redirect(valid?'/verified':'/rejected');}return <form action={upload}><input name="uploadIntentId"/><button>Process uploaded file</button></form>}`);
 writeFileSync(path.join(temp,'proxy.js'),`import {NextResponse} from 'next/server';export function proxy(){return NextResponse.next()}export const config={matcher:'/'};`);
 execFileSync(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:temp,env,stdio:'pipe'});
 server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','55441'],{cwd:temp,env,stdio:'ignore'});
 let html;for(let i=0;i<100;i++){try{html=await(await fetch('http://127.0.0.1:55441')).text();break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const action=html?.match(/name="(\$ACTION_ID_[^"]+)"/);assert.ok(action,'Server action form missing');
 let largestMetadataRequest=0;
 for(const scenario of ['metadata','file','oversized']){
  const form=new FormData();form.set(action[1],'');form.set('uploadIntentId','00000000-0000-0000-0000-000000000001');form.set('storeId','00000000-0000-0000-0000-000000000002');
  if(scenario==='file')form.set('file',new File(['bytes'],'file.csv'));
  if(scenario==='oversized')form.set('notes','x'.repeat(140000));
  const encoded=new Request('http://127.0.0.1:55441/',{method:'POST',body:form});const bytes=await encoded.arrayBuffer();
  if(scenario==='metadata')largestMetadataRequest=bytes.byteLength;
  const response=await fetch('http://127.0.0.1:55441/',{method:'POST',body:bytes,redirect:'manual',headers:{Origin:'http://127.0.0.1:55441','Content-Type':encoded.headers.get('Content-Type')}});
  if(scenario==='oversized')assert.ok(response.status>=400);
  else {assert.equal(response.status,303);assert.equal(response.headers.get('location'),scenario==='metadata'?'/verified':'/rejected');}
 }
 console.log(`PASS: actual Next Proxy/Server Action metadata request ${largestMetadataRequest} bytes; File entries rejected; 128 KiB transport ceiling enforced.`);
} finally {
 if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
 rmSync(temp,{recursive:true,force:true});
}
