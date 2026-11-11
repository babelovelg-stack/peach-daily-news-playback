import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {lessonFor,WEEKS,TOTAL_LESSONS} from './course.mjs';
export const ROOT=path.dirname(fileURLToPath(import.meta.url));
export const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const baseURL='https://babelovelg-stack.github.io/peach-daily-news-playback/english';
export const lessonKey=n=>'lesson-'+String(n).padStart(3,'0');
export function jobsFor(lesson){
  return Object.fromEntries(Object.entries(lesson.speech).map(([key,text])=>[key,{text,voice:['intro','rule','task'].includes(key)?'zh-CN-XiaoyiNeural':'en-GB-SoniaNeural',rate:['intro','rule','task'].includes(key)?'-4%':'-12%',pitch:['intro','rule','task'].includes(key)?'+8Hz':'+0Hz'}]));
}
export function verifyManifest(lesson,manifest){
  const jobs=jobsFor(lesson);
  for(const [k,job] of Object.entries(jobs)){
    const m=manifest[k];
    if(!m||JSON.stringify(m.job)!==JSON.stringify(job))throw Error('Stale audio script: '+k);
    const bytes=fs.readFileSync(m.path);
    if(bytes.length<500||hash(bytes)!==m.sha256)throw Error('Audio integrity failed: '+k);
  }
}
export function renderLesson(lesson,manifest){
  verifyManifest(lesson,manifest);
  const audios=Object.fromEntries(Object.entries(manifest).map(([k,m])=>[k,'data:audio/mpeg;base64,'+fs.readFileSync(m.path).toString('base64')]));
  const data={...lesson,audios};
  return fs.readFileSync(path.join(ROOT,'lesson.html'),'utf8')
    .replace('/*__STYLE__*/',()=>fs.readFileSync(path.join(ROOT,'style.css'),'utf8'))
    .replace('/*__DATA__*/',()=>JSON.stringify(data).replace(/</g,'\\u003c'))
    .replace('/*__APP__*/',()=>fs.readFileSync(path.join(ROOT,'app.js'),'utf8'));
}
export async function build(number,{audio=true,out=path.join(ROOT,'output')}={}){
  const lesson=lessonFor(number);const dir=path.join(out,lessonKey(number));fs.mkdirSync(dir,{recursive:true});
  const jobfile=path.join(dir,'audio-jobs.json');fs.writeFileSync(jobfile,JSON.stringify(jobsFor(lesson),null,2));
  if(audio)execFileSync(process.env.PYTHON||'python3',[path.join(ROOT,'audio.py'),jobfile,path.join(ROOT,'.audio-cache')],{stdio:'inherit',timeout:600000});
  const manifest=JSON.parse(fs.readFileSync(jobfile.replace('.json','.manifest.json'),'utf8'));
  const html=renderLesson(lesson,manifest);
  fs.writeFileSync(path.join(dir,'index.html'),html);
  fs.writeFileSync(path.join(dir,'lesson.json'),JSON.stringify({...lesson,audio:Object.fromEntries(Object.entries(manifest).map(([k,v])=>[k,{sha256:v.sha256,job:v.job}]))},null,2));
  fs.writeFileSync(path.join(dir,'speech.txt'),Object.entries(lesson.speech).map(([k,v])=>`[${k}]\n${v}`).join('\n\n'));
  const assets=Object.fromEntries(['index.html','lesson.json','speech.txt'].map(name=>[name,hash(fs.readFileSync(path.join(dir,name)))]));
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({number,version:lesson.version,assets},null,2));
  writeArchive(number,out);
  return {dir,number,url:`${baseURL}/${lessonKey(number)}/`,html};
}
export function writeArchive(number,out=path.join(ROOT,'output')){
  const links=Array.from({length:number},(_,i)=>{const l=lessonFor(i+1);return `<a href="${lessonKey(i+1)}/">第${i+1}课 · ${esc(l.title)} · ${esc(l.type)}</a>`;}).reverse().join('');
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>桃子英语 · 每天15分钟</title><style>body{font:18px/1.8 -apple-system,"PingFang SC",sans-serif;background:#f7f5ef;color:#233534;max-width:860px;margin:auto;padding:36px 22px}h1{font-size:38px}a{display:block;background:white;padding:14px 20px;margin:12px 0;border:1px solid #e0e4df;border-radius:18px;color:#286257;text-decoration:none}p{color:#5d6a66}details{margin:26px 0}li{padding:5px}</style><h1>桃子英语，每天一小步。</h1><p>Level 3 难度起步 · ${WEEKS.length}周 / ${TOTAL_LESSONS}课 · 原创听说读写课程</p><a href="${lessonKey(number)}/"><strong>开始最新课程 → 第${number}课</strong></a><details><summary>查看课程路线</summary><ol>${WEEKS.map(w=>`<li>${esc(w.title)} — ${esc(w.focus)}</li>`).join('')}</ol></details><h2>已推送课程</h2>${links}<p>每天内容按发送顺序推进；作答仅保存在当前浏览器，不会上传。课程为原创练习，不是商业教材原页或官方等级测评。</p></html>`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const n=Number(process.argv[2]||1);await build(n,{audio:!process.argv.includes('--cached')}); console.log('Built lesson '+n);
}
