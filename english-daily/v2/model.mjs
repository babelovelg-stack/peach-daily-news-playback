import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PACKS} from './vocabulary.mjs';
import {requireKey,unseal} from './crypto.mjs';
import {SAMPLES,validateSample} from './publisher-samples.mjs';
export const ROOT=path.dirname(fileURLToPath(import.meta.url));
export const VERSION='2026-11-11-v2';
export function readCatalog(){return JSON.parse(fs.readFileSync(path.join(ROOT,'catalog.json'),'utf8'));}
export function loadLibrary(){const p=path.join(ROOT,'library.enc.json');if(!fs.existsSync(p))return {books:[]};return JSON.parse(unseal(JSON.parse(fs.readFileSync(p,'utf8')),requireKey(process.env.ENGLISH_CONTENT_KEY)));}
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
export function validateReading(r,{allowFixture=false}={}){
 if(r?.mode==='publisher-sample')return validateSample(r);
 assert(r&&r.id&&r.title,'Original book missing');
 assert(['Oxford Reading Tree','TreeTops','RAZ'].includes(r.series),'Original series must be identified');
 assert(r.level&&r.sourceName&&r.sourceSha256?.match(/^[a-f0-9]{64}$/),'Book level and source evidence required');
 assert(r.verifiedAgainstSource===true,'Original text and images must be checked against the source');
 assert(!r.testFixture||allowFixture,'Test reading cannot be delivered');
 assert(Array.isArray(r.pages)&&r.pages.length>0&&r.pages.length<=12,'Use 1–12 original pages per lesson');
 const sentences=[];
 for(const page of r.pages){assert(page.label&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(page.image||''),'Each reading page needs an embedded original image');assert(Array.isArray(page.sentences)&&page.sentences.length>0,'Page text required');for(const s of page.sentences){assert(typeof s.text==='string'&&s.text.trim()&&typeof s.translation==='string'&&s.translation.trim(),'Each original sentence needs a separately labelled explanation');sentences.push(s.text);}}
 assert(sentences.length<=24,'Too many sentences for one lesson');
 const text=sentences.join(' '),wordCount=text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length||0;
 assert(wordCount>0&&wordCount<=150,'Use a shorter original excerpt (maximum 150 words)');
 assert(Array.isArray(r.glossary)&&r.glossary.length>=1&&r.glossary.length<=3,'Explain 1–3 reading words');
 for(const g of r.glossary)assert(g.term&&g.meaning&&g.explanation&&text.toLowerCase().includes(g.term.toLowerCase()),'Reading vocabulary must occur in the original');
 assert(r.grammar?.title&&r.grammar?.explanation&&sentences.includes(r.grammar.quote),'Explain one grammar pattern using an exact original sentence');
 assert(Array.isArray(r.questions)&&r.questions.length>=1&&r.questions.length<=2,'Use 1–2 comprehension questions');
 for(const q of r.questions){assert(q.prompt&&q.explanation&&q.options?.length===3&&new Set(q.options).size===3&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<3,'Invalid comprehension question');assert(sentences.includes(q.evidence),'Question evidence must match an original sentence');}
 const readingMinutes=Math.ceil(wordCount/25)+3+r.questions.length;
 const minutes={vocabulary:10,reading:readingMinutes,review:3};
 assert(Object.values(minutes).reduce((a,b)=>a+b,0)<=25,'Content exceeds the 25-minute planning limit');
 return {wordCount,minutes};
}
export function assemble(number,pack,reading=null,{preview=false,allowFixture=false,practice='learn'}={}){
 assert(pack?.words?.length===5,'Each lesson needs exactly five target words');
 if(!preview&&!reading)throw Error('Awaiting verified original-book content');
 const meta=reading?validateReading(reading,{allowFixture}):{wordCount:0,minutes:{vocabulary:10,reading:10,review:3}};
 const speech={},add=(id,text,language='en')=>{speech[id]={text,language};};
 add('intro',practice==='learn'?'今天学习五个词，再读一小段原书。先看图听音，盖住文字想一想，再开口说。完成内容比赶时间更重要。':'今天先复习前面学过的五个词，再读两页新内容。先不看答案，听声音、看图片，把单词自己想起来。','zh');
 pack.words.forEach((w,i)=>{add(`word${i}`,w.word);add(`example${i}`,w.example);add(`guide${i}`,`${w.meaning}。${w.hint}`,'zh');});
 if(reading){if(reading.mode==='publisher-sample'){add('readingGuide',reading.readingGuide,'zh');add('focusQuote',reading.grammar.quote);add('patternExample',reading.grammar.example);}else reading.pages.forEach((p,i)=>p.sentences.forEach((s,j)=>add(`line${i}_${j}`,s.text)));reading.glossary.forEach((g,i)=>add(`gloss${i}`,`${g.term}。${g.meaning}。${g.explanation}`,'zh'));add('grammar',reading.grammar.explanation,'zh');}
 return {number,version:VERSION,preview,practice,title:pack.title,packId:pack.id,source:pack.source,words:pack.words,reading,readerBaseline:'RAZ C–D',minutes:meta.minutes,wordCount:meta.wordCount,speech};
}
export function lessonFor(number,{catalog=readCatalog(),library,preview=false}={}){
 if(preview)return assemble(number,PACKS.food,SAMPLES[0],{preview:true});
 const entry=catalog.lessons.find(l=>l.number===number);if(!entry)throw Error('Awaiting original-book access and content verification');
 const reading=SAMPLES.find(b=>b.id===entry.readingId)||(library||loadLibrary()).books.find(b=>b.id===entry.readingId);return assemble(number,PACKS[entry.packId],reading,{practice:entry.practice||'learn'});
}
export function availability(number,{catalog=readCatalog(),library}={}){
 const entry=catalog.lessons.find(l=>l.number===number);
 if(!entry)return {ready:false,reason:'No verified reading remains in the catalog; preserve progress and wait for the next reviewed original-book selection'};
 try{lessonFor(number,{catalog,library});return {ready:true};}catch(e){return {ready:false,reason:e.message};}
}
