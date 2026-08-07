import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyNewsPillar,
  isLocalSelfPromotionNews,
  isLowQualityNewsSource,
  isPromotionalStudyTourNews,
  isSmartMountainHighwayStory,
  namedTyphoonEventKey,
  newsQualityIssues
} from "./peach-content-quality.mjs";

test("deduplicates named typhoons by storm name across different response angles", () => {
  assert.equal(namedTyphoonEventKey("台风“白海豚”向华东靠近，沿海提前防御"), "named-typhoon-白海豚");
  assert.equal(namedTyphoonEventKey("福建应对第8号台风“白海豚”，暂停部分海上交通"), "named-typhoon-白海豚");
  assert.equal(namedTyphoonEventKey("福建启动防台风应急响应"), "");
});

test("does not mistake generic air-ground coordination for a smart-highway story", () => {
  assert.equal(isSmartMountainHighwayStory("中国卫通空地协同保畅通，全力护航台风抢险救援"), false);
  assert.equal(isSmartMountainHighwayStory("秦巴山区高速公路用空地协同系统巡查风险"), true);
  assert.equal(isSmartMountainHighwayStory("山区公路开展空地协同巡检"), true);
});

test("rejects promotional, market-hype, and truncated source stories", () => {
  const rejected = [
    "2026中国(郑州)国际人工智能行业博览会-电力展会-北极星电力会展网-电力行业品牌会展网",
    "快讯：商业航天、卫星导航板块持续大涨 中天火箭等50余股涨停",
    "高技术制造业服务业增势猛！上半年山东工业机器人开票销售收入同比增长17.1%",
    "中国石化完成对中国航油重组 中国航油成为二级全资子公司",
    "美赞臣荣膺2026‘扬善计划’榜样企业 护航儿童健康成长",
    "对谈｜谢康×乔晓春：AI浪潮下，教育的底层逻辑有哪些改变",
    "AI融入教学后，学生还需要死记硬背知识点吗？",
    "AI动画课堂：遭遇山洪泥石流，如何科学保命？丨民生情报站"
  ];

  for (const sourceTitle of rejected) {
    assert.equal(isLowQualityNewsSource(sourceTitle), true, sourceTitle);
  }
});

test("rejects study-tour promotion instead of treating every education keyword as news", () => {
  const rejected = [
    "暑期研学热：家门口课堂渐成新选择",
    "某地推出十条精品研学路线，解锁文旅新体验",
    "科普展馆成为热门研学打卡地"
  ];

  for (const sourceTitle of rejected) {
    assert.equal(isPromotionalStudyTourNews(sourceTitle), true, sourceTitle);
    const issues = newsQualityIssues({
      sourceTitle,
      title: sourceTitle,
      summary: "当地发布了面向学生的研学路线和体验活动。",
      value: "这些活动把参观和学习安排在一起。",
      impact: "暑期会有更多家庭了解这些活动。"
    });
    assert.ok(issues.some((issue) => issue.includes("研学推广")), issues.join("\n"));
  }
});

test("keeps public-interest regulation of study tours and local emergency reporting", () => {
  const regulatedStudyTour = "文旅部加强研学旅行安全监管并整治收费乱象";
  const localEmergency = "福建启动防台风应急响应并转移危险区域群众";

  assert.equal(isPromotionalStudyTourNews(regulatedStudyTour), false);
  assert.equal(classifyNewsPillar(regulatedStudyTour), "时政");
  assert.equal(isLocalSelfPromotionNews(localEmergency), false);
  assert.equal(classifyNewsPillar(localEmergency), "时政");
});

test("rejects local self-promotion even when the title contains technology or development words", () => {
  const rejected = [
    "浙江经济观察：科技副总为县域行业带来创新活力",
    "中国苎麻之乡四川大竹：一根中国草织就乡村振兴共富路",
    "港澳大学生逐浪海南自贸港：解锁封关机遇",
    "致远学院召开2026年度教学研讨年会聚焦AI时代教学改革",
    "湖南师范大学外国语学院：AI融入课堂 教育更鲜活",
    "上海智元课堂、智身课堂来了，AI将教育供给从规模化推向规模化+个性化",
    "西安交通大学国际学生参加学体联2026年全国大学生舞龙舞狮锦标赛",
    "暑托班带孩子了解脑机接口，走进科技企业体验未来生活",
    "东明县未保中心开展乡村儿童心理健康公益课堂",
    "深耕乡村教育沃土！广师大综合素养公益课堂走进大埔西岭实验学校",
    "当AI走进乡村课堂，江苏师大这场暑期实践有料有趣",
    "教育部直属高等工业学校体育协会体育教学研讨会在我校举办",
    "2026年三江源生态文化旅游节暨第四十四届玉树赛马会开幕"
  ];

  for (const sourceTitle of rejected) {
    assert.equal(isLocalSelfPromotionNews(sourceTitle), true, sourceTitle);
    const issues = newsQualityIssues({
      sourceTitle,
      title: sourceTitle,
      summary: "报道介绍了当地产业、城市形象和发展成果。",
      value: "读者可以了解当地的发展方向。",
      impact: "当地希望吸引更多人关注相关产业。"
    });
    assert.ok(issues.some((issue) => issue.includes("地方自荐")), issues.join("\n"));
  }
});

