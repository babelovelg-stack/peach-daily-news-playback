// Target terms verified in Cambridge's Level 3, second-edition Unit 2 sample.
// Meanings, memory cues, sentences and practice are newly authored.
export const VOCAB_SOURCE={title:'Power Up 3 · Second Edition · Unit 2 · Food and drink',url:'https://assets.cambridge.org/97810098/09887/excerpt/9781009809887_excerpt.pdf',page:19,checked:'2026-11-11',note:'首组先用官方样章可核对的饮食主题，不声称是全书第一单元。'};
export const PACKS={food:{id:'food',title:'餐桌上的五个词',source:VOCAB_SOURCE,words:[
 {id:'cereal',word:'cereal',meaning:'早餐谷物',sound:'/ˈsɪəriəl/',chunks:'ce · re · al',hint:'把一碗谷物和早餐连起来记。听三个音节，再完整说一遍。',example:'I have cereal for breakfast.',translation:'我早餐吃谷物。',use:'说说你早餐吃什么：I have … for breakfast.',missing:'c_re_l',answer:'cereal',tile:0},
 {id:'yoghurt',word:'yoghurt',meaning:'酸奶',sound:'/ˈjɒɡət/',chunks:'yo · ghurt',hint:'看酸奶杯说 yoghurt。英式写法中间有 h；拼写时把它和 g 放在一起记。',example:'My yoghurt is cold.',translation:'我的酸奶是凉的。',use:'给酸奶加一个描述词：My yoghurt is …',missing:'yo_hurt',answer:'yoghurt',tile:1},
 {id:'pancake',word:'pancake',meaning:'薄煎饼',sound:'/ˈpænkeɪk/',chunks:'pan + cake',hint:'pan 是平底锅，cake 是蛋糕。想象在平底锅里做出的薄煎饼。',example:'This pancake is warm.',translation:'这块薄煎饼是温热的。',use:'指着图片说：This pancake is …',missing:'pan_ake',answer:'pancake',tile:2},
 {id:'noodles',word:'noodles',meaning:'面条',sound:'/ˈnuːdəlz/',chunks:'noo · dles',hint:'把长长的面条和长音 /uː/ 连起来。常见表达用复数 noodles，别忘末尾 s。',example:'I eat noodles with a fork.',translation:'我用叉子吃面条。',use:'换一种餐具说：I eat noodles with …',missing:'n_ _dles',answer:'noodles',tile:3},
 {id:'cabbage',word:'cabbage',meaning:'卷心菜',sound:'/ˈkæbɪdʒ/',chunks:'cab · bage',hint:'看一层层包紧的圆菜球。分两段读 cab-bage，再盖住单词回忆两个 b。',example:'The cabbage is green.',translation:'这棵卷心菜是绿色的。',use:'观察图片说：The cabbage is …',missing:'ca_bage',answer:'cabbage',tile:4}
]}};

