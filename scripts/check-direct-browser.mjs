// Requires Playwright installed outside the application dependency tree and the
// production build running with ONLY isolated localhost Supabase credentials.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const dir=process.argv[2]||'/tmp/retail-direct-upload';
const config=JSON.parse(readFileSync(dir+'/local-status.json'));
assert.equal(config.API_URL,'http://127.0.0.1:55721');
const credentials=JSON.parse(readFileSync(dir+'/browser-fixture.json'));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try {
 const page=await browser.newPage(),requests=[],errors=[],authCounts=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{
  if(r.url().startsWith('http://localhost:55731')&&r.method()==='POST')requests.push({path:new URL(r.url()).pathname,bytes:r.postDataBuffer()?.length||0,action:Boolean(r.headers()['next-action'])});
  if(r.url().includes('/upload/resumable')&&r.method()!=='OPTIONS')authCounts.push((r.headers().authorization?.match(/Bearer /g)||[]).length);
 });
 await page.goto('http://localhost:55731/login');
 await page.locator('[name=email]').fill(credentials.email);await page.locator('[name=password]').fill(credentials.password);
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(/\/app/,{timeout:30000});
 await page.goto('http://localhost:55731/app/reports/sales');
 const option=await page.locator('select[name=storeId] option').evaluateAll(options=>options.find(o=>o.textContent.includes('Go Planet')).value);
 await page.locator('select[name=storeId]').selectOption(option);
 await page.locator('input[type=file]').setInputFiles(dir+'/browser.xlsx');
 const start=performance.now();await page.getByRole('button',{name:'Process sales report',exact:true}).click();
 await page.waitForFunction(()=>document.body.innerText.includes('Sales report processed')||document.body.innerText.includes('already exists')||document.body.innerText.includes('Upload summary'),null,{timeout:120000});
 assert.equal(errors.length,0);assert.ok(authCounts.length>0);assert.ok(authCounts.every(n=>n===1));
 const largestRequestBytes=Math.max(...requests.map(r=>r.bytes));assert.ok(largestRequestBytes<4096);
 const result={requests,errors,largestRequestBytes,completed:true,oneAuthorizationHeaderPerStorageRequest:true,elapsedSeconds:Number(((performance.now()-start)/1000).toFixed(3))};
 writeFileSync(dir+'/browser-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser.close();}
