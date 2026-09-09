// Read-only artifact scan. Never prints credential values or loads remote data.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const env=readFileSync('.env.local','utf8');
const match=env.match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)\s*$/m);
if(!match)throw new Error('Cannot verify the configured service-role key: variable missing.');
const key=match[1].trim().replace(/^(['"])(.*)\1$/,'$2');
if(!key)throw new Error('Configured service-role key is empty.');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const assets=files('.next/static');
if(assets.some(file=>readFileSync(file).includes(key)))throw new Error('Service-role credential found in browser build.');
const manifest=readFileSync('.next/server/server-reference-manifest.json','utf8');
if(manifest.includes('propagateEmployeePhone'))throw new Error('Internal phone propagation appears in the public action manifest.');
console.log(`PASS: ${assets.length} browser assets scanned; no configured service-role credential. Internal phone helper absent from public action manifest.`);
