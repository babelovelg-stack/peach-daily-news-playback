(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pristine='<!doctype html>\n'+document.documentElement.outerHTML;
const storageKey=`peach-v2:${LESSON.number}:${LESSON.packId}:${LESSON.preview?'preview':'lesson'}`,memoryKey='peach-word-memory-v2';
const blank=()=>({part:'words',mode:LESSON.practice==='recall'?'listen':LESSON.practice==='use'?'spell':'learn',word:0,readSourceAcknowledged:false,listen:[],spell:[],readingAnswers:{},doneWords:false,doneReading:false});
let state=blank(),memory={},storageOK=true;
try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(s&&typeof s==='object')state={...state,...s};const m=JSON.parse(localStorage.getItem(memoryKey)||'{}');if(m&&typeof m==='object'&&!Array.isArray(m))memory=m;}catch{storageOK=false;}
state.word=Number.isInteger(state.word)&&state.word>=0&&state.word<5?state.word:0;
state.listen=Array.isArray(state.listen)?state.listen.filter(n=>Number.isInteger(n)&&n>=0&&n<5):[];state.spell=Array.isArray(state.spell)?state.spell.filter(n=>Number.isInteger(n)&&n>=0&&n<5):[];
state.readingAnswers=state.readingAnswers&&typeof state.readingAnswers==='object'?state.readingAnswers:{};
let page=0,listenIndex=0,spellIndex=0,queue=[],audioTarget=null;
const audio=$('#audio');
function save(){try{localStorage.setItem(storageKey,JSON.stringify(state));localStorage.setItem(memoryKey,JSON.stringify(memory));$('#saved').textContent='进度已保存在本机';}catch{storageOK=false;$('#saved').textContent='浏览器未允许保存，当前练习仍可使用';}updateProgress();}
function updateProgress(){$('#progress').textContent=`听音 ${new Set(state.listen).size}/5 · 拼写 ${new Set(state.spell).size}/5`+(state.doneReading?' · 原书已读懂':'');$('#celebration').hidden=!(state.doneWords&&state.doneReading&&LESSON.reading);}
function tile(el,n){el.style.backgroundImage=`url("${LESSON.atlas}")`;el.style.backgroundPosition=`${(n%3)*50}% ${Math.floor(n/3)*100}%`;}
$$('[data-tile]').forEach(el=>tile(el,Number(el.dataset.tile)));
$('#title').textContent=LESSON.title;$('#timeTag').textContent=LESSON.preview?'完整课按 25 分钟以内配量':`本课约 ${Object.values(LESSON.minutes).reduce((a,b)=>a+b,0)} 分钟`;
$('#previewNotice').hidden=!LESSON.preview;$('#readingTag').textContent=LESSON.preview?'官网原书入口已找到':'1 段原书阅读';
if(LESSON.reading?.mode==='publisher-sample'){
 $('#readingTag').textContent='2 页官方原书样章';$('#timeTag').textContent='本课约 23 分钟';
 $('#previewNotice').hidden=!LESSON.preview;$('#previewNotice').innerHTML='<strong>免登录原书样章试学</strong><p>五词学习、原书阅读、重点片段跟读、语法和两道理解题已接入。原书图文需联网，词汇与讲解音频可离线使用。</p>';
 if(LESSON.practice!=='learn'){$('#subtitle').textContent='先回忆上一课的五个词，再读两页新内容。今天是复习课，不新增五个词。';}
}
$('#sourceNote').innerHTML=`词汇对照 <a href="${E(LESSON.source.url)}" target="_blank" rel="noopener noreferrer">${E(LESSON.source.title)}</a>。${E(LESSON.source.note)}`;
function clearHighlight(){$$('.speaking').forEach(n=>n.classList.remove('speaking'));$$('.sentence.active').forEach(n=>n.classList.remove('active'));}
function stop(){queue=[];audio.pause();clearHighlight();audioTarget=null;}
async function play(id,label,{target=null,line=null,keepQueue=false}={}){
 if(!keepQueue)queue=[];audio.pause();clearHighlight();
 if(line){page=line[0];renderPage();target=$(`[data-sentence="${line[1]}"]`);}
 audioTarget=target;audio.src=LESSON.audios[id];audio.playbackRate=Number($('#speed').value);$('#player').hidden=false;$('#audioLabel').textContent=label;
 try{await audio.play();}catch{$('#audioLabel').textContent='请点播放器继续';}
}
audio.onplaying=()=>{if(audioTarget)audioTarget.classList.add(audioTarget.classList.contains('sentence')?'active':'speaking');};
audio.onended=()=>{clearHighlight();if(queue.length){const item=queue.shift();play(item.id,item.label,{line:item.line,keepQueue:true});}};
audio.onerror=()=>{$('#audioLabel').textContent='播放失败，请重新点击';queue=[];clearHighlight();};
$('#closeAudio').onclick=()=>{stop();$('#player').hidden=true;};$('#speed').onchange=()=>audio.playbackRate=Number($('#speed').value);
function setPart(part){stop();state.part=part==='reading'?'reading':'words';$('#wordsPanel').hidden=state.part!=='words';$('#readingPanel').hidden=state.part!=='reading';$$('[data-part]').forEach(b=>{b.classList.toggle('active',b.dataset.part===state.part);b.setAttribute('aria-selected',String(b.dataset.part===state.part));});save();}
$$('[data-part]').forEach(b=>b.onclick=()=>setPart(b.dataset.part));
function mode(m){stop();state.mode=['learn','listen','spell'].includes(m)?m:'learn';['learn','listen','spell'].forEach(n=>$(`#${n}Mode`).hidden=n!==state.mode);$('#wordTabs').hidden=state.mode!=='learn';$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));save();}
$$('[data-mode]').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
$('#wordTabs').innerHTML=LESSON.words.map((w,i)=>`<button data-word="${i}">${E(w.word)}</button>`).join('');
const day=()=>new Date().toLocaleDateString('en-CA');
function renderWord(){const i=state.word,w=LESSON.words[i];tile($('#wordPicture'),w.tile);$('#wordIndex').textContent=`WORD ${i+1} / 5`;$('#wordTitle').textContent=w.word;$('#pronunciation').textContent=w.sound;$('#meaning').textContent=w.meaning;$('#chunks').textContent=w.chunks;$('#memoryHint').textContent=w.hint;$('#example').textContent=w.example;$('#translation').textContent=w.translation;$('#usePrompt').textContent=w.use;['#wordDetails','#wordTabs','#memoryHint','#usePrompt'].forEach(sel=>$(sel).classList.remove('concealed'));$('#wordDetails').setAttribute('aria-hidden','false');$('.example').classList.remove('concealed');$('#coverWord').textContent='盖住，自己想一想';$$('[data-word]').forEach(b=>b.classList.toggle('active',Number(b.dataset.word)===i));const r=memory[w.id];$('#reviewDue').textContent=r?.nextDue?`下次回忆：${r.nextDue}。先不看文字，试着说出这个词。`:'今天先学会，之后按第 1、3、7 天回忆。';}
$$('[data-word]').forEach(b=>b.onclick=()=>{stop();state.word=Number(b.dataset.word);renderWord();save();});
$('#hearWord').onclick=()=>play(`word${state.word}`,'词汇发音',{target:$('#wordTitle')});$('#hearExample').onclick=()=>play(`example${state.word}`,'英语例句',{target:$('#example')});$('#hearHint').onclick=()=>play(`guide${state.word}`,'记忆提示',{target:$('#memoryHint')});
$('#coverWord').onclick=()=>{const hidden=$('#wordDetails').classList.toggle('concealed');$('#wordDetails').setAttribute('aria-hidden',String(hidden));$('.example').classList.toggle('concealed',hidden);['#wordTabs','#memoryHint','#usePrompt'].forEach(sel=>$(sel).classList.toggle('concealed',hidden));$('#coverWord').textContent=hidden?'翻开，核对一下':'盖住，自己想一想';};
$('#remember').onclick=()=>{const w=LESSON.words[state.word],old=memory[w.id]||{};if(old.lastReviewed!==day()){
 const first=old.firstLearned||day(),today=day(),offsets=[1,3,7],next=offsets.map(n=>{const d=new Date(first+'T12:00:00');d.setDate(d.getDate()+n);return d.toLocaleDateString('en-CA');}).find(d=>d>today);
 memory[w.id]={word:w.word,firstLearned:first,lastReviewed:today,nextDue:next||null,reviewComplete:!next};}
 save();renderWord();renderDue();};
