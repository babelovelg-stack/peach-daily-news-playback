// Reviewed reasoning families, not factual news. Numeric variants have a 493-day
// joint parameter period and stay in fourth-grade arithmetic. No network or LLM.
export function buildReserveQuestions(dayIndex) {
  if (!Number.isSafeInteger(dayIndex) || dayIndex < 0) throw new Error('Invalid quiz day');
  const a = 6 + dayIndex % 29, b = 2 + Math.floor(dayIndex / 29) % 17;
  const pool = [];
  const numeric = (concept, stem, value, wrong1, wrong2, explanation, inputs = { a, b }) => {
    if (new Set([value, wrong1, wrong2]).size !== 3) throw new Error(`Ambiguous reserve options: ${concept}`);
    pool.push({ id: `reserve-${concept}-${dayIndex}`, conceptId: `reserve-${concept}`, tags: [concept, '数学', '推理'], source: 'reserve', difficulty: 4,
      reasoningPattern: 'quantitative-reasoning',
      q: `计算题（模拟数据）：${stem}\nA. 按记录中的条件计算，结果为 ${value}。\nB. 按记录中的条件计算，结果为 ${wrong1}。\nC. 按记录中的条件计算，结果为 ${wrong2}。`,
      a: `答案：A。${explanation}`, verification: { kind: concept, inputs, value } });
  };
  numeric('arithmetic-mean', `三次测量长度的记录是 ${a}、${a+b}、${a+2*b} 厘米，平均每次是多少厘米？`, a+b, 3*a+3*b, a+2*b, `先求总和再除以次数：（${a}＋${a+b}＋${a+2*b}）÷3＝${a+b} 厘米。`);
  numeric('median-order', `三个样本的长度分别是 ${a+2*b}、${a}、${a+b} 厘米。按数量从小到大排序，居中的记录是多少？`, a+b, a, a+2*b, `排序为 ${a}、${a+b}、${a+2*b}，居中的是 ${a+b}，不是最大的一项。`);
  numeric('range-spread', `一组测量记录的最大值是 ${a+3*b}，最小值是 ${a}。这组记录的最大与最小相差多少？`,3*b,a+3*b,2*a+3*b,`极差用最大值减最小值：${a+3*b}－${a}＝${3*b}。`);
  numeric('weighted-count', `${a} 盒样本中，${a-2} 盒每盒有 ${b} 个，另 2 盒各有 ${b+3} 个。实际一共有多少个？`,a*b+6,a*b,a*b+3,`不能把每盒看成同样多：${a-2}×${b}＋2×${b+3}＝${a*b+6} 个。`);
  numeric('unit-price', `同样的试纸，甲店 ${b} 包共 ${a*b} 元，乙店 ${b+1} 包共 ${(a+2)*(b+1)} 元。按每包价格比较，甲店每包便宜多少元？`,2,2*b,2*(b+1),`甲每包 ${a*b}÷${b}＝${a} 元；乙每包 ${(a+2)*(b+1)}÷${b+1}＝${a+2} 元，相差 2 元。`);
  numeric('rectangle-perimeter', `长方形观察区长 ${a+b} 米、宽 ${b} 米，四周围一圈绳子，不留开口。根据记录一共需要多少米？`,2*a+4*b,a+2*b,(a+b)*b,`四边总长是（长＋宽）×2＝（${a+b}＋${b}）×2＝${2*a+4*b} 米。`);
  numeric('area-removal', `长 ${a+b} 米、宽 ${b} 米的长方形苗圃中，有 ${b} 平方米留作通道。其余实际种植面积是多少平方米？`,(a+b)*b-b,(a+b)*b,(a+b)*(b-1),`先算全部面积再扣通道：${a+b}×${b}－${b}＝${(a+b)*b-b} 平方米。`);
  numeric('interval-count', `仪器从第 0 分钟开始记录，以后每隔 ${b} 分钟记录一次，到第 ${a*b} 分钟也记录。实际一共记录多少次？`,a+1,a,a-1,`${a*b}÷${b}＝${a} 个间隔，但起点也记录，所以共有 ${a+1} 次。`);
  numeric('set-overlap', `甲区记录 ${a+b} 只带编号鸟，乙区记录 ${a+2*b} 只，其中 ${b} 只编号相同。两区实际记录了多少只不同的鸟？`,2*a+2*b,2*a+3*b,2*a+b,`同一编号不能计算两遍：${a+b}＋${a+2*b}－${b}＝${2*a+2*b} 只。`);
  numeric('parallel-work', `甲装置每小时处理 ${a} 份样本，乙每小时处理 ${b} 份，两台同时工作 ${b} 小时，条件保持相同，一共处理多少份？`,(a+b)*b,a*b,a+b,`先合并每小时处理量，再乘时间：（${a}＋${b}）×${b}＝${(a+b)*b} 份。`);
  numeric('ceiling-capacity', `每盒最多装 ${b} 个标本，现有 ${a*b+1} 个，必须装完。根据数量记录，最少需要多少盒？`,a+1,a,a+2,`${a} 盒能装 ${a*b} 个，剩下 1 个仍需一整盒，因此要 ${a+1} 盒。`);
  numeric('fraction-remaining', `观察区有 ${4*a} 株幼苗，第一次移走总数的四分之一，第二次又移走 ${b} 株，其他不变。实际剩下多少株？`,3*a-b,4*a,3*a,`四分之一是 ${a} 株，剩下 ${4*a}－${a}－${b}＝${3*a-b} 株。`);
  numeric('difference-in-growth', `甲苗原长 ${a} 厘米、后来 ${a+2*b} 厘米，乙苗原长 ${a+b} 厘米、后来 ${a+2*b+1} 厘米。同样时间内甲比乙多长多少厘米？`,b-1,2*b,b+1,`比较增长量：甲增长 ${2*b}，乙增长 ${b+1}，相差 ${b-1} 厘米，不能比较末次高度。`);
  numeric('budget-constraint', `每套观察工具 ${b} 元，预算 ${a*b+b-1} 元，先支付 ${b-1} 元运费。根据记录，剩下的钱最多买多少套？`,a,a+1,a-1,`先扣固定运费再除单价：（${a*b+b-1}－${b-1}）÷${b}＝${a} 套。`);
  numeric('unit-conversion', `两段绳子的测量记录分别是 ${a} 米和 ${b} 厘米，接起来没有重叠，一共是多少厘米？`,100*a+b,a+b,10*a+b,`先统一单位：${a} 米＝${100*a} 厘米，再加 ${b} 厘米得到 ${100*a+b} 厘米。`);
  numeric('reverse-operation', `某个样本数量先增加 ${b} 个，再分成 3 份，每份恰好 ${a+b} 个。根据记录，原来有多少个？`,3*a+2*b,3*a+4*b,a+2*b,`倒着推：分组前有 3×${a+b}＝${3*a+3*b} 个，再减增加的 ${b} 个，得到 ${3*a+2*b} 个。`);
  const evidence = (concept, stem, options, explanation) => pool.push({ id:`reserve-${concept}-${dayIndex}`, conceptId:`reserve-${concept}`,tags:[concept,'实验','证据'],source:'reserve',difficulty:4,reasoningPattern:'comparative-evidence',q:`探究题（模拟数据）：${stem}\n${options.map((s,i)=>`${'ABC'[i]}. ${s}`).join('\n')}`,a:`答案：A。${explanation}`,verification:{kind:concept,inputs:{a,b},correctIndex:0} });
  evidence('thermal-control', `比较两种隔热材料，准备每组 ${a} 个相同容器，测 ${b} 次温度。材料不同，哪种测试更公平？`, ['每组使用相同水量和起始温度，记录相同时刻的温度','每组使用相同水量但不同起始温度，记录相同时刻的温度','每组使用不同水量和相同起始温度，记录相同时刻的温度'], '水量和起始温度也会影响结果；控制这两个条件，才更能判断材料的作用。');
  evidence('repeatability', `同一长度测 ${a} 次，多数记录在 ${b*10} 毫米附近，一次记录为 ${b*10+20} 毫米。判断这次异常，下一步更合理的是哪种？`, ['检查仪器和操作方法，再用相同方法多次复测并记录','把异常值保留在记录中，先按全部数据计算一次平均','增加另一种长度的测量次数，再比较两种长度的记录'], '先查明异常来源并复测，既不随意删除数据，也不让一个异常值主导结论。');
  evidence('sampling-bias', `调查 ${a*10} 名学生的阅读情况，计划访问其中 ${b*3} 人。要让样本覆盖更多情况，哪种选人方式更合理？`, ['按各年级人数分配名额，再在各年级随机选人记录','按图书馆读者人数分配名额，再在读者中随机选人记录','按阅读社团人数分配名额，再在社团中随机选人记录'], '先覆盖不同年级再随机抽取，能减少样本集中在本来就爱读书的同学中的偏差。');
  evidence('time-confounding', `上午测路面温度 ${a+10} 摄氏度，下午洒水后测得 ${a+b} 摄氏度。判断洒水作用，哪组资料最适合补充？`, ['同一时刻比较相邻的洒水区与未洒水区，并记录多次','同一地点增加上午测量次数，再和下午的记录比较','不同日期增加洒水后的测量次数，再比较每天记录'], '上午和下午本来就可能温度不同；同时设置未洒水区，才能较好分离时间变化与洒水作用。');
  evidence('necessary-condition', `某种培养条件下，${a} 份发芽种子都有水，但另外 ${b} 份有水的种子没有发芽。根据记录，哪种判断更合理？`, ['记录支持发芽需要水，但还应检查温度等其他条件','记录支持有水的样本更容易发芽，可先按有水预测','记录支持不同样本需要不同水量，可先增加供水比较'], '这些记录表明有水并不保证发芽，水可能是必要条件，还需检查其他生长条件。');
  evidence('counterexample', `有人依据 ${a} 次记录提出：这种材料遇水后长度都增加 ${b} 毫米。要检查这个说法，哪组记录最应该复核？`, ['同样条件的一次记录长度没有增加，并保留完整测量步骤','同样条件的多次记录长度增加相同，并保留完整测量步骤','不同条件的多次记录长度增加不同，并保留完整测量步骤'], '声称每次都如此的结论，会被一个可靠的反例挑战；先复核条件和测量，确认反例是否成立。');
  evidence('zero-offset', `空秤显示 ${b} 克，放入物品显示 ${a+b} 克，多次记录相同。判断物品质量，哪种处理更合理？`, [`先检查归零情况，校正后测量并与 ${a} 克的推算比较`,`先保留原来的归零情况，多次测量并与 ${a+b} 克比较`,`先增加另一件物品重复测量，并与 ${2*a+b} 克的推算比较`], `空秤多出的 ${b} 克属于偏差，应先归零复测；按记录扣除偏差推算是 ${a} 克。`);
  evidence('absence-detection', `夜间相机连续拍摄 ${a} 晚，没有记录到某动物；过去另一地点每 ${b} 晚偶尔能记录到。哪种判断更合理？`, ['增加不同位置和时段的观察，检查相机能否探测这种动物','增加原位置同一时段的观察，再按记录推测附近数量','比较两个地点相同天数的记录，再按出现次数判断范围'], '没有拍到可能因为位置、时间或探测能力，不能把未发现当作不存在；先检查观察方法。');
  return pool;
}
