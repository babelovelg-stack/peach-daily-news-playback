import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {PACKS} from './vocabulary.mjs';import {assemble,validateReading,availability,VERSION,lessonFor,readCatalog,validateCatalog} from './model.mjs';import {seal,unseal,requireKey,lessonKey} from './crypto.mjs';import {jobsFor,render,verifyAudio,lockedPage} from './build.mjs';import {planNext,claim,accept,emailFor,nextLesson,validateState} from './delivery.mjs';import {hash} from '../build.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
export const fixture=()=>({id:'test-only',title:'界面测试样本，非原书',series:'Oxford Reading Tree',level:'7',sourceName:'synthetic QA fixture',sourceSha256:'a'.repeat(64),testFixture:true,verifiedAgainstSource:true,pages:[{label:'测试第1页',image:png,sentences:[{text:'The bag is blue.',translation:'包是蓝色的。'},{text:'I can see the bag.',translation:'我能看见这个包。'}]},{label:'测试第2页',image:png,sentences:[{text:'The bag is on a chair.',translation:'包在椅子上。'}]}],glossary:[{term:'bag',meaning:'包',explanation:'这里指装东西的包。'}],grammar:{title:'用 is 描述物品',quote:'The bag is blue.',explanation:'这里用 is 连接物品和颜色。'},questions:[{prompt:'包是什么颜色？',options:['蓝色','红色','绿色'],answer:0,explanation:'第一句告诉我们颜色。',evidence:'The bag is blue.'},{prompt:'包在哪里？',options:['床上','椅子上','地上'],answer:1,explanation:'最后一句说明位置。',evidence:'The bag is on a chair.'}]});
const fresh=()=>({schema:1,lastLesson:1,history:[{lesson:1,date:'2026-11-11',status:'sent'}]});
test('preview offers five sourced words and cannot impersonate an original book',()=>{const l=assemble(2,PACKS.food,null,{preview:true});assert.equal(l.words.length,5);assert.equal(l.reading,null);assert.equal(l.preview,true);assert.equal(Object.keys(l.speech).length,16);assert.throws(()=>assemble(2,PACKS.food));assert.equal(availability(8).ready,false);});
test('test fixtures are never production readings',()=>{assert.throws(()=>validateReading(fixture()),/Test reading/);const r=validateReading(fixture(),{allowFixture:true});assert.ok(Object.values(r.minutes).reduce((a,b)=>a+b,0)<=25);});
test('missing source images, unverified sources and fabricated quotations block delivery',()=>{let r=fixture();r.pages[0].image='https://example.com/a.png';assert.throws(()=>validateReading(r,{allowFixture:true}),/embedded/);r=fixture();r.verifiedAgainstSource=false;assert.throws(()=>validateReading(r,{allowFixture:true}),/checked/);r=fixture();r.grammar.quote='Not in the original';assert.throws(()=>validateReading(r,{allowFixture:true}),/exact original/);r=fixture();r.questions[0].evidence='invented';assert.throws(()=>validateReading(r,{allowFixture:true}),/evidence/);});
test('long readings and excess comprehension tasks must be edited before delivery',()=>{let r=fixture();r.pages[0].sentences[0].text='word '.repeat(151);assert.throws(()=>validateReading(r,{allowFixture:true}),/shorter/);r=fixture();r.questions.push(r.questions[0]);assert.throws(()=>validateReading(r,{allowFixture:true}),/1–2/);});
test('real original sentences bind to individual audio clips and original pictures',()=>{const l=assemble(2,PACKS.food,fixture(),{allowFixture:true});assert.equal(l.speech.line0_0.text,l.reading.pages[0].sentences[0].text);assert.equal(l.speech.line1_0.language,'en');assert.equal(l.speech.grammar.language,'zh');assert.equal(jobsFor(l).grammar.voice,'zh-CN-XiaoyiNeural');});
test('rendered HTML is self-contained, valid JS and rejects mismatched audio',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'peach-v2-'));try{const l=assemble(2,PACKS.food,null,{preview:true}),m={};for(const [id,job]of Object.entries(jobsFor(l))){const p=path.join(d,id+'.mp3'),buf=Buffer.alloc(700,1);fs.writeFileSync(p,buf);m[id]={job,path:p,sha256:hash(buf)};}const html=render(l,m);assert.ok(html.includes('data:image/png;base64,'));assert.ok(html.includes('data:audio/mpeg;base64,'));assert.ok(!html.includes('/*__'));for(const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);m.word0.job={...m.word0.job,text:'stale'};assert.throws(()=>verifyAudio(l,m),/mismatch/);}finally{fs.rmSync(d,{recursive:true,force:true});}});
test('encrypted content rejects wrong keys and byte tampering',()=>{const key=crypto.randomBytes(32),box=seal('PRIVATE BOOK TEXT',key);assert.equal(unseal(box,key),'PRIVATE BOOK TEXT');assert.throws(()=>unseal(box,crypto.randomBytes(32)));const altered={...box,data:Buffer.from('bad').toString('base64')};assert.throws(()=>unseal(altered,key));assert.throws(()=>requireKey('bad'));const page=lockedPage('PRIVATE BOOK TEXT',key);assert.ok(!page.includes('PRIVATE BOOK TEXT'));for(const s of page.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);});
test('public lesson keys are content-specific and do not reveal the library key',()=>{const master=crypto.randomBytes(32),a=lessonKey(master,2,'one'),b=lessonKey(master,2,'two');assert.notDeepEqual(a,b);assert.notDeepEqual(a,master);});
test('missing original content stops future delivery without using the old curriculum',()=>{const s=fresh(),p=planNext(s,'2026-11-12',{readiness:()=>availability(8)});assert.equal(p.send,false);assert.equal(p.waitingForContent,true);assert.equal(p.nextLesson,2);assert.equal(s.lastLesson,1);assert.equal(planNext(s,'2026-11-11').send,false);});
test('available lessons retain sequence, deduplication and uncertain-send protection',()=>{const readiness=()=>({ready:true}),s=fresh(),p=planNext(s,'2026-11-13',{readiness});assert.equal(p.lesson,2);assert.equal(p.version,VERSION);const c=claim(s,p,'hash',{readiness});assert.throws(()=>planNext(c,'2026-11-13',{readiness}),/Uncertain/);assert.throws(()=>accept(c,p,{accepted:false}));const sent=accept(c,p,{accepted:true,messageId:'test'});assert.equal(sent.lastLesson,2);assert.equal(planNext(sent,'2026-11-13',{readiness}).send,false);assert.throws(()=>claim(s,{...p,version:'old'},'hash',{readiness}),/stale/);});
test('email includes an individual fragment key and the two-part content budget',()=>{const m=emailFor({lesson:2,date:'2026-11-12'},{key:'a'.repeat(64),title:'测试词组',book:'测试标题',minutes:{vocabulary:10,reading:10,review:3}});assert.ok(m.url.includes('/lesson-002-r2/#key='));assert.ok(m.text.includes('23分钟'));assert.ok(m.html.includes('1–2'));assert.ok(!m.subject.includes('15分钟'));});
test('workflow does not export private books, plaintext audio or unlock keys as artifacts/cache',()=>{const w=fs.readFileSync(new URL('../workflow.yml',import.meta.url),'utf8');assert.ok(!w.includes('uses: actions/cache'));assert.ok(!w.includes('english-daily/output\n'));assert.ok(w.includes('lesson-*/public'));assert.ok(w.includes('ref: main')); assert.ok(w.includes('english-daily/v2/delivery.mjs prepare'));assert.ok(w.includes("cron: '0,15,30,45 10 * * *'"));});

