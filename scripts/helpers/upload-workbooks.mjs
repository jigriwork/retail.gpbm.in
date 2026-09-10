import XLSX from 'xlsx';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
// Uncompressed OOXML with real sales fields and bounded padding cells. ZIP
// comments fill the final small gap, so limits are tested at exact byte sizes.
export async function sizedWorkbook(size, date = '2099-01-01') {
 const make=rows=>{
  const matrix=[['Store Name','Bill Date','Bill No','Item Name','Brand','Category','Qty','Net Sale','Staff Name','Padding']];
  for(let i=0;i<rows;i++)matrix.push(['Go Planet',date,String(i),'Fixture item','Fixture brand','Fixture category',1,100,'Fixture staff','p'.repeat(4096)]);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(matrix),'Sales');
  return XLSX.write(book,{type:'buffer',compression:false});
 };
 let low=1,high=Math.ceil(size/4000),best=make(1),rows=1;
 while(low<=high){const mid=Math.floor((low+high)/2),bytes=make(mid);if(bytes.length<=size){best=bytes;rows=mid;low=mid+1;}else high=mid-1;}
 const zip=await JSZip.loadAsync(best);const normal=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
 const gap=size-normal.length;assert.ok(gap>=0&&gap<=65535);
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'STORE',comment:'p'.repeat(gap)});assert.equal(bytes.length,size);
 return {bytes,rows};
}
