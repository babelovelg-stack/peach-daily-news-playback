export const LOW_QUALITY_NEWS_SOURCE_PATTERN = /会展网|行业品牌会展|电力展会|AI热点小时报|热点速递|快讯[:：]|AI动画课堂|民生情报站|^(?:对谈|访谈|专访|观点|圆桌)[｜|:：]|(?:AI|人工智能).{0,12}(?:教学|教育).{0,20}(?:死记硬背|背知识点|如何落地|改变学习方式)|人形机器人.{0,20}(?:多场景.{0,8}上岗|从会动走向会干活)|智能机器人从会动走向会干活|板块.*(?:大涨|涨停)|\d+余?股涨停|涨停潮|股价|股票|期货市场|开票销售收入|销售收入同比|成交额同比|完成对.+重组|重组工作|全资子公司|思政教育一体化|热播影片|同款美食|主题航班|机上餐食|扬善计划|致敬榜样|荣膺.*(?:榜样|称号)|榜样企业|护航儿童健康成长/;

export const GENERIC_NEWS_EXPLANATION_PATTERN = /价值在于让我们看见世界正在发生的变化|这条新闻的社会影响，要看它让谁获得了新机会|价值在于帮助学校和老师更了解学习过程|教育变化会直接影响孩子每天怎样学习|价值在于让机器更会帮人处理复杂任务|社会影响是，一些重复、危险、需要快速计算的工作|价值在于把通信、导航、天气观察和科学研究带到更远的地方|社会影响是，通信、地图、天气预报和灾害监测会越来越依赖太空基础设施|价值在于让出行、救援、巡检和运输多一种工具|社会影响是，出行、救援、巡检和送货方式可能变快|价值在于让用电和出行更清洁|社会影响是，能源变化会影响家里的用电|价值在于保护生命和健康|关于.+你还想继续追问|答案：上一题没有清楚的标准答案/;

export function namedTyphoonEventKey(text = "") {
  if (!/台风/.test(text)) return "";
  const match = String(text).match(/台风\s*[“"「『]([\u3400-\u9fff]{2,8})[”"」』]/);
  return match ? `named-typhoon-${match[1]}` : "";
}

export function isSmartMountainHighwayStory(text = "") {
  const value = String(text);
  return /秦巴山区高速公路|隧道全息监控|AI闭环研判|智慧高速/.test(value) ||
    (/(?:高速公路|山区公路)/.test(value) && /空地协同/.test(value));
}