const mapSource='https://cambridgelatamcatalogue.org/wp-content/uploads/2025/06/Power-Up-Level-3-Map-of-the-book.pdf';
const unit3Source='https://cambridgelatamcatalogue.org/wp-content/uploads/2025/06/Level3Unit3.pdf';
const source=(unit,note,url=mapSource)=>({title:`Power Up 3 · Second Edition · Unit ${unit}`,url,checked:'2026-11-13',note});
function pack(id,title,src,rows){return {id,title,source:src,atlasFile:id+'-atlas.png',words:rows.map((r,tile)=>({id:r[0].replaceAll(' ','-'),word:r[0],meaning:r[1],sound:r[2],chunks:r[3],hint:r[4],example:r[5],translation:r[6],use:r[7],missing:r[8],answer:r[0],tile}))};}
PACKS.drinks=pack('drinks','饮食主题 · 今天喝什么',source(2,'按照官方目录 Food and drink 主题补充选词；不是教材逐页复刻。'),[
 ['smoothie','果昔','/ˈsmuːði/','smooth · ie','看浓稠的水果饮品。先读 smooth，再接轻轻的 ee 音。','My smoothie is pink.','我的果昔是粉红色的。','描述你喜欢的颜色：My smoothie is …','sm_othie'],
 ['tea','茶','/tiː/','t · ea','把茶杯和长音 /iː/ 连起来；ea 在这个词里读长音。','The tea is in a cup.','茶在杯子里。','换个饮品说：The … is in a cup.','t_a'],
 ['juice','果汁','/dʒuːs/','j · uice','看半个橙子和橙汁，先记 orange juice 这个小词组。','I like orange juice.','我喜欢橙汁。','换成苹果汁：I like apple juice.','j_ice'],
 ['water','水','/ˈwɔːtə/','wa · ter','指着透明的水说两拍 wa-ter，再遮住字母拼出来。','There is water in the glass.','玻璃杯里有水。','指着自己的水杯说一次这个句子。','wa_er'],
 ['milk','牛奶','/mɪlk/','m · i · l · k','把白色牛奶和短音 /ɪ/ 连起来，末尾轻轻读出 lk。','The milk is white.','牛奶是白色的。','给牛奶换个描述：The milk is cold.','mi_k']
]);
PACKS.tableware=pack('tableware','饮食主题 · 摆好小餐桌',source(2,'在饮食单元内补充常用餐具词；补充词与教材原词表分开标明。'),[
 ['bowl','碗','/bəʊl/','b · owl','看有深度的碗，和扁平的 plate 对比。摸摸碗边说 bowl。','This bowl is empty.','这只碗是空的。','找一只碗，说：This bowl is …','b_wl'],
 ['plate','盘子','/pleɪt/','pl · ate','plate 中 a 加词尾 e 读 /eɪ/；想象扁平盘子的形状。','The plate is round.','盘子是圆的。','描述颜色：The plate is …','pl_te'],
 ['spoon','勺子','/spuːn/','sp · oo · n','看勺子圆圆的头，记住中间并排的两个 o。','I eat soup with a spoon.','我用勺子喝汤。','比出拿勺子的动作，再说整句。','sp_ _n'],
 ['fork','叉子','/fɔːk/','f · or · k','数一数叉子的齿；or 在这个词里读 /ɔː/。','This fork has four points.','这把叉子有四个尖齿。','找图里的叉子，说：This is a fork.','f_rk'],
 ['knife','餐刀','/naɪf/','kn · i · fe','开头 k 不发音；像读 nife 一样听，再记住隐藏的 k。','The knife is next to the plate.','餐刀在盘子旁边。','用图片说位置：The … is next to the plate.','kni_e']
]);
PACKS.body1=pack('body1','身体主题 · 指一指，说一说',source(3,'目标词已核对官方样章第31页。例句和记忆活动为原创。',unit3Source),[
 ['shoulder','肩膀','/ˈʃəʊldə/','shoul · der','轻轻碰自己的肩膀，说两拍 shoul-der，把动作和声音一起记。','I touch my shoulder.','我碰一碰自己的肩膀。','一边做动作一边说这句话。','sh_ _lder'],
 ['neck','脖子','/nek/','n · e · ck','指出头和肩膀之间的部位；最后 ck 合起来发一个 /k/ 音。','This is my neck.','这是我的脖子。','指着图片说：This is her neck.','ne_k'],
 ['finger','手指','/ˈfɪŋɡə/','fin · ger','举一根手指说 finger；举多根时加 s，fingers。','I can point with my finger.','我能用手指指东西。','指一样物品，再说整句。','fin_er'],
 ['knee','膝盖','/niː/','kn · ee','开头 k 不发音，ee 发长音；轻碰膝盖，说 knee。','I can bend my knee.','我能弯曲膝盖。','轻轻做一次弯膝动作并说句子。','kn_ _'],
 ['elbow','手肘','/ˈelbəʊ/','el · bow','把手臂弯起来找手肘，分两拍读 el-bow。','My elbow can bend.','我的手肘能弯曲。','先指手肘，再说：This is my elbow.','el_ow']
]);
PACKS.body2=pack('body2','身体主题 · 从头到脚再认识五处',source(3,'toe、back、stomach 见第31页；wrist、ankle 见第36页。',unit3Source),[
 ['toe','脚趾','/təʊ/','t · oe','手上是 finger，脚上是 toe。看脚趾说 toe，再遮字回忆。','This is my big toe.','这是我的大脚趾。','换成复数：I have ten toes.','t_e'],
 ['back','背部','/bæk/','b · a · ck','看人物背面，把 back 和转身动作联系起来。','My bag is on my back.','我的包在背上。','摸摸书包的位置，再说整句。','ba_k'],
 ['stomach','肚子；胃','/ˈstʌmək/','sto · mach','轻轻指肚子，分两拍说 sto-mach；词尾 ch 在这里读 /k/。','I put my hand on my stomach.','我把手放在肚子上。','做动作并说句子，不必使劲按。','stom_ch'],
 ['wrist','手腕','/rɪst/','wr · ist','找到手和手臂连接处；开头 w 不发音，从 r 开始读。','My watch is on my wrist.','我的手表在手腕上。','想象戴手表，说：on my wrist。','wr_st'],
 ['ankle','脚踝','/ˈæŋkəl/','an · kle','找脚和小腿相接的地方，对比手腕 wrist 和脚踝 ankle。','This sock covers my ankle.','这只袜子盖住我的脚踝。','指着图片说：This is an ankle.','an_le']
]);
PACKS.health=pack('health','健康主题 · 怎样说不舒服',source(3,'目标词与表达已核对官方样章第34–35页。此处学习英语表达。',unit3Source),[
 ['cough','咳嗽','/kɒf/','c · ough','看咳嗽动作，不必模仿咳嗽。记住 gh 在这个词里发 /f/。','He has got a cough.','他咳嗽了。','换主语：She has got a cough.','cou_h'],
 ['cold','感冒','/kəʊld/','c · old','看拿纸巾的孩子。a cold 表示一次感冒，cold 单独也能形容冷。','He has got a cold.','他感冒了。','盖住英文，用图想起 have got a cold。','c_ld'],
 ['headache','头痛','/ˈhedeɪk/','head + ache','head 是头，ache 是疼；两块拼起来就是头痛。','He has got a headache.','他头痛。','对比 head 和 headache，说出中文差别。','head_che'],
 ['sore throat','喉咙痛','/sɔː θrəʊt/','sore + throat','作为一个小词组记：sore 表示疼的，throat 是喉咙。舌尖轻触牙齿读 th。','He has got a sore throat.','他喉咙痛。','指着图，完整说出这两个词。','sore thr_at'],
 ['temperature','体温；这里指发烧','/ˈtemprətʃə/','tem · per · a · ture','看体温计，分段记拼写。have got a temperature 在这里表示发烧。','He has got a temperature.','他发烧了。','听完跟读整个词组：a temperature。','tempera_ure']
]);
PACKS.food.words[3].example='I eat noodles with chopsticks.';
PACKS.food.words[3].translation='我用筷子吃面条。';
