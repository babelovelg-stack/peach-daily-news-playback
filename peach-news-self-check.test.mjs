import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  dailyNewsIssueQualityIssues,
  newsQualityIssues
} from "./peach-content-quality.mjs";
import {
  checkNewsSourceLinks,
  validateNewsAuditManifest
} from "./peach-news-self-check.mjs";

const AS_OF = "2026-07-19T10:00:00.000Z";

function story(overrides = {}) {
  return {
    sourceTitle: "福建沿海为防台风暂停大部分海上交通",
    sourceDescription: "台风靠近福建时，多条客运航线停航，船只回港避风，海上施工人员提前撤离。",
    title: "福建沿海为防台风暂停大部分海上交通",
    summary: "台风靠近时，福建沿海暂停多条客运航线，船只回港避风，海上施工人员也提前撤离。",
    value: "停航会带来不便，但能让船只和人员在强风大浪到来前离开危险海域，减少台风造成的事故风险。",
    impact: "短期内部分出行和施工会受影响；以后预警、停航和人员转移会组成更完整的防台风安全链。",
    publisher: "新华网",
    domain: "news.cn",
    feed: "新华网时政",
    link: "https://www.news.cn/example/typhoon.htm",
    published: Date.parse("2026-07-18T08:00:00.000Z"),
    ...overrides
  };
}

function passingStories() {
  return [
    story(),
    story({
      sourceTitle: "科学家更清楚地看见水和冰里的分子排列",
      sourceDescription: "科研团队改进测量方法，研究水结冰前后分子怎样排列，帮助检验水冰结构模型。",
      title: "科学家更清楚地看见水和冰里的分子排列",
      summary: "科研团队改进测量方法，观察水结冰前后分子怎样排列，也用实验检验水和冰的结构模型。",
      value: "分子排列会影响结冰、融化和传热，看清这些变化能帮助科学家验证水冰结构模型。",
      impact: "这项水冰研究以后可能帮助改进制冷和低温保存，但从实验结果走到实际应用还要继续验证。",
      publisher: "人民网",
      domain: "people.com.cn",
      feed: "人民网科技",
      link: "https://www.people.com.cn/example/water-ice.html"
    }),
    story({
      sourceTitle: "新一组低轨卫星成功发射，将开展通信技术试验",
      sourceDescription: "火箭把一组低轨卫星送入太空，卫星将按计划测试通信链路和在轨运行能力。",
      title: "新一组低轨卫星进入太空测试通信技术",
      summary: "火箭把一组低轨卫星送入太空，它们将测试通信链路和在轨运行能力。",
      value: "低轨卫星离地球较近，多颗卫星配合可以检验通信覆盖、信号稳定和设备在太空工作的能力。",
      impact: "卫星通信试验如果稳定，未来可为山区和海上补充网络，但正式服务前仍要经过长期在轨验证。",
      publisher: "央视网",
      domain: "cctv.com",
      feed: "央视科技",
      link: "https://news.cctv.com/example/satellite.html"
    })
  ];
}

function manifest(newsItems = passingStories()) {
  return {
    schemaVersion: 1,
    generatedAt: AS_OF,
    reportType: "daily",
    requirements: {
      minimumNewsCount: 3,
      minimumPublisherCount: 2,
      maxItemsPerPublisher: 2,
      maxAgeHours: 72
    },
    recentNewsTitles: [],
    issues: [{ dateKey: "2026-07-19", asOf: AS_OF, newsItems }]
  };
}

test("rejects the title-to-body mismatches that passed on July 17 and July 18", () => {
  const cases = [
    {
      sourceTitle: "暑期研学产品怎么选？四步避开只游不学",
      title: "暑期研学产品怎么选？四步避开只游不学",
      summary: "有地方把 AI 和大数据用到教学里，系统会记录学生的学习情况。",
      value: "数字工具可以帮助老师整理信息，但不能代替人的判断。",
      impact: "未来课堂会变成老师判断和数字工具辅助一起工作。"
    },
    {
      sourceTitle: "聚焦低空、机器人等新领域 教育部增补27个职业教育专业",
      title: "教育部增补27个职业教育专业",
      summary: "教育部公布了全国高等学校数量，让大家了解大学和职业学校的总体规模。",
      value: "学校数量能帮助公众理解教育资源的大致规模。",
      impact: "高等学校数量关系到青年可以在哪里学习。"
    },
    {
      sourceTitle: "中国苎麻之乡四川大竹：一根中国草织就乡村振兴共富路",
      title: "四川大竹用苎麻制作透气环保的纺织品",
      summary: "四川大竹种植苎麻，并把苎麻纤维加工成吸湿透气的布料和生活用品。",
      value: "研究种子、土壤和天气，能帮助农民种出更多、更安全的粮食。",
      impact: "以后种地会越来越依靠良种、农业数据和气候适应技术。"
    }
  ];

  for (const item of cases) {
    const issues = newsQualityIssues(item);
    assert.ok(issues.some((issue) => issue.includes("标题正文主题不一致")), issues.join("\n"));
  }
});

