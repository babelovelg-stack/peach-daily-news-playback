import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildEmail,buildMergedBackfillEmail,buildNewsAuditManifest,buildPlaybackSpeechText,renderPlaybackArticleHtml,collectNews} from './peach-daily-news.mjs';
import {createPlaybackManifest,preparedTextComparable,preparedTextIncludes} from './peach-playback-manifest.mjs';
import {resendPreparedEmail} from './send-existing-peach-email.mjs';

async function fixture(t, providedMessage) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'peach-resend-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const evidence={qualifiedCount:0,curatedCount:0,qualified:[],candidates:[],rejected:[],collectionSucceeded:true,feeds:[{name:'fixture',feedId:'feed-0',status:'success',parsedCount:0}]};
  const previousState={lastQuestion:'计算题：3组同学，每组4人，一共有多少人？\nA. 7人\nB. 12人\nC. 15人',lastAnswer:'答案：B。3×4=12，一共有12人。',lastSentDate:'2026-10-23'};
  const message=providedMessage || buildEmail([],previousState, {asOf:new Date('2026-10-24T10:00:00Z'),selectionEvidence:evidence});
  const audit=buildNewsAuditManifest(message,{}), dateKey=audit.issues.at(-1).dateKey, url=`https://example.test/peach/${dateKey}/`;
  const output=path.join(dir,'peach-playback',dateKey);
  await fs.mkdir(output,{recursive:true});
  const speech=buildPlaybackSpeechText(message.playbackData);
  const assets={'index.html':Buffer.from(renderPlaybackArticleHtml(message.playbackData,url)),
    'speech.txt':Buffer.from(speech),'captions.vtt':Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n'+speech.replace(/\n+/g,' ')+'\n'),'audio.mp3':Buffer.concat([Buffer.from('ID3'),Buffer.alloc(14000)])};
  for(const [name,data] of Object.entries(assets)) await fs.writeFile(path.join(output,name),data);
  const manifest=await createPlaybackManifest(audit,output);
  await fs.writeFile(path.join(dir,'peach-news-audit.json'),JSON.stringify(audit));
  await fs.writeFile(path.join(dir,'peach-playback-manifest.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(dir,'peach-daily-news.txt'),message.text);
  await fs.writeFile(path.join(dir,'peach-daily-news.html'),message.html);
  let sent=0;
  const send=async()=>{sent++;};
  const fetchImpl=async requested=>{
    const name=new URL(requested).pathname.split('/').at(-1) || 'index.html';
    return new Response(assets[name] || 'trusted source',{headers:name==='audio.mp3'?{'content-type':'audio/mpeg','content-length':String(assets[name].length)}:{}});
  };
  return {dir,output,assets,audit,manifest,message,url,send,fetchImpl,sent:()=>sent,
    run:overrides=>resendPreparedEmail({artifactDir:dir,playbackUrl:url,send,fetchImpl,subjectOverride:'自定义每日情报',...overrides})};
}
test('actual resend entry validates four files even with zero news and preserves science subject',async t=>{
  const f=await fixture(t), requested=[];
  const result=await f.run({fetchImpl:async url=>{requested.push(url);return f.fetchImpl(url);}});
  assert.equal(f.sent(),1);
  assert.match(result.subject,/儿童科学知识版/);
  for(const name of Object.keys(f.assets)) assert.ok(requested.includes(f.url+name));
});
async function newsMessage(merged=false){
  const asOf=new Date('2026-10-13T10:00:00Z');
  const saved=JSON.parse(await fs.readFile(new URL('./peach-news-state.json',import.meta.url)));
  // This historical news fixture supplies a prior answer without importing the
  // later production news history that correctly excludes October 13 stories.
  const state={lastQuestion:saved.lastQuestion,lastQuestionId:saved.lastQuestionId,lastAnswer:saved.lastAnswer,lastSentDate:'2026-10-12'};
  const curated=JSON.parse(await fs.readFile(new URL('./peach-curated-news.json',import.meta.url)));
  const items=curated.filter(item=>Date.parse(item.published)>asOf-86400000 && Date.parse(item.published)<=+asOf).slice(0,2).map(item=>({...item,published:Date.parse(item.published),domain:new URL(item.link).hostname,feed:'人工核对'}));
  const news=await collectNews(asOf,{}, {feedList:[],curatedItems:items,fetchImpl:async()=>new Response('article')});
  if(!merged) return buildEmail(news,state,{asOf});
  const collect=async date=>+date===+asOf?news:Object.assign([],{selectionEvidence:{qualifiedCount:0,curatedCount:0,qualified:[],candidates:[],rejected:[],collectionSucceeded:true,feeds:[{feedId:'feed-0',status:'success',parsedCount:0}]}});
  return buildMergedBackfillEmail([asOf,new Date('2026-10-14T10:00:00Z')],state,{collect});
}
test('actual sender accepts complete schema 2 news and mixed merged issues',async t=>{
  for(const merged of [false,true]){
    const f=await fixture(t,await newsMessage(merged));
    for(const issue of f.message.playbackData.issues || [f.message.playbackData]) {
      assert.ok(issue.previousAnswer);
      assert.ok(f.message.text.includes(issue.previousAnswer));
      for(const body of [f.message.html,f.assets['index.html'].toString()]) assert.ok(preparedTextComparable(body).includes(preparedTextComparable(issue.previousAnswer)));
      assert.ok(!f.assets['speech.txt'].toString().includes(issue.previousAnswer));
    }
    await f.run();
    assert.equal(f.sent(),1);
  }
});
test('legacy schema 1 positive-news resend remains compatible, without enabling zero-news',async t=>{
  const f=await fixture(t,await newsMessage());
  f.audit.schemaVersion=1;
  await fs.writeFile(path.join(f.dir,'peach-news-audit.json'),JSON.stringify(f.audit));
  await fs.unlink(path.join(f.dir,'peach-playback-manifest.json'));
  await f.run();
  assert.equal(f.sent(),1);
});
test('SMTP failure never writes the formal delivery state',async t=>{
  const f=await fixture(t);
  const statePath=path.join(f.dir,'peach-news-state.json'),original='{"lastSentDate":"2026-10-23"}';
  await fs.writeFile(statePath,original);
  await assert.rejects(f.run({send:async()=>{throw new Error('simulated SMTP failure');}}),/simulated SMTP/);
  assert.equal(await fs.readFile(statePath,'utf8'),original);
});
for(const corruption of ['audit','manifest','audio.mp3','captions.vtt','speech.txt','date','mode','fact','remote','subject-only-legacy','old-manifest']){
  test('actual resend stops before SMTP for '+corruption,async t=>{
    const f=await fixture(t);
    if(corruption==='audit') await fs.unlink(path.join(f.dir,'peach-news-audit.json'));
    else if(corruption==='manifest') await fs.unlink(path.join(f.dir,'peach-playback-manifest.json'));
    else if(['audio.mp3','captions.vtt','speech.txt'].includes(corruption)) await fs.unlink(path.join(f.output,corruption));
    else if(corruption==='date') f.url='https://example.test/peach/2026-10-25/';
    else if(corruption==='mode'){f.audit.issues[0].contentMode='news';await fs.writeFile(path.join(f.dir,'peach-news-audit.json'),JSON.stringify(f.audit));}
    else if(corruption==='fact'){f.audit.issues[0].knowledgeItems[0].text+='编造';await fs.writeFile(path.join(f.dir,'peach-news-audit.json'),JSON.stringify(f.audit));}
    else if(corruption==='remote') f.assets['index.html']=Buffer.from('stale');
    else if(corruption==='old-manifest'){f.manifest.schemaVersion=0;await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(f.manifest));}
    else if(corruption==='subject-only-legacy'){await fs.unlink(path.join(f.dir,'peach-news-audit.json'));await fs.writeFile(path.join(f.dir,'peach-daily-news.txt'),'这里是没有新闻标题的旧纯百科信');}
    await assert.rejects(f.run({playbackUrl:f.url}));
    assert.equal(f.sent(),0);
  });
}
test('schema 2 requires valid HTTPS playback URL even when no news titles exist',async t=>{
  const f=await fixture(t);
  for(const playbackUrl of ['', 'http://example.test/peach/2026-10-24/','https://example.test/wrong/']) await assert.rejects(f.run({playbackUrl}));
  assert.equal(f.sent(),0);
});
test('new hashes cannot legitimize incomplete or quiz-containing captions',async t=>{
  const f=await fixture(t);
  for(const text of ['叮叮',f.assets['speech.txt'].toString()+'今日探索题，答案是B']){
    f.assets['captions.vtt']=Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n'+text+'\n');
    await fs.writeFile(path.join(f.output,'captions.vtt'),f.assets['captions.vtt']);
    await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(await createPlaybackManifest(f.audit,f.output)));
    await assert.rejects(f.run(),/Captions differ/);
  }
  assert.equal(f.sent(),0);
});
test('email HTML wrong date rejects before SMTP without changing asset hashes',async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.dir,'peach-daily-news.html'),f.message.html.replaceAll('2026年10月24日','2026年10月25日'));
  await assert.rejects(f.run(),/email HTML date/);
  assert.equal(f.sent(),0);
});
test('matching captions and new hashes cannot approve current/previous quizzes, answers or invented speech',async t=>{
  for(const kind of ['question','answer','previous-question','previous-answer','invented']) {
    const f=await fixture(t), issue=f.audit.issues[0];
    const extra={question:issue.question.q,answer:issue.question.a,'previous-question':issue.previousState.lastQuestion,'previous-answer':issue.previousState.lastAnswer,invented:'太阳是奶酪做成的。'}[kind];
    const speech=f.assets['speech.txt'].toString()+'\n'+extra;
    f.assets['speech.txt']=Buffer.from(speech);
    f.assets['captions.vtt']=Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n'+speech+'\n');
    for(const name of ['speech.txt','captions.vtt']) await fs.writeFile(path.join(f.output,name),f.assets[name]);
    await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(await createPlaybackManifest(f.audit,f.output)));
    await assert.rejects(f.run(),/approved narration/,kind);
    assert.equal(f.sent(),0,kind);
  }
});
test('decimal points and negative signs remain significant in full speech and caption checks',async t=>{
  for(const target of ['speech','captions']) for(const replacement of ['20.30','-2030']) {
    const f=await fixture(t,await newsMessage());
    const original=f.assets['speech.txt'].toString();
    assert.ok(original.includes('2030'));
    const changed=original.replace('2030',replacement);
    if(target==='speech') f.assets['speech.txt']=Buffer.from(changed);
    f.assets['captions.vtt']=Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n'+changed.replace(/\n+/g,' ')+'\n');
    for(const name of ['speech.txt','captions.vtt']) await fs.writeFile(path.join(f.output,name),f.assets[name]);
    await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(await createPlaybackManifest(f.audit,f.output)));
    await assert.rejects(f.run(),target==='speech'?/approved narration/:/Captions differ/);
    assert.equal(f.sent(),0);
  }
});
for(const target of ['emailText','emailHtml','page']) for(const replacement of ['20.30','-2030']) {
  test(`actual resend rejects ${target} numeric corruption 2030 -> ${replacement} even with fresh hashes`,async t=>{
    const f=await fixture(t,await newsMessage());
    if(target==='page') {
      const original=f.assets['index.html'].toString();
      assert.ok(original.includes('2030'));
      f.assets['index.html']=Buffer.from(original.replaceAll('2030',replacement));
      await fs.writeFile(path.join(f.output,'index.html'),f.assets['index.html']);
      await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(await createPlaybackManifest(f.audit,f.output)));
    } else {
      const original=target==='emailText'?f.message.text:f.message.html;
      assert.ok(original.includes('2030'));
      await fs.writeFile(path.join(f.dir,target==='emailText'?'peach-daily-news.txt':'peach-daily-news.html'),original.replaceAll('2030',replacement));
    }
    await assert.rejects(f.run(),/Prepared content missing/);
    assert.equal(f.sent(),0);
  });
}
test('display comparison tolerates HTML formatting but preserves numeric operators and grouping',()=>{
  const same=[['温度为 <b>-20.1</b> 摄氏度。','温度为-20.1摄氏度！'],['比值：3 &lt; 5，6 &gt; 4。','比值：3 < 5，6 > 4。'],['计算：2 &times; (3+4) = 14。','计算：2 × (3+4) = 14。']];
  for(const [a,b] of same) assert.equal(preparedTextComparable(a),preparedTextComparable(b));
  const different=[['20.1','201'],['-20','20'],['−20','20'],['20%','20'],['20％','20'],['2-5','25'],['2～5','25'],['2—5','25'],['2+3','23'],['2×3','23'],['6÷3','63'],['2*3','23'],['6/3','63'],['2=3','23'],['2<3','23'],['2>(3-1)','23-1'],['2*(3+4)','2*3+4'],['2^3','23']];
  for(const [a,b] of different) assert.notEqual(preparedTextComparable(a),preparedTextComparable(b),`${a} must differ from ${b}`);
  for(const changed of ['-2030年目标','12030年目标','20.30年目标']) assert.equal(preparedTextIncludes(changed,'2030年目标'),false);
  assert.equal(preparedTextIncludes('计划在2030年实现目标。','2030年实现目标'),true);
  assert.equal(preparedTextIncludes('预计增长20%','预计增长20'),false);
});
for(const merged of [false,true]) for(const target of ['emailText','emailHtml','page']) for(const corruption of ['missing','changed']) {
  test(`actual resend rejects ${merged?'merged':'daily'} ${target} previous answer ${corruption}`,async t=>{
    const f=await fixture(t,await newsMessage(merged));
    const issues=f.message.playbackData.issues || [f.message.playbackData];
    const previousAnswer=issues.at(-1).previousAnswer;
    const lastAnswer=f.audit.issues.at(-1).previousState.lastAnswer;
    assert.ok(previousAnswer.includes(lastAnswer));
    const alter=original=>corruption==='changed'?original.replace(lastAnswer,'答案：所有选项都错误。'):target==='emailText'?original.replace(previousAnswer,''):original.replaceAll(/<div class="prev-answer">[\s\S]*?<\/div>/g,'');
    if(target==='page') {
      const original=f.assets['index.html'].toString(),changed=alter(original);
      assert.notEqual(original,changed);
      f.assets['index.html']=Buffer.from(changed);
      await fs.writeFile(path.join(f.output,'index.html'),f.assets['index.html']);
      await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(await createPlaybackManifest(f.audit,f.output)));
    } else {
      const original=target==='emailText'?f.message.text:f.message.html,changed=alter(original);
      assert.notEqual(original,changed);
      await fs.writeFile(path.join(f.dir,target==='emailText'?'peach-daily-news.txt':'peach-daily-news.html'),changed);
    }
    await assert.rejects(f.run(),/previous answer/);
    assert.equal(f.sent(),0);
  });
}
for(const target of ['emailText','emailHtml','page']) {
  test(`actual resend rejects merged ${target} previous answers swapped between dates`,async t=>{
    const f=await fixture(t,await newsMessage(true));
    const original=target==='emailText'?f.message.text:target==='emailHtml'?f.message.html:f.assets['index.html'].toString();
    const blocks=target==='emailText'?f.message.playbackData.issues.map(issue=>issue.previousAnswer):[...original.matchAll(/<div class="prev-answer">[\s\S]*?<\/div>/g)].map(match=>match[0]);
    assert.equal(blocks.length,2);
    assert.notEqual(blocks[0],blocks[1]);
    const changed=original.replace(blocks[0],'PREVIOUS_ANSWER_SWAP_PLACEHOLDER').replace(blocks[1],blocks[0]).replace('PREVIOUS_ANSWER_SWAP_PLACEHOLDER',blocks[1]);
    if(target==='page') {
      f.assets['index.html']=Buffer.from(changed);
      await fs.writeFile(path.join(f.output,'index.html'),f.assets['index.html']);
      await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(await createPlaybackManifest(f.audit,f.output)));
    } else await fs.writeFile(path.join(f.dir,target==='emailText'?'peach-daily-news.txt':'peach-daily-news.html'),changed);
    await assert.rejects(f.run(),/previous answer/);
    assert.equal(f.sent(),0);
  });
}
test('audit cannot approve free-form narration text or a different unselected template',async t=>{
  for(const kind of ['text','template']) {
    const f=await fixture(t);
    if(kind==='text') f.audit.issues[0].narration.expectedSpeech='太阳是奶酪做成的。';
    else f.audit.issues[0].narration.encouragementIndex++;
    await fs.writeFile(path.join(f.dir,'peach-news-audit.json'),JSON.stringify(f.audit));
    await fs.writeFile(path.join(f.dir,'peach-playback-manifest.json'),JSON.stringify(await createPlaybackManifest(f.audit,f.output)));
    await assert.rejects(f.run(),/approved narration metadata/);
    assert.equal(f.sent(),0);
  }
});
