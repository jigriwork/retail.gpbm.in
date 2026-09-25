/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node child-process entry point */
// Isolated untrusted-file parser. Launched with a heap limit, deadline and no
// application credentials. Never evaluates formulas or follows external links.
const XLSX = require('xlsx');
const JSZip = require('jszip/dist/jszip.min.js');
const limits = { bytes:15*1024*1024, rows:100000, sheets:16, columns:256, cells:2000000, string:8192, expanded:64*1024*1024, entries:1024 };
const forbidden = new Set(['__proto__','prototype','constructor']);
class SpreadsheetError extends Error {
 constructor(code,message){super(message);this.name='SpreadsheetError';this.code=code;}
}
const reject = (code,message) => { throw new SpreadsheetError(code,message); };
const string = value => {
 if(typeof value!=='string')return;
 if(value.length>limits.string)reject('CELL_TEXT_LIMIT',`A cell contains more than ${limits.string.toLocaleString('en-US')} characters.`);
 if(forbidden.has(value.trim().toLowerCase()))reject('RESERVED_CELL_VALUE','A cell contains a reserved unsafe value.');
};
async function parse({bytes,name,mime}) {
 const input=Buffer.from(bytes),ext=String(name).toLowerCase().match(/\.(xlsx|xls|csv)$/)?.[1];
 if(!ext)reject('UNSUPPORTED_EXTENSION','The file extension must be .xlsx, .xls, or .csv.');
 if(input.length===0)reject('EMPTY_FILE','The spreadsheet file is empty.');
 if(input.length>limits.bytes)reject('FILE_SIZE_LIMIT',`The spreadsheet exceeds the ${limits.bytes/1024/1024} MiB file-size limit.`);
 const allowed={xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],xls:['application/vnd.ms-excel'],csv:['text/csv','application/csv','text/plain','application/vnd.ms-excel']};
 if(mime && mime!=='application/octet-stream' && !allowed[ext].includes(mime.toLowerCase().split(';')[0]))reject('MIME_MISMATCH',`The declared file type does not match the .${ext} extension.`);
 if(ext==='xlsx') {
  if(input.length<4 || input.readUInt32LE(0)!==0x04034b50)reject('XLSX_SIGNATURE_INVALID','The .xlsx ZIP signature is invalid.');
  // Read the central directory before any decompression. Reject ZIP64,
  // encryption, duplicate names, oversized expansion and malformed offsets.
  let end=-1;for(let i=input.length-22;i>=Math.max(0,input.length-65557);i--)if(input.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)reject('XLSX_DIRECTORY_INVALID','The .xlsx central directory is missing or malformed.');
  if(input.readUInt16LE(end+4)!==0 || input.readUInt16LE(end+6)!==0)reject('XLSX_MULTIDISK_UNSUPPORTED','Multi-disk XLSX archives are not supported.');
  const count=input.readUInt16LE(end+10);let offset=input.readUInt32LE(end+16),expanded=0;const names=new Set();
  if(count===0)reject('XLSX_EMPTY_ARCHIVE','The .xlsx archive contains no entries.');
  if(count>limits.entries)reject('ZIP_ENTRY_LIMIT',`The .xlsx archive contains more than ${limits.entries.toLocaleString('en-US')} entries.`);
  for(let i=0;i<count;i++){
   if(offset+46>end || input.readUInt32LE(offset)!==0x02014b50)reject('XLSX_DIRECTORY_INVALID','The .xlsx central directory is malformed.');
   if(input.readUInt16LE(offset+8)&1)reject('XLSX_ENCRYPTED','Encrypted XLSX files are not supported.');
   const size=input.readUInt32LE(offset+24),length=input.readUInt16LE(offset+28),extra=input.readUInt16LE(offset+30),comment=input.readUInt16LE(offset+32);
   expanded+=size;
   if(expanded>limits.expanded)reject('ZIP_EXPANDED_SIZE_LIMIT',`The .xlsx archive expands beyond the ${limits.expanded/1024/1024} MiB safety limit.`);
   if(offset+46+length+extra+comment>end)reject('XLSX_DIRECTORY_INVALID','The .xlsx central-directory entry is malformed.');
   const entry=input.subarray(offset+46,offset+46+length).toString('utf8');
   if(names.has(entry))reject('ZIP_DUPLICATE_ENTRY','The .xlsx archive contains duplicate entry names.');
   if(entry.split(/[\\/]/).some(s=>s==='..'||forbidden.has(s))||entry.startsWith('/'))reject('ZIP_UNSAFE_PATH','The .xlsx archive contains an unsafe entry path.');
   if(/vbaProject|externalLinks/i.test(entry))reject('XLSX_ACTIVE_CONTENT','XLSX macros and external links are not allowed.');
   names.add(entry);offset+=46+length+extra+comment;
  }
  if(!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))reject('XLSX_REQUIRED_PART_MISSING','The .xlsx archive is missing a required workbook part.');
  let zip;
  try{zip=await JSZip.loadAsync(input,{checkCRC32:false});}catch{reject('XLSX_ZIP_PARSE_FAILED','The .xlsx ZIP structure could not be parsed.');}
  let actual=0;
  for(const entry of Object.values(zip.files))if(!entry.dir){
   // Bound actual inflated bytes while streaming, even if ZIP metadata lies.
   const data=await new Promise((resolve,rejectStream)=>{
    const parts=[];const stream=entry.internalStream('nodebuffer');
    stream.on('data',chunk=>{actual+=chunk.length;if(actual>limits.expanded){stream.pause();rejectStream(new SpreadsheetError('ZIP_EXPANDED_SIZE_LIMIT',`The .xlsx archive expands beyond the ${limits.expanded/1024/1024} MiB safety limit.`));}else parts.push(chunk);});
    stream.on('error',rejectStream);stream.on('end',()=>resolve(Buffer.concat(parts)));stream.resume();
   });
   if(/\.xml$|\.rels$/i.test(entry.name)&&/<!DOCTYPE|<!ENTITY/i.test(data.toString('utf8')))reject('XLSX_XML_ENTITY','The .xlsx archive contains a prohibited XML document type or entity.');
  }
 } else if(ext==='xls') {
  const ole=input.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'));
  const biff=input.length>4 && input[0]===9 && [0,2,4,8].includes(input[1]);
  if(!ole&&!biff)reject('XLS_SIGNATURE_INVALID','The .xls binary signature is invalid.');
 } else {
  const bom=input.subarray(0,2).toString('hex');
  const text=bom==='fffe'?input.subarray(2).toString('utf16le'):bom==='feff'?Buffer.from(input.subarray(2)).swap16().toString('utf16le'):input.toString('utf8');
  if(text.includes('\0'))reject('CSV_BINARY_CONTENT','The CSV contains binary null bytes.');
  if(/^\s*<(?:!doctype|html|\?xml)/i.test(text.slice(0,256)))reject('CSV_MARKUP_CONTENT','The CSV appears to contain HTML or XML markup.');
 }
 let book;
 try{book=XLSX.read(input,{type:'buffer',cellDates:true,raw:false,cellFormula:false,bookVBA:false,sheetRows:limits.rows+1});}
 catch{reject('WORKBOOK_PARSE_FAILED',`The .${ext} workbook structure could not be parsed.`);}
 if(!Array.isArray(book.SheetNames)||book.SheetNames.length===0)reject('WORKBOOK_HAS_NO_SHEETS','The workbook contains no readable worksheets.');
 if(book.SheetNames.length>limits.sheets)reject('SHEET_LIMIT',`The workbook contains more than ${limits.sheets} worksheets.`);
 const result={SheetNames:book.SheetNames,Sheets:Object.create(null)};let total=0,totalRows=0;
 for(const name of book.SheetNames){string(name);if(name.length>128)reject('SHEET_NAME_LIMIT','A worksheet name exceeds 128 characters.');if(!Object.hasOwn(book.Sheets,name))reject('WORKSHEET_MISSING','A declared worksheet could not be read.');const sheet=book.Sheets[name],out=Object.create(null);
  const ref=sheet['!fullref']||sheet['!ref'];if(!ref) {result.Sheets[name]=out;continue;}
  if(typeof ref!=='string'||!/^\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?$/.test(ref))reject('SHEET_RANGE_INVALID','A worksheet has an invalid used range.');
  const range=XLSX.utils.decode_range(ref);const rows=range.e.r-range.s.r+1,columns=range.e.c-range.s.c+1;
  totalRows+=rows;
  if(rows>limits.rows)reject('ROW_LIMIT',`A worksheet contains more than ${limits.rows.toLocaleString('en-US')} used rows.`);
  if(columns>limits.columns)reject('COLUMN_LIMIT',`A worksheet contains more than ${limits.columns.toLocaleString('en-US')} used columns.`);
  if(totalRows>limits.rows)reject('TOTAL_ROW_LIMIT',`The workbook contains more than ${limits.rows.toLocaleString('en-US')} used rows across all worksheets.`);
  if(rows*columns>limits.cells)reject('RANGE_CELL_LIMIT',`A worksheet used range exceeds ${limits.cells.toLocaleString('en-US')} cells.`);
  out['!ref']=sheet['!ref'];
  for(const [address,cell] of Object.entries(sheet)){
   if(address.startsWith('!'))continue;if(!/^[A-Z]+[1-9]\d*$/.test(address)||!cell||typeof cell!=='object')reject('CELL_STRUCTURE_INVALID','A worksheet contains an invalid cell structure.');
   if(++total>limits.cells)reject('PHYSICAL_CELL_LIMIT',`The workbook contains more than ${limits.cells.toLocaleString('en-US')} populated cells.`);const clean={};
   for(const key of ['t','v','w','z'])if(Object.hasOwn(cell,key)){const value=cell[key];string(value);if(value!==null && typeof value==='object' && !(value instanceof Date))reject('CELL_VALUE_INVALID','A cell contains an unsupported structured value.');if(typeof value==='number'&&!Number.isFinite(value))reject('CELL_NUMBER_INVALID','A cell contains a non-finite number.');clean[key]=value;}
   out[address]=clean;
  }
  result.Sheets[name]=out;
 }
 return result;
}
process.once('message',async input=>{try{const workbook=await parse(input);process.send({ok:true,workbook},()=>process.exit(0));}catch(error){
 const known=error instanceof SpreadsheetError;
 process.send({ok:false,error:{code:known?error.code:'SPREADSHEET_INTERNAL_ERROR',message:known?error.message:'The spreadsheet parser encountered an internal error.'}},()=>process.exit(1));
}});