const STUDY_TOUR_PATTERN = /研学|游学|夏令营|冬令营/;
const STUDY_TOUR_PROMOTION_PATTERN = /路线|产品|基地|营地|打卡|招募|报名|开营|文旅|景区|推荐|推介|攻略|热门|火热|走红|新选择|新体验|亲子|旅行|课堂/;
const STUDY_TOUR_PUBLIC_INTEREST_PATTERN = /监管|规范|整治|管理办法|安全标准|安全风险|事故|通报|处罚|收费乱象|征求意见|教育部|文旅部/;
const LOCAL_SELF_PROMOTION_PATTERNS = [
  /(?:经济观察|县域观察|区域观察|城市观察)[：:].{0,30}(?:活力|机遇|图景|样板|蝶变|高质量发展)/,
  /(?:暑托班|暑期托管班|假日学校).{0,24}(?:带孩子|带学生|孩子们|学生们).{0,20}(?:了解|体验|参观|走进).{0,24}(?:脑机接口|实验室|科技企业|科研机构|科普场馆)/,
  /(?:县|区|市|镇|街道|社区).{0,18}(?:未保中心|服务中心|文化中心|活动中心).{0,18}(?:举办|开展|开设).{0,22}(?:公益课堂|科普课堂|心理健康课堂|体验活动)/,
  /(?:大学|学院).{0,24}(?:公益课堂|素养课堂|科普课堂).{0,24}(?:走进|送进|来到).{0,24}(?:乡村|县|学校)/,
  /(?:大学|学院|学校|师大|实践团).{0,30}(?:暑期实践|社会实践|三下乡).{0,30}(?:乡村课堂|乡村学校|支教|科普|有料有趣|点亮)/,
  /(?:暑期实践|社会实践|三下乡).{0,30}(?:大学|学院|师大|实践团|乡村课堂|乡村学校|支教)/,
  /深耕.{0,12}(?:乡村)?教育沃土/,
  /(?:大学|学院|学校|协会).{0,30}(?:体育教学|课程教学).{0,16}(?:研讨会|年会).{0,20}(?:我校|举办|举行)/,
  /(?:大学|学院|学校).{0,18}(?:召开|举办|举行).{0,18}(?:研讨会|研讨年会|教学年会|论坛|会议).{0,18}(?:聚焦|共话|探讨|赋能|改革)/,
  /(?:大学|学院|学校).{0,18}[：:].{0,26}(?:融入课堂|课堂更|教育更|点亮|激活|赋能|实践团|科普课堂)/,
  /(?:大学|学院|学校).{0,22}(?:参加|举办|举行).{0,30}(?:锦标赛|比赛|竞赛|展演|文化节|运动会|舞龙|舞狮)/,
  /(?:AI|人工智能).{0,22}(?:教育供给|课堂).{0,20}(?:规模化|个性化|上线|亮相)|(?:智元课堂|智身课堂)/i,
  /中国.{1,14}之乡.{0,30}(?:乡村振兴|共同富裕|共富路|产业名片)/,
  /一根.{1,16}(?:织就|串起|带动).{0,18}(?:乡村振兴|共同富裕|共富路)/,
  /(?:逐浪|解锁|探寻|感受|遇见|漫游).{0,20}(?:自贸港|县域|文旅|魅力|机遇|风韵|活力|新体验)/,
  /(?:文旅|城市|地方|产业).{0,10}(?:名片|推介|推荐官|精品路线)/,
  /(?:生态文化)?旅游节.{0,24}(?:开幕|举办|赛马会)|(?:赛马会|赛马盛会).{0,24}(?:开幕|举行|长江源|文旅)/,
  /(?:乡村振兴|共同富裕).{0,16}(?:样板|新图景|共富路|经验|实践)/
];
const INTERNATIONAL_MAJOR_EVENT_PATTERN = /联合国|APEC|亚太经合组织|二十国集团|G20|世界卫生组织|世卫组织|世界贸易组织|国际原子能机构|联合国教科文组织|多国(?:政府|代表|领导人)|全球(?:气候|卫生|安全|贸易|治理)|国际(?:气候|卫生|安全|科技|经贸|贸易|人工智能|能源).{0,12}(?:会议|协议|规则|合作|治理|倡议|决定)|气候大会|国际空间站|全球公共卫生|多瑙河|跨国河流|欧洲.{0,18}(?:高温|干旱|低水位|野火|山火|森林火灾|疏散)|(?:法国|希腊|西班牙|韩国).{0,24}(?:高温|热射病|中暑|高温疾病|疏散)|(?:日本|危地马拉|印度尼西亚|冰岛|意大利|菲律宾|新西兰|墨西哥|国外|海外).{0,24}(?:地震|火山|洪水|台风)|美国.{0,24}(?:参议院|众议院|国会).{0,24}(?:临时拨款|政府预算|拨款法案)|(?:乌克兰|俄罗斯|基辅).{0,24}(?:导弹|空袭|袭击|停火|谈判)/i;
const POLITICS_NEWS_PATTERN = /国务院|全国人大|全国政协|教育部|科技部|国家统计局|国家网信办|国家发展改革委|最高人民法院|最高人民检察院|居民消费价格(?:指数)?|CPI|政策|法律|法规|条例|管理办法|指导意见|国家标准|监管|治理|改革|国家规划|政府工作|外交|应急响应/i;
const TECHNOLOGY_NEWS_PATTERN = /科学家|科研|研究团队|实验|人工智能|AI|机器人|电子皮肤|柔性传感器|航天|卫星|火箭|芯片|集成电路|区块链|国际标准化组织|ISO|量子|6G|新材料|基因|疫苗|算法|望远镜|银河系|分子云|气体盘|海洋科考|科考船|水下滑翔机|显微成像|光学衍射层析|LED-ODT|新能源|清洁能源|海上风电|浮式风电|风电平台|气候研究|生态监测|技术突破|科学发现|工程技术|考古发现|考古实证|科技考古|轮轴机械|新物种|新鸟种|鸟类物种名录|物种新记录|16S rRNA|求偶鸣声|水[、和]冰|分子排列|加速器|原子核|分子模块|收获指数|育种研究|田间试验|数学家|数学研究|菲尔兹奖/i;
const SOCIETY_NEWS_PATTERN = /民生|公共服务|社会保障|养老|就业|住房|食品安全|防汛|防灾减灾|水毁修复|台风|暴雨|强降雨|强降水|强对流|洪涝|救灾|灾害预警|公共安全|危险区域.{0,8}(?:转移|疏散)|(?:转移|疏散).{0,8}(?:群众|居民|人员)|消费者权益|生态保护|环境保护|生态环境|污染治理|空气质量|PM2\.5|地表水|水质|河流水位|低水位|高温干旱|旱情|物种保护|三江源|学生优惠票|学生票|预约购票|铁路12306|医疗|公共卫生|交通运输/i;
const CHILD_PUBLIC_AFFAIRS_PATTERN = /(?:学生|学校|儿童|未成年人|教育).{0,16}(?:政策|服务|安全|健康|交通(?!大学)|购票|权益|保护|改革|资源)|(?:政策|服务|安全|健康|交通(?!大学)|购票|权益|保护|改革|资源).{0,16}(?:学生|学校|儿童|未成年人|教育)/;

