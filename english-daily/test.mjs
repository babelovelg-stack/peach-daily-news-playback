import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {WEEKS,TOTAL_LESSONS,lessonFor,COURSE_VERSION} from './course.mjs';
import {jobsFor,verifyManifest,hash,renderLesson} from './build.mjs';
import {planNext,markSending,markSent,todayInShanghai,scheduledDate,emailFor,validateState,checkAssets} from './daily.mjs';
const fresh=()=>({schema:1,lastLesson:0,history:[]});
test('27 original weekly stories, 189 bounded daily lessons',()=>{
 assert.equal(WEEKS.length,27);assert.equal(TOTAL_LESSONS,189);assert.equal(new Set(WEEKS.map(w=>w.story)).size,27);
 for(const w of WEEKS){assert.equal(w.words.length,6);assert.equal(new Set(w.words.map(x=>x.en)).size,6);for(const word of w.words)for(const k of ['en','zh','sentence'])assert.ok(word[k]?.trim());assert.ok(w.story.split(' ').length>=40);}
 assert.throws(()=>lessonFor(0));assert.throws(()=>lessonFor(190));assert.throws(()=>lessonFor(1.5));
});
test('every day has a 15-minute budget, valid rotated answers, exact narration and an expression task',()=>{
 for(let n=1;n<=TOTAL_LESSONS;n++){const l=lessonFor(n);assert.equal(l.minutes.reduce((a,b)=>a+b,0),15);assert.equal(l.number,n);assert.equal(l.words.length,3);assert.ok(l.questions.length>=4);assert.equal(l.speech.story,l.story);assert.equal(l.speech.example,l.example);assert.equal(l.writing.check.length,3);
  for(const q of l.questions){assert.equal(new Set(q.options).size,q.options.length);assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length);assert.ok(q.why);}
  const w=WEEKS[l.week-1],g=l.questions.find(q=>q.q===w.grammar.q);assert.equal(g.options[g.answer],w.grammar.options[w.grammar.answer]);
 }
});
test('week starts cover all six terms and Sunday is explicit review',()=>{for(let w=0;w<27;w++){assert.equal(new Set([...lessonFor(w*7+1).words,...lessonFor(w*7+2).words].map(x=>x.en)).size,6);assert.equal(lessonFor(w*7+7).review,true);}});
test('English and Chinese jobs use separate intended voices',()=>{const j=jobsFor(lessonFor(1));assert.equal(j.story.voice,'en-GB-SoniaNeural');assert.equal(j.rule.voice,'zh-CN-XiaoyiNeural');assert.equal(j.story.rate,'-12%');});
test('audio verification rejects stale scripts, changed voices and corrupted bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'english-audio-'));try{
  const l=lessonFor(1),jobs=jobsFor(l),manifest={};
  for(const [k,job]of Object.entries(jobs)){const p=path.join(dir,k+'.mp3'),bytes=Buffer.alloc(700,1);fs.writeFileSync(p,bytes);manifest[k]={job,path:p,sha256:hash(bytes)};}
  verifyManifest(l,manifest);const html=renderLesson(l,manifest);assert.ok(html.includes('data:audio/mpeg;base64,'));assert.ok(!html.includes('/*__'));
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  manifest.story.job={...jobs.story,text:'wrong script'};assert.throws(()=>verifyManifest(l,manifest),/Stale/);manifest.story.job=jobs.story;
  fs.writeFileSync(manifest.story.path,'broken');assert.throws(()=>verifyManifest(l,manifest),/integrity/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('timezone uses Shanghai rather than UTC date',()=>{assert.equal(todayInShanghai(new Date('2026-11-11T16:30:00Z')),'2026-11-12');});
test('published retry assets must retain hashes and match the intended lesson',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'english-published-'));try{
  const l=lessonFor(1),p={lesson:1,version:COURSE_VERSION};
  fs.writeFileSync(path.join(dir,'index.html'),'<html>fixture</html>');fs.writeFileSync(path.join(dir,'lesson.json'),JSON.stringify(l));fs.writeFileSync(path.join(dir,'speech.txt'),l.story);
  const manifest=()=>{fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({number:1,version:COURSE_VERSION,assets:Object.fromEntries(['index.html','lesson.json','speech.txt'].map(n=>[n,hash(fs.readFileSync(path.join(dir,n)))]))}));};
  manifest();checkAssets(p,dir);fs.appendFileSync(path.join(dir,'index.html'),'tampered');assert.throws(()=>checkAssets(p,dir),/integrity/);
  manifest();fs.writeFileSync(path.join(dir,'lesson.json'),JSON.stringify({...l,story:'different story'}));manifest();assert.throws(()=>checkAssets(p,dir),/differs from curriculum/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('scheduled news-triggered runs wait until 18:00 and overnight retries use the previous date',()=>{assert.equal(scheduledDate(new Date('2026-11-11T04:00:00Z')),null);assert.equal(scheduledDate(new Date('2026-11-11T10:00:00Z')),'2026-11-11');assert.equal(scheduledDate(new Date('2026-11-11T17:00:00Z')),'2026-11-11');});
test('same date sends at most one lesson and gaps do not skip curriculum',()=>{
 let s=fresh(),p=planNext(s,'2026-11-11');s=markSending(s,p,'hash');s=markSent(s,p,{accepted:true,messageId:'id'});
 assert.equal(planNext(s,'2026-11-11').send,false);assert.equal(planNext(s,'2026-11-15').lesson,2);assert.throws(()=>planNext(s,'2026-11-10'),/backwards/);
});
test('uncertain delivery blocks retries without claiming success',()=>{
 const s=fresh(),p=planNext(s,'2026-11-11'),claimed=markSending(s,p,'hash');
 assert.throws(()=>planNext(claimed,'2026-11-11'),/uncertain/);assert.throws(()=>planNext(claimed,'2026-11-12'),/uncertain/);assert.throws(()=>markSent(claimed,p,{accepted:false}),/acceptance/);assert.equal(claimed.lastLesson,0);
});
test('stale or missing send claims cannot advance state',()=>{
 const s=fresh(),p=planNext(s,'2026-11-11');assert.throws(()=>markSending(s,{...p,lesson:2},'x'));assert.throws(()=>markSending(s,{...p,version:'old'},'x'));assert.throws(()=>markSent(s,p,{accepted:true}));
});
test('state rejects noncontiguous history and invalid dates',()=>{assert.throws(()=>validateState({...fresh(),lastLesson:2}));assert.throws(()=>planNext(fresh(),'2026-02-30'));assert.throws(()=>planNext(fresh(),'garbage'));});
test('189 deliveries end the course without restarting or repeating',()=>{
 let s=fresh();for(let n=0;n<TOTAL_LESSONS;n++){const d=new Date(Date.UTC(2026,10,11+n)).toISOString().slice(0,10),p=planNext(s,d);assert.equal(p.lesson,n+1);s=markSent(markSending(s,p,'x'),p,{accepted:true,messageId:`${n}`});}assert.equal(s.lastLesson,189);assert.equal(planNext(s,'2027-12-01').send,false);
});
test('email points to matching lesson and explains browser/offline use',()=>{const p={date:'2026-11-11',lesson:1,version:COURSE_VERSION},m=emailFor(p);assert.ok(m.url.endsWith('/lesson-001/'));assert.ok(m.html.includes(m.url));assert.ok(m.text.includes('浏览器'));assert.ok(m.subject.includes('第1课'));assert.ok(!m.html.includes('<script'));});
