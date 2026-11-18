// Compare the report cutoff (including for backfills), never the runner's clock.
const FIRST_CUTOFF = Date.parse('2026-11-19T18:00:00+08:00');
export const expandedFocusEnabled = asOf => +new Date(asOf) >= FIRST_CUTOFF;

const focusFeeds = [
  ['文化', '中国新闻网文化', 'https://www.chinanews.com.cn/rss/culture.xml'],
  ['文化', '人民网文化', 'https://www.people.com.cn/rss/culture.xml'],
  ['社会', '中国新闻网体育', 'https://www.chinanews.com.cn/rss/sports.xml'],
  ['时政', '中国新闻网滚动', 'https://www.chinanews.com.cn/rss/scroll-news.xml']
].map(([category,name,url])=>({category,name,url,weight:9,focusOnly:true,publisher:name.startsWith('人民网')?'人民网':'中国新闻网'}));
export const feedsForIssue = (base,asOf) => expandedFocusEnabled(asOf) ? [...base,...focusFeeds] : base;

// Match an event, not a famous name. Explanations distinguish what was observed
// from what a reader could investigate; they never supply results or policy terms.
const angles = [
  {pillar:'文化',subject:/动画|动画片|国漫/,event:/入围|获奖|获选|展映|首映|上映|入选|译制/,
    value:'动画的画面、声音和动作一起讲故事。入选展映单元，指的是作品被选中放映；这和拿到奖项是两件不同的事。',
    impact:'动画换一个地方展映，可能让没接触过这个故事的人看到它。是否真的被更多观众理解，还要看看放映后的反馈。'},
  {pillar:'文化',subject:/插画|插画家|绘本|图画书/,event:/获奖|获颁|摘得|入围|揭晓|荣获|获得.{0,16}奖|获.{0,14}奖/,
    value:'读绘本时，可以把字遮起来，看看插画怎样用人物的表情、颜色和前后两页的变化讲故事。评奖关注的对象可能是创作者，也可能是一本书。',
    impact:'插画奖的评选结果给读者提供了一份找书的线索。可以挑一本不熟悉的绘本，看看评委注意到的特点，自己能不能在画里找到。'},
  {pillar:'文化',subject:/文物|馆藏|古籍|壁画/,event:/(?=.*(?:人工智能|AI|数字修复|数字化|三维扫描))(?=.*(?:上线|开放|修复|发布|建成|展出|启用|推出))/i,
    value:'文物的数字展示和文物原件不是一回事。看讲解时，可以找一找：哪些信息来自原件或史料，哪些画面是为了方便理解而做的还原？',
    impact:'数字资料有机会让不能到现场的人也看到文物细节。要判断一种展示是否可信，仍要看它有没有说明资料出处和还原方法。'},
  {pillar:'社会',subject:/摩托车|机车/,event:/(?=.*(?:赛事|锦标赛|分站赛|公开赛|世界超级摩托车|WSBK))(?=.*(?:夺冠|夺得|完赛|登上领奖台|获得|打破纪录))/i,
    value:'摩托车比赛的成绩要放回组别、赛道和规则里看。赛车、车手和团队配合都会影响结果，名次并不等于一辆车在所有情况下都最好。',
    impact:'摩托车队的赛场成绩给人们提供了认识制造团队的线索，但赛车场和日常道路的条件不同，不能把比赛当作道路骑行示范。'},
  {pillar:'科技',subject:/机器人/,event:/(?=.*(?:大赛|挑战赛|锦标赛|竞赛|比赛))(?=.*(?:完成|夺冠|决赛|成绩|获奖|避障|识别|搬运))/,
    value:'读机器人的比赛成绩，要先看赛题：机器需要感知什么、作出什么判断、完成什么动作？同一个名次，换一套任务就不一定能比较。',
    impact:'比赛能检验机器人在规定条件下的表现。要判断它能不能在生活里帮忙，还要看它遇到陌生物体和意外情况时是否可靠。'},
  {pillar:'时政',subject:/义务教育|公共文化|公共图书馆|未成年人|无障碍|学生乘车|校车|托育/,event:/(?=.*(?:条例|办法|细则|规定|新规|政策|征求意见稿))(?=.*(?:印发|发布|施行|征求意见|通过|实施))/,
    value:'读公共政策时，可以先圈出适用的人、地点和日期。“征求意见”是请大家提出建议，并不等于规则已经开始施行。',
    impact:'同一项政策，不同地区或人群的安排可能不同。想知道自己是否受影响，要对照发布部门原文中的范围、生效时间和办理条件。'},
  {pillar:'社会',subject:/公共图书馆|社区图书馆|公共文化馆|少年宫|无障碍设施|无障碍通道|适儿化/,event:/延时开放|免费开放|开放借阅|新增|启用|投入使用|开始试运行|完成改造/,
    value:'公共服务的变化，落在谁能使用、什么时候开放、怎样到达这些细节上。可以顺着报道想一想，哪一步变方便了。',
    impact:'社区居民能否用上这项服务，不只取决于是否开放，还要看距离、开放时间和使用条件。一个地方的新安排，不表示其他地方也同时改变。'}
];

export const focusNoise = text => /限时抢购|购票链接|优惠码|品牌盛典|招商加盟|直播带货|票房预测|预售冲榜|付费投票|往年回顾|旧闻重温/.test(text);
export function editorialAngle(title,asOf,description='') {
  if (!expandedFocusEnabled(asOf) || focusNoise(title+' '+description)) return undefined;
  const details=description.split(/[。！？；\n]/u);
  return angles.find(({subject,event})=>subject.test(title) && (event.test(title) ||
    details.some(sentence=>subject.test(sentence) && event.test(sentence))));
}