const RAW_NEWSROOM_SUMMARY_PATTERN = /(?:^|[，。])截至(?:当天|目前)|\d+日通报|开票销售收入|会展网|行业品牌会展/;
const TRUNCATED_TITLE_PATTERN = /\.\.\.|…/;
const WORD_SEGMENTER = new Intl.Segmenter("zh-CN", { granularity: "word" });
const ANCHOR_STOP_WORDS = new Set([
  "中国", "全国", "今天", "今日", "新闻", "发生", "价值", "影响", "社会", "未来", "趋势", "可能",
  "介绍", "通过", "帮助", "更加", "相关", "进行", "一个", "一种", "一些", "这些", "多个", "计划",
  "启动", "举行", "发布", "聚焦", "观察", "带来", "怎么", "四步", "避开", "全面", "系列", "活动",
  "领域", "工作", "问题", "情况", "记者", "目前", "其中", "以及", "为了", "开始", "成为"
]);
const BROAD_ANCHOR_WORDS = new Set([
  "科技", "科学", "教育", "经济", "行业", "研究", "发展", "创新", "学校", "学生", "国家", "世界",
  "项目", "系统", "数据", "服务", "产品", "企业", "团队", "人员", "设备", "技术", "城市", "地方",
  "能力", "教育部", "农业", "生产"
]);
const REGION_OR_AGENCY_PATTERN = /^(?:北京|上海|天津|重庆|河北|河南|山西|山东|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|湖北|湖南|广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆|内蒙古|香港|澳门|台湾|教育部|科技部|国家|全国)$/;
const TOPIC_CONCEPTS = [
  ["study-tour", /研学|游学|只游不学|研学旅行|研学产品/],
  ["ai-education", /(?:AI|人工智能|大数据).{0,14}(?:教学|课堂|学习)|(?:教学|课堂|学习).{0,14}(?:AI|人工智能|大数据)/i],
  ["vocational-major", /职业教育.{0,12}专业|职业学校.{0,8}专业|职业院校.{0,8}专业|增[补设].{0,8}专业|低空.{0,10}专业|机器人.{0,10}专业/],
  ["school-count", /高等学校数量|学校总数|大学和职业学校.{0,8}(?:数量|规模)|教育资源.{0,8}规模/],
  ["postgraduate-program", /学硕|专硕|硕士研究生|研究生培养|停招.{0,8}硕士/],
  ["ramie-textile", /苎麻|麻纤维|麻织|纺织品|吸湿透气/],
  ["food-agriculture", /粮食生产|良种|农作物|种子.{0,8}土壤|气候适应.{0,8}农业/],
  ["typhoon-response", /台风|停航|回港避风|强风大浪|防汛|暴雨|洪涝|应急响应/],
  ["water-ice", /水冰|水和冰|水、冰|结冰|融化|冰.{0,8}分子|分子.{0,8}排列|制冷|低温保存/],
  ["satellite-communication", /低轨卫星|卫星通信|通信卫星|卫星互联网|通信链路|在轨运行|火箭.{0,8}卫星/],
  ["space-computing", /太空算力|算力星座|算力上天|太空.{0,8}(?:计算|处理信息)/],
  ["vaccine-public-health", /顾方舟|糖丸|脊髓灰质炎|疫苗|公共卫生/],
  ["student-rail-ticket", /学生优惠票|学生票|学生购票|预约购票|铁路12306|暑期.{0,8}返校/],
  ["youth-robot-competition", /青少年.{0,12}机器人.{0,8}(?:大赛|比赛)|机器人设计大赛/],
  ["sanjiang-ecology", /三江源|中华水塔|风云卫星.{0,12}生态|植被覆盖.{0,12}(?:提升|增加)/],
  ["digital-governance", /APEC数字周|反诈|网络安全|数据安全|个人信息|人工智能应用/],
  ["platform-economy", /平台经济|中小企业|平台.{0,8}(?:开放|资源)|供应链/],
  ["industrial-ai", /(?:人工智能|AI).{0,10}(?:炼铝|制磷|中药|制造)|(?:铝电解|磷化工|中药材).{0,10}(?:人工智能|AI)/i],
  ["biocultural-diversity", /亚马孙|传统知识|生物文化|植物.{0,8}语言|语言.{0,8}植物/]
];
const REGION_NAMES = [
  "北京", "上海", "天津", "重庆", "河北", "河南", "山西", "山东", "辽宁", "吉林", "黑龙江",
  "江苏", "浙江", "安徽", "福建", "江西", "湖北", "湖南", "广东", "广西", "海南", "四川", "贵州",
  "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆", "内蒙古", "香港", "澳门", "台湾"
];

