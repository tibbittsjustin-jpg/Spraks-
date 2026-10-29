// Usage: node scripts/apply-rewrites.js public/data.js rewrites.json
// Titles, descriptions, and materials come only from rewrites.json.
// Replaces title/description and inserts materials (after description) for each idea in rewrites.json.
// Ideas not in rewrites.json get materials: []. Only line 1 (IDEAS_DATA) is touched; other lines are kept byte-for-byte.
const fs=require('fs');const [,,dataPath,rwPath]=process.argv;
const src=fs.readFileSync(dataPath,'utf8');const nl=src.indexOf('\n');
const first=nl<0?src:src.slice(0,nl),rest=nl<0?'':src.slice(nl);
const PRE='const IDEAS_DATA = ';if(!first.startsWith(PRE)||!first.endsWith(';'))throw new Error('unexpected line 1 format');
const ideas=JSON.parse(first.slice(PRE.length,-1));const rw=JSON.parse(fs.readFileSync(rwPath,'utf8'));
let n=0;const seen=new Set();
const out=ideas.map(i=>{const r=rw[i.id];const o={};for(const [k,v] of Object.entries(i)){if(k==='materials')continue;
  if(k==='title'&&r){o.title=r.title;continue}if(k==='description'){o.description=r?r.description:v;o.materials=r?r.materials:(i.materials||[]);continue}o[k]=v;}
 if(r){n++;seen.add(String(i.id));}return o;});
const missing=Object.keys(rw).filter(k=>!seen.has(k));if(missing.length)throw new Error('rewrite ids not in data: '+missing.join(','));
fs.writeFileSync(dataPath,PRE+JSON.stringify(out)+';'+rest);
console.log('applied',n,'of',ideas.length,'ideas');
