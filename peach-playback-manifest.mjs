import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeSpeechText, buildPlaybackSpeechText, approvedPlaybackDataForIssue } from './peach-daily-news.mjs';

export const PLAYBACK_FILES=['index.html','audio.mp3','captions.vtt','speech.txt'];
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const auditHash=audit=>sha256(JSON.stringify(audit));
const issueMetadata=audit=>audit.issues.map(issue=>({dateKey:issue.dateKey,contentMode:issue.contentMode,knowledgeIds:issue.knowledgeItems.map(item=>item.id)}));
export async function createPlaybackManifest(audit, outputDir) {
  const files={};
  for(const name of PLAYBACK_FILES){
    const data=await fs.readFile(path.join(outputDir,name));
    files[name]={sha256:sha256(data),bytes:data.length};
  }
  return {schemaVersion:1,auditSha256:auditHash(audit),issues:issueMetadata(audit),files};
}
export async function verifyPlaybackManifest({audit,manifest,artifactDir,playbackUrl,fetchImpl=fetch,cacheKey=process.env.PEACH_NEWS_PLAYBACK_CACHE_KEY || ''}) {
  if(!manifest || manifest.schemaVersion!==1 || manifest.auditSha256!==auditHash(audit)
    || JSON.stringify(manifest.issues)!==JSON.stringify(issueMetadata(audit))) throw new Error('Playback manifest is missing, old, or mismatched with audit');
  const pageUrl=new URL(playbackUrl);
  const lastDate=audit.issues.at(-1).dateKey;
  if(pageUrl.protocol!=='https:' || !pageUrl.pathname.endsWith('/'+lastDate+'/') || pageUrl.username || pageUrl.password) throw new Error('Invalid playback URL/date');
  const localDir=path.join(artifactDir,'peach-playback',lastDate), assets={};
  for(const name of PLAYBACK_FILES){
    const entry=manifest.files?.[name];
    if(!entry || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes<=0) throw new Error('Missing playback hash: '+name);
    const local=await fs.readFile(path.join(localDir,name));
    if(local.length!==entry.bytes || sha256(local)!==entry.sha256) throw new Error('Local playback SHA256 mismatch: '+name);
    const remoteUrl=new URL(name,pageUrl);
    if(cacheKey) remoteUrl.searchParams.set('v',cacheKey);
    const response=await fetchImpl(remoteUrl.href,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Remote playback missing: '+name+' HTTP '+response.status);
    const remote=Buffer.from(await response.arrayBuffer());
    if(remote.length!==entry.bytes || sha256(remote)!==entry.sha256) throw new Error('Remote playback SHA256 mismatch: '+name);
    assets[name]=local;
  }
  return assets;
}
const htmlEntities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',minus:'−',times:'×',divide:'÷',percnt:'%'};
function visibleText(value) {
  return String(value || '').replace(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>/gi,'')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|minus|times|divide|percnt);/gi,(_,entity)=>{
      if(!entity.startsWith('#')) return htmlEntities[entity.toLowerCase()];
      const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
      return code>0 && code<=0x10ffff?String.fromCodePoint(code):_;
    });
}
export const preparedTextComparable=value=>captionComparable(normalizeSpeechText(visibleText(value).replace(/^百科小知识：/,''))).toLowerCase();
export function captionText(captions) {
  const text=[];
  let inCue=false;
  for(const line of String(captions).split(/\r?\n/)) {
    if(line.includes('-->')) {inCue=true;continue;}
    if(!line.trim()) {inCue=false;continue;}
    if(inCue) text.push(line);
  }
  return text.join(' ');
}
const whitespaceOnly=value=>String(value).replace(/\s+/gu,' ').trim();
// Ignore sentence punctuation, never numeric punctuation or arithmetic.
// Shared by captions and visible email/page text: 20.1 != 201, -20 != 20.
const captionComparable=value=>String(value).replace(/\s+/gu,'').replace(/[^\p{L}\p{N}]/gu,(char,index,text)=>{
  if(/[.,．]/.test(char) && /\d/.test(text[index-1] || '') && /\d/.test(text[index+1] || '')) return char;
  if(/[+\-−×÷*/=<>≤≥±%％:∶~～–—^()[\]{}（）]/.test(char)
    && /[\d+\-−×÷*/=<>≤≥±^()[\]{}（）]/.test((text[index-1] || '')+(text[index+1] || ''))) return char;
  return '';
});
function preparedTextIndex(haystack,needle,startAt=0) {
  const body=preparedTextComparable(haystack), expected=preparedTextComparable(needle);
  if(!expected) return -1;
  // A numeric edge must match a complete token, not the tail of -2030/12030.
  const numericEdge=/[\d.．,+\-−×÷*/=<>≤≥±%％:∶~～–—^]/;
  for(let offset=body.indexOf(expected,startAt);offset!==-1;offset=body.indexOf(expected,offset+1)) {
    if(/^\d/.test(expected) && numericEdge.test(body[offset-1] || '')) continue;
    if(/\d$/.test(expected) && numericEdge.test(body[offset+expected.length] || '')) continue;
    return offset;
  }
  return -1;
}
export const preparedTextIncludes=(haystack,needle)=>preparedTextIndex(haystack,needle)>=0;
function contains(haystack,needle,label,startAt=0){
  const index=preparedTextIndex(haystack,needle,startAt);
  if(index<0) throw new Error('Prepared content missing '+label);
  return index+preparedTextComparable(needle).length;
}
export function validatePreparedContent({audit,emailText,emailHtml,assets}) {
  const html=assets['index.html'].toString(),speech=assets['speech.txt'].toString(),captions=assets['captions.vtt'].toString(),audio=assets['audio.mp3'];
  const approvedIssues=audit.issues.map(approvedPlaybackDataForIssue);
  const approved=buildPlaybackSpeechText({issues:approvedIssues});
  if(whitespaceOnly(speech)!==whitespaceOnly(approved)) throw new Error('Speech differs from the complete approved narration');
  if(!/^\s*WEBVTT/.test(captions) || !/\d{2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{2}:\d{2}(?::\d{2})?\.\d{3}/.test(captions)) throw new Error('Missing valid timed captions');
  if(captionComparable(captionText(captions))!==captionComparable(approved)) throw new Error('Captions differ from the complete speech text');
  if(audio.length<12000 || !(audio.subarray(0,3).toString()==='ID3' || (audio[0]===255 && (audio[1]&224)===224))) throw new Error('Invalid playback MP3');
  if(!html.includes('audio.mp3') || !html.includes('captions.vtt')) throw new Error('Missing playback references');
  if(!/叮叮/.test(speech) || /今日探索题|昨天探索题|今天的题目|明天公布参考答案|题目只展示|https?:\/\//.test(speech)) throw new Error('Invalid spoken structure');
  const expectedNews=audit.issues.reduce((n,issue)=>n+issue.newsItems.length,0);
  const countTitles=value=>[...String(value).matchAll(/第\s*\d+\s*条小情报[：:]/g)].length;
  if(countTitles(emailText)!==expectedNews || countTitles(html)!==expectedNews) throw new Error('Unexpected news count in prepared content');
  const knowledgeCount=[...emailText.matchAll(/^\d+\.\s*【[^】]+】/gm)].length;
  if(knowledgeCount!==audit.issues.length*3) throw new Error('Unexpected science/knowledge count');
  const previousAnswerEnds={emailText:0,emailHtml:0,html:0};
  for(const [issueIndex,issue] of audit.issues.entries()){
    const dateText=issue.dateKey.split('-').map(Number);
    const chineseDate=`${dateText[0]}年${dateText[1]}月${dateText[2]}日`;
    contains(emailText,`日报日期：${issue.dateKey}；内容模式：${issue.contentMode}`,'email mode/date');
    if(!html.includes(`${issue.dateKey}:${issue.contentMode}`)) throw new Error('Page content mode/date mismatch');
    contains(html,chineseDate,'page date');contains(speech,chineseDate,'speech date');
    contains(emailHtml,chineseDate,'email HTML date');
    if(issue.contentMode==='science'){
      for(const body of [emailText,emailHtml,html,speech]) contains(body,'儿童科学知识版','science label');
    }
    for(const item of issue.knowledgeItems){
      const body=item.text.replace(/^百科小知识：/,'');
      for(const [label,value] of Object.entries({emailText,emailHtml,html,speech})) contains(value,body,label+' knowledge '+item.id);
      if(audit.issues.length>1) {
        const card=[...html.matchAll(/<section class="knowledge">([\s\S]*?)<\/section>/g)].map(match=>match[1]).find(value=>preparedTextIncludes(value,item.text));
        contains(card?.match(/<p>([\s\S]*?)<\/p>/)?.[1],chineseDate,'merged knowledge date '+item.id);
      }
      if(issue.contentMode==='science' && (!emailText.includes(item.link)||!emailHtml.includes(item.link)||!html.includes(item.link))) throw new Error('Missing science source link');
    }
    for(const item of issue.newsItems){
      for(const field of ['title','summary','value','impact']) for(const [label,value] of Object.entries({emailText,emailHtml,html,speech})) contains(value,item[field],label+' news '+field);
    }
    contains(emailText,issue.question.q,'email quiz');
    // HTML separates the question stem and options into elements.
    contains(emailHtml,issue.question.q,'HTML quiz');
    contains(html,issue.question.q,'playback quiz');
    for(const [label,body] of Object.entries({emailText,emailHtml,html})) {
      // Respect chronological issue order; a global match would accept answers
      // moved into another day's card in a merged edition.
      previousAnswerEnds[label]=contains(body,approvedIssues[issueIndex].previousAnswer,`${label} previous answer ${issue.dateKey}`,previousAnswerEnds[label]);
    }
  }
}