const TOPIC_COHERENCE_RULES = [
  {
    name: "设计研究主题",
    title: /设计学.*(?:知识体系|重大专项)|中国设计学/,
    summary: /设计|高校|研究|传统|智能|项目/,
    value: /设计|研究|传统|智能|创新|知识|伦理/,
    impact: /设计|研究|传统|智能|创新|知识|教育|产业/
  },
  {
    name: "平台经济主题",
    title: /平台经济|平台.*(?:大中小企业|中小企业|开放资源)/,
    summary: /平台|企业|商家|开放|技术|数据|服务/,
    value: /平台|企业|商家|物流|技术|工具|服务|创新/,
    impact: /平台|企业|商家|数据|规则|服务|供应链|公平/
  },
  {
    name: "工业人工智能主题",
    title: /(?:人工智能|AI).*(?:炼铝|制磷|加工中药|炮制中药)|(?:炼铝|制磷).*(?:人工智能|AI)/,
    summary: /制造|生产|铝电解|磷化工|中药材|炼铝|制磷/,
    value: /制造|生产|工厂|设备|工艺|能耗|安全|传感器|数据/,
    impact: /制造|生产|工厂|设备|工艺|能耗|安全|人员|节能|验证/
  },
  {
    name: "亚马孙生物文化主题",
    title: /亚马孙.*(?:文化知识|传统知识|生物多样性|植物和语言)|生物多样性.*亚马孙/,
    summary: /亚马孙|植物|语言|传统知识|生物多样性/,
    value: /植物|语言|传统知识|生物多样性|文化遗产/,
    impact: /亚马孙|森林|植物|语言|传统知识|当地居民|保护/
  },
  {
    name: "教育主题",
    title: /教育|学校|学生|课堂|思政/,
    value: /教育|学校|学生|课堂|学习|老师|课程|教学/,
    impact: /教育|学校|学生|课堂|学习|老师|课程|教学/
  },
  {
    name: "天气应急主题",
    title: /台风|防汛|暴雨|洪涝|强降雨|应急响应|海上交通.*关停/,
    value: /台风|风浪|暴雨|洪涝|停航|停工|撤离|转移|避险|安全|应急|防灾|预警|风险/,
    impact: /台风|风浪|暴雨|洪涝|停航|停工|撤离|转移|避险|安全|应急|防灾|预警|风险/
  },
  {
    name: "水冰科学主题",
    title: /水[、和]冰|水冰结构|冰结构/,
    value: /水|冰|分子|结冰|融化|结构|模型/,
    impact: /研究|实验|制冷|材料|低温|水|冰|应用|验证/
  },
  {
    name: "农业主题",
    title: /农业|农田|作物|粮食|植保|夏管|航化|丰产/,
    value: /农业|农田|作物|粮食|植保|病虫害|农民|喷洒|药液|土壤|管护/,
    impact: /农业|农田|作物|粮食|植保|病虫害|农民|喷洒|药液|土壤|管护/
  }
];

