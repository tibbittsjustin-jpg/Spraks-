const fs=require('fs'),path=require('path');
const D=__dirname;
const VALID=new Set(fs.readFileSync(path.join(D,'motif_helper.js'),'utf8')
  .match(/const VALID = `([\s\S]*?)`/)[1].split(/\s+/).filter(Boolean));
const auto=JSON.parse(fs.readFileSync(path.join(D,'motif_auto.json'),'utf8'));
const ideas=JSON.parse(fs.readFileSync(path.join(D,'ideas_input.json'),'utf8'));
const ovr={};
for(const f of fs.readdirSync(D).filter(f=>/^motif_ovr_\d+\.txt$/.test(f)).sort()){
  for(const line of fs.readFileSync(path.join(D,f),'utf8').split('\n')){
    const m=line.trim().match(/^(\d+)\s+([a-z]+)$/); if(!m) continue;
    if(!VALID.has(m[2])) throw new Error('bad motif '+m[2]+' in '+f);
    ovr[+m[1]]=m[2];
  }
}
const missing=[];
const out=ideas.map(i=>{
  const m=ovr[i.id]||auto[i.id]||'';
  if(!m) missing.push(i.id);
  return {id:i.id,motif:m};
});
if(process.argv[2]==='check'){
  console.log('overrides:',Object.keys(ovr).length,'missing:',missing.length);
  console.log(missing.slice(0,60).join(','));
} else {
  fs.writeFileSync(path.join(D,'patch_motif.jsonl'),out.map(o=>JSON.stringify(o)).join('\n')+'\n');
  const c={};out.forEach(o=>c[o.motif]=(c[o.motif]||0)+1);
  console.log('lines:',out.length,'distinct motifs:',Object.keys(c).length);
  console.log(Object.entries(c).sort((a,b)=>b[1]-a[1]).map(x=>x[0]+':'+x[1]).join('  '));
}
