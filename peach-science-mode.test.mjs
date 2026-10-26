import test from 'node:test';
import assert from 'node:assert/strict';
import { decideContentMode } from './peach-science-mode.mjs';
import { readScienceCatalog, selectScienceKnowledge, catalogIssues } from './peach-science-mode.mjs';
import { buildEmail, buildMergedBackfillEmail, buildNewsAuditManifest, validateMessageQuality, validateKnowledgeQuality, collectNews, museumEncyclopedia, readState, renderPlaybackArticleHtml, buildPlaybackSpeechSections, trimKidText } from './peach-daily-news.mjs';
import { validateNewsAuditManifest } from './peach-news-self-check.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const emptyFeed={name:'fixture',url:'https://example.test/feed',publisher:'Fixture',category:'科技',weight:10};
const feedResponse=()=>new Response('<rss><channel><title>Empty feed</title></channel></rss>');
const emptyEvidence=()=>({qualifiedCount:0,curatedCount:0,qualified:[],candidates:[],rejected:[],collectionSucceeded:true,feeds:[{name:'fixture',feedId:'feed-0',status:'success',parsedCount:0}]});
const previousAnswerState={lastSentDate:'2026-10-12',lastQuestion:'计算题：3组同学，每组4人，一共有多少人？\nA. 7人\nB. 12人\nC. 15人',lastAnswer:'答案：B。3×4=12，一共有12人。'};
test('capacity summaries retain complete decimal numbers instead of ending at a decimal point',()=>{
  const input='统计涵盖全国，'+ '已有设备'.repeat(16)+'容量达到20.1亿千瓦。后续仍需核对实际发电量。';
  const shortened=trimKidText(input,input.indexOf('20.')+3);
  assert.ok(!shortened.endsWith('20.'));
});
test('reviewed capacity explanation extracts values from source without inventing cleaning robots',async()=>{
  for(const total of ['20.1','21.3']) {
    const title='国家能源局：我国风光累计装机容量突破20亿千瓦';
    const description=`我国新能源发展迈出坚实步伐，截至2026年9月底，风电和太阳能发电累计装机容量达到${total}亿千瓦。`;
    const xml=`<rss><channel><item><title>${title}</title><description>${description}</description><pubDate>2026-10-26T09:00:00Z</pubDate><link>https://www.chinanews.com.cn/fixture</link></item></channel></rss>`;
    const news=await collectNews(new Date('2026-10-26T10:00:00Z'),{}, {feedList:[{...emptyFeed,publisher:'中国新闻网'}],curatedItems:[],fetchImpl:async url=>new Response(url===emptyFeed.url?xml:'article')});
    assert.equal(news.length,1);
    const record=news.selectionEvidence.qualified[0].newsItem;
    assert.ok(record.summary.includes(total+'亿千瓦'));
    assert.match(record.value,/最大.*出力|最大.*输出/);
    assert.doesNotMatch(record.value+record.impact,/机器人|清扫/);
  }
});