export function isLowQualityNewsSource(value = "") {
  return LOW_QUALITY_NEWS_SOURCE_PATTERN.test(String(value));
}

export function isPromotionalStudyTourNews(value = "") {
  const text = String(value);
  return STUDY_TOUR_PATTERN.test(text) &&
    STUDY_TOUR_PROMOTION_PATTERN.test(text) &&
    !STUDY_TOUR_PUBLIC_INTEREST_PATTERN.test(text);
}

export function isLocalSelfPromotionNews(value = "") {
  const text = String(value);
  return LOCAL_SELF_PROMOTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyNewsPillar(value = "") {
  const text = String(value);
  if (INTERNATIONAL_MAJOR_EVENT_PATTERN.test(text)) return "国际大事";
  if (POLITICS_NEWS_PATTERN.test(text)) return "时政";
  if (TECHNOLOGY_NEWS_PATTERN.test(text)) return "科技";
  if (SOCIETY_NEWS_PATTERN.test(text) || CHILD_PUBLIC_AFFAIRS_PATTERN.test(text)) return "社会";
  return "";
}

function normalizeComparableText(value = "") {
  return String(value)
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function textConcepts(value = "") {
  const text = String(value);
  return new Set(TOPIC_CONCEPTS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id));
}

function extractAnchorTerms(value = "") {
  const normalized = normalizeComparableText(value);
  const terms = [];
  for (const part of WORD_SEGMENTER.segment(normalized)) {
    const term = part.segment.trim().toLowerCase();
    if (!part.isWordLike || term.length < 2 || ANCHOR_STOP_WORDS.has(term)) continue;
    terms.push(term);
  }
  for (const [, pattern] of TOPIC_CONCEPTS) {
    const match = String(value).match(pattern);
    if (match?.[0] && match[0].length >= 2) terms.push(normalizeComparableText(match[0]).replace(/\s+/g, ""));
  }
  return [...new Set(terms.filter(Boolean))];
}

function anchorWeight(term) {
  if (BROAD_ANCHOR_WORDS.has(term) || REGION_OR_AGENCY_PATTERN.test(term)) return 0.5;
  if (/^\d+$/.test(term)) return 0.5;
  if (term.length >= 4) return 2;
  if (term.length === 3) return 1.5;
  return 1;
}

function coherenceScore(sourceText, fieldText) {
  const sourceConcepts = textConcepts(sourceText);
  const fieldConcepts = textConcepts(fieldText);
  const sharedConcepts = [...sourceConcepts].filter((concept) => fieldConcepts.has(concept));
  if (sharedConcepts.length) return 3 + sharedConcepts.length;

  const normalizedField = normalizeComparableText(fieldText).replace(/\s+/g, "");
  return extractAnchorTerms(sourceText).reduce((score, term) => (
    normalizedField.includes(term.replace(/\s+/g, "")) ? score + anchorWeight(term) : score
  ), 0);
}

function titleBodyCoherenceIssues({ sourceTitle = "", sourceDescription = "", title = "", summary = "", value = "", impact = "" }) {
  if (!sourceTitle || !title || !summary || !value || !impact) return [];
  const issues = [];
  const titleContext = `${sourceTitle} ${title}`;
  const explanationContext = `${sourceTitle} ${sourceDescription} ${title} ${summary}`;

  if (coherenceScore(titleContext, summary) < 2) issues.push("标题正文主题不一致：发生了什么没有解释标题中的核心事件");
  if (coherenceScore(explanationContext, value) < 2) issues.push("标题正文主题不一致：价值说明没有落在这条新闻的核心事实上");
  if (coherenceScore(explanationContext, impact) < 2) issues.push("标题正文主题不一致：影响说明没有延续这条新闻的核心主题");
  return issues;
}

export function titlesAreSemanticDuplicates(left = "", right = "") {
  const leftNormalized = normalizeComparableText(left).replace(/\s+/g, "");
  const rightNormalized = normalizeComparableText(right).replace(/\s+/g, "");
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) return true;

  const leftTerms = new Set(extractAnchorTerms(left));
  const rightTerms = new Set(extractAnchorTerms(right));
  const union = new Set([...leftTerms, ...rightTerms]);
  const overlap = [...leftTerms].filter((term) => rightTerms.has(term));
  if (union.size && overlap.length / union.size >= 0.45) return true;

  const leftConcepts = textConcepts(left);
  const rightConcepts = textConcepts(right);
  return overlap.length >= 2 && [...leftConcepts].some((concept) => rightConcepts.has(concept));
}

