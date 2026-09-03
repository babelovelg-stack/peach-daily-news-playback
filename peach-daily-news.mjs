import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import nodemailer from "nodemailer";
import { XMLParser } from "fast-xml-parser";
import {
  classifyNewsPillar,
  dailyNewsIssueQualityIssues,
  GENERIC_NEWS_EXPLANATION_PATTERN,
  isLocalSelfPromotionNews,
  isLowQualityNewsSource,
  isPromotionalStudyTourNews,
  isSmartMountainHighwayStory,
  namedTyphoonEventKey,
  newsQualityIssues,
  titlesAreSemanticDuplicates
} from "./peach-content-quality.mjs";
import { remapQuizAnswerOptionLetters } from "./peach-quiz-option-rotation.mjs";

const execFileAsync = promisify(execFile);
const EMAIL_TO = process.env.PEACH_NEWS_EMAIL_TO || "ctmt1412@qq.com";
const isTest = process.argv.includes("--test");
const isDryRun = process.argv.includes("--dry-run");
const isForceSend =
  process.argv.includes("--force-send") ||
  process.env.PEACH_NEWS_FORCE_SEND === "true" ||
  process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
const STATE_FILE = "peach-news-state.json";
const OUT_HTML = "peach-daily-news.html";
const OUT_TEXT = "peach-daily-news.txt";
const OUT_NEXT_STATE = "peach-news-next-state.json";
const OUT_NEWS_AUDIT = "peach-news-audit.json";
const OUT_PLAYBACK_ROOT = process.env.PEACH_NEWS_PLAYBACK_ROOT || "peach-playback";
const CURATED_NEWS_FILE = process.env.PEACH_NEWS_CURATED_FILE || "peach-curated-news.json";
const MAX_NEWS_AGE_HOURS = Number(process.env.PEACH_NEWS_MAX_AGE_HOURS || 72);
// Five is a preferred maximum, not a quota; quality filters may return fewer stories.
const TARGET_NEWS_COUNT = isTest ? 2 : 5;
const MAX_NEWS_COUNT = isTest ? 2 : 8;
const MIN_DAILY_NEWS_COUNT = isTest ? 1 : 2;
const MIN_DAILY_PUBLISHER_COUNT = isTest ? 1 : 2;
const MAX_ITEMS_PER_PUBLISHER = Number(process.env.PEACH_NEWS_MAX_PER_PUBLISHER || 2);
const RECENT_MESSAGE_COPY_MEMORY_LIMIT = 30;
// Keep a 45-issue no-repeat window so the finite, reviewed fact set can rotate without halting delivery.
const RECENT_ENCYCLOPEDIA_MEMORY_LIMIT = 135;
const RECENT_QUESTION_CONCEPT_SELECTION_LIMIT = 14;
const TIMEZONE = process.env.PEACH_NEWS_TIMEZONE || "Asia/Shanghai";
const SEND_HOUR = Number(process.env.PEACH_NEWS_SEND_HOUR || 18);
const DATE_LIST_OVERRIDE = process.env.PEACH_NEWS_DATES || getArgValue("--dates");
const DATE_OVERRIDE = process.env.PEACH_NEWS_DATE || getArgValue("--date");
const REPORT_DATES = DATE_LIST_OVERRIDE ? parseReportDateList(DATE_LIST_OVERRIDE) : [];
const REPORT_DATE = REPORT_DATES[0] || parseReportDate(DATE_OVERRIDE);
const NEWS_AS_OF = REPORT_DATE || new Date();
const PLAYBACK_ENABLED =
  process.env.PEACH_NEWS_ENABLE_PLAYBACK === "true" ||
  Boolean(process.env.PEACH_NEWS_PLAYBACK_BASE_URL) ||
  Boolean(process.env.PEACH_NEWS_PLAYBACK_URL_OVERRIDE);
const PLAYBACK_BASE_URL = normalizeBaseUrl(process.env.PEACH_NEWS_PLAYBACK_BASE_URL || "");
const PLAYBACK_URL_OVERRIDE = String(process.env.PEACH_NEWS_PLAYBACK_URL_OVERRIDE || "").trim();
const PLAYBACK_VOICE = process.env.PEACH_NEWS_PLAYBACK_VOICE || "zh-CN-XiaoyiNeural";
const PLAYBACK_RATE = process.env.PEACH_NEWS_PLAYBACK_RATE || "-4%";
const PLAYBACK_PITCH = process.env.PEACH_NEWS_PLAYBACK_PITCH || "+8Hz";
const PLAYBACK_VOLUME = process.env.PEACH_NEWS_PLAYBACK_VOLUME || "+0%";
const MIN_PLAYBACK_AUDIO_BYTES = Number(process.env.PEACH_NEWS_MIN_PLAYBACK_AUDIO_BYTES || 12000);

const feeds = [
  { name: "新华网科技", publisher: "新华网", category: "科技", url: "https://www.news.cn/tech/news_tech.xml", weight: 9 },
  { name: "新华网教育", publisher: "新华网", category: "教育", url: "https://www.news.cn/edu/news_edu.xml", weight: 8 },
  { name: "新华网时政", publisher: "新华网", category: "中国", url: "https://www.news.cn/politics/news_politics.xml", weight: 7 },
  { name: "新华网财经", publisher: "新华网", category: "经济", url: "https://www.news.cn/fortune/news_fortune.xml", weight: 6 },
  { name: "新华网健康", publisher: "新华网", category: "健康", url: "https://www.news.cn/health/news_health.xml", weight: 6 },
  { name: "新华网国际", publisher: "新华网", category: "全球", url: "https://www.news.cn/world/news_world.xml", weight: 5 },
  { name: "人民网科技", publisher: "人民网", category: "科技", url: "http://www.people.com.cn/rss/it.xml", weight: 8 },
  { name: "人民网教育", publisher: "人民网", category: "教育", url: "https://www.people.com.cn/rss/edu.xml", weight: 8 },
  { name: "人民网时政", publisher: "人民网", category: "中国", url: "http://www.people.com.cn/rss/politics.xml", weight: 7 },
  { name: "人民网社会", publisher: "人民网", category: "中国", url: "http://www.people.com.cn/rss/society.xml", weight: 6 },
  { name: "人民网财经", publisher: "人民网", category: "经济", url: "http://www.people.com.cn/rss/finance.xml", weight: 6 },
  { name: "人民网健康", publisher: "人民网", category: "健康", url: "http://www.people.com.cn/rss/health.xml", weight: 5 },
  { name: "人民网能源", publisher: "人民网", category: "科技", url: "http://www.people.com.cn/rss/energy.xml", weight: 5 },
  {
    name: "Google 新闻：实时用电",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"全国用电负荷" when:2d'),
    weight: 11
  },
  {
    name: "Google 新闻：实时夏粮",
    publisher: "Google 新闻搜索",
    category: "经济",
    url: googleNewsSearchUrl('"全国夏粮产量" when:2d'),
    weight: 11
  },
  {
    name: "Google 新闻：实时高铁测试",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"高铁启动时速385公里" when:2d'),
    weight: 11
  },
  {
    name: "Google 新闻：实时青海湖生态",
    publisher: "Google 新闻搜索",
    category: "中国",
    url: googleNewsSearchUrl('"湟鱼见证青海湖生态之变" when:2d'),
    weight: 11
  },
  { name: "中国新闻网时政", publisher: "中国新闻网", category: "中国", url: "https://www.chinanews.com.cn/rss/china.xml", weight: 6 },
  { name: "中国新闻网教育", publisher: "中国新闻网", category: "教育", url: "https://www.chinanews.com.cn/rss/edu.xml", weight: 6 },
  { name: "中国新闻网财经", publisher: "中国新闻网", category: "经济", url: "https://www.chinanews.com.cn/rss/finance.xml", weight: 5 },
  { name: "中国新闻网社会", publisher: "中国新闻网", category: "中国", url: "https://www.chinanews.com.cn/rss/society.xml", weight: 5 },
  { name: "中国新闻网国际", publisher: "中国新闻网", category: "全球", url: "https://www.chinanews.com.cn/rss/world.xml", weight: 4 },
  {
    name: "Google 新闻：近三日科学民生",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"锂金属电池" OR "防减救灾" OR "城市排水防涝" OR "珠峰高空臭氧" when:3d'),
    weight: 10
  },
  {
    name: "Google 新闻：锂金属电池进展",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"我国高校开发新型电解液让锂金属电池增能延寿" when:3d'),
    weight: 12
  },
  {
    name: "Google 新闻：近两日天气科学",
    publisher: "Google 新闻搜索",
    category: "中国",
    url: googleNewsSearchUrl('台风 科学 防御 OR 应急响应 when:2d'),
    weight: 8
  },
  {
    name: "Google 新闻：实时台风避险",
    publisher: "Google 新闻搜索",
    category: "中国",
    url: googleNewsSearchUrl('(site:fujian.gov.cn OR site:yjt.fujian.gov.cn) ("全省转移危险区域人员18万多人" OR "省防指终止防台风应急响应") when:3d'),
    weight: 12
  },
  {
    name: "Google 新闻：实时APEC数字周",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"国家网信办将在2026年APEC数字周期间举办系列活动" when:3d'),
    weight: 11
  },
  {
    name: "Google 新闻：实时水冰科学",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"水、冰结构世界难题" when:2d'),
    weight: 12
  },
  {
    name: "Google 新闻：实时植物根系",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"植物根系" "避腐性" when:2d'),
    weight: 12
  },
  {
    name: "Google 新闻：实时学生反诈",
    publisher: "Google 新闻搜索",
    category: "教育",
    url: googleNewsSearchUrl('"暑期反诈指南" 学生 when:2d'),
    weight: 12
  },
  {
    name: "Google 新闻：实时食品玩具安全",
    publisher: "Google 新闻搜索",
    category: "中国",
    url: googleNewsSearchUrl('"食品玩具跨界产品" when:2d'),
    weight: 12
  },
  {
    name: "Google 新闻：实时六G通信",
    publisher: "Google 新闻搜索",
    category: "科技",
    url: googleNewsSearchUrl('"6G：构筑未来世界的神经网络" when:2d'),
    weight: 12
  },
  { name: "Google 新闻：近两日科技", publisher: "Google 新闻搜索", category: "科技", url: googleNewsSearchUrl("(科技 OR 科学 OR 航天 OR 机器人 OR 人工智能) when:2d"), weight: 8 },
  { name: "Google 新闻：近两日教育科普", publisher: "Google 新闻搜索", category: "教育", url: googleNewsSearchUrl("(教育 OR 学校 OR 学生 OR 儿童 OR 科普) when:2d"), weight: 8 },
  { name: "Google 新闻：近两日航天能源", publisher: "Google 新闻搜索", category: "科技", url: googleNewsSearchUrl("(航天 OR 卫星 OR 火箭 OR 新能源 OR 低碳) when:2d"), weight: 7 },
  { name: "Google 新闻：近两日民生生态", publisher: "Google 新闻搜索", category: "中国", url: googleNewsSearchUrl("(民生 OR 交通 OR 医疗 OR 生态 OR 防灾) when:2d"), weight: 7 },
  { name: "Google 新闻：近两日全球科技", publisher: "Google 新闻搜索", category: "全球", url: googleNewsSearchUrl("(全球科技 OR 航天 OR 人工智能 OR 能源 OR 气候) when:2d"), weight: 6 },
  { name: "ScienceDaily 科学", publisher: "ScienceDaily", category: "科技", url: "https://www.sciencedaily.com/rss/top/science.xml", weight: 2 },
  { name: "ScienceDaily AI", publisher: "ScienceDaily", category: "科技", url: "https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml", weight: 2 }
];

const questions = [
  { id: "gps-location", tags: ["科技", "航天", "地图"], q: "为什么手机地图能知道我们大概在哪里？", a: "手机会接收卫星、基站和 Wi-Fi 等信号，再像做定位小游戏一样计算位置，所以地图能找到我们附近的地方。" },
  { id: "cloud-float", tags: ["天气", "科学"], q: "云朵看起来软软的，为什么不会像棉花一样掉下来？", a: "云朵是许多很小很小的水滴或冰晶，它们太轻了，会被空气托住。等水滴变大变重，就会变成雨落下来。" },
  { id: "train-cup", tags: ["交通", "物理"], q: "为什么高铁跑得快，车里的水杯却不容易飞出去？", a: "因为高铁行驶很平稳，车和杯子一起向前运动。只要速度变化不突然，杯子就会像坐在一个移动房间里一样安稳。" },
  { id: "ai-teacher", tags: ["AI", "科技", "教育"], q: "AI 为什么需要人类教它？", a: "AI 像一个特别会练习的学生，需要读很多例子，也需要人类告诉它什么答案更好、更安全，才能帮我们做事。" },
  { id: "solar-panel", tags: ["能源", "低碳", "科学"], q: "为什么太阳能电池板喜欢晒太阳？", a: "太阳光里有能量，太阳能电池板能把一部分光能变成电能，就像把阳光装进电线里。" },
  { id: "rocket-stage", tags: ["航天", "火箭"], q: "火箭为什么常常要分成好几段飞上天？", a: "火箭起飞时很重，燃料用完的一段会被抛掉，剩下的部分就更轻，能继续飞得更高。" },
  { id: "satellite-orbit", tags: ["航天", "卫星"], q: "卫星为什么能一直绕着地球跑？", a: "卫星一边向前飞，一边被地球引力拉住，就像在太空中不停绕圈跑，不会轻易飞走。" },
  { id: "seed-sprout", tags: ["农业", "植物", "粮食"], q: "一粒种子为什么能长成一棵植物？", a: "种子里面有小小的胚芽和营养。遇到水、空气和合适温度后，胚芽会开始生长，慢慢变成植物。" },
  { id: "rice-water", tags: ["农业", "粮食"], q: "为什么种水稻常常需要很多水？", a: "水稻喜欢湿润环境，水能帮助它生长，也能减少一些杂草。不过不同地区会用不同方法节水种稻。" },
  { id: "robot-sensor", tags: ["机器人", "AI", "科技"], q: "机器人怎么知道前面有东西？", a: "机器人会用摄像头、雷达、红外线等传感器观察周围，再由电脑判断该停下、转弯还是继续走。" },
  { id: "battery-store", tags: ["能源", "科技"], q: "电池为什么能把电先存起来？", a: "电池里面有化学材料，充电时把能量存进去，用电时再把能量释放出来，像一个小小能量仓库。" },
  { id: "museum-value", tags: ["科普", "博物馆", "教育"], q: "为什么博物馆里的旧东西也很有价值？", a: "旧东西记录了以前的人怎样生活、工作和创造。看懂它们，就像读一封从过去寄来的信。" },
  { id: "fossil-story", tags: ["博物", "地球", "生命"], q: "化石为什么能告诉我们很久以前的故事？", a: "一些古生物死后被泥沙包住，经过很久变成化石。科学家能从形状和位置推测它们怎样生活。" },
  { id: "bees-pollinate", tags: ["动物", "植物", "农业"], q: "蜜蜂采蜜时为什么也在帮植物？", a: "蜜蜂飞来飞去会把花粉带到另一朵花上，帮助植物结出果实和种子，这叫传粉。" },
  { id: "ocean-salty", tags: ["地球", "海洋"], q: "海水为什么是咸的？", a: "雨水和河流会把岩石里的盐分慢慢带进海洋，水会蒸发，盐留下来，时间久了海水就变咸了。" },
  { id: "rainbow-color", tags: ["天气", "光", "科学"], q: "彩虹为什么有很多颜色？", a: "阳光看起来是白色，其实里面藏着很多颜色。水滴像小棱镜，把阳光分开，就出现彩虹。" },
  { id: "heart-beat", tags: ["健康", "身体"], q: "心脏为什么会一直跳？", a: "心脏像身体里的小泵，把血液送到全身。血液带着氧气和营养，帮助身体各处工作。" },
  { id: "eyes-blink", tags: ["健康", "身体"], q: "人为什么会眨眼睛？", a: "眨眼能把泪水铺在眼球表面，让眼睛保持湿润，也能挡住灰尘和强光。" },
  { id: "currency-value", tags: ["经济", "生活"], q: "为什么同样的钱能买到的东西有时会变少？", a: "如果很多商品涨价，同样的钱买到的东西就会少一些。价格变化和生产、运输、需求都有关系。" },
  { id: "supply-chain", tags: ["经济", "生活"], q: "一支铅笔到我们手里，要经过哪些人？", a: "它可能经过种树或采矿、工厂加工、包装运输、商店售卖等步骤，像很多人完成的一场接力。" },
  { id: "law-rule", tags: ["社会", "规则"], q: "为什么大家都要遵守交通规则？", a: "交通规则能让车和人知道什么时候走、什么时候停，减少危险，让城市像有秩序的队伍。" },
  { id: "language-translate", tags: ["全球", "文化"], q: "不同国家的人语言不一样，怎么互相理解？", a: "人们可以学习外语，也可以用翻译工具。更重要的是认真听、慢慢说，尊重彼此的文化。" },
  { id: "weather-forecast", tags: ["天气", "科技"], q: "天气预报是怎么知道明天可能下雨的？", a: "气象员会用卫星、雷达和地面仪器收集数据，再用电脑计算云、风和温度的变化。" },
  { id: "tree-rings", tags: ["植物", "博物"], q: "树的年轮为什么能看出年龄？", a: "树每年会长出一圈新的木质部分。春夏长得快、秋冬长得慢，就形成一圈一圈的年轮。" },
  { id: "magnet", tags: ["物理", "科学"], q: "磁铁为什么能吸住铁钉？", a: "磁铁周围有看不见的磁场，能吸引铁、镍等材料。不是所有金属都会被磁铁吸住。" },
  { id: "sound-travel", tags: ["物理", "科学"], q: "声音为什么能从远处传到耳朵里？", a: "声音会让空气产生一圈圈振动，振动传到耳朵里，大脑就能知道我们听到了什么。" },
  { id: "water-cycle", tags: ["地球", "天气"], q: "地上的水为什么会跑到天上又变成雨？", a: "太阳把水晒成水蒸气，水蒸气升到空中变成云，云里的小水滴变大后就落成雨。" },
  { id: "ant-team", tags: ["动物", "社会"], q: "蚂蚁为什么总是一群一群地行动？", a: "蚂蚁会分工合作，有的找食物，有的照顾幼虫，有的保护家。团队合作让它们更容易生活。" },
  { id: "brain-memory", tags: ["身体", "学习"], q: "为什么复习能帮助我们记得更牢？", a: "大脑像在修一条小路，反复复习会让这条路更清楚，下次想起来就更容易。" },
  { id: "internet-packet", tags: ["科技", "互联网"], q: "一张图片是怎么从网上传到手机里的？", a: "图片会被分成许多小数据包，沿着网络线路传到手机，再重新拼起来显示出来。" },
  { id: "food-web", tags: ["动物", "生态"], q: "为什么自然里一种小动物变少，也会影响很多生物？", a: "生物之间像一张食物网。一个环节变化，吃它或被它吃的生物都可能受到影响。" },
  { id: "city-park", tags: ["城市", "生态"], q: "城市为什么需要公园和树？", a: "树能遮阴、吸收一部分二氧化碳，还能让鸟和昆虫有地方生活。公园也让人们休息和运动。" },
  { id: "moon-shape", tags: ["天文", "月亮"], q: "月亮为什么有时圆、有时弯？", a: "月亮自己不发光，我们看到的是太阳照亮的部分。月亮绕地球转，不同位置会让亮起来的形状看起来不一样。" },
  { id: "tide-moon", tags: ["海洋", "天文"], q: "海水为什么会涨潮和退潮？", a: "月亮和太阳的引力会拉动海水，海水就会有规律地升高和降低，这就是涨潮和退潮。" },
  { id: "volcano-erupt", tags: ["地球", "火山"], q: "火山为什么会喷发？", a: "地球里面有很热的岩浆和气体，当压力太大、找到出口时，就可能从火山口喷出来。" },
  { id: "desert-cold-night", tags: ["地理", "沙漠"], q: "沙漠白天很热，晚上为什么可能很冷？", a: "沙漠水汽少，白天容易被太阳晒热，晚上热量也容易跑掉，所以温差会很大。" },
  { id: "coral-animal", tags: ["海洋", "动物"], q: "珊瑚看起来像植物，为什么其实是动物？", a: "珊瑚由许多小小的珊瑚虫组成，它们会捕食，也会和藻类一起生活，所以属于动物。" },
  { id: "whale-breathe", tags: ["动物", "海洋"], q: "鲸鱼生活在海里，为什么还要浮上海面？", a: "鲸鱼是哺乳动物，用肺呼吸空气。它们能潜水很久，但还是需要浮上海面换气。" },
  { id: "bird-v-shape", tags: ["动物", "物理"], q: "候鸟排成 V 字飞，真的更省力吗？", a: "是的。前面的鸟扇动翅膀会带起气流，后面的鸟能借一点力，所以长途飞行更省力。" },
  { id: "spider-web", tags: ["动物", "材料"], q: "蜘蛛网为什么又细又结实？", a: "蜘蛛丝很细，但结构特别有韧性。它能粘住小虫，也能承受风吹和拉扯。" },
  { id: "bacteria-help", tags: ["微生物", "身体"], q: "细菌都是坏的吗？", a: "不是。很多细菌对人有帮助，比如肠道里的好细菌能帮助消化，还有些细菌能做酸奶。" },
  { id: "bread-rise", tags: ["食物", "微生物"], q: "面包为什么会蓬起来？", a: "酵母会吃面团里的糖，产生二氧化碳气体。气体被面团包住，面包就变得松软。" },
  { id: "taste-spicy", tags: ["身体", "食物"], q: "辣味为什么不像甜味那样，是一种真正的味道？", a: "辣更多是神经感到刺激和热，不是舌头尝到的基本味道。所以吃辣时会觉得热乎乎。" },
  { id: "sweat-cool", tags: ["身体", "健康"], q: "出汗为什么能帮身体降温？", a: "汗水从皮肤上蒸发时会带走一些热量，就像给身体开了一个小小的降温开关。" },
  { id: "bone-grow", tags: ["身体", "生长"], q: "小朋友的骨头为什么还能长长？", a: "骨头两端有会生长的地方，身体获得营养、睡眠和运动后，骨头会慢慢变长变结实。" },
  { id: "vaccine-practice", tags: ["健康", "免疫"], q: "疫苗为什么像给身体提前练习？", a: "疫苗能让免疫系统认识某种病菌的特点。以后真的遇到时，身体就更容易快速反应。" },
  { id: "probability", tags: ["数学", "生活"], q: "天气预报说下雨概率 60%，是什么意思？", a: "它不是说一定下雨，而是根据相似天气和计算结果，认为下雨的可能性比较大。" },
  { id: "map-scale", tags: ["地图", "数学"], q: "地图上的一厘米，为什么能代表很远的路？", a: "地图会把真实世界按比例缩小。比例尺就像说明书，告诉我们图上一小段对应真实多远。" },
  { id: "archive", tags: ["历史", "档案"], q: "档案馆为什么要保存旧文件？", a: "旧文件记录了过去发生过什么，能帮助人们查证历史、保护记忆，也能让以后的决定更有依据。" },
  { id: "paper-making", tags: ["历史", "材料"], q: "纸为什么能写字又比较轻？", a: "纸由很多细小纤维交织而成，表面能留下墨水或铅笔痕迹，纤维很薄，所以整张纸比较轻。" },
  { id: "printing", tags: ["历史", "技术"], q: "印刷术为什么让知识传播更快？", a: "以前抄书很慢，印刷可以一次做出很多本书，让更多人读到同样的知识。" },
  { id: "bridge-arch", tags: ["工程", "物理"], q: "拱桥为什么能撑住很重的东西？", a: "拱形会把重量向两边传开，再传到桥墩上，所以能更稳地承受压力。" },
  { id: "elevator-safety", tags: ["工程", "安全"], q: "电梯为什么不会像盒子一样随便掉下去？", a: "电梯有钢缆、制动器和多种安全装置。系统会不断检查运行情况，异常时会保护乘客。" },
  { id: "electric-circuit", tags: ["电", "科学"], q: "灯为什么要接成一个完整回路才会亮？", a: "电流需要从电源出发，再沿线路回到电源。回路断开时，电流过不去，灯就不会亮。" },
  { id: "thunder-lightning", tags: ["天气", "电"], q: "为什么先看到闪电，后听到雷声？", a: "光跑得比声音快很多，所以闪电先到眼睛，雷声后到耳朵。" },
  { id: "rain-smell", tags: ["天气", "植物"], q: "下雨前后为什么有一种泥土味？", a: "土壤里的微生物和植物会释放一些气味，雨滴打到地面时把气味带到空气里，我们就闻到了。" },
  { id: "plastic-recycle", tags: ["环保", "材料"], q: "为什么塑料要分类回收？", a: "不同塑料材料不一样，分类后更容易重新加工，减少浪费，也能保护环境。" },
  { id: "food-label", tags: ["健康", "生活"], q: "食品包装上的配料表有什么用？", a: "配料表能告诉我们食物里有什么，排在前面的通常含量更多，能帮助我们更明白地选择食物。" },
  { id: "music-vibration", tags: ["音乐", "物理"], q: "乐器为什么能发出不同声音？", a: "声音来自振动。弦、管子或鼓面长短、粗细、松紧不同，振动方式不同，声音就不同。" },
  { id: "camera-image", tags: ["光", "科技"], q: "相机为什么能把画面留下来？", a: "相机会让光通过镜头进入感光元件，把光的信息变成图像数据，再保存起来。" },
  { id: "data-privacy", tags: ["互联网", "安全"], q: "为什么上网时不能随便告诉别人个人信息？", a: "姓名、地址、电话等信息可能被坏人利用。保护个人信息，就像保护自己家的钥匙。" },
  { id: "public-service", tags: ["社会", "公共服务"], q: "为什么城市要有消防站、医院和图书馆？", a: "这些是公共服务，帮助大家在遇到危险、生病或学习时得到支持，让城市生活更安全、更公平。" },
  { id: "why-vote-rules", tags: ["规则", "社会"], q: "班级投票为什么要先说清楚规则？", a: "规则清楚，大家才知道怎样表达想法、怎样计算结果，也更容易接受最后的决定。" }
];

const encyclopedia = [
  { id: "compass", tags: ["博物", "历史", "科技"], text: "百科小知识：指南针是中国古代重要发明之一，能帮助人们辨认方向。古人航海、行军、远行时都很需要它。" },
  { id: "bronze", tags: ["博物", "历史"], text: "百科小知识：青铜器是用铜和锡等金属做成的器物。很多青铜器既是工具，也是古人礼仪和艺术的记录。" },
  { id: "oracle", tags: ["博物", "文字"], text: "百科小知识：甲骨文刻在龟甲和兽骨上，是研究中国古文字和古代生活的重要线索。" },
  { id: "silk-road", tags: ["历史", "全球"], text: "百科小知识：丝绸之路不是一条单独的路，而是一组连接东西方的商贸和文化交流路线。" },
  { id: "fossil", tags: ["博物", "地球"], text: "百科小知识：化石像大自然留下的时间印章，能帮助科学家了解远古动物、植物和环境。" },
  { id: "dinosaur", tags: ["博物", "生命"], text: "百科小知识：恐龙不是都很巨大，有些恐龙体型很小。科学家会通过骨骼、脚印和化石判断它们的生活方式。" },
  { id: "seed-bank", tags: ["农业", "粮食"], text: "百科小知识：种子库像植物的保险箱，会保存许多种子，帮助人类保护作物和野生植物的多样性。" },
  { id: "pollination", tags: ["农业", "动物"], text: "百科小知识：蜜蜂、蝴蝶等昆虫传粉，能帮助很多植物结出果实。保护昆虫也是保护食物来源的一部分。" },
  { id: "soil", tags: ["农业", "地球"], text: "百科小知识：土壤不是普通泥巴，里面有矿物、有机物、水、空气和微生物，是植物生长的重要家园。" },
  { id: "satellite", tags: ["航天", "科技"], text: "百科小知识：卫星可以帮助通信、导航、天气预报和观察地球。很多手机地图和天气图都离不开卫星。" },
  { id: "rocket", tags: ["航天", "科技"], text: "百科小知识：火箭靠高速喷出气体获得向上的推力，这和气球放气时会乱飞有一点相似。" },
  { id: "space-station", tags: ["航天"], text: "百科小知识：空间站像太空中的实验室，航天员可以在里面做科学实验，观察人在太空中怎样生活。" },
  { id: "ai", tags: ["AI", "科技"], text: "百科小知识：人工智能不是魔法，它通过大量例子学习规律，但仍需要人类设定规则、检查结果和负责使用。" },
  { id: "chip", tags: ["科技"], text: "百科小知识：芯片像电子产品的大脑，里面有许多非常小的电路，负责计算、记忆和控制。" },
  { id: "sensor", tags: ["机器人", "科技"], text: "百科小知识：传感器像机器的眼睛、耳朵和皮肤，能感知光、声音、温度、距离等信息。" },
  { id: "battery", tags: ["能源", "科技"], text: "百科小知识：电池能把能量暂时存起来。手机、电动车和很多机器人都需要电池提供电力。" },
  { id: "solar", tags: ["能源", "低碳"], text: "百科小知识：太阳能电池板能把一部分阳光变成电。它适合在阳光充足的地方工作。" },
  { id: "wind-power", tags: ["能源", "低碳"], text: "百科小知识：风力发电机靠风推动叶片转动，再把转动的能量变成电能。" },
  { id: "carbon", tags: ["气候", "低碳"], text: "百科小知识：二氧化碳是一种气体，植物会吸收它进行光合作用，但排放太多也会影响气候。" },
  { id: "water-cycle", tags: ["天气", "地球"], text: "百科小知识：水会在海洋、天空、河流和土地之间循环。蒸发、成云、下雨，都是水循环的一部分。" },
  { id: "rainbow", tags: ["天气", "光"], text: "百科小知识：彩虹常在雨后出现，因为空中的小水滴把阳光分成了不同颜色。" },
  { id: "earthquake", tags: ["地球"], text: "百科小知识：地球外层由许多板块组成，板块运动会形成山脉、火山，也可能引发地震。" },
  { id: "ocean-current", tags: ["海洋", "地球"], text: "百科小知识：洋流像海洋里的大河，会影响气候、鱼群和船只航行。" },
  { id: "heart", tags: ["健康", "身体"], text: "百科小知识：心脏每天不停工作，把血液送到身体各处，帮助细胞得到氧气和营养。" },
  { id: "lungs", tags: ["健康", "身体"], text: "百科小知识：肺负责呼吸。吸气时氧气进入身体，呼气时二氧化碳被排出去。" },
  { id: "immune", tags: ["健康", "身体"], text: "百科小知识：免疫系统像身体里的守卫队，会识别并抵抗许多看不见的病菌。" },
  { id: "library", tags: ["教育", "文化"], text: "百科小知识：图书馆不只是放书的地方，它也保存知识、帮助学习，还让更多人公平地接触信息。" },
  { id: "museum", tags: ["博物馆", "博物"], text: "百科小知识：博物馆会收藏和展示文物、标本和艺术品，帮助我们认识自然、历史和人类创造。" },
  { id: "supply-chain", tags: ["经济"], text: "百科小知识：供应链像一条接力队，原料、工厂、运输、商店一棒接一棒，商品才能来到我们身边。" },
  { id: "budget", tags: ["经济", "生活"], text: "百科小知识：预算就是提前计划钱怎么花。会做预算的人，更容易分清需要和想要。" },
  { id: "currency", tags: ["经济", "全球"], text: "百科小知识：钱是一种交换工具。不同国家可能使用不同货币，国际贸易时常需要换算。" },
  { id: "traffic-light", tags: ["交通", "规则"], text: "百科小知识：红绿灯把路口的通行顺序变清楚，让行人和车辆更安全地共享道路。" },
  { id: "railway", tags: ["交通", "科技"], text: "百科小知识：高铁线路需要精确的轨道、信号和调度系统，才能让列车快速又安全地运行。" },
  { id: "language", tags: ["文化", "全球"], text: "百科小知识：语言不仅用来交流，也保存着一个地方的历史、习俗和思考方式。" },
  { id: "ecosystem", tags: ["生态", "动物"], text: "百科小知识：生态系统里有植物、动物、微生物、土壤和水。它们互相影响，组成一个生活网络。" },
  { id: "migration", tags: ["动物", "地球"], text: "百科小知识：候鸟会随着季节迁徙，寻找食物和适合繁殖的地方。它们能利用太阳、星星和地磁帮助导航。" },
  { id: "photosynthesis", tags: ["植物", "能源"], text: "百科小知识：植物会用阳光、水和二氧化碳制造养分，这个过程叫光合作用，也会释放氧气。" },
  { id: "moon-phase", tags: ["天文", "月亮"], text: "百科小知识：月相会循环变化，从新月到满月再回到新月，大约需要 29 天半。" },
  { id: "tide", tags: ["海洋", "天文"], text: "百科小知识：潮汐主要受月亮引力影响。海边每天涨潮、退潮的时间会慢慢变化。" },
  { id: "volcano", tags: ["地球", "火山"], text: "百科小知识：火山喷出的岩浆冷却后会变成岩石，有些岛屿就是火山活动慢慢形成的。" },
  { id: "glacier", tags: ["地理", "气候"], text: "百科小知识：冰川像慢慢移动的冰河，会改变山谷形状，也保存着古老气候的信息。" },
  { id: "desert", tags: ["地理", "生态"], text: "百科小知识：沙漠不一定全是沙子，也可能有石头和盐地。很多沙漠动物会在夜晚活动来避开炎热。" },
  { id: "coral-reef", tags: ["海洋", "生态"], text: "百科小知识：珊瑚礁是许多海洋生物的家，被称为海里的热带雨林。" },
  { id: "whale", tags: ["动物", "海洋"], text: "百科小知识：鲸鱼用肺呼吸，虽然生活在海里，但必须定期浮上海面换气。" },
  { id: "bird-migration", tags: ["动物", "天文"], text: "百科小知识：候鸟迁徙时会利用太阳、星星、地磁和地形来辨认方向。" },
  { id: "spider-silk", tags: ["动物", "材料"], text: "百科小知识：蜘蛛丝很轻，却有很好的韧性。科学家也会研究它，寻找新的材料灵感。" },
  { id: "microbe", tags: ["微生物", "生命"], text: "百科小知识：微生物小到肉眼看不见，但它们能分解落叶、帮助发酵，也会影响土壤和身体健康。" },
  { id: "yeast", tags: ["食物", "微生物"], text: "百科小知识：酵母是一种微生物，能帮助面包发酵，也能参与制作一些传统食品。" },
  { id: "taste", tags: ["身体", "食物"], text: "百科小知识：舌头能分辨甜、酸、苦、咸、鲜等味道，鼻子闻到的气味也会影响我们觉得食物好不好吃。" },
  { id: "sweat", tags: ["身体", "健康"], text: "百科小知识：出汗是身体调节温度的一种方式。运动后要适量补水，让身体恢复。" },
  { id: "bone", tags: ["身体", "生长"], text: "百科小知识：骨头不只是支架，里面也有活细胞。运动、睡眠和营养都和骨骼健康有关。" },
  { id: "vaccine", tags: ["健康", "免疫"], text: "百科小知识：疫苗能让免疫系统提前认识某些病原体，帮助身体更快做出保护反应。" },
  { id: "probability", tags: ["数学", "生活"], text: "百科小知识：概率用来表示事情发生的可能性。天气预报、抽奖和统计调查里都会用到它。" },
  { id: "map-scale", tags: ["地图", "数学"], text: "百科小知识：比例尺能把真实距离和地图距离联系起来，帮助我们估算路程。" },
  { id: "archive", tags: ["历史", "档案"], text: "百科小知识：档案馆保存文件、照片和记录，让人们以后还能查到真实发生过的事情。" },
  { id: "paper", tags: ["历史", "材料"], text: "百科小知识：纸由许多细小纤维交织而成。造纸术让书写和保存信息变得更方便。" },
  { id: "printing", tags: ["历史", "技术"], text: "百科小知识：印刷术让书本可以大量复制，帮助知识更快传播给更多人。" },
  { id: "bridge", tags: ["工程", "物理"], text: "百科小知识：桥梁会把重量传到桥墩、桥塔或岸边。不同形状的桥适合不同河流和道路。" },
  { id: "elevator", tags: ["工程", "安全"], text: "百科小知识：电梯有制动器、限速器等安全装置，还会定期检查，帮助乘客安全上下楼。" },
  { id: "circuit", tags: ["电", "科学"], text: "百科小知识：完整电路像一条闭合小路，电流沿着小路流动，灯泡、马达等设备才能工作。" },
  { id: "lightning", tags: ["天气", "电"], text: "百科小知识：闪电是云和云之间或云和地面之间的强烈放电。雷声是空气被迅速加热后产生的响声。" },
  { id: "petrichor", tags: ["天气", "地球"], text: "百科小知识：雨后泥土味常被叫作雨味，和土壤微生物、植物释放的气味有关。" },
  { id: "recycling", tags: ["环保", "材料"], text: "百科小知识：分类回收能让纸、金属、塑料等材料有机会再次利用，减少资源浪费。" },
  { id: "nutrition-label", tags: ["健康", "生活"], text: "百科小知识：食品标签会写配料和营养信息，能帮助我们了解糖、盐、脂肪等含量。" },
  { id: "music", tags: ["音乐", "物理"], text: "百科小知识：声音来自振动。乐器通过不同材料、形状和空气柱，发出高低强弱不同的声音。" },
  { id: "camera", tags: ["光", "科技"], text: "百科小知识：相机用镜头收集光，再把光变成照片。手机拍照也依靠类似原理。" },
  { id: "privacy", tags: ["互联网", "安全"], text: "百科小知识：个人信息包括姓名、电话、地址等。上网时少公开这些信息，能减少被打扰或被骗的风险。" },
  { id: "public-service", tags: ["社会", "公共服务"], text: "百科小知识：公共服务包括消防、医疗、图书馆、公园等，目标是让更多人安全、便利地生活。" },
  { id: "rule-making", tags: ["规则", "社会"], text: "百科小知识：规则不是为了限制所有人，而是为了让大家知道边界，减少误会，公平合作。" }
];

const quizQuestions = [
  { id: "quiz-moon-cycle", tags: ["天文", "月亮"], q: "选择题：月相从新月到下一次新月大约需要多久？A. 1天 B. 7天 C. 29天半", a: "答案：C。月相变化一个周期大约 29 天半。" },
  { id: "quiz-light-sound", tags: ["物理", "光", "声音"], q: "判断题：打雷时我们先看到闪电，是因为光比声音传播得快。对还是错？", a: "答案：对。光传播得比声音快很多，所以先看到闪电，后听到雷声。" },
  { id: "quiz-plant-food", tags: ["植物", "科学"], q: "填空题：植物用阳光、水和二氧化碳制造养分，这个过程叫____。", a: "答案：光合作用。植物通过光合作用制造养分，也会释放氧气。" },
  { id: "quiz-whale-breathe", tags: ["动物", "海洋"], q: "选择题：鲸鱼在海里生活，但它用什么呼吸？A. 鳃 B. 肺 C. 皮肤", a: "答案：B。鲸鱼是哺乳动物，用肺呼吸，所以要浮上海面换气。" },
  { id: "quiz-map-scale", tags: ["地图", "数学"], q: "计算题：地图比例尺是 1:100000，图上 1 厘米代表实际多少千米？", a: "答案：1 千米。100000 厘米等于 1000 米，也就是 1 千米。" },
  { id: "quiz-bee-pollen", tags: ["动物", "植物"], q: "判断题：蜜蜂采蜜时也可能帮助植物传粉。对还是错？", a: "答案：对。蜜蜂身上会带着花粉，飞到另一朵花时能帮助植物传粉。" },
  { id: "quiz-circuit", tags: ["电", "科学"], q: "选择题：小灯泡要亮，电路通常需要怎样？A. 断开 B. 完整闭合 C. 只接一根线", a: "答案：B。电流需要沿着完整回路流动，小灯泡才会亮。" },
  { id: "quiz-fossil", tags: ["博物", "地球"], q: "填空题：古生物遗体或痕迹保存在岩石里，形成的证据叫____。", a: "答案：化石。化石能帮助科学家了解远古生命和环境。" },
  { id: "quiz-seed-grow", tags: ["植物", "农业"], q: "选择题：种子发芽通常需要水、空气和什么？A. 合适温度 B. 更大的花盆 C. 已经成熟的果实", a: "答案：A。种子遇到水、空气和合适温度后，才更容易开始发芽。" },
  { id: "quiz-compass", tags: ["历史", "科技"], q: "选择题：中国古代的指南针主要帮助人们做什么？A. 辨认方向 B. 记录时间 C. 测量重量", a: "答案：A。指南针能帮助人们辨认方向，航海和远行时很有用。" },
  { id: "quiz-tree-ring", tags: ["植物", "博物"], q: "判断题：树的年轮可以帮助人们判断树的大概年龄。对还是错？", a: "答案：对。树通常每年长出一圈新木质部分，形成一圈圈年轮。" },
  { id: "quiz-salt-ocean", tags: ["海洋", "地球"], q: "选择题：海水变咸，和河流把岩石中的什么带入海洋有关？A. 盐分 B. 泥沙颗粒 C. 淡水", a: "答案：A。河流会把岩石中的盐分慢慢带进海洋，水蒸发后盐分留下来。" },
  { id: "quiz-bone", tags: ["身体", "健康"], q: "判断题：骨头是没有生命的硬石头。对还是错？", a: "答案：错。骨头里有活细胞，也需要营养、运动和休息来保持健康。" },
  { id: "quiz-rainbow", tags: ["天气", "光"], q: "选择题：彩虹常出现，是因为雨滴把阳光分成了什么？A. 不同颜色 B. 不同声音 C. 不同温度", a: "答案：A。雨滴像小棱镜，会把阳光分成不同颜色。" },
  { id: "quiz-satellite", tags: ["航天", "科技"], q: "填空题：手机地图定位、天气云图和远方通信，常常离不开天上的____。", a: "答案：卫星。卫星能帮助导航、通信、天气预报和观察地球。" },
  { id: "quiz-battery", tags: ["能源", "科技"], q: "选择题：电池把能量暂时存起来，主要依靠里面的什么变化？A. 化学变化 B. 形状变化 C. 位置变化", a: "答案：A。电池充电和放电时，里面的化学材料会发生能量转换。" },
  { id: "quiz-food-label", tags: ["健康", "生活"], q: "判断题：配料表里排在前面的成分，通常含量更多。对还是错？", a: "答案：对。食品配料表一般按加入量从多到少排列。" },
  { id: "quiz-bronze", tags: ["历史", "材料"], q: "选择题：青铜通常主要由铜和哪种金属混合制成？A. 锡 B. 铁 C. 铝", a: "答案：A。青铜通常由铜和锡等金属组成，是古代重要材料。" },
  { id: "quiz-amber", tags: ["博物", "地球"], q: "选择题：琥珀常常是古代什么东西变成的？A. 树脂 B. 火山灰 C. 石灰岩", a: "答案：A。琥珀多由古代树脂埋藏后慢慢形成，有时会包住小昆虫。" },
  { id: "quiz-plates", tags: ["地球", "地理"], q: "填空题：地震和火山活动常常和地球表层的____运动有关。", a: "答案：板块。地球表层由多个板块组成，板块运动会影响地震、火山和山脉形成。" },
  { id: "quiz-magnet", tags: ["物理", "科学"], q: "选择题：普通磁铁最容易吸住哪一种物体？A. 铁钉 B. 纸巾 C. 木筷", a: "答案：A。磁铁能吸引铁、镍等材料，不是所有物体都会被吸住。" },
  { id: "quiz-yeast", tags: ["微生物", "食物"], q: "判断题：面包变松软，和酵母产生二氧化碳有关。对还是错？", a: "答案：对。酵母发酵会产生二氧化碳，让面团鼓起来。" },
  { id: "quiz-privacy", tags: ["互联网", "安全"], q: "选择题：下面哪一项属于需要保护的个人信息？A. 家庭住址 B. 今天的天气 C. 公共博物馆名称", a: "答案：A。家庭住址、电话、姓名等都属于需要保护的个人信息。" },
  { id: "quiz-probability", tags: ["数学", "天气"], q: "判断题：下雨概率 60% 表示一定会下雨。对还是错？", a: "答案：错。60% 表示下雨可能性较大，但不是一定会下雨。" },
  { id: "quiz-archive", tags: ["历史", "档案"], q: "选择题：档案馆保存旧文件，主要是为了什么？A. 查证和保存记忆 B. 临时堆放废纸 C. 装饰房间", a: "答案：A。档案记录过去发生过的事情，能帮助人们查证历史。" },
  { id: "quiz-heart", tags: ["身体", "健康"], q: "填空题：心脏像身体里的小泵，主要把____送到全身。", a: "答案：血液。血液会把氧气和营养送到身体各处。" },
  { id: "quiz-tide", tags: ["海洋", "天文"], q: "选择题：潮汐和哪一种力量关系最密切？A. 月亮的引力 B. 海风的温度 C. 船只的速度", a: "答案：A。月亮的引力会拉动海水，是潮汐的重要原因。" },
  { id: "quiz-paper", tags: ["历史", "材料"], q: "判断题：纸由许多细小纤维交织而成。对还是错？", a: "答案：对。纸的纤维结构让它轻，也能留下文字和图画。" },
  { id: "quiz-camera", tags: ["光", "科技"], q: "选择题：相机拍照时，最先收集进入相机的是什么？A. 光 B. 声音 C. 热量", a: "答案：A。相机用镜头收集光，再把光的信息变成图像。" },
  { id: "quiz-recycle", tags: ["环保", "材料"], q: "选择题：分类回收主要能帮助什么？A. 材料再次利用 B. 垃圾自动消失 C. 垃圾更难分类", a: "答案：A。分类回收能让纸、金属、塑料等材料更容易再次利用。" },
  { id: "quiz-sound", tags: ["物理", "音乐"], q: "填空题：声音来自物体的____。", a: "答案：振动。鼓面、琴弦和空气柱振动时，都可能发出声音。" },
  { id: "quiz-glacier", tags: ["地理", "气候"], q: "判断题：冰川像完全静止的冰块，不会移动。对还是错？", a: "答案：错。冰川会像很慢的冰河一样移动，能改变地形。" },
  { id: "quiz-coral", tags: ["海洋", "动物"], q: "选择题：珊瑚看起来像植物，但其实属于什么？A. 动物 B. 植物 C. 岩石", a: "答案：A。珊瑚由许多小小的珊瑚虫组成，属于动物。" },
  { id: "quiz-red-light", tags: ["交通", "规则"], q: "判断题：红绿灯能让路口通行顺序更清楚。对还是错？", a: "答案：对。红绿灯让行人和车辆知道什么时候走、什么时候停。" },
  { id: "quiz-chip", tags: ["科技", "电"], q: "选择题：芯片里有许多非常小的什么？A. 电路 B. 水管 C. 齿轮", a: "答案：A。芯片里有大量微小电路，负责计算、记忆和控制。" },
  { id: "quiz-water-cycle", tags: ["天气", "地球"], q: "选择题：下面哪一组都属于水循环过程？A. 蒸发、凝结、降水 B. 燃烧、熔化、发光 C. 开花、传粉、结果", a: "答案：A。水受热蒸发，水蒸气凝结成云，云里的小水滴变大后降水。" },
  { id: "quiz-insect-legs", tags: ["动物", "博物"], q: "选择题：昆虫通常有几条腿？A. 4条 B. 6条 C. 8条", a: "答案：B。昆虫身体分节明显，成虫通常有 6 条腿。" },
  { id: "quiz-spider-insect", tags: ["动物", "博物"], q: "判断题：蜘蛛有 8 条腿，所以它不是昆虫。对还是错？", a: "答案：对。蜘蛛属于蛛形纲动物，不属于昆虫。" },
  { id: "quiz-sundial", tags: ["历史", "天文"], q: "选择题：日晷主要利用什么来判断时间？A. 太阳影子 B. 月相变化 C. 水位高低", a: "答案：A。日晷利用太阳照出的影子方向和位置来估计时间。" },
  { id: "quiz-lotus-leaf", tags: ["植物", "材料"], q: "判断题：荷叶表面容易让水珠滚落，和表面细小结构有关。对还是错？", a: "答案：对。荷叶表面有细小结构和蜡质层，水珠不容易铺开。" },
  { id: "quiz-why-crater", tags: ["天文", "月亮"], q: "简答题：月球表面为什么有很多坑坑洼洼的环形山？", a: "答案：月球几乎没有浓厚大气保护，许多陨石能直接撞到月面，留下圆形撞击坑。" },
  { id: "quiz-why-owl", tags: ["动物", "声音"], q: "简答题：猫头鹰为什么能比较准确地判断猎物声音来自哪里？", a: "答案：猫头鹰左右耳位置不完全对称，声音到达两只耳朵的时间和强弱不同，大脑能据此判断方向。" },
  { id: "quiz-why-amber", tags: ["地球", "博物"], q: "解释题：琥珀为什么有时能保存很久以前的小昆虫？", a: "答案：古代树脂流出时可能包住小昆虫，后来树脂被埋藏并慢慢变成琥珀，昆虫形状就被保存下来。" },
  { id: "quiz-why-bread", tags: ["微生物", "食物"], q: "简答题：面包发酵后为什么会变得松软？", a: "答案：酵母会分解面团里的糖，产生二氧化碳气体。气体被面团包住，面包就会鼓起来、变松软。" },
  { id: "quiz-why-salt", tags: ["海洋", "地球"], q: "解释题：海水为什么尝起来是咸的？", a: "答案：雨水和河流会把岩石中的盐分带进海洋，海水蒸发时盐分留下来，时间久了海水就变咸。" },
  { id: "quiz-why-ring", tags: ["植物", "博物"], q: "简答题：树的年轮为什么能帮助科学家了解过去的气候？", a: "答案：树木每年生长快慢会受温度和雨水影响，年轮宽窄记录了这些变化，所以能帮助研究过去气候。" },
  { id: "quiz-why-shadow", tags: ["光", "科学"], q: "解释题：为什么早上和傍晚的影子常常比较长？", a: "答案：早上和傍晚太阳位置低，光斜着照到物体上，影子就被拉得更长。" },
  { id: "quiz-why-float", tags: ["物理", "海洋"], q: "简答题：一艘很重的船为什么还能浮在水面上？", a: "答案：船做成中空的大形状后，会排开很多水，水给船向上的浮力足够大，船就能浮起来。" }
];

function buildAdvancedKnowledgeQuestions(dayIndex) {
  const variant = Math.abs(dayIndex) % 17;
  const mapCm = 3 + (variant % 5);
  const kmPerCm = 1 + (variant % 2);
  const solarInput = 80 + (variant % 6) * 20;
  const solarOutput = solarInput / 4;
  const redBalls = 2 + (variant % 4);
  const blueBalls = redBalls + 2;
  const yellowBalls = 1 + (variant % 3);
  const warmColorBalls = redBalls + yellowBalls;
  const roverSpeed = 4 + (variant % 5);
  const roverMinutes = 6 + (variant % 4);
  const roverSlowMinutes = 2;
  const roverSlowSpeed = Math.max(2, roverSpeed - 1);
  const roverNormalMinutes = roverMinutes - roverSlowMinutes;
  const roverDistance = roverSlowMinutes * roverSlowSpeed + roverNormalMinutes * roverSpeed;
  const ringA = 2 + (variant % 3);
  const ringB = ringA + 4;
  const daytimePower = 90 + (variant % 5) * 10;
  const eveningPower = 40 + (variant % 4) * 10;
  const storedPower = daytimePower - eveningPower;
  const signalDistance = 600 + (variant % 5) * 100;
  const signalRoundTrip = signalDistance * 2;
  const robotBatterySample = 24 + (variant % 3) * 6;
  const plantNewAvg = 22 + (variant % 3);
  const plantOldAvg = plantNewAvg - 2;
  const cupSunnyStart = 100 + (variant % 3) * 10;
  const cupShadeStart = cupSunnyStart - 20;
  const cupSunnyLoss = 30 + (variant % 2) * 5;
  const cupShadeLoss = cupSunnyLoss - 10;
  const deliveryCapacity = 7 + (variant % 3);
  const deliveryTrips = 5 + (variant % 4);
  const deliveryLightTrips = 2;
  const deliveryLightLoad = deliveryCapacity - 3;
  const deliveryFullTrips = deliveryTrips - deliveryLightTrips;
  const deliveryTotal = deliveryFullTrips * deliveryCapacity + deliveryLightTrips * deliveryLightLoad;
  const deliveryNaiveTotal = deliveryTrips * deliveryCapacity;
  const deliveryOneLightTripMistake = deliveryNaiveTotal - (deliveryCapacity - deliveryLightLoad);
  const busCapacity = 11 + (variant % 3);
  const busTrips = 5 + (variant % 3);
  const busLightTrips = 2;
  const busLightLoad = busCapacity - 3;
  const busFullTrips = busTrips - busLightTrips;
  const busTotal = busFullTrips * busCapacity + busLightTrips * busLightLoad;
  const busNaiveTotal = busTrips * busCapacity;
  const busOneLightTripMistake = busNaiveTotal - (busCapacity - busLightLoad);
  const newBagCount = 18 + (variant % 4) * 2;
  const oldBagCount = newBagCount;

  return [
    {
      id: `advanced-map-${variant}`,
      difficulty: 3,
      tags: ["地图", "数学", "交通"],
      q: `计算题：一张地图上，1 厘米代表实际 ${kmPerCm} 千米。学校到科技馆的图上距离是 ${mapCm} 厘米，往返一共多少千米？`,
      a: `答案：${mapCm * kmPerCm * 2} 千米。先算单程 ${mapCm}×${kmPerCm}=${mapCm * kmPerCm} 千米，再乘 2 得到往返距离。`
    },
    {
      id: `advanced-solar-${variant}`,
      difficulty: 3,
      tags: ["能源", "数学", "科技"],
      q: `资料题：一块太阳能板接收到 ${solarInput} 份太阳能。大约四分之一能变成电。它大约产生多少份电能？\nA. 大约 ${solarOutput} 份，因为四分之一可以用 ${solarInput}÷4 来算\nB. 大约 ${solarInput - solarOutput} 份，因为把四分之一当作没变成电的部分\nC. 大约 ${solarInput / 2} 份，因为把能量分成两份后取其中一份`,
      a: `答案：A。${solarInput}÷4=${solarOutput}，其余能量可能变成热等其他形式。`
    },
    {
      id: `advanced-energy-storage-${variant}`,
      difficulty: 3,
      tags: ["能源", "数学", "低碳"],
      q: `计算题：一座小型太阳能电站白天发了 ${daytimePower} 份电，白天用了 ${eveningPower} 份。为了晚上还能用电，最多可以先存下多少份电？为什么新能源常常要配储能？`,
      a: `答案：最多存下 ${storedPower} 份电。太阳能、风能会受天气和时间影响，储能能把暂时多出来的电先存起来，需要时再放出来。`
    },
    {
      id: `advanced-food-web-${variant}`,
      difficulty: 3,
      tags: ["动物", "植物", "生态"],
      q: "推理题：一片湿地里有这样的关系：水草被昆虫吃，昆虫被青蛙吃，青蛙被蛇吃。如果青蛙突然少了，短时间内最可能发生什么？\nA. 昆虫变多，水草被吃得更多\nB. 昆虫变少，因为湿地里的动物关系变弱了\nC. 蛇会先找别的食物，昆虫数量要看别的动物",
      a: "答案：A。青蛙减少后，吃昆虫的力量变弱，昆虫可能增多；更多昆虫又会啃食更多水草。"
    },
    {
      id: `advanced-experiment-${variant}`,
      difficulty: 4,
      tags: ["科学", "天气", "水"],
      reasoningPattern: "control-variable",
      q: `探究题：小明想研究晒太阳会不会让水蒸发得更快。甲杯 ${cupSunnyStart} 毫升水，放在太阳下，3 小时少了 ${cupSunnyLoss} 毫升；乙杯 ${cupShadeStart} 毫升水，放在阴凉处，3 小时少了 ${cupShadeLoss} 毫升。要重新做得更公平，最应该怎么改？\nA. 两个相同杯子装一样多的水，只保留太阳下和阴凉处不同\nB. 把观察时间从 3 小时延长到 6 小时，但两杯开始水量仍不同\nC. 多放几个杯子一起测，但太阳下的杯子仍装更多水`,
      a: "答案：A。要比较阳光的影响，杯子和开始水量要尽量一样，主要只改变放太阳下还是阴凉处。延长观察时间或增加杯子数量，如果开始水量仍不同，还是没有解决关键问题。"
    },
    {
      id: `advanced-evidence-control-${variant}`,
      difficulty: 4,
      tags: ["科学", "实验", "证据"],
      reasoningPattern: "control-variable",
      q: `资料题：有人说一种新种植方法能让小苗长得更快。新方法组 10 盆小苗平均 ${plantNewAvg} 厘米，普通组 10 盆平均 ${plantOldAvg} 厘米。但是，新方法组放在阳光更强的窗边。想判断是不是种植方法带来了差别，下一步最应该怎么做？\nA. 重新比较：两组阳光、土壤、水量和盆数尽量一样，种植方法不同\nB. 继续把两组放在原来的位置，每天量高度，再观察一个月\nC. 把新方法组增加到 20 盆，普通组保持 10 盆，再比较平均高度`,
      a: "答案：A。比较新方法时，两组除了种植方法，阳光、土壤、水量和盆数都要尽量一样。这样才更容易看出差别是不是来自种植方法。"
    },
    {
      id: `advanced-insulation-paired-comparison-${variant}`,
      difficulty: 4,
      tags: ["工程", "科学", "数据"],
      reasoningPattern: "control-variable",
      q: "资料题：科学小组给三个相同杯子装入同样多、同样温度的热水。20 分钟后，包 1 层棉布的甲杯是 62℃，包 1 层泡沫的乙杯是 66℃，包 2 层泡沫的丙杯是 69℃。环境和测量方法相同。小组想分别判断‘材料不同’和‘层数不同’带来的影响，哪种分析最合理？\nA. 比较甲、乙判断材料的影响，再比较乙、丙判断层数的影响\nB. 比较甲、丙判断材料的影响，再比较乙、丙判断层数的影响\nC. 比较甲、乙判断材料的影响，再比较甲、丙判断层数的影响",
      a: "答案：A。甲、乙都是 1 层，主要差别是材料；乙、丙都是泡沫，主要差别是层数。甲、丙同时改变了材料和层数，不能把温度差分别算给其中一个条件。"
    },
    {
      id: `advanced-tree-ring-${variant}`,
      difficulty: 4,
      tags: ["植物", "博物", "气候"],
      reasoningPattern: "control-variable",
      q: `资料题：一棵树的甲年年轮宽约 ${ringA} 毫米，乙年宽约 ${ringB} 毫米。研究小组想判断差异是否主要和当地两年的天气有关。哪种取样方法最能减少其他因素的干扰？\nA. 在同一地区选 30 棵同种树，对齐甲、乙两年的年轮，再核对两年的温度、降雨和病虫记录\nB. 在同一地区选 30 棵不同树种，对齐甲、乙两年的年轮，再核对两年的温度、降雨和病虫记录\nC. 在不同地区选 30 棵同种树，对齐甲、乙两年的年轮，再核对各地两年的温度、降雨和病虫记录`,
      a: "答案：A。同一地区、同一树种能尽量控制地点和树种差异；观察多棵树可以减少单棵树的偶然情况；再把年轮与同一年的温度、降雨和病虫记录对照，才更容易判断天气的影响。B 混入树种差异，C 混入地区差异。"
    },
    {
      id: `advanced-mammal-${variant}`,
      difficulty: 3,
      tags: ["动物", "海洋", "身体"],
      q: "推理题：有一种动物生活在海里，用肺呼吸，小宝宝喝妈妈的奶，体温也比较稳定。只看这些特点，它最可能是哪一类？\nA. 哺乳动物\nB. 鱼类\nC. 两栖动物",
      a: "答案：A。生活环境不能单独决定分类；用肺呼吸、哺乳和体温较稳定，都是判断哺乳动物的重要线索。"
    },
    {
      id: `advanced-density-${variant}`,
      difficulty: 3,
      tags: ["物理", "数学", "材料"],
      q: "资料题：甲、乙两个方块大小一样。甲重 80 克，乙重 30 克。比较这两个方块，哪项判断更合理？\nA. 甲的密度更大\nB. 乙的密度更大\nC. 两者密度接近，因为外形大小一样",
      a: "答案：A。体积相同，质量更大的物体密度更大，所以甲的密度更大。"
    },
    {
      id: `advanced-shadow-${variant}`,
      difficulty: 3,
      tags: ["光", "天文", "科学"],
      q: "推理题：上午，太阳在操场东边，小树的影子伸向西边。傍晚太阳到了西边，影子最可能怎样变化？\nA. 主要伸向东边，而且通常会变长\nB. 仍伸向西边，因为影子会保持上午的方向\nC. 主要伸向东边，但长度会接近中午时的样子",
      a: "答案：A。影子通常出现在光源相反方向；傍晚太阳位置较低，影子往往也更长。"
    },
    {
      id: `advanced-water-cycle-${variant}`,
      difficulty: 3,
      tags: ["天气", "地球", "科学"],
      q: "排序题：把水循环的一段过程按先后排列：①云中小水滴变大落下 ②太阳把地表水加热 ③水蒸气上升后遇冷凝结。\nA. ②③①\nB. ③②①\nC. ①②③",
      a: "答案：A。地表水先受热蒸发，水蒸气上升遇冷凝结成云，水滴继续变大后才形成降水。"
    },
    {
      id: `advanced-archaeology-${variant}`,
      difficulty: 3,
      tags: ["历史", "博物", "农业"],
      q: "资料题：考古学家在一个古代遗址里，发现了很多烧焦的稻谷、石镰和储粮坑。哪种说法最有根据？\nA. 当地人可能已经会种粮食、存粮食\nB. 当地人可能主要靠捕鱼生活，稻谷是从外地换来的\nC. 这些东西说明他们会用工具，但粮食从哪里来还要再查",
      a: "答案：A。稻谷、收割工具和储粮坑三条线索能合在一起看，更支持当地人会种粮、收粮和存粮。"
    },
    {
      id: `advanced-circuit-${variant}`,
      difficulty: 3,
      tags: ["电", "工程", "科学"],
      q: "推理题：一个简单电路里，电池有电，灯泡也能亮。可是合上开关后，灯还是不亮。检查发现，一根导线的金属头没有碰到接点。最可能的原因是什么？\nA. 电流路线断开了，没有形成从电池到灯泡再回来的闭合路\nB. 灯泡可能接在了错误位置，电流没有经过灯丝就回到电池\nC. 开关合上后接触可能不稳，电流在开关处被断开了",
      a: "答案：A。小灯泡要亮，电流需要走成一条闭合的路。金属头没有碰到接点，电流的路就断了。"
    },
    {
      id: `advanced-probability-${variant}`,
      difficulty: 3,
      tags: ["数学", "统计", "生活"],
      q: `计算题：袋子里有 ${redBalls} 个红球、${blueBalls} 个蓝球和 ${yellowBalls} 个黄球，球的大小相同。闭眼摸一个球，摸到“红球或黄球”和摸到“蓝球”相比，哪一种可能性更大？相差几个球？`,
      a: `答案：${warmColorBalls > blueBalls ? "摸到红球或黄球的可能性更大" : warmColorBalls < blueBalls ? "摸到蓝球的可能性更大" : "两种可能性一样大"}，相差 ${Math.abs(warmColorBalls - blueBalls)} 个球。红球或黄球一共有 ${redBalls}+${yellowBalls}=${warmColorBalls} 个，蓝球有 ${blueBalls} 个。`
    },
    {
      id: `advanced-delivery-exception-${variant}`,
      difficulty: 4,
      tags: ["数学", "逻辑", "生活"],
      reasoningPattern: "exception-arithmetic",
      q: `计算题：一辆无人配送车每趟最多送 ${deliveryCapacity} 个包裹。上午它跑了 ${deliveryTrips} 趟，其中 ${deliveryLightTrips} 趟各送 ${deliveryLightLoad} 个，其他趟都装满。上午一共送了多少个包裹？\nA. ${deliveryTotal} 个\nB. ${deliveryNaiveTotal} 个\nC. ${deliveryOneLightTripMistake} 个`,
      a: `答案：A。先算装满的 ${deliveryFullTrips} 趟：${deliveryFullTrips}×${deliveryCapacity}=${deliveryFullTrips * deliveryCapacity}；再加上没装满的 ${deliveryLightTrips} 趟：${deliveryLightTrips}×${deliveryLightLoad}=${deliveryLightTrips * deliveryLightLoad}，一共 ${deliveryTotal} 个。`
    },
    {
      id: `advanced-bus-exception-${variant}`,
      difficulty: 4,
      tags: ["数学", "逻辑", "交通"],
      reasoningPattern: "exception-arithmetic",
      q: `计算题：一辆校车每趟最多接 ${busCapacity} 名同学。今天早上跑了 ${busTrips} 趟，其中 ${busLightTrips} 趟各接 ${busLightLoad} 名，其他趟都坐满。一共接了多少名同学？\nA. ${busTotal} 名\nB. ${busNaiveTotal} 名\nC. ${busOneLightTripMistake} 名`,
      a: `答案：A。坐满的 ${busFullTrips} 趟是 ${busFullTrips}×${busCapacity}=${busFullTrips * busCapacity} 名；没坐满的 ${busLightTrips} 趟是 ${busLightTrips}×${busLightLoad}=${busLightTrips * busLightLoad} 名，一共 ${busTotal} 名。`
    },
    {
      id: `advanced-rover-${variant}`,
      difficulty: 4,
      tags: ["航天", "数学", "机器人"],
      reasoningPattern: "exception-arithmetic",
      q: `计算题：一辆月球车计划每分钟前进 ${roverSpeed} 米，连续行驶 ${roverMinutes} 分钟。实际前 ${roverSlowMinutes} 分钟为了绕开石块，每分钟只走 ${roverSlowSpeed} 米；其余时间按原速度行驶。它一共前进多少米？\nA. ${roverDistance} 米\nB. ${roverSpeed * roverMinutes} 米\nC. ${roverSlowSpeed * roverMinutes} 米`,
      a: `答案：A。前 ${roverSlowMinutes} 分钟走 ${roverSlowMinutes}×${roverSlowSpeed}=${roverSlowMinutes * roverSlowSpeed} 米，其余 ${roverNormalMinutes} 分钟走 ${roverNormalMinutes}×${roverSpeed}=${roverNormalMinutes * roverSpeed} 米，一共 ${roverDistance} 米。`
    },
    {
      id: `advanced-satellite-${variant}`,
      difficulty: 3,
      tags: ["航天", "地图", "科技"],
      q: "推理题：手机定位时，如果只知道“手机离一颗卫星多远”，通常还不能确定准确位置。多颗卫星一起帮忙会更准，原因是什么？\nA. 多条距离线索合在一起，能把可能位置缩小\nB. 多颗卫星发来的时间更接近，手机可以取平均距离\nC. 最近的卫星负责定位，其他卫星主要用来修正天气影响",
      a: "答案：A。一颗卫星只能给出一条距离线索，范围还很大。多颗卫星的线索合在一起，手机的位置就能缩得更小、更准。"
    },
    {
      id: `advanced-satellite-signal-${variant}`,
      difficulty: 3,
      tags: ["航天", "通信", "物理"],
      q: `计算题：一条手机信号先从地面到 ${signalDistance} 千米外的卫星，再从卫星回到地面。信号大约走了多少千米？为什么卫星通信通常更需要“对准方向”？`,
      a: `答案：大约 ${signalRoundTrip} 千米。信号要走很远，能量会分散；天线更准确地对准方向，能让信号传得更稳。`
    },
    {
      id: `advanced-material-evidence-${variant}`,
      difficulty: 4,
      tags: ["材料", "科学", "证据"],
      reasoningPattern: "comparative-evidence",
      q: `资料题：有人说“新材料书包更轻，也更耐用”。下面哪种测试最能支持这个说法？\nA. 选 ${newBagCount} 个新书包和 ${oldBagCount} 个普通书包，装同样重量的书，做相同次数的提拉和跌落，再比较重量和破损次数\nB. 选 ${newBagCount} 个新书包，装同样重量的书，做多次提拉和跌落，记录破损次数\nC. 选 5 个新书包和 5 个普通书包，装同样重量的书，只做 1 次提拉和 1 次跌落`,
      a: "答案：A。这个测试有新旧书包对比，条件也更公平，还同时看重量和破损情况。只测新书包缺少对照；只测很少样本和次数，证据也不够稳。"
    },
    {
      id: `advanced-bridge-evidence-${variant}`,
      difficulty: 4,
      tags: ["工程", "科学", "证据"],
      reasoningPattern: "comparative-evidence",
      q: "资料题：有人说“三角形支架做的小桥更稳”。下面哪种测试最能支持这个说法？\nA. 用同样长度的木条和同样多的胶水，分别做多座三角支架桥和方形支架桥，再逐步加重物，记录承重和变形\nB. 用同样材料各做一座三角支架桥和方形支架桥，只测试一次承重\nC. 分别做多座三角支架桥和方形支架桥，但三角支架桥用更粗的木条",
      a: "答案：A。它比较了两种结构，还尽量让材料和测试方法一样，能更公平地看结构带来的差别。只测一次不够稳；材料不同会让结果混进别的影响。"
    },
    {
      id: `advanced-cup-evidence-${variant}`,
      difficulty: 4,
      tags: ["材料", "科学", "生活"],
      reasoningPattern: "comparative-evidence",
      q: "资料题：有人说一种新保温杯能让热水凉得更慢。下面哪种测试最能支持这个说法？\nA. 新保温杯和普通杯都倒入同样多、同样温度的热水，盖好杯盖，每隔 30 分钟量一次水温并比较变化\nB. 新保温杯和普通杯都倒入同样多的热水，但只在 6 小时后量一次水温\nC. 只测试新保温杯，每隔 30 分钟量一次水温，记录它降温快不快",
      a: "答案：A。它让开始条件相同，又连续记录温度变化，能直接比较保温效果。只量一次能看到结果但过程较少；只测新保温杯缺少普通杯对照。"
    },
    {
      id: `advanced-helmet-evidence-${variant}`,
      difficulty: 4,
      tags: ["材料", "科学", "安全"],
      reasoningPattern: "comparative-evidence",
      q: "资料题：有人说一种新头盔更能保护头部。下面哪种测试最能支持这个说法？\nA. 用同样重量的模型头，分别戴新头盔和普通头盔，从同样高度跌落多次，记录模型头受损和头盔变形情况\nB. 用同样重量的模型头，分别戴新头盔和普通头盔，从同样高度各跌落 1 次，记录这一次结果\nC. 只测试新头盔，从不同高度跌落多次，记录模型头受损和头盔变形情况",
      a: "答案：A。它有新旧头盔对比，跌落条件相同，还做多次记录。只测一次证据不稳；只测新头盔缺少普通头盔对照。"
    },
    {
      id: `advanced-filter-evidence-${variant}`,
      difficulty: 4,
      tags: ["科学", "材料", "生活"],
      reasoningPattern: "comparative-evidence",
      q: "资料题：有人说一种新滤网能更好地过滤水里的细沙。下面哪种测试最能支持这个说法？\nA. 取同样多、含沙量相同的水，分别通过新滤网和普通滤网，多次测量过滤后水里还剩多少细沙\nB. 只用新滤网过滤多杯含沙水，多次记录过滤后水里还剩多少细沙\nC. 取同样多的含沙水，分别通过新滤网和普通滤网，但只比较第一次过滤结果",
      a: "答案：A。它有新旧滤网对比，水量和含沙量相同，还多次测量结果。只测新滤网缺少对照；只比较一次结果不够稳。"
    },
    {
      id: `advanced-evidence-sample-${variant}`,
      difficulty: 4,
      tags: ["科学", "统计", "工程"],
      reasoningPattern: "comparative-evidence",
      q: `资料题：研究员想判断新配方电池是否比旧配方续航更长。三个小组各有 ${robotBatterySample} 台同型号机器人，哪种实验方案的证据更可靠？\nA. 今年测试新电池，再和去年旧电池的记录比较；机器人型号和路线相同\nB. 把同一批机器人随机分成两组，分别装新、旧电池；充电量、室温、路线和负重相同，多次测试，记录人员事先不知道哪组用了新电池\nC. 每台机器人上午先测旧电池，下午再测新电池；路线和负重相同，再比较同一台机器人的两次成绩`,
      a: "答案：B。同一时间随机分组，能让两组机器人的差别更平均；其他条件相同并多次测试，可以减少偶然影响；记录人员不知道分组，还能减少主观偏差。A 可能混入年份、天气或软件变化；C 把旧电池固定在上午、新电池固定在下午，时间和测试顺序也可能影响结果。"
    },
    {
      id: `advanced-causal-electricity-${variant}`,
      difficulty: 4,
      tags: ["科学", "城市", "能源"],
      reasoningPattern: "causal-evidence",
      q: "资料题：一个城市今年夏天用电量明显变高。有人认为主要原因是天气更热，大家开空调更多。下面哪组资料最能帮助判断这个说法？\nA. 今年夏天每天的最高气温、用电高峰时间、居民区用电变化\nB. 今年夏天商场和工厂的用电变化、城市新增人口数量、居民区用电变化\nC. 今年夏天每天的最高气温、空调维修次数、居民区夜间用电变化",
      a: "答案：C。它同时看天气热不热、空调相关活动有没有变多、居民区夜间用电有没有变化，三条线索更能判断这个原因。用电高峰和居民区用电有参考价值；商场、工厂和人口变化能看别的原因，但对空调原因不够直接。"
    },
    {
      id: `advanced-causal-classroom-heat-${variant}`,
      difficulty: 4,
      tags: ["科学", "生活", "校园"],
      reasoningPattern: "causal-evidence",
      q: "资料题：一间教室下午总是比旁边教室热。有人认为主要原因是这间教室被西边太阳晒得更多。下面哪组资料最能帮助判断这个说法？\nA. 两间教室下午每小时的温度、窗户朝向、太阳照进教室的时间\nB. 两间教室下午每小时的温度、开窗时间、风扇使用时间\nC. 这间教室上午和下午的温度、开窗时间、教室人数",
      a: "答案：A。它同时看温度变化、窗户方向和太阳照射时间，能更直接判断是不是西晒造成。通风、风扇、人数会影响温度，但不能直接说明是不是西边太阳晒得更多。"
    },
    {
      id: `advanced-causal-playground-water-${variant}`,
      difficulty: 4,
      tags: ["科学", "校园", "天气"],
      reasoningPattern: "causal-evidence",
      q: "资料题：学校操场连续几天早上都有一片地面很湿。有人认为主要原因是夜里自动喷灌打开了。下面哪组资料最能帮助判断这个说法？\nA. 每晚喷灌打开的时间、早上湿地的位置、没有下雨的日子是否也湿\nB. 每天早上的湿地面积、当天有没有体育课、清洁车经过的时间\nC. 每天的降雨记录、早上湿地面积、下午地面变干的时间",
      a: "答案：A。它同时看喷灌时间、湿地位置和没有下雨时是否仍然变湿，更能判断是不是喷灌造成。体育课、清洁车和降雨记录有参考价值，但对喷灌这个原因不够直接。"
    },
    {
      id: `advanced-causal-plant-water-${variant}`,
      difficulty: 4,
      tags: ["科学", "植物", "校园"],
      reasoningPattern: "causal-evidence",
      q: "资料题：教室里一盆绿萝这几天叶子下垂。有人认为主要原因是忘记浇水。下面哪组资料最能帮助判断这个说法？\nA. 每天土壤湿度、最近浇水日期、浇水后叶子是否慢慢恢复\nB. 每天教室温度、绿萝摆放位置、窗户打开时间\nC. 花盆大小、绿萝叶子数量、教室里其他植物的高度",
      a: "答案：A。它同时看土壤水分、浇水记录和浇水后的变化，更能判断是不是缺水造成。温度、位置和花盆大小可能有影响，但对忘记浇水这个原因不够直接。"
    },
    {
      id: `advanced-pollination-${variant}`,
      difficulty: 3,
      tags: ["动物", "植物", "农业"],
      q: "推理题：一片果园开花时，几乎没有蜜蜂等传粉昆虫。其他条件不变，最可能发生什么？\nA. 一些花传粉机会变少，果实数量可能下降\nB. 果实成熟时间可能改变，但果实数量主要看土壤肥力\nC. 花蜜消耗少了，植物可能把更多能量留给果实",
      a: "答案：A。许多果树需要昆虫搬运花粉；传粉机会减少，成功结果的花也可能减少。"
    }
  ].map((item) => ({ ...item, conceptId: item.id.replace(/-\d+$/, "") }));
}

function buildNewsQuizQuestions(news, dayIndex = 0) {
  const newsText = getNewsSelectionText(news);
  const candidates = [];
  const add = (id, tags, q, a, difficulty = 2, reasoningPattern = "") => candidates.push({
    id: `news-${id}`,
    tags,
    q,
    a,
    source: "news",
    difficulty,
    reasoningPattern
  });

  if (/高光谱相机|高光谱成像/.test(newsText) && /实时解析|片上光谱计算|便携设备/.test(newsText)) {
    add(
      "hyperspectral-realtime-validation-1",
      ["高光谱", "光学", "数据"],
      "资料题：研究团队把高光谱相机原本依赖大型服务器的解析计算装进便携设备，并希望它能在现场识别材料。下面三种测试都能收集一些信息，哪一种最能判断便携系统的识别结果是否可靠、实时处理是否稳定？\nA. 准备一批已知材质的相同样品，让便携系统和实验室标准方法在相同光照下分别识别；再更换光照、重复多次，比较正确率、处理时间和失败次数\nB. 准备一批已知材质的样品，让便携系统在同一光照下连续识别多次，记录正确率和处理时间\nC. 让便携系统测试室外样品、实验室方法测试另一批室内样品，分别记录识别结果和处理时间，再比较两边的平均值",
      "答案：A。它让两种方法处理同一批已知样品，能够核对识别对不对；相同条件下比较能减少样品差异，更换光照并重复测试又能检查现场变化和偶然误差。B只看速度和画面，缺少已知答案与标准方法；C使用不同样品和环境，差别可能来自材料或光照，不能只算给设备。",
      4,
      "comparative-evidence"
    );
  }

  if (/量子随机存储器|QRAM/.test(newsText) && /量子路由|两层路由网络|传输效率/.test(newsText)) {
    add(
      "quantum-memory-scaling-evidence-1",
      ["量子计算", "数据", "数学"],
      "资料题：研究团队在量子计算机上测试相干量子路由系统。单个路由器的信息传输效率为98%，平均保真度为94.8%；组成两层网络后，信息传输效率为93%，平均保真度为82.4%。研究人员想判断网络变复杂时，哪项指标的变化更明显。下面三种分析都使用了报道中的数字，哪一种比较方法最合适？\nA. 传输效率从98%降到93%，下降5个百分点；平均保真度从94.8%降到82.4%，下降12.4个百分点，因此保真度变化更明显\nB. 用单个路由器98%的传输效率减去两层网络82.4%的平均保真度，得到15.6个百分点，再与其他差值比较\nC. 分别计算单个路由器两项百分数的平均值和两层网络两项百分数的平均值，再比较两个平均值",
      "答案：A。判断网络增加一层后哪项指标变化更明显，要让同一种指标在单个路由器和两层网络之间分别比较。传输效率下降5个百分点，平均保真度下降12.4个百分点，所以后者变化更明显。B把传输效率和保真度两种含义不同的指标相减；C把两种指标先混成一个平均数，会遮住每项指标各自的变化。",
      4,
      "difference-comparison"
    );
  }

  if (/C919/.test(newsText) && /国际商业航班|国际航线/.test(newsText)) {
    add(
      "c919-international-route-matched-comparison-1",
      ["C919", "航空", "证据"],
      "资料题：C919完成首次国际商业航班后，航空公司想判断这条国际航线能否长期稳定运行。除了飞机本身，国际航线还多了境外机场地面保障、国际航班调度和备件安排等环节。下面三组资料都有用，哪一组最能分清问题来自飞机、天气，还是国际运行环节？\nA. 连续三个月记录这条航线的完成率、延误原因和维修记录，再与同一天航程相近的C919国内航班比较天气、机场流量和故障情况\nB. 同一时期比较C919飞往两个境外机场的完成率和延误原因，并记录两地的天气、机场流量、地面保障和备件到达时间\nC. 同一时期比较飞往同一境外机场、航程相近的C919和其他机型，逐班记录天气、机场流量、飞机故障、地面保障和调度用时",
      "答案：C。它把时间、目的地和航程尽量放在相近条件下，同时记录天气、机场流量、飞机故障、地面保障和调度用时。这样既能比较不同机型，也能检查延误究竟出现在哪个环节。A能比较国际与国内运行，却还混入了不同机场流程；B能比较两个境外保障体系，却没有同一航线上的其他机型作对照。三组资料都有价值，C最能同时区分飞机本身与国际运行条件。",
      4,
      "comparative-evidence"
    );
  }

  if (/自然资源.*一张图|41\.4亿条空间数据/.test(newsText) && /审批|跨部门|统一底图/.test(newsText)) {
    add(
      "one-map-data-conflict-provenance-1",
      ["地理信息", "数据治理", "逻辑"],
      "资料题：林业资料把一块地标为林地，建设审批资料却把同一地点标为建设用地，两份资料的更新时间和测量方法也不同。系统既要形成统一底图，又要防止错误资料悄悄覆盖可靠记录。下面三种方法都能减少一部分混乱，哪一种最能让结果可以核对、错误可以追查？\nA. 依法登记的资料作为主表，每月用最新登记文件更新；其他部门发现差异时，把意见写在备注里\nB. 保留每份资料的来源、版本和时间，先统一坐标与字段标准；发现冲突就标记并交给相关部门核验，同时记录核验人和处理结果\nC. 用同一套卫星影像模型重新分类；置信度超过90%的结果直接进入统一底图，其余结果再由人工复核，并保留模型分数",
      "答案：B。三种方法都有价值：A有明确主表和更新周期，但合法资料也可能没有及时反映现场变化，备注中的冲突不一定得到解决；C能用同一方法快速检查大范围土地，但高置信度不等于一定正确，影像也不能代替全部登记和现场证据。B既统一数据标准，又保留来源和版本，还为冲突安排核验并留下处理记录，因此最方便复查结论、找到错误来自哪一步。",
      4,
      "comparative-evidence"
    );
  }

  if (/地质灾害防治|灾害点\+风险区|地质灾害.*双控/.test(newsText) && /8000|风险区|隐患点/.test(newsText)) {
    add(
      "geohazard-point-area-risk-1",
      ["地质灾害", "数学", "风险"],
      "资料题：某山区有100处已登记隐患点和1000处尚未登记的普通山坡。根据多年模拟资料，已登记隐患点每年发生险情的比例约为5%，普通山坡约为0.6%。下面三种分析使用的数字都正确，哪一种最完整地说明为什么要同时进行“灾害点+风险区”监测？\nA. 比较单处发生比例，已登记隐患点的风险约是普通山坡的8.3倍，应优先给这些地点安装传感器\nB. 把地点数量和发生比例相乘，两类地点预计每年分别有5处和6处险情，应扩大遥感和降雨筛查\nC. 既比较单处发生比例，也计算预计险情总数：已知点要精细监测，普通山坡数量多，还要进行区域筛查",
      "答案：C。100×5%=5，1000×0.6%=6。已登记隐患点每一处的风险更高，适合安装传感器并重点巡查；普通山坡单处风险较低，但数量多，合起来预计发生的险情并不少。A正确比较了单处风险，却没有处理大范围里的累计风险；B正确比较了预计总数，却没有说明为什么已知高风险点仍需要更精细的监测。C同时使用发生比例和地点数量，完整回答了题目。",
      4,
      "rate-comparison"
    );
  }

  if (/乌斯河锗矿|独立锗酸盐矿物/.test(newsText) && /三维电子衍射|72%|国际矿物学协会/.test(newsText)) {
    add(
      "wusiheite-balanced-evidence-1",
      ["矿物学", "实验", "证据"],
      "资料题：研究人员要判断一批微小晶体是不是一种从未命名的新矿物，同时排除“只是一块矿石里的偶然变化”和“某台仪器测错了”这两种可能。下面三套方案都包含真实有用的研究步骤，哪一套的证据链最完整？\nA. 从同一块矿石取30颗晶体，测量每颗的化学成分和光谱；挑10颗做三维电子衍射；再把其中5颗交给另一台同型号仪器复测\nB. 从5块不同位置的矿石取50颗晶体，测量化学成分；挑20颗做三维电子衍射；把全部原始数据交给国际专家委员会审查\nC. 从4块不同位置的矿石取20颗晶体，两家实验室分别复测化学成分、光谱和三维电子衍射；再提交样品来源、原始数据和分类理由供国际审查",
      "答案：C。它同时使用不同位置的样品，能检查这种特征是不是只出现在一块矿石里；两家实验室分别复测，能减少某台仪器或一次操作造成的误差；化学成分、光谱和晶体结构互相核对，再由国际专家审查，才能完整回答“它由什么组成、原子怎样排列、结果能否重复、是否符合新矿物分类”四个问题。A有多颗样品和复测，但样品只来自一块矿石，另一台同型号仪器也不等于独立实验室。B的样品数量和来源更广，也有国际审查，但缺少跨实验室复测与另一类性质证据。样本多很重要，证据种类和独立重复同样重要。",
      4,
      "comparative-evidence"
    );
  }

  if (/非农就业|劳动力市场|失业率/.test(newsText) && /2\.3万|23,000/.test(newsText)) {
    add(
      "employment-rate-labor-force-evidence-1",
      ["就业", "数学", "证据"],
      "资料题：一份就业报告显示，7月工资岗位比6月少2.3万个，但失业率仍是4.1%，变化不大。研究员想判断：\“失业率没有明显上升，可能是因为一部分没有工作的人最近没有主动求职，所以没有被统计为失业人口。\”下面三组补充资料都与就业有关，哪一组最能直接检验这个解释？\nA. 比较同一批受访者有没有工作、最近是否主动求职，以及是否从劳动力人口中退出\nB. 比较各行业的岗位增减、平均工时和平均工资\nC. 比较企业发布的招聘岗位数、收到的简历数和最终录用人数",
      "答案：A。题目要检验的是‘没有工作但停止主动求职的人，是否因此不再计入失业人口’。追踪同一批人的就业状态、求职行为和劳动力身份，能直接看见这种变化。B能说明哪些行业变强或变弱，C能说明招聘是否活跃，但两组资料都不能直接判断没有工作的人是否停止求职并退出统计范围。",
      4,
      "causal-evidence"
    );
  }

  if (/海油安澜号|张力腿浮式风电平台/.test(newsText) && /16兆瓦|浮式风电/.test(newsText)) {
    add(
      "floating-wind-wave-impact-comparison",
      ["海洋工程", "数学", "证据"],
      "资料题：工程师想判断张力腿设计是否让风电平台受大浪的影响更小。他们让同功率的甲、乙平台在相同海域、相同测试时长和相近风速下运行。甲采用张力腿设计，平静海况的有效发电率为96%，较强海况为88%；乙采用另一种浮式设计，平静海况为94%，较强海况为78%。下面三种计算都没有算错，哪一种最能直接判断“甲受海浪变强的影响更小”？\nA. 甲下降8个百分点，乙下降16个百分点；比较各自前后的下降幅度\nB. 较强海况下，甲比乙高10个百分点；比较同一海况的发电率\nC. 两种海况取平均后，甲为92%，乙为86%；比较整体平均值",
      "答案：A。题目要判断的是海浪从平静变强后，各平台受到多大影响。甲从96%降到88%，下降8个百分点；乙从94%降到78%，下降16个百分点，所以比较各自前后的变化最直接。B能说明较强海况下甲表现更高，却没有扣除两者原本2个百分点的差别；C能比较整体表现，但把平静和较强海况合在一起，不能单独量出海浪变强带来的影响。三种计算都正确，A回答的问题最准确。",
      4,
      "difference-comparison"
    );
  }

  if (/大明山纤树蛙|Gracixalus.*daminghanus/.test(newsText) && /16S rRNA|鸣声|新物种/.test(newsText)) {
    add(
      "daming-mountain-frog-evidence-chain-3",
      ["动物分类", "科学", "证据"],
      "资料题：研究人员怀疑大明山的一群树蛙是新物种，而不是近缘种在当地形成的普通差异。他们需要同时判断：身体特征差异是否稳定、是否形成独立的进化分支、求偶鸣声是否不同。下面三组方案都能增加证据，哪一组对这三个判断的检验最完整？\nA. 测量30只大明山种群和30件近缘种馆藏标本的身体特征；分析大明山种群的16S序列；把野外录到的两种鸣声进行比较\nB. 在同一季节分别记录大明山种群和两个近缘种各30只；按同一标准测量身体特征、比较16S关系树，并在相近温度下录音比较鸣声\nC. 连续三年记录60只大明山种群和5只近缘种；比较身体特征、全基因组和鸣声，并核对它们出现的海拔与森林类型",
      "答案：B。它给大明山种群和两个近缘种安排了数量相近的样本，用同一标准比较身体特征和16S关系树，还控制了会影响蛙类鸣声的季节与温度，因此三类证据都能公平对照。A能检验身体特征，也有遗传和鸣声资料，但16S没有近缘种作同批比较，野外鸣声还可能受到温度差异影响。C有多年记录和更详细的基因资料，却只有5只近缘种，样本差距较大，较难判断观察到的差别是否稳定。三组方案都有价值，B的对照条件最完整。",
      4,
      "comparative-evidence"
    );
  }

  if (/高温.*(?:健康|中暑)|防暑.*(?:预警|大型活动)/.test(newsText) && /世界卫生组织|世卫组织|WHO/.test(newsText)) {
    add(
      "heat-warning-matched-event-evidence-1",
      ["健康", "科学", "证据"],
      "资料题：为了判断提前发布高温预警本身能不能减少中暑，研究人员设计了三种比较方案。哪一种最能把气温、活动类型和其他防暑措施的影响分开？\nA. 在10场相似活动中，各找两个人数接近的区域；同一场的气温、遮阳和补水安排相同，一个区域提前收到预警并调整休息，另一个区域保持原安排，再比较每1000人的中暑人数\nB. 收集100场有预警和100场无预警的活动，计算每1000人的中暑人数；有预警的一组大多处在更热的天气\nC. 比较同一批活动今年和去年的中暑人数；今年同时增加预警、遮阳棚和补水点，去年保持原安排",
      "答案：A。它在同一场活动中让气温、活动类型、遮阳和补水尽量相同，主要比较是否提前预警并调整休息，因此更容易判断预警本身的作用。B的样本多，但两组天气冷热不同，原本的中暑风险就不一样；C比较了同一批活动，却同时改变了预警、遮阳和补水，无法把变化单独归给预警。三种方案都有参考价值，A对题目要判断的原因控制得最完整。",
      4,
      "comparative-evidence"
    );
  }

  if (/区块链即服务|区块链国际标准/.test(newsText) && /国际标准化组织|ISO/.test(newsText)) {
    add(
      "blockchain-standard-interface-cost",
      ["数学", "科技", "标准"],
      "资料题：甲、乙、丙、丁、戊五个平台要交换产品溯源记录。旧方案中，每两个平台之间都单独开发一套转换接口，每套需要8人日。采用共同标准后，每个平台只开发一套标准接口，每套仍需8人日，另外共同测试工具需要10人日。只比较题目列出的开发量，哪项计算正确？\nA. 旧方案需要80人日，新方案需要50人日，共节省30人日，减少37.5%\nB. 旧方案需要160人日，新方案需要50人日，共节省110人日，减少68.75%\nC. 旧方案需要80人日，新方案需要40人日，共节省40人日，减少50%",
      "答案：A。五个平台两两配对，共有5×4÷2=10对，旧方案需要10×8=80人日。新方案需要5×8+10=50人日，节省80-50=30人日；用旧方案作基准，30÷80=37.5%。B把同一对平台的接口重复计算了，C漏算了共同测试工具。真实工程还要看维护和安全成本，这里只按题目给出的开发量比较。",
      4,
      "difference-comparison"
    );
  }

  if (/科学教育.*做中学|做中学.*科学教育/.test(newsText) && /义务教育|教育部/.test(newsText)) {
    add(
      "science-learning-difference-in-differences-2",
      ["科学教育", "数学", "证据"],
      "资料题：为了评估“做中学”科学课程的效果，研究人员记录两组条件相近学校的科学探究平均分。甲组采用新课程，实施前72分、实施后82分；乙组暂未采用，实施前74分、实施后78分。假设同一时期其他变化对两组影响相近，下面哪种计算更合理？\nA. 用甲组实施后82分减乙组实施后78分，估计额外提升4分\nB. 用甲组前后提升10分减乙组同期提升4分，估计额外提升6分\nC. 用甲组实施后82分减甲组实施前72分，估计额外提升10分",
      "答案：B。甲组前后提高82-72=10分，但乙组在同一时期也提高78-74=4分，这4分可能来自共同的课程进度、练习或其他环境变化。再计算10-4=6分，能把两组共同变化先扣除，更接近新课程的额外效果。A只比较实施后的分数，忽略两组起点不同；C只看甲组前后变化，忽略同期其他因素。这个估计还依赖题目给出的假设，真实评估还要检查两组是否真的可比。",
      4,
      "difference-comparison"
    );
  }

  if (/铪-153|HIAF.*新核素|新核素.*铪/.test(newsText) && /10个|10 个/.test(newsText)) {
    add(
      "hafnium153-background-identification-chain",
      ["核物理", "实验", "证据"],
      "资料题：HIAF实验观测到10个铪-153候选离子。研究人员还要同时判断两件事：这些信号不是仪器背景，而且它们确实属于铪-153。下面三套检验都能增加证据，哪一套对这两个判断覆盖得最完整？\nA. 关闭粒子束做空白测量，再多次重复原实验，检查候选信号在束流和靶材同时工作时能否稳定重现\nB. 用已知的邻近核素校准仪器，空白测量中没有候选信号，并要求候选离子的运动周期和质荷比同时符合铪-153的预测\nC. 让另一座实验装置用不同反应产生候选离子，核对两边测得的质量范围，并检查候选数是否随束流增强而增加",
      "答案：B。空白测量没有候选信号，能检查它是否来自仪器背景；已知核素校准后，再让运动周期和质荷比两个独立特征同时符合预测，能进一步判断它是不是铪-153，因此两项任务都覆盖得最完整。A对排除背景和检验可重复性很有帮助，但仍缺少独立的身份特征。C增加了跨装置重复和数量变化的证据，但只比较较宽的质量范围，仍可能混入邻近核素。三套方案都有价值，差别在于证据链是否同时回答了两个问题。",
      4,
      "causal-evidence"
    );
  }

  if (/天然膜环境|完整水稻叶绿体|原位冷冻电镜/.test(newsText) && /光合作用|光系统/.test(newsText)) {
    add(
      "photosynthesis-assembly-data",
      ["植物", "科学", "数据"],
      "资料题：研究团队想判断“提纯步骤会让一部分光合作用复合物的高阶组装散开”。为了练习证据推理，他们把同一批水稻叶绿体随机分成三组，并用相同分辨率各观察100个视野：甲组保留天然膜直接冷冻，68个视野有高阶组装；乙组用温和方法提纯，45个视野有高阶组装；丙组用较强方法提纯，18个视野有高阶组装。只根据这组练习数据，判断下面三句话：①提纯可能减少观察到高阶组装的机会；②处理越强，观察到高阶组装的比例越低；③天然膜环境是造成三组差异的唯一原因。哪些判断有数据支持？\nA. 比较三组数据后，①和②有支持，③还不能确定\nB. 比较三组数据后，①和③有支持，②还不能确定\nC. 比较三组数据后，②和③有支持，①还不能确定",
      "答案：A。三组观察条件相近，提纯组的高阶组装比例从68%降到45%和18%，所以①有支持；温和提纯比强提纯保留得更多，所以②也有支持。数据只显示三组存在相关变化，还不能排除提纯过程中的其他差别，因此不能断定天然膜环境是唯一原因，③没有得到充分支持。",
      4,
      "difference-comparison"
    );
  }

  if (/第十二批国家组织药品|65种药品/.test(newsText) && /327家企业/.test(newsText) && /521个产品/.test(newsText)) {
    add(
      "drug-procurement-pigeonhole",
      ["药品", "数学", "逻辑"],
      "资料题：第十二批国家药品集采中，521个产品来自327家企业，覆盖65种药品。只根据这三个数量，可以作出下面三个判断：①至少有一家企业不止一个产品拟中选；②至少有一种药品不止8个产品拟中选；③至少有一家企业在两种不同药品中都有产品拟中选。下面哪种判断一定正确？\nA. 比较产品数与企业数、药品种类数后，可以确定①和②\nB. 比较产品数与企业数、药品种类数后，可以确定①和③\nC. 比较产品数与企业数、药品种类数后，可以确定②和③",
      "答案：A。521个产品分给327家企业，即使先让每家只有1个，仍会多出194个，所以①一定成立。521个产品分到65种药品中，如果每种最多8个，总数最多是520个，因此至少有一种达到9个，②也一定成立。一个企业的多个产品可能属于同一种药品，所以只靠这些数量不能确定③。",
      4,
      "difference-comparison"
    );
  }

  if (/全球.*饥饿|饥饿人口/.test(newsText) && /6\.45亿/.test(newsText) && /1400万/.test(newsText) && /4300万/.test(newsText)) {
    add(
      "global-hunger-back-calculation",
      ["数学", "国际", "数据"],
      "计算推理题：报告估计，2025年全球约有6.45亿人面临饥饿，比2024年减少约1400万人，比2022年减少约4300万人。根据这组数量关系，2024年和2022年面临饥饿的人数分别约有多少？\nA. 2024年约6.59亿人，2022年约6.88亿人\nB. 2024年约6.59亿人，2022年约7.02亿人\nC. 2024年约6.31亿人，2022年约6.02亿人",
      "答案：A。1400万人是0.14亿人，4300万人是0.43亿人。因为2025年人数比前两年少，所以要把减少量加回去：6.45+0.14=6.59亿，6.45+0.43=6.88亿。",
      4,
      "difference-comparison"
    );
  }

  if (/菲尔兹奖/.test(newsText) && /未满40岁|未满 40 岁/.test(newsText)) {
    add(
      "fields-medal-age-date",
      ["数学", "日期", "科学"],
      "资料题：菲尔兹奖每4年颁发一次，2026年的颁奖日是7月24日，获奖者在颁奖时必须未满40岁。下一届颁奖日按2030年7月24日计算。小林出生于1990年7月25日，小周出生于1990年7月23日，小陈出生于1991年8月20日。暂不考虑研究成果，按年龄条件判断，哪两人在下一届颁奖日仍符合要求？\nA. 按相同年龄规则，小林和小周符合\nB. 按相同年龄规则，小林和小陈符合\nC. 按相同年龄规则，小周和小陈符合",
      "答案：B。到2030年7月24日，小林还差1天才满40岁，小陈也未满40岁，所以两人符合年龄条件；小周已经在7月23日满40岁，不符合“未满40岁”。判断年龄不能只用2030减出生年份，还要比较生日和颁奖日的先后。",
      4,
      "difference-comparison"
    );
  }

  if (/国际红树林中心|红树林保护/.test(newsText)) {
    add(
      "mangrove-restoration-budget",
      ["生态", "数学", "数据"],
      "资料题：国际红树林中心要比较四个小型修复方案。为了练习数据推理，先规定“预计有效修复面积=计划面积×预计成活率”，预算最多10万元。甲：3公顷、80%、4万元；乙：4公顷、70%、5万元；丙：3.5公顷、90%、6万元；丁：3公顷、90%、5万元。如果只能从下面三种组合中选一种，哪种判断最合理？\nA. 选择甲、乙两个方案，总费用9万元\nB. 选择甲、丙两个方案，总费用10万元\nC. 选择乙、丁两个方案，总费用10万元",
      "答案：B。四个方案的预计有效修复面积分别是：甲3×80%=2.4公顷，乙4×70%=2.8公顷，丙3.5×90%=3.15公顷，丁3×90%=2.7公顷。甲加乙是5.2公顷，甲加丙是5.55公顷，乙加丁是5.5公顷；三组都没有超过预算，甲加丙的预计有效修复面积最大。真实修复还要考虑位置、物种和长期监测，这里只按题目给出的规则比较。",
      4,
      "rate-comparison"
    );
  }

  if (/卫星.*盐度|海表盐度|盐度观测/.test(newsText) && /海温预报|海表温度/.test(newsText)) {
    add(
      "ocean-salinity-time-shuffle-test",
      ["海洋", "科学", "数据"],
      "资料题：研究发现，加入真实海水盐度变化后，模型预报海温更准确。要进一步判断“盐度变化本身确实提供了有用线索”，下面哪种测试最有说服力？\nA. 把新模型和几年前的旧模型比较；新模型加入盐度，旧模型只用海温，但两者的结构和训练年份不同\nB. 在多雨季节测试加入盐度的模型，在少雨季节测试不加盐度的模型，再比较两个季节的平均误差\nC. 使用相同模型和同一批海温资料，一组加入按时间排列的真实盐度，另一组加入顺序被打乱的同一批盐度；在多个时段重复比较误差",
      "答案：C。两组使用相同模型、海温资料和盐度数值，主要差别是盐度的时间顺序是否真实。如果真实顺序在多个时段都带来更小误差，就更能说明盐度变化包含可用于预报的信息。A 同时改变了模型和年份；B 同时改变了季节，都难以单独判断盐度的作用。",
      4,
      "comparative-evidence"
    );
  }

  if (/渤海/.test(newsText) && /溶解性无机氮|DIN/.test(newsText)) {
    add(
      "bohai-river-input-evidence-chain",
      ["渤海", "环境", "证据"],
      "资料题：研究发现，渤海的溶解性无机氮总体改善，但部分河口仍在升高。研究小组提出“丰水期河流带入的含氮物质，是部分河口升高的重要原因”。下面三种方案都能收集有用资料，哪一种最能直接检验这条完整的原因链？\nA. 在多个河口连续几年按月测量海水氮浓度和浮游植物数量，并比较丰水期、枯水期以及河口内外的差别\nB. 在多条入海河流连续几年测量流量和含氮物质总量，并比较丰水期、枯水期以及不同河流的差别\nC. 在同一批河口和入海河流连续几年同步测量河流流量、河流氮通量和河口海水氮浓度，并比较丰水期、枯水期以及河口内外的变化",
      "答案：C。这个说法包含两端：河流在丰水期带入多少含氮物质，以及河口海水氮浓度是否随之变化。C在同一时间、同一批地点同步测量两端，还比较季节和河口内外，能检查它们是否一起变化。A能看清河口结果，却没有直接测河流输入；B能看清河流输入，却没有同步核对河口结果。A、B都不是无用资料，只是各自缺少原因链的一端。",
      4,
      "causal-evidence"
    );
  }

  if (/二氧化氮|NO2/.test(newsText) && /传感器|检测/.test(newsText)) {
    add(
      "no2-sensor-retention-comparison",
      ["数学", "科技", "数据"],
      "资料题：为了比较三种二氧化氮传感器，研究人员记录了相同气体浓度下的响应值。甲第1天为100，30天后为91；乙第1天为80，30天后为76；丙第1天为120，30天后为108。规定“长期稳定性”看30天后保留了最初响应的百分比，“最终响应强度”看30天后的实际数值。下面哪项判断同时正确？\nA. 丙的最终响应强度最高，甲的长期稳定性最好\nB. 丙的最终响应强度最高，乙的长期稳定性最好\nC. 甲的最终响应强度最高，乙的长期稳定性最好",
      "答案：B。30天后的实际响应值是甲91、乙76、丙108，所以丙的最终响应强度最高。保留比例分别是甲91÷100=91%，乙76÷80=95%，丙108÷120=90%，所以乙的长期稳定性最好。同一组数据要先分清比较的是实际数值还是比例。",
      4,
      "rate-comparison"
    );
  }

  if (/景德镇/.test(newsText) && /瓷业|瓷器|世界遗产/.test(newsText)) {
    add(
      "jingdezhen-production-trade-evidence-chain",
      ["景德镇", "历史", "证据"],
      "资料题：研究者要检验“景德镇在古代形成了从本地原料、规模生产到海外贸易的完整瓷业链”这个说法。下面三组证据都与瓷业有关，哪一组对这句话的三个环节支持得最完整？\nA. 资料包括：矿址原料与古瓷胎成分吻合；窑址有连续年代的废瓷层；本地商人会馆记录了行业分工\nB. 资料包括：矿址原料与古瓷胎成分吻合；窑址有连续年代的废瓷层；海外沉船瓷器的成分和工艺与景德镇产品吻合\nC. 资料包括：窑址有连续年代的废瓷层；海外沉船发现景德镇风格瓷器；外国还发现模仿这种纹样的瓷器",
      "答案：B。原料与瓷胎成分吻合，支持“本地原料”；连续年代的窑址废瓷层，支持“持续且有规模的生产”；海外沉船瓷器的成分和工艺吻合，支持“产品进入海外贸易”。A 的会馆记录能说明本地组织，却没有直接连接海外贸易；C 能说明生产和海外传播，却缺少原料来自本地的证据。",
      4,
      "comparative-evidence"
    );
  }

  if (/轴承/.test(newsText) && /亮蚀区|滚动接触疲劳/.test(newsText)) {
    add(
      "bearing-fatigue-controlled-evidence",
      ["轴承", "科学", "实验"],
      "资料题：研究者想判断轴承钢里的“亮蚀区”是不是循环滚动应力造成的，而不是酸液本身制造出来的。下面哪组实验最能帮助判断？\nA. 同一种轴承钢分成循环加载组和未加载组，再用同一种酸液处理相同时间；比较亮蚀区是否仅出现在加载组，并核对它的位置是否接近最大应力深度\nB. 同一种轴承钢都先循环加载，一组用甲酸液处理，另一组用乙酸液处理相同时间；比较两组亮蚀区的位置和宽度\nC. 高温轴承钢先循环加载，普通轴承钢不加载，再用同一种酸液处理相同时间；比较两种钢里有没有亮蚀区",
      "答案：A。它保持钢材和酸液处理相同，主要改变有没有经历循环加载；同时还核对亮蚀区是否出现在最大应力附近。B 能检查不同酸液的显示效果，却没有未加载对照；C 同时改变了钢材种类和加载条件，难以分清亮蚀区由哪一个差别造成。",
      4,
      "control-variable"
    );
  }

  if (/空气质量|PM2\.5/.test(newsText) && /优良天数|地表水/.test(newsText)) {
    add(
      "air-quality-multiple-indicators",
      ["环境", "科学", "数据"],
      "资料题：半年监测显示，京津冀及周边“2+36”城市的空气质量优良天数比例同比增加2.9个百分点，同时PM2.5平均浓度同比上升10.6%。对这两个结果，哪种解释更严谨？\nA. 优良天数比例上升更能代表半年趋势，因此应把PM2.5平均浓度上升理解为短期波动\nB. 两个指标关注的角度不同，两种变化可能同时出现，还要结合每天的浓度分布和其他污染物继续解释\nC. PM2.5平均浓度上升更能代表整体状况，因此优良天数比例增加不足以改变区域变差的判断",
      "答案：B。优良天数比例统计达到空气质量标准的天数，PM2.5平均浓度计算一段时间里的浓度平均值。如果一些日子从污染变为优良，而少数高浓度日子的数值又升高，这两个指标就可能朝不同方向变化。把每天的浓度分布和其他污染物一起看，才能解释半年里究竟发生了什么。",
      4,
      "rate-comparison"
    );
  }

  if (/反网络暴力法|网络暴力/.test(newsText)) {
    add(
      "cyberbullying-alert-weighted-errors",
      ["数学", "网络安全", "数据"],
      "资料题：平台用200条已核实的信息比较三版网络暴力预警模型，其中100条确有网暴，100条是正常讨论。规定：漏掉1条网暴信息记2分，把1条正常讨论误报为网暴记1分，风险分越低越好。根据这些数据，哪一版的风险分最低？\nA. 甲版资料：识别出96条网暴信息，误报20条正常讨论\nB. 乙版资料：识别出91条网暴信息，误报8条正常讨论\nC. 丙版资料：识别出94条网暴信息，误报13条正常讨论",
      "答案：C。甲版漏掉4条，风险分是4×2+20=28分；乙版漏掉9条，风险分是9×2+8=26分；丙版漏掉6条，风险分是6×2+13=25分。丙版的风险分最低。判断预警模型不能只看识别数量或误报数量，要按同一规则把两类错误一起比较。",
      4,
      "difference-comparison"
    );
  }

  if (isWaterIceStructureStory(newsText)) {
    add(
      "water-ice-independent-validation",
      ["科学", "水", "证据"],
      "资料题：科学家提出甲、乙两个水分子模型。要判断哪个模型更准确，下面哪种检验最有说服力？\nA. 先让两个模型预测几种温度下的氢原子位置和氢键长度，再用没有参与模型调整的独立实验数据比较预测误差\nB. 用同一组实验数据反复调整两个模型，直到两者都能很好地重现这组数据，再比较谁的计算速度更快\nC. 只选一种温度，把同一个样品重复测量很多次，再比较两个模型给出的平均结果",
      "答案：A。更有力的检验是先作预测，再用没有参与模型调整的独立实验数据核对。这样能看出模型能不能解释新的情况；反复贴合原来的数据或只检查一种温度，证据范围都更窄。",
      4,
      "comparative-evidence"
    );
  }

  if (/人工智能.*(?:炼铝|制磷|炮制中药)|(?:炼铝|制磷).*人工智能/.test(newsText)) {
    add(
      "industrial-ai-energy-evaluation",
      ["人工智能", "工业", "科学"],
      "资料题：假设一家炼铝厂启用 AI 调节设备后，报告说每吨铝用电更少。要判断节电主要是不是 AI 带来的，哪种比较最有说服力？\nA. 比较工厂启用 AI 前后两个月的总用电量，同时记录每个月的铝产量和天气变化\nB. 选择设备、原料和产量相近的两条生产线，在同一时期分别用 AI 和原方法调节，多次比较每吨铝的用电量\nC. 比较这家工厂启用 AI 后的每吨用电量和全行业上一年的平均值，同时记录两边采用的设备类型",
      "答案：B。两条生产线在同一时期运行，并尽量保持设备、原料和产量相近，能减少其他因素的干扰。前后两个月可能受到产量和天气变化影响；和上一年的行业平均值相比，也可能混入工厂、设备和时间差异。",
      4,
      "comparative-evidence"
    );
  }

  if (isPlantRootAvoidanceStory(newsText)) {
    add(
      "plant-root-acid-gradient",
      ["植物", "科学", "实验"],
      "资料题：科学家发现植物根会避开腐烂植物周围的酸性区域。要判断根是不是根据酸性强弱改变方向，下面哪组实验最有说服力？\nA. 用同一种幼苗，在其他条件相同时只设置酸性梯度；记录根的弯曲方向，再把梯度方向调换后重复实验\nB. 用相同数量的幼苗，一组靠近腐烂植物，一组放在普通土壤中；几天后比较两组根的平均长度\nC. 用不同种类的幼苗，分别种在酸性不同的土壤中；几天后比较它们最终的根系形状",
      "答案：A。它把其他条件尽量保持相同，主要改变酸性梯度，还通过调换方向重复验证。靠近腐烂植物后只比较根长，不能直接判断弯曲方向由酸性梯度决定；同时改变植物种类和酸性，也难以分清原因。",
      4,
      "control-variable"
    );
  }

  if (isHighAltitudeAtmosphereDroneStory(newsText)) {
    add(
      "high-altitude-drone-height-difference",
      ["数学", "无人机", "大气"],
      "计算推理题：一架无人机从海拔 5200 米处起飞，先到 6500 米，再到 7600 米，最后到 8861 米。假设其他条件相同，按高度差判断，哪一段上升得最多？\nA. 从 7600 米到 8861 米，上升 1261 米\nB. 从 6500 米到 7600 米，上升 1100 米\nC. 从 5200 米到 6500 米，上升 1300 米",
      "答案：C。三段高度差分别是 1300 米、1100 米和 1261 米。1300 米最大，所以第一段上升得最多；不能只看最后到达的高度。",
      4,
      "difference-comparison"
    );
  }

  if (isDisasterPreventionTechnologyStory(newsText) || /防减救灾|拼体力.*拼算力|卫星.*无人机/.test(newsText)) {
    add(
      "disaster-warning-evidence",
      ["科技", "防灾", "证据"],
      "资料题：一套AI防汛系统会发出积水预警。要判断这些预警是否可靠，下面哪组记录最有用？\nA. 预警总数、摄像头覆盖数量、系统每天运行时长\nB. 每次预警与现场核查结果、漏报和误报次数、从发现到通知的用时\nC. 每场雨的降雨量、实际积水点数量、救援队到达现场的用时",
      "答案：B。它把每次预警和现场事实一一核对，还记录漏报、误报和通知速度，能同时判断准确性与及时性。只统计预警数量和设备规模，不能说明每条预警是否准确；只记录灾情和救援，也没有把预警与现场事实逐条对应。",
      4,
      "comparative-evidence"
    );
  }

  if (isHighSpeedRail385TestStory(newsText)) {
    add(
      "high-speed-rail-ratio-2",
      ["数学", "高铁", "交通"],
      "计算推理题：西康高铁的设计运营速度是每小时350公里，测试列车跑到每小时385公里。测试速度比设计速度高百分之多少？请用设计速度作比较基准。\nA. 5%，比较速度差35和两种速度之和700\nB. 10%，比较速度差35和设计速度350\nC. 约9.1%，比较速度差35和测试速度385",
      "答案：B。先算速度差：385-350=35；题目指定用设计速度作基准，所以35÷350=10%。另外两个百分比的计算各有自己的分母，但没有使用题目指定的比较基准。",
      4,
      "difference-comparison"
    );
  }

  if (isStudentRailTicketStory(newsText)) {
    add(
      "student-ticket-reservation-evidence",
      ["交通", "数学", "证据"],
      "资料题：有人说，学生预约购票能减少反复刷票花费的时间。下面哪种测试最能支持这个说法？\nA. 比较两种购票方式：找出行日期和路线相近的学生，一组使用预约购票，一组使用普通购票，多次记录每人操作的分钟数和购票结果\nB. 只记录使用预约购票的学生一周内提交了多少订单、成功买到多少张票，再计算平均成功率\nC. 比较今年使用预约购票的学生和去年普通购票的学生，记录两年各自的平均操作时间和列车数量",
      "答案：A。两组学生的出行日期和路线相近，并在同一时期比较两种购票方式，能减少车票供给和时间变化带来的干扰。只看预约用户缺少对照；跨年份比较会混入列车数量等变化。",
      4,
      "comparative-evidence"
    );
  }

  if (/光伏|太阳能/.test(newsText) && /清扫|灰尘|机器人|发电/.test(newsText)) {
    add(
      "solar-cleaning",
      ["能源", "机器人", "科技"],
      "新闻题：光伏板表面积灰后，为什么可能会影响发电？\nA. 灰尘挡住一部分阳光，光伏板接收到的光能减少\nB. 灰尘让光伏板表面温度更稳定，所以输出电量会降低\nC. 灰尘改变了电站维护频率，发电变化主要来自人工巡检",
      "答案：A。光伏板要接收阳光才能发电，灰尘挡住一部分阳光，发电效率就可能下降。"
    );
  }
  if (/AI|人工智能|大数据/.test(newsText) && /教育|教学|学校|课堂|学习/.test(newsText)) {
    if (/机器人学校|机器人.*开学|背答案.*会解题|机器人上学/.test(newsText)) {
      add(
        "robot-school-evidence",
        ["机器人", "AI", "证据"],
        "资料题：一台机器人在训练场里能完成搬箱子任务。要判断它能不能真的去仓库帮忙，最应该继续看哪类证据？\nA. 在不同箱子、路线和光线条件下反复测试，并记录成功率和错误原因\nB. 以第一次完整表演为主要依据，再安排到小范围真实仓库试用\nC. 比较它和另一台机器人的外形、重量和电池大小，再决定谁更适合上岗",
        "答案：A。真实场景会有变化，判断机器人是否可靠，要看多次测试、不同条件、成功率和错误原因，而不是只看一次表演或外形。",
        4
      );
    }
    add(
      "ai-education-check",
      ["AI", "教育", "科技"],
      "资料题：一所大学新建人工智能学院。要判断它是不是认真培养 AI 人才，最应该先看哪类证据？\nA. 课程是否包含数学、计算机、真实项目和技术安全，并能看到学生怎样验证作品\nB. 学院介绍里列出的热门方向是否很多；如果方向覆盖较全，就先判断课程质量较高\nC. 第一年的报名人数和社会关注度是否很高；如果热度高，就把它作为培养质量的主要依据",
      "答案：A。判断一个新学院不能只看名字或人数，还要看课程、实践项目、验证方法和安全责任是否真的支撑人才培养。",
      4
    );
  }
  if (isHeterogeneousComputingArkStory(newsText)) {
    add(
      "ai-platform-migration",
      ["AI", "工程", "证据"],
      "资料题：一个 AI 程序原来在 A 芯片上能正确运行，现在要迁移到 B 芯片。工程师最应该先做什么，才能判断“迁移成功”？\nA. 用同一批测试数据分别在 A、B 芯片上运行，比较结果是否一致，再记录速度和稳定性\nB. 在 B 芯片上跑一批新测试题，如果答案表现接近预期，就先判断迁移可用\nC. 比较 B 芯片的运行速度；如果速度提升明显，再安排后续正确性检查",
      "答案：A。迁移验证要有可比较的基准：同一批测试数据能检查结果是否一致，速度和稳定性则帮助判断新环境是否真的可用。",
      4
    );
  }
  if (/新闻发言人/.test(newsText) && /AI|人工智能/.test(newsText)) {
    add(
      "ai-news-release-check",
      ["AI", "证据", "社会"],
      "资料题：新闻发布会用 AI 先整理问答材料。下面哪种流程更可靠？\nA. AI 先整理资料，人再对照原始文件核对来源、数据和表达是否准确\nB. 人重点检查文字是否通顺，再抽查几处数据和出处是否一致\nC. 优先核对传播最广的一篇报道，再用它和 AI 整理结果互相印证",
      "答案：A。AI 可以提高整理速度，但新闻发布关系到公众了解事实，必须回到原始文件核对来源、数据和表达。",
      4
    );
  }
  if (/未来图书馆|全息书架|水族馆梦|智绘/.test(newsText)) {
    add(
      "future-library",
      ["教育", "科技", "文化"],
      "新闻题：未来图书馆的设计为什么不只是在“装修房间”？\nA. 它会影响人们阅读、交流和获取知识的方式\nB. 它主要改善空间气氛，让读者更愿意在馆内停留\nC. 它重点调整书架、座位和灯光，让借书路线更清楚",
      "答案：A。图书馆空间怎样设计，会影响人们愿不愿意停留、阅读、讨论和探索知识。"
    );
  }
  if (/高等教育展|去中国上大学|印尼学子|中英游学|游学领航|留学生|国际学生|英国大学生/.test(newsText)) {
    add(
      "international-education",
      ["教育", "全球", "文化"],
      "新闻题：国际学生交流最重要的意义之一是什么？\nA. 帮助不同文化的人互相理解和合作\nB. 让学生比较不同学校的课程、设施和城市环境\nC. 让学生获得更多旅行经历，并把见闻带回课堂分享",
      "答案：A。教育交流能让学生认识不同文化和学习方式，也为未来合作打下基础。"
    );
  }
  if (/太空算力|算力上天|算力卫星|卫星.*(?:太空处理|在轨处理|在轨计算)|(?:太空处理|在轨处理|在轨计算).*卫星/.test(newsText)) {
    add(
      "space-computing-warning-evidence",
      ["航天", "科技", "证据"],
      "资料题：有人说，让卫星先在太空处理图像，能更快发出森林火情预警。下面哪种测试最能支持这个说法？\nA. 选两颗型号相同的卫星观察同一片地区，甲先在太空筛选图像，乙把全部图像传回地面处理，多次记录从拍摄到发出正确预警的分钟数\nB. 只记录甲卫星一周内发出预警的次数和用时，再和地面人员过去一年的平均处理时间比较\nC. 让甲、乙卫星各观察一个地区，比较一次预警用时，同时记录两个地区的云量和地形差别",
      "答案：A。两颗卫星型号相同、观察同一地区，并且多次记录正确预警的用时，能尽量只比较处理方式。只看甲卫星缺少同条件对照；观察不同地区会混入云量和地形差别。",
      4,
      "comparative-evidence"
    );
  }
  if (/顾方舟|糖丸|疫苗|脊髓灰质炎|公共卫生/.test(newsText)) {
    add(
      "vaccine-public-health",
      ["健康", "科学", "社会"],
      "新闻题：疫苗对公共卫生最大的意义是什么？\nA. 帮助很多人提前获得保护\nB. 帮助医生更快发现病例，并安排后续治疗\nC. 降低一部分传播风险，同时减少某些检测压力",
      "答案：A。疫苗能让免疫系统提前认识危险，很多人接种后，疾病传播也更容易被控制。"
    );
  }
  if (/科普进校园|少年科创行|前沿科技|科普实践|科技馆/.test(newsText)) {
    add(
      "science-outreach",
      ["科普", "教育", "科技"],
      "新闻题：科普活动走进校园，最重要的价值是什么？\nA. 把抽象知识变成能观察、能体验的学习\nB. 增加校园活动的参与感，让孩子更愿意走进课堂\nC. 把展品带到学校附近，降低孩子接触展览的路程成本",
      "答案：A。科普活动能把知识和实验、展品、真实行业联系起来，帮助孩子理解科学怎样解决问题。"
    );
  }
  if (/创客|科创|创新|创意/.test(newsText) && /大赛|比赛|实践|高校|少年|英才|新点子/.test(newsText)) {
    add(
      "maker-competition",
      ["科创", "工程", "社会"],
      "新闻题：创客比赛最希望参赛者做到什么？\nA. 发现真实问题，再做出能说明想法的作品或方案\nB. 把作品名称、展示材料和讲解顺序设计得更清楚\nC. 让更多同学参加展示，形成更完整的团队分工",
      "答案：A。创客比赛重视把想法变成能展示、能验证的作品，让技术真正去解决问题。"
    );
  }
  if (/科创|创新|创意/.test(newsText) && /大赛|实践|高校|少年|英才|新点子/.test(newsText)) {
    add(
      "innovation-verify",
      ["科创", "科学", "工程"],
      "新闻题：科创比赛为什么常常强调“验证”？\nA. 看想法能不能解决真实问题\nB. 看作品展示是否清楚，让评委理解方案内容\nC. 看参赛团队是否分工完整，能把方案持续做下去",
      "答案：A。科创不只是提出点子，还要用调查、实验或作品证明这个点子真的有用。"
    );
  }
  if (/低空飞行器|无人机|低空/.test(newsText) && /巡检|救援|运输|制造业|交通/.test(newsText)) {
    add(
      "low-altitude-rules",
      ["交通", "科技", "规则"],
      "新闻题：低空飞行器用于救援、巡检或运输前，最需要配套什么？\nA. 安全规则和路线管理\nB. 更大的飞行规模，让更多任务能被同时安排\nC. 更高的飞行高度，让设备避开地面建筑和车辆",
      "答案：A。低空飞行器要和城市、道路、人员安全配合，规则和管理清楚后才更容易安全使用。"
    );
  }
  if (/新专业|专业/.test(newsText) && /关注|值得|大学|高校|学习|报考|人才/.test(newsText)) {
    add(
      "new-major-trend",
      ["教育", "社会", "科技"],
      "新闻题：学校设置新专业，通常说明什么？\nA. 社会出现了新的技术、职业或人才需求\nB. 学校希望把相近课程重新组合，方便学生选择方向\nC. 某些行业正在变化，学校先用新名称提醒学生关注",
      "答案：A。新专业常常和社会变化有关，说明未来可能需要更多懂新技术、会解决新问题的人。"
    );
  }

  if (/平台经济|平台.*(?:商家|订单|服务|共生|共赢)/.test(newsText)) {
    const rateVariants = [
      { orderUnit: 80, complaintUnit: 6 },
      { orderUnit: 100, complaintUnit: 7 },
      { orderUnit: 50, complaintUnit: 4 }
    ];
    const variant = Math.abs(dayIndex) % rateVariants.length;
    const { orderUnit, complaintUnit } = rateVariants[variant];
    const firstScale = 3 + (Math.abs(dayIndex) % 2);
    const secondScale = firstScale + 1;
    const firstOrders = orderUnit * firstScale;
    const secondOrders = orderUnit * secondScale;
    const firstComplaints = complaintUnit * firstScale;
    const secondComplaints = complaintUnit * secondScale;
    const orderDifference = secondOrders - firstOrders;
    const complaintDifference = secondComplaints - firstComplaints;
    const complaintRate = Number(((complaintUnit / orderUnit) * 100).toFixed(1));

    add(
      `platform-rate-comparison-${variant}`,
      ["数学", "平台经济", "数据"],
      `计算推理题：某服务平台比较甲、乙两周的订单数据。甲周处理 ${firstOrders} 笔订单，收到 ${firstComplaints} 次投诉；乙周处理 ${secondOrders} 笔订单，收到 ${secondComplaints} 次投诉。要公平比较两周的投诉情况，哪种判断更合理？\nA. 甲周表现更好；它的投诉总数比乙周少 ${complaintDifference} 次，订单数量差异不改变这个判断\nB. 乙周表现更好；它多处理 ${orderDifference} 笔订单，投诉增加 ${complaintDifference} 次，订单数量增长更值得参考\nC. 两周表现相同；每 ${orderUnit} 笔订单都对应 ${complaintUnit} 次投诉，按相同订单量比较后比例一样`,
      `答案：C。甲周投诉率是 ${firstComplaints}÷${firstOrders}=${complaintRate}%，乙周投诉率是 ${secondComplaints}÷${secondOrders}=${complaintRate}%。两周每 ${orderUnit} 笔订单都有 ${complaintUnit} 次投诉，所以投诉比例相同。订单总量不一样时，比较相同数量订单中的投诉次数，比直接比较投诉总数更公平。`,
      4,
      "rate-comparison"
    );
  }

  if (/轮轴机械|史前玉器|竹管.*(?:石英砂|磨料)|石英砂.*(?:竹管|玉)/.test(newsText)) {
    add(
      "jade-drilling-controlled-comparisons",
      ["考古", "物理", "实验"],
      "资料题：研究人员用相同玉料做三组实验，竹管大小、压力和实验时间都相同。甲组转动竹管，只加水，钻孔深0.4毫米；乙组转动竹管，加水和石英砂，钻孔深12.0毫米；丙组不转动竹管，加水和石英砂，钻孔深0.6毫米。下面哪种分析正确对应了两次对照比较？\nA. 甲、乙主要比较石英砂的作用，乙、丙主要比较转动的作用；数据支持石英砂和转动都对钻孔很重要\nB. 甲、丙主要比较石英砂的作用，乙、丙主要比较转动的作用；数据支持石英砂的作用比转动更重要\nC. 甲、乙主要比较转动的作用，甲、丙主要比较石英砂的作用；数据支持转动的作用比石英砂更重要",
      "答案：A。甲、乙只有是否加入石英砂不同，适合比较石英砂的作用；乙、丙只有竹管是否转动不同，适合比较转动的作用。甲、丙同时改变了两个条件，不能用来单独判断某一个因素。两次对照分别支持石英砂和转动都很重要，但这组数据不能直接证明哪一个因素绝对更重要。",
      4,
      "control-variable"
    );
  }

  return candidates;
}

const museumEncyclopedia = [
  { id: "museum-owl-ears", tags: ["动物", "博物"], text: "百科小知识：猫头鹰左右耳位置不完全对称，能帮助它更准确地判断声音来自哪里。" },
  { id: "museum-octopus-hearts", tags: ["动物", "海洋"], text: "百科小知识：章鱼有三个心脏，其中两个主要把血送到鳃，一个把血送到全身。" },
  { id: "museum-platypus", tags: ["动物", "博物"], text: "百科小知识：鸭嘴兽是会产卵的哺乳动物，这让它在动物世界里很特别。" },
  { id: "museum-pangolin", tags: ["动物", "博物"], text: "百科小知识：穿山甲身上的鳞片主要由角蛋白组成，和人的指甲、头发成分相近。" },
  { id: "museum-bat-echo", tags: ["动物", "声音"], text: "百科小知识：许多蝙蝠会发出高频声音，再根据回声判断昆虫和障碍物的位置。" },
  { id: "museum-whale-lung", tags: ["动物", "海洋"], text: "百科小知识：鲸鱼用肺呼吸，不是用鳃呼吸，所以必须定期浮上海面换气。" },
  { id: "museum-penguin", tags: ["动物", "地理"], text: "百科小知识：野生企鹅主要生活在南半球，北极没有自然分布的企鹅。" },
  { id: "museum-frog-skin", tags: ["动物", "身体"], text: "百科小知识：青蛙皮肤能帮助呼吸，也很怕干燥，所以很多青蛙喜欢潮湿环境。" },
  { id: "museum-bee-dance", tags: ["动物", "植物"], text: "百科小知识：蜜蜂会用摆尾舞告诉同伴食物的大致方向和距离。" },
  { id: "museum-butterfly-feet", tags: ["动物", "身体"], text: "百科小知识：蝴蝶的脚上有感受味道的结构，能帮助它判断叶子适不适合产卵。" },
  { id: "museum-ginkgo", tags: ["植物", "历史"], text: "百科小知识：银杏被称为活化石，它的祖先很早就出现在地球上。" },
  { id: "museum-bamboo-grass", tags: ["植物", "博物"], text: "百科小知识：竹子虽然长得像树，但从分类上看属于禾本科植物，也就是草本大家族。" },
  { id: "museum-cactus-spine", tags: ["植物", "地理"], text: "百科小知识：仙人掌的刺其实是叶子变化而来，能减少水分蒸发，也能保护自己。" },
  { id: "museum-lotus-leaf", tags: ["植物", "材料"], text: "百科小知识：荷叶表面有细小结构和蜡质层，水珠容易滚落，这叫荷叶效应。" },
  { id: "museum-moss-spore", tags: ["植物", "生命"], text: "百科小知识：苔藓不开花，也不结种子，常常用孢子来繁殖。" },
  { id: "museum-mangrove", tags: ["植物", "海洋"], text: "百科小知识：红树林能生活在海边潮间带，一些种类有特殊根系帮助呼吸和固定泥沙。" },
  { id: "museum-tree-ring", tags: ["植物", "博物"], text: "百科小知识：树木年轮的宽窄会受气候影响，科学家能用年轮研究过去的环境变化。" },
  { id: "museum-seed-bank", tags: ["植物", "农业"], text: "百科小知识：种子库像植物的保险箱，会保存不同植物种子，保护生物多样性。" },
  { id: "museum-amber", tags: ["地球", "博物"], text: "百科小知识：琥珀多由古代树脂形成，有些琥珀里会保存昆虫或植物碎片。" },
  { id: "museum-obsidian", tags: ["地球", "材料"], text: "百科小知识：黑曜石是一种火山玻璃，来自岩浆快速冷却后的天然玻璃质岩石。" },
  { id: "museum-pumice", tags: ["地球", "火山"], text: "百科小知识：浮石里有许多小孔，密度可能比水小，所以有些浮石能漂在水面上。" },
  { id: "museum-stalactite", tags: ["地球", "博物"], text: "百科小知识：钟乳石由含矿物质的水长期滴落形成，长得非常慢。" },
  { id: "museum-limestone", tags: ["地球", "海洋"], text: "百科小知识：许多石灰岩和古代海洋生物遗骸有关，能记录很久以前的海洋环境。" },
  { id: "museum-basalt", tags: ["地球", "火山"], text: "百科小知识：玄武岩常由火山熔岩冷却形成，颜色通常较深。" },
  { id: "museum-quartz", tags: ["地球", "材料"], text: "百科小知识：石英是地壳中常见矿物，玻璃、钟表和一些电子设备都可能用到它。" },
  { id: "museum-sandstone", tags: ["地球", "历史"], text: "百科小知识：砂岩由许多沙粒压实胶结而成，层理能记录沉积环境。" },
  { id: "museum-moon-air", tags: ["天文", "月亮"], text: "百科小知识：月球几乎没有空气，所以月面没有像地球这样被风吹动的天气。" },
  { id: "museum-mars-red", tags: ["天文", "地球"], text: "百科小知识：火星看起来偏红，和表面含铁矿物被氧化有关。" },
  { id: "museum-jupiter", tags: ["天文", "科学"], text: "百科小知识：木星是太阳系中最大的行星，主要由氢和氦等气体组成。" },
  { id: "museum-saturn-ring", tags: ["天文", "博物"], text: "百科小知识：土星环主要由冰块、岩石碎片和尘埃组成，远看像一圈明亮光带。" },
  { id: "museum-comet", tags: ["天文", "地球"], text: "百科小知识：彗星常被叫作脏雪球，含有冰、尘埃和岩石颗粒。" },
  { id: "museum-meteorite", tags: ["天文", "博物"], text: "百科小知识：流星体进入大气层会发光，落到地面后留下的石块叫陨石。" },
  { id: "museum-oracle", tags: ["历史", "文字"], text: "百科小知识：甲骨文刻在龟甲和兽骨上，是研究中国古文字和商代生活的重要资料。" },
  { id: "museum-bronze", tags: ["历史", "材料"], text: "百科小知识：青铜通常由铜和锡等金属组成，古人用它制作礼器、兵器和工具。" },
  { id: "museum-compass", tags: ["历史", "科技"], text: "百科小知识：指南针利用磁针指示方向，是中国古代重要发明之一。" },
  { id: "museum-printing", tags: ["历史", "技术"], text: "百科小知识：活字印刷把单个字块重复组合使用，比整版雕刻更灵活。" },
  { id: "museum-abacus", tags: ["历史", "数学"], text: "百科小知识：算盘通过珠子位置表示数字，是古人常用的计算工具。" },
  { id: "museum-sundial", tags: ["历史", "天文"], text: "百科小知识：日晷利用太阳影子的位置变化来估计时间，阴雨天就不太好用。" },
  { id: "museum-water-clock", tags: ["历史", "工程"], text: "百科小知识：漏刻是一种古代计时工具，利用水流变化来帮助记录时间。" },
  { id: "museum-paper-fiber", tags: ["历史", "材料"], text: "百科小知识：纸由细小纤维交织而成，纤维越均匀，纸面通常越平整。" },
  { id: "museum-magnet", tags: ["物理", "科学"], text: "百科小知识：磁铁周围有看不见的磁场，能吸引铁、镍等材料。" },
  { id: "museum-rainbow", tags: ["光", "天气"], text: "百科小知识：彩虹来自阳光在水滴中折射和反射，不同颜色的光被分开。" },
  { id: "museum-echo", tags: ["声音", "物理"], text: "百科小知识：回声是声音遇到墙壁、山谷等障碍物后反射回来形成的。" },
  { id: "museum-shadow", tags: ["光", "科学"], text: "百科小知识：影子是光被不透明物体挡住后形成的暗区，光源位置会影响影子方向。" },
  { id: "museum-density", tags: ["物理", "数学"], text: "百科小知识：密度表示单位体积里有多少物质，铁块比泡沫重通常和密度有关。" },
  { id: "museum-buoyancy", tags: ["物理", "海洋"], text: "百科小知识：物体在水里会受到向上的浮力，船能浮起来和浮力有关。" },
  { id: "museum-prism", tags: ["光", "科学"], text: "百科小知识：三棱镜能把白光分成多种颜色，说明白光里包含不同颜色的光。" },
  { id: "museum-electricity", tags: ["电", "科学"], text: "百科小知识：静电会让头发被梳子吸起来，是电荷聚集造成的现象。" },
  { id: "museum-coral", tags: ["海洋", "动物"], text: "百科小知识：珊瑚礁由许多珊瑚虫和它们形成的骨骼结构组成，是很多海洋生物的家。" },
  { id: "museum-tide", tags: ["海洋", "天文"], text: "百科小知识：潮汐主要受月亮引力影响，海边每天涨潮和退潮的时间会慢慢变化。" },
  { id: "museum-kelp", tags: ["海洋", "植物"], text: "百科小知识：海带和巨藻属于藻类，不像陆地植物那样有真正的根、茎、叶分工。" },
  { id: "museum-plankton", tags: ["海洋", "生命"], text: "百科小知识：浮游生物体型小，却是许多海洋食物链的重要起点。" },
  { id: "museum-ocean-pressure", tags: ["海洋", "物理"], text: "百科小知识：海水越深，压力越大，深海生物需要适应高压环境。" },
  { id: "museum-current", tags: ["海洋", "地球"], text: "百科小知识：洋流像海里的大河，会影响气候、鱼群分布和船只航行。" },
  { id: "museum-tooth-enamel", tags: ["身体", "健康"], text: "百科小知识：牙釉质是人体很硬的组织，但酸和细菌仍可能伤害牙齿。" },
  { id: "museum-blood-oxygen", tags: ["身体", "健康"], text: "百科小知识：红细胞里的血红蛋白能携带氧气，把氧气送到身体各处。" },
  { id: "museum-lung-alveoli", tags: ["身体", "健康"], text: "百科小知识：肺泡是肺里很小的气囊，氧气和二氧化碳主要在这里交换。" },
  { id: "museum-skin", tags: ["身体", "健康"], text: "百科小知识：皮肤是人体很大的器官，能保护身体、感受温度，也能减少水分流失。" },
  { id: "museum-smell-taste", tags: ["身体", "食物"], text: "百科小知识：吃东西觉得香不香，不只靠舌头，鼻子闻到的气味也很重要。" },
  { id: "museum-immune", tags: ["身体", "健康"], text: "百科小知识：免疫系统像身体里的守卫队，会识别并清除许多外来病原体。" },
  { id: "museum-camel-hump", tags: ["动物", "沙漠"], text: "百科小知识：骆驼的驼峰主要储存脂肪，不是直接装水，脂肪能在需要时提供能量。" },
  { id: "museum-shark-teeth", tags: ["动物", "海洋"], text: "百科小知识：许多鲨鱼一生会不断更换牙齿，旧牙掉落后新牙会慢慢补上。" },
  { id: "museum-elephant-ears", tags: ["动物", "身体"], text: "百科小知识：大象耳朵里有丰富血管，扇动耳朵能帮助身体散热。" },
  { id: "museum-gecko-feet", tags: ["动物", "材料"], text: "百科小知识：壁虎脚趾上有大量细小结构，能帮助它在墙面和玻璃上攀爬。" },
  { id: "museum-bird-bones", tags: ["动物", "飞行"], text: "百科小知识：许多鸟类骨骼比较轻，有些骨头内部有空腔，能减轻飞行负担。" },
  { id: "museum-snail-radula", tags: ["动物", "食物"], text: "百科小知识：蜗牛嘴里有像小锉刀一样的齿舌，能刮取植物或藻类。" },
  { id: "museum-ant-pheromone", tags: ["动物", "化学"], text: "百科小知识：蚂蚁会留下气味信息，同伴能沿着气味路线找到食物。" },
  { id: "museum-sea-otter-tool", tags: ["动物", "海洋"], text: "百科小知识：海獭会用石头敲开贝壳，是会使用简单工具的动物之一。" },
  { id: "museum-dolphin-sleep", tags: ["动物", "海洋"], text: "百科小知识：海豚睡觉时可以让一半大脑休息，另一半保持警觉来呼吸和游动。" },
  { id: "museum-horseshoe-crab-blood", tags: ["动物", "医学"], text: "百科小知识：鲎的血液呈蓝色，和里面含铜的运输氧气物质有关。" },
  { id: "museum-potato-stem", tags: ["植物", "食物"], text: "百科小知识：土豆不是植物的果实，而是地下茎膨大形成的块茎。" },
  { id: "museum-peanut-underground", tags: ["植物", "农业"], text: "百科小知识：花生开花后，果针会钻进土里，荚果就在地下慢慢长大。" },
  { id: "museum-young-sunflower", tags: ["植物", "光"], text: "百科小知识：年轻向日葵会随着太阳方向转动，成熟后花盘多朝向固定方向。" },
  { id: "museum-rice-grass", tags: ["植物", "农业"], text: "百科小知识：水稻属于禾本科植物，和小麦、玉米一样都属于草本植物大家族。" },
  { id: "museum-venus-flytrap", tags: ["植物", "动物"], text: "百科小知识：捕蝇草的叶片能合拢捕捉小昆虫，帮助它从昆虫身上获得养分。" },
  { id: "museum-pinecone-weather", tags: ["植物", "天气"], text: "百科小知识：松果鳞片在干燥时容易张开，潮湿时会合拢，和空气湿度有关。" },
  { id: "museum-cotton-fiber", tags: ["植物", "材料"], text: "百科小知识：棉花柔软的部分主要是种子表面的纤维，人们用它纺线织布。" },
  { id: "museum-banana-herb", tags: ["植物", "食物"], text: "百科小知识：香蕉植株看起来像树，但它没有真正木质树干，属于大型草本植物。" },
  { id: "museum-granite", tags: ["地球", "岩石"], text: "百科小知识：花岗岩常含石英、长石和云母，颗粒比较明显，常被用作建筑材料。" },
  { id: "museum-soil-layers", tags: ["地球", "植物"], text: "百科小知识：土壤里有矿物颗粒、腐殖质、空气和水分，植物根系就在这里生长。" },
  { id: "museum-earthquake-fault", tags: ["地球", "灾害"], text: "百科小知识：许多地震和地下断层突然错动有关，能量释放时地面会震动。" },
  { id: "museum-mountain-plates", tags: ["地球", "地理"], text: "百科小知识：一些高山来自板块长期挤压，岩层被推高后形成山脉。" },
  { id: "museum-river-delta", tags: ["地球", "水"], text: "百科小知识：河流入海处水流变慢，泥沙容易沉积，时间久了可能形成三角洲。" },
  { id: "museum-fossil-layer", tags: ["地球", "历史"], text: "百科小知识：化石常保存在沉积岩层里，岩层位置能帮助科学家判断先后年代。" },
  { id: "museum-glacier-valley", tags: ["地球", "冰川"], text: "百科小知识：冰川缓慢移动时会磨蚀地面，能把山谷刻成宽阔的 U 形。" },
  { id: "museum-groundwater", tags: ["地球", "水"], text: "百科小知识：地下水藏在土壤和岩石缝隙中，是许多井水和泉水的重要来源。" },
  { id: "museum-milky-way", tags: ["天文", "宇宙"], text: "百科小知识：银河系是一个巨大的星系，太阳和地球都在银河系里。" },
  { id: "museum-sunlight-minutes", tags: ["天文", "光"], text: "百科小知识：太阳光到达地球大约需要 8 分钟，所以我们看到的是几分钟前的阳光。" },
  { id: "museum-season-tilt", tags: ["天文", "地球"], text: "百科小知识：四季变化主要和地球自转轴倾斜有关，不是因为地球离太阳忽远忽近。" },
  { id: "museum-asteroid-belt", tags: ["天文", "行星"], text: "百科小知识：火星和木星轨道之间有许多小天体，这片区域常被叫作小行星带。" },
  { id: "museum-venus-day", tags: ["天文", "行星"], text: "百科小知识：金星自转非常慢，金星上的一天比它绕太阳一圈的时间还长。" },
  { id: "museum-crater-impact", tags: ["天文", "月亮"], text: "百科小知识：月球表面许多环形山来自陨石撞击，因为月球几乎没有大气保护。" },
  { id: "museum-sound-vacuum", tags: ["物理", "声音"], text: "百科小知识：声音需要空气、水或固体等介质传播，在真空里不能像光那样传播。" },
  { id: "museum-heat-transfer", tags: ["物理", "热"], text: "百科小知识：热量通常会从温度高的地方传到温度低的地方，直到差别变小。" },
  { id: "museum-lever", tags: ["物理", "工具"], text: "百科小知识：杠杆能通过改变用力位置和距离，让撬动物体变得更省力。" },
  { id: "museum-pulley", tags: ["物理", "工具"], text: "百科小知识：滑轮能改变用力方向，多个滑轮组合还可以帮助人们搬起重物。" },
  { id: "museum-mirror-reflection", tags: ["光", "物理"], text: "百科小知识：镜子反光时，入射光和反射光与镜面的夹角有规律地对应。" },
  { id: "museum-inertia", tags: ["物理", "运动"], text: "百科小知识：物体有保持原来运动状态的倾向，公交车突然刹车时人会向前晃。" },
  { id: "museum-small-intestine", tags: ["身体", "食物"], text: "百科小知识：小肠内壁有很多细小褶皱，能增加吸收营养的面积。" },
  { id: "museum-bone-marrow", tags: ["身体", "血液"], text: "百科小知识：骨头里面有骨髓，其中一部分骨髓能制造新的血细胞。" },
  { id: "museum-pupil", tags: ["身体", "光"], text: "百科小知识：瞳孔会根据光线强弱变大或变小，帮助控制进入眼睛的光量。" },
  { id: "museum-saliva", tags: ["身体", "食物"], text: "百科小知识：唾液能湿润食物，也含有帮助分解淀粉的物质。" },
  { id: "museum-inner-ear-balance", tags: ["身体", "感觉"], text: "百科小知识：内耳里有帮助感受身体位置变化的结构，和保持平衡有关。" },
  { id: "museum-red-blood-cell-shape", tags: ["身体", "血液"], text: "百科小知识：红细胞中间较薄，这种形状能帮助它通过细小血管并运输氧气。" },
  { id: "museum-silk", tags: ["历史", "材料"], text: "百科小知识：丝绸来自蚕吐出的丝，古人把蚕茧抽丝后织成柔软布料。" },
  { id: "museum-porcelain", tags: ["历史", "材料"], text: "百科小知识：瓷器需要用高温烧制，温度和原料会影响它的硬度和颜色。" },
  { id: "museum-zhangheng-seismoscope", tags: ["历史", "科学"], text: "百科小知识：张衡发明的候风地动仪，是中国古代记录地震方向的仪器。" },
  { id: "museum-canal-transport", tags: ["历史", "交通"], text: "百科小知识：运河能连接河流和城市，古代常用来运输粮食和货物。" },
  { id: "museum-woodblock-print", tags: ["历史", "技术"], text: "百科小知识：雕版印刷要先把整页文字刻在木板上，再刷墨印到纸上。" },
  { id: "museum-bronze-inscription", tags: ["历史", "文字"], text: "百科小知识：青铜器上的铭文能记录祭祀、战争和赏赐等古代事件。" },
  { id: "museum-glass", tags: ["材料", "科学"], text: "百科小知识：普通玻璃常由含硅砂等原料高温熔化后冷却形成。" },
  { id: "museum-rubber", tags: ["材料", "植物"], text: "百科小知识：天然橡胶来自橡胶树乳汁，弹性和里面长链状分子有关。" },
  { id: "museum-alloy", tags: ["材料", "金属"], text: "百科小知识：合金由两种或多种元素组成，常比单一金属更适合制造工具。" },
  { id: "museum-ceramic", tags: ["材料", "工程"], text: "百科小知识：陶瓷通常耐高温、硬度高，但受到猛烈撞击时容易破裂。" },
  { id: "museum-carbon-fiber", tags: ["材料", "科技"], text: "百科小知识：碳纤维又轻又强，常用于飞机、自行车和运动器材。" },
  { id: "museum-decomposer", tags: ["生态", "生命"], text: "百科小知识：蘑菇和许多细菌能分解落叶和枯木，把养分还给土壤。" },
  { id: "museum-wetland-filter", tags: ["生态", "水"], text: "百科小知识：湿地像天然海绵，能储存水分，也能帮助过滤部分污染物。" },
  { id: "museum-lichen", tags: ["生态", "植物"], text: "百科小知识：地衣不是一种单独植物，而是真菌和藻类等生物共同生活形成的。" },
  { id: "museum-food-chain-sun", tags: ["生态", "能量"], text: "百科小知识：许多食物链的能量最早来自太阳，植物先把阳光转化成养分。" },
  { id: "museum-camouflage", tags: ["生态", "动物"], text: "百科小知识：保护色能让动物更接近周围环境，帮助它躲避敌人或接近猎物。" },
  { id: "museum-fog", tags: ["天气", "水"], text: "百科小知识：雾是贴近地面的许多小水滴，会让远处景物看起来模糊。" },
  { id: "museum-dew", tags: ["天气", "水"], text: "百科小知识：夜晚物体表面变冷时，空气中的水蒸气可能凝结成露珠。" },
  { id: "museum-hail", tags: ["天气", "冰"], text: "百科小知识：冰雹常在强雷雨云里形成，冰粒被气流反复托起后越长越大。" },
  { id: "museum-snowflake", tags: ["天气", "冰"], text: "百科小知识：雪花常呈六角形，这和水分子结冰时的排列方式有关。" },
  { id: "museum-monsoon", tags: ["天气", "地理"], text: "百科小知识：季风会随季节改变主要风向，能影响一些地区的雨季和旱季。" },
  { id: "museum-salinity-density", tags: ["海洋", "物理"], text: "百科小知识：在温度相近时，海水含盐量越高，密度通常越大；盐度差会影响海水上下混合和流动。" },
  { id: "museum-rna-letters", tags: ["生命", "化学"], text: "百科小知识：RNA能保存和传递遗传信息，通常使用A、U、C、G四种“字母”，其中U叫尿嘧啶。" },
  { id: "museum-heritage-monitoring", tags: ["文化遗产", "历史"], text: "百科小知识：一处地点列入世界遗产名录后仍要持续监测，火灾、洪水、建设活动和游客压力都可能改变它的保存状况。" },
  { id: "museum-io-tidal-heating", tags: ["木星", "物理"], text: "百科小知识：木星等天体的引力会反复拉扯木卫一，岩石不断弯曲变形时会产生热量，这种现象叫潮汐加热。" },
  { id: "museum-binary", tags: ["数学", "科技"], text: "百科小知识：二进制主要用 0 和 1 表示信息，是许多电子计算设备的基础。" },
  { id: "museum-pi", tags: ["数学", "几何"], text: "百科小知识：圆周率表示圆的周长和直径的比值，常用希腊字母 π 表示。" },
  { id: "museum-prime", tags: ["数学", "数字"], text: "百科小知识：质数只有 1 和它本身两个正因数，2 是最小的质数。" },
  { id: "museum-rainfall-millimetre", tags: ["天气", "测量"], text: "百科小知识：降雨量1毫米，表示每平方米水平地面上平均落下约1升水；气象站会用雨量器收集并测量雨水。" },
  { id: "museum-plant-stomata", tags: ["植物", "生命"], text: "百科小知识：叶片上的气孔由一对保卫细胞围成，能调节二氧化碳进入和水蒸气离开。" },
  { id: "museum-fields-medal-archimedes", tags: ["数学史", "人物"], text: "百科小知识：菲尔兹奖奖章正面刻着古希腊数学家阿基米德的头像，奖项每4年颁发一次。" },
  { id: "museum-antikythera-gears", tags: ["科技史", "天文"], text: "百科小知识：安提基特拉机械由许多青铜齿轮组成，古人用它推算太阳、月亮和一些天象的周期。" },
  { id: "museum-fossil-pollen", tags: ["古生态", "植物"], text: "百科小知识：花粉外壁很耐保存，科学家会分析沉积物中的古花粉，推测过去生长过哪些植物和当时环境。" },
  { id: "museum-ink-stick-soot", tags: ["文房", "材料"], text: "百科小知识：古代墨块常把松烟或油烟等细小碳粒与胶混合制成，加水研磨后才能书写或绘画。" },
  { id: "museum-cuneiform-clay", tags: ["文字史", "考古"], text: "百科小知识：楔形文字常写在湿黏土板上，书写者用芦苇杆压出像楔子一样的笔画。" },
  { id: "museum-arch-compression", tags: ["建筑", "工程"], text: "百科小知识：拱桥会把上方重量沿弧形传向两侧桥墩，许多石拱因此能跨越较宽的河道。" },
  { id: "museum-nautilus-chambers", tags: ["海洋生物", "浮力"], text: "百科小知识：鹦鹉螺壳内有许多小室，它能调节小室里的气体和液体，帮助控制浮力。" },
  { id: "museum-trilobite-segments", tags: ["古生物学", "化石"], text: "百科小知识：三叶虫是已经灭绝的海洋动物，身体分成许多节，坚硬外壳比较容易形成化石。" },
  { id: "museum-longitude-chronometer", tags: ["航海史", "计时"], text: "百科小知识：远洋航海要确定经度，需要比较出发地时间和当地时间，准确航海钟因此非常重要。" },
  { id: "museum-coin-metal-analysis", tags: ["钱币学", "考古"], text: "百科小知识：古钱币的铭文、重量和金属成分，可以帮助研究者判断年代、铸造技术和贸易往来。" },
  { id: "museum-pottery-thermoluminescence", tags: ["考古科学", "测年"], text: "百科小知识：陶器受热烧制后会重新积累辐射能量，实验室再次加热时测量微弱发光，可以帮助估算它上次烧制的大致年代。" },
  { id: "museum-diatom-shells", tags: ["微体化石", "水环境"], text: "百科小知识：硅藻有像玻璃一样的微小外壳，不同种类喜欢不同水环境，沉积物里的硅藻能为过去的水质和气候留下线索。" },
  { id: "museum-lost-wax-casting", tags: ["铸造史", "工艺"], text: "百科小知识：失蜡法先做蜡模再包上耐火材料，熔掉蜡后把金属液倒进空腔，能铸出形状复杂、纹饰细致的器物。" },
  { id: "museum-obsidian-provenance", tags: ["考古科学", "火山岩"], text: "百科小知识：不同火山形成的黑曜石含有不同微量元素，研究者会比较古代石器的元素“指纹”，寻找原料来源和远距离交换线索。" },
  { id: "museum-palimpsest-multispectral", tags: ["古籍保护", "光学"], text: "百科小知识：覆写手稿把旧文字刮掉后再次书写，多光谱成像会利用墨迹和纸张在不同波长下反光不同，让肉眼难见的旧字重新显现。" },
  { id: "museum-tooth-enamel-isotopes", tags: ["生物考古", "地球化学"], text: "百科小知识：牙釉质形成后很少改变，其中锶、氧等同位素比例能与当地岩石和饮水比较，帮助推测人或动物小时候生活过的大致地区。" },
  { id: "museum-herbarium-label", tags: ["标本学", "植物"], text: "百科小知识：植物标本会把采到的植物压平、干燥并贴上地点和日期标签，研究者能比较不同时代的标本，追踪植物分布怎样变化。" },
  { id: "museum-magnetic-declination", tags: ["地磁学", "地理"], text: "百科小知识：指南针指向的磁北与地图上的正北通常并不完全重合，两者之间的夹角叫磁偏角，而且会随地点和时间缓慢改变。" },
  { id: "museum-papyrus-cross-layers", tags: ["书写材料史", "工艺"], text: "百科小知识：古埃及纸莎草纸会把植物茎里的薄片横竖交叠，再压紧、晾干；交叉排列能让书写材料在两个方向都更结实。" },
  { id: "museum-ice-core-air-bubbles", tags: ["冰川学", "古气候"], text: "百科小知识：积雪被一层层压成冰时，会封住当时空气的小气泡；科学家测量其中的二氧化碳，能比较古代大气和气候变化。" },
  { id: "museum-feather-barbules", tags: ["鸟类学", "结构"], text: "百科小知识：鸟的飞羽由许多羽枝和带小钩的羽小枝互相扣住，形成连续羽片；梳理羽毛能让松开的部分重新连接。" },
  { id: "museum-fish-otolith-rings", tags: ["鱼类学", "年龄"], text: "百科小知识：鱼的内耳里有叫耳石的硬组织，会随生长留下层纹；研究者观察纹路，能估算鱼的年龄并了解生长环境。" },
  { id: "museum-jade-abrasive-sand", tags: ["考古科学", "材料"], text: "百科小知识：古人用竹管钻玉时，竹管负责带动磨料旋转；硬度较高的石英砂会一点点磨走玉料，水则帮助带走碎屑。" },
  { id: "museum-insect-compound-eyes", tags: ["昆虫学", "视觉"], text: "百科小知识：许多昆虫的复眼由许多小眼组成，每个小眼接收一个方向的光，合起来能帮助昆虫快速发现运动。" },
  { id: "museum-middle-ear-bones", tags: ["比较解剖学", "听觉"], text: "百科小知识：哺乳动物中耳里的锤骨、砧骨和镫骨会把鼓膜振动传向内耳；镫骨还是人体最小的骨头。" },
  { id: "museum-chip-photomask", tags: ["集成电路史", "芯片"], text: "百科小知识：光刻制造芯片时，会把掩膜版上的电路图形用光转印到涂有光刻胶的晶圆上；一块芯片通常要重复许多层加工。" },
  { id: "museum-bird-banding", tags: ["鸟类环志", "迁徙"], text: "百科小知识：鸟类环志会给鸟戴上带编号的轻质脚环；以后再次观察或捕获同一只鸟，就能研究它的迁徙路线和寿命。" },
  { id: "museum-reference-material", tags: ["计量学", "标准"], text: "百科小知识：标准物质具有经过准确测定的成分或数值，实验室用它校准仪器，才能让不同地方测出的结果彼此可比。" },
  { id: "museum-quipu-knots", tags: ["安第斯文明", "信息记录"], text: "百科小知识：印加文明使用的奇普由主绳和许多垂绳组成；结的位置和样式可以按十进位记录数量，绳子的颜色还可能用来区分物品类别。" },
  { id: "museum-xylem-vessels", tags: ["植物解剖学", "输水"], text: "百科小知识：植物木质部的导管由许多纵向连接的细胞形成，成熟后内部大多是空的；蒸腾拉力等作用会让水沿这些细长通道从根部向叶片移动。" },
  { id: "museum-pyritized-fossil", tags: ["化石保护", "矿物"], text: "百科小知识：有些遗体埋藏后会被黄铁矿填充或替换，形成带金属光泽的化石；出土后若长期接触潮湿空气，黄铁矿可能氧化膨胀，所以博物馆要严格控制湿度。" },
  { id: "museum-nuclide-chart", tags: ["核物理", "科学史"], text: "百科小知识：核素图按原子核里的质子数和中子数排列。横着或竖着比较，就能看见同位素之间的关系；图上的空白区域，也是科学家寻找未知核素的重要线索。" },
  { id: "museum-volcanic-lahar", tags: ["火山学", "灾害"], text: "百科小知识：火山灰和碎石遇到暴雨或融雪，可能沿山谷形成高速火山泥流。它能出现在喷发减弱以后，所以火山监测还要继续观察降雨和河道。" },
  { id: "museum-shell-midden", tags: ["考古学", "环境"], text: "百科小知识：贝丘是古人长期丢弃贝壳、兽骨和生活遗物形成的堆积。研究不同地层里的物种和工具，能帮助考古学家了解当时的饮食、海岸与环境变化。" },
  { id: "museum-antarctic-icefish-blood", tags: ["鱼类学", "南极"], text: "百科小知识：南极鳄冰鱼是已知唯一成年后没有血红蛋白和红细胞的脊椎动物类群，血液看起来接近透明。寒冷海水含氧较多，它们还用更大的心脏和更多血液帮助运输氧气。" },
  { id: "museum-egyptian-blue-pigment", tags: ["古代颜料", "材料史"], text: "百科小知识：埃及蓝被认为是人类最早制成的合成颜料。它由石英砂、石灰、含铜材料和碱混合加热形成蓝色块，再磨成粉用来绘画。" },
  { id: "museum-marshall-stick-chart", tags: ["航海史", "海洋文化"], text: "百科小知识：马绍尔群岛的航海图用椰条、棕榈条和贝壳表示海浪、洋流与岛屿。它多用于出发前学习和记忆，航海者真正出海时主要靠观察和感受海浪导航。" },
  { id: "museum-co-molecular-cloud-map", tags: ["银河系", "射电天文"], text: "百科小知识：寒冷分子云里的氢分子很难直接观测，天文学家常用一氧化碳分子发出的毫米波信号寻找它们。射电望远镜记录信号的方向和频率变化，还能帮助推测分子云的位置与运动。" },
  { id: "museum-frog-vocal-sac-resonator", tags: ["鸣声", "两栖动物"], text: "百科小知识：许多雄蛙鸣叫时，喉部的声囊会像气球一样鼓起。声囊能让空气往返振动，增强声音并减少每次鸣叫重新吸气的消耗，不同物种的叫声节奏也常有差别。" },
  { id: "museum-ctd-rosette-bottles", tags: ["海洋", "科学仪器"], text: "百科小知识：海洋科考常用CTD采水器测量电导率、温度和深度，电导率可以换算海水盐度。仪器架上的采水瓶能在指定深度合上，把那一层海水带回船上化验。" },
  { id: "museum-weather-balloon-radiosonde", tags: ["气象", "预警", "科学仪器"], text: "百科小知识：探空气球会带着无线电探空仪升到高空，一边上升一边测量温度、湿度、气压和风。气球最后会因外界气压变低而膨胀破裂，仪器再借小降落伞落下；这些立体资料是天气预报的重要起点。" },
  { id: "museum-presidential-sash-symbol", tags: ["政治制度", "国际", "服饰史"], text: "百科小知识：一些共和国在总统就职时会使用绶带、徽章或印玺，表示国家权力已经按规则完成交接。它们只是权力的象征，不会让佩戴者拥有无限权力；总统仍要受到宪法、法律和其他国家机构的约束。" },
  { id: "museum-tally-stick-accounting", tags: ["经济", "数学史", "博物馆"], text: "百科小知识：古代欧洲曾用木制刻符棒记录欠款，双方把刻有同一组缺口的木条劈成两半，各自保存一半。以后把两半合起来，缺口能相互对应，较难被单方面改动；这是纸张昂贵时代的一种核对账目的办法。" },
  { id: "museum-oracle-bone-cracks", tags: ["甲骨文", "考古学", "文字史"], text: "百科小知识：商代占卜时，人们会在龟甲或兽骨背面钻凿小坑，再用火灼烧，让正面出现裂纹；有些甲骨还刻下所问的事情、日期和结果。考古学家把刻辞、裂纹和出土位置一起研究，才能判断它记录了什么。" },
  { id: "museum-caddisfly-larva-case", tags: ["水生昆虫", "动物行为", "材料"], text: "百科小知识：石蛾幼虫生活在水里，会吐出丝，把沙粒、小石子、树枝或贝壳碎片粘成可以随身移动的保护巢。不同种类选择的材料和排列方式不同，研究者也会用石蛾等水生昆虫判断溪流环境。" },
  { id: "museum-armillary-sphere-rings", tags: ["天文仪器", "科技史", "古代科学"], text: "百科小知识：浑仪不是普通地球仪，它用一圈圈可以转动的环表示天赤道、黄道等天空坐标。古代天文学家转动并瞄准这些环，测量太阳、月亮和恒星的位置，编制历法与星表。" },
  { id: "museum-sundew-sticky-tentacles", tags: ["食虫植物", "植物学", "适应"], text: "百科小知识：茅膏菜的叶片长着许多带黏液的腺毛，小昆虫被粘住后，部分种类的叶片或腺毛会慢慢弯向猎物，并分泌消化液吸收氮等养分。它仍会进行光合作用，捕虫主要帮助它适应缺少养分的土壤。" },
  { id: "museum-chain-mail-rings", tags: ["古代盔甲", "材料结构", "军事史"], text: "百科小知识：锁子甲由许多互相套连的金属环组成，环与环能分散刀刃的切割力量，还允许身体弯曲。它对撞击的缓冲较弱，所以历史上的穿戴者常在里面加一层厚实的衬衣或软甲。" },
  { id: "museum-stromatolite-microbial-layers", tags: ["古生物学", "微生物", "地球史"], text: "百科小知识：叠层石是一层层生长的岩石结构，常由微生物席粘住沉积颗粒并促使矿物沉淀形成。古老叠层石保存了早期生命活动的线索，现代浅海和盐湖中也能找到仍在形成的例子。" },
  { id: "museum-sea-ice-brine-channels", tags: ["海冰", "海洋学", "微生物"], text: "百科小知识：海水结冰时，大部分盐分会被挤回没有冻结的海水，少量高盐卤水会留在海冰的细小通道中。一些耐寒微生物能住在这些通道里，卤水也会影响海冰的强度和融化过程。" },
  { id: "museum-seismic-p-s-waves", tags: ["地震学", "物理", "地球内部"], text: "百科小知识：地震产生的P波传播较快，能穿过固体和液体；S波较慢，不能穿过液体。多座地震台比较两种波到达的时间，可以帮助估算震源位置；S波在地球内部的传播特点，也是判断外核为液态的重要证据。" },
  { id: "museum-map-coordinate-reference", tags: ["地图学", "测量", "数据"], text: "百科小知识：地图上的经纬度数字还需要配套的坐标参考系统。不同系统对地球形状和原点的规定不同，同一组数字可能落在稍有偏差的位置，所以正规的地图数据会注明坐标系统、比例尺和测量时间。" },
  { id: "museum-eclipse-pinhole-images", tags: ["光学", "天文学", "观察"], text: "百科小知识：日偏食时，树叶缝隙会像许多小孔成像装置，把太阳投影成一地弯弯的亮斑。亮斑的形状来自被月球遮住的太阳，不是树叶本身的形状。" },
  { id: "museum-flight-recorder-orange", tags: ["航空工程", "安全", "材料"], text: "百科小知识：飞机上的“黑匣子”通常涂成醒目的橙色，方便事故后寻找。它的坚固外壳能承受强烈撞击、高温和水压，内部会保存飞行数据或驾驶舱声音。" },
  { id: "museum-floodplain-storage", tags: ["河流地貌", "水文学", "生态"], text: "百科小知识：洪泛平原是河流在洪水期可能漫到的低平土地。没有被过度占用时，它能暂时容纳一部分洪水、降低下游洪峰，还会留下细泥和养分。" }
];

const encouragements = [
  "🍑✨📮 今天也把好奇心装进口袋吧：你认真望向世界的样子，闪闪发光！",
  "🌈🍬🧡 新的一天有新的发现：愿你带着勇气，也带着轻松的笑容！",
  "⭐️🍓📚 今天也给自己一个大拇指：每一点进步，都值得被好好看见！",
  "🌻🫧🚀 每学会一个新东西，都是给未来的自己存下一颗小太阳！",
  "🍭🌟🦄 不懂并不可怕，愿意继续好奇的你，已经很了不起啦！",
  "🐾🍊✨ 认真又可爱的你上线啦：愿今天的新发现让眼睛亮晶晶！",
  "🎒💛🌼 愿你像小太阳一样，心里温暖，脚下勇敢，还一直闪闪发光！",
  "🧭🍑🌟 世界很大，你正在一点一点长出理解它的力量！",
  "📚🍊✨ 今天的新知识已经出发，准备和聪明的你见面啦！",
  "🌱🔍💛 好奇心正在发芽：每一次认真探索，都会让它长高一点！",
  "🚀🍓📖 小脑袋准备起飞：愿今天有惊喜，也有让你自豪的新收获！",
  "🐬🌈📝 愿你的想法像海浪一样有力量，也像阳光一样明亮！",
  "🌼🧪🍬 大胆猜想、认真求证的你，正在成为可靠的小小探索家！",
  "🦉🍑📮 今天也慢慢向前走：你付出的每一点认真都不会白费！",
  "🌞📚🧡 新知识像一扇小窗，愿它为你照进不一样的光！",
  "🍀🔭⭐ 愿你看见身边的小美好，也看见远方的大世界！",
  "🐾🧠🌟 你的每一个认真问题，都可能带来一个意想不到的新发现！",
  "🍑🧩✨ 世界的知识拼图很大，而你今天又会找到新的一块！",
  "🌻📖🔎 愿你一直温柔、认真、有主见，心里也住着明亮的光！",
  "🛸🍬💡 今天也相信自己的思考：你的好奇和坚持都很珍贵！",
  "🐝🌿📚 一点点新知识会慢慢酿成大本领，今天也会有甜甜的收获！",
  "🌙🍓🧭 愿今天的新发现陪着你，走向一个更开阔、更有趣的世界！",
  "📮🧪🌈 不急着一下子知道所有答案，成长本来就是一步一步的！",
  "🍊🔬🌟 世界每天都有新变化，而你每天都在变得更有力量！",
  "🎒🦋💛 愿今天的知识像一只小蝴蝶，轻轻落进你的记忆里！",
  "🦋📚🌟 桃子宝贝，今天也带着清醒的小脑袋出发：温柔地看世界，认真地找证据！",
  "🍑🔬☀️ 新知识正在敲门：愿你既敢大胆猜想，也愿耐心核对每一个理由！",
  "🌋🧪🧭 今天也带着好奇和耐心出发：重要的发现，常常藏在认真核对的细节里！",
  "🌤️📡🍑 今天把世界慢慢看清一点：你愿意分清事实和理由，就是很棒的进步！",
  "🧭🌿📊 今天一起把数字背后的故事看清楚：会比较、会追问的你，正在长出可靠的判断力！",
  "🧩🌾🔭 今天把好奇心变成小侦探：先看事实，再比较证据，你会发现世界比一个答案更有层次！",
  "🗺️🧊🌍 今天把世界当成一本会更新的地图：看清数据从哪里来，也记得给每个结论留一条能回头检查的路！",
  "🌞✈️👓 今天跟着月影、飞机和新科技去发现变化：把现象看清，把理由想明白，你的思考正在发光！"
];

const closingNotes = [
  "今天的情报到这里。愿你带着一个新发现进入今晚，心里亮亮的。",
  "小小的知识已经装进口袋，愿它在未来某一天帮你看懂更大的事情。",
  "今天又认识了世界的一小角。晚安之前，给认真思考的自己一个大拇指。",
  "好奇心今天又长高了一点。愿你保持温柔，也保持清醒和勇敢。",
  "知识不会一下子长成大树，但每天的一片新叶子都算数。",
  "今天的声音先停在这里，新的知识会在脑海里慢慢找到自己的位置。",
  "愿你记住：不确定时愿意继续核对，是一种很可靠的聪明。",
  "世界每天都有新变化，而你正在一点点长出理解它的力量。",
  "今天的探索告一段落，愿认真、好奇和善意继续陪着你。",
  "一个事实、一条原理、一点思考，已经让今天变得很有收获。",
  "愿今天学到的知识，像一盏小灯，照亮以后遇到的相似问题。",
  "新的知识已经抵达。让眼睛休息一下，也让大脑安静地整理它们。",
  "每次愿意多想一步，都是在给未来的自己增加一种能力。",
  "今天又完成了一次小小的知识旅行，愿你带着轻松的心情继续出发。",
  "事实让我们站得稳，好奇让我们走得远。今天的情报就到这里。",
  "愿你既能看见科技的力量，也能记得规则、安全和人的判断同样重要。",
  "今天认识的自然、社会和科技知识，会慢慢连成属于你的世界地图。",
  "今晚把答案留给明天，把认真思考留下来；这已经是一份很好的收获。",
  "把事实分清，把理由想透，今天的好奇心又向前走了一步。",
  "愿今天记住的不只是答案，还有找到答案时用过的证据。",
  "世界不会一次讲完它的故事，你已经学会用知识继续往下读。",
  "今天先把一个事实想明白，比匆忙记住许多结论更有力量。",
  "真正的探索不怕暂时答错，它会把每一步理由都认真放在桌面上。",
  "愿你读完新闻后，既记得发生了什么，也明白证据为什么重要。",
  "今天学到的三个新知识，也许会在未来某次观察中突然连成答案。",
  "把问题留给今晚，把核对留给明天；会等待证据也是一种本领。",
  "今天的新闻读完了，愿你把好奇留在心里，把判断建立在证据上。",
  "世界很大，可靠的理解从一条事实和一次认真比较开始。",
  "今天的新发现先放进记忆里，明天我们再用答案检验一次推理。",
  "世界不会只给一种线索，愿你学会把数字、规则和人的生活连起来看。",
  "把今天核对过的证据装进口袋，明天再用新的问题打开它。",
  "今天的线索来自地图、浮冰和地震波；愿你记住，可靠的答案总能说清数据从哪里来。",
  "月影会移过大地，航线会连接城市，新工具也需要守住规则；愿你带着知识和善意继续观察世界。"
];

const WEAK_OPTION_PATTERN = /唱歌|折纸|沙发|羽毛|玻璃珠|小石头|香味|魔法|空气变甜|蜂蜜|玩具|变书|变糖|鱼鳞|雨滴味道|云朵|一朵云|一片树叶|书包|铅笔/;
const OBVIOUS_WRONG_OPTION_PATTERN = /机器不会犯错|完全取消|所有旧专业都不需要|垃圾自动消失|不运行原程序|不保留原来的测试结果|一定越高|直接证明|只比较.*宣传|只看.*好看|只看参赛人数|只增加飞行数量|只提高飞行高度|只让课堂活动更热闹|只把展品搬进学校但不讲原理|只需要改变墙面颜色|只和书架数量有关/;
const OPTION_GIVEAWAY_PATTERN = /只看|只在|只把|只比较|只为了|只让|只增加|只提高|只需要|只靠|不需要再|不用再|一定|肯定|完全|都会|自动|随便|直接确定|直接证明|基本不受影响|不会变化|不能说明|应该一直|代替所有|所有旧专业|第一次.*就|成功一次.*就/;
const LOW_VALUE_DISTRACTOR_PATTERN = /投票|看起来|外形|颜色|样式|舒不舒服|累不累|好不好看|拍下|照片|只凭感觉|觉得.*(?:热|温|舒服|累)|菜单颜色|餐盘样式|值日安排|黑板大小/;
const SELF_INVALIDATING_OPTION_PATTERN = /不对|应为|所以选|正确版本|这个选项|答案是|暴露答案|自己都觉得|一眼排除|明显错|胡乱/;
const SOCIAL_MEDIA_RESIDUE_PATTERN = /[#＃]|微博|博文|超话|\[[^\]]{1,8}\]|【[^】]*(?:微博|超话)[^】]*】|很飘逸的涂装|转发|评论区/;
const ACCEPTED_REASONING_PATTERNS = new Set([
  "control-variable",
  "exception-arithmetic",
  "comparative-evidence",
  "causal-evidence",
  "difference-comparison",
  "rate-comparison"
]);
const GENERIC_CONTENT_PATTERN = GENERIC_NEWS_EXPLANATION_PATTERN;

const EMAIL_STYLES = `
:root{color-scheme:light}
body{margin:0;background:#fff7ed;color:#2f241d;font-family:"PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.78;font-size:22px}
.wrap{max-width:760px;margin:0 auto;padding:32px 20px 46px}
.hero{background:linear-gradient(180deg,#fff8e8 0%,#ffffff 100%);border:1px solid #fcd9a5;border-radius:26px;padding:28px 24px 24px;box-shadow:0 12px 28px rgba(180,83,9,.08)}
h1{font-size:36px;line-height:1.35;margin:0 0 16px;color:#9a3412}
.date{font-size:22px;color:#7c5e45;margin-bottom:10px;font-weight:800}
.note{font-size:21px;color:#4b3628;margin:12px 0 0}
.day{font-size:29px;font-weight:900;color:#7c2d12;margin:36px 0 16px;padding:15px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:20px}
.section-title{font-size:29px;font-weight:900;color:#92400e;margin:36px 0 16px;padding-left:15px;border-left:7px solid #f59e0b;line-height:1.35}
.card{background:#fff;border:1px solid #fed7aa;border-radius:24px;padding:24px 20px;margin:20px 0;box-shadow:0 8px 18px rgba(124,94,69,.08)}
h2{font-size:28px;line-height:1.45;margin:0 0 18px;color:#7c2d12}
.news-points{display:block}
.news-point{background:#fffaf0;border:1px solid #fde68a;border-radius:18px;padding:16px 16px;margin:13px 0}
.point-label{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:3px 12px;font-size:18px;font-weight:900}
.point-text{margin:9px 0 0;font-size:22px;line-height:1.7}
.source{margin-top:18px;padding-top:16px;border-top:1px dashed #fdba74;font-size:17px;color:#6b4f3d;line-height:1.65}
.source a{color:#b45309}
.learning-card{background:#fff;border:2px solid #fde68a;border-radius:26px;padding:22px 20px;margin:16px 0 30px;box-shadow:0 10px 22px rgba(146,64,14,.08)}
.knowledge-item{display:flex;gap:15px;align-items:flex-start;background:#fffaf0;border:1px solid #fde68a;border-radius:20px;padding:17px 16px;margin:15px 0}
.badge{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:#f59e0b;color:#fff;font-size:19px;font-weight:900}
.knowledge-topic{display:inline-block;margin:0 0 7px;color:#92400e;font-size:18px;font-weight:900}
.knowledge-text{margin:0;font-size:22px;line-height:1.72}
.quiz-card{background:#fff4cf;border:2px solid #fbbf24;border-radius:26px;padding:24px 20px;margin:16px 0 32px;box-shadow:0 10px 22px rgba(146,64,14,.1)}
.prev-answer{background:#fffdf5;border:1px dashed #f59e0b;border-radius:20px;padding:17px 16px;margin:0 0 20px}
.prev-answer p{margin:8px 0;font-size:20px;line-height:1.65}
.quiz-label{margin:0 0 10px;font-size:18px;font-weight:900;color:#92400e;letter-spacing:.04em}
.quiz-question{margin:0 0 14px;font-size:27px;line-height:1.58;font-weight:900;color:#7c2d12}
.quiz-options{margin:14px 0 4px}
.quiz-option{background:#fffdf5;border:1px solid #fcd34d;border-radius:16px;padding:11px 14px;margin:10px 0;font-size:22px;font-weight:800;color:#4b3628}
.answer-note{margin:16px 0 0;font-size:21px;font-weight:900;color:#9a3412}
.closing-note{background:#fffdf5;border:1px solid #fde7b2;border-radius:20px;padding:20px 18px;margin:24px 0 0;font-size:21px;line-height:1.7;color:#4b3628}
.play-card{margin:18px 0 0;padding:18px 16px;border-radius:22px;background:#ecfdf5;border:2px solid #86efac;color:#14532d}
.play-kicker{margin:0 0 8px;font-size:18px;font-weight:900;color:#166534}
.play-title{margin:0 0 10px;font-size:25px;line-height:1.35;font-weight:900;color:#14532d}
.play-text{margin:0 0 14px;font-size:20px;line-height:1.65;color:#24533c}
.play-button{display:inline-block;background:#16a34a;color:#fff!important;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:20px;font-weight:900}
@media (max-width:600px){
body{font-size:21px}
.wrap{padding:18px 13px 30px}
.hero,.card,.learning-card,.quiz-card{padding:20px 16px}
h1{font-size:31px}
h2{font-size:25px}
.date{font-size:21px}
.day{font-size:25px}
.section-title{font-size:25px}
.note{font-size:20px}
.point-text,.knowledge-text,.quiz-option{font-size:21px}
.quiz-question{font-size:25px}
.answer-note,.closing-note{font-size:20px}
.play-title{font-size:23px}
.play-button{display:block;text-align:center}
}
`;

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeNewsTitleForValidation(value = "") {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, "")
    .replace(/^第\s*\d+\s*条小情报[：:]\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

function extractNewsTitlesFromTextForValidation(text = "") {
  return [...String(text).matchAll(/^第\s*\d+\s*条小情报[：:]\s*(.+)$/gm)]
    .map((match) => normalizeNewsTitleForValidation(match[1]))
    .filter(Boolean);
}

function extractNewsTitlesFromHtmlForValidation(html = "") {
  return [...String(html).matchAll(/第\s*\d+\s*条小情报[：:]\s*([^<\n]+)/g)]
    .map((match) => normalizeNewsTitleForValidation(match[1]))
    .filter(Boolean);
}

function validateUniqueNewsTitlesForValidation(titles = [], label = "news") {
  const seen = new Set();
  const duplicates = [];
  for (const title of titles) {
    if (seen.has(title)) duplicates.push(title);
    seen.add(title);
  }
  if (duplicates.length) {
    throw new Error(`${label} has duplicate news titles: ${[...new Set(duplicates)].join(" / ")}`);
  }
}

function cleanNewsTitleForSpeechValidation(value = "") {
  return String(value).replace(/^第\s*\d+\s*条小情报[：:]\s*/, "");
}

function extractNewsPointTextsFromTextForValidation(text = "") {
  return [...String(text).matchAll(/^-\s*(发生了什么|价值是什么|可能影响什么)[：:]\s*(.+)$/gm)]
    .map((match) => match[2].trim())
    .filter(Boolean);
}

function extractKnowledgeTextsFromTextForValidation(text = "") {
  return [...String(text).matchAll(/^\d+\.\s*【[^】]+】(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function normalizePlaybackCoverageText(value = "") {
  return normalizeSpeechText(decodeHtml(stripHtml(value)))
    .replace(/[~～\s.。:：,，、；;！!？?【】\[\]（）()《》“”"']/g, "")
    .toLowerCase();
}

function assertPlaybackCoverage(haystackRaw, needleRaw, label) {
  const needle = normalizePlaybackCoverageText(needleRaw);
  if (!needle) return;
  const haystack = normalizePlaybackCoverageText(haystackRaw);
  if (!haystack.includes(needle)) {
    throw new Error(`Playback content missing ${label}: ${String(needleRaw).slice(0, 80)}`);
  }
}

function validatePlaybackSpeechContent({ emailText = "", playbackData = null, playbackHtml = "", speechText = "" }) {
  const emailTitles = extractNewsTitlesFromTextForValidation(emailText);
  if (emailTitles.length) validateUniqueNewsTitlesForValidation(emailTitles, "Email");

  const speechRequired = [];
  const pageRequiredFromData = [];
  if (playbackData) {
    speechRequired.push(playbackData.intro, playbackData.summaryNote, playbackData.closingText);
    pageRequiredFromData.push(playbackData.intro, playbackData.summaryNote, playbackData.closingText);
    for (const block of playbackData.blocks || []) {
      speechRequired.push(cleanNewsTitleForSpeechValidation(block.title));
      pageRequiredFromData.push(cleanNewsTitleForSpeechValidation(block.title));
      for (const line of block.lines || []) speechRequired.push(line.text);
      for (const line of block.lines || []) pageRequiredFromData.push(line.text);
    }
    for (const item of playbackData.knowledgeItems || []) {
      speechRequired.push(item.text);
      pageRequiredFromData.push(item.text);
    }
  } else {
    speechRequired.push(
      ...emailTitles,
      ...extractNewsPointTextsFromTextForValidation(emailText),
      ...extractKnowledgeTextsFromTextForValidation(emailText)
    );
  }

  if (/开场/.test(speechText)) {
    throw new Error("Playback speech must not contain the old label: 开场");
  }
  if (/(^|[\n。])结尾[。:：]/.test(speechText)) {
    throw new Error("Playback speech must not read the closing layout label.");
  }
  if (!/叮叮\s*[~～]?/.test(speechText)) {
    throw new Error("Playback speech must start with the cheerful cue: 叮叮~");
  }
  if (/今日探索题|昨天探索题|这一天的题目|今天的题目|明天公布参考答案|参考答案：明天公布|题目只展示/.test(speechText)) {
    throw new Error("Playback speech must not read the exploration quiz.");
  }
  if (/(^|[\s\n。！？!?])(发生了什么|价值是什么|可能影响什么)[。:：]/.test(speechText)) {
    throw new Error("Playback speech must not read the news point labels.");
  }

  for (const item of speechRequired.filter(Boolean)) {
    assertPlaybackCoverage(speechText, item, "speech item");
  }

  if (playbackHtml) {
    const pageRequired = emailText
      ? [
          ...emailTitles,
          ...extractNewsPointTextsFromTextForValidation(emailText),
          ...extractKnowledgeTextsFromTextForValidation(emailText)
        ]
      : pageRequiredFromData;
    for (const item of pageRequired.filter(Boolean)) {
      assertPlaybackCoverage(playbackHtml, item, "page item");
    }
  }
}

function playbackAssetUrl(pageUrl, fileName) {
  return new URL(fileName, pageUrl).href;
}

async function fetchRequiredPlaybackText(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function validateRemotePlaybackAudio(pageUrl) {
  const audioUrl = playbackAssetUrl(pageUrl, "audio.mp3");
  let response = await fetch(audioUrl, { method: "HEAD" });
  let usedRangeGet = false;
  if (!response.ok) {
    response = await fetch(audioUrl, { headers: { Range: "bytes=0-2047" } });
    usedRangeGet = true;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch playback audio: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const contentRange = response.headers.get("content-range") || "";
  const rangeTotal = Number(contentRange.match(/\/(\d+)$/)?.[1] || 0);
  const contentLength = rangeTotal || Number(response.headers.get("content-length") || 0);
  if (!/^audio\//i.test(contentType) && !/mpeg|mp3/i.test(contentType)) {
    throw new Error(`Playback audio is not served as audio: ${contentType || "missing content-type"}`);
  }
  if (contentLength && contentLength < MIN_PLAYBACK_AUDIO_BYTES && !usedRangeGet) {
    throw new Error(`Playback audio is too small to be reliable: ${contentLength} bytes`);
  }
}

async function validateExternalPlaybackPageMatchesEmail(text) {
  if (!PLAYBACK_URL_OVERRIDE) return;

  const emailTitles = extractNewsTitlesFromTextForValidation(text);
  if (!emailTitles.length) return;
  validateUniqueNewsTitlesForValidation(emailTitles, "Email");

  const response = await fetch(PLAYBACK_URL_OVERRIDE);
  if (!response.ok) {
    throw new Error(`Failed to fetch playback page for validation: ${response.status} ${response.statusText}`);
  }

  const playbackHtml = await response.text();
  const playbackTitles = extractNewsTitlesFromHtmlForValidation(playbackHtml);
  validateUniqueNewsTitlesForValidation(playbackTitles, "Playback page");
  const missing = emailTitles.filter((title) => !playbackTitles.includes(title));
  if (playbackTitles.length !== emailTitles.length || missing.length) {
    throw new Error([
      "Playback page news mismatch.",
      `Email news count: ${emailTitles.length}.`,
      `Playback news count: ${playbackTitles.length}.`,
      missing.length ? `Missing in playback: ${missing.join(" / ")}` : ""
    ].filter(Boolean).join(" "));
  }

  await validateRemotePlaybackAudio(PLAYBACK_URL_OVERRIDE);
  const speechText = await fetchRequiredPlaybackText(playbackAssetUrl(PLAYBACK_URL_OVERRIDE, "speech.txt"), "playback speech");
  validatePlaybackSpeechContent({ emailText: text, playbackHtml, speechText });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function parseReportDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`PEACH_NEWS_DATE must use YYYY-MM-DD, got: ${value}`);
  }

  if (TIMEZONE !== "Asia/Shanghai") {
    throw new Error(`PEACH_NEWS_DATE currently supports Asia/Shanghai only, got: ${TIMEZONE}`);
  }

  return new Date(`${value}T23:59:59+08:00`);
}

function parseReportDateList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseReportDate);
}

function googleNewsSearchUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
}

function normalizeSpeechText(value = "") {
  return String(value || "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\uFE0F\u200D]/g, "")
    .replace(/\bAI\b/gi, "人工智能")
    .replace(/\bAIGC\b/gi, "人工智能生成内容")
    .replace(/\b5G\b/gi, "五 G")
    .replace(/\b6G\b/gi, "六 G")
    .replace(/\bWi[- ]?Fi\b/gi, "无线网络")
    .replace(/\bGPS\b/gi, "全球定位系统")
    .replace(/\bApp\b/g, "应用")
    .replace(/(\d+)\s*℃/g, "$1 摄氏度")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "百分之 $1")
    .replace(/(\d+)\s*km/g, "$1 公里")
    .replace(/(\d+)\s*kg/g, "$1 千克")
    .replace(/(\d+)\s*cm/g, "$1 厘米")
    .replace(/(\d+)\s*mm/g, "$1 毫米")
    .replace(/[“”]/g, "")
    .replace(/[《》]/g, "")
    .replace(/[A-Za-z]+:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpeechLines(lines = []) {
  return lines
    .map((line) => normalizeSpeechText(line))
    .filter(Boolean);
}

function playbackUrlForDate(dateKey) {
  if (PLAYBACK_URL_OVERRIDE) return PLAYBACK_URL_OVERRIDE;
  return PLAYBACK_BASE_URL ? `${PLAYBACK_BASE_URL}/${dateKey}/` : "";
}

function playbackSlugForMessage(message) {
  return message.playbackData?.dateKey || getLocalDateKey(NEWS_AS_OF);
}

function buildPlaybackSpeechSections(playbackData) {
  const sections = [
    {
      title: "叮叮~",
      text: normalizeSpeechText(`${playbackData.intro} 日期是${playbackData.dateText}。${playbackData.summaryNote || ""}`)
    },
    ...playbackData.blocks.map((block, index) => {
      const cleanTitle = block.title.replace(/^第\s*\d+\s*条小情报[:：]\s*/, "");
      const spokenLines = normalizeSpeechLines(block.lines.map((line) => line.text));
      return {
        title: normalizeSpeechText(`第 ${index + 1} 条小情报：${cleanTitle}`),
        text: spokenLines.join("\n")
      };
    }),
    {
      title: "博物小百科",
      text: normalizeSpeechText([
        "下面是今天的三条博物小百科。",
        ...playbackData.knowledgeItems.map((item, index) => `第 ${index + 1} 条。${item.text}`)
      ].join(" "))
    },
    {
      title: "",
      text: normalizeSpeechText(playbackData.closingText)
    }
  ].filter((section) => stripHtml(section.text));

  return sections;
}

function renderPlaybackArticleHtml(playbackData, playbackUrl) {
  const blocksHtml = playbackData.blocks.map((block, index) => `
    <article class="news-card">
      <div class="card-index">小情报 ${index + 1}</div>
      <h2>${escapeHtml(block.title)}</h2>
      ${block.lines.map((line) => `
        <section class="point">
          <span>${escapeHtml(line.label)}</span>
          <p>${escapeHtml(line.text)}</p>
        </section>
      `).join("")}
    </article>
  `).join("");

  const knowledgeHtml = playbackData.knowledgeItems.map((item, index) => `
    <section class="knowledge">
      <b>${index + 1}</b>
      <p>${escapeHtml(item.text)}</p>
    </section>
  `).join("");
  const quizHtml = playbackData.question
    ? `<div class="section-title">今日探索题</div>
  <section class="quiz-card">
    ${playbackData.previousAnswer ? `<div class="prev-answer">${renderTextLinesHtml(playbackData.previousAnswer)}</div>` : ""}
    <p class="quiz-label">题目只展示，不加入音频朗读</p>
    ${renderQuizQuestionHtml(playbackData.question)}
    <p class="answer-note">参考答案：明天公布。</p>
  </section>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(playbackData.subject)}</title>
<style>
:root{color-scheme:light;--bg:#fff7ed;--paper:#fffdf7;--ink:#2f241d;--muted:#765b46;--brand:#16a34a;--orange:#f59e0b;--line:#fed7aa}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(circle at 20% 0%,#fef3c7 0,#fff7ed 30%,#f8fafc 100%);color:var(--ink);font-family:"PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:21px;line-height:1.75}
.shell{max-width:900px;margin:0 auto;padding:26px 18px 58px}
.player-bar{position:sticky;top:0;z-index:2;background:rgba(255,253,247,.97);backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:22px;padding:10px 12px;margin-bottom:18px;box-shadow:0 12px 24px rgba(124,45,18,.1)}
.intro-card{background:var(--paper);border:1px solid var(--line);border-radius:26px;padding:22px 18px;margin:18px 0 24px;box-shadow:0 10px 24px rgba(124,45,18,.08)}
.kicker{font-size:18px;font-weight:900;color:#166534;margin:0 0 8px}
h1{font-size:34px;line-height:1.32;margin:0;color:#7c2d12}
.date{margin:8px 0 16px;color:var(--muted);font-weight:900}
audio{display:block;width:100%;margin:0}
.intro-note{margin:12px 0 0;color:#6b4f3d}
.tip{font-size:16px;color:#6b4f3d;margin:8px 0 0}
.section-title{font-size:27px;font-weight:900;color:#92400e;margin:28px 0 14px;padding-left:13px;border-left:7px solid var(--orange)}
.news-card,.learning-card,.ending-card{background:var(--paper);border:1px solid var(--line);border-radius:26px;padding:22px 18px;margin:18px 0;box-shadow:0 10px 24px rgba(124,45,18,.08)}
.card-index{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:4px 12px;font-size:16px;font-weight:900}
h2{font-size:27px;line-height:1.45;margin:12px 0 14px;color:#7c2d12}
.point{background:#fffaf0;border:1px solid #fde68a;border-radius:18px;padding:14px 15px;margin:12px 0}
.point span{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 10px;font-size:17px;font-weight:900}
.point p{margin:8px 0 0}
.knowledge{display:flex;gap:13px;align-items:flex-start;background:#fffaf0;border:1px solid #fde68a;border-radius:18px;padding:15px;margin:12px 0}
.knowledge b{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:var(--orange);color:#fff;display:flex;align-items:center;justify-content:center}
.knowledge p{margin:0}
.quiz-card{background:#fff4cf;border:2px solid #fbbf24;border-radius:26px;padding:22px 18px;margin:18px 0 28px;box-shadow:0 10px 24px rgba(146,64,14,.1)}
.prev-answer{background:#fffdf5;border:1px dashed #f59e0b;border-radius:18px;padding:14px;margin:0 0 18px}
.prev-answer p{margin:8px 0;font-size:18px;line-height:1.65}
.quiz-label{margin:0 0 10px;font-size:18px;font-weight:900;color:#92400e}
.quiz-question{margin:0 0 14px;font-size:25px;line-height:1.58;font-weight:900;color:#7c2d12}
.quiz-options{margin:14px 0 4px}
.quiz-option{background:#fffdf5;border:1px solid #fcd34d;border-radius:16px;padding:11px 14px;margin:10px 0;font-size:20px;font-weight:800;color:#4b3628}
.answer-note{margin:16px 0 0;font-size:20px;font-weight:900;color:#9a3412}
.footer{margin:26px 0 0;color:#6b4f3d;font-size:16px}
@media (max-width:640px){body{font-size:20px}.shell{padding:10px 10px 34px}.player-bar{border-radius:18px;padding:8px 8px}.intro-card{border-radius:22px;padding:18px 14px}h1{font-size:29px}.section-title,h2{font-size:24px}}
</style>
</head>
<body>
<main class="shell">
  <section class="player-bar" aria-label="音频播放器">
    <audio id="audio" controls preload="metadata">
      <source src="audio.mp3" type="audio/mpeg">
      <track id="caption-track" kind="subtitles" srclang="zh" label="中文字幕" src="captions.vtt" default>
    </audio>
  </section>

  <section class="intro-card">
    <p class="kicker">桃子宝贝每日情报 · 图文语音版</p>
    <h1>${escapeHtml(playbackData.title)}</h1>
    <div class="date">${escapeHtml(playbackData.dateText)}</div>
    <p class="intro-note">${escapeHtml(playbackData.intro)}</p>
    ${playbackData.summaryNote ? `<p class="intro-note">${escapeHtml(playbackData.summaryNote)}</p>` : ""}
    <p class="tip">音频不朗读探索题；题目文字保留在页面里，第二天公布参考答案。</p>
  </section>

  <div class="section-title">今天的小情报</div>
  ${blocksHtml || `<section class="news-card"><p>这一天没有抓到足够新鲜、适合小学生阅读的重点新闻，所以不编假新闻。</p></section>`}

  <div class="section-title">博物小百科</div>
  <section class="learning-card">${knowledgeHtml}</section>

  ${quizHtml}

  <section class="ending-card">${escapeHtml(playbackData.closingText)}</section>
  <p class="footer">如果页面无法播放，可以回到邮件正文直接阅读。${playbackUrl ? `页面地址：${escapeHtml(playbackUrl)}` : ""}</p>
</main>
<script>
const track = document.getElementById("caption-track");
function bindTrack(){
  const textTrack = track.track;
  textTrack.mode = "hidden";
}
if (track.track) bindTrack();
</script>
</body>
</html>`;
}

async function ensureWebVtt(captionsPath) {
  const raw = await fs.readFile(captionsPath, "utf8");
  if (/^\s*WEBVTT/.test(raw)) return;
  const converted = raw
    .replace(/\r\n/g, "\n")
    .replace(/^(\d+)\n/gm, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2 --> $3.$4")
    .trim();
  await fs.writeFile(captionsPath, `WEBVTT\n\n${converted}\n`, "utf8");
}

async function validateLocalPlaybackAudio(audioPath) {
  const stat = await fs.stat(audioPath);
  if (stat.size < MIN_PLAYBACK_AUDIO_BYTES) {
    throw new Error(`Generated playback audio is too small to be reliable: ${stat.size} bytes`);
  }

  const head = await fs.readFile(audioPath);
  const hasMp3Header = head.subarray(0, 3).toString("latin1") === "ID3"
    || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  if (!hasMp3Header) {
    throw new Error("Generated playback audio does not look like a playable MP3 file.");
  }
}

async function validateGeneratedPlaybackAssets(playbackData, paths) {
  const [speechText, playbackHtml, captionsText] = await Promise.all([
    fs.readFile(paths.speechPath, "utf8"),
    fs.readFile(paths.indexPath, "utf8"),
    fs.readFile(paths.captionsPath, "utf8")
  ]);

  validatePlaybackSpeechContent({ playbackData, playbackHtml, speechText });
  await validateLocalPlaybackAudio(paths.audioPath);

  if (!/^\s*WEBVTT/.test(captionsText)) {
    throw new Error("Generated playback captions are not valid WebVTT.");
  }
  if (!playbackHtml.includes("audio.mp3")) {
    throw new Error("Generated playback page does not reference audio.mp3.");
  }
  if (playbackHtml.includes("newsPointPauseTimes") || playbackHtml.includes("newsPointPauseMs")) {
    throw new Error("Generated playback page must not include artificial news point pauses.");
  }
}

async function generatePlaybackAssets(message) {
  if (!message.playbackData) return null;
  const dateKey = playbackSlugForMessage(message);
  const outputDir = path.join(OUT_PLAYBACK_ROOT, dateKey);
  const playbackUrl = playbackUrlForDate(dateKey);
  await fs.mkdir(outputDir, { recursive: true });

  const sections = buildPlaybackSpeechSections(message.playbackData);
  const speechText = sections.map((section) => {
    if (!section.title) return section.text;
    if (section.title === "叮叮~") return `${section.title} ${section.text}`;
    return `${section.title}。${section.text}`;
  }).join("\n\n");
  const speechPath = path.join(outputDir, "speech.txt");
  const audioPath = path.join(outputDir, "audio.mp3");
  const captionsPath = path.join(outputDir, "captions.vtt");
  const indexPath = path.join(outputDir, "index.html");

  await fs.writeFile(speechPath, `${speechText}\n`, "utf8");
  await execFileAsync(
    "python3",
    [
      "-m",
      "edge_tts",
      "--voice",
      PLAYBACK_VOICE,
      `--rate=${PLAYBACK_RATE}`,
      `--pitch=${PLAYBACK_PITCH}`,
      `--volume=${PLAYBACK_VOLUME}`,
      "--file",
      speechPath,
      "--write-media",
      audioPath,
      "--write-subtitles",
      captionsPath
    ],
    { maxBuffer: 1024 * 1024 * 8 }
  );
  await ensureWebVtt(captionsPath);
  await fs.writeFile(indexPath, renderPlaybackArticleHtml(message.playbackData, playbackUrl), "utf8");
  await validateGeneratedPlaybackAssets(message.playbackData, { speechPath, audioPath, captionsPath, indexPath });
  return { dateKey, outputDir, playbackUrl, audioPath, captionsPath, indexPath };
}

function renderPlaybackCalloutHtml(playback) {
  if (!playback?.playbackUrl) return "";
  return `<div class="play-card">
<p class="play-kicker">新增：图文语音版</p>
<p class="play-title">点开就能听 Xiaoyi 女声播报，文字和声音一起看。</p>
<p class="play-text">音频不朗读探索题；题目文字保留在邮件正文和播放页里，第二天公布参考答案。</p>
<a class="play-button" href="${escapeHtml(playback.playbackUrl)}">点击播放图文语音版</a>
</div>`;
}

function insertPlaybackCardInHtml(html, playback) {
  const card = renderPlaybackCalloutHtml(playback);
  if (!card) return html;

  const heroStart = html.indexOf('<div class="hero">');
  if (heroStart < 0) return html.replace("<body>", `<body>${card}`);

  const tokenPattern = /<div\b|<\/div>/gi;
  tokenPattern.lastIndex = heroStart;
  let depth = 0;
  let match;
  while ((match = tokenPattern.exec(html))) {
    if (match[0].startsWith("<div")) depth += 1;
    else depth -= 1;
    if (depth === 0) {
      return `${html.slice(0, match.index)}${card}${html.slice(match.index)}`;
    }
  }
  return html;
}

function attachPlaybackToMessage(message, playback) {
  if (!playback?.playbackUrl) return message;
  const playbackText = [
    "图文语音版：",
    playback.playbackUrl,
    "点开可直接播放 Xiaoyi 女声播报；音频不朗读探索题，题目文字保留在邮件正文和播放页里。",
    ""
  ].join("\n");

  return {
    ...message,
    text: message.text.includes("图文语音版：")
      ? message.text.replace(/(图文语音版：\n)[^\n]+/, `$1${playback.playbackUrl}`)
      : message.text.replace(/\n\n/, `\n\n${playbackText}`),
    html: insertPlaybackCardInHtml(message.html, playback)
  };
}

function getArticleLink(item) {
  const link = item.link;
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const hrefItem = link.find((entry) => entry?.["@_href"]);
    return hrefItem?.["@_href"] || "";
  }
  return link?.["@_href"] || link?.href || "";
}

function getPublisher(item, feed) {
  const rawSource = item.source;
  const publisher = typeof rawSource === "string"
    ? stripHtml(rawSource) || feed.publisher || feed.name
    : stripHtml(rawSource?.["#text"] || rawSource?.text || feed.publisher || feed.name);
  return normalizePublisherName(publisher);
}

function normalizePublisherName(value = "") {
  const names = new Map([
    ["Sina finance", "新浪财经"],
    ["jfdaily.com", "上观新闻"],
    ["BBC News 中文", "BBC 中文"],
    ["spacechina.com", "中国航天科技集团"],
    ["chinanews.com.cn", "中国新闻网"]
  ]);
  return names.get(value) || value;
}

function getPublisherUrl(item, link) {
  if (typeof item.source === "object" && item.source?.["@_url"]) return item.source["@_url"];
  return link || "";
}

function getSourceDomain(url, fallback = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

function normalizeTitle(title, publisher) {
  let cleaned = stripHtml(title);
  if (publisher) {
    cleaned = cleaned.replace(new RegExp(`\\s+-\\s+${escapeRegex(publisher)}$`), "");
  }
  return cleaned
    .replace(/\s+-\s+(新华网|人民网|中国新闻网|中新网|BBC News 中文|BBC 中文|ScienceDaily|中华网|央视新闻|央视网|jfdaily\.com|Sina finance|spacechina\.com)$/i, "")
    .replace(/\|.*$/g, "")
    .replace(/_[\u4e00-\u9fffA-Za-z0-9]+$/g, "")
    .trim();
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeItems(parsed, feed) {
  const channel = parsed?.rss?.channel || parsed?.feed || {};
  const raw = Array.isArray(channel.item) ? channel.item : Array.isArray(channel.entry) ? channel.entry : [];
  return raw.map((item) => {
    const link = getArticleLink(item);
    const publisher = getPublisher(item, feed);
    const publisherUrl = getPublisherUrl(item, link);
    const domain = getSourceDomain(publisherUrl, feed.publisher || feed.name);
    const title = normalizeTitle(item.title, publisher);
    const description = stripHtml(item.description || item.summary || item["content:encoded"]);
    const published = Date.parse(item.pubDate || item.published || item.updated || "") || 0;
    return {
      title,
      description,
      link,
      published,
      feed: feed.name,
      publisher,
      domain,
      category: feed.category,
      weight: feed.weight
    };
  }).filter((item) => item.title);
}

function scoreItem(item, asOf = NEWS_AS_OF) {
  const text = `${item.title} ${item.description}`;
  const important = [
    "中国", "北京", "科技", "科学", "AI", "人工智能", "航天", "机器人", "芯片", "教育", "医疗", "健康", "民生",
    "政策", "经济", "贸易", "能源", "新能源", "气候", "环保", "儿童", "学生", "学校", "创新", "卫星", "高铁",
    "阅读", "博物馆", "交通", "养老", "农业", "粮食", "低碳", "数字", "算力", "大模型"
  ];
  const veryUseful = ["儿童", "学生", "学校", "教育", "科技", "科学", "航天", "机器人", "人工智能", "新能源", "医疗", "健康", "交通", "气候"];
  const trustedPublishers = ["新华网", "人民网", "中国新闻网", "央视新闻", "央视网", "中国政府网", "BBC 中文", "ScienceDaily"];
  const tooHeavy = [
    "遇难", "死亡", "袭击", "凶杀", "血", "尸", "恐怖", "爆炸", "瓦斯", "事故", "火灾", "坍塌", "失踪",
    "战争", "空袭", "枪击", "导弹", "核威胁", "绑架", "性侵", "猥亵", "虐待", "自杀"
  ];
  const lowValue = [
    "游戏", "手游", "球迷", "明星", "演唱会", "票房", "八卦", "影视打卡", "综艺", "直播带货",
    "Destiny", "fans", "shooter", "porn", "adult", "sex", "celebrity", "movie"
  ];
  const chineseChars = (item.title.match(/[\u4e00-\u9fff]/g) || []).length;
  let score = item.weight;
  for (const word of important) {
    if (text.toLowerCase().includes(word.toLowerCase())) score += 2;
  }
  for (const word of veryUseful) {
    if (text.includes(word)) score += 2;
  }
  if (trustedPublishers.some((publisher) => item.publisher.includes(publisher) || item.feed.includes(publisher))) score += 3;
  if (semanticTopicKey(item)) score += 16;
  for (const word of tooHeavy) {
    if (text.includes(word)) score -= 10;
  }
  for (const word of lowValue) {
    if (text.toLowerCase().includes(word.toLowerCase())) score -= 6;
  }
  if (chineseChars < 4) score -= 20;
  if (item.title.length < 8) score -= 4;
  const ageHours = getAgeHours(item, asOf);
  if (ageHours !== Number.POSITIVE_INFINITY) score += Math.max(0, 10 - ageHours / 6);
  return score;
}

function getAgeHours(item, asOf = NEWS_AS_OF) {
  if (!item.published) return Number.POSITIVE_INFINITY;
  return (asOf.getTime() - item.published) / 36e5;
}

function isFresh(item, asOf = NEWS_AS_OF) {
  const ageHours = getAgeHours(item, asOf);
  return ageHours >= 0 && ageHours <= MAX_NEWS_AGE_HOURS;
}

function isSuitableForKids(item) {
  const text = `${item.title} ${item.description}`;
  if (isPromotionalStudyTourNews(text) || isLocalSelfPromotionNews(text)) return false;
  if (!classifyNewsPillar(text)) return false;
  const editoriallyReviewed = item.kidTitle && item.kidSummary && item.kidValue && item.kidImpact;
  if (editoriallyReviewed) {
    return hasUsefulTitle(item.kidTitle) && !isLowQualityNewsSource(text);
  }
  if (!hasUsefulTitle(item.title)) return false;
  if (isLowQualityNewsSource(text)) return false;
  const valuableTopics = [
    "科技", "科学", "AI", "人工智能", "机器人", "航天", "卫星", "火箭", "芯片", "新能源",
    "教育", "学校", "学生", "儿童", "科普", "医疗", "健康", "交通", "气候", "环保", "阅读", "博物馆", "低碳",
    "创客", "低空", "飞行器", "制造业", "化学", "工程", "公共服务", "公益", "福利", "考古", "历史", "文化遗产",
    "用电", "高铁", "粮食", "生态", "辟谣", "夏粮", "湟鱼", "台风", "防汛", "暴雨", "应急", "数字周"
  ];
  const rejectTopics = [
    "特朗普", "拜登", "总统体检", "小费", "公关活动", "选举", "民调", "政党", "丑闻", "审判",
    "乌克兰", "以色列", "哈马斯", "加沙", "制裁", "枪击", "毒品", "诈骗", "暴力", "性侵", "猥亵",
    "硬核实力", "中坚力量", "中国中冶", "锻造制造强国", "新标杆", "受用户追捧", "海尔推出",
    "纳晖", "能源资产运营", "重新定义能源资产", "运营新范式",
    "三大核心优势", "重塑通用人形机器人", "行业标准",
    "中国科技创新为世界提供发展机遇", "专家：中国科技创新", "提供发展机遇",
    "低碳案例", "领跑行业转型", "入选2026年度低碳案例",
    "陕西高校力量助力生态保护", "科技成果落地效能", "高校专利转化", "专利转化运用攻坚行动", "成果转化体系",
    "金固股份", "主机厂定点", "低碳车轮", "高科技高成长", "德勤宝山", "明日之星榜单", "荣耀揭晓",
    "国泰海通", "美股", "股市", "A股", "港股", "证券", "券商", "波动期",
    "数字金融风险", "金融科技创新案例", "技术调整空间", "银行原行长",
    "扩大民间投资", "民营经济高质量发展", "金融支持、用地供给", "政务服",
    "来稿", "相继上市", "IPO", "资本无国界", "资本市场", "股价", "股票", "上市公司",
    "港交所", "递表", "聆讯", "早参",
    "ETF", "基金", "成交额", "半日成交", "涨1.", "涨2.", "涨3.", "跌1.", "跌2.", "跌3.",
    "高考", "高考作文", "高考作文题", "作文试题解析", "作文命题", "命题思路", "高考命题",
    "休学—复学—再休学", "心理健康普查", "学校无力承接干预", "医院一号难求",
    "未成年人社交媒体管控研究报告", "海外社交媒体禁令", "社交媒体管控", "清华校内召开研讨会",
    "中国设计学自主知识体系构建研究",
    "两岸青年峰会", "青年峰会于", "在北京举办",
    "高校毕业生就业", "百日冲刺", "本科生毕业典礼", "寄语毕业生", "技术决定能走多远",
    "毕业季浪漫仪式", "毕业生点亮", "星空典礼", "毕业星空投影", "届毕业生",
    "奖项及荣誉揭晓", "荣誉揭晓并颁奖",
    "弘扬科学家精神，共筑科技强国梦", "共筑科技强国梦",
    "合唱教育及振兴研讨会", "乡村教师合唱教育", "研讨会在沪成功举行",
    "研学旅行及教育行业博览会", "中国研学旅行", "中俄小朋友", "俄罗斯的小朋友通过语言",
    "中文培优", "来华夏令营", "文化之旅", "夏令营开营仪式", "英国师生开启",
    "支教调研团", "志愿服务活动圆满落幕", "筑梦童心未来", "点亮科学之光",
    "亲子综艺", "育儿真相", "拥抱不完美", "演员", "艺名", "取景地", "打卡", "寻根之旅",
    "戒网瘾", "矫治", "骗入", "涉事机构", "违法行为", "行进中的济南", "填补本地", "产线即将量产",
    "被查", "违纪违法", "纪律审查", "监察调查", "涉嫌严重", "原党组成员", "原副主席", "反腐", "贪腐",
    "难民", "流离失所", "公约通过", "世界难民日",
    "外交部", "例行记者会", "日方应教育提醒", "在华日本公民", "遵守中国法律法规",
    "全国政协", "政协十四届常委会", "常委会第", "王沪宁", "丁薛祥", "作报告",
    "从数智人到低空飞行器", "南博会制造业馆",
    "老年健康宣传周", "合理用药与科学康养", "银龄安康",
    "聚焦第九届中国—亚欧博览会", "新生活·酷科技·最潮流",
    "交通装备智造“中车样本”亮相链博会", "夏季达沃斯热议能源转型", "夏季达沃斯聚焦“规模化创新”",
    "商务部回应近期日本经济界人士接连访华", "敦促日本政府切实反思纠错",
    "通信试验卫星二十六号A星", "欧莱雅2026年链博会", "智能包装中心",
    "上海商业航天行业展", "商业航天行业展", "国家会展中心（上海）举办",
    "智慧铁塔助力革命老区新发展", "主题调研宣传活动", "守好红色沃土",
    "算力爆发催生散热刚需", "机器人，如何“出汗”", "机器人如何“出汗”",
    "参观注意事项", "安全提示", "玩得安心又顺利",
    "播下科学种子", "点亮童年星光",
    "深耕基层科普沃土", "衡南县科协以科技帮助乡村少年成长",
    "丝路贸易焕新机", "亚欧博览会显“科技范儿”", "亚欧博览会显科技范儿",
    "追光科技亮相2026 MWC上海", "为智能科技铺就绿能底色",
    "双向揭榜挂帅", "揭榜挂帅", "四链融合", "立状签约", "高层次人才专场",
    "持续加码新能源赛道", "再增3万吨新能源铝箔产能", "发布亮眼“成绩单”", "发布亮眼成绩单",
    "向新向优、再创新高", "多领域发布亮眼",
    "中外青年贵州探寻气候治理", "气候治理的“在地答案”", "气候治理的在地答案", "在地答案",
    "气候解决方案的落地推行",
    "国际青年“中国行”", "国际青年中国行", "在科技与文化交融中洞见中国魅力",
    "AI重构创意生产", "数字技术与广告行业深度融合",
    "港澳台未来教师沪上论教", "AI时代教育的“温度”不可缺席", "AI时代教育的温度不可缺席",
    "大渡口签下297亿元重点项目", "重点项目共计78个", "最新动态_优化营商环境",
    "宁夏银川举办“童声里的中国”", "童声里的中国", "歌咏展演",
    "英国政府计划加大科研投入", "全国年度科研经费将达到",
    "午间炸场", "商业航天全线狂飙", "掀涨停潮", "全球首创网系回收技术落地",
    "超九成受访大学生将AI作为“全能学伴”", "超九成受访大学生将AI作为全能学伴",
    "鄂南发展研究院揭牌", "赋能区域协同与绿色低碳发展",
    "可持续交通主题边会在联合国总部举行", "可持续交通主题边会",
    "APEC2026年数字和人工智能部长会议", "数字和人工智能部长会议将在成都举行",
    "台青“首来族”", "台青首来族", "感知大陆数智脉动", "数智脉动",
    "科创金融帮助文脉传承", "杭州创新城区育新机", "中央商务区(CBD)", "中央创新区(CID)",
    "家电重镇的立破之道", "北滘镇", "厂房连片、货车穿梭"
  ];
  const hasValuableTopic = valuableTopics.some((word) => text.toLowerCase().includes(word.toLowerCase()));
  if (!hasValuableTopic) return false;
  if (SOCIAL_MEDIA_RESIDUE_PATTERN.test(text)) return false;
  if (isLowValueMeetingTopic(text)) return false;
  return !rejectTopics.some((word) => text.includes(word));
}

function isLowValueMeetingTopic(text = "") {
  const meetingOnly = /研讨会|论坛|年会|座谈会|大会|峰会|会议|开幕式|启动仪式|举行|召开/.test(text);
  if (!meetingOnly) return false;

  const concreteKidValue = /科普|课堂|教学|学校|学生|儿童|孩子|科技馆|博物馆|机器人|卫星|火箭|人工智能|AI|无人机|铁路|学生票|医疗|健康|疫苗|电站|新能源|低空|工程师进课堂|农田|农业无人机|新物种|江豚|实验|航天|交通/.test(text);
  const abstractPublicAffairs = /治理|理论与实践|学术|民族学|屏障|沃土|高质量发展|战略|体系|共同体|协同|交流合作|课题|报告|成果发布|思想|文化交流|区域发展/.test(text);
  return abstractPublicAffairs && !concreteKidValue;
}

function hasUsefulTitle(title = "") {
  const cleaned = title.trim();
  const lowInformationPatterns = [
    /^(弘扬|共筑|聚力|聚焦|奋进|书写|逐梦|筑梦|点亮|探寻).{0,22}(梦|精神|篇章|未来)$/,
    /科学家精神.*科技强国梦/,
    /向新向优|再创新高|成绩单/,
    /持续加码.*赛道|再增\d+.*产能/
  ];
  const organizationOnlyTitles = [
    "中国航天科技集团有限公司",
    "中国航天科技集团",
    "国家航天局",
    "中华人民共和国教育部"
  ];
  if (SOCIAL_MEDIA_RESIDUE_PATTERN.test(cleaned)) return false;
  if (/(\.\.\.|…|重\.\.\.)/.test(cleaned)) return false;
  if (lowInformationPatterns.some((pattern) => pattern.test(cleaned))) return false;
  if (organizationOnlyTitles.includes(cleaned)) return false;
  if (/有限公司$/.test(cleaned) && cleaned.length < 18) return false;
  return cleaned.length >= 8;
}

function semanticTopicKey(item) {
  const text = `${item.title} ${item.description}`;
  const namedTyphoonKey = namedTyphoonEventKey(text);
  if (namedTyphoonKey) return namedTyphoonKey;
  if (/太空算力|算力星座|算力卫星/.test(text)) {
    return "space-computing-constellation";
  }
  if (/教育部.*增[补设].*27.*专业|27个.*职业教育.*专业|27个新专业/.test(text)) {
    return "education-ministry-27-new-majors";
  }
  if (/千帆极轨\s*(13|15)\s*组卫星|千帆极轨(13|15)组卫星|一箭\s*18\s*星|长[八六]改?火箭/.test(text)) {
    return "qianfan-polar-orbit-satellite-launch";
  }
  if (/海洋二号\s*[EＥ]|海洋二号E卫星|海洋二号Ｅ卫星/.test(text)) {
    return "haiyang-2e-satellite-launch";
  }
  if (/卡门线|火箭制造|李东解密火箭/.test(text)) {
    return "rocket-manufacturing-karman-line";
  }
  if (/机器人学校|机器人.*开学|背答案.*会解题|机器人上学/.test(text)) {
    return "robot-school-task-training";
  }
  if (/科普帮助扬帆计划|科技创新巾帼行动|巾帼行动.*科普/.test(text)) {
    return "science-outreach-support-program";
  }
  if (isSmartMountainHighwayStory(text)) {
    return "smart-mountain-highway-safety";
  }
  if (/白鹤滩水电站|水电大国重器|水电科技|水电.*珠穆朗玛峰/.test(text)) {
    return "baihetan-hydropower-engineering";
  }
  if (/固体助推发动机|百台交付|百台成功/.test(text)) {
    return "solid-booster-100-delivery-milestone";
  }
  if (isFieldArchaeologyStory(text)) {
    return "field-archaeology-liulihe-site";
  }
  if (isSmartRobotApplicationStory(text)) {
    return "smart-robot-practical-application";
  }
  if (isNewEnergyPassengerExportStory(text)) {
    return "new-energy-passenger-car-export-share";
  }
  if (isAiWorkforceTrainingStory(text)) {
    return "jiangsu-ai-workforce-training";
  }
  if (isWaterLngBunkeringStory(text)) {
    return "yangtze-water-lng-bunkering-station";
  }
  if (isHighAltitudeAtmosphereDroneStory(text)) {
    return "high-altitude-drone-atmosphere-observation";
  }
  if (isLithiumMetalBatteryElectrolyteStory(text)) {
    return "lithium-metal-battery-electrolyte";
  }
  if (isDisasterPreventionTechnologyStory(text)) {
    return "disaster-prevention-digital-technology";
  }
  if (isUrbanDrainageFloodControlStory(text)) {
    return "urban-drainage-flood-control";
  }
  if (isFloodMedicalResponseStory(text)) {
    return "guangxi-flood-medical-response";
  }
  if (isReusableRocketRecoveryStory(text)) {
    return "long-march-10b-reusable-rocket-recovery";
  }
  if (isNationalPowerLoadRecordStory(text)) {
    return "national-power-load-record-1518";
  }
  if (isSummerGrainRecordStory(text)) {
    return "national-summer-grain-over-300-billion-jin";
  }
  if (isHighSpeedRail385TestStory(text)) {
    return "xikang-high-speed-rail-385-test";
  }
  if (isQinghaiLakeNakedCarpStory(text)) {
    return "qinghai-lake-naked-carp-recovery";
  }
  if (isTyphoonMaritimeResponseStory(text)) {
    return "typhoon-maritime-safety-response";
  }
  if (isTyphoonPublicSafetyStory(text)) {
    return "typhoon-public-safety-response";
  }
  if (isApecDigitalWeekStory(text)) {
    return "apec-digital-week-public-rules";
  }
  if (isIndustrialAiManufacturingStory(text)) {
    return "yunnan-industrial-ai-manufacturing";
  }
  if (isAmazonBioculturalKnowledgeStory(text)) {
    return "amazon-biocultural-knowledge-loss";
  }
  if (isHeterogeneousComputingArkStory(text)) {
    return "heterogeneous-computing-ark";
  }
  if (isGreenSaharaStory(text)) {
    return "green-sahara-climate-history";
  }
  if (isWaterIceStructureStory(text)) {
    return "water-ice-hydrogen-bond-structure";
  }
  if (isPlantRootAvoidanceStory(text)) {
    return "plant-root-decay-avoidance";
  }
  if (isStudentAntiFraudStory(text)) {
    return "student-summer-anti-fraud";
  }
  if (isFoodToySafetyStory(text)) {
    return "food-toy-dual-safety-standards";
  }
  if (isSixGNetworkStory(text)) {
    return "six-g-next-generation-network";
  }
  if (isAgriculturalAerialCropCareStory(text)) {
    return "heilongjiang-aerial-crop-care";
  }
  if (isMaritimeScienceSeasonStory(text)) {
    return "national-maritime-science-season";
  }
  if (isLabAstrophysicsStory(text)) {
    return "lab-astrophysics-extreme-universe";
  }
  if (isBrainComputerSummerClassStory(text)) {
    return "brain-computer-interface-summer-class";
  }
  if (isStudentRailTicketStory(text)) {
    return "summer-rail-student-ticket-rules";
  }
  if (/黏土大桥|万名工程师进课堂|工程师进课堂|搭起科学梦/.test(text)) {
    return "engineers-classroom-bridge-model";
  }
  if (/火箭卫星|卫星/.test(text) && /血管神经|大国重器幕后|硬核科技|编织/.test(text)) {
    return "rocket-satellite-harness-system";
  }
  if (/机器人下田|农业无人飞机|农业无人机|新农人|喷洒箱|播撒箱|吊运机构/.test(text)) {
    return "agriculture-drone-fieldwork";
  }
  if (isHighlandDroneResearchStory(text)) {
    return "tibet-plateau-drone-research-center";
  }
  if (/通信试验卫星二十六号A星/.test(text)) {
    return "communications-test-satellite-26a";
  }
  if (/卫星互联网/.test(text) && /发射|入轨|长二丁|长征二号丁/.test(text)) {
    return "satellite-internet-launch";
  }
  if (/中国科技馆|科普大篷车|精准服务工程/.test(text) && /福建|宁德|古田|基层科学教育|革命老区/.test(text)) {
    return "china-science-museum-ningde-outreach";
  }
  if (/人工智能|AI/.test(text) && /青少年|学生|教育|课堂|学校/.test(text)) {
    return normalizeForDedupe(text).includes("培养青少年") ? "ai-youth-education" : "";
  }
  return "";
}

function newsTitleDedupeKey(value = "") {
  return normalizeForDedupe(String(value)
    .replace(/[+＋]/g, "")
    .replace(/\d+月\d+日/g, "")
    .replace(/即将|将于|正式|开始|举行|召开/g, "")
  );
}

function savedNewsTitleKey(value = "") {
  return newsTitleDedupeKey(String(value).replace(/^.*小情报：/, ""));
}

function wasRecentlySentNews(item, state = {}) {
  const itemKey = newsTitleDedupeKey(kidNewsTitle(item));
  if (!itemKey) return false;
  const itemTopicKey = semanticTopicKey(item);
  const recentTitles = [
    ...(Array.isArray(state.recentNewsTitles) ? state.recentNewsTitles : []),
    ...(Array.isArray(state.lastNewsTitles) ? state.lastNewsTitles : [])
  ];
  return recentTitles.some((title) => {
    if (itemTopicKey && semanticTopicKey({ title, description: "" }) === itemTopicKey) return true;
    if (titlesAreSemanticDuplicates(kidNewsTitle(item), String(title).replace(/^.*小情报[：:]\s*/, ""))) return true;
    const recentKey = savedNewsTitleKey(title);
    return recentKey && (recentKey.includes(itemKey.slice(0, 24)) || itemKey.includes(recentKey.slice(0, 24)));
  });
}

function filterPreviouslySentNews(news, state) {
  return news.filter((item) => !wasRecentlySentNews(item, state));
}

function hasConcreteChildExplanation(item) {
  const title = kidNewsTitle(item);
  const summary = kidSummary(item);
  const value = kidNewsValue(item);
  const impact = kidNewsImpact(item);
  const titleKey = normalizeForDedupe(title);
  const summaryKey = normalizeForDedupe(summary);
  const summaryCopiesTitle = titleKey && summaryKey && (
    summaryKey === titleKey ||
    (summaryKey.includes(titleKey) && summaryKey.length <= titleKey.length + 6)
  );
  const issues = newsQualityIssues({
    sourceTitle: item.title,
    sourceDescription: item.description,
    title,
    summary,
    value,
    impact
  });
  if (issues.length && process.env.PEACH_NEWS_DEBUG_QUALITY === "true") {
    console.log(`Rejected Peach candidate: ${item.title} :: ${issues.join(" / ")}`);
  }
  return !summaryCopiesTitle && issues.length === 0;
}

function normalizeForDedupe(value) {
  return value
    .replace(/\s+/g, "")
    .replace(/[《》“”"'：:，,。！？!?、（）()·\-]/g, "")
    .slice(0, 40);
}

function textFingerprint(value) {
  return stripHtml(value)
    .replace(/^百科小知识：/, "")
    .replace(/\s+/g, "")
    .replace(/[《》“”"'：:，,。！？!?、（）()·\-]/g, "")
    .toLowerCase()
    .slice(0, 96);
}

function getRecentTextFingerprints(state, key, extra = [], limit = Number.POSITIVE_INFINITY) {
  const saved = Array.isArray(state[key]) ? state[key].slice(-limit) : [];
  return new Set([...saved, ...extra].map(textFingerprint).filter(Boolean));
}

function shortNewsFocus(item) {
  const cleaned = cleanNewsText(item.title)
    .replace(/^【[^】]+】/, "")
    .replace(/^[^｜|]{1,8}[｜|]/, "")
    .trim();
  if (cleaned.length <= 18) return cleaned || item.category || "这条新闻";
  return `${cleaned.slice(0, 18)}…`;
}

function sourceLabel(item) {
  const time = item.published
    ? new Intl.DateTimeFormat("zh-CN", {
      timeZone: TIMEZONE,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(item.published))
    : "发布时间未知";
  const publisher = item.publisher && item.publisher !== item.feed ? `${item.publisher} / ${item.feed}` : item.feed;
  return `${publisher}，${time}`;
}

async function fetchFeed(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: { "user-agent": "PeachDailyNews/1.0" }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    return normalizeItems(parser.parse(xml), feed);
  } catch (error) {
    console.warn(`Feed failed: ${feed.name}: ${error.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function readCuratedNews() {
  try {
    const parsed = JSON.parse(await fs.readFile(CURATED_NEWS_FILE, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("curated news must be a JSON array");
    return parsed.map((item) => ({
      ...item,
      published: Date.parse(item.published || "") || 0,
      feed: item.feed || "人工核对",
      publisher: item.publisher || "人工核对",
      domain: getSourceDomain(item.link, item.publisher || item.feed || "人工核对"),
      category: item.category || "中国",
      weight: Number(item.weight || 20)
    })).filter((item) => item.title && item.link && item.published);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error(`Failed to read ${CURATED_NEWS_FILE}: ${error.message}`);
  }
}

async function collectNews(asOf = NEWS_AS_OF, previousState = {}) {
  const batches = await Promise.all([readCuratedNews(), ...feeds.map(fetchFeed)]);
  const seen = new Set();
  const seenTopics = new Set();
  const items = batches.flat()
    .filter((item) => isFresh(item, asOf))
    .filter(isSuitableForKids)
    .filter((item) => !wasRecentlySentNews(item, previousState))
    .filter(hasConcreteChildExplanation)
    .filter((item) => {
      const topicKey = semanticTopicKey(item);
      if (topicKey) {
        if (seenTopics.has(topicKey)) return false;
        seenTopics.add(topicKey);
      }
      const key = normalizeForDedupe(item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({ ...item, score: scoreItem(item, asOf) }))
    .sort((a, b) => b.score - a.score);

  const valuableItems = items.filter((item) => item.score >= 7);
  const selected = [];
  const publisherCounts = new Map();
  const categoryCounts = new Map();

  const canUse = (item, relaxed = false) => {
    if (selected.includes(item)) return false;
    const publisherKey = item.publisher || item.domain || item.feed;
    if (!relaxed && (publisherCounts.get(publisherKey) || 0) >= MAX_ITEMS_PER_PUBLISHER) return false;
    if (!relaxed && (categoryCounts.get(item.category) || 0) >= 3) return false;
    return true;
  };

  const push = (item, relaxed = false) => {
    if (!item || !canUse(item, relaxed)) return false;
    selected.push(item);
    const publisherKey = item.publisher || item.domain || item.feed;
    publisherCounts.set(publisherKey, (publisherCounts.get(publisherKey) || 0) + 1);
    categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
    return true;
  };

  const editorialPriorityItems = valuableItems.filter((item) =>
    item.kidTitle &&
    item.kidSummary &&
    item.kidValue &&
    item.kidImpact &&
    item.weight >= 100
  );
  for (const item of editorialPriorityItems) {
    if (selected.length >= TARGET_NEWS_COUNT) break;
    push(item);
  }

  // Do not fill a complete, source-diverse edited issue with lower-confidence feed rewrites.
  if (selected.length >= MIN_DAILY_NEWS_COUNT && publisherCounts.size >= MIN_DAILY_PUBLISHER_COUNT) {
    return selected.slice(0, TARGET_NEWS_COUNT);
  }

  for (const preferred of ["科技", "教育", "中国", "经济", "全球", "健康"]) {
    if (selected.length >= TARGET_NEWS_COUNT) break;
    const item = valuableItems.find((candidate) => candidate.category === preferred && canUse(candidate));
    push(item);
  }
  for (const item of valuableItems) {
    if (selected.length >= TARGET_NEWS_COUNT) break;
    push(item);
  }
  for (const item of valuableItems) {
    if (selected.length >= MAX_NEWS_COUNT) break;
    if (selected.length >= TARGET_NEWS_COUNT && item.score < 18) continue;
    push(item);
  }
  for (const item of valuableItems) {
    if (selected.length >= TARGET_NEWS_COUNT) break;
    push(item, true);
  }
  return selected.slice(0, TARGET_NEWS_COUNT);
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function getLocalParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function getLocalDateKey(date = new Date()) {
  const parts = getLocalParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shouldSendScheduledEmail(state, now = new Date()) {
  if (isDryRun || isTest || isForceSend) {
    return { ok: true, reason: "dry-run-or-test-or-forced" };
  }

  const parts = getLocalParts(now);
  if (Number(parts.hour) !== SEND_HOUR) {
    return { ok: false, reason: `outside-send-hour:${parts.hour}` };
  }

  const todayKey = getLocalDateKey(now);
  if (state.lastSentDate === todayKey) {
    return { ok: false, reason: `already-sent:${todayKey}` };
  }

  return { ok: true, reason: "scheduled-window" };
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function cleanNewsText(value = "") {
  return stripHtml(value)
    .replace(/中新网\S*?\d+月\d+日电\s*/g, "")
    .replace(/新华社\S*?\d+月\d+日电\s*/g, "")
    .replace(/中新社\S*?\d+月\d+日电\s*/g, "")
    .replace(/人民网\S*?\d+月\d+日电\s*/g, "")
    .replace(/^\d+月\d+日，记者[^。！？]*[。！？]\s*/g, "")
    .replace(/^[(（][^()（）]{2,24}[)）]\s*/g, "")
    .replace(/^【[^】]{1,18}】\s*/g, "")
    .replace(/\(记者[^)]*\)/g, "")
    .replace(/（记者[^）]*）/g, "")
    .replace(/责任编辑：\S+/g, "")
    .replace(/[-－—]\s*[^-－—]{1,14}的博文$/g, "")
    .replace(/\s+(jfdaily\.com|Sina finance|新浪财经|上观新闻)$/i, "")
    .replace(/_[\u4e00-\u9fffA-Za-z0-9]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulDescription(value = "") {
  const cleaned = value.trim();
  if (cleaned.length < 18) return false;
  if (/^\|/.test(cleaned)) return false;
  if ((cleaned.match(/\|/g) || []).length >= 2) return false;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) return false;
  if (/手机新浪网|客户端|栏目$/.test(cleaned)) return false;
  return true;
}

function takeReadableSentences(value, maxLength = 190) {
  const sentences = value.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  let result = "";
  for (const sentence of sentences) {
    if ((result + sentence).length > maxLength && result) break;
    result += sentence;
    if (result.length >= maxLength) break;
  }
  const text = (result || value).slice(0, maxLength).trim();
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

function simplifyTerms(value) {
  return value
    .replace(/具身智能/g, "会感知、会行动的智能机器人")
    .replace(/创新创业/g, "新点子实践")
    .replace(/赋能/g, "帮助")
    .replace(/启幕/g, "开始")
    .replace(/角逐/g, "比赛")
    .replace(/赛事/g, "比赛")
    .replace(/依托/g, "借助")
    .replace(/区位优势/g, "地理位置")
    .replace(/常态化/g, "经常")
    .replace(/全方位/g, "从多方面")
    .replace(/核心方向/g, "重点")
    .replace(/跨境/g, "跨过国界")
    .replace(/青少年/g, "小朋友和中学生")
    .replace(/心脏骤停/g, "突然倒下")
    .replace(/医者仁心/g, "热心帮人")
    .replace(/三箭齐发/g, "都有新进展")
    .replace(/新突破/g, "有新进展")
    .replace(/通信技术试验卫星/g, "通信试验卫星")
    .replace(/公举办示/g, "公开展示")
    .replace(/国事访问/g, "正式访问")
    .replace(/成果丰硕/g, "收获不少")
    .replace(/核心引擎/g, "重要小马达")
    .replace(/可运营、可迭代、可变现的数字生态/g, "能持续改进的新数字世界")
    .replace(/宏观经济/g, "整个国家和社会里的钱、生产和生活")
    .replace(/并网/g, "接到大电网里")
    .replace(/装机规模/g, "能发电的设备总量")
    .replace(/产业链/g, "从原料、工厂到商店的一整条队伍")
    .replace(/产业/g, "行业")
    .replace(/强降雨/g, "大雨");
}

function ensureSentenceEnd(value = "") {
  const cleaned = value.trim().replace(/[，,、；;：:]$/g, "");
  if (!cleaned) return "";
  return /[。！？.!?]$/.test(cleaned) ? cleaned : `${cleaned}。`;
}

function trimKidText(value, maxLength = 120) {
  const cleaned = simplifyTerms(cleanNewsText(value))
    .replace(/[；;]/g, "。")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return ensureSentenceEnd(cleaned);

  const sentences = cleaned
    .split(/(?<=[。！？.!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/客户端|责任编辑|点击|原文链接/.test(sentence));
  let result = "";
  for (const sentence of sentences) {
    if ((result + sentence).length > maxLength && result) break;
    result += sentence;
    if (result.length >= maxLength) break;
  }

  if (!result) {
    const parts = cleaned.split(/(?<=[，,、])\s*/).filter(Boolean);
    for (const part of parts) {
      if ((result + part).length > maxLength && result) break;
      result += part;
      if (result.length >= maxLength) break;
    }
  }

  return ensureSentenceEnd((result || cleaned).slice(0, maxLength));
}

function isLabAstrophysicsStory(text = "") {
  return /地下方寸造.*宇宙|地下实验室.*宇宙|实验室天体物理|极端物理环境|李政道研究所|探秘.*黑科技.*实验室|天体物理/.test(text);
}

function isBrainComputerSummerClassStory(text = "") {
  return /(?:暑托班|暑期托管班|假日学校|家门口触摸前沿科技|青少年.{0,12}(?:体验|了解)).{0,30}(?:脑机接口|前沿科技)|脑机接口.{0,30}(?:暑托班|暑期托管班|假日学校|青少年体验)/.test(text);
}

function isFieldArchaeologyStory(text = "") {
  return /手铲释读三千年|琉璃河遗址|田野考古实习|田野考古|考古实习/.test(text);
}

function isSmartRobotApplicationStory(text = "") {
  return /从“?能动”?变“?能用”?|会感知、会行动的智能机器人|具身智能|具身机器人|智能机器人.*能用|机器人.*感知.*行动|机器人.*多场景.*打工|多场景.*机器人/.test(text);
}

function isNewEnergyPassengerExportStory(text = "") {
  return /新能源乘用车出口|乘联分会.*新能源|乘用车出口.*新能源|新能源车.*出口占比/.test(text);
}

function isAiWorkforceTrainingStory(text = "") {
  return /人工智能\+.*专项培训|AI\+.*专项培训|人工智能领域技术技能培训|每年培训超?20万人次/.test(text);
}

function isWaterLngBunkeringStory(text = "") {
  return /水上LNG加注站|LNG加注趸船|海港星01|长江干线首座.*加注站/.test(text);
}

function isHighAltitudeAtmosphereDroneStory(text = "") {
  return /巅峰使命.*8861米|垂直起降运载无人机.*8861米|8000米以上.*大气剖面|高海拔.*大气.*无人机/.test(text);
}

function isLithiumMetalBatteryElectrolyteStory(text = "") {
  return /新型电解液.*锂金属电池|锂金属电池.*增能延寿|锂金属电池.*循环寿命/.test(text);
}

function isDisasterPreventionTechnologyStory(text = "") {
  return /防减救灾.*新科技|拼体力.*拼算力|卫星遥感即时应急|AI哨兵.*防汛/.test(text);
}

function isUrbanDrainageFloodControlStory(text = "") {
  return /城市排水防涝|积水路段.*管控|防洪和排涝设施/.test(text);
}

function isFloodMedicalResponseStory(text = "") {
  return /洪涝灾害医疗救援|临时医疗点|伤员得到有效救治/.test(text);
}

function isReusableRocketRecoveryStory(text = "") {
  return /首次成功实施重复使用运载火箭回收|长征十号乙.*(?:回收|重复使用)|运载火箭.*网系回收|火箭一子级.*可控回收/.test(text);
}

function isNationalPowerLoadRecordStory(text = "") {
  return /全国用电负荷.*15\.18亿千瓦|全国用电负荷.*历史新高|清凉度夏.*用电需求/.test(text);
}

function isSummerGrainRecordStory(text = "") {
  return /全国夏粮产量.*3000亿斤|夏粮产量首次突破/.test(text);
}

function isHighSpeedRail385TestStory(text = "") {
  return /西康高铁.*385公里|高铁启动时速385公里.*提速试验|检测列车.*385公里/.test(text);
}

function isQinghaiLakeNakedCarpStory(text = "") {
  return /湟鱼见证青海湖生态之变|青海湖.*湟鱼|湟鱼.*增长超五十倍/.test(text);
}

function isTyphoonMaritimeResponseStory(text = "") {
  return /福建海事局.*防台风.*应急响应|海上交通.*关停撤转|沿海客渡运航线.*(?:关闭|停航)|客渡船.*(?:取消运营|进港避风)/.test(text);
}

function isTyphoonPublicSafetyStory(text = "") {
  return /全省转移危险区域人员18万多人|转移危险区域人员18\.?(?:8|84)?万|省防指终止防台风应急响应|台风预警Ⅳ级.*暴雨预警Ⅳ级|警惕地质灾害滞后性/.test(text);
}

function isApecDigitalWeekStory(text = "") {
  return /2026年APEC数字周|APEC.*数字和人工智能部长会议|数据促进增长.*主题参访/.test(text);
}

function isWaterIceStructureStory(text = "") {
  return /水、冰结构世界难题|水的氢键强度|单根氢键|看清.*水分子.*氢原子|全量子效应.*水/.test(text);
}

function isIndustrialAiManufacturingStory(text = "") {
  return /云南.*人工智能.*(?:炼铝|制磷|炮制中药)|人工智能\+制造.*(?:有色金属|磷化工|中药材)|人工智能.*(?:铝电解|磷化工|中药材.*炮制)/.test(text);
}

function isAmazonBioculturalKnowledgeStory(text = "") {
  return /亚马孙.*(?:文化知识|知识损失|植物物种|当地居民语言)|生物多样性减少.*亚马孙|知识森林.*亚马孙/.test(text);
}

function isHeterogeneousComputingArkStory(text = "") {
  return /异算方舟|国产计算系统软件生态|(?:代码迁移|算法库).*(?:国产计算|计算设备|芯片)|(?:国产计算|计算设备|芯片).*(?:代码迁移|算法库)/.test(text);
}

function isGreenSaharaStory(text = "") {
  return /绿色撒哈拉|世界最大沙漠.*(?:水文气候|人口变化)|撒哈拉.*(?:水文气候|湿润环境|人口变化|沙漠形成)/.test(text);
}

function isPlantRootAvoidanceStory(text = "") {
  return /植物根系.*避腐性|根系.*(?:腐烂|腐败).*(?:绕开|逃避|回避)|植物新向性生长|根系主动对植物腐败物/.test(text);
}

function isStudentAntiFraudStory(text = "") {
  return /暑期反诈指南|学生群体.*电诈|中小学生.*诈骗|免费送皮肤.*诈骗|屏幕共享.*盗刷/.test(text);
}

function isFoodToySafetyStory(text = "") {
  return /食品玩具跨界产品|玩具包装为食品|食品.*玩具.*双重安全|音乐棒棒糖|针管糖/.test(text);
}

function isSixGNetworkStory(text = "") {
  return /6G.*未来世界.*神经网络|第六代移动通信|6G.*万物智联|6G.*空天地一体化/.test(text);
}

function isHighlandDroneResearchStory(text = "") {
  return /高原无人机|无人机研发应用中心|西藏大学/.test(text)
    || (/低空经济/.test(text) && /西藏|高原/.test(text));
}

function isAgriculturalAerialCropCareStory(text = "") {
  return /科技夏管|航化作业|航空植保|53万亩农田|农用植保飞机/.test(text);
}

function isMaritimeScienceSeasonStory(text = "") {
  return /全国航海科普季|匠说航海|航海科普/.test(text);
}

function isStudentRailTicketStory(text = "") {
  return /学生票|学生优惠票|学生购票|学生.*预约购票|铁路.*学生|暑运.*学生|暑期.*返校/.test(text);
}

function isYouthRobotCompetitionStory(text = "") {
  return /青少年.{0,14}机器人.{0,10}(?:大赛|比赛)|机器人设计大赛/.test(text);
}

function isSanjiangEcologyStory(text = "") {
  return /三江源生态|三江源地区|中华水塔/.test(text);
}

function kidNewsTitle(item) {
  if (item.kidTitle) return trimKidText(item.kidTitle, 72).replace(/[。！？!?]+$/g, "");
  const title = simplifyTerms(cleanNewsText(item.title))
    .replace(/[！!]+$/g, "")
    .trim();
  if (isIndustrialAiManufacturingStory(`${title} ${item.description}`)) {
    return "云南计划让 AI 帮助炼铝、制磷和加工中药";
  }
  if (isAmazonBioculturalKnowledgeStory(`${title} ${item.description}`)) {
    return "研究发现：亚马孙植物和语言减少会让传统知识流失";
  }
  if (/飞越卡门线|火箭制造|李东解密火箭/.test(title)) {
    return "航天工程师讲火箭怎样飞过卡门线";
  }
  if (/产教融合创新实践案例|科技小院/.test(`${title} ${item.description}`)) {
    return "科技小院把农业课堂搬到田间";
  }
  if (/科普帮助扬帆计划|科技创新巾帼行动|巾帼行动.*科普/.test(`${title} ${item.description}`)) {
    return "科普帮助计划把科学活动送到孩子身边";
  }
  if (isSmartMountainHighwayStory(`${title} ${item.description}`)) {
    return "秦巴山区高速公路用 AI 帮忙巡查风险";
  }
  if (/白鹤滩水电站|水电大国重器|水电科技|水电.*珠穆朗玛峰/.test(`${title} ${item.description}`)) {
    return "白鹤滩水电站展示大型水电工程";
  }
  if (/固体助推发动机|百台交付|百台成功/.test(`${title} ${item.description}`)) {
    return "固体助推发动机完成百台交付和成功应用";
  }
  if (isFieldArchaeologyStory(`${title} ${item.description}`)) {
    return "国际学生在琉璃河遗址学习田野考古";
  }
  if (isSmartRobotApplicationStory(`${title} ${item.description}`)) {
    return "智能机器人从会动走向会干活";
  }
  if (isNewEnergyPassengerExportStory(`${title} ${item.description}`)) {
    return "新能源乘用车出口占比创新高";
  }
  if (isAiWorkforceTrainingStory(`${title} ${item.description}`)) {
    return "江苏每年将培训超20万人次学习人工智能技能";
  }
  if (isWaterLngBunkeringStory(`${title} ${item.description}`)) {
    return "长江首座水上LNG加注站服务新能源船舶";
  }
  if (isHighAltitudeAtmosphereDroneStory(`${title} ${item.description}`)) {
    return "无人机飞到8861米高空收集大气数据";
  }
  if (isLithiumMetalBatteryElectrolyteStory(`${title} ${item.description}`)) {
    return "新型电解液让锂金属电池更耐用";
  }
  if (isDisasterPreventionTechnologyStory(`${title} ${item.description}`)) {
    return "卫星、无人机和AI一起帮助防灾";
  }
  if (isUrbanDrainageFloodControlStory(`${title} ${item.description}`)) {
    return "城市加强排水防涝准备";
  }
  if (isFloodMedicalResponseStory(`${title} ${item.description}`)) {
    return "广西洪涝地区增设临时医疗点";
  }
  if (isReusableRocketRecoveryStory(`${title} ${item.description}`)) {
    return "长征十号乙完成可重复使用火箭回收";
  }
  if (isNationalPowerLoadRecordStory(`${title} ${item.description}`)) {
    return "全国用电负荷达到15.18亿千瓦新高";
  }
  if (isSummerGrainRecordStory(`${title} ${item.description}`)) {
    return "全国夏粮产量首次突破3000亿斤";
  }
  if (isHighSpeedRail385TestStory(`${title} ${item.description}`)) {
    return "西康高铁完成时速385公里测试";
  }
  if (isQinghaiLakeNakedCarpStory(`${title} ${item.description}`)) {
    return "青海湖湟鱼种群恢复到保护初期50多倍";
  }
  if (isTyphoonMaritimeResponseStory(`${title} ${item.description}`)) {
    return "福建沿海为防台风暂停大部分海上交通";
  }
  if (isTyphoonPublicSafetyStory(`${title} ${item.description}`)) {
    return /终止防台风|解除.*台风预警/.test(`${title} ${item.description}`)
      ? "台风警报解除后仍要防范暴雨和山体滑坡"
      : "福建提前转移18万多名危险区域人员躲避台风";
  }
  if (isApecDigitalWeekStory(`${title} ${item.description}`)) {
    return "APEC数字周将讨论人工智能、反诈骗和网络安全";
  }
  if (isWaterIceStructureStory(`${title} ${item.description}`)) {
    return "科学家更清楚地看见水和冰里的分子排列";
  }
  if (isPlantRootAvoidanceStory(`${title} ${item.description}`)) {
    return "科学家发现植物根系会绕开腐烂植物";
  }
  if (isStudentAntiFraudStory(`${title} ${item.description}`)) {
    return "公安机关发布学生暑期防诈骗提醒";
  }
  if (isFoodToySafetyStory(`${title} ${item.description}`)) {
    return "食品和玩具组合商品要守住双重安全标准";
  }
  if (isSixGNetworkStory(`${title} ${item.description}`)) {
    return "6G正在进入技术验证和标准制定阶段";
  }
  if (isAgriculturalAerialCropCareStory(`${title} ${item.description}`)) {
    return "黑龙江萝北用植保飞机为53万亩农田开展夏季管护";
  }
  if (isMaritimeScienceSeasonStory(`${title} ${item.description}`)) {
    return "2026年全国航海科普季启动";
  }
  if (/这封信，写给2026届高校毕业生|毕业典礼变.*就业直通车|大学生集体毕业典礼/.test(`${title} ${item.description}`)) {
    return "毕业典礼和就业服务连在一起";
  }
  if (isLabAstrophysicsStory(`${title} ${item.description}`)) {
    return "地下实验室模拟宇宙里的极端环境";
  }
  if (isBrainComputerSummerClassStory(`${title} ${item.description}`)) {
    return "暑托班带孩子了解脑机接口";
  }
  if (isStudentRailTicketStory(`${title} ${item.description}`)) {
    return "暑运期间学生买火车票规则有变化";
  }
  if (/黏土大桥|万名工程师进课堂|工程师进课堂|搭起科学梦/.test(`${title} ${item.description}`)) {
    return "工程师进课堂带孩子做黏土大桥";
  }
  if (/普特融合|科技融爱成长|宁远县第十三完全小学/.test(title)) {
    return "宁远小学开展普特融合科技主题活动";
  }
  if (/网安阵线|网络安全.*育人共同体/.test(title)) {
    return "高校联合培养网络安全人才";
  }
  if (/人造太阳|合肥科学岛/.test(`${title} ${item.description}`)) {
    return "7国青年在合肥科学岛了解人造太阳";
  }
  if (!title) return "一条值得知道的新闻";
  return title.length <= 34 ? title : `${title.slice(0, 32)}...`;
}

function kidTopicSummary(item) {
  const text = `${item.title} ${item.description}`;
  if (isTyphoonPublicSafetyStory(text)) {
    if (/终止防台风|解除.*台风预警/.test(text)) {
      return "台风中心离开福建警戒区后，当地结束防台风应急响应，但暴雨预警仍在继续。有关部门提醒，强降雨过后山坡和土层可能过一段时间才发生滑坡，所以还要巡查山洪沟口、陡坡和涉水工程。";
    }
    return "台风“巴威”登陆前后，福建把渔船人员、养殖渔排人员和危险区域居民提前转移到安全地点，累计转移危险区域人员18万多人。转移不是等房屋进水后再跑，而是在强风暴雨到来前先离开高风险位置。";
  }
  if (isApecDigitalWeekStory(text)) {
    return "2026年APEC数字周将在成都举行。来自多个经济体的代表会讨论宽带连接、人工智能应用、反网络诈骗、安全上网和数据怎样帮助社会发展，并分享各地已经使用过的做法。";
  }
  if (/莞香树|结香|植物.*黑科技/.test(text)) {
    return "莞香树受伤后会分泌树脂保护伤口，树脂和木材经过很长时间变化，才可能形成有香气的沉香。科普老师带学生观察这个过程，认识植物也有自己的“防护办法”。";
  }
  if (/玩飞机|航模|模型飞机|科技特长生/.test(text)) {
    return "孩子们通过制作和操控模型飞机，观察机翼、气流和方向控制怎样影响飞行。它不只是“玩飞机”，还把物理、设计、动手制作和安全规则放在一起学习。";
  }
  if (/机器人.*出汗|散热刚需|算力爆发.*散热/.test(text)) {
    return "机器人和高性能芯片工作时会产生很多热量，温度太高就可能变慢或损坏。工程师正在研究液体循环、微小通道和像“出汗蒸发”一样的办法，把热量更快带走。";
  }
  if (/卡门线|火箭制造|李东解密火箭/.test(text)) {
    return "这条新闻请航天工程师讲火箭制造。卡门线常被用来表示接近太空的高度边界；火箭要越过大气层，需要发动机、结构、控制系统和燃料一起精准配合。";
  }
  if (/机器人学校|机器人.*开学|背答案.*会解题|机器人上学/.test(text)) {
    return "杭州出现了一个“机器人学校”。这里的学生不是小朋友，而是不同形态的机器人；它们要在训练场里练习理解任务、移动、操作物品和应对变化，不只是背固定答案。";
  }
  if (/科普帮助扬帆计划|科技创新巾帼行动|巾帼行动.*科普/.test(text)) {
    return "江苏的科普帮助活动把科学讲解、实验体验和志愿服务带到更多孩子身边。它关注的是让孩子有机会接触科学，而不只是听到一个活动名称。";
  }
  if (isSmartMountainHighwayStory(text)) {
    return "秦巴山区的高速公路穿过山地、隧道和桥梁，巡查难度比平原道路更大。新闻里提到用无人机、监控设备和 AI 系统一起观察路况，帮助更早发现风险。";
  }
  if (/白鹤滩水电站|水电大国重器|水电科技|水电.*珠穆朗玛峰/.test(text)) {
    return "白鹤滩水电站是一座大型水电工程。江水推动水轮机转动，再带动发电机发电；这样的大工程还需要大坝安全、设备控制和长期监测一起配合。";
  }
  if (/固体助推发动机|百台交付|百台成功/.test(text)) {
    return "中国航天科技四院的固体助推发动机完成了百台交付和成功应用。助推发动机像给火箭起飞时加一把大力气，帮助火箭带着更重的设备稳定离开地面。";
  }
  if (isFieldArchaeologyStory(text)) {
    return "北京琉璃河遗址开展田野考古实习，国际学生跟着老师学习用手铲清理土层、记录位置、观察陶片和遗迹。考古不是挖宝，而是把每一层土和每一件遗物当作证据，慢慢读懂几千年前的人怎样生活。";
  }
  if (isSmartRobotApplicationStory(text)) {
    return "北京一些智能机器人正在从“能动”走向“能用”。它们不只是会摆姿势或说话，还要感知周围环境、理解任务、移动到合适位置，再完成搬运、巡检或服务等真实动作。";
  }
  if (isNewEnergyPassengerExportStory(text)) {
    return "乘联分会公布数据，6 月新能源乘用车出口占乘用车出口的 56.9%，占比创出新高。简单说，在出口汽车里，电动车、插电混动车等新能源车的比例更高了。";
  }
  if (isAiWorkforceTrainingStory(text)) {
    return "江苏启动“人工智能+”技能培训行动，计划每年培训超过20万人次。参加者包括企业职工、高校毕业生和就业困难人员，课程会按不同工作需要安排，不是把同一套内容教给所有人。";
  }
  if (isWaterLngBunkeringStory(text)) {
    return "长江南京段的“海港星01”是一座停在水上的LNG加注站，能直接为使用液化天然气的船舶补充燃料。它像船舶的水上加油站，减少船为加气绕远路或靠岸等待的时间。";
  }
  if (isHighAltitudeAtmosphereDroneStory(text)) {
    return "一架垂直起降运载无人机在“巅峰使命”任务中飞到海拔8861米，携带仪器测量高空大气。过去，8000米以上的温度、气压和臭氧等连续数据很难直接取得，这次飞行提供了新的观测办法。";
  }
  if (isLithiumMetalBatteryElectrolyteStory(text)) {
    return "南京大学团队研制了一种新型电解液，让锂金属电池在装下更多能量的同时，也能反复充放电更久。实验中，一种电池在每千克450瓦时的能量密度下循环超过750次，研究成果已发表在《自然》上。";
  }
  if (isDisasterPreventionTechnologyStory(text)) {
    return "防汛救灾正在用上更多数字工具：卫星能快速比较灾前灾后的地图，无人机能巡查人难靠近的河道和山坡，AI系统还能从大量监控画面里寻找积水、火情等风险，再把位置发给工作人员。";
  }
  if (isUrbanDrainageFloodControlStory(text)) {
    return "住房城乡建设部要求各地排查容易积水的路段，检查排水设施，并让气象、水利、交通等部门一起调度。面对台风和强降雨，城市不仅要准备抽水设备，也要提前管控危险路段和组织演练。";
  }
  if (isFloodMedicalResponseStory(text)) {
    return "广西一些地方遭遇洪涝后，在集中安置点设置临时医疗点，医务人员全天提供服务，并准备常用药品、急救设备和应急床位。孕产妇、婴幼儿和急重症患者会优先转到合适的医院。";
  }
  if (isReusableRocketRecoveryStory(text)) {
    return "长征十号乙火箭完成首飞，并把一级箭体控制着飞回海上平台，由一张大型回收网接住。这是中国首次成功回收重复使用运载火箭，也是全球第一次完成火箭网系回收。";
  }
  if (isNationalPowerLoadRecordStory(text)) {
    return "7月10日，全国用电负荷最高达到15.18亿千瓦，创下新纪录。这里的“负荷”表示同一时刻大家一共需要多少电力；高温带来的空调用电和更多设备电气化，让用电需求快速上升。";
  }
  if (isSummerGrainRecordStory(text)) {
    return "国家统计数据显示，全国夏粮产量首次超过3000亿斤，也就是超过1500亿千克。夏粮主要包括冬小麦等夏季收获的粮食，是全年粮食生产的第一季。";
  }
  if (isHighSpeedRail385TestStory(text)) {
    return "西康高铁的检测列车经过一轮轮逐级提速，跑到每小时385公里。这个速度用于开通前测试，不是今后载客列车的日常速度；工程师会同时检查轨道、桥梁、供电、信号和列车状态。";
  }
  if (isQinghaiLakeNakedCarpStory(text)) {
    return "青海湖湟鱼进入一年一度的洄游季，会逆流游进河道产卵。经过封湖禁捕、修建鱼道、巡护救助和放流幼鱼，湟鱼资源量从保护初期的0.26万吨恢复到13.35万吨，增长超过50倍。";
  }
  if (isTyphoonMaritimeResponseStory(text)) {
    return "台风靠近时，福建沿海暂停大部分客运航线，客船进港避风，海上施工和风电项目也提前停工撤人。这样做不是等风雨来了再处理，而是在危险海况出现前先把人和船转移到安全位置。";
  }
  if (isWaterIceStructureStory(text)) {
    return "北京大学团队改进理论计算和超高分辨成像方法，第一次更清楚地看见水分子里的氢原子，并测量单根氢键的强度。氢键会影响水分子怎样排列，也是理解水和冰结构的关键。";
  }
  if (isPlantRootAvoidanceStory(text)) {
    return "西北农林科技大学团队发现，植物根系遇到腐烂植物周围的危险区域时，会感知真菌产生的酸性信号，让根尖弯向酸性较弱的一边。油菜、番茄和小麦等植物都出现了这种“避腐性”。";
  }
  if (isStudentAntiFraudStory(text)) {
    return "公安机关发布暑期防诈骗提醒：有人会用“免费送游戏皮肤”“高价收账号”等话术吸引学生，再诱导点击陌生链接、下载不明应用或开启屏幕共享。遇到这种情况，应立即停止操作并请家长核实。";
  }
  if (isFoodToySafetyStory(text)) {
    return "一些糖果同时带有可以玩的塑料配件，但包装上只写食品标准，没有完整的玩具安全标识。专家提醒，只要商品既能吃又能玩，就应同时符合食品和玩具两套安全要求，并标清适用年龄和小零件风险。";
  }
  if (isSixGNetworkStory(text)) {
    return "6G是5G之后的下一代移动通信技术，目前仍处在技术验证和标准制定阶段。它不只是追求更快网速，还想把地面网络、卫星、传感器和智能设备连接起来，让通信、感知和计算更紧密地配合。";
  }
  if (isAgriculturalAerialCropCareStory(text)) {
    return "黑龙江萝北县进入夏季农田管护期，植保飞机在53万亩农田上空喷洒防病、防虫和补肥所需的药液。飞机一次能覆盖较宽的田地，预计约20天完成这一轮作业。";
  }
  if (isMaritimeScienceSeasonStory(text)) {
    return "2026年全国航海科普季在江苏扬州启动。活动会通过讲座、场馆和实践体验，介绍船舶怎样航行、港口怎样工作、海上天气和安全规则为什么重要。";
  }
  if (isLabAstrophysicsStory(text)) {
    return "上海的科研团队用地下实验室里的强大设备，模拟宇宙中一些很极端的环境。远处的恒星、爆发和高温物质不能随便搬到地球上，但科学家可以在实验室里制造相似条件，观察物质会怎样变化。";
  }
  if (isBrainComputerSummerClassStory(text)) {
    return "暑托班里，孩子们体验和了解脑机接口。它不是读心术，而是用传感器记录大脑或身体发出的信号，再让电脑把这些信号变成简单指令，所以每一步都需要实验、校准和安全规则。";
  }
  if (isStudentRailTicketStory(text)) {
    return "铁路12306增加了学生预约购票功能。符合优惠条件的学生完成身份和优惠资质核验后，可以提前提交乘车日期、车次和席别需求，系统再按规则尝试兑现车票。";
  }
  if (isYouthRobotCompetitionStory(text)) {
    return "来自全国的2500多名青少年在重庆参加机器人设计大赛。参赛者要搭建机器人、编写程序，再让机器人按比赛任务完成识别、移动或操作。";
  }
  if (isSanjiangEcologyStory(text)) {
    return "风云卫星连续观察三江源地区，记录到植被覆盖提升、水体面积稳中有增、空气质量改善。多年的卫星数据让生态变化不只靠眼睛判断，还能用同一套方法长期比较。";
  }
  if (/黏土大桥|万名工程师进课堂|工程师进课堂|搭起科学梦/.test(text)) {
    return "工程师走进成都一所小学，带孩子用黏土等材料做桥梁模型。孩子通过动手搭桥，观察桥面、桥墩和受力结构怎样配合，理解工程不是画图就结束。";
  }
  if (/机器人下田|农业无人飞机|农业无人机|新农人|喷洒箱|播撒箱|吊运机构/.test(text)) {
    return "这条新闻讲的是农业无人飞机和智能设备进入农田。它们可以根据任务换上喷洒箱、播撒箱或吊运装置，帮助农民打药、撒肥、搬运果品，把一些辛苦、重复或有风险的农活交给机器完成。";
  }
  if (/农民田间学校|现场教学路线|综合畜牧|畜牧行业路线|精品路线/.test(text)) {
    return "山西大同的一条畜牧现场教学路线入选国家级名单。它不是普通旅游路线，而是把养牛、养羊等畜牧生产现场变成学习课堂，让农民和学生能到真实场景里看饲养、防疫、管理和加工怎样配合。";
  }
  if (isHighlandDroneResearchStory(text)) {
    return "西藏大学成立高原无人机研发应用中心。高原地区海拔高、地形复杂、天气变化快，无人机如果要安全工作，就要研究动力、通信、导航和抗风等问题。";
  }
  if (/火箭卫星|卫星/.test(text) && /血管神经|大国重器幕后|硬核科技|编织/.test(text)) {
    return "这条新闻介绍火箭和卫星背后的线缆、连接器等精密系统。它们像航天器里的“血管”和“神经”，负责传递电力和信号；如果连接不稳定，火箭和卫星就很难可靠完成任务。";
  }
  if (/人工智能安全要从娃娃抓起|AI衍生的新型侵害|人工智能衍生的新型侵害/.test(text)) {
    return "这条新闻提醒大家，AI 工具已经进入学习、娱乐和生活，孩子也可能接触到它。学校和家庭需要更早讲清楚：哪些信息不能随便交给 AI，遇到可疑内容要让大人一起判断。";
  }
  if (/7国青年|合肥科学岛|人造太阳/.test(text)) {
    return "来自多个国家的青年到合肥科学岛参观和交流，了解“人造太阳”相关研究。这里说的人造太阳不是在地上造一个太阳，而是研究核聚变，希望未来能获得更清洁、更强大的能源。";
  }
  if (/苦苣苔科|喜鹊苣苔|洞穴特有新物种/.test(text)) {
    return "科研人员在广西洞穴环境中发现了一种以前没有被正式记录的植物，取名为广西喜鹊苣苔。确认新物种要仔细比较叶、花等特征，还要用更多科学证据核对。";
  }
  if (/潍坊昌邑|昌邑/.test(text) && /绿色低碳|新能源/.test(text)) {
    return "山东潍坊昌邑把发展重点放到新能源和绿色低碳行业上。简单说，就是让更多企业研究清洁发电、节能材料和低污染生产方式，让城市发展不只看速度，也看资源用得是否更省。";
  }
  if (/衡南县科协|基层科普|乡村少年/.test(text)) {
    return "湖南衡南的科协把科普活动带到基层和乡村孩子身边。孩子们可以通过讲解、实验和科技活动接触科学，把课本里的知识和真实生活连接起来。";
  }
  if (/中国科技馆|科普大篷车|流动科普设施|精准服务工程/.test(text) && /福建|宁德|古田|基层科学教育/.test(text)) {
    return "中国科技馆把“科普大篷车”等流动展品送到福建宁德的学校和乡村。它像一座会移动的小科技馆，让离大城市展馆较远的孩子也能看到科学实验和展品。";
  }
  if (/银河航天|手机直连|相控阵天线|MWC/.test(text)) {
    return "银河航天在上海世界移动通信大会展示了新一代手机直连相控阵天线。可以把它理解成帮助手机和卫星“对准说话”的设备，目标是在地面信号弱的地方也能更容易通信。";
  }
  if (/超低轨|超低轨技术创新|空间治理/.test(text)) {
    return "中国成立了一个超低轨技术创新和行业发展联盟。超低轨卫星比普通低轨卫星飞得更低，离地球更近，可能看得更清楚、通信距离更短，但也更容易受到稀薄空气阻力影响。";
  }
  if (/国际农业科技合作|农业科技合作|绿色引领|农业高质量发展/.test(text)) {
    return "来自多个国家的农业科技专家在山东济南交流，讨论 AI、绿色种植和农业合作。简单说，就是用数据、机器和更环保的方法，帮助农田少浪费水肥，也更稳定地生产粮食。";
  }
  if (/普特融合|科技融爱成长|宁远县第十三完全小学/.test(text)) {
    return "湖南宁远一所小学举办了普特融合主题活动。“普特融合”指普通孩子和有特殊学习需要的孩子一起参加活动，科技体验也被用来帮助大家更好地理解、合作和成长。";
  }
  if (/兰州大学成立人工智能学院|兰州大学.*人工智能学院/.test(text)) {
    return "兰州大学成立了人工智能学院。人工智能不是只会聊天的工具，背后要学习数学、计算机、数据和真实问题，也要讨论怎样让技术更安全、更可靠地帮助人。";
  }
  if (/哈尔滨工程大学|哈工程/.test(text) && /航空航天|海空跨域|三海一核/.test(text)) {
    return "哈尔滨工程大学把航空航天相关学科继续加强，还提到海洋、航空、航天等方向的交叉。简单说，复杂工程常常不是一门课能解决，要把材料、动力、控制和计算一起用上。";
  }
  if (/网安阵线|网络安全.*育人共同体|西电/.test(text) && /网安|网络安全/.test(text)) {
    return "西安电子科技大学和多所高校、科研机构、企业一起成立网络安全育人共同体。网络安全就像给账号、数据和重要系统装上门锁、警报器和守门员。";
  }
  if (/高校学生资助热线|学生资助热线|010[—-]66097980|010[—-]66096590/.test(text)) {
    return "教育部宣布，2026 年暑期继续开通高校学生资助热线，时间从 7 月 1 日到 9 月 15 日，每天 8 点到 20 点。准备上大学或正在读大学的学生，如果担心学费、住宿费或助学贷款问题，可以让家长一起打电话咨询。";
  }
  if (isIndustrialAiManufacturingStory(text)) {
    return "云南发布“人工智能+制造”行动方案，计划把 AI 用到铝电解、磷化工安全控制和中药材加工等生产环节。系统会分析设备和生产数据，帮助工作人员发现异常、调整流程。";
  }
  if (isAmazonBioculturalKnowledgeStory(text)) {
    return "《自然》发表的一项研究汇总了亚马孙近5800种被当地居民使用的植物。模型预测，气候变化可能让部分植物在当地消失；如果一些当地语言也不再使用，植物名称、用途和经验可能一起流失。";
  }
  if (isHeterogeneousComputingArkStory(text)) {
    return "中国发布了“异算方舟”平台。可以把它想成一套帮助 AI 程序搬家的工具：有些程序原来只能在一种芯片或系统上跑，平台会帮助算法、代码和智能应用更容易适配不同国产计算设备。";
  }
  if (/新闻发言人/.test(text) && /AI|人工智能|机遇|挑战/.test(text)) {
    return "中国和中东欧国家的新闻发言人在北京交流 AI 时代的新闻发布。AI 可以帮助整理资料、翻译语言和准备问答，但新闻发布关系到公众了解事实，所以最后仍需要人来核对来源、数据和表达是否准确。";
  }
  if (/热带动植物|西双版纳热带植物园|树木和灌木响应干旱|干旱和高温/.test(text) && /气候变化/.test(text)) {
    return "中外科学家在西双版纳讨论气候变化下热带动植物的新变化。干旱和高温变多后，树木怎样保存水分、哪些动物植物会换地方生活、热带雨林怎样保持健康，都会成为科学家持续观察的问题。";
  }
  if (isGreenSaharaStory(text)) {
    return "科学家研究撒哈拉地区从湿润环境变成大沙漠的过程。过去雨水、河湖和植被变化，会影响人类在哪里生活、怎样迁移，也能帮助我们理解气候变化和人类社会的关系。";
  }
  if (/商业航天/.test(text) && /6G/.test(text) && /AI|人工智能/.test(text)) {
    return "这条新闻把商业航天、6G 和 AI 放在一起讲。商业航天是更多公司参与造火箭和卫星，6G 是未来更快的通信技术，AI 是能学习和帮人处理信息的数字工具。";
  }
  if (/长十二|长征十二号/.test(text) && /卫星互联网|低轨/.test(text)) {
    return "长征十二号火箭把一组低轨卫星送上太空。低轨卫星离地球相对更近，多颗卫星一起工作时，可以帮助测试未来更广、更稳定的卫星互联网。";
  }
  if (/卫星互联网/.test(text) && /低轨|组卫星|成功发射/.test(text)) {
    return "一组低轨卫星被成功送入太空。低轨卫星离地球相对更近，多颗卫星连成网络后，可以帮助测试未来更广、更稳定的卫星互联网。";
  }
  if (/实践三十一号卫星/.test(text)) {
    return "中国成功发射实践三十一号卫星。这样的卫星通常会按任务安排做科学探测或技术试验，帮助工程师积累太空中的真实数据。";
  }
  if (/火箭/.test(text) && /卫星/.test(text)) {
    return "火箭把卫星送上太空。卫星到太空后，会按照任务开展通信、观测或技术试验，帮助人们把太空能力用到真实生活里。";
  }
  if (/未来图书馆|全息书架|水族馆梦|智绘/.test(text)) {
    return "这条新闻讲的是学生设计未来图书馆。他们把水族馆、全息书架等想法放进学习空间里，希望图书馆不只借书，还能让人沉浸式阅读、讨论和探索。";
  }
  if (/高等教育展|去中国上大学|印尼学子|中英游学|游学领航|留学生|国际学生|英国大学生/.test(text)) {
    return "这条新闻和国际学生交流有关。不同国家的学生通过教育展、游学或大学项目了解彼此的学校、城市和文化，也会思考自己未来想学习什么。";
  }
  if (/全国高等学校|高等学校共计|教育部/.test(text) && /3196|共计|学校/.test(text)) {
    return "教育部公布了全国高等学校数量。这个数字能帮助大家了解中国有多少大学和高等职业学校，也能让社会更清楚教育资源的大致规模。";
  }
  if (/人工智能/.test(text) && /邮票|科普嘉年华|集邮|科技馆/.test(text)) {
    return "这条新闻把人工智能、邮票和科普活动放在一起。小小邮票变成一个入口，带大家认识 AI 技术，也让传统集邮文化和新科技发生连接。";
  }
  if (/夏季达沃斯|达沃斯论坛/.test(text) && /科技创新|绿色低碳/.test(text)) {
    return "夏季达沃斯论坛即将开始，主题里提到科技创新和绿色低碳。简单说，来自不同地方的人会讨论怎样用新技术让生产、交通和能源更聪明、更省资源。";
  }
  if (/创客中国|创客广东|创客/.test(text) && /大赛|比赛|启动/.test(text)) {
    return "广东启动了创客比赛。创客就是把新想法做成作品的人，参赛者会围绕制造、科技、生活服务等真实问题提出方案，再接受评审和展示。";
  }
  if (/儿童福利|儿童/.test(text) && /福利|保障|高质量发展/.test(text)) {
    return "这条新闻关注儿童福利工作。儿童福利包括帮助困境儿童、孤儿和需要照护的孩子，让他们在生活、学习和安全上得到更稳定的支持。";
  }
  if (/长江江豚|江豚|繁育保护中心|濒危物种/.test(text)) {
    return "武汉成立了长江江豚繁育保护中心。江豚是生活在长江里的小型鲸类，这个中心会做人工繁育、科学研究、救护保育和公众教育，帮助江豚种群慢慢恢复。";
  }
  if (/湖南科技学院.*化学与生物工程学院|乡村科普夏令营/.test(text)) {
    return "湖南科技学院化学与生物工程学院的学生走进乡村，举办科学夏令营。孩子们通过安全的小实验观察颜色、气体、电路等现象，也学习怎样识别生活中的用电和化学安全风险。";
  }
  if (/化学蒲公英|科学种子|乡村课堂|乡村/.test(text) && /化学|科学|课堂|师范/.test(text)) {
    return "忻州师范学院的师生把化学和科学活动带进乡村课堂。孩子们可以通过实验和观察认识化学现象，不只是背课本里的概念。";
  }
  if (/科技史教学研讨会|科技史/.test(text) && /教学|研讨会|召开/.test(text)) {
    return "全国科技史教学研讨会在广州召开。老师和研究者讨论怎样把科学发现、发明故事和历史背景讲进课堂，让学生知道科学是怎样一步步发展出来的。";
  }
  if (/教育公益属性|自负盈亏|以盈利为目标|福耀科技大学|王树国/.test(text)) {
    return "一所大学的校长回应了大家对办学目标的疑问。他说明学校不是为了赚钱，而是要坚持教育的公益属性，也就是把培养学生和服务社会放在前面。";
  }
  if (/毕业典礼变.*就业直通车|大学生集体毕业典礼|毕业生/.test(text) && /就业|岗位|择业/.test(text)) {
    return "包头把大学生毕业典礼和就业服务连在一起。毕业生要从校园走向工作，当地把企业岗位和就业帮助集中摆出来，让学生更快了解有哪些工作机会。";
  }
  if (/科技小院|产教融合|涉农人才|知农爱农/.test(text)) {
    return "海南推进“科技小院”建设。科技小院不是普通教室，它把学生、老师和农业生产现场连在一起，让研究生到田间地头学习作物、土壤和农业技术。";
  }
  if (/AI|人工智能|大数据/.test(text) && /教育|教学|学校|学生|课堂|基础教育/.test(text)) {
    return "这条新闻说，有地方把 AI 和大数据用到教学里。系统会记录学习情况，帮助老师知道哪些知识大家已经会了，哪些地方还需要多讲。";
  }
  if (/光伏|太阳能/.test(text) && /清扫|灰尘|机器人/.test(text)) {
    return "这条新闻说，光伏板要把阳光变成电，如果表面灰尘太多，就像窗户蒙上土，发电会变少。清扫机器人可以在大片光伏电站里帮忙打扫，让“阳光电站”更好工作。";
  }
  if (/火箭动力|太空算力|算力上天/.test(text)) {
    return "这条新闻说，北京一些团队把 AI 算力和航天研究连起来。简单说，就是让太空设备也能更快地计算和处理信息，不用什么都等地面来算。";
  }
  if (/人造太阳|中关村|AI|人工智能/.test(text) && /调研行|研究院|企业/.test(text)) {
    return "这条新闻介绍北京一些科研和企业项目，包括 AI 工具和新能源研究。它们不是只停在实验室里，而是在尝试解决生产、能源和城市生活里的真实问题。";
  }
  if (/AI原点社区|做冰激凌的机器人|店小二/.test(text)) {
    return "北京有一个人工智能展示社区，里面能看到会做服务、会做冰激凌的机器人。它把原来比较抽象的 AI，变成小朋友也能看见的生活场景。";
  }
  if (/数智人|低空飞行器|南博会|制造业馆/.test(text)) {
    return "展会上出现了数字人、低空飞行器等新科技。数字人可以做讲解和服务，低空飞行器可能用于巡检、救援、运输等离地面不太高的飞行任务。";
  }
  if (/移动科技馆/.test(text) && /校园|孩子|科普/.test(text)) {
    return "移动科技馆把科学展品带到校园附近。孩子们不用跑很远，也能看展品、做体验，近距离接触平时课本里讲到的科学现象。";
  }
  if (/沉浸式探索科学奥秘|科技魅力|科学奥秘/.test(text) && /呼和浩特|科普|科技/.test(text)) {
    return "呼和浩特举办了沉浸式科普体验活动。孩子和市民可以近距离看展品、做互动体验，把平时课本里的科学现象变成能观察、能参与的活动。";
  }
  if (/端阳心语|心理健康|调养身心/.test(text) && /中国科技馆|科技馆|科普活动/.test(text)) {
    return "中国科技馆举办了心理健康主题科普活动，把端午节里的民俗智慧和身心调节联系起来。活动帮助大家理解情绪、压力和健康生活之间的关系。";
  }
  if (/顾方舟|糖丸|守护童年|脊髓灰质炎/.test(text)) {
    return "这条新闻介绍“糖丸爷爷”顾方舟的主题展览。顾方舟爷爷参与研制预防小儿麻痹症的糖丸疫苗，帮助许多孩子远离疾病，展览把这段科学故事讲给大家听。";
  }
  if (/科普进校园|少年科创行|前沿科技|科普实践/.test(text)) {
    return "这条新闻说，科技行业的老师和工作人员走进校园，带孩子们了解前沿科技。孩子不只是听概念，还能通过实践活动看看科技怎样解决真实问题。";
  }
  if (/科学的种子|科技教师|校外活动中心|孩子心田/.test(text)) {
    return "这条新闻讲的是基层科技教师把科学活动带给孩子。通过实验、观察和讲解，孩子能在学校之外继续接触科学，慢慢把好奇心变成探索能力。";
  }
  if (/创客|科创|创新|创意/.test(text) && /大赛|比赛|实践|高校|少年|英才|新点子/.test(text)) {
    return "这条新闻和科创实践比赛有关。学生们把观察到的问题变成新点子，再用设计、实验或技术方案去验证，练习把想法变成作品。";
  }
  if (/机器人|机器狗|无人机/.test(text) && /比赛|大赛|决赛|队伍/.test(text)) {
    return "很多学校队伍参加机器人比赛。比赛里，机器人、机器狗和无人机要完成搬运、行走、飞行等任务，考验的是设计、编程和团队合作。";
  }
  if (/卫生与健康|医疗|医学|医院|健康/.test(text) && /论坛|会议|交流|分论坛/.test(text)) {
    return "厦门举办了一场健康交流活动。医生、老师和青年代表聚在一起，讨论医疗合作、健康服务和怎样让更多人获得可靠的健康帮助。";
  }
  if (/跪地施救|心脏骤停|医者仁心|晕倒/.test(text)) {
    return "一名医学生在车站看到旅客突然倒下，马上上前帮忙急救。这个故事说明，认真学到的医学知识，可能在关键时刻帮别人争取宝贵时间。";
  }
  if (/语言互通|友谊桥|研学|跨境|俄语|中俄/.test(text)) {
    return "中国和俄罗斯的小朋友通过语言、运动和文化活动交流。他们一起学习、参观、比赛，慢慢了解彼此的生活和文化。";
  }
  if (/科普润心田|科普/.test(text) && /博文|追光|十余载/.test(text)) {
    return "有科学传播者长期做科普，把难懂的科学知识讲成普通人也能听懂的故事。这样的工作能让更多孩子愿意接近科学。";
  }
  if (/公益|乡村/.test(text) && /健康/.test(text)) {
    return "这条新闻和乡村公益活动有关。活动把健康生活、乡村发展和公共帮助联系在一起，让更多人看见乡村也需要更好的服务和资源。";
  }
  if (/公共文化|美术教育|美育|艺术人才|国家艺术基金/.test(text)) {
    return "这条新闻说，一批公共文化机构的工作人员参加美术教育培训。以后他们回到基层，就能把画展、美术课和艺术活动带给更多地方的孩子和居民。";
  }
  if (/新专业|专业/.test(text) && /关注|值得|大学|高校|学习|报考|人才/.test(text)) {
    return "这条新闻提醒大家，学校和大学会根据社会变化设置一些新的学习方向。新专业就像新的知识路线，通常和新技术、新职业、国家需要的人才有关。";
  }
  return "";
}

function kidSummary(item) {
  if (item.kidSummary) return trimKidText(item.kidSummary, 210);
  const themedSummary = kidTopicSummary(item);
  if (themedSummary) return themedSummary;
  const title = cleanNewsText(item.title);
  const description = cleanNewsText(item.description).replace(new RegExp(`^${escapeRegex(title)}\\s*`), "");
  const raw = isUsefulDescription(description) && description.length <= 220 ? description : title;
  return trimKidText(raw, 105);
}

function kidNewsValue(item) {
  if (item.kidValue) return trimKidText(item.kidValue, 220);
  const text = `${item.title} ${item.description}`;
  if (/莞香树|结香|植物.*黑科技/.test(text)) {
    return "价值在于用一个真实例子理解植物怎样保护自己。树脂不是凭空出现的香料，而是植物受伤后的防御反应，也提醒人们珍贵自然材料需要时间形成。";
  }
  if (/玩飞机|航模|模型飞机|科技特长生/.test(text)) {
    return "价值在于把“为什么能飞”变成可以动手验证的问题。孩子要调整机翼、重量和方向，失败后再修改，这正是工程学习中很重要的试验过程。";
  }
  if (/机器人.*出汗|散热刚需|算力爆发.*散热/.test(text)) {
    return "价值在于解决智能设备的基础难题。芯片算得越快，通常发热越多；散热做好了，机器人才能稳定工作，也能减少因为过热造成的能源浪费和故障。";
  }
  if (/卡门线|火箭制造|李东解密火箭/.test(text)) {
    return "价值在于让孩子理解，火箭不是“点火就飞”的大管子。它要在强震动、高温和高速中保持方向正确，每个零件、材料和测试步骤都关系到飞行安全。";
  }
  if (/机器人学校|机器人.*开学|背答案.*会解题|机器人上学/.test(text)) {
    return "价值在于说明，机器人真正有用，不是因为它会说漂亮话，而是因为它能把“看见环境、理解指令、做出动作、检查结果”连起来，完成真实任务。";
  }
  if (/科普帮助扬帆计划|科技创新巾帼行动|巾帼行动.*科普/.test(text)) {
    return "价值在于把科学资源送到更需要的地方。一次好的科普活动，不是只热闹一下，而是让孩子通过观察、提问和动手体验，知道科学能解释身边现象。";
  }
  if (isSmartMountainHighwayStory(text)) {
    return "价值在于让孩子看到，AI 不只会聊天，也能帮助守护交通安全。它通过收集路面、隧道、车辆和天气信息，提醒工作人员哪里可能需要检查。";
  }
  if (/白鹤滩水电站|水电大国重器|水电科技|水电.*珠穆朗玛峰/.test(text)) {
    return "价值在于理解清洁能源背后的工程知识。水电不是简单“水一冲就有电”，还要计算水流、控制机器、保护大坝，并尽量减少对环境的影响。";
  }
  if (/固体助推发动机|百台交付|百台成功/.test(text)) {
    return "价值在于说明航天工程不仅要会设计，还要能反复稳定制造和验证。百台成功应用意味着材料、燃料、结构和质量检查都要长期保持可靠。";
  }
  if (isFieldArchaeologyStory(text)) {
    return "价值在于让孩子理解，历史不是只靠背年代。考古要看土层顺序、遗物位置、测量记录和反复核对，像做一场关于过去的证据推理。";
  }
  if (isSmartRobotApplicationStory(text)) {
    return "价值在于说明机器人真正有用，要把感知、判断和动作连起来。它看见环境后还要知道该做什么、怎么避开危险、做完后结果是否正确。";
  }
  if (isNewEnergyPassengerExportStory(text)) {
    return "价值在于让孩子看懂新能源车不只是国内路上的变化，也进入了国际市场。汽车出口结构变化，说明电池、电机、充电和制造能力都会变得更重要。";
  }
  if (isAiWorkforceTrainingStory(text)) {
    return "价值在于帮助不同职业的人真正学会使用新工具。人工智能进入工作后，只会点按钮还不够，人们还要会提出清楚要求、检查结果、保护数据，并知道什么时候必须由人作判断。";
  }
  if (isWaterLngBunkeringStory(text)) {
    return "价值在于补齐清洁船舶需要的基础设施。只有船能方便、安全地补充燃料，更多航运公司才可能愿意更换能源；一项新技术能否普及，常常取决于配套设施是否跟得上。";
  }
  if (isHighAltitudeAtmosphereDroneStory(text)) {
    return "价值在于让科学家拿到真实的高空数据，而不是只靠地面推算。青藏高原会影响亚洲天气和气候，测清高空大气变化，有助于检验天气与气候研究中的模型是否准确。";
  }
  if (isLithiumMetalBatteryElectrolyteStory(text)) {
    return "价值在于同时解决“装得多”和“用得久”两个难题。电解液像锂离子来回移动的通道；传统材料在电极附近容易被消耗，新设计能减少这种破坏，也降低针状锂枝晶带来的短路风险。";
  }
  if (isDisasterPreventionTechnologyStory(text)) {
    return "价值在于把“哪里有危险”发现得更早、更准。机器可以连续看大量画面和数据，人则负责核对预警、判断轻重缓急并安排救援；两者配合，比只靠工作人员逐处巡查更快。";
  }
  if (isUrbanDrainageFloodControlStory(text)) {
    return "价值在于把防涝从“下雨后抢排水”提前到“下雨前找隐患”。排水管网、河道、水库和道路互相连接，只有多个部门共享雨量、水位和交通信息，才能减少一处排水影响另一处的情况。";
  }
  if (isFloodMedicalResponseStory(text)) {
    return "价值在于让受灾群众不用长途寻找医院，也能先处理发热、腹泻、磕碰和慢性病用药等问题。临时医疗点还能尽早发现重症，把有限的救护车和医院床位留给更需要的人。";
  }
  if (isReusableRocketRecoveryStory(text)) {
    return "价值在于把火箭上最重、最复杂的一级箭体带回来。它装着发动机、贮箱和控制设备，回收后还要仔细检查；如果未来能安全重复飞行，就能减少每次发射都重新制造整枚火箭的浪费。";
  }
  if (isNationalPowerLoadRecordStory(text)) {
    return "价值在于检验电网能不能在最忙的时候仍然稳定供电。发电厂、风电光伏、储能和跨地区输电必须随时配合，让电的生产和使用大致保持平衡，否则就可能影响居民和医院等重要场所。";
  }
  if (isSummerGrainRecordStory(text)) {
    return "价值在于为全年粮食供应打好第一块基础。产量不只看种了多少地，也看每亩收成；良种、农机、灌溉和防灾共同作用，才能让更多麦粒真正从田间进入粮仓。";
  }
  if (isHighSpeedRail385TestStory(text)) {
    return "价值在于用比日常运营更严格的条件检查整套铁路系统。只有列车高速通过时，轨道平顺度、桥梁振动、供电和信号仍符合要求，工程师才能继续判断线路是否具备安全开通条件。";
  }
  if (isQinghaiLakeNakedCarpStory(text)) {
    return "价值在于证明保护一种鱼，不能只靠多放鱼苗。湟鱼必须有清洁湖水、能通过的洄游河道和不被捕捞的生长时间；这些条件一起恢复，种群才可能真正增加。";
  }
  if (isTyphoonMaritimeResponseStory(text)) {
    return "价值在于把安全措施做在风雨前面。停航和停工会带来不便，但能让船只和人员在强风大浪到来前离开危险海域，比台风到来后再救援更安全。";
  }
  if (isTyphoonPublicSafetyStory(text)) {
    return "价值在于理解防灾不是只看台风有没有离开。提前转移能避开最危险的强风暴雨；台风过后继续监测山洪和滑坡，则是在防范雨水渗进土层后才出现的“迟到风险”。";
  }
  if (isApecDigitalWeekStory(text)) {
    return "价值在于让不同地区一起讨论数字技术的共同难题。人工智能和网络服务跨越地区使用时，反诈骗、数据安全、连接偏远地区和保护个人信息都需要能互相配合的规则。";
  }
  if (isWaterIceStructureStory(text)) {
    return "价值在于让人们用实验数据重新检查一个看似普通的问题。水的结冰、融化和传热都与分子排列有关；看清氢原子和氢键，能让关于水的物理模型更准确。";
  }
  if (isPlantRootAvoidanceStory(text)) {
    return "价值在于说明植物并不是被动待在原地。根能读取周围的化学信号并改变生长方向，这为理解植物怎样躲避病原微生物提供了新的证据。";
  }
  if (isStudentAntiFraudStory(text)) {
    return "价值在于看懂骗子常用的两步：先用奖励或恐吓让人着急，再把人带离正规平台。只要不独自继续操作，并让家长通过官方渠道核实，就能切断这条诈骗链。";
  }
  if (isFoodToySafetyStory(text)) {
    return "价值在于理解“能吃”和“能玩”是两种不同的安全要求。食品合格不代表附带的小玩具一定安全；小零件、材料、电子部件和年龄提示都要单独检查。";
  }
  if (isSixGNetworkStory(text)) {
    return "价值在于提前研究未来许多设备怎样可靠通信。6G要同时处理速度、覆盖、延迟、感知和计算，工程师还要验证它在工厂、交通、医疗等复杂环境中是否稳定。";
  }
  if (isAgriculturalAerialCropCareStory(text)) {
    return "价值在于在病虫害容易发生的高温高湿季节，更快、更均匀地管护大片农田。飞机气流能翻动作物叶片，让药液覆盖叶片两面，但用量、天气和飞行路线都必须精确控制。";
  }
  if (isMaritimeScienceSeasonStory(text)) {
    return "价值在于让孩子理解航海不只是开船，还包含气象、地图、通信、机械和救生等知识。把真实行业问题讲清楚，能让海洋知识和安全规则更容易被理解。";
  }
  if (isLabAstrophysicsStory(text)) {
    return "价值在于把很远、很难直接观察的宇宙问题，变成可以反复做的实验。科学家能用数据检查猜想，而不是只靠想象，这也能帮助孩子理解：科学结论需要被观察和验证。";
  }
  if (isBrainComputerSummerClassStory(text)) {
    return "价值在于让前沿科技被讲清楚。孩子能知道脑机接口和生物电信号、传感器、计算机有关，也能明白新技术不是魔法，必须经过严谨测试才能真正帮助人。";
  }
  if (isStudentRailTicketStory(text)) {
    return "价值在于把学生集中出行的需求提前交给系统处理。预约不是保证一定有票，但能让符合条件的学生少一些反复刷新，也让铁路更早看到哪些日期和线路需求较多。";
  }
  if (isYouthRobotCompetitionStory(text)) {
    return "价值在于把数学、机械、编程和测试放进同一个真实任务。机器人第一次做错并不等于失败，参赛者要根据记录找原因、改结构或程序，再重新验证。";
  }
  if (isSanjiangEcologyStory(text)) {
    return "价值在于用长期数据检验生态修复是否真的有效。卫星能反复观察同一片高原，比较植被、水体和空气变化，减少只看某一天或某个地点造成的误判。";
  }
  if (/黏土大桥|万名工程师进课堂|工程师进课堂|搭起科学梦/.test(text)) {
    return "价值在于把桥梁工程变成能看、能做、能测试的小实验。孩子会发现，桥能不能稳，不只看材料多少，还和形状、支撑点和重量分布有关。";
  }
  if (/机器人下田|农业无人飞机|农业无人机|新农人|喷洒箱|播撒箱|吊运机构/.test(text)) {
    return "价值在于让农业生产更省力、更精细。无人机不是简单替人偷懒，而是把喷洒、播撒、搬运这些工作变成可规划、可记录、可调整的任务，帮助农民更准确地照顾农田。";
  }
  if (/农民田间学校|现场教学路线|综合畜牧|畜牧行业路线|精品路线/.test(text)) {
    return "价值在于把农业知识从书本和会议室带到真实牧场。学习者能直接看到动物怎样饲养、疾病怎样预防、粪污怎样处理，这比只听理论更容易学会可操作的方法。";
  }
  if (isHighlandDroneResearchStory(text)) {
    return "价值在于让无人机技术适应真实地理环境。高原无人机不只是会飞，还可能用于巡检、救援、测绘和物资运输，需要工程师把安全和任务需求一起考虑。";
  }
  if (/火箭卫星|卫星/.test(text) && /血管神经|大国重器幕后|硬核科技|编织/.test(text)) {
    return "价值在于让孩子看到，航天不只靠火箭发动机，也靠许多看起来不起眼的基础部件。电力和信号能稳定传到正确位置，航天器才有可靠的“大脑”和“身体协调”。";
  }
  if (/苦苣苔科|喜鹊苣苔|洞穴特有新物种/.test(text)) {
    return "价值在于补上生命世界的一块拼图。知道一种植物在哪里生活、有什么特征，科学家才能研究它和环境的关系，也更容易判断它是否需要保护。";
  }
  if (/潍坊昌邑|昌邑/.test(text) && /绿色低碳|新能源/.test(text)) {
    return "价值在于让孩子理解“发展”不只是建更多工厂，也要让能源更清洁、生产更省资源。一个地方选择新能源赛道，说明城市正在把环境和产业一起考虑。";
  }
  if (/衡南县科协|基层科普|乡村少年/.test(text)) {
    return "价值在于缩小城乡之间的科学教育差距。不是只有大城市孩子才能接触有趣实验和科技活动，乡村孩子也应该有机会提问、观察和动手试一试。";
  }
  if (/中国科技馆|科普大篷车|流动科普设施|精准服务工程/.test(text) && /福建|宁德|古田|基层科学教育/.test(text)) {
    return "价值在于把优质科学资源送到更需要的地方。流动科普设施能把展品、实验和讲解带出固定场馆，让基层学校的孩子也能近距离理解科学现象。";
  }
  if (/银河航天|手机直连|相控阵天线|MWC/.test(text)) {
    return "价值在于让通信不只依赖地面基站。遇到山区、海上、野外救援等信号弱的地方，如果手机能更好地连上卫星，人们求助和传递信息会更方便。";
  }
  if (/超低轨|超低轨技术创新|空间治理/.test(text)) {
    return "价值在于让孩子理解：卫星不是离地球越远越好，轨道高度会影响它能看多清楚、信号传多快、运行有多难。超低轨研究就是在寻找更合适的太空工作位置。";
  }
  if (/国际农业科技合作|农业科技合作|绿色引领|农业高质量发展/.test(text)) {
    return "价值在于把科技和粮食安全连起来。AI 可以帮助分析天气、土壤和病虫害，绿色农业则提醒人们不能只追求产量，也要保护土地和水资源。";
  }
  if (/普特融合|科技融爱成长|宁远县第十三完全小学/.test(text)) {
    return "价值在于让孩子知道，科技教育也应该照顾不同学习需要。活动不只是展示设备，更重要的是让每个孩子都有参与、表达和被理解的机会。";
  }
  if (/兰州大学成立人工智能学院|兰州大学.*人工智能学院/.test(text)) {
    return "价值在于让孩子明白，AI 不是魔法，而是一门需要长期学习和负责任使用的学科。未来会需要既懂技术、又会判断对错和影响的人。";
  }
  if (/哈尔滨工程大学|哈工程/.test(text) && /航空航天|海空跨域|三海一核/.test(text)) {
    return "价值在于展示真实工程问题的复杂性。飞机、卫星、船舶和海洋装备都要靠不同学科配合，孩子能从中理解“跨学科”不是口号，而是解决大问题的方法。";
  }
  if (/网安阵线|网络安全.*育人共同体|西电/.test(text) && /网安|网络安全/.test(text)) {
    return "价值在于保护数字生活。网络安全人才要学习密码、系统、漏洞和规则，帮助保护个人信息、学校系统、交通和医院等重要网络。";
  }
  if (/高校学生资助热线|学生资助热线|010[—-]66097980|010[—-]66096590/.test(text)) {
    return "价值在于把求助入口讲清楚。对一些家庭来说，上大学前最担心的不是孩子能不能努力学习，而是学费和生活费怎么准备；热线能让他们直接问到资助政策，少走弯路。";
  }
  if (isIndustrialAiManufacturingStory(text)) {
    return "价值在于让孩子看见，AI 不只会聊天，也能分析工厂传感器和生产数据。炼铝、制磷等流程复杂又耗能，早点发现温度、设备或工艺异常，可能减少浪费并提高安全性。";
  }
  if (isAmazonBioculturalKnowledgeStory(text)) {
    return "价值在于理解生物多样性和文化知识会互相连接。一种植物可能有食用、药用或制作工具的经验；植物消失，或者记录这些经验的语言不再使用，人类就可能失去两份遗产。";
  }
  if (isHeterogeneousComputingArkStory(text)) {
    return "价值在于让不同计算设备更容易一起工作。AI 不是只有一个软件，还需要芯片、系统、算法和测试配合；平台做得好，科研和工程团队就能少花时间重复改代码，多花时间解决真实问题。";
  }
  if (/新闻发言人/.test(text) && /AI|人工智能|机遇|挑战/.test(text)) {
    return "价值在于提醒大家：AI 可以提高整理信息的速度，但不能替人承担真实和负责。新闻发布越快，越要有清楚的证据、可靠来源和人工复核。";
  }
  if (/热带动植物|西双版纳热带植物园|树木和灌木响应干旱|干旱和高温/.test(text) && /气候变化/.test(text)) {
    return "价值在于让孩子明白，气候变化不是只在课本里的词。科学家要长期测量温度、雨水、树木生长和动物活动，才能知道环境变化正在怎样影响真实生命。";
  }
  if (isGreenSaharaStory(text)) {
    return "价值在于把地理、历史和科学证据连起来看。沙漠不是一天形成的，科学家会用湖泊沉积物、考古遗址和气候数据，推测环境变化怎样影响人类生活。";
  }
  if (/光伏|太阳能|新能源|电力/.test(text) && /清扫|灰尘|机器人|发电/.test(text)) {
    return "价值在于让清洁能源更稳定地发电。机器人负责做又脏又重复的清扫工作，人就能把更多精力放在检查安全和管理电站上。";
  }
  if (/太空算力|算力上天|火箭动力/.test(text)) {
    return "价值在于让太空设备有更强的“大脑”。卫星或航天设备能自己更快处理数据，就能少等地面指令，提高工作效率。";
  }
  if (/未来图书馆|全息书架|水族馆梦|智绘/.test(text)) {
    return "价值在于让孩子看见，图书馆也可以被重新设计。好的公共学习空间不只放书，还能用科技、艺术和环境设计帮助人更愿意阅读和讨论。";
  }
  if (/高等教育展|去中国上大学|印尼学子|中英游学|游学领航|留学生|国际学生|英国大学生/.test(text)) {
    return "价值在于让不同国家的年轻人互相了解。教育交流不只是出国旅行，还会影响一个人怎样选择专业、理解文化、和世界合作。";
  }
  if (/全国高等学校|高等学校共计|教育部/.test(text) && /3196|共计|学校/.test(text)) {
    return "价值在于让公众看到高等教育的整体规模。知道学校数量，能帮助大家理解教育规划、人才培养和区域发展之间的关系。";
  }
  if (/人工智能/.test(text) && /邮票|科普嘉年华|集邮|科技馆/.test(text)) {
    return "价值在于把前沿科技变成孩子愿意看、愿意问的文化活动。邮票、展览和体验活动能让 AI 不只是屏幕里的词，而是可以被讨论和观察的知识。";
  }
  if (/人工智能安全要从娃娃抓起|AI衍生的新型侵害|人工智能衍生的新型侵害/.test(text)) {
    return "价值在于把“会用 AI”和“安全用 AI”连起来。孩子要知道，AI 可能帮忙学习，也可能生成错误、诱导或不适合儿童的内容，所以需要规则和判断力。";
  }
  if (/7国青年|合肥科学岛|人造太阳/.test(text)) {
    return "价值在于让孩子理解，未来能源问题需要很多国家一起研究。核聚变如果能被安全、稳定地利用，可能像太阳发光一样释放巨大能量，而且污染更少。";
  }
  if (/夏季达沃斯|达沃斯论坛/.test(text) && /科技创新|绿色低碳/.test(text)) {
    return "价值在于让更多人一起讨论未来怎么发展。绿色低碳不是一句口号，它关系到电从哪里来、工厂怎么生产、城市空气能不能更好。";
  }
  if (/创客中国|创客广东|创客/.test(text) && /大赛|比赛|启动/.test(text)) {
    return "价值在于把很多人的小发明、小方案集中起来，让好点子被看见。创客比赛不是只比口号，而是鼓励参赛者把问题讲清楚、把方案做出来。";
  }
  if (/儿童福利|儿童/.test(text) && /福利|保障|高质量发展/.test(text)) {
    return "价值在于提醒社会关注更需要帮助的孩子。一个城市或国家是否温暖，不只看高楼和科技，也要看弱小的人能不能得到保护。";
  }
  if (/长江江豚|江豚|繁育保护中心|濒危物种/.test(text)) {
    return "价值在于保护长江里的珍稀生命。江豚数量变化能提醒人们河流是否健康，保护它们也等于保护水环境和许多水生生物的家。";
  }
  if (/化学蒲公英|科学种子|乡村课堂|乡村/.test(text) && /化学|科学|课堂|师范/.test(text)) {
    return "价值在于把优质科学教育送到乡村孩子身边。实验课会让孩子亲眼看到变化，知道科学不是远方的大词，而是能解释生活现象的方法。";
  }
  if (/科技史教学研讨会|科技史/.test(text) && /教学|研讨会|召开/.test(text)) {
    return "价值在于让孩子理解科学不是突然出现的答案。了解科学史，能看到科学家怎样观察、失败、改进，也能学会用证据思考。";
  }
  if (/教育公益属性|自负盈亏|以盈利为目标|福耀科技大学|王树国/.test(text)) {
    return "价值在于讲清楚教育和普通买卖不一样。学校当然要管理好资源，但办学最重要的是培养人、做研究、服务社会，而不是只追求赚钱。";
  }
  if (/新增AI|机器人等专业|扩招重点方向|新专业|专业/.test(text) && /高校|大学|扩招|人才|学习|方向/.test(text)) {
    return "价值在于让学校的学习方向跟上社会变化。AI、机器人等新专业不是为了追热门词，而是为了培养未来能懂技术、会解决真实问题的人。";
  }
  if (/毕业典礼变.*就业直通车|大学生集体毕业典礼|毕业生/.test(text) && /就业|岗位|择业/.test(text)) {
    return "价值在于把“毕业快乐”和“下一步怎么走”连起来。对大学生来说，找到适合自己的工作，是把学到的知识用到社会里的重要一步。";
  }
  if (/科技小院|产教融合|涉农人才|知农爱农/.test(text)) {
    return "价值在于让农业学习更贴近真实土地。学生不只在书本里学农业，还要观察作物、记录数据、和农民一起解决种植中的具体问题。";
  }
  if (/AI|人工智能|大数据/.test(text) && /教育|教学|学校|学生|课堂|学习|高校|师生/.test(text)) {
    return "价值在于让数字工具帮老师和学生更快整理信息、发现问题。AI 可以做助手，但它不能代替认真学习和人的判断。";
  }
  if (/AI|人工智能|大模型|机器人|算力|芯片/.test(text)) {
    return "价值在于让机器更会帮人处理复杂任务，比如整理信息、识别问题、完成重复工作。但越聪明的工具，越需要人来制定规则、检查结果。";
  }
  if (/航天|卫星|火箭|空间站|月球|北斗/.test(text)) {
    return "价值在于把通信、导航、天气观察和科学研究带到更远的地方。火箭负责送设备上天，卫星负责在太空长期工作。";
  }
  if (/顾方舟|糖丸|守护童年|脊髓灰质炎/.test(text)) {
    return "价值在于让孩子知道，科学研究可以真正保护生命。一个疫苗、一场展览，背后都有科学家长期坚持和反复验证。";
  }
  if (/科普进校园|少年科创行|前沿科技|科普实践/.test(text)) {
    return "价值在于把真实行业里的科技带到孩子身边。小朋友能更早知道汽车、能源、材料、AI 等技术不是遥远名词，而是会改变生活的工具。";
  }
  if (/科学的种子|科技教师|校外活动中心|孩子心田/.test(text)) {
    return "价值在于让科学教育不只停在课堂里。好的科技老师能把实验、问题和生活现象连起来，让孩子愿意主动观察和动手尝试。";
  }
  if (/沉浸式探索科学奥秘|科技魅力|科学奥秘/.test(text) && /呼和浩特|科普|科技/.test(text)) {
    return "价值在于把抽象的科学知识变成现场体验。小朋友通过看、摸、问、试，更容易明白科学原理，也更容易产生继续探索的兴趣。";
  }
  if (/端阳心语|心理健康|调养身心/.test(text) && /中国科技馆|科技馆|科普活动/.test(text)) {
    return "价值在于告诉孩子：健康不只是身体不生病，也包括情绪和心理状态。用节日故事做科普，能让心理健康知识更容易被理解。";
  }
  if (/创客|科创|创新|创意/.test(text) && /大赛|比赛|实践|高校|少年|英才|新点子/.test(text)) {
    return "价值在于训练发现问题和解决问题的能力。科创比赛不只是比谁点子多，还要看这个点子能不能讲清楚、做出来、被验证。";
  }
  if (/科技馆|博物馆|科普/.test(text)) {
    return "价值在于把课本里的概念变成能看、能摸、能体验的东西。孩子亲眼看到现象，比只背答案更容易理解。";
  }
  if (/医疗|健康|养老|医院|药|康养/.test(text)) {
    return "价值在于保护生命和健康。好的医疗服务、急救知识和健康合作，能让人遇到危险或生病时更快得到帮助。";
  }
  if (/交通|高铁|汽车|低空|无人机|飞行器|巡检|救援|运输/.test(text)) {
    return "价值在于让出行、救援、巡检和运输多一种工具。比如低空飞行器能到一些车不容易快到的地方，但必须先把安全规则想清楚。";
  }
  if (/公共文化|美术教育|美育|艺术人才|国家艺术基金/.test(text)) {
    return "价值在于让艺术和美育不只留在大城市的大场馆里。基层老师和文化工作者学会方法后，更多孩子也能接触画画、展览和审美教育。";
  }
  if (/新专业|专业/.test(text) && /关注|值得|大学|高校|学习|报考|人才/.test(text)) {
    return "价值在于让学习内容跟上真实世界的变化。社会需要新的技术和服务时，学校也要培养会解决这些新问题的人。";
  }
  if (/教育|学校|学生|儿童|阅读|家庭/.test(text)) {
    return "价值在于帮助学校和老师更了解学习过程，让不同同学得到更合适的帮助，而不是所有人只用同一种学习方法。";
  }
  if (/作物|粮食|农业|农作物|花期|抗冷/.test(text)) {
    return "价值在于让粮食生产更稳定。研究种子、土壤和天气，能帮助农民在不同环境里种出更多、更安全的食物。";
  }
  if (/新能源|能源|电力|气候|低碳|环保|绿色/.test(text)) {
    return "价值在于让用电和出行更清洁。能源技术进步后，城市可以少一些污染，也能更稳定地供电。";
  }
  if (/经济|贸易|消费|供应链|企业|财长|央行/.test(text)) {
    return "价值在于让人们看懂商品、工作和资源怎样流动。经济不是只关于钱，也关于东西怎样生产、运输和分配。";
  }
  if (/政策|会议|法律|规则|治理|服务/.test(text)) {
    return "价值在于让公共事情更有秩序。规则和服务安排清楚，学校、交通、医院、公园这些地方才能更好地运转。";
  }
  return "价值在于让我们看见世界正在发生的变化，知道哪些新事物正在出现，哪些问题正在被解决。";
}

function kidNewsImpact(item) {
  if (item.kidImpact) return trimKidText(item.kidImpact, 220);
  const text = `${item.title} ${item.description}`;
  if (/莞香树|结香|植物.*黑科技/.test(text)) {
    return "社会影响是，人们会更重视科学种植和保护莞香树，而不是为了取香随意伤害野生树木。未来研究也可能帮助人工栽培更规范，让传统香文化和生态保护一起延续。";
  }
  if (/玩飞机|航模|模型飞机|科技特长生/.test(text)) {
    return "社会影响是，更多孩子能通过航模接触航空知识和工程实践。未来的科技教育会更重视“提出问题、做出模型、测试改进”，而不只是记住书本结论。";
  }
  if (/机器人.*出汗|散热刚需|算力爆发.*散热/.test(text)) {
    return "社会影响是，数据中心、机器人和智能汽车都需要更高效的降温技术。未来设备竞争不只看算得多快，也要看能不能少耗电、少发热并长时间稳定运行。";
  }
  if (/卡门线|火箭制造|李东解密火箭/.test(text)) {
    return "社会影响是，航天制造会带动材料、电子、测量和质量检查一起进步。未来的航天任务越复杂，越需要长期训练的工程师和一套严格验证的方法。";
  }
  if (/机器人学校|机器人.*开学|背答案.*会解题|机器人上学/.test(text)) {
    return "社会影响是，未来机器人进入工厂、医院、仓库或家庭前，会更需要像学生考试一样反复训练和测试。趋势不是让机器随便上岗，而是先证明它安全、稳定、能被人监督。";
  }
  if (/科普帮助扬帆计划|科技创新巾帼行动|巾帼行动.*科普/.test(text)) {
    return "社会影响是，科普会更主动走出大城市场馆，进入社区、学校和乡村。未来趋势是，科学教育不只靠课本，也会靠更多可触摸、可参与的公共活动。";
  }
  if (isSmartMountainHighwayStory(text)) {
    return "社会影响是，山区道路管理会越来越依靠“人巡查 + 机器观察 + 数据判断”一起工作。未来交通安全不只靠修路，也要靠持续监测和快速响应。";
  }
  if (/白鹤滩水电站|水电大国重器|水电科技|水电.*珠穆朗玛峰/.test(text)) {
    return "社会影响是，大型水电站能提供稳定电力，也会推动高端装备、材料和监测技术进步。未来能源建设会更重视发电、安全和生态保护一起平衡。";
  }
  if (/固体助推发动机|百台交付|百台成功/.test(text)) {
    return "社会影响是，火箭关键部件越可靠，卫星发射、深空探测和应急任务就越有保障。未来趋势是，航天制造会更重视批量化、标准化和每一次发射前的严格测试。";
  }
  if (isFieldArchaeologyStory(text)) {
    return "社会影响是，更多人会重视文化遗址保护，知道地下文物不能随便挖、随便拿。未来研究历史会更依靠考古、科技检测和国际学习交流一起配合。";
  }
  if (isSmartRobotApplicationStory(text)) {
    return "社会影响是，机器人会更多进入工厂、仓库、医院和公共服务场景，承担重复或有风险的工作。未来趋势不是机器完全替代人，而是人负责设定规则、处理复杂判断，机器负责稳定执行。";
  }
  if (isNewEnergyPassengerExportStory(text)) {
    return "社会影响是，汽车产业会更重视绿色出行和全球竞争。未来趋势是，车企不仅要把车造出来，还要把续航、安全、充电便利和电池回收这些问题一起解决。";
  }
  if (isAiWorkforceTrainingStory(text)) {
    return "社会影响是，工作岗位不会只分成“懂AI”和“不懂AI”，而会出现更多“专业知识 + AI工具”的组合。未来培训会更重视实际任务和结果核对，也要帮助受技术影响的人学习新技能、适应新岗位。";
  }
  if (isWaterLngBunkeringStory(text)) {
    return "社会影响是，长江航运可能逐步减少使用污染更重的船用燃料，港口也要建立更严格的储存、加注和消防规则。未来绿色航运会同时比较排放、安全、成本和补能是否方便，而不是只看燃料名字。";
  }
  if (isHighAltitudeAtmosphereDroneStory(text)) {
    return "社会影响是，无人机可能成为高山、冰川和危险天气观测的新工具，让科学家少冒险、数据更连续。未来灾害预警和气候研究会更多依靠卫星、地面站、气球和无人机互相补充。";
  }
  if (isLithiumMetalBatteryElectrolyteStory(text)) {
    return "社会影响是，电池如果能在同样重量下储存更多能量，电动车续航和便携设备使用时间可能增加。未来还要继续验证大规模制造、成本、极端温度和安全性，实验室数据好不等于马上就能装车。";
  }
  if (isDisasterPreventionTechnologyStory(text)) {
    return "社会影响是，基层救援人员可能更快拿到灾害地图和准确位置，把力量先送到最需要的地方。未来趋势不是让AI自动决定救谁，而是让传感器、算法和人的现场判断组成更可靠的预警链。";
  }
  if (isUrbanDrainageFloodControlStory(text)) {
    return "社会影响是，城市会更重视地下管网、易涝点和应急路线这些平时不显眼的基础设施。未来防涝不仅靠修更大的管道，还要靠天气预报、实时水位、交通管控和公众避险信息一起工作。";
  }
  if (isFloodMedicalResponseStory(text)) {
    return "社会影响是，灾害安置不只要有食物和住处，也要把基本医疗和传染病预防一起安排。未来应急体系会更重视社区医疗点、转运路线和医院床位之间的快速衔接。";
  }
  if (isReusableRocketRecoveryStory(text)) {
    return "社会影响是，火箭如果经过多次验证后能重复使用，发射成本和准备时间可能下降，更多卫星和科学设备就有机会进入太空。下一步关键不是“接住一次”就结束，而是确认回收箭体能否可靠地再次飞行。";
  }
  if (isNationalPowerLoadRecordStory(text)) {
    return "社会影响是，极端高温和更多电气设备会让夏季用电高峰继续变大。未来电网会增加储能、智能调度和跨地区互助，也需要建筑与空调更节能，减少所有设备同时大量用电带来的压力。";
  }
  if (isSummerGrainRecordStory(text)) {
    return "社会影响是，夏粮丰收能让面粉等基本食品供应更稳，也给农民收入和市场价格提供支撑。未来还要重视收购、烘干、储藏和运输，避免粮食收下来后在仓储环节损失。";
  }
  if (isHighSpeedRail385TestStory(text)) {
    return "社会影响是，线路通过测试并开通后，西安与安康等地之间的出行和货物流动会更方便。未来高铁建设不只追求更快，还会更重视复杂山区里的长期监测、维修和极端天气安全。";
  }
  if (isQinghaiLakeNakedCarpStory(text)) {
    return "社会影响是，湟鱼变多后，吃鱼的水鸟也更容易找到食物，湖泊食物链会更完整。未来生态保护会继续从单一物种扩大到河流、湖泊、草地和当地社区共同参与。";
  }
  if (isTyphoonMaritimeResponseStory(text)) {
    return "短期内，部分海上出行和施工会受影响；更长期看，天气预警、船舶进港、项目停工和人员转移会组成一条更完整的防台风安全链。";
  }
  if (isTyphoonPublicSafetyStory(text)) {
    return "短期内，转移安置和持续巡查会占用很多人力，但能减少伤亡。未来防灾会更重视“预警、转移、巡查、恢复”连成一条链，也会用更细的天气和地质数据判断哪里最需要先行动。";
  }
  if (isApecDigitalWeekStory(text)) {
    return "这些讨论不会马上变成每个人手机里的新功能，但可能影响以后人工智能服务怎样接受安全检查、网络诈骗怎样跨地区协查，以及偏远地区怎样获得更稳定的数字服务。";
  }
  if (isWaterIceStructureStory(text)) {
    return "这类基础研究未来可能帮助改进氢能、量子材料和生命科学中的计算方法，但从实验发现走到实际应用还需要更多团队反复验证。";
  }
  if (isPlantRootAvoidanceStory(text)) {
    return "未来研究人员可能据此继续寻找更抗病的作物和更合适的土壤管理办法。不过，实验室里的发现还要经过田间试验，才能判断能否真正帮助农业生产。";
  }
  if (isStudentAntiFraudStory(text)) {
    return "学校、家庭和网络平台会更重视学生账号、支付权限和屏幕共享安全。未来反诈骗不能只靠孩子记口诀，还要让支付限制、风险提醒和求助入口一起发挥作用。";
  }
  if (isFoodToySafetyStory(text)) {
    return "生产者和商家需要同时标明食品与玩具安全信息，监管也要检查两套标准。家庭购买时可以核对3C标识、适用年龄和小零件提示，减少误吞或材料不合格的风险。";
  }
  if (isSixGNetworkStory(text)) {
    return "6G如果成熟，可能影响智能工厂、远程医疗、自动交通和偏远地区通信。它预计还需要多年研发，未来不能只比速度，也要比较安全、能耗、隐私和是否真正可靠。";
  }
  if (isAgriculturalAerialCropCareStory(text)) {
    return "农业会越来越依靠飞机、传感器、天气数据和农艺人员一起工作。这样能减少重复体力劳动、提高管护效率，但也要防止药液漂移，并保护周边水体、人员和其他生物。";
  }
  if (isMaritimeScienceSeasonStory(text)) {
    return "更多学校、博物馆、港口和航海人员可能一起参与海洋科普。未来航运发展不仅需要更多技术人才，也需要公众理解海洋环境、运输安全和船员工作。";
  }
  if (isLabAstrophysicsStory(text)) {
    return "社会影响是，大科学装置会带动测量、材料、计算和精密仪器一起进步。未来研究宇宙不只靠望远镜看远方，也会靠实验室模拟、超级计算和长期数据互相验证。";
  }
  if (isBrainComputerSummerClassStory(text)) {
    return "社会影响是，脑机接口未来可能帮助康复训练、医疗辅助和无障碍设备发展。趋势不是让机器随便读取人的想法，而是在清楚规则和隐私保护下，让技术更安全地帮助需要的人。";
  }
  if (isStudentRailTicketStory(text)) {
    return "社会影响是，学生暑期返校和回家时多了一种购票安排方式，但仍要核对身份、查看兑现通知并按时付款。未来交通服务会更多用预约数据安排运力和提醒。";
  }
  if (isYouthRobotCompetitionStory(text)) {
    return "社会影响是，科技教育会更重视做项目、测结果和团队合作，而不只背知识点。比赛能发现兴趣和能力，但名次不能代表一个孩子全部的科学素养。";
  }
  if (isSanjiangEcologyStory(text)) {
    return "社会影响是，三江源的水源涵养和生态稳定关系到长江、黄河、澜沧江下游。未来保护高原会更依靠卫星、地面调查和长期数据一起判断。";
  }
  if (/黏土大桥|万名工程师进课堂|工程师进课堂|搭起科学梦/.test(text)) {
    return "社会影响是，真实行业人员走进课堂，能让孩子更早理解工程师怎样解决问题。未来科学课会更重视动手验证，而不是只记住一个标准结论。";
  }
  if (/机器人下田|农业无人飞机|农业无人机|新农人|喷洒箱|播撒箱|吊运机构/.test(text)) {
    return "社会影响是，未来农民可能更像“农田管理师”：既懂作物，也会操作设备、看数据、判断什么时候该喷洒或运输。农业会越来越依靠机器、传感器和人的经验一起配合。";
  }
  if (/农民田间学校|现场教学路线|综合畜牧|畜牧行业路线|精品路线/.test(text)) {
    return "社会影响是，更多农民可以通过现场学习提升养殖技术，让肉、奶等食品生产更稳定、更安全。未来趋势是，农业培训会更重视真实场景和长期实践，而不是只发资料、听讲座。";
  }
  if (isHighlandDroneResearchStory(text)) {
    return "社会影响是，复杂地区的巡山、救援、通信检查和物流可能多一个可靠工具。未来趋势是，无人机会从表演和航拍，更多走向公共服务和专业工程任务。";
  }
  if (/火箭卫星|卫星/.test(text) && /血管神经|大国重器幕后|硬核科技|编织/.test(text)) {
    return "社会影响是，航天产业会更重视基础零部件的可靠性。未来趋势是，越复杂的航天任务，越需要材料、电子、制造和检测一起变强，而不是只看发射那一刻。";
  }
  if (/苦苣苔科|喜鹊苣苔|洞穴特有新物种/.test(text)) {
    return "社会影响是，新物种被记录后，它生活的洞穴和周边环境会更有保护依据。未来生物调查会更多结合野外观察、标本和基因信息，减少珍稀物种还没被认识就消失的风险。";
  }
  if (/潍坊昌邑|昌邑/.test(text) && /绿色低碳|新能源/.test(text)) {
    return "社会影响是，地方如果把新能源做成长期行业，可能带来新的工作、技术训练和更低污染的生产方式。未来趋势是，城市竞争不只比产量，也会比谁更会节能、减排和循环利用资源。";
  }
  if (/衡南县科协|基层科普|乡村少年/.test(text)) {
    return "社会影响是，更多基层孩子能把“我听过科学”变成“我试过、我理解”。未来趋势是，科普会更常走进县城、乡村和学校，让科学教育不只集中在大城市。";
  }
  if (/中国科技馆|科普大篷车|流动科普设施|精准服务工程/.test(text) && /福建|宁德|古田|基层科学教育/.test(text)) {
    return "社会影响是，科技馆的资源可以服务更多普通学校，而不是只等孩子去大城市参观。未来趋势是，科学教育会更像“流动服务”，哪里需要，就把展品、老师和活动送到哪里。";
  }
  if (/银河航天|手机直连|相控阵天线|MWC/.test(text)) {
    return "社会影响是，未来手机通信可能从“有基站才有信号”慢慢变成“地面网络和卫星网络一起补位”。这会影响应急救援、海岛山区通信，也会推动更多低轨卫星和通信设备发展。";
  }
  if (/超低轨|超低轨技术创新|空间治理/.test(text)) {
    return "社会影响是，超低轨卫星如果发展成熟，可能帮助地球观测、灾害监测、海洋巡查和通信服务变得更精细。未来趋势是，太空也需要更清楚的合作规则，避免卫星越来越多后互相干扰。";
  }
  if (/国际农业科技合作|农业科技合作|绿色引领|农业高质量发展/.test(text)) {
    return "社会影响是，农业科技合作能帮助不同国家一起面对气候变化、粮食供应和资源节约问题。未来趋势是，种地会越来越像一门综合科学，要懂生物、天气、数据和工程。";
  }
  if (/普特融合|科技融爱成长|宁远县第十三完全小学/.test(text)) {
    return "社会影响是，学校会更重视包容式教育，让不同能力的孩子在同一个校园里互相看见、互相帮助。未来趋势是，科技工具会更多用来支持个性化学习，而不是只给少数人使用。";
  }
  if (/兰州大学成立人工智能学院|兰州大学.*人工智能学院/.test(text)) {
    return "社会影响是，大学会更系统地培养 AI 人才。未来趋势是，AI 会进入医疗、农业、交通和学习工具，但社会也会更重视数据安全、公平和人来做最后判断。";
  }
  if (/哈尔滨工程大学|哈工程/.test(text) && /航空航天|海空跨域|三海一核/.test(text)) {
    return "社会影响是，更多工程人才会学习跨领域合作。未来的航天器、无人机、深海装备和智能船舶，可能都需要海洋工程、航空航天、计算机和能源知识一起配合。";
  }
  if (/网安阵线|网络安全.*育人共同体|西电/.test(text) && /网安|网络安全/.test(text)) {
    return "社会影响是，网络安全会像交通安全、用电安全一样成为公共基础能力。未来智能汽车、医院系统、AI 服务和个人账号越多，就越需要专业人员提前防护。";
  }
  if (/高校学生资助热线|学生资助热线|010[—-]66097980|010[—-]66096590/.test(text)) {
    return "社会影响是，更多学生能在遇到经济困难时及时知道奖助学金、助学贷款和绿色通道等办法。未来趋势是，公共服务会更重视“让人找得到、问得明白、办得顺利”。";
  }
  if (isIndustrialAiManufacturingStory(text)) {
    return "社会影响是，传统工厂可能增加懂生产、数据和 AI 的复合岗位，也要建立人工复核和安全责任。方案刚开始推进，实际能否节能、提质和减少风险，还需要用真实生产数据持续验证。";
  }
  if (isAmazonBioculturalKnowledgeStory(text)) {
    return "社会影响是，保护亚马孙不能只保护森林面积，还要保护植物、当地语言和传承知识的人。研究结果是对未来情景的模型预测，不是已经发生的固定结局；减少气候风险和加强保护仍可能改变结果。";
  }
  if (isHeterogeneousComputingArkStory(text)) {
    return "社会影响是，国产芯片、软件和 AI 应用之间会更需要统一工具和标准。未来趋势是，技术竞争不只看单个芯片快不快，也看整套生态能不能稳定、好用、容易验证。";
  }
  if (/新闻发言人/.test(text) && /AI|人工智能|机遇|挑战/.test(text)) {
    return "社会影响是，政府、媒体和公共机构可能更多用 AI 做资料整理和多语言沟通。未来趋势是，信息传播会更快，但事实核查、隐私保护和责任边界会变得更重要。";
  }
  if (/热带动植物|西双版纳热带植物园|树木和灌木响应干旱|干旱和高温/.test(text) && /气候变化/.test(text)) {
    return "社会影响是，研究结果能帮助人们更早发现雨林、农作物和野生动物面临的风险。未来趋势是，保护自然会更依靠长期监测和数据，而不是等问题严重了才补救。";
  }
  if (isGreenSaharaStory(text)) {
    return "社会影响是，人们会更重视水资源、气候和人类活动之间的联系。未来趋势是，研究过去的环境变化，可以帮助今天的城市和乡村更早准备干旱、降雨变化等挑战。";
  }
  if (/光伏|太阳能|新能源|电力/.test(text) && /清扫|灰尘|机器人|发电/.test(text)) {
    return "社会影响是，太阳能电站如果维护得更好，同一片阳光就能发出更多电。未来趋势是，更多清洁能源场站会用机器人做重复、危险或很辛苦的工作，人来负责检查和管理。";
  }
  if (/太空算力|算力上天|火箭动力/.test(text)) {
    return "社会影响是，卫星不只负责“拍下来”，还可能在太空先把数据算明白。未来趋势是，天气、海洋、农田、灾害监测会更依赖“太空设备自己会计算”的能力。";
  }
  if (/未来图书馆|全息书架|水族馆梦|智绘/.test(text)) {
    return "社会影响是，图书馆会从安静放书的地方，变成阅读、展示、讨论和数字体验结合的公共学习空间。未来趋势是，学习场所会更重视沉浸感、互动和创造力。";
  }
  if (/高等教育展|去中国上大学|印尼学子|中英游学|游学领航|留学生|国际学生|英国大学生/.test(text)) {
    return "社会影响是，年轻人跨国学习和交流会让不同文化更容易互相理解。未来趋势是，大学和城市会更重视国际合作，很多问题也需要不同国家的人一起解决。";
  }
  if (/全国高等学校|高等学校共计|教育部/.test(text) && /3196|共计|学校/.test(text)) {
    return "社会影响是，高等学校数量关系到更多青年能在哪里学习、学什么专业、将来进入哪些行业。未来趋势是，教育资源会更强调质量、特色和区域均衡。";
  }
  if (/人工智能/.test(text) && /邮票|科普嘉年华|集邮|科技馆/.test(text)) {
    return "社会影响是，科技传播会越来越重视孩子看得懂、愿意参与的方式。未来趋势是，AI 这类新技术会更多走进展览、课程、邮票和博物馆活动里。";
  }
  if (/人工智能安全要从娃娃抓起|AI衍生的新型侵害|人工智能衍生的新型侵害/.test(text)) {
    return "社会影响是，学校、平台和家长会更重视儿童的数字安全教育。未来趋势是，AI 产品不只要更聪明，也要有更清楚的年龄保护、内容审核和求助入口。";
  }
  if (/7国青年|合肥科学岛|人造太阳/.test(text)) {
    return "社会影响是，能源科学会影响未来城市怎样用电、工厂怎样生产、地球怎样减少污染。未来趋势是，重大科学工程越来越需要跨国合作和长期实验，而不是一次就能成功。";
  }
  if (/夏季达沃斯|达沃斯论坛/.test(text) && /科技创新|绿色低碳/.test(text)) {
    return "社会影响是，绿色技术和新产业会影响企业怎么生产、城市怎么用能、普通人怎么出行。未来趋势是，发展经济会越来越重视少浪费、少污染和更高效率。";
  }
  if (/创客中国|创客广东|创客/.test(text) && /大赛|比赛|启动/.test(text)) {
    return "社会影响是，企业、学校和个人的创意可能通过比赛找到合作伙伴或使用场景。未来趋势是，很多创新会从“想到一个办法”继续走向“做出原型、测试效果、真正落地”。";
  }
  if (/儿童福利|儿童/.test(text) && /福利|保障|高质量发展/.test(text)) {
    return "社会影响是，困境儿童能更早被发现、被帮助，照护服务也会更有规则。未来趋势是，儿童保护会更重视长期陪伴、心理支持和教育机会，而不是只解决一时困难。";
  }
  if (/长江江豚|江豚|繁育保护中心|濒危物种/.test(text)) {
    return "社会影响是，科研人员能更系统地救护、繁育和观察江豚，也能让公众更理解保护长江生态的重要性。未来趋势是，野生动物保护会更依靠科学监测、人工繁育和公众参与一起配合。";
  }
  if (/化学蒲公英|科学种子|乡村课堂|乡村/.test(text) && /化学|科学|课堂|师范/.test(text)) {
    return "社会影响是，乡村学校也能获得更生动的科学课程，孩子可能因此喜欢上实验和探究。未来趋势是，大学、师范院校和中小学会更多合作，把科普活动持续带到基层。";
  }
  if (/科技史教学研讨会|科技史/.test(text) && /教学|研讨会|召开/.test(text)) {
    return "社会影响是，课堂里的科学会更有人物、故事和时代背景，孩子不只记公式，也理解知识为什么重要。未来趋势是，科学课会更重视探究过程和科学精神。";
  }
  if (/教育公益属性|自负盈亏|以盈利为目标|福耀科技大学|王树国/.test(text)) {
    return "社会影响是，公众会更关注大学怎样花钱、怎样培养学生、怎样保持教育公平。未来趋势是，新型大学既要提高办学效率，也要把公益性和人才培养放在清楚的位置。";
  }
  if (/新增AI|机器人等专业|扩招重点方向|新专业|专业/.test(text) && /高校|大学|扩招|人才|学习|方向/.test(text)) {
    return "社会影响是，学生未来选择专业时会看到更多和新技术有关的方向。未来趋势是，很多工作会越来越跨学科，既要懂科学技术，也要会表达、合作和判断。";
  }
  if (/毕业典礼变.*就业直通车|大学生集体毕业典礼|毕业生/.test(text) && /就业|岗位|择业/.test(text)) {
    return "社会影响是，城市会更主动帮助年轻人把学习和工作衔接起来。未来趋势是，学校、政府和企业会更多合作，让学生更早了解职业和社会需要。";
  }
  if (/科技小院|产教融合|涉农人才|知农爱农/.test(text)) {
    return "社会影响是，农业问题会有更多懂科学、也懂田地的人来解决。未来趋势是，种地会越来越依靠数据、实验和新技术，农业人才也要会把知识用到现场。";
  }
  if (/AI|人工智能|大数据/.test(text) && /教育|教学|学校|课堂|学习/.test(text)) {
    return "社会影响是，老师可能更早发现学生哪里没听懂，而不是只等考试后才知道。未来趋势是，课堂会变成“老师判断 + 数字工具辅助”，但学习能力仍要靠孩子自己练出来。";
  }
  if (/AI|人工智能|机器人|芯片|算力/.test(text)) {
    return "社会影响是，一些重复、危险、需要快速计算的工作会更多交给智能工具。未来趋势是，人类更重要的能力会变成提出好问题、判断结果对不对、决定技术该不该这样用。";
  }
  if (/航天|卫星|火箭|空间站|月球|北斗/.test(text)) {
    return "社会影响是，通信、地图、天气预报和灾害监测会越来越依赖太空基础设施。未来趋势是，航天不只是探索宇宙，也会像电网、道路一样，成为社会运行的一部分。";
  }
  if (/顾方舟|糖丸|守护童年|脊髓灰质炎/.test(text)) {
    return "社会影响是，孩子能看到一粒小小糖丸背后，其实是公共卫生、医学研究和国家组织能力。未来趋势是，预防疾病会比生病后再治疗更受重视。";
  }
  if (/科普进校园|少年科创行|前沿科技|科普实践/.test(text)) {
    return "社会影响是，科学资源不只在实验室和大城市展馆里，也能走进普通学校。未来趋势是，孩子会更早接触真实行业问题，比如交通、环保、能源和安全。";
  }
  if (/科学的种子|科技教师|校外活动中心|孩子心田/.test(text)) {
    return "社会影响是，更多县城和社区的孩子也能接触科学启蒙，而不是只有大城市孩子才有丰富活动。未来趋势是，校外科技教育会更重视长期陪伴和动手体验。";
  }
  if (/沉浸式探索科学奥秘|科技魅力|科学奥秘/.test(text) && /呼和浩特|科普|科技/.test(text)) {
    return "社会影响是，科普活动会从少数场馆走向更多城市公共空间，让普通家庭也能接触科学。未来趋势是，科学教育会更重视互动体验，而不是只听讲解。";
  }
  if (/端阳心语|心理健康|调养身心/.test(text) && /中国科技馆|科技馆|科普活动/.test(text)) {
    return "社会影响是，科技馆不只讲火箭、机器人，也会帮助公众认识心理健康。未来趋势是，学校、家庭和公共场馆会更重视情绪管理、压力调节和健康生活方式。";
  }
  if (/创客|科创|创新|创意/.test(text) && /大赛|比赛|实践|高校|少年|英才|新点子/.test(text)) {
    return "社会影响是，学校不只培养会答题的人，也在培养能发现问题、做出方案的人。未来趋势是，学习会更重视跨学科合作，比如科学、工程、表达和团队配合一起用。";
  }
  if (/科技馆|博物馆|科普/.test(text)) {
    return "社会影响是，博物馆和科技馆能把专业知识变成公众看得懂的展览，让更多孩子公平接触科学。未来趋势是，科学教育会更重视体验，而不是只背结论。";
  }
  if (/医疗|健康|养老|康养/.test(text)) {
    return "社会影响是，医疗和健康服务做得更好，老人、孩子和普通家庭遇到风险时会更有保障。未来趋势是，社会会把更多精力放在预防、急救和基层健康服务上。";
  }
  if (/公共文化|美术教育|美育|艺术人才|国家艺术基金/.test(text)) {
    return "社会影响是，艺术教育不只属于大城市和专业院校，基层也能有更好的展览、课程和老师。未来趋势是，美育会成为公共文化服务的一部分，帮助更多人学会观察和表达。";
  }
  if (/新专业|专业/.test(text) && /关注|值得|大学|高校|学习|报考|人才/.test(text)) {
    return "社会影响是，学校专业会跟着新技术和新职业变化，说明社会需要的人才也在变化。未来趋势是，很多工作会越来越跨学科，既要懂知识，也要会解决真实问题。";
  }
  if (/教育|学校|学生|儿童|阅读/.test(text)) {
    return "社会影响是，教育变化会直接影响孩子每天怎样学习、老师怎样教学、家长怎样支持。未来趋势是，学校会更重视差异化帮助，而不是让所有孩子只按同一种节奏走。";
  }
  if (/作物|粮食|农业|农作物|花期|抗冷/.test(text)) {
    return "社会影响是，农业更稳定，米饭、面条、蔬菜这些日常食物才更有保障。未来趋势是，种地会越来越依靠科学数据、良种和气候适应技术。";
  }
  if (/交通|高铁|汽车|低空|无人机/.test(text)) {
    return "社会影响是，出行、救援、巡检和送货方式可能变快，但城市也要重新安排路线、空域和安全责任。未来趋势是，新交通工具必须和新规则一起出现。";
  }
  if (/新能源|电力|能源|气候|低碳|环保/.test(text)) {
    return "社会影响是，能源变化会影响家里的用电、城市空气、电动车和工厂生产。未来趋势是，社会会一边增加清洁能源，一边学习怎样更稳定、更节约地用电。";
  }
  if (/全球|国际|世界|外媒|国家/.test(text)) {
    return "社会影响是，国家之间的科技、贸易、旅行和文化交流会互相影响。未来趋势是，孩子需要理解世界不是孤立的，一个地方的变化也可能影响远方的人。";
  }
  const subject = kidNewsTitle(item).replace(/[“”"']/g, "");
  return `这条新闻的社会影响，要看它让谁获得了新机会、解决了什么具体问题。围绕“${subject}”，孩子可以重点理解：它不只是一个事件，还可能推动相关行业改变做事方式。`;
}

function childNewsBlock(item, index) {
  const shortSummary = kidSummary(item);
  return {
    title: `第 ${index + 1} 条小情报：${kidNewsTitle(item)}`,
    lines: [
      { label: "发生了什么", text: shortSummary },
      { label: "价值是什么", text: kidNewsValue(item) },
      { label: "可能影响什么", text: kidNewsImpact(item) }
    ],
    source: sourceLabel(item),
    link: item.link
  };
}

function newsQualityRecord(item, block) {
  const byLabel = new Map((block?.lines || []).map((line) => [line.label, line.text]));
  return {
    sourceTitle: item?.title || "",
    sourceDescription: item?.description || "",
    title: String(block?.title || "").replace(/^第\s*\d+\s*条小情报[：:]\s*/, ""),
    summary: byLabel.get("发生了什么") || "",
    value: byLabel.get("价值是什么") || "",
    impact: byLabel.get("可能影响什么") || "",
    pillar: classifyNewsPillar(`${item?.title || ""} ${item?.description || ""}`),
    publisher: item?.publisher || "",
    domain: item?.domain || "",
    feed: item?.feed || "",
    link: item?.link || "",
    published: Number(item?.published || 0)
  };
}

function formatSourceSummary(news) {
  const publishers = [...new Set(news.map((item) => item.publisher || item.feed).filter(Boolean))];
  if (!publishers.length) return "";
  const visible = publishers.slice(0, 6).join("、");
  const more = publishers.length > 6 ? `等 ${publishers.length} 个来源` : `${publishers.length} 个来源`;
  return `来源：从 ${visible} ${more} 里筛选，只保留适合小朋友理解的时政、科技、社会和国际大事，过滤研学推广、地方自荐和商业宣传。`;
}

function getNewsSelectionText(news) {
  return news.map((item) => `${item.title} ${item.description} ${item.category}`).join(" ");
}

function getRecentIds(state, key, extra = [], limit = Number.POSITIVE_INFINITY) {
  const ids = Array.isArray(state[key]) ? state[key].slice(-limit) : [];
  return [...new Set([...ids, ...extra].filter(Boolean))];
}

function mergeRecentIds(previous = [], next = [], limit = 24) {
  const nextValues = next.filter(Boolean);
  const refreshed = new Set(nextValues);
  const previousValues = (Array.isArray(previous) ? previous : []).filter((value) => value && !refreshed.has(value));
  return [...new Set([...previousValues, ...nextValues])].slice(-limit);
}

function selectUniqueTextVariant(variants, state, stateKey, dayIndex, salt = 0) {
  const recent = new Set(getRecentIds(state, stateKey, [], RECENT_MESSAGE_COPY_MEMORY_LIMIT));
  const start = Math.abs((dayIndex + salt) * 7) % variants.length;
  for (let offset = 0; offset < variants.length; offset += 1) {
    const text = variants[(start + offset) % variants.length];
    const fingerprint = textFingerprint(text);
    if (!recent.has(fingerprint)) return { text, fingerprint };
  }
  const fallback = variants[start];
  return { text: fallback, fingerprint: textFingerprint(fallback) };
}

function primaryTag(item) {
  return item.tags[0] || "";
}

function idsToPrimaryTags(ids = [], items = []) {
  const byId = new Map(items.map((item) => [item.id, primaryTag(item)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function getRecentPrimaryTags(state, tagKey, idKey, items, extraIds = []) {
  const explicitTags = Array.isArray(state[tagKey]) ? state[tagKey] : [];
  const ids = getRecentIds(state, idKey, extraIds);
  return [...new Set([...explicitTags, ...idsToPrimaryTags(ids, items)].filter(Boolean))];
}

function knowledgeBodyText(item = {}) {
  return stripHtml(item.text || "").replace(/^百科小知识：/, "").trim();
}

function knowledgeQualityIssues(item = {}) {
  const issues = [];
  const body = knowledgeBodyText(item);
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];

  if (!item.id) issues.push("缺少ID");
  if (!/^百科小知识：/.test(item.text || "")) issues.push("必须以百科小知识开头");
  if (body.length < 22 || body.length > 90) issues.push("长度不适合小学生阅读");
  if (tags.length < 2) issues.push("至少需要两个知识标签");
  if (!/[，。]/.test(body)) issues.push("需要清晰断句");
  if (!/(主要|通常|常|能|会|由|来自|属于|形成|影响|帮助|有关|表示|利用|需要|可以|不是|没有|含有|储存|运输|吸收|分解|改变)/.test(body)) {
    issues.push("缺少具体知识关系");
  }
  if (/(今天|新闻|小朋友|很棒|值得知道|有价值|世界很大|可能影响什么|价值在于)/.test(body)) {
    issues.push("不能写成新闻点评或鼓励语");
  }

  return issues;
}

function isHighQualityKnowledgeItem(item = {}) {
  return knowledgeQualityIssues(item).length === 0;
}

function scoreLearningItem(item, index, dayIndex, newsText, recentIds, recentTags = new Set()) {
  const matchedTags = item.tags.filter((tag) => newsText.includes(tag));
  const relatedScore = matchedTags.length * 50;
  const detailScore = Math.min(knowledgeBodyText(item).length, 90) * 8;
  const qualityPenalty = isHighQualityKnowledgeItem(item) ? 0 : -5000;
  const recentPenalty = recentIds.has(item.id) ? -1000 : 0;
  const recentTagPenalty = recentTags.has(primaryTag(item)) ? -180 : 0;
  const rotationScore = ((dayIndex + 3) * (index + 11)) % 97;
  return relatedScore + detailScore + rotationScore + recentPenalty + recentTagPenalty + qualityPenalty;
}

function hasTagMatch(item, newsText) {
  return item.tags.some((tag) => newsText.includes(tag));
}

function optionBodies(question) {
  return splitQuizQuestion(question).options.map((option) => option.replace(/^[A-D]\.\s*/, "").trim());
}

function hasControlVariableStructure(question) {
  const questionText = stripHtml(question?.q || "");
  const options = optionBodies(question);
  const asksForFairComparison = /实验|探究|研究|比较|判断/.test(questionText) && /更公平|最应该|下一步/.test(questionText);
  const hasConfoundingDetail = /(但是|但|同时|仍|原来|不同|更强|更多|更少|不一样)/.test(questionText)
    && /(阳光|水量|土壤|盆数|杯子|路线|重量|型号|充电条件|开始水量)/.test(questionText);
  const correctControlMove = options.some((option) => /(一样|相同|只保留|主要只改变|种植方法不同|阳光.*不同)/.test(option));
  const plausibleWrongMoves = options.filter((option) => /(继续|观察|延长|增加|多放|多测|更多|平均|保持|仍)/.test(option)).length >= 1;
  return asksForFairComparison && hasConfoundingDetail && correctControlMove && plausibleWrongMoves;
}

function hasExceptionArithmeticStructure(question) {
  const questionText = stripHtml(question?.q || "");
  const options = optionBodies(question);
  const numericCount = (questionText.match(/\d+/g) || []).length;
  const hasException = /其中|其他|其余|只|各|装满|没装满|未装满|返修|前\s*\d+\s*分钟|绕开|剩下/.test(questionText);
  const asksForTotal = /一共|多少|最多|合格|实际|送了|前进/.test(questionText);
  const numericOptions = options.filter((option) => /\d/.test(option)).length;
  const hasNaivePath = options.some((option) => /都按|按最多|全程|计划速度|只扣掉|平均/.test(option));
  return numericCount >= 4 && hasException && asksForTotal && numericOptions === 3 && hasNaivePath;
}

function hasComparativeEvidenceStructure(question) {
  const questionText = stripHtml(question?.q || "");
  const options = optionBodies(question);
  const asksForSupport = /哪种|哪一条|哪组/.test(questionText) && /最能支持|更合理|最适合先参考|最能判断/.test(questionText);
  const hasClaim = /有人说|报告.*说|说法|结论|更轻|更耐用|更耐用|更可靠/.test(questionText);
  const hasControlledComparison = options.some((option) => /(新.*普通|甲.*乙|两种|两篇|新旧|对比|比较)/.test(option)
    && /(相同|同样|同一|平均|次数|重量|路线|条件)/.test(option)
    && /(破损|重量|结果|数据|记录|分钟|表现)/.test(option));
  const hasPartialEvidence = options.filter((option) => /(感受|一周|一小块|布料|单台|1 台|记录得更完整|以后|再补查)/.test(option)).length >= 1;
  return asksForSupport && hasClaim && hasControlledComparison && hasPartialEvidence;
}

function hasCausalEvidenceStructure(question) {
  const questionText = stripHtml(question?.q || "");
  const options = optionBodies(question);
  const asksForCauseCheck = /原因|造成|导致|主要/.test(questionText) && /哪组资料|哪种信息|判断/.test(questionText);
  const hasHypothesis = /有人认为|有人说|认为主要原因|可能因为/.test(questionText);
  const hasDirectCauseBundle = options.some((option) => /(气温|天气|温度)/.test(option)
    && /(空调|维修|销量|使用)/.test(option)
    && /(居民区|夜间|用电)/.test(option));
  const hasAlternativeBundle = options.filter((option) => /(商场|工厂|新增人口|高峰时间|用水量|其他原因)/.test(option)).length >= 1;
  return asksForCauseCheck && hasHypothesis && hasDirectCauseBundle && hasAlternativeBundle;
}

function acceptedReasoningPattern(question) {
  if (ACCEPTED_REASONING_PATTERNS.has(question?.reasoningPattern)) return question.reasoningPattern;
  if (hasControlVariableStructure(question)) return "control-variable";
  if (hasExceptionArithmeticStructure(question)) return "exception-arithmetic";
  if (hasComparativeEvidenceStructure(question)) return "comparative-evidence";
  if (hasCausalEvidenceStructure(question)) return "causal-evidence";
  return "";
}

function hasReasoningTaskLogic(question) {
  const questionText = stripHtml(question?.q || "");
  const allText = `${questionText} ${optionBodies(question).join(" ")}`;
  const asksForJudgment = /最能|最应该|更合理|判断|支持|一共|多少|比较|原因|怎么改|哪组资料|哪种测试|哪一段|最大|最多/.test(questionText);
  const hasConstraintOrEvidence = /同样|相同|不同|但是|其中|其他|其余|平均|记录|多次|对比|比较|条件|变量|资料|变化|时间|重量|温度|数量|次数|路线|水量|阳光|位置|下雨|湿地|打开|受损|变形/.test(allText);
  return asksForJudgment && hasConstraintOrEvidence;
}

function hasPlausibleOptionSet(question) {
  const options = optionBodies(question);
  if (options.length !== 3) return false;
  const cleanOptions = options.map((option) => option.trim());
  if (new Set(cleanOptions.map(textFingerprint)).size !== cleanOptions.length) return false;
  if (question?.reasoningPattern === "exception-arithmetic") {
    return cleanOptions.every((option) => /^\d+(?:\.\d+)?\s*(个|名|米)$/.test(option));
  }
  if (question?.reasoningPattern === "difference-comparison"
    && cleanOptions.every((option) => /\d+(?:\.\d+)?亿人.*\d+(?:\.\d+)?亿人/.test(option))) {
    return true;
  }
  if (cleanOptions.some((option) => option.length < 10)) return false;
  if (cleanOptions.some((option) => LOW_VALUE_DISTRACTOR_PATTERN.test(option) || SELF_INVALIDATING_OPTION_PATTERN.test(option))) return false;
  const comparableOptions = cleanOptions.filter((option) => /同样|相同|不同|比较|记录|测试|测|量|多次|一次|只|继续|增加|每|分钟|趟|组|样本|资料|变化|原因|条件|平均|温度|重量|路线|水量|阳光|对照|新|普通|甲|乙|高度差|上升|预警|次数|用时|现场/.test(option));
  return comparableOptions.length === cleanOptions.length;
}

function hasHighQualityReasoning(question) {
  return hasReasoningTaskLogic(question)
    && hasPlausibleOptionSet(question)
    && Boolean(acceptedReasoningPattern(question) || /资料题|计算题|探究题|推理题/.test(stripHtml(question?.q || "")));
}

function quizQualityPenalty(item) {
  const questionText = stripHtml(item.q || "");
  const { options } = splitQuizQuestion(item);
  const optionText = options.join(" ");
  let penalty = WEAK_OPTION_PATTERN.test(optionText) ? -5000 : 0;
  if (OBVIOUS_WRONG_OPTION_PATTERN.test(optionText)) penalty -= 3200;
  if (OPTION_GIVEAWAY_PATTERN.test(optionText)) penalty -= 2200;
  if (LOW_VALUE_DISTRACTOR_PATTERN.test(optionText)) penalty -= 3800;
  if (SELF_INVALIDATING_OPTION_PATTERN.test(optionText)) penalty -= 7000;
  if (options.length === 3 && quizDifficulty(item) >= 3 && !hasHighQualityReasoning(item)) penalty -= 2400;
  if (/地图上，?1 厘米代表实际|地图比例尺是 1:100000|图上 1 厘米代表实际多少千米|学校到科技馆.*往返/.test(questionText)) penalty -= 900;
  if (/网上出现|消息是否可靠|转发更多|夸张标题/.test(questionText)) penalty -= 6000;
  if (/只比较谁|只看|只为了|只把|通常说明什么|最重要的意义/.test(questionText)) penalty -= 900;
  if (options.length) {
    if (options.length !== 3) penalty -= 800;
    const optionBodiesForLength = options.map((option) => option.replace(/^[A-D]\.\s*/, "").trim());
    const optionBodyLengths = optionBodiesForLength.map((option) => option.length);
    const allowsShortNumericOptions = item?.reasoningPattern === "exception-arithmetic"
      && optionBodiesForLength.every((option) => /^\d+(?:\.\d+)?\s*(个|名|米)$/.test(option));
    if (optionBodyLengths.some((length) => length < 8) && !allowsShortNumericOptions) penalty -= 200;
    const maxLength = Math.max(...optionBodyLengths, 0);
    const minLength = Math.min(...optionBodyLengths.filter(Boolean));
    if (maxLength - minLength > 42 || (minLength && maxLength / minLength > 2.7)) penalty -= 700;
  }
  return penalty;
}

function academicKnowledgeScore(item) {
  const questionText = stripHtml(item.q || "");
  const reasoningPattern = acceptedReasoningPattern(item);
  let score = 0;
  if (/计算题|推理题|探究题|排序题|资料题/.test(questionText)) score += 180;
  if (/为什么|原因|最合理的解释|哪种推测|先后排列|公平实验/.test(questionText)) score += 160;
  if (/多少|几|千米|米|毫米|克|份|四分之一|平均每分钟|相差/.test(questionText)) score += 180;
  if (/能量|电能|储能|发电|太阳能|风能|密度|电路|完整回路|影子|光源|水循环|蒸发|凝结|降水|食物关系|传粉|年轮|化石|卫星|信号|天线|浮力|概率|样本|变量|平均|对照|条件|证据|数据/.test(questionText)) score += 220;
  if (/(样本|变量|对照|条件|只改变|平均).*(证据|判断|是否有效|更适合先参考)|(?:证据|判断|是否有效|更适合先参考).*(样本|变量|对照|条件|只改变|平均)/.test(questionText)) score += 360;
  if (reasoningPattern === "control-variable") score += 950;
  if (reasoningPattern === "exception-arithmetic") score += 900;
  if (reasoningPattern === "comparative-evidence") score += 930;
  if (reasoningPattern === "causal-evidence") score += 920;
  if (reasoningPattern === "difference-comparison") score += 940;
  if (reasoningPattern === "rate-comparison") score += 940;
  if (/新闻题：/.test(questionText) && !/为什么|原因|计算|推理|实验|能量|电路|卫星|信号|发电|水循环|传粉|密度/.test(questionText)) score -= 320;
  return score;
}

function quizDifficulty(item) {
  if (Number.isFinite(item.difficulty)) return item.difficulty;
  const questionText = stripHtml(item.q || "");
  if (/资料题|推理题|探究题|计算题|排序题/.test(questionText)) return 3;
  if (/简答题|解释题|为什么/.test(questionText)) return 2;
  return 1;
}

function questionConceptId(item = {}) {
  const questionText = stripHtml(item.q || "");
  const semanticConcepts = [
    [/(地质灾害|隐患点).*?(发生比例|风险区|预计险情总数)/, "concept-geohazard-point-area-rate"],
    [/(科学探究平均分|做中学.*科学课程).*(额外提升|同期提升)/, "concept-policy-difference-in-differences"],
    [/(卫星.*太空处理图像|太空处理图像.*卫星|太空算力.*火情预警)/, "concept-space-computing-warning"],
    [/(学生预约购票|预约购票.*反复刷票|学生.*购票.*操作时间)/, "concept-student-ticket-reservation"],
    [/地图.*(厘米|比例尺)|比例尺.*(距离|千米)/, "concept-map-distance"],
    [/年轮.*(宽|气候|生长)/, "concept-tree-ring-climate"],
    [/(完整回路|电路没有形成|导线没有接|小灯泡要亮)/, "concept-closed-circuit"],
    [/(传粉|蜜蜂).*?(果实|植物|花粉)/, "concept-pollination"],
    [/(食物关系|食物网|青蛙.*昆虫)/, "concept-food-web"],
    [/(水循环|蒸发.*凝结.*降水)/, "concept-water-cycle"],
    [/(密度|大小完全相同.*重)/, "concept-density"],
    [/(影子.*太阳|太阳.*影子)/, "concept-shadow-direction"],
    [/(用肺呼吸.*母乳|鲸鱼.*呼吸)/, "concept-mammal-features"],
    [/(卫星.*距离信息|手机定位|地图定位)/, "concept-satellite-positioning"],
    [/(太阳能板|光伏板).*?(电能|发电)/, "concept-solar-energy"],
    [/(遗址|考古).*?(稻谷|石镰|储粮)/, "concept-archaeology-evidence"],
    [/(实验最公平|一次只改变一个|比较.*蒸发)/, "concept-fair-experiment"],
    [/(晒太阳.*蒸发|开始水量).*?(更公平|只保留)/, "concept-control-variable-evaporation"],
    [/(消息是否可靠|可靠来源|交叉确认)/, "concept-source-verification"],
    [/(网络暴力预警模型|漏掉1条网暴信息记2分|网暴信息.*误报)/, "concept-cyberbullying-weighted-errors"],
    [/(样本更多|控制.*路线|平均.*分钟|机器人电池)/, "concept-evidence-sample"],
    [/(种植方法|阳光更强|只改变种植方法|土壤.*水量.*阳光)/, "concept-evidence-control"],
    [/(储能|存下.*电|新能源常常要配储能)/, "concept-energy-storage"],
    [/(卫星通信|手机信号|对准方向|天线)/, "concept-satellite-signal"],
    [/(无人配送车|包裹).*?(其中|装满|没装满)/, "concept-exception-arithmetic-delivery"],
    [/(校车|同学).*?(其中|坐满|没坐满)/, "concept-exception-arithmetic-bus"],
    [/(月球车).*?(前\s*\d+\s*分钟|绕开石块|其余时间)/, "concept-exception-arithmetic-rover"],
    [/(新材料书包|书包更轻|破损次数|提拉和跌落)/, "concept-comparative-evidence-material"],
    [/(三角形支架|三角支架桥|承重和变形)/, "concept-comparative-evidence-bridge"],
    [/(新保温杯|热水凉得更慢|每隔 30 分钟量一次水温)/, "concept-comparative-evidence-cup"],
    [/(新头盔|普通头盔|模型头受损|头盔变形)/, "concept-comparative-evidence-helmet"],
    [/(新滤网|普通滤网|含沙量|细沙)/, "concept-comparative-evidence-filter"],
    [/(机器人电池|20 台机器人|同样路线|背同样重量)/, "concept-comparative-evidence-robot"],
    [/(夏天用电量|空调维修|居民区夜间用电|天气更热)/, "concept-causal-evidence-electricity"],
    [/(教室下午.*热|西边太阳|太阳照进教室)/, "concept-causal-evidence-classroom-heat"],
    [/(操场.*湿|自动喷灌|湿地的位置|没有下雨)/, "concept-causal-evidence-sprinkler"],
    [/(绿萝|叶子下垂|土壤湿度|浇水后)/, "concept-causal-evidence-plant-water"],
    [/(月球车|机器人).*?(每分钟|行驶|前进)/, "concept-speed-distance"],
    [/(订单|服务平台).*?(投诉率|投诉比例|每\s*\d+\s*笔订单)/, "concept-rate-comparison"],
    [/(国际红树林中心|红树林保护).*?(有效修复面积|预计成活率|预算最多)/, "concept-mangrove-restoration-budget"],
    [/(二氧化氮传感器|三种二氧化氮).*?(长期稳定性|保留比例|最终响应强度)/, "concept-no2-sensor-retention-comparison"],
    [/(景德镇|古瓷胎).*?(本地原料|完整瓷业链|海外沉船)/, "concept-jingdezhen-production-trade-evidence-chain"],
    [/(轴承钢|亮蚀区).*?(循环加载|未加载组|酸液)/, "concept-bearing-fatigue-controlled-evidence"],
    [/(优良天数比例|PM2\.5平均浓度).*?(浓度分布|两个指标|不同方向)/, "concept-air-quality-multiple-indicators"],
    [/(红球|蓝球).*?(可能性|概率)/, "concept-basic-probability"]
  ];
  const matched = semanticConcepts.find(([pattern]) => pattern.test(questionText));
  if (matched) return matched[1];
  return item.conceptId || item.id || textFingerprint(item.q || "");
}

function selectDailyQuestion(news, dayIndex, state) {
  const newsText = getNewsSelectionText(news);
  const candidateQuestions = [...buildNewsQuizQuestions(news, dayIndex), ...buildAdvancedKnowledgeQuestions(dayIndex), ...quizQuestions];
  const inferredLastQuestionId = state.lastQuestionId || candidateQuestions.find((item) => item.q === state.lastQuestion)?.id;
  const inferredLastQuestion = candidateQuestions.find((item) => item.id === inferredLastQuestionId || item.q === state.lastQuestion)
    || { id: state.lastQuestionId, q: state.lastQuestion };
  const recentIds = new Set(getRecentIds(state, "recentQuestionIds", [inferredLastQuestionId]));
  const recentConceptIds = new Set([
    ...getRecentIds(state, "recentQuestionConceptIds", [], RECENT_QUESTION_CONCEPT_SELECTION_LIMIT),
    ...getRecentIds(state, "recentQuestionIds").map((id) => String(id).replace(/-\d+$/, "")),
    questionConceptId(inferredLastQuestion)
  ].filter(Boolean));
  const recentTags = new Set(getRecentPrimaryTags(state, "recentQuestionTags", "recentQuestionIds", candidateQuestions, [inferredLastQuestionId]));
  const recentTexts = getRecentTextFingerprints(state, "recentQuestionTexts", [state.lastQuestion]);
  const scored = candidateQuestions
    .map((item, index) => {
      const candidate = { ...item, conceptId: questionConceptId(item), textFingerprint: textFingerprint(item.q) };
      const matchedTags = item.tags.filter((tag) => newsText.includes(tag));
      const relatedScore = matchedTags.length * 35;
      const difficulty = quizDifficulty(item);
      // Prefer a reviewed, high-quality question tied to today's news over a generic fallback.
      const newsQuestionScore = item.source === "news" && difficulty >= 3 ? 1800 : 0;
      const difficultyScore = difficulty >= 4 ? 760 : difficulty >= 3 ? 520 : difficulty === 2 ? 60 : -700;
      const recentPenalty = recentIds.has(item.id) ? -1000 : 0;
      const recentConceptPenalty = recentConceptIds.has(candidate.conceptId) ? -1800 : 0;
      const recentTagPenalty = recentTags.has(primaryTag(item)) ? -220 : 0;
      const textPenalty = recentTexts.has(candidate.textFingerprint) ? -1400 : 0;
      const answerableScore = /新闻题|选择题|判断题|填空题|计算题|排序题|简答题|解释题|资料题|推理题|探究题/.test(item.q) ? 80 : 0;
      const qualityPenalty = quizQualityPenalty(item);
      const academicScore = academicKnowledgeScore(item);
      const reasoningPattern = acceptedReasoningPattern(item);
      const hasOptions = splitQuizQuestion(item).options.length > 0;
      const qualityOk = qualityPenalty >= 0
        && (difficulty >= 4 || academicScore >= 420)
        && hasOptions
        && hasHighQualityReasoning(item);
      const rotationScore = ((dayIndex + 5) * (index + 17) + news.length * 13) % 149;
      return {
        item: { ...candidate, difficulty, qualityOk, reasoningPattern: reasoningPattern || candidate.reasoningPattern },
        score: relatedScore + newsQuestionScore + difficultyScore + academicScore + rotationScore + recentPenalty + recentConceptPenalty + recentTagPenalty + textPenalty + answerableScore + qualityPenalty
      };
    })
    .sort((a, b) => b.score - a.score);
  if (process.env.PEACH_NEWS_DEBUG_QUIZ === "true") {
    console.log("Peach quiz ranking:", scored.slice(0, 12).map(({ item, score }) =>
      `${item.id}:${score}:quality=${item.qualityOk}:concept=${item.conceptId}`
    ).join(" | "));
    console.log("Peach news quiz ranking:", scored.filter(({ item }) => item.source === "news").map(({ item, score }) =>
      `${item.id}:${score}:quality=${item.qualityOk}:concept=${item.conceptId}`
    ).join(" | "));
  }
  const pools = [
    scored.filter(({ item }) => item.qualityOk && item.difficulty >= 3 && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTags.has(primaryTag(item)) && !recentTexts.has(item.textFingerprint) && hasTagMatch(item, newsText)),
    scored.filter(({ item }) => item.qualityOk && item.difficulty >= 3 && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTags.has(primaryTag(item)) && !recentTexts.has(item.textFingerprint)),
    scored.filter(({ item }) => item.qualityOk && item.difficulty >= 3 && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTexts.has(item.textFingerprint) && hasTagMatch(item, newsText)),
    scored.filter(({ item }) => item.qualityOk && item.difficulty >= 3 && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTexts.has(item.textFingerprint)),
    scored.filter(({ item }) => item.qualityOk && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTags.has(primaryTag(item)) && !recentTexts.has(item.textFingerprint) && hasTagMatch(item, newsText)),
    scored.filter(({ item }) => item.qualityOk && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTags.has(primaryTag(item)) && !recentTexts.has(item.textFingerprint)),
    scored.filter(({ item }) => item.qualityOk && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTexts.has(item.textFingerprint) && hasTagMatch(item, newsText)),
    scored.filter(({ item }) => item.qualityOk && !recentIds.has(item.id) && !recentConceptIds.has(item.conceptId) && !recentTexts.has(item.textFingerprint))
  ];
  for (const pool of pools) {
    for (const { item } of pool) {
      const rotatedQuestion = rotateQuestionOptions(item, dayIndex);
      if (!recentTexts.has(rotatedQuestion.textFingerprint)) return rotatedQuestion;
    }
  }
  throw new Error("No fresh high-quality Peach quiz is available; refusing to reuse a recent concept or lower option quality.");
}

function selectDailyKnowledge(news, dayIndex, state) {
  const knowledgePool = museumEncyclopedia.filter(isHighQualityKnowledgeItem);
  const newsText = getNewsSelectionText(news);
  const recentIds = new Set(getRecentIds(state, "recentEncyclopediaIds", state.lastEncyclopediaIds || [], RECENT_ENCYCLOPEDIA_MEMORY_LIMIT));
  const recentTags = new Set(getRecentPrimaryTags(state, "recentEncyclopediaTags", "recentEncyclopediaIds", knowledgePool, state.lastEncyclopediaIds || []));
  const recentTexts = getRecentTextFingerprints(state, "recentEncyclopediaTexts", [], RECENT_ENCYCLOPEDIA_MEMORY_LIMIT);
  const ranked = knowledgePool
    .map((item, index) => ({ item, score: scoreLearningItem(item, index, dayIndex, newsText, recentIds, recentTags) }))
    .sort((a, b) => b.score - a.score);
  const selected = [];
  const usedIds = new Set();
  const usedPrimaryTags = new Set();
  const usedTexts = new Set();

  const tryPick = (item, avoidRecent = true, avoidSameTag = true, avoidRecentTag = true) => {
    const tag = primaryTag(item);
    const fp = textFingerprint(item.text);
    if (usedIds.has(item.id)) return false;
    if (usedTexts.has(fp) || recentTexts.has(fp)) return false;
    if (recentIds.has(item.id)) return false;
    if (avoidRecentTag && tag && recentTags.has(tag)) return false;
    if (avoidSameTag && tag && usedPrimaryTags.has(tag)) return false;
    selected.push({ ...item, textFingerprint: fp });
    usedIds.add(item.id);
    usedTexts.add(fp);
    if (tag) usedPrimaryTags.add(tag);
    return true;
  };

  for (const entry of ranked) {
    if (selected.length >= 3) break;
    if (knowledgeBodyText(entry.item).length >= 40) tryPick(entry.item, true, true, true);
  }
  for (const entry of ranked) {
    if (selected.length >= 3) break;
    if (knowledgeBodyText(entry.item).length >= 40) tryPick(entry.item, true, true, false);
  }
  for (const entry of ranked) {
    if (selected.length >= 3) break;
    tryPick(entry.item, true, true, true);
  }
  for (const entry of ranked) {
    if (selected.length >= 3) break;
    tryPick(entry.item, false, true, false);
  }

  if (selected.length < 3) {
    throw new Error(`博物小百科可用新条目不足：需要 3 条，只找到 ${selected.length} 条。请先补充新的高质量百科条目，不能复用历史内容。`);
  }

  return selected.slice(0, 3);
}

function isAnswerableQuestion(value = "") {
  return /新闻题|选择题|判断题|填空题|计算题|排序题|简答题|解释题|资料题|推理题|探究题/.test(value);
}

function cleanAnswer(value = "") {
  const cleaned = stripHtml(value).trim();
  return cleaned.replace(/^答案：答案：/, "答案：");
}

function answerBody(value = "") {
  return cleanAnswer(value).replace(/^答案：/, "");
}

function splitQuizQuestion(question) {
  const raw = stripHtml(typeof question === "string" ? question : question?.q || "").replace(/\s+/g, " ").trim();
  const optionMatches = [...raw.matchAll(/([A-D])\.\s*([\s\S]+?)(?=\s+[A-D]\.|$)/g)];
  if (optionMatches.length < 2) {
    return { stem: raw, options: [] };
  }

  const stem = raw.slice(0, optionMatches[0].index).trim();
  const options = optionMatches.map((match) => `${match[1]}. ${match[2].trim()}`);
  return { stem, options };
}

function stableNumber(value = "") {
  let hash = 0;
  for (const ch of String(value)) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function rotateQuestionOptions(question, dayIndex) {
  const { stem, options } = splitQuizQuestion(question);
  const answerText = cleanAnswer(question?.a || "");
  const answerLetter = answerText.match(/^答案：\s*([A-C])/u)?.[1];
  const letters = ["A", "B", "C"];
  if (options.length !== 3 || !answerLetter) {
    return { ...question, textFingerprint: textFingerprint(question?.q || "") };
  }

  const oldAnswerIndex = letters.indexOf(answerLetter);
  if (oldAnswerIndex < 0) return { ...question, textFingerprint: textFingerprint(question?.q || "") };

  const targetAnswerIndex = stableNumber(`${question.id || question.q}:${dayIndex}`) % letters.length;
  const optionBodies = options.map((option) => option.replace(/^[A-D]\.\s*/, "").trim());
  const reorderedBodies = new Array(letters.length);
  for (let index = 0; index < optionBodies.length; index += 1) {
    const newIndex = (index + targetAnswerIndex - oldAnswerIndex + letters.length) % letters.length;
    reorderedBodies[newIndex] = optionBodies[index];
  }

  const rotatedOptions = reorderedBodies.map((body, index) => `${letters[index]}. ${body}`);
  const rotatedQuestion = [stem, ...rotatedOptions].join("\n");
  const oldToNewLetters = Object.fromEntries(
    letters.map((letter, index) => [
      letter,
      letters[(index + targetAnswerIndex - oldAnswerIndex + letters.length) % letters.length]
    ])
  );
  const rotatedAnswer = remapQuizAnswerOptionLetters(answerText, oldToNewLetters);
  return {
    ...question,
    q: rotatedQuestion,
    a: rotatedAnswer,
    textFingerprint: textFingerprint(rotatedQuestion)
  };
}

function formatQuestionForText(question) {
  const { stem, options } = splitQuizQuestion(question);
  if (!options.length) return stem;
  return [stem, ...options].join("\n");
}

function answerRevealText(question, answer, label = "昨天") {
  if (question && answer && isAnswerableQuestion(question)) {
    return `${label}探索题：\n${formatQuestionForText(question)}\n${label}答案：${answerBody(answer)}`;
  }
  return `${label}探索题答案：上一题没有清楚的标准答案。从今天开始，探索题会改成能核对答案的形式。`;
}

function previousAnswerText(state, label = "昨天") {
  return answerRevealText(state.lastQuestion, state.lastAnswer, label);
}

function previousAnswerLabel(reportDate, state = {}) {
  if (!state.lastSentDate) return "上一期";
  const previousDateKey = getLocalDateKey(new Date(reportDate.getTime() - 86400000));
  return state.lastSentDate === previousDateKey ? "昨天" : "上一期";
}

function knowledgeTopic(item) {
  return item.tags?.slice(0, 2).join(" · ") || "小知识";
}

function kidKnowledgeText(item) {
  return trimKidText(String(item.text || "").replace(/^百科小知识：/, ""), 105);
}

function formatKnowledgeForText(item, index) {
  return `${index + 1}. 【${knowledgeTopic(item)}】${kidKnowledgeText(item)}`;
}

function renderNewsBlockHtml(block) {
  return `<div class="card"><h2>${escapeHtml(block.title)}</h2><div class="news-points">${block.lines.map((line) => (
    `<div class="news-point"><div class="point-label">${escapeHtml(line.label)}</div><p class="point-text">${escapeHtml(line.text)}</p></div>`
  )).join("")}</div><div class="source"><div>小来源：${escapeHtml(block.source)}</div>${block.link ? `<div><a href="${escapeHtml(block.link)}">给大人核对的原文链接</a></div>` : ""}</div></div>`;
}

function renderKnowledgeHtml(items) {
  return `<div class="learning-card">${items.map((item, index) => (
    `<div class="knowledge-item"><span class="badge">${index + 1}</span><span><span class="knowledge-topic">${escapeHtml(knowledgeTopic(item))}</span><p class="knowledge-text">${escapeHtml(kidKnowledgeText(item))}</p></span></div>`
  )).join("")}</div>`;
}

function renderQuizQuestionHtml(question) {
  const { stem, options } = splitQuizQuestion(question);
  return `<p class="quiz-question">${escapeHtml(stem)}</p>${options.length ? `<div class="quiz-options">${options.map((option) => `<div class="quiz-option">${escapeHtml(option)}</div>`).join("")}</div>` : ""}`;
}

function renderTextLinesHtml(value = "") {
  return String(value)
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function validateQuestionQuality(question, previousState = {}, label = "探索题", seen = { texts: new Set(), concepts: new Set() }) {
  const errors = [];
  const questionText = stripHtml(question?.q || "");
  const answerText = cleanAnswer(question?.a || "");
  const fp = textFingerprint(questionText);
  const concept = questionConceptId(question);
  const recentTexts = getRecentTextFingerprints(previousState, "recentQuestionTexts", [previousState.lastQuestion]);
  const recentConcepts = new Set([
    ...getRecentIds(previousState, "recentQuestionConceptIds", [], RECENT_QUESTION_CONCEPT_SELECTION_LIMIT),
    questionConceptId({ q: previousState.lastQuestion, id: previousState.lastQuestionId })
  ].filter(Boolean));
  const { options } = splitQuizQuestion(question);
  const optionLetters = new Set(options.map((option) => option.slice(0, 1)));

  if (!questionText) errors.push(`${label}为空`);
  if (!answerText.startsWith("答案：")) errors.push(`${label}缺少标准答案`);
  if (!isAnswerableQuestion(questionText)) errors.push(`${label}不是可核对题型`);
  if (/答案[:：]/.test(questionText)) errors.push(`${label}题干泄露答案`);
  if (quizDifficulty(question) < 3) errors.push(`${label}难度过低`);
  if (quizQualityPenalty(question) < 0) errors.push(`${label}包含低质量或明显错误选项`);
  if (recentTexts.has(fp)) errors.push(`${label}与近期题目文本重复`);
  if (recentConcepts.has(concept)) errors.push(`${label}与近期题目知识点重复`);
  if (seen.texts.has(fp)) errors.push(`${label}在本次邮件内重复`);
  if (seen.concepts.has(concept)) errors.push(`${label}在本次邮件内知识点重复`);
  if (!options.length) errors.push(`${label}缺少三选项结构，不能用于当前每日探索题`);

  if (/选择题|新闻题|资料题|推理题|探究题/.test(questionText) || /A\.\s*/.test(questionText)) {
    if (options.length !== 3) errors.push(`${label}选择项必须为3个`);
    if (options.length === 3 && quizDifficulty(question) >= 3 && !hasReasoningTaskLogic(question)) {
      errors.push(`${label}题干缺少明确推理逻辑：需要可判断的条件、证据或数量关系`);
    }
    if (options.length === 3 && quizDifficulty(question) >= 3 && !hasPlausibleOptionSet(question)) {
      errors.push(`${label}选项质量不足：三个选项必须是同一任务下的可比较方案，不能有自爆、主观投票、外形感受或明显送分项`);
    }
    for (const option of options) {
      const optionBody = option.replace(/^[A-D]\.\s*/, "").trim();
      const numericExceptionOption = question?.reasoningPattern === "exception-arithmetic"
        && /^\d+(?:\.\d+)?\s*(个|名|米)$/.test(optionBody);
      if (optionBody.length < 8 && !numericExceptionOption) errors.push(`${label}选项过短：${option}`);
      if (WEAK_OPTION_PATTERN.test(option) || OBVIOUS_WRONG_OPTION_PATTERN.test(option)) {
        errors.push(`${label}选项一眼可排除：${option}`);
      }
      if (LOW_VALUE_DISTRACTOR_PATTERN.test(option)) {
        errors.push(`${label}选项低价值、过于主观或不在同一比较任务内：${option}`);
      }
      if (SELF_INVALIDATING_OPTION_PATTERN.test(option)) {
        errors.push(`${label}选项包含自我否定或答案提示：${option}`);
      }
      if (OPTION_GIVEAWAY_PATTERN.test(option)) {
        errors.push(`${label}选项存在语言提示：${option}`);
      }
    }
    const optionBodyLengths = options.map((option) => option.replace(/^[A-D]\.\s*/, "").trim().length);
    const maxLength = Math.max(...optionBodyLengths, 0);
    const minLength = Math.min(...optionBodyLengths.filter(Boolean));
    if (maxLength - minLength > 42 || (minLength && maxLength / minLength > 2.7)) {
      errors.push(`${label}选项长度差异过大，容易靠版式猜答案`);
    }
    const answerLetter = answerText.match(/^答案：\s*([A-D])/u)?.[1];
    if (!answerLetter) errors.push(`${label}选择题答案必须写明 A/B/C`);
    if (answerLetter && !optionLetters.has(answerLetter)) errors.push(`${label}答案字母不在选项中`);
  }

  seen.texts.add(fp);
  seen.concepts.add(concept);
  return errors;
}

function validateKnowledgeQuality(items = [], previousState = {}, label = "博物小百科") {
  const errors = [];
  const recentIds = new Set(getRecentIds(previousState, "recentEncyclopediaIds", previousState.lastEncyclopediaIds || [], RECENT_ENCYCLOPEDIA_MEMORY_LIMIT));
  const recentTexts = getRecentTextFingerprints(previousState, "recentEncyclopediaTexts", [], RECENT_ENCYCLOPEDIA_MEMORY_LIMIT);
  const ids = new Set();
  const tags = new Set();
  const texts = new Set();

  if (items.length !== 3) errors.push(`${label}必须正好3条`);
  for (const item of items) {
    const fp = textFingerprint(item?.text || "");
    const tag = primaryTag(item || {});
    const qualityIssues = knowledgeQualityIssues(item || {});
    if (!item?.id || !item?.text) errors.push(`${label}存在空条目`);
    if (qualityIssues.length) errors.push(`${label}质量不合格：${item?.id || "unknown"}（${qualityIssues.join("、")}）`);
    if (ids.has(item.id)) errors.push(`${label}本次重复：${item.id}`);
    if (texts.has(fp)) errors.push(`${label}本次文本重复：${item.id}`);
    if (recentIds.has(item.id)) errors.push(`${label}近期重复：${item.id}`);
    if (recentTexts.has(fp)) errors.push(`${label}近期文本重复：${item.id}`);
    if (tag && tags.has(tag)) errors.push(`${label}同一天主题重复：${tag}`);
    ids.add(item.id);
    texts.add(fp);
    if (tag) tags.add(tag);
  }
  return errors;
}

function validateMessageQuality(message, previousState = {}) {
  const errors = [];
  const quality = message.quality || {};
  const questionSeen = { texts: new Set(), concepts: new Set() };
  const recentIntroTexts = new Set(getRecentIds(previousState, "recentIntroTexts", [], RECENT_MESSAGE_COPY_MEMORY_LIMIT));
  const recentClosingTexts = new Set(getRecentIds(previousState, "recentClosingTexts", [], RECENT_MESSAGE_COPY_MEMORY_LIMIT));

  const genericContentMatch = message.text.match(GENERIC_CONTENT_PATTERN);
  if (genericContentMatch) {
    const genericContentIndex = message.text.indexOf(genericContentMatch[0]);
    const genericContentContext = message.text
      .slice(Math.max(0, genericContentIndex - 90), genericContentIndex + genericContentMatch[0].length + 120)
      .replace(/\s+/g, " ")
      .trim();
    errors.push(`正文包含通用套话、开放式追问或无标准答案兜底文案：${genericContentContext}`);
  }
  const socialResidueMatch = message.text.match(SOCIAL_MEDIA_RESIDUE_PATTERN);
  if (socialResidueMatch) {
    const socialResidueIndex = message.text.indexOf(socialResidueMatch[0]);
    const socialResidueContext = message.text
      .slice(Math.max(0, socialResidueIndex - 80), socialResidueIndex + socialResidueMatch[0].length + 120)
      .replace(/\s+/g, " ")
      .trim();
    errors.push(`正文包含社交媒体残留或低质量聚合标题：${socialResidueContext}`);
  }
  if (quality.introFingerprint && recentIntroTexts.has(quality.introFingerprint)) {
    errors.push("开头鼓励语与近期重复");
  }
  if (quality.closingFingerprint && recentClosingTexts.has(quality.closingFingerprint)) {
    errors.push("结尾文案与近期重复");
  }

  for (const issue of quality.issues || []) {
    errors.push(...dailyNewsIssueQualityIssues({
      newsItems: issue.newsItems,
      recentNewsTitles: [
        ...(Array.isArray(previousState.recentNewsTitles) ? previousState.recentNewsTitles : []),
        ...(Array.isArray(previousState.lastNewsTitles) ? previousState.lastNewsTitles : [])
      ],
      asOf: issue.asOf,
      ...(quality.requirements || {})
    }).map((problem) => `${issue.dateKey || "当天"}：${problem}`));
    errors.push(...validateQuestionQuality(issue.question, issue.previousState || previousState, `${issue.dateKey || "当天"}探索题`, questionSeen));
    errors.push(...validateKnowledgeQuality(issue.knowledgeItems, issue.previousState || previousState, `${issue.dateKey || "当天"}博物小百科`));
  }

  if (errors.length) {
    throw new Error(`Peach quality gate failed:\n- ${errors.join("\n- ")}`);
  }
}

function buildEmail(news, state) {
  const now = REPORT_DATE || new Date();
  const dateText = formatDate(now);
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const question = selectDailyQuestion(news, dayIndex, state);
  const knowledgeItems = selectDailyKnowledge(news, dayIndex, state);
  const blocks = news.map(childNewsBlock);
  const newsItems = news.map((item, index) => newsQualityRecord(item, blocks[index]));
  const dayLabel = DATE_OVERRIDE ? "这一天" : "今天";
  const sourceSummary = formatSourceSummary(news);

  const previousAnswer = previousAnswerText(state, previousAnswerLabel(now, state));

  const encouragement = selectUniqueTextVariant(encouragements, state, "recentIntroTexts", dayIndex, 3);
  const closingNote = selectUniqueTextVariant(closingNotes, state, "recentClosingTexts", dayIndex, 11);
  const intro = `桃子宝贝，你的每日情报来啦！${encouragement.text}`;
  const subject = `${isTest ? "测试 - " : ""}桃子宝贝的每日情报 - ${dateText}`;
  const freshnessNote = `${dayLabel}的小情报来自截至 ${dateText} 可读取的公开新闻源；宁可少一点，也不拿旧消息和编出来的故事凑数。`;
  const emptyNote = blocks.length
    ? ""
    : `${dayLabel}没有抓到足够新鲜、适合小学生阅读的重点新闻，所以这封信只保留博物小百科和探索题，不编假新闻。`;
  const countNote = blocks.length
    ? `${dayLabel}整理了 ${blocks.length} 条小情报，慢慢读就好。`
    : "";
  const text = [
    intro,
    "",
    `日期：${dateText}`,
    countNote,
    sourceSummary,
    freshnessNote,
    emptyNote,
    "",
    ...blocks.flatMap((block) => [
      block.title,
      ...block.lines.map((line) => `- ${line.label}：${line.text}`),
      `- 小来源：${block.source}`,
      block.link ? `- 给大人核对：${block.link}` : "",
      ""
    ]),
    "博物小百科（3条）",
    ...knowledgeItems.map(formatKnowledgeForText),
    "",
    "今日探索题",
    previousAnswer,
    `${dayLabel}的题目：`,
    formatQuestionForText(question),
    "明天公布参考答案。",
    "",
    closingNote.text
  ].join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${EMAIL_STYLES}</style></head>
<body><div class="wrap">
<div class="hero">
<h1>${escapeHtml(intro)}</h1>
<div class="date">${escapeHtml(dateText)}</div>
${countNote ? `<p class="note">${escapeHtml(countNote)}</p>` : ""}
${sourceSummary ? `<p class="note">${escapeHtml(sourceSummary)}</p>` : ""}
<p class="note">${escapeHtml(freshnessNote)}</p>
${emptyNote ? `<p class="note">${escapeHtml(emptyNote)}</p>` : ""}
</div>
${blocks.length ? `<div class="section-title">${escapeHtml(dayLabel)}的小情报</div>` : ""}
${blocks.map(renderNewsBlockHtml).join("")}
<div class="section-title">博物小百科（3条）</div>
${renderKnowledgeHtml(knowledgeItems)}
<div class="section-title">今日探索题</div>
<div class="quiz-card">
<div class="prev-answer">${renderTextLinesHtml(previousAnswer)}</div>
<p class="quiz-label">${escapeHtml(dayLabel)}的题目</p>
${renderQuizQuestionHtml(question)}
<p class="answer-note">参考答案：明天公布。</p>
<p class="closing-note">${escapeHtml(closingNote.text)}</p>
</div>
</div></body></html>`;

  return {
    subject,
    text,
    html,
    playbackData: {
      subject,
      title: "桃子宝贝的每日情报",
      dateKey: getLocalDateKey(now),
      dateText,
      intro,
      summaryNote: countNote || emptyNote || freshnessNote,
      blocks,
      knowledgeItems,
      question,
      previousAnswer,
      closingText: closingNote.text
    },
    nextState: {
      lastRunAt: new Date().toISOString(),
      lastSentDate: getLocalDateKey(now),
      lastReportDate: getLocalDateKey(now),
      lastQuestionId: question.id,
      lastQuestion: question.q,
      lastAnswer: question.a,
      recentQuestionIds: mergeRecentIds(state.recentQuestionIds, [question.id], 36),
      recentQuestionConceptIds: mergeRecentIds(state.recentQuestionConceptIds, [questionConceptId(question)], 90),
      recentQuestionTags: mergeRecentIds(state.recentQuestionTags, [primaryTag(question)], 16),
      recentQuestionTexts: mergeRecentIds(state.recentQuestionTexts, [question.textFingerprint || textFingerprint(question.q)], 365),
      lastEncyclopediaIds: knowledgeItems.map((item) => item.id),
      recentEncyclopediaIds: mergeRecentIds(state.recentEncyclopediaIds, knowledgeItems.map((item) => item.id), RECENT_ENCYCLOPEDIA_MEMORY_LIMIT),
      recentEncyclopediaTags: mergeRecentIds(state.recentEncyclopediaTags, knowledgeItems.map(primaryTag), 18),
      recentEncyclopediaTexts: mergeRecentIds(state.recentEncyclopediaTexts, knowledgeItems.map((item) => item.textFingerprint || textFingerprint(item.text)), 1200),
      lastIntroText: encouragement.text,
      recentIntroTexts: mergeRecentIds(state.recentIntroTexts, [encouragement.fingerprint], RECENT_MESSAGE_COPY_MEMORY_LIMIT),
      lastClosingText: closingNote.text,
      recentClosingTexts: mergeRecentIds(state.recentClosingTexts, [closingNote.fingerprint], RECENT_MESSAGE_COPY_MEMORY_LIMIT),
      lastNewsTitles: blocks.map((block) => block.title),
      recentNewsTitles: mergeRecentIds(
        state.recentNewsTitles || state.lastNewsTitles,
        blocks.map((block) => block.title),
        60
      )
    },
    quality: {
      introFingerprint: encouragement.fingerprint,
      closingFingerprint: closingNote.fingerprint,
      requirements: {
        minimumNewsCount: MIN_DAILY_NEWS_COUNT,
        minimumPublisherCount: MIN_DAILY_PUBLISHER_COUNT,
        maxItemsPerPublisher: MAX_ITEMS_PER_PUBLISHER,
        maxAgeHours: MAX_NEWS_AGE_HOURS
      },
      issues: [{
        dateKey: getLocalDateKey(now),
        asOf: now.toISOString(),
        question,
        knowledgeItems,
        newsItems,
        previousState: state
      }]
    }
  };
}

async function buildMergedBackfillEmail(reportDates, initialState) {
  const sortedDates = [...reportDates].sort((a, b) => a.getTime() - b.getTime());
  let rollingState = { ...initialState };
  const issues = [];
  const mergedSeen = new Set();

  for (const reportDate of sortedDates) {
    const issuePreviousState = { ...rollingState };
    const allNews = filterPreviouslySentNews(await collectNews(reportDate, rollingState), rollingState)
      .filter((item) => {
        const title = kidNewsTitle(item);
        if (/通信试验卫星.*二十六号.*A星/.test(title)) return false;
        if (/夏季达沃斯/.test(title)) return false;
        if (/欧莱雅.*链博会|智能包装中心/.test(title)) return false;
        if (/港交所|递表|聆讯|上市申请/.test(title)) return false;
        return true;
      });
    const news = [];
    for (const item of allNews) {
      const key = semanticTopicKey(item) || normalizeForDedupe(item.title);
      if (mergedSeen.has(key)) continue;
      mergedSeen.add(key);
      news.push(item);
      if (news.length >= 3) break;
    }
    const dayIndex = Math.floor(reportDate.getTime() / 86400000);
    const question = selectDailyQuestion(news, dayIndex, rollingState);
    const knowledgeItems = selectDailyKnowledge(news, dayIndex, rollingState);
    const blocks = news.map(childNewsBlock);
    const newsItems = news.map((item, index) => newsQualityRecord(item, blocks[index]));
    const dateKey = getLocalDateKey(reportDate);

    issues.push({
      date: reportDate,
      dateKey,
      dateText: formatDate(reportDate),
      news,
      blocks,
      newsItems,
      question,
      knowledgeItems,
      sourceSummary: formatSourceSummary(news),
      previousState: issuePreviousState
    });

    rollingState = {
      ...rollingState,
      lastQuestionId: question.id,
      lastQuestion: question.q,
      lastAnswer: question.a,
      recentQuestionIds: mergeRecentIds(rollingState.recentQuestionIds, [question.id], 36),
      recentQuestionConceptIds: mergeRecentIds(rollingState.recentQuestionConceptIds, [questionConceptId(question)], 90),
      recentQuestionTags: mergeRecentIds(rollingState.recentQuestionTags, [primaryTag(question)], 16),
      recentQuestionTexts: mergeRecentIds(rollingState.recentQuestionTexts, [question.textFingerprint || textFingerprint(question.q)], 365),
      lastEncyclopediaIds: knowledgeItems.map((item) => item.id),
      recentEncyclopediaIds: mergeRecentIds(
        rollingState.recentEncyclopediaIds,
        knowledgeItems.map((item) => item.id),
        RECENT_ENCYCLOPEDIA_MEMORY_LIMIT
      ),
      recentEncyclopediaTags: mergeRecentIds(rollingState.recentEncyclopediaTags, knowledgeItems.map(primaryTag), 18),
      recentEncyclopediaTexts: mergeRecentIds(rollingState.recentEncyclopediaTexts, knowledgeItems.map((item) => item.textFingerprint || textFingerprint(item.text)), 1200),
      lastNewsTitles: blocks.map((block) => block.title),
      recentNewsTitles: mergeRecentIds(
        rollingState.recentNewsTitles || rollingState.lastNewsTitles,
        blocks.map((block) => block.title),
        60
      )
    };
  }

  const firstIssue = issues[0];
  const lastIssue = issues[issues.length - 1];
  const rangeText = `${firstIssue.dateText} 至 ${lastIssue.dateText}`;
  const totalNewsCount = issues.reduce((count, issue) => count + issue.blocks.length, 0);
  const totalKnowledgeCount = issues.reduce((count, issue) => count + issue.knowledgeItems.length, 0);
  const dayIndex = Math.floor(lastIssue.date.getTime() / 86400000);
  const encouragement = selectUniqueTextVariant(encouragements, initialState, "recentIntroTexts", dayIndex, 3);
  const closingNote = selectUniqueTextVariant(closingNotes, initialState, "recentClosingTexts", dayIndex, 11);
  const intro = `桃子宝贝，你的每日情报补推来啦！${encouragement.text}`;
  const previousAnswer = previousAnswerText(initialState, "上次");
  const subject = `${isTest ? "测试 - " : ""}桃子宝贝的每日情报补推 - ${firstIssue.dateKey} 至 ${lastIssue.dateKey}`;
  const text = [
    intro,
    "",
    `补推范围：${rangeText}`,
    `这封把漏发的 ${issues.length} 天合并成一封；每一天最多精选 3 条重点新闻，并保留 3 条博物小百科和 1 道探索题。题目不在当天公布答案，下一天再公布上一题答案。`,
    `本次合计：${totalNewsCount} 条小情报，${totalKnowledgeCount} 条博物小百科。`,
    "宁可少一点，也不拿旧消息和编出来的故事凑数。",
    "",
    previousAnswer,
    "",
    ...issues.flatMap((issue, index) => [
      `【${issue.dateText}】`,
      issue.sourceSummary,
      "",
      ...(index > 0 ? [
        "上一天探索题答案",
        answerRevealText(issues[index - 1].question.q, issues[index - 1].question.a, "上一天"),
        ""
      ] : []),
      ...(issue.blocks.length ? issue.blocks.flatMap((block) => [
        block.title,
        ...block.lines.map((line) => `- ${line.label}：${line.text}`),
        `- 小来源：${block.source}`,
        block.link ? `- 给大人核对：${block.link}` : "",
        ""
      ]) : [
        "这一天没有抓到足够新鲜、适合小学生阅读的重点新闻，所以不编假新闻。",
        ""
      ]),
      "这一天的博物小百科（3条）",
      ...issue.knowledgeItems.map(formatKnowledgeForText),
      "",
      "这一天的探索题：",
      formatQuestionForText(issue.question),
      index === issues.length - 1 ? "参考答案：下一封每日情报公布。" : "参考答案：下一天公布。",
      ""
    ]),
    closingNote.text
  ].join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${EMAIL_STYLES}</style></head>
<body><div class="wrap">
<div class="hero">
<h1>${escapeHtml(intro)}</h1>
<div class="date">补推范围：${escapeHtml(rangeText)}</div>
	<p class="note">这封把漏发的 ${issues.length} 天合并成一封；每一天最多精选 3 条重点新闻，并保留 3 条博物小百科和 1 道探索题。题目不在当天公布答案，下一天再公布上一题答案。</p>
<p class="note">本次合计：${totalNewsCount} 条小情报，${totalKnowledgeCount} 条博物小百科。补推读起来会比平时长一点，可以分两次看。</p>
<div class="prev-answer">${renderTextLinesHtml(previousAnswer)}</div>
</div>
	${issues.map((issue, index) => `<div class="day">${escapeHtml(issue.dateText)}</div>
	${issue.sourceSummary ? `<p class="note">${escapeHtml(issue.sourceSummary)}</p>` : ""}
	${index > 0 ? `<div class="prev-answer">${renderTextLinesHtml(answerRevealText(issues[index - 1].question.q, issues[index - 1].question.a, "上一天"))}</div>` : ""}
	<div class="section-title">这一天的小情报</div>
	${issue.blocks.length ? issue.blocks.map(renderNewsBlockHtml).join("") : `<div class="card"><p class="note">这一天没有抓到足够新鲜、适合小学生阅读的重点新闻，所以不编假新闻。</p></div>`}
<div class="section-title">这一天的博物小百科（3条）</div>
${renderKnowledgeHtml(issue.knowledgeItems)}
<div class="section-title">这一天的探索题</div>
	<div class="quiz-card">
	<p class="quiz-label">题目</p>
	${renderQuizQuestionHtml(issue.question)}
	<p class="answer-note">${index === issues.length - 1 ? "参考答案：下一封每日情报公布。" : "参考答案：下一天公布。"}</p>
	</div>`).join("")}
<div class="closing-note">${escapeHtml(closingNote.text)}</div>
</div></body></html>`;

  return {
    subject,
    text,
    html,
    nextState: {
      lastRunAt: new Date().toISOString(),
      lastSentDate: lastIssue.dateKey,
      lastReportDate: `${firstIssue.dateKey}..${lastIssue.dateKey}`,
      lastQuestionId: lastIssue.question.id,
      lastQuestion: lastIssue.question.q,
      lastAnswer: lastIssue.question.a,
      recentQuestionIds: rollingState.recentQuestionIds,
      recentQuestionConceptIds: rollingState.recentQuestionConceptIds,
      recentQuestionTags: rollingState.recentQuestionTags,
      recentQuestionTexts: rollingState.recentQuestionTexts,
      lastEncyclopediaIds: lastIssue.knowledgeItems.map((item) => item.id),
      recentEncyclopediaIds: rollingState.recentEncyclopediaIds,
      recentEncyclopediaTags: rollingState.recentEncyclopediaTags,
      recentEncyclopediaTexts: rollingState.recentEncyclopediaTexts,
      lastIntroText: encouragement.text,
      recentIntroTexts: mergeRecentIds(initialState.recentIntroTexts, [encouragement.fingerprint], RECENT_MESSAGE_COPY_MEMORY_LIMIT),
      lastClosingText: closingNote.text,
      recentClosingTexts: mergeRecentIds(initialState.recentClosingTexts, [closingNote.fingerprint], RECENT_MESSAGE_COPY_MEMORY_LIMIT),
      lastNewsTitles: issues.flatMap((issue) => issue.blocks.map((block) => `${issue.dateKey} ${block.title}`)),
      recentNewsTitles: rollingState.recentNewsTitles
    },
    quality: {
      introFingerprint: encouragement.fingerprint,
      closingFingerprint: closingNote.fingerprint,
      requirements: {
        minimumNewsCount: 1,
        minimumPublisherCount: 1,
        maxItemsPerPublisher: 3,
        maxAgeHours: MAX_NEWS_AGE_HOURS
      },
      issues: issues.map((issue) => ({
        dateKey: issue.dateKey,
        asOf: issue.date.toISOString(),
        question: issue.question,
        knowledgeItems: issue.knowledgeItems,
        newsItems: issue.newsItems,
        previousState: issue.previousState
      }))
    }
  };
}

function buildNewsAuditManifest(message, previousState = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reportType: REPORT_DATES.length > 1 ? "merged-backfill" : isTest ? "test" : "daily",
    requirements: message.quality?.requirements || {},
    recentNewsTitles: [
      ...(Array.isArray(previousState.recentNewsTitles) ? previousState.recentNewsTitles : []),
      ...(Array.isArray(previousState.lastNewsTitles) ? previousState.lastNewsTitles : [])
    ],
    issues: (message.quality?.issues || []).map((issue) => ({
      dateKey: issue.dateKey,
      asOf: issue.asOf,
      newsItems: issue.newsItems || []
    }))
  };
}

async function sendEmail(message) {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing SMTP env: ${missing.join(", ")}`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.REPORT_EMAIL_FROM || process.env.SMTP_USER,
    to: EMAIL_TO,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}

const state = await readState();
const sendDecision = shouldSendScheduledEmail(state);
if (!sendDecision.ok) {
  console.log(`Skipped send (${sendDecision.reason}) for ${EMAIL_TO}`);
  process.exit(0);
}
let message = REPORT_DATES.length > 1
  ? await buildMergedBackfillEmail(REPORT_DATES, state)
  : buildEmail(filterPreviouslySentNews(await collectNews(NEWS_AS_OF, state), state), state);
console.log(`Selected Peach news: ${(message.nextState?.lastNewsTitles || []).join(" | ") || "none"}`);
console.log(`Selected Peach quiz: ${message.nextState?.lastQuestionId || "none"} (${questionConceptId({
  id: message.nextState?.lastQuestionId,
  q: message.nextState?.lastQuestion
})})`);
console.log(`Selected Peach knowledge: ${(message.quality?.issues || [])
  .flatMap((issue) => issue.knowledgeItems || [])
  .map((item) => `${item.id} [${primaryTag(item)}]`)
  .join(" | ") || "none"}`);
await fs.writeFile(OUT_NEWS_AUDIT, `${JSON.stringify(buildNewsAuditManifest(message, state), null, 2)}\n`, "utf8");
validateMessageQuality(message, state);
if (PLAYBACK_URL_OVERRIDE) {
  message = attachPlaybackToMessage(message, {
    dateKey: playbackSlugForMessage(message),
    playbackUrl: PLAYBACK_URL_OVERRIDE
  });
  console.log(`Using external playback page ${PLAYBACK_URL_OVERRIDE}`);
} else if (PLAYBACK_ENABLED) {
  const playback = await generatePlaybackAssets(message);
  if (playback) {
    message = attachPlaybackToMessage(message, playback);
    console.log(`Generated playback page at ${playback.indexPath}${playback.playbackUrl ? ` (${playback.playbackUrl})` : ""}`);
  }
}
await fs.writeFile(OUT_TEXT, message.text, "utf8");
await fs.writeFile(OUT_HTML, message.html, "utf8");
if (!isDryRun || PLAYBACK_URL_OVERRIDE) {
  await validateExternalPlaybackPageMatchesEmail(message.text);
}
if (isDryRun) {
  await fs.writeFile(OUT_NEXT_STATE, `${JSON.stringify(message.nextState, null, 2)}\n`, "utf8");
  console.log(`Dry run generated ${OUT_TEXT} and ${OUT_HTML}`);
} else {
  await sendEmail(message);
  await fs.writeFile(STATE_FILE, `${JSON.stringify(message.nextState, null, 2)}\n`, "utf8");
}
console.log(`${isDryRun ? "Prepared" : "Sent"} ${message.subject} to ${EMAIL_TO}`);