import {SAMPLES,validateSample,validateSampleLibrary,verifySampleOnline} from './publisher-samples.mjs';
test('six verified public-sample lessons have bounded scope, quote budgets and no republished pages',()=>{
 assert.equal(SAMPLES.length,6);assert.equal(validateSampleLibrary(),true);
 for(const number of [2,3,4,5,6,7]){const l=lessonFor(number);assert.equal(l.reading.mode,'publisher-sample');assert.equal(l.reading.requiresLogin,false);assert.equal(l.reading.pages,undefined);assert.equal(l.words.length,5);assert.equal(l.speech.focusQuote.text,l.reading.grammar.quote);assert.ok(Object.values(l.minutes).reduce((a,b)=>a+b,0)<=25);}
 assert.equal(availability(8).ready,false);assert.equal(lessonFor(3).practice,'learn');
});
test('login-only, copied-page, unreviewed and out-of-range evidence cannot pass as public samples',()=>{
 const bad=change=>{const r=structuredClone(SAMPLES[0]);change(r);assert.throws(()=>validateSample(r));};
 bad(r=>r.requiresLogin=true);bad(r=>r.pages=[{}]);bad(r=>r.verifiedAgainstSource=false);bad(r=>r.questions[0].evidencePage=30);bad(r=>r.readerUrl='https://example.com');bad(r=>r.evidenceAssets[0].sha256='0'.repeat(64));
 const many=SAMPLES.slice(0,3).map((r,i)=>({...structuredClone(r),grammar:{...r.grammar,quote:Array(10).fill(['one','two','three'][i]).join(' ')}}));assert.throws(()=>validateSampleLibrary(many),/budget/);
});
test('publisher source failure or replacement stops online verification',async()=>{
 await assert.rejects(verifySampleOnline(SAMPLES[0],{fetcher:async()=>({ok:false})}),/unavailable/);
 await assert.rejects(verifySampleOnline(SAMPLES[0],{fetcher:async()=>({ok:true,arrayBuffer:async()=>Buffer.from('changed')})}),/unavailable/);
});
test('sample emails distinguish online original pages from offline exercises and label review',()=>{
 const m=emailFor({lesson:3,date:'2026-11-13'},{key:'a'.repeat(64),title:'餐桌词',book:'The Broken Roof',minutes:{vocabulary:10,reading:10,review:3},requiresNetwork:true,pages:[3,4],practice:'recall'});
 assert.ok(m.text.includes('无需登录'));assert.ok(m.text.includes('原书第3–4页'));assert.ok(m.text.includes('不新增五个词'));assert.ok(!m.text.includes('完整HTML'));assert.ok(!m.text.includes('逐句伴读'));
});