function renderDue(){const due=Object.values(memory).filter(m=>m.nextDue&&m.nextDue<=day());$('#dueSummary').textContent=due.length?`今天到期的词：${due.map(m=>m.word).join('、')}。先花1–3分钟口头回忆这些旧词，再学今天五个新词。`:'当前没有到期的旧词；完成后用自己的话说一句。';}
function renderListen(){const indexes=[listenIndex,(listenIndex+2)%5,(listenIndex+4)%5].sort((a,b)=>((a*3+listenIndex)%7)-((b*3+listenIndex)%7));$('#imageChoices').innerHTML=indexes.map((i,j)=>`<button data-choice="${i}" aria-label="选图片 ${j+1}"><div class="picture" data-choice-picture="${i}"></div><span>${j+1}</span></button>`).join('');$$('[data-choice-picture]').forEach(el=>tile(el,LESSON.words[Number(el.dataset.choicePicture)].tile));$('#listenFeedback').textContent='';$('#listenProgress').textContent=`已答对 ${new Set(state.listen).size} / 5 个词`;
 $$('[data-choice]').forEach(b=>b.onclick=()=>{const ok=Number(b.dataset.choice)===listenIndex;$$('[data-choice]').forEach(n=>n.classList.remove('correct','wrong'));b.classList.add(ok?'correct':'wrong');$('#listenFeedback').textContent=ok?`✓ ${LESSON.words[listenIndex].word}，${LESSON.words[listenIndex].meaning}。再跟读一次。`:'再听一遍，想想声音对应哪幅图。';if(ok&&!state.listen.includes(listenIndex))state.listen.push(listenIndex);save();$('#listenProgress').textContent=`已答对 ${new Set(state.listen).size} / 5 个词`;});}