test("rejects generic AI education commentary without a concrete policy or verified result", () => {
  const sourceTitle = "人工智能教育在中小学如何落地并改变学习方式？";
  assert.equal(isLowQualityNewsSource(sourceTitle), true);
});

test("limits daily stories to politics, technology, society, and major international affairs", () => {
  assert.equal(classifyNewsPillar("教育部发布中小学科学教育新办法"), "时政");
  assert.equal(classifyNewsPillar("科学家更清楚地看见水和冰里的分子排列"), "科技");
  assert.equal(classifyNewsPillar("铁路12306为学生优惠票增加预约购票服务"), "社会");
  assert.equal(classifyNewsPillar("联合国成员讨论全球气候治理新协议"), "国际大事");
  assert.equal(classifyNewsPillar("日本熊本县7.1级地震造成伤亡并损坏基础设施"), "国际大事");
  assert.equal(classifyNewsPillar("乌克兰首都基辅遭弹道导弹袭击"), "国际大事");
  assert.equal(classifyNewsPillar("城市夜市发布夏日美食打卡地图"), "");
  assert.equal(classifyNewsPillar("西安交通大学国际学生参加全国大学生舞龙舞狮锦标赛"), "");
  assert.equal(classifyNewsPillar("强流重离子加速器装置建成并投入试运行，可用于研究原子核"), "科技");
  assert.equal(classifyNewsPillar("研究团队发现调节玉米收获指数的关键分子模块，并完成田间试验"), "科技");
  assert.equal(classifyNewsPillar("中国数学家获得菲尔兹奖，数学研究取得重要进展"), "科技");
  assert.equal(classifyNewsPillar("考古实证中国新石器时代已发明轮轴机械"), "科技");
  assert.equal(classifyNewsPillar("西安光机所在无标记三维显微成像领域取得进展"), "科技");
  assert.equal(classifyNewsPillar("四川重庆陕西广东等地有强降水和强对流天气"), "社会");
  assert.equal(classifyNewsPillar("欧洲多地野火蔓延，希腊发布新的疏散命令"), "国际大事");
  assert.equal(classifyNewsPillar("危地马拉富埃戈火山喷发，附近居民进入避难所"), "国际大事");
  assert.equal(classifyNewsPillar("三部门下达资金支持农业防灾减灾和水利工程设施水毁修复"), "社会");
  assert.equal(classifyNewsPillar("我国牵头的区块链国际标准在国际标准化组织ISO立项"), "科技");
  assert.equal(classifyNewsPillar("保护区首次发现新鸟种，鸟类物种名录增至262种"), "科技");
  assert.equal(classifyNewsPillar("团队研发能感知压力方向和温度的柔性电子皮肤"), "科技");
  assert.equal(classifyNewsPillar("全球首座16兆瓦张力腿浮式风电平台正式投用"), "科技");

  const issues = newsQualityIssues({
    sourceTitle: "城市夜市发布夏日美食打卡地图",
    title: "城市夜市推出新的美食地图",
    summary: "地图标出了夜市里的餐饮摊位。",
    value: "游客能按地图寻找不同食物。",
    impact: "夜市希望吸引更多游客前来消费。"
  });
  assert.ok(issues.some((issue) => issue.includes("时政、科技、社会或国际大事")), issues.join("\n"));
});