test('only zero qualified stories selects science, one and two remain news', () => {
  assert.equal(decideContentMode({ qualifiedCount: 0, collectionSucceeded: true }), 'science');
  assert.equal(decideContentMode({ qualifiedCount: 1, collectionSucceeded: true }), 'news');
  assert.equal(decideContentMode({ qualifiedCount: 2, collectionSucceeded: true }), 'news');
});
test('152 reviewed facts retain 45-issue exclusion for 60 consecutive science issues from current state', async () => {
  const catalog=readScienceCatalog();
  assert.ok(catalog.length>=150);
  let state=JSON.parse(await fs.readFile(new URL('./peach-news-state.json',import.meta.url)));
  const start=Date.parse('2026-10-24T10:00:00Z'), picked=[];
  for(let day=0;day<60;day++){
    const message=buildEmail([],state,{asOf:new Date(start+day*86400000),selectionEvidence:emptyEvidence()});
    validateMessageQuality(message,state);
    const facts=message.quality.issues[0].knowledgeItems;
    const recent=new Set(picked.slice(-45).flat().map(item=>item.conceptId));
    assert.ok(facts.every(item=>!recent.has(item.conceptId)));
    assert.equal(new Set(facts.map(item=>item.tags[0])).size,3);
    assert.equal(message.nextState.lastContentMode,'science');
    picked.push(facts);state=message.nextState;
  }
  assert.equal(picked.length,60);
});
test('catalog rejects missing and duplicate pool; legacy IDs prevent relabeling', () => {
  const catalog=readScienceCatalog();
  assert.ok(catalogIssues([]).length);
  assert.ok(catalogIssues([...catalog,catalog[0]]).length);
  const original=catalog.find(item=>item.conceptId==='venus-slow-spin');
  const selected=selectScienceKnowledge(catalog.indexOf(original),{recentEncyclopediaIds:['museum-venus-day']},museumEncyclopedia);
  assert.ok(!selected.some(item=>item.conceptId===original.conceptId));
  assert.throws(()=>selectScienceKnowledge(1,{},museumEncyclopedia,catalog.slice(0,149)));
});
test('zero evidence and trusted catalog contents are rechecked, not trusted from audit', () => {
  const message=buildEmail([],{}, {asOf:new Date('2026-10-24T10:00:00Z'),selectionEvidence:emptyEvidence()});
  const good=buildNewsAuditManifest(message,{});
  assert.deepEqual(validateNewsAuditManifest(good),[]);
  for(const mutate of [
    a=>a.issues[0].contentMode='mystery',
    a=>a.issues[0].selectionEvidence.qualifiedCount=1,
    a=>a.issues[0].selectionEvidence.collectionSucceeded=false,
    a=>a.issues[0].knowledgeItems[0].text='百科小知识：月球全部都是奶酪，所以宇航员可以带着饼干到月球上吃饭。',
    a=>a.issues[0].knowledgeItems[0].link='https://example.test/forged',
    a=>a.issues[0].question.a='missing',
    a=>a.issues[0].asOf='invalid',
    a=>a.issues[0].asOf='2026-10-25T10:00:00Z',
    a=>a.issues[0].selectionEvidence.feeds[0].status='failed',
    a=>a.issues[0].selectionEvidence.feeds.push({status:'failed',parsedCount:0,transient:true}),
    a=>a.schemaVersion=1
  ]) {const audit=structuredClone(good);mutate(audit);assert.ok(validateNewsAuditManifest(audit).length);}
});
test('a parsed feed item cannot disappear from a zero-news audit',()=>{
  const message=buildEmail([],{}, {asOf:new Date('2026-10-24T10:00:00Z'),selectionEvidence:emptyEvidence()});
  const audit=buildNewsAuditManifest(message,{});
  assert.deepEqual(validateNewsAuditManifest(audit),[]);
  audit.issues[0].selectionEvidence.feeds[0].parsedCount=1;
  assert.ok(validateNewsAuditManifest(audit).length);
  audit.issues[0].selectionEvidence.feeds[0].parsedCount=0;
  audit.issues[0].selectionEvidence.curatedCount=1;
  assert.ok(validateNewsAuditManifest(audit).length);
});
test('successful empty feed and all-rejected fresh candidates legitimately produce zero', async () => {
  const empty=await collectNews(new Date('2026-10-24T10:00:00Z'),{}, {feedList:[emptyFeed],fetchImpl:async()=>feedResponse(),curatedItems:[]});
  assert.equal(empty.selectionEvidence.qualifiedCount,0);
  const rejected=await collectNews(new Date('2026-10-24T10:00:00Z'),{}, {feedList:[emptyFeed],fetchImpl:async()=>feedResponse(),curatedItems:[{title:'商品促销广告',link:'https://example.test/ad',published:Date.parse('2026-10-24T09:00:00Z'),description:'买一送一',publisher:'广告',feed:'广告',category:'科技',weight:10}]});
  assert.equal(rejected.selectionEvidence.qualifiedCount,0);
  assert.equal(rejected.selectionEvidence.rejected.length,1);
});
test('a singleton RSS item or Atom entry remains one eligible news, never zero',async()=>{
  const title='广西10部门联合出台指导意见 推动儿童福利机构开门办院';
  const item=`<title>${title}</title><description>${title} 新华社广西分社</description>`;
  const variants=[`<rss><channel><item>${item}<pubDate>2026-10-24T09:00:00Z</pubDate><link>https://www.news.cn/fixture</link></item></channel></rss>`,
    `<feed><entry>${item}<published>2026-10-24T09:00:00Z</published><link href="https://www.news.cn/fixture"/></entry></feed>`];
  for(const xml of variants){
    const news=await collectNews(new Date('2026-10-24T10:00:00Z'),{}, {feedList:[{...emptyFeed,publisher:'新华社广西分社'}],curatedItems:[],fetchImpl:async url=>new Response(url===emptyFeed.url?xml:'article')});
    assert.equal(news.selectionEvidence.feeds[0].parsedCount,1);
    assert.equal(news.selectionEvidence.qualifiedCount,1);
    assert.equal(buildEmail(news,previousAnswerState,{asOf:new Date('2026-10-24T10:00:00Z')}).quality.issues[0].contentMode,'news');
  }
});
test('all feeds failed, transient feeds and malformed curated/state data fail closed', async () => {
  for(const status of [404,429,500]) {
    let requests=0;
    await assert.rejects(collectNews(new Date('2026-10-24T10:00:00Z'),{}, {feedList:[emptyFeed],fetchImpl:async()=>{requests++;return new Response('',{status});},curatedItems:[]}));
    assert.equal(requests,status===404?1:3);
  }
  await assert.rejects(collectNews(new Date(),{recentQuestionTexts:'bad'}, {feedList:[],curatedItems:[]}));
  await assert.rejects(collectNews(new Date(),{}, {feedList:[],curatedItems:null}));
});
test('collection failure and malformed counts fail closed', () => {
  for (const qualifiedCount of [-1, 0.5, NaN, '0', undefined]) {
    assert.throws(() => decideContentMode({ qualifiedCount, collectionSucceeded: true }));
  }
  assert.throws(() => decideContentMode({ qualifiedCount: 0, collectionSucceeded: false }));
});
test('malformed persisted state fails closed without rewriting it',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'peach-state-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'state.json');
  for(const content of ['{broken','null','{"recentEncyclopediaIds":"bad"}','{"lastSentDate":"2026-02-30"}','{"lastQuestion":42}']) {
    await fs.writeFile(file,content);
    await assert.rejects(readState(file));
    assert.equal(await fs.readFile(file,'utf8'),content);
  }
});
async function newsFixture(count, { status=200, feedStatus=200 }={}) {
  const asOf=new Date('2026-10-13T10:00:00Z');
  const curated=JSON.parse(await fs.readFile(new URL('./peach-curated-news.json',import.meta.url)));
  const items=curated.filter(item=>Date.parse(item.published)>asOf-86400000 && Date.parse(item.published)<=+asOf).slice(0,count).map(item=>({...item,published:Date.parse(item.published),domain:new URL(item.link).hostname,feed:item.feed || '人工核对',category:item.category || '科技'}));
  assert.equal(items.length,count);
  let articleRequests=0;
  const fetchImpl=async url=>{
    if(url===emptyFeed.url) return feedStatus===200 ? feedResponse() : new Response('',{status:feedStatus});
    articleRequests++;
    return new Response('article',{status});
  };
  return {news:await collectNews(asOf,{}, {feedList:[emptyFeed],curatedItems:items,fetchImpl}),asOf,articleRequests};
}
test('one qualified news stays news and fails daily threshold; two retain healthy news mode',async()=>{
  const one=await newsFixture(1);
  const message=buildEmail(one.news,previousAnswerState, {asOf:one.asOf});
  assert.equal(message.quality.issues[0].contentMode,'news');
  assert.throws(()=>validateMessageQuality(message,{}),/至少2/);
  const two=await newsFixture(2);
  const healthy=buildEmail(two.news,previousAnswerState, {asOf:two.asOf});
  assert.equal(healthy.quality.issues[0].contentMode,'news');
  validateMessageQuality(healthy,{});
});
test('fresh qualified curated news can survive all-feed failure, stale curated cannot',async()=>{
  const {news}=await newsFixture(2,{feedStatus:404});
  assert.equal(news.selectionEvidence.qualifiedCount,2);
  assert.equal(decideContentMode(news.selectionEvidence),'news');
  const stale=JSON.parse(await fs.readFile(new URL('./peach-curated-news.json',import.meta.url))).slice(0,1).map(item=>({...item,published:Date.parse(item.published),feed:'人工核对',domain:new URL(item.link).hostname}));
  await assert.rejects(collectNews(new Date('2026-10-26T10:00:00Z'),{}, {feedList:[emptyFeed],curatedItems:stale,fetchImpl:async()=>new Response('',{status:404})}));
});
test('404 and 410 reject individual news; 429 and 5xx stop rather than trigger science',async()=>{
  for(const status of [404,410]) {
    const {news}=await newsFixture(1,{status});
    assert.equal(news.selectionEvidence.qualifiedCount,0);
    assert.ok(news.selectionEvidence.rejected[0].reasons.includes('source-HTTP-'+status));
  }
  for(const status of [429,500]) await assert.rejects(newsFixture(1,{status}),/Transient source failure/);
});
test('mixed merged issue retains one-story legacy threshold and explicit modes across dates',async()=>{
  const {news,asOf}=await newsFixture(1);
  const date2=new Date('2026-10-14T10:00:00Z');
  const collect=async date=>+date===+asOf ? news : Object.assign([],{selectionEvidence:emptyEvidence()});
  const message=await buildMergedBackfillEmail([asOf,date2],previousAnswerState, {collect});
  validateMessageQuality(message,{});
  const audit=buildNewsAuditManifest(message,{});
  assert.deepEqual(audit.issues.map(issue=>issue.contentMode),['news','science']);
  assert.equal(message.nextState.lastSentDate,'2026-10-14');
  assert.ok(message.text.includes(message.quality.issues[0].question.a.replace(/^答案：/,'昨天答案：')));
  const html=renderPlaybackArticleHtml(message.playbackData,'https://example.test/peach/2026-10-24/');
  assert.ok(html.includes('2026-10-13:news;2026-10-14:science'));
  assert.ok(message.html.includes('博物小百科'));
  assert.equal(buildPlaybackSpeechSections(message.playbackData).filter(section=>section.title==='博物小百科').length,2);
  for(const issue of message.quality.issues) assert.ok(html.includes(issue.question.q.split('\n')[0]));
});
test('45 science issues cannot reintroduce the same concepts through legacy museum IDs on return to news',async()=>{
  const catalog=readScienceCatalog();
  let state={...previousAnswerState};
  const start=Date.parse('2026-10-24T10:00:00Z');
  for(let day=0;day<45;day++) state=buildEmail([],state,{asOf:new Date(start+day*86400000),selectionEvidence:emptyEvidence()}).nextState;
  const recent=new Set(state.recentScienceConceptIds.slice(-135));
  const excludedLegacy=new Set(catalog.filter(item=>recent.has(item.conceptId)).flatMap(item=>item.legacyIds));
  const asOf=new Date(start+45*86400000), base=await newsFixture(2);
  const news=await collectNews(asOf,state,{feedList:[],curatedItems:base.news.map(item=>({...item,published:+asOf-60000})),fetchImpl:async()=>new Response('source')});
  const message=buildEmail(news,state,{asOf});
  const picked=message.quality.issues[0].knowledgeItems;
  assert.ok(picked.every(item=>!excludedLegacy.has(item.id)),picked.map(item=>item.id).join(','));
  validateMessageQuality(message,state);
  const repeated=museumEncyclopedia.find(item=>item.id==='museum-seismic-p-s-waves');
  assert.ok(excludedLegacy.has(repeated.id));
  assert.ok(validateKnowledgeQuality([repeated,...picked.slice(0,2)],state).some(error=>error.includes('科学概念')));
  assert.equal(state.recentEncyclopediaIds.length,135);
  const fillers=Array.from({length:135},(_,index)=>`unrelated-${index}`);
  const expired={recentEncyclopediaIds:['science-station-location',...fillers],recentScienceConceptIds:['station-location',...fillers]};
  assert.ok(!validateKnowledgeQuality([repeated,...picked.slice(0,2)],expired).some(error=>error.includes('科学概念')),'concepts outside the original 135-entry window expire');
});
