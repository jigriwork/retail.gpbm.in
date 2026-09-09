/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node child-process entry point */
// Isolated untrusted-file parser. Launched with a heap limit, deadline and no
// application credentials. Never evaluates formulas or follows external links.
const XLSX = require('xlsx');
const JSZip = require('jszip/dist/jszip.min.js');
const limits = { bytes:15*1024*1024, rows:100000, sheets:16, columns:256, cells:2000000, string:8192, expanded:64*1024*1024, entries:1024 };
const forbidden = new Set(['__proto__','prototype','constructor']);
const reject = () => { throw new Error('Invalid or oversized spreadsheet'); };
const string = value => { if(typeof value==='string' && (value.length>limits.string || forbidden.has(value.trim().toLowerCase())))reject(); };
async function parse({bytes,name,mime}) {
 const input=Buffer.from(bytes),ext=String(name).toLowerCase().match(/\.(xlsx|xls|csv)$/)?.[1];
 if(!ext || input.length===0 || input.length>limits.bytes)reject();
 const allowed={xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],xls:['application/vnd.ms-excel'],csv:['text/csv','application/csv','text/plain','application/vnd.ms-excel']};
 if(mime && mime!=='application/octet-stream' && !allowed[ext].includes(mime.toLowerCase().split(';')[0]))reject();
 if(ext==='xlsx') {
  if(input.readUInt32LE(0)!==0x04034b50)reject();
  // Read the central directory before any decompression. Reject ZIP64,
  // encryption, duplicate names, oversized expansion and malformed offsets.
  let end=-1;for(let i=input.length-22;i>=Math.max(0,input.length-65557);i--)if(input.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0 || input.readUInt16LE(end+4)!==0 || input.readUInt16LE(end+6)!==0)reject();
  const count=input.readUInt16LE(end+10);let offset=input.readUInt32LE(end+16),expanded=0;const names=new Set();
  if(count===0 || count>limits.entries)reject();
  for(let i=0;i<count;i++){
   if(offset+46>end || input.readUInt32LE(offset)!==0x02014b50 || input.readUInt16LE(offset+8)&1)reject();
   const size=input.readUInt32LE(offset+24),length=input.readUInt16LE(offset+28),extra=input.readUInt16LE(offset+30),comment=input.readUInt16LE(offset+32);
   expanded+=size;if(expanded>limits.expanded || offset+46+length+extra+comment>end)reject();
   const entry=input.subarray(offset+46,offset+46+length).toString('utf8');
   if(names.has(entry)||entry.split(/[\\/]/).some(s=>s==='..'||forbidden.has(s))||entry.startsWith('/')||/vbaProject|externalLinks/i.test(entry))reject();
   names.add(entry);offset+=46+length+extra+comment;
  }
  if(!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))reject();
  const zip=await JSZip.loadAsync(input,{checkCRC32:false});let actual=0;
  for(const entry of Object.values(zip.files))if(!entry.dir){
   // Bound actual inflated bytes while streaming, even if ZIP metadata lies.
   const data=await new Promise((resolve,rejectStream)=>{
    const parts=[];const stream=entry.internalStream('nodebuffer');
    stream.on('data',chunk=>{actual+=chunk.length;if(actual>limits.expanded){stream.pause();rejectStream(new Error('Expansion limit'));}else parts.push(chunk);});
    stream.on('error',rejectStream);stream.on('end',()=>resolve(Buffer.concat(parts)));stream.resume();
   });
   if(/\.xml$|\.rels$/i.test(entry.name)&&/<!DOCTYPE|<!ENTITY/i.test(data.toString('utf8')))reject();
  }
 } else if(ext==='xls') {
  const ole=input.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'));
  const biff=input.length>4 && input[0]===9 && [0,2,4,8].includes(input[1]);
  if(!ole&&!biff)reject();
 } else {
  const bom=input.subarray(0,2).toString('hex');
  const text=bom==='fffe'?input.subarray(2).toString('utf16le'):bom==='feff'?Buffer.from(input.subarray(2)).swap16().toString('utf16le'):input.toString('utf8');
  if(text.includes('\0')||/^\s*<(?:!doctype|html|\?xml)/i.test(text.slice(0,256)))reject();
 }
 const book=XLSX.read(input,{type:'buffer',cellDates:true,raw:false,cellFormula:false,bookVBA:false,sheetRows:limits.rows+1});
 if(!Array.isArray(book.SheetNames)||book.SheetNames.length===0||book.SheetNames.length>limits.sheets)reject();
 const result={SheetNames:book.SheetNames,Sheets:Object.create(null)};let total=0,totalRows=0;
 for(const name of book.SheetNames){string(name);if(name.length>128||!Object.hasOwn(book.Sheets,name))reject();const sheet=book.Sheets[name],out=Object.create(null);
  const ref=sheet['!fullref']||sheet['!ref'];if(!ref) {result.Sheets[name]=out;continue;}
  if(typeof ref!=='string'||!/^\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?$/.test(ref))reject();
  const range=XLSX.utils.decode_range(ref);const rows=range.e.r+1,columns=range.e.c+1;
  totalRows+=rows;if(rows>limits.rows||columns>limits.columns||totalRows>limits.rows||rows*columns>limits.cells)reject();
  out['!ref']=sheet['!ref'];
  for(const [address,cell] of Object.entries(sheet)){
   if(address.startsWith('!'))continue;if(!/^[A-Z]+[1-9]\d*$/.test(address)||!cell||typeof cell!=='object')reject();
   if(++total>limits.cells)reject();const clean={};
   for(const key of ['t','v','w','z'])if(Object.hasOwn(cell,key)){const value=cell[key];string(value);if(value!==null && typeof value==='object' && !(value instanceof Date))reject();if(typeof value==='number'&&!Number.isFinite(value))reject();clean[key]=value;}
   out[address]=clean;
  }
  result.Sheets[name]=out;
 }
 return result;
}
process.once('message',async input=>{try{const workbook=await parse(input);process.send({ok:true,workbook},()=>process.exit(0));}catch{process.send({ok:false},()=>process.exit(1));}});
