// Original A1-to-early-A2 lessons. Titles, examples, stories and exercises are original.
export const COURSE_VERSION = '2026-11-11-v1';
export const DAY_TYPES = ['认识新词','把词用起来','语法小发现','听力侦探','句子拼装','表达工作坊','一周闯关'];
const weeks = [];
function W(title, focus, rule, example, vocabulary, story, questions, grammar, writing) {
  weeks.push({title,focus,rule,example,words:vocabulary.split('\n').map(row=>{
    const [en,zh,sentence]=row.split('|'); return {en,zh,sentence};
  }),story,questions:questions.map(([q,options,answer,why])=>({q,options,answer,why})),grammar:{q:grammar[0],options:grammar[1],answer:grammar[2],why:grammar[3]},writing});
}

W('我的放学时光','一般现在时：I 与 she/he','说经常发生的事情，用一般现在时。主语是 he 或 she 时，很多动词要加 s。','I read after school. Mia reads after school.',`arrive|到达|I arrive home at four.
snack|点心|I have a snack after school.
practise|练习|I practise the piano.
collect|收集|I collect small stones.
tidy|整理|I tidy my desk.
rest|休息|I rest before dinner.`,
'Mia arrives home at four. She has an apple and some milk. Then she practises the piano for ten minutes. Her brother Ben collects stones in the garden. Before dinner, Mia tidies her desk and Ben puts his stones in a box. They both have time to rest.',[
['Mia几点到家？',['三点','四点','五点'],1,'故事说：Mia arrives home at four.'],
['Ben收集什么？',['石头','邮票','树叶'],0,'故事说：Her brother Ben collects stones.']],
['Mia ___ her desk before dinner.',['tidy','tidies','tidying'],1,'Mia相当于she；一般现在时的tidy要变成tidies。'],
{prompt:'用4句话介绍你的放学生活。再把其中一句改为介绍家人。',starter:'I arrive home at … After school, I …',check:['写出至少两种活动','介绍家人时检查动词形式','先说一遍，再写下来']});
W('公园里正在发生什么','现在进行时','说现在正在做什么，用 am/is/are 加动词的 ing 形式。','They are flying a kite.',`fly a kite|放风筝|We are flying a kite.
bench|长椅|Dad is sitting on a bench.
feed|喂食|Do not feed the ducks.
carry|搬；拿|I am carrying a bag.
draw|画画|She is drawing a tree.
wait|等待|We are waiting for Mum.`,
'It is Sunday afternoon. Leo and his sister are in the park. Leo is flying a yellow kite. His sister is drawing a tall tree. Dad is sitting on a bench and reading. Mum is carrying some water. Nobody is feeding the ducks because a sign says not to.',[
['风筝是什么颜色？',['红色','蓝色','黄色'],2,'Leo is flying a yellow kite.'],
['为什么没人喂鸭子？',['鸭子睡着了','标牌不允许','没有鸭子'],1,'故事说明标牌提示不要喂鸭子。']],
['Look! Leo ___ a kite.',['flies','is flying','fly'],1,'Look提示观察正在发生的动作，用is flying。'],
{prompt:'看窗外或想象一个公园，用4句英语描述正在发生的事情。',starter:'A child is … Two people are …',check:['至少用一次is','至少用一次are','每个动作都有-ing']});
W('一周的小习惯','频率副词','always、usually、sometimes、never表示频率。它们通常放在主要动词前。','I usually walk to school.',`always|总是|I always brush my teeth.
usually|通常|I usually walk to school.
sometimes|有时|I sometimes take the bus.
never|从不|I never leave rubbish in the park.
weekend|周末|We play at the weekend.
early|早地|I get up early on Monday.`,
'Nora usually walks to school with her dad. When it rains, they sometimes take the bus. She always puts a book in her school bag. She never reads while crossing the road. At the weekend, she gets up later and reads in bed. Reading is her favourite quiet activity.',[
['Nora通常怎样上学？',['走路','坐公交车','骑自行车'],0,'Nora usually walks to school.'],
['她过马路时会读书吗？',['总是会','有时会','从不'],2,'She never reads while crossing the road.']],
['哪句表达“我有时坐公交”？',['I never take the bus.','I sometimes take the bus.','I always take the bus.'],1,'sometimes是有时，never是从不，always是总是。'],
{prompt:'用always、usually、sometimes、never各说一句真实的生活习惯。',starter:'I always … I usually …',check:['四个频率词各用一次','内容符合你的生活','检查副词位置']});
W('准备野餐','可数与不可数名词','apples可以数，water和bread通常不直接数。用some表达一些，用any询问是否有。','We have some bread. Do we have any apples?',`bread|面包|We have some bread.
cheese|奶酪|There is some cheese.
grapes|葡萄|I like green grapes.
bottle|瓶子|Bring a bottle of water.
picnic|野餐|We are having a picnic.
basket|篮子|The apples are in the basket.`,
'Sam and Ava are packing a picnic basket. They have some bread, cheese and grapes. Sam puts two bottles of water beside the basket. Ava asks for apples, but there are not any. They take two bananas instead. They also pack a bag so they can take their rubbish home.',[
['他们有苹果吗？',['没有','有两个','有很多'],0,'Ava asks for apples, but there are not any.'],
['他们准备了几瓶水？',['一瓶','三瓶','两瓶'],2,'Sam puts two bottles of water beside the basket.']],
['Do we have ___ apples?',['any','a','an'],0,'在这个询问是否有苹果的问句里，用any。'],
{prompt:'为两个人写一份野餐清单，至少包含一种饮料和三种食物。',starter:'We need some … We need two …',check:['可数名词注意复数','水可以用a bottle of表达','说一句Do we have any …?']});
W('小小商店','How much 与 How many','问数量时，可数名词用how many；不可数名词用how much。问价格也用how much。','How many pencils? How much is this notebook?',`price|价格|Look at the price.
pound|英镑|This ruler costs one pound.
cheap|便宜的|This pen is cheap.
expensive|昂贵的|That bag is expensive.
change|零钱；找零|Here is your change.
notebook|笔记本|I need a new notebook.`,
'Ella has five pounds. She wants a notebook and a pencil. The notebook costs three pounds and the pencil costs one pound. The shopkeeper gives her one pound in change. Ella sees a lovely bag, but it costs twelve pounds. She does not buy the bag.',[
['Ella一开始有多少钱？',['四英镑','五英镑','十二英镑'],1,'Ella has five pounds.'],
['她为什么没买包？',['太贵，钱不够','不喜欢颜色','商店关门了'],0,'包要十二英镑，她原来只有五英镑。']],
['___ is this notebook? — Three pounds.',['How many','How often','How much'],2,'回答是价格，所以问How much。'],
{prompt:'把桌上三件东西当作商品，标价并模拟买卖对话。',starter:'How much is …? It is … Can I have …?',check:['问一次价格','问一次物品数量','用Thank you结束']});
W('照顾自己','should 与 must','should用于建议；must表示必须。must not表示禁止。情态动词后用动词原形。','You should rest. You must not run here.',`headache|头痛|I have a headache.
thirsty|口渴的|I am thirsty.
healthy|健康的|This is a healthy lunch.
enough|足够的|Drink enough water.
careful|小心的|Be careful on the stairs.
sleep|睡觉|I need to sleep.`,
'Oliver has a headache after playing in the sun. His teacher takes him to a cool room and gives him water. She says he should rest and tell his family how he feels. Later, Oliver feels better. He remembers to take water and a hat when he goes outside.',[
['Oliver哪里不舒服？',['脚痛','牙痛','头痛'],2,'Oliver has a headache.'],
['老师让他做什么？',['继续跑步','休息并告诉家人','吃更多糖'],1,'老师建议他休息，并告诉家人自己的感受。']],
['You should ___ some water.',['drinking','drinks','drink'],2,'should后接动词原形drink。'],
{prompt:'给一个疲倦的故事人物写两条建议，再写一条学校规则。',starter:'You should … At school, we must …',check:['建议使用should','规则使用must或must not','情态动词后用原形']});
W('昨天的学校','was 与 were','谈过去的状态：I/he/she/it用was，you/we/they用were。','The classroom was quiet. We were outside.',`yesterday|昨天|It was sunny yesterday.
quiet|安静的|The room was quiet.
noisy|吵闹的|The playground was noisy.
empty|空的|The box was empty.
ready|准备好的|We were ready.
excited|兴奋的|I was excited.`,
'Yesterday was sports day. The classrooms were empty because everyone was outside. The playground was noisy. Grace was excited, but her little brother was nervous. Their parents were near the running track. At the end of the day, the children were tired and happy.',[
['教室为什么空着？',['学校放假','大家在外面参加运动日','孩子迟到了'],1,'因为是sports day，everyone was outside。'],
['Grace的弟弟开始是什么心情？',['紧张','生气','无聊'],0,'Her little brother was nervous.']],
['The children ___ tired yesterday.',['was','are','were'],2,'children是复数；说昨天用were。'],
{prompt:'用was/were写昨天的天气、地点和心情，共4句。',starter:'Yesterday, the weather was … My friends were …',check:['至少一次was和一次were','每句确实描述过去','可以加地点或时间']});
W('周末做过的事情','规则动词过去式','很多动词的过去式加-ed。以不发音e结尾通常只加-d。','We visited a farm. We played outside.',`visit|参观；拜访|We visited a farm.
plant|种植|I planted a seed.
clean|清理|We cleaned the table.
help|帮助|I helped my uncle.
watch|观看|We watched the birds.
enjoy|享受；喜欢|I enjoyed the day.`,
'Last Saturday, Ruby visited her uncle on his farm. She helped him clean a small table. Then they planted beans in pots. Ruby watched some birds near the gate. In the afternoon, she played a board game with her cousin. She enjoyed the visit and called her uncle on Sunday.',[
['Ruby在哪里种豆子？',['花盆里','河里','桌子上'],0,'They planted beans in pots.'],
['她什么时候去农场？',['周日','周一','上周六'],2,'Last Saturday, Ruby visited her uncle.']],
['Yesterday, we ___ our grandparents.',['visited','visit','visiting'],0,'Yesterday表示过去，visit的过去式是visited。'],
{prompt:'选三个规则动词，写一次真实或想象的周末经历。',starter:'Last weekend, I visited … Then I …',check:['至少三个过去式','用then连接事件','最后说自己的感受']});
W('丢失的午餐盒','常见不规则过去式','有些过去式不能加-ed，需要连着意思记：go-went，see-saw，take-took。','I went to the park and saw a bird.',`went|去的过去式|We went to the park.
saw|看见的过去式|I saw a red bag.
took|拿；带的过去式|She took her lunch.
found|找到的过去式|I found my box.
ate|吃的过去式|We ate some rice.
bought|买的过去式|Dad bought a map.`,
'Finn went to the park with his class. He took a blue lunch box. At lunchtime, he could not find it. He saw a blue bag under a bench, but it was not his box. Then his friend found the box beside a tree. Finn thanked her and ate his lunch.',[
['午餐盒是什么颜色？',['绿色','蓝色','红色'],1,'He took a blue lunch box.'],
['最终在哪里找到午餐盒？',['树旁','长椅下','教室里'],0,'His friend found the box beside a tree.']],
['Yesterday I ___ a sandwich.',['eat','eated','ate'],2,'eat是不规则动词，过去式是ate。'],
{prompt:'用went、saw、ate、found中的三个词讲一个小故事。',starter:'Yesterday, I went to … I saw …',check:['用了至少三个不规则过去式','事件顺序清楚','不把went写成goed']});
W('周末小采访','Did问句与否定','过去时提问用Did加动词原形；否定用did not或didn’t加动词原形。','Did you swim? No, I did not swim.',`museum|博物馆|We visited a museum.
ticket|门票|I kept my ticket.
model|模型|I saw a model ship.
guide|导游；指南|The guide told us a story.
photograph|照片|I took a photograph.
remember|记得|I remember the old ship.`,
'On Monday, Zara asks Max about his weekend. Max visited a museum with his aunt. He saw a model ship and took a photograph of it. He did not buy a toy because the shop was closed. Zara asks if he enjoyed the visit. Max says he did.',[
['Max和谁去博物馆？',['叔叔','朋友','阿姨'],2,'Max visited a museum with his aunt.'],
['他为什么没有买玩具？',['商店关门','玩具太大','忘带钱'],0,'He did not buy a toy because the shop was closed.']],
['Did you ___ the museum?',['visited','visit','visits'],1,'Did已经表示过去，后面用原形visit。'],
{prompt:'采访家人上周末做过什么，问三个Did问题并记录答案。',starter:'Did you …? Yes, I did. / No, I did not.',check:['Did后用原形','至少一个肯定回答','至少记录一句完整回答']});
W('选哪辆自行车','形容词比较级','比较两者用比较级和than。短词常加-er，长词常用more。','This bike is lighter than that one.',`light|轻的|This bike is light.
heavy|重的|That bag is heavy.
fast|快的|The red bike is fast.
slow|慢的|The old bus is slow.
comfortable|舒适的|This seat is comfortable.
safe|安全的|This path is safe.`,
'Lily tries two bicycles. The blue bicycle is lighter than the green one. The green bicycle has a more comfortable seat. Both bicycles are safe when used carefully. Lily wants to carry her bicycle upstairs, so she chooses the blue one. Her dad helps her check the brakes.',[
['哪辆车更轻？',['绿色','蓝色','一样重'],1,'The blue bicycle is lighter than the green one.'],
['Lily主要考虑什么？',['搬上楼','座位颜色','车铃声音'],0,'她想把车搬上楼，因此选择较轻的蓝色车。']],
['This bag is ___ than that one.',['heavy','heaviest','heavier'],2,'heavy的比较级把y变i再加-er：heavier。'],
{prompt:'比较家中两件物品，说出两点不同，并说明你会选哪件。',starter:'This … is … than that … I choose … because …',check:['比较对象清楚','使用than','给出一个选择理由']});
W('班级里的小纪录','形容词最高级','比较一组事物中的“最”，常用the加最高级。good的最高级是best。','This is the tallest tower.',`tall|高的|Our tower is tall.
wide|宽的|This bridge is wide.
strong|坚固；强壮的|The base is strong.
carefully|小心地|We build carefully.
team|团队|Our team has four children.
record|纪录|We make a class record.`,
'Three teams build paper towers. Team Red makes the tallest tower. Team Blue makes the widest base. Team Green works the most quietly. When the teacher opens a window, the red tower falls over. The blue tower stays up. The children learn that a strong base is important.',[
['哪队塔最高？',['红队','蓝队','绿队'],0,'Team Red makes the tallest tower.'],
['窗户打开后，哪座塔保持站立？',['红队的','蓝队的','都倒了'],1,'The blue tower stays up.']],
['Which sentence is correct?',['This is the tallest tower.','This is the most tallest tower.','This is tallest than that tower.'],0,'最高级用the tallest，不再加most；than用于比较级。'],
{prompt:'选三件物品，用最高级说三句话。可以比较大小、长短或重量。',starter:'Of these three …, this is the …',check:['比较范围至少三件','最高级前通常有the','不重复使用more和-er']});
W('动物的家','地点介词','用in、on、under、between、behind和next to描述位置。','The nest is between two branches.',`nest|鸟巢|The nest is in a tree.
branch|树枝|A bird is on the branch.
pond|池塘|The ducks are in the pond.
behind|在后面|The cat is behind the box.
between|在两者之间|The nest is between two branches.
shelter|庇护处|The box is a shelter.`,
'Theo draws a map of his garden. A pond is next to the apple tree. There is a bird nest between two branches. Behind the shed, a small wooden box gives insects shelter. Theo watches from a distance. He does not touch the nest or move the animals.',[
['池塘在哪里？',['屋顶上','苹果树旁','棚子里'],1,'A pond is next to the apple tree.'],
['Theo怎样观察动物？',['保持距离','移动鸟巢','抓住小鸟'],0,'Theo watches from a distance.']],
['The nest is ___ two branches.',['between','underneath of','on to'],0,'between表示在两者之间。'],
{prompt:'画一个小花园，用四个不同的地点词介绍它。',starter:'There is … next to … The … is between …',check:['四个位置表达','图和描述一致','至少用一次between']});
W('花园观察员','both、all、some','both指两个都；all指全部；some指其中一些。','Both pots are blue. All the plants need care.',`seed|种子|Put a seed in the soil.
soil|土壤|The soil is wet.
leaf|叶子|This plant has a new leaf.
leaves|叶子的复数|The leaves are green.
grow|生长|Our beans grow slowly.
measure|测量|We measure the plants.`,
'Ivy and Tom grow beans in two blue pots. Both pots are beside a bright window. They check the soil each morning. Some leaves are small, and some are large. On Friday, they measure both plants. One is eight centimetres tall and the other is ten. They write the numbers in a notebook.',[
['花盆是什么颜色？',['黄色','绿色','蓝色'],2,'They grow beans in two blue pots.'],
['两株植物有多高？',['八和十厘米','二和三厘米','十和二十厘米'],0,'One is eight centimetres tall and the other is ten.']],
['___ pots are blue.（一共两个）',['Both','Every','Any'],0,'两个都用Both；every后接单数名词。'],
{prompt:'观察两件物品，用Both说相同点，用but说不同点。',starter:'Both … are … One is …, but the other is …',check:['both后使用复数名词','说出相同点','再说一个不同点']});
W('城市寻路','祈使句与方向','给指令时常用动词原形开头。Turn left是左转，go straight是直走。','Go straight and turn left at the library.',`turn left|左转|Turn left at the library.
turn right|右转|Turn right after the shop.
go straight|直走|Go straight to the park.
corner|拐角|The bank is on the corner.
opposite|在对面|The cafe is opposite the library.
crossing|人行横道|Use the crossing.`,
'Hugo wants to find the swimming pool. A librarian gives him directions. He must go straight to the park, turn right and walk past the cafe. The pool is opposite the cafe. Hugo uses the crossing to get there. He thanks the librarian before he leaves.',[
['Hugo要去哪里？',['图书馆','游泳池','银行'],1,'Hugo wants to find the swimming pool.'],
['到公园后往哪转？',['右转','左转','回头'],0,'Go straight to the park, turn right.']],
['哪句表示“在图书馆左转”？',['Turn right at the library.','Go past the library.','Turn left at the library.'],2,'left是左边，right是右边。'],
{prompt:'画一张简单地图，给出从家到公园的三步路线。',starter:'First, go … Then, turn … Finally, …',check:['至少三个步骤','包含一个转弯','让家人按说明指出终点']});
W('选择出行方式','比较与by交通方式','说交通方式常用by bus、by train、by bike；步行用on foot。','We go by train. I go on foot.',`journey|旅程|The journey is short.
station|车站|Meet me at the station.
platform|站台|We wait on the platform.
passenger|乘客|The passengers sit down.
return ticket|往返票|I need a return ticket.
on foot|步行|We go to the shop on foot.`,
'Amir and his mum are visiting Grandma. The bus takes an hour. The train takes twenty minutes but costs more. They choose the train because Grandma is waiting for lunch. They walk to the station and buy return tickets. On the platform, they stand behind the safety line.',[
['火车要多久？',['十分钟','一小时','二十分钟'],2,'The train takes twenty minutes.'],
['他们为什么选火车？',['速度更快','免费','没有公交车'],0,'火车二十分钟，公交一小时；他们要赶午饭。']],
['We go to school ___.',['by foot','on foot','with foot'],1,'步行的固定表达是on foot。'],
{prompt:'比较去同一个地方的两种交通方式，说明你的选择。',starter:'Going by … is faster. I choose … because …',check:['使用by或on foot','说明一种差别','给出选择理由']});
W('我想做的工作','want to 与职业','want后接to加动词原形；职业前常用a或an。','I want to be an artist.',`artist|艺术家|An artist draws pictures.
engineer|工程师|An engineer designs things.
vet|兽医|A vet helps sick animals.
pilot|飞行员|A pilot flies a plane.
design|设计|I want to design a bridge.
repair|修理|We repair old toys.`,
'At school, the children talk about jobs. Maya wants to be a vet because she loves animals. Jack wants to be an engineer and design safe bridges. Their teacher explains that they can try different interests as they grow. This week, Maya reads about pets and Jack builds a small model bridge.',[
['Maya想做什么？',['飞行员','兽医','艺术家'],1,'Maya wants to be a vet.'],
['Jack本周做了什么？',['桥梁模型','蛋糕','风筝'],0,'Jack builds a small model bridge.']],
['I want ___ an engineer.',['be','being','to be'],2,'want后接to加原形：want to be。'],
{prompt:'介绍一个你感兴趣的职业，说出理由和现在可以做的一件事。',starter:'I want to be … because … I can … now.',check:['a/an使用恰当','want to be结构完整','说出一件能实践的小事']});
W('计划一次班级旅行','be going to','说已经有的计划，用am/is/are going to加动词原形。','We are going to visit a farm.',`plan|计划|We have a plan.
trip|短途旅行|Our trip is on Friday.
pack|打包|I am going to pack my bag.
bring|带来|Please bring a hat.
meet|见面；集合|We are going to meet at school.
leave|离开|The bus is going to leave at nine.`,
'Class Four is going to visit a farm on Friday. The children are going to meet at school at eight thirty. Their bus is going to leave at nine. Each child needs to bring water and a hat. They are going to learn about vegetables and help collect eggs before lunch.',[
['几点在学校集合？',['九点','八点半','十点'],1,'Meet at school at eight thirty.'],
['午饭前会做什么？',['收鸡蛋','去游泳','买玩具'],0,'They are going to help collect eggs before lunch.']],
['We ___ going to visit a farm.',['is','am','are'],2,'主语We对应are。'],
{prompt:'为周末写一个三步计划，最后补充一件要带的东西。',starter:'On Saturday, I am going to … I need to bring …',check:['每个计划都有be going to','be随主语变化','活动安排具体']});
W('天气预报小主播','will预测','预测未来可以用will加动词原形；否定是will not或won’t。','It will rain tomorrow.',`cloudy|多云的|It is cloudy today.
windy|有风的|It will be windy.
storm|暴风雨|A storm is coming.
forecast|预报|Listen to the weather forecast.
umbrella|雨伞|Take your umbrella.
dry|干燥的|The ground is dry.`,
'The weather forecast says it will rain tomorrow morning. There will be strong wind near the coast. In the afternoon, the rain will stop in the town. Noah changes his plan. He will visit the library in the morning and play outside later if the weather is safe.',[
['明天上午天气怎样？',['晴朗','下雪','下雨'],2,'It will rain tomorrow morning.'],
['Noah上午打算去哪？',['海边','图书馆','球场'],1,'He will visit the library in the morning.']],
['It will ___ windy tomorrow.',['is','be','being'],1,'will后接动词原形be。'],
{prompt:'为想象中的明天播报两句天气，再说一个相应安排。',starter:'Tomorrow, it will … I will …',check:['说明是想象预报','will后用原形','安排与天气相配']});
W('小时候与现在','could 与 can','can说现在的能力；could说过去的能力。两者后面都用动词原形。','I can swim now. I could not swim at five.',`ride|骑|I can ride a bike.
balance|保持平衡|I can balance on one foot.
tie|系|I can tie my shoes.
solve|解决|I can solve this puzzle.
learn|学习|I learn something new.
improve|进步|I improve with practice.`,
'When Sofia was five, she could draw lovely animals, but she could not ride a bicycle. Now she is ten. She can ride to the park with her family. She is still learning to swim. Her brother helps her practise, and she knows that learning takes time.',[
['Sofia五岁时会什么？',['骑车','画动物','游泳'],1,'She could draw lovely animals.'],
['她现在还在学什么？',['游泳','说话','走路'],0,'She is still learning to swim.']],
['When I was five, I ___ not ride a bike.',['can','am','could'],2,'过去的能力用could。'],
{prompt:'写两句过去的能力、两句现在的能力，再说一个想学的新本领。',starter:'When I was …, I could … Now I can …',check:['分清过去与现在','could/can后用原形','允许自己仍在学习']});
W('动作也有样子','方式副词','形容词描述人或物，副词描述动作。很多副词加-ly，但good对应well。','She is careful. She works carefully.',`quickly|迅速地|He runs quickly.
slowly|缓慢地|The turtle moves slowly.
quietly|安静地|We speak quietly.
loudly|大声地|Do not shout loudly here.
well|好地|She sings well.
carefully|仔细地|Read the question carefully.`,
'The class is making a paper city. Emma cuts the paper carefully. Ali draws the roads slowly so the lines are straight. Two children talk loudly, and their friends ask them to speak quietly. Everyone works well together. They finish the city before the bell rings.',[
['Emma怎样剪纸？',['匆忙地','仔细地','大声地'],1,'Emma cuts the paper carefully.'],
['为什么Ali画得慢？',['让线条笔直','他睡着了','找不到纸'],0,'He draws slowly so the lines are straight.']],
['She sings very ___.',['good','best than','well'],2,'修饰sings用副词well。'],
{prompt:'给三个动作加上“怎么做”的说明，再把其中一句写完整。',starter:'I read carefully. My friend …',check:['描述的是动作方式','用到至少两个副词','记住good与well不同']});
W('说出你的理由','because 与 so','because引出原因，so引出结果。英语里通常不把because和so重复用于同一组因果。','I took a coat because it was cold.',`reason|原因|Tell me your reason.
choose|选择|I choose the blue one.
prefer|更喜欢|I prefer quiet games.
useful|有用的|This map is useful.
difficult|困难的|The puzzle is difficult.
interesting|有趣的|The story is interesting.`,
'Isla and Henry choose a book for their class. Isla prefers a story about space because she likes adventures. Henry wants a book about gardens because the class is growing beans. They ask their classmates to vote. The garden book wins, so they borrow it first. They can borrow the space story next week.',[
['Isla喜欢哪种书？',['太空故事','种植指南','食谱'],0,'Isla prefers a story about space.'],
['为什么先借花园书？',['太空书丢了','同学投票选中了它','书最小'],1,'The garden book wins, so they borrow it first.']],
['I stayed inside ___ it was raining.',['because','but','or'],0,'后面解释原因，用because。'],
{prompt:'从两本书或两项活动中选择一个，写两条不同的理由。',starter:'I choose … because … It is …, so …',check:['理由与选择有关','because后有完整意思','同一组因果不重复because和so']});
W('按顺序讲故事','before、after、when','before表示在之前，after表示在之后，when表示当……时。注意动作顺序。','After I washed my hands, I ate lunch.',`first|首先|First, wash your hands.
next|接下来|Next, cut the fruit.
finally|最后|Finally, share the salad.
before|在之前|I wash my hands before lunch.
after|在之后|I tidy up after cooking.
while|当……期间|I listen while Mum reads.`,
'Daniel makes a fruit salad with his dad. First, they wash their hands and the fruit. Dad cuts the apple, and Daniel puts grapes in a bowl. After they add the apple, they mix the fruit gently. Before eating, they clean the table. Finally, they share the salad with the family.',[
['第一步是什么？',['先吃水果','清洗手和水果','收拾桌子'],1,'First, they wash their hands and the fruit.'],
['谁切苹果？',['Daniel','妹妹','爸爸'],2,'Dad cuts the apple.']],
['I washed my hands ___ I ate lunch.（先洗手）',['before','because','than'],0,'before表示洗手在吃饭之前。'],
{prompt:'写一个四步小流程，例如整理书包或准备早餐。',starter:'First, … Next, … Before …, … Finally, …',check:['步骤顺序合理','用到before或after','动作表达清楚']});
W('失物招领处','物主代词','my后要接名词，mine可以独立使用。同样有your/yours、her/hers。','This is my bag. This bag is mine.',`mine|我的（独立使用）|The red coat is mine.
yours|你的（独立使用）|Is this pencil yours?
hers|她的（独立使用）|The blue bag is hers.
ours|我们的（独立使用）|The football is ours.
lost|丢失的|This is my lost glove.
belong|属于|These books belong to us.`,
'There are three things at the lost property desk: a red coat, a blue bag and a football. Poppy says the red coat is hers. The bag belongs to her friend Lucy. Two boys come for the football. They say it is theirs because their team name is written on it.',[
['谁的外套是红色的？',['Lucy','Poppy','老师'],1,'Poppy says the red coat is hers.'],
['男孩怎样认出足球？',['看大小','闻味道','看球队名字'],2,'Their team name is written on it.']],
['This is my pencil. It is ___.',['mine','my','me'],0,'后面没有名词，独立使用mine。'],
{prompt:'拿三件物品做失物招领游戏，询问并说明它们属于谁。',starter:'Is this yours? No, it is hers. This one is mine.',check:['my后面接名词','mine可以独立使用','至少问一个问题']});
W('带上它是为了什么','to表达目的','用to加动词原形表达“为了做什么”。','I took a camera to take photos.',`torch|手电筒|Bring a torch.
rope|绳子|We have a long rope.
camera|相机|I use a camera to take photos.
map|地图|Use a map to find the path.
protect|保护|A hat helps protect my head from the sun.
explore|探索|We want to explore the garden.`,
'A family is preparing for a short walk in the woods. They take a map to find the correct path and water to drink. Dad brings a camera to take photos. The children wear hats to protect their heads from the sun. They stay together and return before it gets dark.',[
['为什么带地图？',['找正确路线','当午餐','盖住相机'],0,'They take a map to find the correct path.'],
['他们什么时候返回？',['天黑以后','天黑之前','第二天'],1,'They return before it gets dark.']],
['I took a camera ___ photos.',['for take','to taking','to take'],2,'表达目的用to加原形take。'],
{prompt:'为一次短途旅行选三件物品，分别说明为什么带它。',starter:'I will take … to …',check:['每件东西都有用途','to后用原形','用途符合物品']});
W('一起安排一个下午','建议与邀请','Let’s加动词原形表示一起做某事；Shall we …?用于提出建议。','Let’s play a game. Shall we meet at two?',`invite|邀请|I want to invite my friend.
agree|同意|I agree with your idea.
suggest|建议|Can I suggest a game?
free|有空的|Are you free on Saturday?
idea|主意|That is a good idea.
instead|代替；改为|Let us draw instead.`,
'Milo invites Rose to play football on Saturday. Rose is free, but she has hurt her foot. She suggests making a board game instead. Milo agrees. They are going to meet at two in the afternoon. Milo will bring paper, and Rose will bring coloured pencils. They both like their new plan.',[
['为什么换活动？',['天气很热','Rose脚受伤了','没有足球'],1,'Rose has hurt her foot.'],
['他们最后决定做什么？',['制作桌游','踢足球','游泳'],0,'She suggests making a board game instead.']],
['Shall we ___ at two?',['meeting','meets','meet'],2,'Shall we后接动词原形meet。'],
{prompt:'写一则邀请，包含做什么、什么时候、在哪里，并请对方回复。',starter:'Hi …, Are you free …? Shall we …? We can meet …',check:['活动清楚','时间地点齐全','有一个邀请问句']});
W('我的英语小展览','综合：过去、现在与计划','讲做过的事情用过去时，讲习惯用一般现在时，讲计划用be going to。','I made a model. I like science. I am going to show my model.',`project|项目；作品|This is my English project.
explain|解释|I can explain my idea.
share|分享|We share our stories.
proud|自豪的|I am proud of my work.
mistake|错误|I can learn from a mistake.
next step|下一步|My next step is to practise.`,
'The children prepare an English exhibition. Amelia made a model garden last week. She likes plants and usually reads about them. Today she is writing labels for her model. Tomorrow she is going to explain it to another class. She feels proud, even though she still makes mistakes. Her next step is to speak more slowly.',[
['Amelia上周做了什么？',['花园模型','午餐','新书包'],0,'Amelia made a model garden last week.'],
['她下一步想改进什么？',['读得更快','说得慢一些','停止练习'],1,'Her next step is to speak more slowly.']],
['Tomorrow, she ___ explain her model.',['went to','is going to','explained'],1,'说未来计划用is going to。'],
{prompt:'做一个迷你英语展览：展示一件作品，介绍过去做了什么、现在喜欢什么和下一步计划。',starter:'I made … I like … Next, I am going to …',check:['过去、现在、未来各一句','展示一个具体作品','说出自己的进步和下一步']});