export function newsQualityIssues({
  sourceTitle = "",
  sourceDescription = "",
  title = "",
  summary = "",
  value = "",
  impact = ""
} = {}) {
  const issues = [];
  const sourceText = `${sourceTitle} ${sourceDescription}`.trim();
  const editorialText = sourceText || title;
  const explanationText = `${summary} ${value} ${impact}`.trim();

  if (!title.trim()) issues.push("缺少儿童版标题");
  if (!summary.trim()) issues.push("缺少发生了什么");
  if (!value.trim()) issues.push("缺少具体价值");
  if (!impact.trim()) issues.push("缺少社会影响或未来趋势");
  if (isLowQualityNewsSource(sourceText)) issues.push("来源标题属于展会广告、市场炒作或低价值统计");
  if (isPromotionalStudyTourNews(sourceText)) issues.push("来源属于研学推广、路线推荐或旅游导流内容");
  if (isLocalSelfPromotionNews(sourceText)) issues.push("来源属于地方自荐、形象宣传或成绩展示内容");
  if (editorialText && !classifyNewsPillar(editorialText)) issues.push("新闻不属于时政、科技、社会或国际大事");
  if (TRUNCATED_TITLE_PATTERN.test(title)) issues.push("儿童版标题被截断");
  if (RAW_NEWSROOM_SUMMARY_PATTERN.test(summary)) issues.push("发生了什么仍是成人新闻稿原句");
  if (GENERIC_NEWS_EXPLANATION_PATTERN.test(explanationText)) issues.push("价值或影响使用通用套话");

  const sourceRegions = REGION_NAMES.filter((region) => sourceTitle.includes(region));
  const summaryRegions = REGION_NAMES.filter((region) => summary.includes(region));
  if (sourceRegions.length && summaryRegions.length && !sourceRegions.some((region) => summaryRegions.includes(region))) {
    issues.push(`发生了什么存在地区错配：来源为${sourceRegions.join("、")}，正文为${summaryRegions.join("、")}`);
  }

  const coherenceRule = TOPIC_COHERENCE_RULES.find((rule) => rule.title.test(title || sourceTitle));
  if (coherenceRule) {
    if (coherenceRule.summary && !coherenceRule.summary.test(summary)) issues.push(`${coherenceRule.name}的发生说明发生跨主题错配`);
    if (!coherenceRule.value.test(value)) issues.push(`${coherenceRule.name}的价值说明发生跨主题错配`);
    if (!coherenceRule.impact.test(impact)) issues.push(`${coherenceRule.name}的影响说明发生跨主题错配`);
  }

  issues.push(...titleBodyCoherenceIssues({ sourceTitle, sourceDescription, title, summary, value, impact }));

  return issues;
}