test('accepted manual lessons count toward sequence without skipping an undelivered gap',()=>{
 const s=fresh(),manual={schema:1,history:[{lesson:2,status:'sent'}]},opts={manual,readiness:()=>({ready:true})};
 assert.equal(nextLesson(s,manual),3);const p=planNext(s,'2026-11-12',opts);assert.equal(p.lesson,3);
 const sent=accept(claim(s,p,'hash',opts),p,{accepted:true,messageId:'test'});assert.equal(validateState(sent).lastLesson,3);
 assert.deepEqual(sent.history.map(h=>h.lesson),[1,3]);assert.equal(planNext(sent,'2026-11-12',opts).send,false);
 assert.equal(nextLesson(s,{schema:1,history:[{lesson:4,status:'sent'}]}),2);
 assert.throws(()=>nextLesson(s,{...manual,inFlight:{lesson:3}}),/Uncertain/);
 assert.throws(()=>claim(s,{...p,lesson:2},'hash',opts),/stale/);
});
test('daily catalog rejects repeated target words, repeated reading and review-only lessons',()=>{
 const c=readCatalog();assert.equal(c.lessons.length,6);
 const mutate=f=>{const d=structuredClone(c);f(d);assert.throws(()=>validateCatalog(d));};
 mutate(d=>d.lessons[1].packId='food');mutate(d=>d.lessons[1].readingId=d.lessons[0].readingId);mutate(d=>d.lessons[1].practice='recall');mutate(d=>d.lessons[1].number=10);
 assert.equal(new Set(c.lessons.flatMap(l=>lessonFor(l.number).words.map(w=>w.id))).size,30);
});
test('mail-preview fallback is present without scripts and hides unusable controls',()=>{
 const template=fs.readFileSync(new URL('./lesson.html',import.meta.url),'utf8'),app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
 assert.ok(template.includes('id="openHelp"'));assert.ok(template.includes('id="courseApp" hidden'));assert.ok(template.includes('附件预览不能运行'));
 assert.ok(app.includes("$('#courseApp').hidden=false"));
 const mail=emailFor({lesson:3,date:'2026-11-13'},{key:'a'.repeat(64),title:'饮品',book:'The Broken Roof',minutes:{vocabulary:10,reading:10,review:3},requiresNetwork:true,pages:[3,4],practice:'learn'});
 assert.ok(mail.html.indexOf('在浏览器中开始学习')<mail.html.indexOf('<b>词汇：'));
 assert.ok(mail.text.includes('附件预览不支持'));assert.ok(mail.html.includes('不要在附件预览中学习'));
});
