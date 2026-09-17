const fs=require('fs'),path=require('path'),D=__dirname;
const ideas=JSON.parse(fs.readFileSync(path.join(D,'ideas_input.json'),'utf8'));
const byId={};ideas.forEach(i=>byId[i.id]=i);
const rows=fs.readFileSync(path.join(D,'patch_motif.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const VALID=fs.readFileSync(path.join(D,'motif_helper.js'),'utf8').match(/const VALID = `([\s\S]*?)`/)[1].split(/\s+/).filter(Boolean);
if(process.argv[2]==='unused'){
  const used=new Set(rows.map(r=>r.motif));
  console.log('unused:',VALID.filter(m=>!used.has(m)).join(' '));
  console.log('invalid:',[...used].filter(m=>!VALID.includes(m)).join(' ')||'none');
  const ids=rows.map(r=>r.id); console.log('dupes:',ids.length-new Set(ids).size,'min',Math.min(...ids),'max',Math.max(...ids));
} else {
  const want=process.argv[2];
  rows.filter(r=>r.motif===want).forEach(r=>console.log(r.id+'| '+byId[r.id].title));
}