test("rejects an automatic issue with too few stories or only one publisher", () => {
  const onePublisher = passingStories().map((item, index) => ({
    ...item,
    publisher: "中国新闻网",
    domain: "chinanews.com.cn",
    link: `https://www.chinanews.com.cn/example/${index + 1}.shtml`
  }));
  const tooFewIssues = dailyNewsIssueQualityIssues({
    newsItems: onePublisher.slice(0, 1),
    asOf: AS_OF,
    minimumNewsCount: 2,
    minimumPublisherCount: 2,
    maxItemsPerPublisher: 2,
    maxAgeHours: 72
  });
  const singleSourceIssues = dailyNewsIssueQualityIssues({
    newsItems: onePublisher.slice(0, 2),
    asOf: AS_OF,
    minimumNewsCount: 2,
    minimumPublisherCount: 2,
    maxItemsPerPublisher: 2,
    maxAgeHours: 72
  });

  assert.ok(tooFewIssues.some((issue) => issue.includes("至少2条")), tooFewIssues.join("\n"));
  assert.ok(singleSourceIssues.some((issue) => issue.includes("至少2个独立来源")), singleSourceIssues.join("\n"));
});

test("rejects semantically duplicated stories and stale or invalid sources", () => {
  const stories = passingStories();
  stories[1] = story({
    sourceTitle: "教育部增补27个职业教育本专科专业",
    title: "教育部增补27个职业教育本专科专业",
    summary: "教育部新增27个职业教育专业，对接低空经济、机器人等行业的人才需要。",
    value: "职业教育专业会把课程和真实工作任务连起来，让学生练习低空设备和机器人的实际技能。",
    impact: "新专业会先在部分职业学校设置，未来能否培养出合适人才，还要看课程、实训和就业反馈。",
    publisher: "人民网",
    domain: "people.com.cn",
    link: "not-a-url",
    published: Date.parse("2026-07-10T08:00:00.000Z")
  });
  stories[2] = story({
    sourceTitle: "聚焦低空机器人等新领域 教育部增补27个职业教育专业",
    title: "教育部为低空和机器人等领域增补27个职业教育专业",
    summary: "教育部新增27个职业教育专业，对接低空经济、机器人等行业的人才需要。",
    value: "职业教育专业会把课程和真实工作任务连起来，让学生练习低空设备和机器人的实际技能。",
    impact: "新专业会先在部分职业学校设置，未来能否培养出合适人才，还要看课程、实训和就业反馈。",
    publisher: "央视网",
    domain: "cctv.com",
    link: "https://news.cctv.com/example/vocational.html"
  });

  const issues = dailyNewsIssueQualityIssues({
    newsItems: stories,
    asOf: AS_OF,
    minimumNewsCount: 3,
    minimumPublisherCount: 2,
    maxItemsPerPublisher: 2,
    maxAgeHours: 72
  });

  assert.ok(issues.some((issue) => issue.includes("主题重复")), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.includes("链接无效")), issues.join("\n"));
  assert.ok(issues.some((issue) => issue.includes("超过72小时")), issues.join("\n"));
});

test("rejects a story that repeats the same event from a recent daily issue", () => {
  const stories = passingStories();
  const issues = dailyNewsIssueQualityIssues({
    newsItems: stories,
    recentNewsTitles: ["第 1 条小情报：福建启动防台风响应并暂停多条海上客运航线"],
    asOf: AS_OF,
    minimumNewsCount: 2,
    minimumPublisherCount: 2,
    maxItemsPerPublisher: 2,
    maxAgeHours: 72
  });

  assert.ok(issues.some((issue) => issue.includes("新闻近期重复")), issues.join("\n"));
});

test("accepts a fresh, coherent issue with multiple independent sources", () => {
  assert.deepEqual(dailyNewsIssueQualityIssues({
    newsItems: passingStories(),
    asOf: AS_OF,
    minimumNewsCount: 3,
    minimumPublisherCount: 2,
    maxItemsPerPublisher: 2,
    maxAgeHours: 72
  }), []);
  assert.deepEqual(validateNewsAuditManifest(manifest()), []);
});

test("defaults the final audit gate to the rolling 24-hour window", () => {
  const audit = manifest();
  delete audit.requirements.maxAgeHours;

  const errors = validateNewsAuditManifest(audit);
  assert.ok(errors.some((issue) => issue.includes("超过24小时")), errors.join("\n"));
});

test("rejects the exact previous cutoff so adjacent issues cannot overlap", () => {
  const audit = manifest(passingStories().map((item, index) => ({
    ...item,
    published: Date.parse(index === 0
      ? "2026-07-18T10:00:00.000Z"
      : `2026-07-18T10:00:0${index}.000Z`)
  })));
  audit.requirements.maxAgeHours = 24;

  const errors = validateNewsAuditManifest(audit);
  assert.ok(errors.some((issue) => issue.includes("第1条小情报不在滚动24小时收集窗口内")), errors.join("\n"));
});

test("checks every final source link and reports an unreachable article", async () => {
  const requested = [];
  const errors = await checkNewsSourceLinks(manifest(), {
    fetchImpl: async (url) => {
      requested.push(url);
      return { ok: !url.includes("water-ice"), status: url.includes("water-ice") ? 404 : 200 };
    },
    attempts: 1
  });

  assert.equal(requested.length, 3);
  assert.ok(errors.some((issue) => issue.includes("water-ice") && issue.includes("HTTP 404")), errors.join("\n"));
});

test("places the mandatory self-check before playback publication and email send", async () => {
  const workflow = await fs.readFile(".github/workflows/peach-daily-news.yml", "utf8");
  const check = workflow.indexOf("Mandatory news self-check");
  const publish = workflow.indexOf("Publish playback page");
  const send = workflow.indexOf("Send verified Peach daily news");

  assert.ok(check > 0, "workflow is missing the mandatory news self-check");
  assert.ok(check < publish, "self-check must run before playback publication");
  assert.ok(check < send, "self-check must run before email send");
});