$('#quizAudio').onclick=()=>play(`word${listenIndex}`,'听音选图');$('#nextListen').onclick=()=>{stop();listenIndex=(listenIndex+1)%5;renderListen();};
function renderSpell(){const w=LESSON.words[spellIndex];tile($('#spellPicture'),w.tile);$('#spellPrompt').textContent=w.missing;$('#spelling').value='';$('#spellFeedback').textContent='';$('#spellProgress').textContent=`已拼对 ${new Set(state.spell).size} / 5 个词`;}
$('#spellAudio').onclick=()=>play(`word${spellIndex}`,'听音拼词');$('#nextSpell').onclick=()=>{stop();spellIndex=(spellIndex+1)%5;renderSpell();};
$('#spellForm').onsubmit=e=>{e.preventDefault();const w=LESSON.words[spellIndex],ok=$('#spelling').value.trim().toLowerCase()===w.answer;$('#spellFeedback').textContent=ok?'✓ 拼对了。盖住后，试着再说一次。':'还差一点，先听完整单词，再检查缺少的字母。';if(ok&&!state.spell.includes(spellIndex))state.spell.push(spellIndex);save();$('#spellProgress').textContent=`已拼对 ${new Set(state.spell).size} / 5 个词`;};
$('#spellReveal').onclick=()=>{$('#spellFeedback').textContent=`${LESSON.words[spellIndex].word}。看一眼后盖住，再自己输入。`};
$('#finishWords').onclick=()=>{if(new Set(state.listen).size<5||new Set(state.spell).size<5){$('#wordGate').textContent='还有词没练到：请完成五次听音选图和五次拼写。';return;}state.doneWords=true;$('#wordGate').textContent='';setPart('reading');$('.parts').scrollIntoView({behavior:'smooth'});};
function renderPage(){const r=LESSON.reading;if(!r)return;const p=r.pages[page];$('#pageImage').src=p.image;$('#pageImage').alt=`${r.title} 原书 ${p.label}`;$('#pageLabel').textContent=p.label;$('#pageCount').textContent=`本段 ${page+1} / ${r.pages.length} 页`;
 $('#prevPage').disabled=page===0;$('#nextPage').disabled=page===r.pages.length-1;const translations=$('#showTranslations').checked;
 $('#sentences').innerHTML=p.sentences.map((s,j)=>`<article class="sentence" data-sentence="${j}"><p>${E(s.text)}</p><button class="text-button" data-line="${j}">▶ 听这一句</button><p class="translation" ${translations?'':'hidden'}>讲解：${E(s.translation)}</p></article>`).join('');
 $$('[data-line]').forEach(b=>b.onclick=()=>play(`line${page}_${b.dataset.line}`,'原书逐句伴读',{line:[page,Number(b.dataset.line)]}));
}
function startReading(all){const r=LESSON.reading;if(!r||r.mode==='publisher-sample')return;queue=[];r.pages.forEach((p,i)=>{if(all||i===page)p.sentences.forEach((s,j)=>queue.push({id:`line${i}_${j}`,label:`原书 ${p.label}`,line:[i,j]}));});const first=queue.shift();play(first.id,first.label,{line:first.line,keepQueue:true});}
$('#playPage').onclick=()=>startReading(false);$('#playReading').onclick=()=>startReading(true);$('#stopReading').onclick=stop;
$('#prevPage').onclick=()=>{stop();page--;renderPage();};$('#nextPage').onclick=()=>{stop();page++;renderPage();};$('#showTranslations').onchange=()=>{$$('.translation').forEach(n=>n.hidden=!$('#showTranslations').checked);};
if(LESSON.reading){const r=LESSON.reading,isSample=r.mode==='publisher-sample';$('#reader').hidden=false;$('#readingMissing').hidden=true;$('#bookMeta').textContent=`${r.series} · LEVEL ${r.level} · ${isSample?'出版社样章':'原书选段'}`;$('#bookTitle').textContent=r.title;
 if(isSample){
  $('#publisherReader').hidden=false;['.reader-controls','.book-spread','.page-nav'].forEach(sel=>$(sel).hidden=true);
  $('#pageLabel').textContent=`原书第 ${r.pageNumbers.join('–')} 页`;
  $('#readingSupport').textContent='每天只读指定两页，先理解画面，再读文字；不需要一次读完样章。';
  $('#sampleScope').textContent=`今天读原书印刷页码 ${r.pageNumbers.join('–')}，对应阅读器底部的 ${r.readerPages}。封面计为阅读器第1页。`;
  $('#sampleOpen').href=r.readerUrl;$('#publisherFrame').src=r.readerUrl;$('#sampleGuide').textContent=r.readingGuide;
  $('#hearReadingGuide').onclick=()=>play('readingGuide','阅读提示',{target:$('#sampleGuide')});
  $('#sampleRead').checked=Boolean(state.readSourceAcknowledged);$('#sampleRead').onchange=()=>{state.readSourceAcknowledged=$('#sampleRead').checked;if(!state.readSourceAcknowledged)state.doneReading=false;save();};
 }else $('#readingSupport').textContent=`本次 ${r.pages[0].label}—${r.pages.at(-1).label}，${LESSON.wordCount} 个英文词。按当前 C–D 阅读基础提供伴读支持，不把两个体系的级别直接等同。`;
 $('#glossary').innerHTML=r.glossary.map((g,i)=>`<div class="gloss"><strong>${E(g.term)}</strong><div><p><b>${E(g.meaning)}</b> · 补充讲解：${E(g.explanation)}</p><button class="text-button" data-gloss="${i}">▶ 听讲解</button></div></div>`).join('');$$('[data-gloss]').forEach(b=>b.onclick=()=>play(`gloss${b.dataset.gloss}`,'阅读词汇讲解'));
 $('#grammar').innerHTML=`<p class="eyebrow">今天只看一个句子规律</p><h3>${E(r.grammar.title)}</h3><p class="muted">${isSample?`原书短片段 · 第 ${r.grammar.page} 页`:'原书句子'}</p><blockquote id="focusQuote" class="sample-focus">${E(r.grammar.quote)}</blockquote>${isSample?'<button id="quoteAudio" class="text-button">▶ 听原书重点片段</button>':''}<p>补充讲解：${E(r.grammar.explanation)}</p><button id="grammarAudio" class="text-button">▶ 听语法讲解</button>${isSample?`<p class="muted">试着迁移 · 以下例句由本课编写</p><p id="patternExample" class="english">${E(r.grammar.example)}</p><p>${E(r.grammar.translation)}</p><button id="patternAudio" class="text-button">▶ 听新的练习句</button>`:''}`;$('#grammarAudio').onclick=()=>play('grammar','语法讲解');
 if(isSample){$('#quoteAudio').onclick=()=>play('focusQuote','原书重点片段',{target:$('#focusQuote')});$('#patternAudio').onclick=()=>play('patternExample','原创迁移例句',{target:$('#patternExample')});}
 $('#questions').innerHTML=r.questions.map((q,i)=>`<article class="question"><h4>${i+1}. ${E(q.prompt)}</h4><div class="options">${q.options.map((o,j)=>`<button data-q="${i}" data-answer="${j}">${E(o)}</button>`).join('')}</div><p id="qFeedback${i}" class="feedback" role="status"></p><button data-evidence="${i}" class="text-button" hidden>回原书找证据 ↗</button></article>`).join('');
 const answer=(i,a)=>{const q=r.questions[i],ok=a===q.answer;$$(`[data-q="${i}"]`).forEach(b=>b.classList.remove('correct','wrong'));$(`[data-q="${i}"][data-answer="${a}"]`).classList.add(ok?'correct':'wrong');$(`#qFeedback${i}`).textContent=(ok?'✓ ':'再读一读。')+q.explanation;$(`[data-evidence="${i}"]`).hidden=false;if(ok)state.readingAnswers[i]=a;else{delete state.readingAnswers[i];state.doneReading=false;}save();};
 $$('[data-q]').forEach(b=>b.onclick=()=>answer(Number(b.dataset.q),Number(b.dataset.answer)));Object.entries(state.readingAnswers).forEach(([i,a])=>{if(r.questions[i]&&a===r.questions[i].answer)answer(Number(i),a);});
 $$('[data-evidence]').forEach(b=>b.onclick=()=>{const q=r.questions[Number(b.dataset.evidence)];if(isSample){stop();$('#evidenceHint').hidden=false;$('#evidenceHint').textContent=`请核对原书第 ${q.evidencePage} 页；阅读器页码是 ${q.evidencePage+1}。${q.explanation}`;$('#publisherReader').scrollIntoView({behavior:'smooth'});return;}const text=q.evidence;for(let i=0;i<r.pages.length;i++){const j=r.pages[i].sentences.findIndex(s=>s.text===text);if(j>=0){play(`line${i}_${j}`,'原书答案依据',{line:[i,j]});$('.book-spread').scrollIntoView({behavior:'smooth'});break;}}});if(!isSample)renderPage();

}
$('#finishReading').onclick=()=>{const r=LESSON.reading;if(r?.mode==='publisher-sample'&&!state.readSourceAcknowledged){$('#readingGate').textContent='先打开并读完指定的两页，再勾选阅读完成。';return;}if(!r||r.questions.some((q,i)=>state.readingAnswers[i]!==q.answer)){$('#readingGate').textContent='请先完成理解题，再回到原书核对依据。';return;}if(!state.doneWords){$('#readingGate').textContent='原书题目已答对，词汇部分还有练习未完成。';return;}state.doneReading=true;stop();save();$('#celebration').scrollIntoView({behavior:'smooth'});};
$('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([pristine],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`Peach-English-${LESSON.preview?'Preview':'Day-'+LESSON.number}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
renderWord();renderListen();renderSpell();renderDue();mode(state.mode);setPart(state.part);if(!storageOK)$('#saved').textContent='浏览器未允许保存，当前练习仍可使用';window.addEventListener('pagehide',()=>{stop();save();});$('#openHelp').hidden=true;$('#courseApp').hidden=false;
})();