test("keeps national monitoring and cross-border river events as public-interest environment news", () => {
  assert.equal(classifyNewsPillar("上半年全国空气和地表水环境质量改善"), "社会");
  assert.equal(classifyNewsPillar("多瑙河布达佩斯段水位降至31厘米并创历史新低"), "国际大事");

  const nationalEnvironmentIssues = newsQualityIssues({
    sourceTitle: "上半年全国空气和地表水环境质量改善",
    title: "半年监测显示：全国空气和地表水总体变好，但各地变化不同",
    summary: "全国城市PM2.5平均浓度下降，空气质量优良天数比例和地表水优良比例上升，不同区域的变化并不完全相同。",
    value: "不同环境指标回答不同问题，把全国、区域和城市数据分层比较，才能同时看见总体进步和局部风险。",
    impact: "空气和水质监测结果会影响工厂减排、车辆污染控制、污水处理和跨地区治理的重点。"
  });
  assert.deepEqual(nationalEnvironmentIssues, []);
});

test("rejects generic energy wording attached to an unrelated corporate announcement", () => {
  const issues = newsQualityIssues({
    sourceTitle: "中国石化完成对中国航油重组",
    title: "中国石化完成对中国航油重组",
    summary: "中国航油正式成为中国石化二级全资子公司。",
    value: "价值在于让用电和出行更清洁。能源技术进步后，城市可以少一些污染。",
    impact: "社会影响是，能源变化会影响家里的用电、城市空气、电动车和工厂生产。"
  });

  assert.ok(issues.some((issue) => issue.includes("低价值统计")), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.includes("通用套话")), issues.join("\n"));
});

test("rejects explanations whose value and impact drift to another topic", () => {
  const issues = newsQualityIssues({
    sourceTitle: "北京推动大中小学思政教育一体化建设再升级",
    title: "北京推动大中小学思政教育一体化建设再升级",
    summary: "学生们把观察到的问题变成新点子，再用实验验证。",
    value: "价值在于把通信、导航、天气观察和科学研究带到更远的地方。",
    impact: "未来通信、地图和天气预报会越来越依赖太空基础设施。"
  });

  assert.ok(issues.some((issue) => issue.includes("教育主题")), issues.join("\n"));
});

test("rejects generic fallback wording even when keywords appear related", () => {
  const issues = newsQualityIssues({
    sourceTitle: "高技术制造业服务业增势猛",
    title: "山东工业机器人销售收入增长",
    summary: "山东工业机器人开票销售收入同比增长17.1%。",
    value: "价值在于让机器更会帮人处理复杂任务，比如整理信息、识别问题、完成重复工作。",
    impact: "社会影响是，一些重复、危险、需要快速计算的工作会更多交给智能工具。"
  });

  assert.ok(issues.some((issue) => issue.includes("通用套话")), issues.join("\n"));
});

test("rejects agriculture news paired with medical value wording", () => {
  const issues = newsQualityIssues({
    sourceTitle: "黑龙江萝北科技夏管护航丰产 53万亩农田开启航化作业",
    title: "黑龙江萝北科技夏管护航丰产",
    summary: "盛夏时节，正是农作物田间管护、防病保产的关键窗口期。",
    value: "价值在于保护生命和健康，让人生病时更快得到医疗帮助。",
    impact: "未来种地会越来越依靠科学数据、良种和气候适应技术。"
  });

  assert.ok(issues.some((issue) => issue.includes("农业主题")), issues.join("\n"));
});

test("rejects a regional story rewritten as another province's event", () => {
  const issues = newsQualityIssues({
    sourceTitle: "吉林布局低空经济赛道 多元应用场景加快落地",
    title: "吉林布局低空经济赛道",
    summary: "西藏大学成立高原无人机研发应用中心。",
    value: "无人机可能用于高原巡检、救援和运输。",
    impact: "未来复杂地区会使用更多专业无人机。"
  });

  assert.ok(issues.some((issue) => issue.includes("地区错配")), issues.join("\n"));
});

test("rejects industrial AI news rewritten as an unrelated computing platform", () => {
  const issues = newsQualityIssues({
    sourceTitle: "云南将推动人工智能炼铝、制磷、炮制中药",
    title: "云南计划让 AI 帮助炼铝、制磷和加工中药",
    summary: "中国发布了异算方舟平台，帮助程序适配不同国产计算设备。",
    value: "价值在于让不同计算设备更容易一起工作。",
    impact: "未来国产芯片、软件和 AI 应用会更需要统一工具和标准。"
  });

  assert.ok(issues.some((issue) => issue.includes("工业人工智能主题")), issues.join("\n"));
});

