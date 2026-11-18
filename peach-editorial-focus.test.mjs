import test from 'node:test';
import assert from 'node:assert/strict';
import {feedsForIssue,editorialAngle} from './peach-editorial-focus.mjs';
import {collectNews,buildEmail,buildNewsAuditManifest} from './peach-daily-news.mjs';
import {validateNewsAuditManifest} from './peach-news-self-check.mjs';

const first=new Date('2026-11-19T18:00:00+08:00');
const before=new Date(+first-86400000);
// Synthetic events, not dated claims about the user's examples.
const samples=[
  ['文化','国产动画《小纸船》入选国际动画展映单元','动画展映单元公布了入选名单，《小纸船》将以两种语言的字幕放映。'],
  ['文化','绘本插画家林青获得国际插画奖','国际插画奖公布了评选结果，评委介绍了林青怎样用绘本里的颜色变化讲故事。'],
  ['社会','国产摩托车队在世界锦标赛分站赛夺冠','摩托车组委会公布分站赛成绩，这支车队在规定组别完成全部赛程并夺冠。'],
  ['科技','机器人挑战赛公布自主避障任务成绩','机器人挑战赛要求机器绕开障碍搬运物体，评委按完成时间和搬运准确度记录成绩。'],
  ['文化','博物馆上线人工智能文物数字讲解','博物馆将新讲解与文物档案关联，参观者能分辨哪些图像来自实物、哪些是数字还原。'],
  ['社会','社区图书馆开始延时开放','社区图书馆把周五的借阅服务延长到晚上，读者可以在下班或放学后还书。'],
  ['时政','公共图书馆条例草案发布并征求意见','公共图书馆条例草案列出面向儿童的借阅安排，读者可以在规定时间内提交意见。']
];
const feed={name:'独立来源',publisher:'测试报',url:'https://example.test/focus.xml',category:'中国',weight:9,focusOnly:true};
async function collect(title,description,{asOf=first,published=+asOf-3600000,prior={}}={}) {
  const xml='<rss><channel><item><title>'+title+'</title><description>'+description+'</description><link>https://example.test/story</link><pubDate>'+new Date(published).toUTCString()+'</pubDate></item></channel></rss>';
  return collectNews(asOf,prior,{feedList:[feed],curatedItems:[],fetchImpl:async url=>new Response(url===feed.url?xml:'article')});
}
test('new source set activates by Shanghai issue cutoff, not fetch time',()=>{
  const base=[{name:'existing'}];
  assert.deepEqual(feedsForIssue(base,before),base);
  const next=feedsForIssue(base,first);
  assert.equal(next.filter(f=>f.focusOnly).length,4);
  assert.equal(new Set(next.map(f=>f.url)).size,next.length);
  assert.equal(base.length,1);
});
for(const [pillar,title,description] of samples) test('collects and audits '+title, async()=>{
  assert.equal(editorialAngle(title,before),undefined);
  const news=await collect(title,description);
  assert.equal(news.length,1,JSON.stringify(news.selectionEvidence.rejected));
  assert.equal(news[0].category,pillar);
  const audit=buildNewsAuditManifest(buildEmail(news,{}, {asOf:first}),{});
  const [record]=audit.issues[0].newsItems;
  assert.equal(record.pillar,pillar);
  assert.equal(record.summary,description);
  assert.deepEqual(validateNewsAuditManifest(audit),[]);
});
test('no quota: rejects name-only buzz, adverts, title echoes, stale and repeated events',async()=>{
  const [,title,description]=samples[0];
  for(const [t,d,opts] of [
    ['国产动画又火了，引发热议','许多网友都在讨论国产动画，相关话题最近频频登上热搜。',{}],
    ['国产动画又火了，引发热议','国产动画吸引关注。另一本小说入选了书单。',{}],
    ['限时抢购：'+title,description,{}],
    [title,title+'。',{}],
    [title,description,{published:+before}],
    [title,description,{prior:{recentNewsTitles:[title]}}],
    [title,description,{asOf:before}]
  ]) assert.equal((await collect(t,d,opts)).length,0,t);
});
test('a buzz headline needs a concrete reported event about the same subject',async()=>{
  const news=await collect('国产动画《小纸船》走出国门','国产动画《小纸船》入选国际展映单元，主办方公布了带字幕的放映场次。');
  assert.equal(news.length,1,JSON.stringify(news.selectionEvidence.rejected));
  assert.equal(news[0].category,'文化');
});
