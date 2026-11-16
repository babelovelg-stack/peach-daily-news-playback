import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const SAMPLES=JSON.parse(fs.readFileSync(new URL('./publisher-samples.json',import.meta.url),'utf8')).readings;
const count=s=>(s.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
const assert=(x,m)=>{if(!x)throw Error(m);};
const guideUrl='https://cdn.oxfordowl.co.uk/2020/05/13/08/54/28/35767d4e-ff04-41d4-9229-eb74b568e7a1/Oxford-Reading-Buddy-Oxford-Levels-Placement-Guide.pdf';
const guideSelections=new Map([
 ['Rumpelstiltskin',{panel:'upper',pages:[12,13]}],
 ['The Portrait Problem',{panel:'lower',pages:[4,5]}]
]);
function validatePublisherPages(r){
 const selection=guideSelections.get(r.title);
 if(selection){
  const a=r.evidenceAssets?.[0];
  assert(r.readerUrl===guideUrl+'#page=8'&&r.sourceUrl===guideUrl&&r.guidePanel===selection.panel,'Unapproved guide location');
  assert(JSON.stringify(r.pageNumbers)===JSON.stringify(selection.pages),'Incorrect original folios');
  assert(r.evidenceAssets.length===1&&a?.url===guideUrl&&a.readerPage===8&&a.bytes===7047571&&a.sha256==='ef79f7f0c7ba4e102d862fc60d3235c098cd5fc230a9f5f856ac7d01a346f203','Guide evidence differs');
  return;
 }
 const slug={'The Broken Roof':'ort-broken-roof','The Hunt for Gold':'ort-hunt-for-gold','The Power Cut':'ort-power-cut'}[r.title];
 assert(slug&&!r.guidePanel&&r.readerUrl===`https://oup.pagetiger.com/${slug}/`&&r.sourceUrl.startsWith('https://shop.oupchina.com.hk/en/products/'),'Unapproved publisher sample');
 assert(r.pageNumbers?.length===2&&r.pageNumbers[1]===r.pageNumbers[0]+1&&r.pageNumbers.every(n=>Number.isInteger(n)&&n>=1&&n<=6),'Use a verified two-page sample');
 assert(r.evidenceAssets?.length===2,'Source evidence required');
 for(const [i,a] of r.evidenceAssets.entries()){
  const url=new URL(a.url);
  assert(a.page===r.pageNumbers[i]&&a.readerPage===a.page+1&&a.bytes>0&&url.origin==='https://view.pagetiger.com'&&url.pathname.startsWith(`/${slug}/1/Thumbs/`)&&/^[a-f0-9]{64}$/.test(a.sha256),'Source-page evidence is invalid');
 }
}
export function validateSample(r){
 assert(r.mode==='publisher-sample'&&r.distribution==='publisher-link-only','Publisher sample must remain on its original host');
 validatePublisherPages(r);
 assert(r.requiresLogin===false&&r.verifiedAgainstSource===true&&r.verifiedOn,'Public sample access and content must be checked');
 assert(!r.pages&&!r.images&&!r.fullText,'Do not republish publisher pages or full text');
 const evidenceHash=createHash('sha256').update(r.evidenceAssets.map(a=>a.sha256).join('')).digest('hex');
 assert(evidenceHash===r.sourceSha256,'Source evidence fingerprint mismatch');
 assert(r.wordCountUpperBound>0&&r.wordCountUpperBound<=150&&r.readingGuide,'Reading portion needs a bounded workload and guidance');
 assert(r.glossary?.length>=1&&r.glossary.length<=3&&r.glossary.every(g=>g.term&&g.meaning&&g.explanation&&r.pageNumbers.includes(g.page)),'Glossary must reference verified pages');
 assert(r.grammar?.quote&&count(r.grammar.quote)<=10&&r.grammar.title&&r.grammar.explanation&&r.grammar.example&&r.grammar.translation&&r.pageNumbers.includes(r.grammar.page),'Use a short checked quotation and original grammar examples');
 assert(r.questions?.length>=1&&r.questions.length<=2,'Use 1–2 comprehension questions');
 for(const q of r.questions)assert(q.prompt&&q.explanation&&q.options?.length===3&&new Set(q.options).size===3&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<3&&r.pageNumbers.includes(q.evidencePage),'Question evidence must point to a verified sample page');
 return {wordCount:null,minutes:{vocabulary:10,reading:10,review:3}};
}
export function validateSampleLibrary(readings=SAMPLES){
 const quotes=new Map(),occupied=new Set();
 for(const r of readings){validateSample(r);
  for(const page of r.pageNumbers){
   const key=JSON.stringify([r.title,page]);assert(!occupied.has(key),'Repeated original book page');occupied.add(key);
  }
  const q=quotes.get(r.title)||new Set();q.add(r.grammar.quote);for(const g of r.glossary)q.add(g.term);quotes.set(r.title,q);}
 for(const q of quotes.values())assert(count([...q].join(' '))<=25,'Quotation budget exceeded for one book');
 return true;
}
export async function verifySampleOnline(r,{fetcher=fetch}={}){
 validateSample(r);
 for(const a of r.evidenceAssets){let ok=false;for(let attempt=0;attempt<3&&!ok;attempt++){try{const res=await fetcher(a.url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('Source unavailable');const bytes=Buffer.from(await res.arrayBuffer());ok=bytes.length===a.bytes&&createHash('sha256').update(bytes).digest('hex')===a.sha256;}catch{} }
  if(!ok)throw Error('Publisher sample is unavailable or changed; do not send');
 }
}
validateSampleLibrary();