test("rejects Amazon knowledge news rewritten as Sahara climate history", () => {
  const issues = newsQualityIssues({
    sourceTitle: "生物多样性减少会导致亚马孙文化知识损失",
    title: "研究发现：亚马孙植物和语言减少会让传统知识流失",
    summary: "科学家研究撒哈拉从湿润环境变成大沙漠的过程。",
    value: "价值在于把地理、历史和科学证据连起来看。",
    impact: "未来可以帮助城市和乡村准备干旱与降雨变化。"
  });

  assert.ok(issues.some((issue) => issue.includes("亚马孙生物文化主题")), issues.join("\n"));
});

test("rejects a design-research title rewritten as a school-count report", () => {
  const issues = newsQualityIssues({
    sourceTitle: "中国设计学自主知识体系构建研究重大专项启动",
    title: "中国设计学自主知识体系构建研究启动",
    summary: "教育部公布了全国高等学校数量，帮助大家了解大学和职业学校的总体规模。",
    value: "学校数量能帮助公众理解教育资源的大致规模。",
    impact: "高等学校数量关系到青年可以在哪里学习。"
  });

  assert.ok(issues.some((issue) => issue.includes("设计研究主题")), issues.join("\n"));
});

test("rejects generic global-trade wording for a platform-economy policy", () => {
  const issues = newsQualityIssues({
    sourceTitle: "平台经济聚力共生共赢",
    title: "平台经济聚力共生共赢",
    summary: "七部门印发促进平台经济大中小企业协同发展的行动方案。",
    value: "价值在于让人们看懂商品、工作和资源怎样流动。",
    impact: "国家之间的科技、贸易、旅行和文化交流会互相影响。"
  });

  assert.ok(issues.some((issue) => issue.includes("平台经济主题")), issues.join("\n"));
});

test("accepts a concrete and coherent child-readable typhoon response block", () => {
  const issues = newsQualityIssues({
    sourceTitle: "福建海事局启动防台风一级应急响应 海上交通关停撤转到位",
    title: "福建沿海为防台风暂停大部分海上交通",
    summary: "台风靠近时，福建沿海暂停大部分客运航线，客船进港避风，海上施工人员也提前撤离。",
    value: "停航和停工会带来不便，但能让船只和人员在强风大浪到来前离开危险海域，减少事故风险。",
    impact: "短期内部分出行和施工会受影响；更长期看，预警、停航和人员转移会组成更完整的防台风安全链。"
  });

  assert.deepEqual(issues, []);
});

test("accepts a specific science explanation without generic filler", () => {
  const issues = newsQualityIssues({
    sourceTitle: "我国科学家攻克水、冰结构世界难题 会给生活带来哪些改变",
    title: "科学家更清楚地看见水和冰里的分子排列",
    summary: "科研团队改进测量和计算方法，研究水结冰前后分子怎样排列，帮助解释水和冰的一些特殊性质。",
    value: "水看起来普通，内部结构却会影响结冰、融化和传热。看清这些变化，能帮助科学家检验关于水的模型。",
    impact: "这类基础研究未来可能帮助改进制冷、材料设计和低温保存，但从实验发现走到实际应用还需要继续验证。"
  });

  assert.deepEqual(issues, []);
});

test("accepts a child-readable typhoon response with delayed-risk reasoning", () => {
  const issues = newsQualityIssues({
    sourceTitle: "全省转移危险区域人员18万多人",
    title: "福建提前转移18万多名危险区域人员躲避台风",
    summary: "台风登陆前后，福建把危险区域居民和海上作业人员提前转移到安全地点。",
    value: "提前转移能避开强风暴雨，台风过后继续监测山洪和滑坡，是在防范雨水渗进土层后才出现的迟到风险。",
    impact: "未来防灾会更重视预警、转移、巡查和恢复连成一条安全链。"
  });

  assert.deepEqual(issues, []);
});

test("accepts a concrete digital-governance explanation", () => {
  const issues = newsQualityIssues({
    sourceTitle: "国家网信办将在2026年APEC数字周期间举办系列活动",
    title: "APEC数字周将讨论人工智能、反诈骗和网络安全",
    summary: "多个经济体将讨论人工智能应用、反网络诈骗、安全上网和数据怎样帮助社会发展。",
    value: "数字服务跨地区使用时，反诈骗、数据安全和保护个人信息需要能互相配合的规则。",
    impact: "这些讨论可能影响人工智能服务怎样接受安全检查，以及网络诈骗怎样跨地区协查。"
  });

  assert.deepEqual(issues, []);
});
