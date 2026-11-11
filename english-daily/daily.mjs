import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,build,writeArchive,hash,esc,baseURL,lessonKey} from './build.mjs';
import {lessonFor,TOTAL_LESSONS,COURSE_VERSION} from './course.mjs';
const STATE=path.join(ROOT,'state.json'), OUT=path.join(ROOT,'output'), PLAN=path.join(OUT,'plan.json');
export const todayInShanghai=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function scheduledDate(now=new Date()){
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(hour>=18)return todayInShanghai(now);
  if(hour<6)return todayInShanghai(new Date(now.getTime()-86400000));
  return null;
}
export function validateState(s){
  if(s.schema!==1||!Number.isInteger(s.lastLesson)||s.lastLesson<0||s.lastLesson>TOTAL_LESSONS||!Array.isArray(s.history))throw Error('Invalid delivery state');
  if(s.history.length!==s.lastLesson||s.history.some((x,i)=>x.lesson!==i+1||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||x.status!=='sent'))throw Error('Delivery history is not contiguous');
  if(new Set(s.history.map(x=>x.date)).size!==s.history.length)throw Error('Duplicate delivery date');
  return s;
}
export function planNext(s,date){
  validateState(s);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid date');
  if(s.inFlight)throw Error('An email attempt has an uncertain outcome. Inspect its run receipt before resolving state; automatic resend is blocked.');
  if(s.history.some(x=>x.date===date))return {send:false,reason:'Already sent for this date'};
  if(s.history.length&&date<s.history.at(-1).date)throw Error('Cannot deliver backwards in time');
  if(s.lastLesson===TOTAL_LESSONS)return {send:false,reason:'189-lesson course complete; no automatic repeat'};
  return {send:true,date,lesson:s.lastLesson+1,version:COURSE_VERSION};
}
export function markSending(s,p,sha){
  const expected=planNext(s,p.date);
  if(!expected.send||expected.lesson!==p.lesson||p.version!==COURSE_VERSION)throw Error('Plan no longer matches state');
  return {...s,inFlight:{date:p.date,lesson:p.lesson,sha,status:'sending',run:process.env.GITHUB_RUN_ID||'local'}};
}
export function markSent(s,p,receipt){
  if(!s.inFlight||s.inFlight.lesson!==p.lesson||s.inFlight.date!==p.date||receipt.accepted!==true)throw Error('Missing confirmed SMTP acceptance');
  const {inFlight,...rest}=s;
  return {...rest,lastLesson:p.lesson,history:[...s.history,{date:p.date,lesson:p.lesson,status:'sent',sha:inFlight.sha,messageId:receipt.messageId,run:inFlight.run}]};
}
function readState(){return validateState(JSON.parse(fs.readFileSync(STATE,'utf8')));}
function writeState(s){fs.writeFileSync(STATE,JSON.stringify(s,null,2)+'\n');}
function plan(){return JSON.parse(fs.readFileSync(PLAN,'utf8'));}
function artifactDir(p){return path.join(OUT,lessonKey(p.lesson));}
export function checkAssets(p,dir=artifactDir(p)){
  const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  if(m.number!==p.lesson||m.version!==COURSE_VERSION)throw Error('Manifest version or lesson mismatch');
  for(const name of ['index.html','lesson.json','speech.txt'])if(hash(fs.readFileSync(path.join(dir,name)))!==m.assets[name])throw Error('Asset integrity failed: '+name);
  const l=JSON.parse(fs.readFileSync(path.join(dir,'lesson.json'),'utf8')),expected=lessonFor(p.lesson);
  for(const [key,value] of Object.entries(expected))if(JSON.stringify(l[key])!==JSON.stringify(value))throw Error('Lesson content differs from curriculum: '+key);
  return m;
}
export async function verifyHosted(p,{attempts=120,delay=5000}={}){
  const dir=artifactDir(p),names=['index.html','lesson.json','speech.txt','manifest.json'];checkAssets(p);
  for(let n=0;n<attempts;n++){
    try{
      for(const name of names){const u=`${baseURL}/${lessonKey(p.lesson)}/${name}?v=${Date.now()}`;const r=await fetch(u,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)throw Error('Not published');const remote=Buffer.from(await r.arrayBuffer());if(hash(remote)!==hash(fs.readFileSync(path.join(dir,name))))throw Error('Hosted bytes differ');}
      console.log('Hosted lesson verified byte-for-byte');return;
    }catch{if(n===attempts-1)throw Error('Hosted lesson verification failed; no email sent');await new Promise(r=>setTimeout(r,delay));}
  }
}
export function emailFor(p){
  const l=lessonFor(p.lesson),url=`${baseURL}/${lessonKey(p.lesson)}/`,subject=`桃子英语15分钟｜第${p.lesson}课 ${l.title}｜${p.date}`;
  const text=`${subject}\n\n今天的小目标：${l.focus}\n学习安排：听故事2分钟、词汇3分钟、语法3分钟、互动4分钟、表达3分钟。\n\n打开学习课：${url}\n课程目录：${baseURL}/\n\n附件是内嵌语音的离线HTML，下载后用浏览器打开。邮箱预览不支持完整互动。\n每周第7天复习；作答和录音仅留在本机。原创新课，不是商业教材原页。`;
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#f5f5ef;font-family:-apple-system,'PingFang SC',sans-serif;color:#253a36"><div style="max-width:620px;margin:24px auto;padding:28px;background:#fffef9;border-radius:20px"><p style="color:#6d8065;font-size:13px">🍑 桃子英语 · WEEK ${l.week} · DAY ${l.day}</p><h1 style="font-size:28px">${esc(l.title)}</h1><p>第${p.lesson}课 · ${esc(l.type)} · 约15分钟</p><div style="padding:18px;background:#e7efe1;border-radius:12px"><strong>今天学会：${esc(l.focus)}</strong><p>${esc(l.rule)}</p></div><p style="line-height:2">听故事 2分钟 → 学词汇 3分钟 → 找规律 3分钟 → 小挑战 4分钟 → 我表达 3分钟</p><p style="margin:28px 0"><a href="${url}" style="display:inline-block;padding:15px 30px;background:#276857;color:white;text-decoration:none;border-radius:12px;font-weight:bold">打开今天的英语课 →</a></p><p style="font-size:14px;color:#64736c">请在浏览器打开，邮件预览无法播放完整互动。附件含内嵌语音，可保存后离线学习。</p><p><a href="${baseURL}/" style="color:#276857">回看已推送课程</a></p><p style="font-size:12px;color:#7b867e">每日18:00（北京时间）开始云端推送，定时任务可能延迟。作答与录音仅留在本机。Level 3 难度起步的原创课程。</p></div></body></html>`;
  return {subject,text,html,url};
}
async function command(cmd){
  fs.mkdirSync(OUT,{recursive:true});
  if(cmd==='prepare'){
    const date=process.env.ENGLISH_SCHEDULED==='true'?scheduledDate():todayInShanghai();
    const p=date?planNext(readState(),date):{send:false,reason:'Outside the 18:00–06:00 Shanghai delivery window'};
    fs.writeFileSync(PLAN,JSON.stringify(p,null,2));
    if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`should_send=${p.send}\nlesson=${p.lesson||0}\n`);
    console.log(p.send?`Prepared lesson ${p.lesson} for ${date}`:p.reason);return;
  }
  const p=plan();if(!p.send)throw Error('No planned delivery');
  if(cmd==='build'){
    const published=path.resolve(ROOT,'..','english',lessonKey(p.lesson));
    if(fs.existsSync(published)){
      checkAssets(p,published);fs.mkdirSync(artifactDir(p),{recursive:true});
      for(const name of ['index.html','lesson.json','speech.txt','manifest.json'])fs.copyFileSync(path.join(published,name),path.join(artifactDir(p),name));
      writeArchive(p.lesson);console.log('Reused verified published lesson for safe delivery retry');
    }else await build(p.lesson);
    checkAssets(p);return;
  }
  if(cmd==='verify'){await verifyHosted(p);return;}
  if(cmd==='publish'){
    checkAssets(p);const dest=path.resolve(ROOT,'..','english',lessonKey(p.lesson));fs.mkdirSync(dest,{recursive:true});
    for(const name of ['index.html','lesson.json','speech.txt','manifest.json']){
      const target=path.join(dest,name),data=fs.readFileSync(path.join(artifactDir(p),name));
      if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==hash(data))throw Error('Existing lesson cannot be silently overwritten: '+name);
      fs.writeFileSync(target,data);
    }
    fs.copyFileSync(path.join(OUT,'index.html'),path.join(dest,'..','index.html'));return;
  }
  if(cmd==='claim'){
    const m=checkAssets(p);writeState(markSending(readState(),p,m.assets['index.html']));return;
  }
  if(cmd==='send'){
    await verifyHosted(p,{attempts:2,delay:2000});const s=readState(),m=checkAssets(p);
    if(!s.inFlight||s.inFlight.date!==p.date||s.inFlight.lesson!==p.lesson||s.inFlight.sha!==m.assets['index.html'])throw Error('No persisted matching send claim');
    for(const v of ['SMTP_HOST','SMTP_USER','SMTP_PASS','ENGLISH_EMAIL_TO'])if(!process.env[v])throw Error('Missing '+v);
    const {default:nodemailer}=await import('nodemailer');
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:(process.env.SMTP_SECURE||'true')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:30000,socketTimeout:60000});
    const mail=emailFor(p);
    const result=await transport.sendMail({from:process.env.REPORT_EMAIL_FROM||process.env.SMTP_USER,to:process.env.ENGLISH_EMAIL_TO,subject:mail.subject,text:mail.text,html:mail.html,messageId:`<peach-english-${p.date}-${p.lesson}@peach-lessons.local>`,attachments:[{filename:`Peach-English-Day-${String(p.lesson).padStart(3,'0')}.html`,content:fs.readFileSync(path.join(artifactDir(p),'index.html')),contentType:'text/html; charset=utf-8'}]});
    const recipient=process.env.ENGLISH_EMAIL_TO.trim().toLowerCase();
    if(!result.accepted?.some(a=>String(a).toLowerCase()===recipient)||result.rejected?.length)throw Error('SMTP did not confirm recipient acceptance');
    const receipt={accepted:true,messageId:result.messageId,date:p.date,lesson:p.lesson,recipient,url:mail.url,at:new Date().toISOString()};
    fs.writeFileSync(path.join(OUT,'receipt.json'),JSON.stringify(receipt,null,2));writeState(markSent(s,p,receipt));
    console.log(`SMTP accepted lesson ${p.lesson} for ${recipient}`);return;
  }
  throw Error('Unknown command: '+cmd);
}
if(process.argv[1]===fileURLToPath(import.meta.url))command(process.argv[2]).catch(e=>{console.error(e.message.replace(/(?:smtp|https?):\/\/\S+/gi,'[service]'));process.exitCode=1;});
