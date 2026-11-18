import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {planManual,claimManual,acceptManual,entryNotice} from './manual.mjs';
const fresh=()=>({schema:1,history:[]});const request='user-20261111-latest-01';
test('entry notice sends the new encrypted URL and clearly labels the existing lesson',()=>{
 const key='a'.repeat(64),mail=entryNotice({lesson:7,date:'2026-11-18'},{key,title:'健康主题',book:'The Hunt for Gold',minutes:{vocabulary:10,reading:10,review:3},requiresNetwork:true,pages:[5,6]});
 for(const body of [mail.html,mail.text]){assert.ok(body.includes('https://peach-english-lessons.zhen-gwe-ngang.chatgpt.site/english/lesson-007/#key='+key));assert.ok(body.includes('不是一节新课'));assert.ok(!body.includes('github.io'));}
 assert.ok(mail.subject.includes('新的免登录学习入口'));assert.ok(!mail.html.includes('<script'));
});
test('manual delivery has its own claim and accepted receipt without advancing daily progress',()=>{
 const s=fresh(),p=planManual(s,request,2,'2026-11-11'),c=claimManual(s,p,'a'.repeat(64));
 assert.deepEqual(s,fresh());assert.equal(c.inFlight.lesson,2);assert.equal(c.lastLesson,undefined);
 assert.throws(()=>planManual(c,request,2,'2026-11-11'),/Uncertain/);
 assert.throws(()=>acceptManual(c,p,{accepted:false}));
 const done=acceptManual(c,p,{accepted:true,messageId:'test',at:'2026-11-11T08:00:00Z'});
 assert.equal(done.inFlight,undefined);assert.equal(done.history.length,1);assert.equal(planManual(done,request,2,'2026-11-11').send,false);
 assert.equal(planManual(done,'user-20261111-latest-02',2,'2026-11-11').send,true);
});
test('manual delivery rejects invalid request IDs and mismatched claims',()=>{
 for(const id of['','../../escape','new\nheader'])assert.throws(()=>planManual(fresh(),id,2,'2026-11-11'));
 assert.throws(()=>planManual(fresh(),request,2.5,'2026-11-11'));
 const p=planManual(fresh(),request,2,'2026-11-11'),c=claimManual(fresh(),p,'a'.repeat(64));
 assert.throws(()=>acceptManual(c,{...p,lesson:3},{accepted:true,messageId:'x'}));
 assert.throws(()=>acceptManual(c,{...p,request:'different-request'},{accepted:true,messageId:'x'}));
});
test('manual workflow is explicit only and excludes plaintext lessons and key-bearing files',()=>{
 const w=fs.readFileSync(new URL('../manual-workflow.yml',import.meta.url),'utf8');
 assert.ok(w.includes('workflow_dispatch:'));assert.ok(!w.includes('schedule:'));assert.ok(!w.includes('workflow_run:'));
 assert.ok(w.includes('group: peach-english-daily'));assert.ok(w.includes('ref: main')); assert.ok(w.includes('ctmt1412@qq.com'));
 assert.ok(!w.includes('offline.html'));assert.ok(!w.includes('private.json'));assert.ok(!w.includes('output/v2/\n'));
});
