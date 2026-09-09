import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import XLSX from 'xlsx';
import JSZip from 'jszip';
import { fixture } from './helpers/app-fixture.mjs';
const read=fixture().load('@/lib/spreadsheets/read').readSpreadsheet;
const excel=(sheets=1)=>{const book=XLSX.utils.book_new();for(let i=0;i<sheets;i++)XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Name','Amount'],['Alice',100]]),`Sheet${i}`);return book;};
for(const ext of ['xlsx','xls','csv'])test(`H06 retains ${ext} support`,async()=>{
 const bytes=ext==='csv'?Buffer.from('Name,Amount\nAlice,100'):XLSX.write(excel(),{type:'buffer',bookType:ext==='xls'?'biff8':'xlsx'});
 assert.equal((await read(new File([bytes],`safe.${ext}`))).SheetNames.length,1);
});
for(const [name,file] of [
 ['extension',new File(['Name,Amount\nAlice,100'],'book.exe')],
 ['MIME',new File(['Name,Amount\nAlice,100'],'book.csv',{type:'image/gif'})],
 ['empty',new File([],'empty.xlsx')],
 ['HTML disguised as XLS',new File(['<html>payload</html>'],'book.xls')],
 ['prototype key',new File(['__proto__,salary\nvalue,10'],'book.csv')],
 ['constructor key',new File(['constructor,salary\nvalue,10'],'book.csv')],
 ['oversized string',new File(['Name\n'+'x'.repeat(8193)],'book.csv')],
 ['oversized file',new File([new Uint8Array(15*1024*1024+1)],'book.xlsx')],
 ['row cap',new File(['Name\n'+'a\n'.repeat(100001)],'book.csv')],
])test(`H06 rejects ${name}`,async()=>assert.rejects(read(file),/Spreadsheet rejected/));
test('H06 rejects excess sheets and declared cell counts',async()=>{
 await assert.rejects(read(new File([XLSX.write(excel(17),{type:'buffer'})],'many.xlsx')));
 const book=excel();book.Sheets.Sheet0['!ref']='A1:IV10000';
 await assert.rejects(read(new File([XLSX.write(book,{type:'buffer'})],'cells.xlsx')));
});
test('H06 ZIP expansion and path traversal are rejected before parsing',async()=>{
 const bytes=Buffer.from(XLSX.write(excel(),{type:'buffer'}));const central=bytes.indexOf(Buffer.from('504b0102','hex'));bytes.writeUInt32LE(65*1024*1024,central+24);
 await assert.rejects(read(new File([bytes],'bomb.xlsx')));
 const zip=new JSZip();zip.file('../evil.xml','evil');zip.file('[Content_Types].xml','<Types/>');zip.file('xl/workbook.xml','<workbook/>');
 await assert.rejects(read(new File([await zip.generateAsync({type:'uint8array'})],'paths.xlsx')));
});
test('H06 workbook XML entities are rejected',async()=>{
 const zip=await JSZip.loadAsync(XLSX.write(excel(),{type:'buffer'}));zip.file('xl/workbook.xml','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><workbook>&e;</workbook>');
 await assert.rejects(read(new File([await zip.generateAsync({type:'uint8array'})],'entities.xlsx')));
});
test('H06 hung worker is killed by the deadline without inheriting app credentials',async()=>{
 const child=new EventEmitter();child.send=()=>{};let killed=false;child.kill=()=>{killed=true;};
 const f=fixture({modules:{'node:child_process':{spawn(_path,args,options){assert.deepEqual(Object.keys(options.env).sort(),['NODE_ENV','TZ']);assert.ok(args.includes('--max-old-space-size=256'));return child;}}},globals:{setTimeout:fn=>setTimeout(fn,1)}});
 await assert.rejects(f.load('@/lib/spreadsheets/read').readSpreadsheet(new File(['a,b'],'a.csv')));assert.equal(killed,true);
});
test('H06 CSV output neutralizes formula prefixes including whitespace and quoted payloads',()=>{
 const escape=fixture().load('@/lib/spreadsheets/csv').csvEscape;
 for(const value of ['=1+1','+SUM(A1)','-cmd|x','@SUM(A1)','\t=1','\r=1','\n=1',' \uFEFF=1','="x",\n=2'])assert.ok(escape(value).startsWith('"\''));
 assert.equal(escape('ordinary "value"'),'"ordinary ""value"""');
});
test('H06 retains BOM-marked UTF-16 CSV compatibility',async()=>{
 const bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from('Name,Amount\r\nAlice,100','utf16le')]);
 assert.equal((await read(new File([bytes],'unicode.csv'))).SheetNames.length,1);
});