export function dailyNewsIssueQualityIssues({
  newsItems = [],
  recentNewsTitles = [],
  asOf = new Date().toISOString(),
  minimumNewsCount = 2,
  minimumPublisherCount = 2,
  maxItemsPerPublisher = 2,
  maxAgeHours = 72
} = {}) {
  const issues = [];
  const asOfTime = Date.parse(asOf);
  if (!Number.isFinite(asOfTime)) issues.push("新闻自检日期无效");
  if (newsItems.length < minimumNewsCount) issues.push(`当天合格小情报不足：需要至少${minimumNewsCount}条，实际${newsItems.length}条`);

  const publisherCounts = new Map();
  for (const [index, item] of newsItems.entries()) {
    const label = `第${index + 1}条小情报`;
    const publisher = String(item.domain || item.publisher || item.feed || "").trim();
    if (!publisher) {
      issues.push(`${label}缺少可识别的新闻来源`);
    } else {
      publisherCounts.set(publisher, (publisherCounts.get(publisher) || 0) + 1);
    }

    let parsedLink;
    try {
      parsedLink = new URL(item.link);
    } catch {
      parsedLink = null;
    }
    if (!parsedLink || !/^https?:$/.test(parsedLink.protocol)) issues.push(`${label}来源链接无效：${item.link || "空链接"}`);

    const published = Number(item.published);
    if (!Number.isFinite(published) || published <= 0) {
      issues.push(`${label}缺少可核对的发布时间`);
    } else if (Number.isFinite(asOfTime)) {
      const ageHours = (asOfTime - published) / 36e5;
      if (ageHours < -6) issues.push(`${label}发布时间晚于自检时间`);
      if (ageHours > maxAgeHours) issues.push(`${label}新闻超过${maxAgeHours}小时：${ageHours.toFixed(1)}小时`);
    }

    issues.push(...newsQualityIssues(item).map((problem) => `${label}质量不合格：${problem}`));
  }

  if (publisherCounts.size < minimumPublisherCount) {
    issues.push(`新闻来源过于单一：需要至少${minimumPublisherCount}个独立来源，实际${publisherCounts.size}个`);
  }
  for (const [publisher, count] of publisherCounts) {
    if (count > maxItemsPerPublisher) issues.push(`同一来源过多：${publisher}有${count}条，最多允许${maxItemsPerPublisher}条`);
  }

  for (let left = 0; left < newsItems.length; left += 1) {
    for (let right = left + 1; right < newsItems.length; right += 1) {
      const leftTitle = newsItems[left]?.title || newsItems[left]?.sourceTitle || "";
      const rightTitle = newsItems[right]?.title || newsItems[right]?.sourceTitle || "";
      if (titlesAreSemanticDuplicates(leftTitle, rightTitle)) {
        issues.push(`新闻主题重复：第${left + 1}条与第${right + 1}条讲的是同一件事`);
      }
    }
  }

  for (const [index, item] of newsItems.entries()) {
    const title = item?.title || item?.sourceTitle || "";
    const repeatedTitle = recentNewsTitles.find((recentTitle) => titlesAreSemanticDuplicates(title, String(recentTitle).replace(/^.*小情报[：:]\s*/, "")));
    if (repeatedTitle) issues.push(`新闻近期重复：第${index + 1}条与之前日报讲的是同一件事`);
  }

  return issues;
}
