import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,VERSION,availability,lessonFor} from './model.mjs';
import {build,OUTPUT,folder,baseURL} from './build.mjs';
import {hash,esc} from '../build.mjs';
import {todayInShanghai,scheduledDate} from '../daily.mjs';
import {requireKey,lessonKey,unseal} from './crypto.mjs';
import {verifySampleOnline} from './publisher-samples.mjs';
import {readableCourse,createMailAttachments} from './mail-package.mjs';
const STATE=path.resolve(ROOT,'..','state.json'),PLAN=path.join(OUTPUT,'plan.json');
export function validateState(s){
 if(s.schema!==1||!Number.isInteger(s.lastLesson)||s.lastLesson<0||!Array.isArray(s.history)||s.lastLesson!==(s.history.at(-1)?.lesson||0)||s.history.some((h,i)=>!Number.isInteger(h.lesson)||h.lesson<1||(i>0&&h.lesson<=s.history[i-1].lesson)||h.status!=='sent'||!/^\d{4}-\d{2}-\d{2}$/.test(h.date))||new Set(s.history.map(h=>h.date)).size!==s.history.length)throw Error('Invalid delivery history; never reset it');return s;
}
export function nextLesson(s,manual={schema:1,history:[]}){
 validateState(s);
 if(manual.schema!==1||!Array.isArray(manual.history)||manual.history.some(h=>h.status!=='sent'||!Number.isInteger(h.lesson)||h.lesson<1))throw Error('Invalid manual delivery history');
 if(manual.inFlight)throw Error('Uncertain manual SMTP attempt; inspect receipt before retrying');
 // Skip only consecutive accepted lessons. Sending a distant lesson must not discard intermediate lessons.
 const delivered=new Set(manual.history.map(h=>h.lesson));let n=s.lastLesson+1;while(delivered.has(n))n++;return n;
}
export function planNext(s,date,{readiness=availability,manual={schema:1,history:[]}}={}){
 validateState(s);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid date');if(s.inFlight)throw Error('Uncertain SMTP attempt; inspect receipt before retrying');if(s.history.some(h=>h.date===date))return {send:false,reason:'Already sent for this date'};if(s.history.length&&date<s.history.at(-1).date)throw Error('Cannot send backwards');
 const number=nextLesson(s,manual),status=readiness(number);if(!status.ready)return {send:false,waitingForContent:true,nextLesson:number,reason:status.reason};return {send:true,date,lesson:number,version:VERSION};
}
export function claim(s,p,sha,options={}){const current=planNext(s,p.date,options);if(!current.send||current.lesson!==p.lesson||p.version!==VERSION)throw Error('Plan is stale');return {...s,inFlight:{date:p.date,lesson:p.lesson,sha,version:VERSION,run:process.env.GITHUB_RUN_ID||'local'}};}
export function accept(s,p,r){if(!s.inFlight||s.inFlight.lesson!==p.lesson||s.inFlight.date!==p.date||r.accepted!==true)throw Error('Missing confirmed acceptance');const {inFlight,...rest}=s;return {...rest,lastLesson:p.lesson,history:[...s.history,{date:p.date,lesson:p.lesson,status:'sent',sha:inFlight.sha,messageId:r.messageId,run:inFlight.run,version:VERSION}]};}
const readState=()=>validateState(JSON.parse(fs.readFileSync(STATE,'utf8'))),writeState=s=>fs.writeFileSync(STATE,JSON.stringify(s,null,2)+'\n');
const readManual=()=>{const f=path.resolve(ROOT,'..','manual-deliveries.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{schema:1,history:[]};};
const dirFor=p=>path.join(OUTPUT,folder(p.lesson));
export function checkAssets(p){const dir=dirFor(p),pub=path.join(dir,'public'),m=JSON.parse(fs.readFileSync(path.join(pub,'manifest.json'),'utf8')),privateData=JSON.parse(fs.readFileSync(path.join(dir,'private.json'),'utf8'));if(m.schema!==2||m.version!==VERSION||m.number!==p.lesson||privateData.number!==p.lesson)throw Error('Wrong lesson manifest');if(hash(fs.readFileSync(path.join(dir,'offline.html')))!==m.contentHash||hash(fs.readFileSync(path.join(pub,'index.html')))!==m.assets['index.html'])throw Error('Lesson bytes changed');const expected=lessonFor(p.lesson),html=fs.readFileSync(path.join(dir,'offline.html'),'utf8'),embedded=JSON.parse(html.match(/const LESSON=([\s\S]*?);<\/script>/)?.[1]||'null');for(const [key,value]of Object.entries(expected))if(JSON.stringify(embedded?.[key])!==JSON.stringify(value))throw Error('Published lesson no longer matches approved content');return {manifest:m,privateData};}
export async function restoreOrBuild(p){const source=path.resolve(ROOT,'..','..','english',folder(p.lesson)),dir=dirFor(p);if(!fs.existsSync(source)){await build(p.lesson);return;}const m=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));if(m.schema!==2||m.version!==VERSION||m.number!==p.lesson)throw Error('Existing lesson is not the expected version');const locked=fs.readFileSync(path.join(source,'index.html'),'utf8');if(hash(locked)!==m.assets['index.html'])throw Error('Published encrypted page was changed');const key=lessonKey(requireKey(process.env.ENGLISH_CONTENT_KEY),p.lesson,m.contentHash),box=JSON.parse(locked.match(/const BOX=(.*?);async function/)?.[1]||'null'),html=unseal(box,key);if(hash(html)!==m.contentHash)throw Error('Published offline content was changed');fs.mkdirSync(path.join(dir,'public'),{recursive:true});fs.writeFileSync(path.join(dir,'offline.html'),html);const l=lessonFor(p.lesson);fs.writeFileSync(path.join(dir,'private.json'),JSON.stringify({number:p.lesson,contentHash:m.contentHash,key:key.toString('hex'),title:l.title,book:l.reading.title,minutes:l.minutes,requiresNetwork:l.reading.mode==='publisher-sample',pages:l.reading.pageNumbers||null,practice:l.practice}));for(const name of ['index.html','manifest.json'])fs.copyFileSync(path.join(source,name),path.join(dir,'public',name));console.log('Reused verified encrypted lesson');}
export async function verifyHosted(p,{attempts=120,delay=5000}={}){checkAssets(p);const reading=lessonFor(p.lesson).reading;if(reading.mode==='publisher-sample')await verifySampleOnline(reading);for(let i=0;i<attempts;i++){try{for(const name of ['index.html','manifest.json']){const r=await fetch(`${baseURL}/${folder(p.lesson)}/${name}?v=${Date.now()}`,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==hash(fs.readFileSync(path.join(dirFor(p),'public',name))))throw Error('Hosted file mismatch');}console.log('Encrypted hosted assets verified byte-for-byte');return;}catch{if(i===attempts-1)throw Error('Hosted verification failed; no email sent');await new Promise(r=>setTimeout(r,delay));}}}
export function emailFor(p,meta){
 const url=`${baseURL}/${folder(p.lesson)}/#key=${meta.key}`,subject=`桃子英语｜第${p.lesson}课｜${meta.title}｜${p.date}`,minutes=Object.values(meta.minutes).reduce((a,b)=>a+b,0),network=meta.requiresNetwork===true;
 const lesson=lessonFor(p.lesson),reading=lesson.reading;
 const readable=readableCourse(lesson);
 const scope=network?` · ${reading.pageNumberType==='source-document'?'指南':'原书'}第${meta.pages.join('–')}页（${reading.pageNumberType==='source-document'?'原书文字摘录':'官方样章'}）`:'';
 const offline=network?'附件中的词汇、讲解音频和题目可离线使用；原书图文需联网打开出版社阅读器，无需登录。':'附件为内嵌图文音频的完整HTML，用浏览器打开可离线学习。';
 const flow=network?'看图听音 → 遮住回忆 → 听音选图 → 补全拼写；官方原书样章 → 重点片段跟读 → 词汇语法讲解 → 1–2道理解题。':'看图听音 → 遮住回忆 → 听音选图 → 补全拼写；原书逐句伴读、词汇语法讲解和1–2道理解题。';
 const practice=meta.practice&&meta.practice!=='learn'?'本课复习上一课的五个词，不新增五个词。':'本课学习五个重点词。';
 const words=lesson.words.map(w=>w.word+'（'+w.meaning+'）').join('、');
 const location=reading.guidePanel?reading.readerPages:reading.readerPages?'阅读器 '+reading.readerPages:'';
 const sourceLink=reading.mode==='publisher-sample'?reading.readerUrl:null;
 const questions=reading.questions.map((q,i)=>(i+1)+'. '+q.prompt);
 const text=[
  subject,'在浏览器中开始学习：'+url,'附件预览不支持声音和答题，请用浏览器打开。',
  meta.title,practice,words,meta.book+scope,location,reading.readingGuide||'',
  sourceLink?'出版社原书：'+sourceLink:'',reading.grammar.title,...questions,
  '约'+minutes+'分钟。'+offline,flow,readable.text,'学习密钥（仅本课）：'+meta.key
 ].filter(Boolean).join('\n\n');
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="font-family:-apple-system,'PingFang SC',sans-serif;color:#254b3b;padding:20px"><div style="max-width:620px;margin:auto">
 <p>🍑 桃子英语 · 第${p.lesson}课 · ${minutes}分钟</p><h1>${esc(meta.title)}</h1>
 <p><a href="${esc(url)}" style="display:inline-block;background:#276a56;color:white;padding:14px 22px;border-radius:10px">在浏览器中开始学习 →</a></p>
 <p>网页打不开时，可直接往下读本邮件，播放随信的 01 和 02 两个 MP3 音频。互动版请用 Safari、Chrome 或 Edge 打开，不要在附件预览中学习。</p>
 <p style="overflow-wrap:anywhere;word-break:break-all">${esc(url)}</p>
 <p><b>词汇：</b>${esc(words)}</p><h2>${esc(meta.book+scope)}</h2>
 <p>${esc(location)}　${esc(reading.readingGuide||'')}</p>
 ${sourceLink?`<p><a href="${esc(sourceLink)}">直接打开出版社原书 ↗</a></p>`:''}
 <p>${esc(reading.grammar.title)}</p><ol>${reading.questions.map(q=>'<li>'+esc(q.prompt)+'</li>').join('')}</ol>
 <p>${esc(flow)}</p><p>${esc(offline)}</p>${readable.html}
 <p>如果网页提示输入学习密钥，复制下面这串字符。</p><p style="overflow-wrap:anywhere;word-break:break-all">${esc(meta.key)}</p></div></body></html>`;
 return {url,subject,text,html};
}

async function command(cmd){fs.mkdirSync(OUTPUT,{recursive:true});if(cmd==='readiness'){const s=readState(),n=nextLesson(s,readManual()),status=availability(n);if(status.ready){const reading=lessonFor(n).reading;if(reading.mode==='publisher-sample')await verifySampleOnline(reading);}console.log(JSON.stringify({nextLesson:n,...status}));return;}
 if(cmd==='prepare'){const date=process.env.ENGLISH_SCHEDULED==='true'?scheduledDate():todayInShanghai();const p=date?planNext(readState(),date,{manual:readManual()}):{send:false,reason:'Outside 18:00–06:00 Shanghai window'};fs.writeFileSync(PLAN,JSON.stringify(p,null,2));if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`should_send=${p.send}\nlesson=${p.lesson||0}\n`);console.log(p.send?`Prepared lesson ${p.lesson}`:p.reason);return;}
 const p=JSON.parse(fs.readFileSync(PLAN,'utf8'));if(!p.send)throw Error('No approved lesson planned');if(cmd==='build'){await restoreOrBuild(p);checkAssets(p);createMailAttachments(p);return;}if(cmd==='verify'){await verifyHosted(p);return;}
 if(cmd==='publish'){checkAssets(p);const dest=path.resolve(ROOT,'..','..','english',folder(p.lesson));fs.mkdirSync(dest,{recursive:true});for(const name of ['index.html','manifest.json']){const data=fs.readFileSync(path.join(dirFor(p),'public',name)),target=path.join(dest,name);if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==hash(data))throw Error('Existing lesson cannot be overwritten');fs.writeFileSync(target,data);}return;}
 if(cmd==='claim'){writeState(claim(readState(),p,checkAssets(p).manifest.assets['index.html'],{manual:readManual()}));return;}
 if(cmd==='send'){await verifyHosted(p,{attempts:2,delay:2000});const {manifest,privateData}=checkAssets(p),s=readState();if(s.inFlight?.lesson!==p.lesson||s.inFlight.date!==p.date||s.inFlight.sha!==manifest.assets['index.html'])throw Error('No matching persisted claim');for(const v of ['SMTP_HOST','SMTP_USER','SMTP_PASS','ENGLISH_EMAIL_TO'])if(!process.env[v])throw Error('Missing '+v);const {default:nodemailer}=await import('nodemailer');const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:(process.env.SMTP_SECURE||'true')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:30000,socketTimeout:60000}),mail=emailFor(p,privateData);const result=await transport.sendMail({from:process.env.REPORT_EMAIL_FROM||process.env.SMTP_USER,to:process.env.ENGLISH_EMAIL_TO,...mail,url:undefined,messageId:`<peach-english-${p.date}-${p.lesson}@peach-lessons.local>`,attachments:createMailAttachments(p)});const recipient=process.env.ENGLISH_EMAIL_TO.trim().toLowerCase();if(!result.accepted?.some(a=>String(a).toLowerCase()===recipient)||result.rejected?.length)throw Error('Recipient not accepted');const receipt={accepted:true,date:p.date,lesson:p.lesson,recipient,messageId:result.messageId,publicURL:`${baseURL}/${folder(p.lesson)}/`,at:new Date().toISOString()};fs.writeFileSync(path.join(OUTPUT,'receipt.json'),JSON.stringify(receipt,null,2));writeState(accept(s,p,receipt));console.log(`SMTP accepted lesson ${p.lesson}`);return;}throw Error('Unknown command');}
if(process.argv[1]===fileURLToPath(import.meta.url))command(process.argv[2]).catch(()=>{console.error('English delivery stopped; inspect content readiness, asset checks and the persisted send claim. No secrets are printed.');process.exitCode=1;});