export const WEEKS = weeks;
export const TOTAL_LESSONS = WEEKS.length * 7;
export function lessonFor(number) {
  if (!Number.isInteger(number) || number < 1 || number > TOTAL_LESSONS) throw new Error('Course lesson out of range');
  const weekIndex = Math.floor((number-1)/7), day=(number-1)%7, w=WEEKS[weekIndex];
  const wordIndices = day===0?[0,1,2]:day===1?[3,4,5]:[day%6,(day+2)%6,(day+4)%6];
  const vocabQuestions=wordIndices.map(i=>({q:`“${w.words[i].en}”是什么意思？`,options:[w.words[i].zh,w.words[(i+1)%6].zh,w.words[(i+3)%6].zh],answer:0,why:w.words[i].sentence}));
  const pool=day===0||day===1?[...vocabQuestions,w.grammar]:[...w.questions,w.grammar,...vocabQuestions.slice(0,2)];
  const questions=pool.map((q,i)=>{const shift=(number+i)%q.options.length;return {...q,options:q.options.map((_,j)=>q.options[(j+shift)%q.options.length]),answer:(q.answer-shift+q.options.length)%q.options.length};});
  const sentence=w.words[(day+weekIndex)%6].sentence;
  const speech={
    intro:`你好，欢迎来到桃子英语十五分钟。今天是第${number}课，${w.title}，${DAY_TYPES[day]}。今天先听一个小故事，再学三个词，发现一个句子规律，完成小挑战，最后说一说或写下来。遇到不懂的地方，可以重听。`,
    story:w.story,
    rule:`今天的语法是，${w.focus}。${w.rule} 先理解意思，再听英语例句。`,
    example:w.example,
    task:`今天的小任务：${w.writing.prompt} 先自己说一遍，再记录下来。完成后，对照下面的三个小提示检查。`,
    sentence,
    ...Object.fromEntries(wordIndices.map((i,j)=>[`word${j}`,`${w.words[i].en}. ${w.words[i].sentence}`]))
  };
  const focusTasks=[`认识今天的三个词，并各说一个自己的例子。`,`把今天的三个词和昨天学过的词连起来，介绍一个场景。`,`找出故事里与“${w.focus}”有关的一句话，再换一个主语说。`,`先隐藏故事文字，只听音频回答问题；再展开核对。`,`听句子并拼出来，最后把句子改成自己的事情。`,`完成下面的表达任务，可以分成“先说、再写、再改”三步。`,`综合复习本周的六个词和语法，再独立完成小任务。`];
  return {number,week:weekIndex+1,day:day+1,total:TOTAL_LESSONS,version:COURSE_VERSION,title:w.title,type:DAY_TYPES[day],focus:w.focus,rule:w.rule,example:w.example,words:wordIndices.map(i=>w.words[i]),allWords:w.words,story:w.story,questions,sentence,writing:w.writing,focusTask:focusTasks[day],speech,minutes:[2,3,3,4,3],review:day===6};
}
