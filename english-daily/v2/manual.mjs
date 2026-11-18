import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,lessonFor} from './model.mjs';
import {OUTPUT,folder} from './build.mjs';
import {restoreOrBuild,checkAssets,verifyHosted,emailFor} from './delivery.mjs';
import {todayInShanghai} from '../daily.mjs';
import {createMailAttachments} from './mail-package.mjs';
import {esc} from '../build.mjs';
const ledgerPath=path.resolve(ROOT,'..','manual-deliveries.json');
const planPath=path.join(OUTPUT,'manual-plan.json');
export function planManual(ledger,request,lesson,date){
 if(ledger.schema!==1||!Array.isArray(ledger.history)||ledger.history.some(h=>h.status!=='sent'||!h.request)||new Set(ledger.history.map(h=>h.request)).size!==ledger.history.length)throw Error('Invalid manual delivery history');
 if(!/^[a-zA-Z0-9-]{8,80}$/.test(request)||!Number.isInteger(lesson)||lesson<1||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid manual request');
 if(ledger.inFlight)throw Error('Uncertain manual send; inspect receipt before retrying');
 if(ledger.history.some(h=>h.request===request))return {send:false,reason:'Manual request already sent'};
 return {send:true,request,lesson,date};
}
export function claimManual(ledger,p,sha){
 if(!planManual(ledger,p.request,p.lesson,p.date).send||!p.send||!/^[a-f0-9]{64}$/.test(sha))throw Error('Invalid manual claim');
 return {...ledger,inFlight:{request:p.request,lesson:p.lesson,date:p.date,sha}};
}
export function acceptManual(ledger,p,receipt){
 const c=ledger.inFlight;
 if(!c||c.request!==p.request||c.lesson!==p.lesson||receipt.accepted!==true||!receipt.messageId)throw Error('Missing manual acceptance');
 const {inFlight,...rest}=ledger;
 return {...rest,history:[...rest.history,{...c,status:'sent',messageId:receipt.messageId,at:receipt.at,run:process.env.GITHUB_RUN_ID||'local'}]};
}
const readLedger=()=>fs.existsSync(ledgerPath)?JSON.parse(fs.readFileSync(ledgerPath,'utf8')):{schema:1,history:[]};
const writeLedger=s=>fs.writeFileSync(ledgerPath,JSON.stringify(s,null,2)+'\n');
export function entryNotice(p,meta){
 const {url}=emailFor(p,meta),subject=`新的免登录学习入口｜桃子英语第${p.lesson}课`;
 const text=`${subject}\n\n新入口已启用，无需登录 ChatGPT。点击下面的完整链接即可打开第${p.lesson}课，课件仍然加密。\n\n${url}\n\n这是已发送课程的新入口，不是一节新课。每天18:00继续按原课序推进。前一封修复邮件中的图文和MP3仍可使用。\n\n如果链接未带入学习密钥，可复制本课密钥：${meta.key}`;
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="font-family:-apple-system,'PingFang SC',sans-serif;line-height:1.8;color:#254b3b;padding:24px"><div style="max-width:620px;margin:auto"><h1>🍑 新的学习入口已准备好</h1><p>无需登录 ChatGPT。点击下面的按钮，直接打开第${p.lesson}课：${esc(meta.title)}。</p><p><a href="${esc(url)}" style="display:inline-block;background:#276a56;color:white;padding:14px 22px;border-radius:10px">打开第${p.lesson}课（免登录）→</a></p><p>这是已发送课程的新入口，不是一节新课。每天18:00继续按原课序推进；前一封修复邮件中的图文和MP3仍可使用。</p><p>课件保留加密保护，邮箱和学习记录不会公开。作答仍只保存在当前浏览器；换网址后，本机旧记录不会自动转入。</p><p>如果按钮未能跳转，请复制完整地址到浏览器：</p><p style="word-break:break-all">${esc(url)}</p><p>如网页要求输入学习密钥：</p><p style="word-break:break-all">${esc(meta.key)}</p></div></body></html>`;
 return {subject,text,html};
}
async function command(cmd){
 fs.mkdirSync(OUTPUT,{recursive:true});
 if(cmd==='prepare'){
  const p=planManual(readLedger(),process.env.ENGLISH_MANUAL_REQUEST||'',Number(process.env.ENGLISH_MANUAL_LESSON),todayInShanghai());
  if(p.send){lessonFor(p.lesson);if(!fs.existsSync(path.resolve(ROOT,'..','..','english',folder(p.lesson))))throw Error('Manual delivery requires an already published lesson');await restoreOrBuild(p);await verifyHosted(p,{attempts:3,delay:2000});createMailAttachments(p);}
  fs.writeFileSync(planPath,JSON.stringify(p,null,2));
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`should_send=${p.send}\n`);
  console.log(p.send?`Manual lesson ${p.lesson} verified`:p.reason);return;
 }
 const p=JSON.parse(fs.readFileSync(planPath,'utf8'));if(!p.send)throw Error('No manual send planned');
 if(cmd==='claim'){writeLedger(claimManual(readLedger(),p,checkAssets(p).manifest.assets['index.html']));return;}
 if(cmd!=='send')throw Error('Unknown manual command');
 await verifyHosted(p,{attempts:2,delay:2000});
 const {manifest,privateData}=checkAssets(p),ledger=readLedger(),c=ledger.inFlight;
 if(c?.request!==p.request||c.lesson!==p.lesson||c.date!==p.date||c.sha!==manifest.assets['index.html'])throw Error('No matching persisted manual claim');
 for(const name of ['SMTP_HOST','SMTP_USER','SMTP_PASS','ENGLISH_EMAIL_TO'])if(!process.env[name])throw Error('Missing mail configuration');
 const {default:nodemailer}=await import('nodemailer');
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:(process.env.SMTP_SECURE||'true')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:30000,socketTimeout:60000});
 const entryOnly=p.request.startsWith('entry-'),{url,...mail}=entryOnly?entryNotice(p,privateData):emailFor(p,privateData),subject=entryOnly?mail.subject:(p.request.startsWith('repair-')?'打开问题修复补发｜':'最新版补发｜')+mail.subject;
 const result=await transport.sendMail({...mail,subject,from:process.env.REPORT_EMAIL_FROM||process.env.SMTP_USER,to:process.env.ENGLISH_EMAIL_TO,messageId:`<peach-english-manual-${p.request}@peach-lessons.local>`,attachments:entryOnly?[]:createMailAttachments(p)});
 const recipient=process.env.ENGLISH_EMAIL_TO.trim().toLowerCase();
 if(!result.accepted?.some(x=>String(x).toLowerCase()===recipient)||result.rejected?.length)throw Error('Recipient not accepted');
 const receipt={accepted:true,request:p.request,lesson:p.lesson,recipient,subject,messageId:result.messageId,at:new Date().toISOString()};
 fs.writeFileSync(path.join(OUTPUT,'manual-receipt.json'),JSON.stringify(receipt,null,2));writeLedger(acceptManual(ledger,p,receipt));console.log(`SMTP accepted manual lesson ${p.lesson}`);
}
if(process.argv[1]===fileURLToPath(import.meta.url))command(process.argv[2]).catch(()=>{console.error('Manual delivery stopped. Review the persisted claim and receipt before retrying.');process.exitCode=1;});
