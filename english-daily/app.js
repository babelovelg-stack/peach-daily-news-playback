(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=`peach-english:${LESSON.version}:${LESSON.number}`;
  const blank={step:0,done:[],answers:{},order:false,draft:'',oral:false,checks:[],seconds:900};
  let state={...blank}; let storage=true;
  try{state={...blank,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{storage=false;}
  state.done=Array.isArray(state.done)?state.done.filter(i=>Number.isInteger(i)&&i>=0&&i<5):[];
  state.step=Number.isInteger(state.step)&&state.step>=0&&state.step<5?state.step:0;
  state.answers=state.answers&&typeof state.answers==='object'?state.answers:{};
  state.checks=Array.isArray(state.checks)?state.checks:[];
  state.seconds=Number.isFinite(state.seconds)?Math.max(0,Math.min(900,state.seconds)):900;
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));$('#saved').textContent='已保存到本机';}catch{storage=false;$('#saved').textContent='浏览器未允许保存，请导出记录';}};
  const names=['听故事','学词汇','找规律','小挑战','我表达'];
  $('#eyebrow').textContent=`LEVEL 3 · WEEK ${LESSON.week} / DAY ${LESSON.day} · 第 ${LESSON.number} 课`;
  $('#title').textContent=LESSON.title;
  $('#mission').textContent=`今天的小目标：${LESSON.focus}`;
  $('#type').textContent=LESSON.type;
  $('#focus').textContent=LESSON.focus;
  $('#story').textContent=LESSON.story;
  $('#grammarFocus').textContent=LESSON.focus;
  $('#rule').textContent=LESSON.rule;
  $('#example').textContent=LESSON.example;
  $('#focusTask').textContent=LESSON.focusTask;
  $('#writingPrompt').textContent=LESSON.writing.prompt;
  $('#starter').textContent=LESSON.writing.starter;
  document.title=`第${LESSON.number}课 · ${LESSON.title} | 桃子英语`;
  $('#steps').innerHTML=names.map((name,i)=>`<button class="step-link" data-go="${i}"><i>${i+1}</i><span>${name}<small>${LESSON.minutes[i]}分钟</small></span></button>`).join('');
  function show(step,scroll=true){
    state.step=step;
    $$('.panel').forEach((p,i)=>p.hidden=i!==step);
    $$('.step-link').forEach((b,i)=>{b.classList.toggle('active',i===step);b.classList.toggle('done',state.done.includes(i));b.setAttribute('aria-current',i===step?'step':'false');b.querySelector('i').textContent=state.done.includes(i)?'✓':String(i+1);});
    $('#progressText').textContent=`已完成 ${state.done.length} / 5 步`;
    $('#bar').style.width=(state.done.length*20)+'%';
    $('#celebration').hidden=state.done.length!==5;
    if(scroll)$('.lesson-area').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    save();
  }
  $$('.step-link').forEach(b=>b.onclick=()=>show(Number(b.dataset.go)));
  $('#words').innerHTML=LESSON.words.map((w,i)=>`<article class="word"><h3>${E(w.en)}</h3><div class="word-actions"><button class="audio quiet" data-audio="word${i}">▶ 听发音</button><button class="quiet reveal" data-word="${i}" aria-expanded="false">翻开意思</button></div><p class="meaning" id="meaning${i}" hidden>${E(w.zh)}</p><p class="english">${E(w.sentence)}</p></article>`).join('');
  $('#allWords').innerHTML=LESSON.allWords.map(w=>`<div><strong>${E(w.en)}</strong><br>${E(w.zh)}</div>`).join('');
  $$('.reveal').forEach(b=>b.onclick=()=>{const node=$('#meaning'+b.dataset.word);node.hidden=!node.hidden;b.textContent=node.hidden?'翻开意思':'盖住意思';b.setAttribute('aria-expanded',String(!node.hidden));});
  const audio=$('#audio');let currentAudio='';
  const labels={story:'英语故事',intro:'中文导学',rule:'语法讲解',example:'英语例句',task:'表达任务',sentence:'拼句示范',word0:'词汇1',word1:'词汇2',word2:'词汇3'};
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-audio]');if(!b)return;
    const id=b.dataset.audio;audio.pause();audio.src=LESSON.audios[id];audio.playbackRate=Number($('#speed').value);currentAudio=id;
    $('#player').hidden=false;$('#playingLabel').textContent=labels[id]||'语音';
    try{await audio.play();}catch{$('#playingLabel').textContent='请点播放器中的播放按钮';}
  });
  audio.addEventListener('error',()=>{$('#playingLabel').textContent='播放失败，请重新点听音按钮或换浏览器';});
  audio.addEventListener('ended',()=>{if(currentAudio==='story')$('#listenHint').textContent='故事播放完了。你能说出谁在做什么吗？';});
  $('#speed').onchange=()=>{audio.playbackRate=Number($('#speed').value);};
  $('#closeAudio').onclick=()=>{audio.pause();$('#player').hidden=true;};
  $('#questions').innerHTML=LESSON.questions.map((q,i)=>`<div class="quiz"><h3>${i+1}. ${E(q.q)}</h3><div class="options">${q.options.map((o,j)=>`<button class="option" data-q="${i}" data-option="${j}">${String.fromCharCode(65+j)} · ${E(o)}</button>`).join('')}</div><p class="feedback" id="feedback${i}" role="status"></p></div>`).join('');
  function answer(i,j){
    const q=LESSON.questions[i],ok=j===q.answer;
    $$(`[data-q="${i}"]`).forEach(b=>{b.classList.remove('wrong','correct');b.setAttribute('aria-pressed','false');});
    const b=$(`[data-q="${i}"][data-option="${j}"]`);b.classList.add(ok?'correct':'wrong');b.setAttribute('aria-pressed','true');
    $(`#feedback${i}`).textContent=(ok?'✓ 答对了。':'再想一想。')+q.why;
    if(ok)state.answers[i]=j;else{delete state.answers[i];state.done=state.done.filter(n=>n!==3);$('#celebration').hidden=true;}
    save();
  }
  $$('[data-q]').forEach(b=>b.onclick=()=>answer(Number(b.dataset.q),Number(b.dataset.option)));
  Object.entries(state.answers).forEach(([i,j])=>{if(LESSON.questions[i]&&j===LESSON.questions[i].answer)answer(Number(i),j);});
  const correctTokens=LESSON.sentence.match(/\S+/g);let chosen=[];
  const shuffled=correctTokens.map((text,i)=>({text,i})).sort((a,b)=>((a.i*17+LESSON.number*7)%31)-((b.i*17+LESSON.number*7)%31));
  if(shuffled.every((x,i)=>x.i===i))shuffled.reverse();
  function tokens(){
    $('#tokens').innerHTML=shuffled.map(t=>`<button data-pick="${t.i}" ${chosen.includes(t.i)?'disabled':''}>${E(t.text)}</button>`).join('');
    $('#answerTokens').innerHTML=chosen.map((i,j)=>`<button data-remove="${j}" aria-label="移除 ${E(correctTokens[i])}">${E(correctTokens[i])}</button>`).join('');
    $$('[data-pick]').forEach(b=>b.onclick=()=>{chosen.push(Number(b.dataset.pick));invalidateOrder();tokens();});
    $$('[data-remove]').forEach(b=>b.onclick=()=>{chosen.splice(Number(b.dataset.remove),1);invalidateOrder();tokens();});
  }
  function invalidateOrder(){state.order=false;state.done=state.done.filter(n=>n!==3);$('#orderFeedback').textContent='';$('#celebration').hidden=true;save();}
  $('#resetTokens').onclick=()=>{chosen=[];invalidateOrder();tokens();};
  $('#checkTokens').onclick=()=>{
    const result=chosen.map(i=>correctTokens[i]).join(' ');
    state.order=result===LESSON.sentence;
    $('#orderFeedback').textContent=state.order?'✓ 拼对了！读一遍，再换成自己的例子。':'还差一点，听一遍目标句，留意开头的大写和结尾的标点。';
    save();
  };
  if(state.order)chosen=correctTokens.map((_,i)=>i);tokens();
  $('#draft').value=state.draft;
  const count=()=>{const n=$('#draft').value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length||0;$('#wordCount').textContent=`${n} 个英文词 · 草稿仅保存在当前浏览器`;return n;};
  $('#draft').oninput=()=>{state.draft=$('#draft').value;count();save();};count();
  $('#oral').checked=state.oral;
  $('#oral').onchange=()=>{state.oral=$('#oral').checked;save();};
  $('#checks').innerHTML=LESSON.writing.check.map((t,i)=>`<label><input type="checkbox" data-check="${i}" ${state.checks.includes(i)?'checked':''}>${E(t)}</label>`).join('');
  $$('[data-check]').forEach(c=>c.onchange=()=>{state.checks=$$('[data-check]:checked').map(n=>Number(n.dataset.check));save();});
  $$('[data-done]').forEach(b=>b.onclick=()=>{
    const n=Number(b.dataset.done);
    if(n===3&&(!state.order||LESSON.questions.some((q,i)=>state.answers[i]!==q.answer))){$('#challengeStatus').textContent='还有小挑战没完成：请检查每一道题和拼句，再继续。';return;}
    if(n===4&&((!state.oral&&count()<5)||state.checks.length!==LESSON.writing.check.length)){$('#finishStatus').textContent='请先开口或写下至少5个英文词，再逐项完成自查。这里不会自动判断作文对错。';return;}
    $('#challengeStatus').textContent='';$('#finishStatus').textContent='';
    if(!state.done.includes(n))state.done.push(n);
    show(Math.min(4,n+1));
    if(state.done.length===5){audio.pause();$('#celebration').scrollIntoView({behavior:'smooth'});}
  });
  $('#review').onclick=()=>show(0);
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
  $('#exportDraft').onclick=()=>download(new Blob([`桃子英语 · 第${LESSON.number}课\n${LESSON.title}\n${LESSON.focus}\n\n${state.draft}\n\n口头完成：${state.oral?'是':'否'}\n已完成：${state.done.length}/5步\n本文件由孩子自行检查，不是自动评分报告。`],{type:'text/plain;charset=utf-8'}),`English-Day-${LESSON.number}.txt`);
  // Keep a pristine, fully embedded source document. Saving after interaction must not leak a child's draft.
  const source='<!doctype html>\n'+document.documentElement.outerHTML;
  $('#download').onclick=()=>download(new Blob([source],{type:'text/html;charset=utf-8'}),`Peach-English-Day-${LESSON.number}.html`);
  let interval=null;
  const clock=()=>{const m=Math.floor(state.seconds/60),s=String(state.seconds%60).padStart(2,'0');$('#timer').textContent=(interval?'暂停计时 ':'开始计时 ')+`${m}:${s}`;if(state.seconds===0)$('#timer').textContent='15分钟到了，可完成手头任务';};
  $('#timer').onclick=()=>{if(interval){clearInterval(interval);interval=null;save();}else if(state.seconds>0){interval=setInterval(()=>{if(document.visibilityState==='visible'){state.seconds--;if(state.seconds%10===0)save();if(state.seconds<=0){clearInterval(interval);interval=null;save();}clock();}},1000);}clock();};clock();
  let recorder,stream,chunks=[],recordURL,recordTimeout;
  $('#record').onclick=async()=>{
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('#recordStatus').textContent='当前浏览器不支持录音。可以直接说给家人听，并勾选“已开口完成”。';return;}
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{clearTimeout(recordTimeout);stream.getTracks().forEach(t=>t.stop());if(recordURL)URL.revokeObjectURL(recordURL);const mime=recorder.mimeType||'audio/webm';recordURL=URL.createObjectURL(new Blob(chunks,{type:mime}));$('#recordPlayback').src=recordURL;$('#recordPlayback').hidden=false;$('#saveRecord').href=recordURL;$('#saveRecord').download='my-english.'+(mime.includes('mp4')?'m4a':'webm');$('#saveRecord').hidden=false;$('#recordStatus').textContent='录音仅在本页，可回听并保存。离开页面前请下载；没有自动发音评分。';$('#record').hidden=false;$('#stopRecord').hidden=true;};
      recorder.start();$('#record').hidden=true;$('#stopRecord').hidden=false;$('#recordStatus').textContent='正在录音，最长2分钟。请说出自己的句子。';recordTimeout=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},120000);
    }catch{$('#recordStatus').textContent='未获得麦克风权限。可以直接开口练习，或写下你的句子。';}
  };
  $('#stopRecord').onclick=()=>{if(recorder?.state==='recording')recorder.stop();};
  window.addEventListener('pagehide',()=>{save();audio.pause();if(stream)stream.getTracks().forEach(t=>t.stop());});
  show(state.step,false);if(!storage)$('#saved').textContent='浏览器未允许保存，请导出记录';
})();
