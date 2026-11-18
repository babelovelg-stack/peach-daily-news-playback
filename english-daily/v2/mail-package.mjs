import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {OUTPUT,folder} from './build.mjs';
import {esc} from '../build.mjs';

export function mailLesson(html){
 const lesson=JSON.parse(html.match(/const LESSON=([\s\S]*?);<\/script>/)?.[1]||'null');
 if(!lesson?.words?.length||!lesson.atlas||!lesson.audios)throw Error('Missing approved embedded lesson');
 return lesson;
}
export function readableCourse(l){
 const r=l.reading,lines=['直接在邮件里学习','音频 01：五个单词、记忆方法和例句。音频 02：阅读导读、重点片段与词汇语法讲解（不是整页原书朗读）。','先看图听音；用手盖住英文，回忆意思和拼写，再听一次核对。'];
 let html='<h2>直接在邮件里学习</h2><p>'+esc(lines[1])+'</p><p>'+esc(lines[2])+'</p><img src="cid:peach-word-atlas" alt="本课原创词汇插画，按从左到右、从上到下的顺序学习前五格" width="600" style="display:block;width:100%;max-width:600px;height:auto"><p>插画从左到右、从上到下，对应下面五个词；第六格为主题图。</p>';
 l.words.forEach((w,i)=>{
  const block=[`${i+1}. ${w.word} ${w.sound} · ${w.meaning}`,`拆分记：${w.chunks}`,w.hint,`${w.example} ${w.translation}`,`开口用：${w.use}`,`遮住上面的词，补全拼写：${w.missing}`];
  lines.push(block.join('\n'));
  html+=`<div style="margin:20px 0;padding:16px;background:#f3f6ed;border-radius:12px"><h3 style="margin:0 0 8px">${esc(block[0])}</h3>${block.slice(1).map(t=>`<p style="margin:7px 0">${esc(t)}</p>`).join('')}</div>`;
 });
 const location=r.pageNumberType==='source-document'?`指南第${r.pageNumbers.join('–')}页（原书文字摘录）`:`原书第${r.pageNumbers?.join('–')}页`;
 const reading=[`${r.title} · ${location}`,r.readerPages||'',r.readingGuide||''];
 lines.push(...reading,`出版社原书（联网）：${r.readerUrl||r.sourceUrl}`);
 html+=`<h2>${esc(reading[0])}</h2><p>${esc(reading.slice(1).join(' · '))}</p><p><a href="${esc(r.readerUrl||r.sourceUrl)}">打开出版社原书 ↗</a>（需联网）</p><p>以下为伴读讲解，原书图文仍在出版社页面；无需先打开互动课件。</p>`;
 for(const g of r.glossary){const t=`${g.term}：${g.meaning}。${g.explanation}`;lines.push(t);html+=`<p>${esc(t)}</p>`;}
 const grammar=[r.grammar.title,`原书重点片段：${r.grammar.quote}`,r.grammar.explanation,`自编练习例句：${r.grammar.example} ${r.grammar.translation}`];
 lines.push(...grammar);html+='<h3>'+esc(grammar[0])+'</h3>'+grammar.slice(1).map(t=>`<p>${esc(t)}</p>`).join('');
 html+='<h3>读后回答</h3>';
 r.questions.forEach((q,i)=>{const options=q.options.map((o,j)=>`${String.fromCharCode(65+j)}. ${o}`).join('　');lines.push(`${i+1}. ${q.prompt}\n${options}`);html+=`<p><b>${i+1}. ${esc(q.prompt)}</b></p><p>${esc(options)}</p>`;});
 const answers=r.questions.map((q,i)=>`${i+1}. ${String.fromCharCode(65+q.answer)}。${q.explanation}`);
 lines.push('先完成再看答案',...answers,'拼写答案：'+l.words.map(w=>w.answer).join('、'));
 html+=`<div style="margin-top:48px;border-top:1px solid #ddd;padding-top:20px"><h3>先完成，再核对</h3>${answers.map(t=>`<p>${esc(t)}</p>`).join('')}<p>拼写答案：${esc(l.words.map(w=>w.answer).join('、'))}</p></div>`;
 return {html,text:lines.join('\n\n')};
}

export function createMailAttachments(p){
 const dir=path.join(OUTPUT,folder(p.lesson)),offline=fs.readFileSync(path.join(dir,'offline.html')),l=mailLesson(offline.toString()),out=path.join(dir,'mail');
 fs.mkdirSync(out,{recursive:true});
 const decode=(data,mime)=>{const prefix=`data:${mime};base64,`;if(!data.startsWith(prefix))throw Error('Unexpected media type');return Buffer.from(data.slice(prefix.length),'base64');};
 const tracks=[['01-Words-and-examples.mp3',['intro',...l.words.flatMap((w,i)=>[`word${i}`,`word${i}`,`guide${i}`,`example${i}`])]],['02-Reading-guide.mp3',['readingGuide','focusQuote',...l.reading.glossary.map((g,i)=>`gloss${i}`),'grammar','patternExample']]];
 const attachments=[{filename:`Peach-English-${String(p.lesson).padStart(3,'0')}-Words.png`,content:decode(l.atlas,'image/png'),cid:'peach-word-atlas',contentDisposition:'inline',contentType:'image/png'}];
 for(const [filename,ids]of tracks){
  const files=ids.map((id,i)=>{if(!l.audios[id])throw Error('Missing audio '+id);const file=`${filename}-${i}.mp3`;fs.writeFileSync(path.join(out,file),decode(l.audios[id],'audio/mpeg'));return `file '${file}'`;});
  const list=path.join(out,filename+'.txt');fs.writeFileSync(list,files.join('\n'));
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','1','-i',list,'-c','copy',path.join(out,filename)],{stdio:'pipe',timeout:60000});
  attachments.push({filename:`Lesson-${String(p.lesson).padStart(3,'0')}-${filename}`,content:fs.readFileSync(path.join(out,filename)),contentType:'audio/mpeg',contentDisposition:'attachment'});
 }
 attachments.push({filename:`Peach-English-${String(p.lesson).padStart(3,'0')}-Interactive.html`,content:offline,contentType:'text/html; charset=utf-8',contentDisposition:'attachment'});
 return attachments;
}
