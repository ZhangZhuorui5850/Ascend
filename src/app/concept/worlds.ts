export type ConceptWorld = {
  slug: string;
  number: string;
  name: string;
  cn: string;
  description: string;
  statement: string;
  tags: string[];
  accent: string;
  tasks: Array<{ label: string; meta: string }>;
};

export const newWorlds: ConceptWorld[] = [
  {
    slug: "prism",
    number: "05",
    name: "Prism Vault",
    cn: "棱镜圣殿",
    description: "半透明光学界面。指针改变折射角度，任务像光束一样被拆分、聚焦，再重新合成为理解。",
    statement: "让复杂问题，折射成可以看见的光谱。",
    tags: ["Iridescent", "Optical", "Glass"],
    accent: "#775cff",
    tasks: [
      { label: "分离状态与转移", meta: "光束 01 · 42 MIN" },
      { label: "定位边界条件", meta: "光束 02 · 24 MIN" },
      { label: "合成完整解法", meta: "光束 03 · 18 MIN" },
    ],
  },
  {
    slug: "monolith",
    number: "06",
    name: "Monolith",
    cn: "巨石播报",
    description: "黑白黄粗野主义。巨型排版、硬切换和机械计数器，把今日计划变成无法忽略的行动宣言。",
    statement: "不要优化计划。执行它。",
    tags: ["Brutalist", "Broadcast", "Direct"],
    accent: "#ffe600",
    tasks: [
      { label: "定义问题", meta: "BLOCK 01 / 45" },
      { label: "攻击薄弱点", meta: "BLOCK 02 / 30" },
      { label: "留下证据", meta: "BLOCK 03 / 20" },
    ],
  },
  {
    slug: "cosmos",
    number: "07",
    name: "Cosmos Route",
    cn: "深空航线",
    description: "宇宙导航系统。学习目标成为星体，计划是航线，知识迁移则是星系之间逐渐显现的引力通道。",
    statement: "今天的每一步，都在改变你的轨道。",
    tags: ["Cosmic", "Navigation", "Depth"],
    accent: "#7be7ff",
    tasks: [
      { label: "驶入动态规划星系", meta: "ORBIT 01 · 45 MIN" },
      { label: "校准概率论坐标", meta: "ORBIT 02 · 28 MIN" },
      { label: "返回记忆补给站", meta: "ORBIT 03 · 16 MIN" },
    ],
  },
  {
    slug: "ukiyo",
    number: "08",
    name: "Ukiyo Circuit",
    cn: "浮世电路",
    description: "传统构图与数字霓虹相撞。层叠浪潮承载今日节奏，任务像折扇展开，完成时归入落日。",
    statement: "顺着浪势前进，不与每一次波动对抗。",
    tags: ["Neo-Ukiyo", "Wave", "Rhythm"],
    accent: "#ff4f69",
    tasks: [
      { label: "第一浪：状态定义", meta: "朝 · 四十五分" },
      { label: "第二浪：变式提取", meta: "昼 · 三十分" },
      { label: "第三浪：复盘归档", meta: "夕 · 二十分" },
    ],
  },
  {
    slug: "cryo",
    number: "09",
    name: "Cryo Chamber",
    cn: "极地晶舱",
    description: "低温透明界面。拖动热量控制器解冻知识晶体，让模糊概念从冰层中逐步恢复清晰。",
    statement: "慢慢解冻一个冻结太久的问题。",
    tags: ["Arctic", "Translucent", "Calm"],
    accent: "#39d9ff",
    tasks: [
      { label: "解冻状态定义", meta: "−18°C · 38 MIN" },
      { label: "恢复转移路径", meta: "−12°C · 27 MIN" },
      { label: "封存今日结论", meta: "−6°C · 14 MIN" },
    ],
  },
  {
    slug: "forge",
    number: "10",
    name: "Ember Forge",
    cn: "熔炉工坊",
    description: "工业锻造界面。理解需要升温、锤炼、冷却；每次完成都会迸发火花并留下可见的学习成品。",
    statement: "知识不是被收藏的，它是被锻造出来的。",
    tags: ["Industrial", "Heat", "Impact"],
    accent: "#ff6a1a",
    tasks: [
      { label: "加热：读懂问题边界", meta: "780°C · 20 MIN" },
      { label: "锤炼：独立写出转移", meta: "960°C · 35 MIN" },
      { label: "淬火：无提示复述", meta: "420°C · 18 MIN" },
    ],
  },
  {
    slug: "dreamwave",
    number: "11",
    name: "Dreamwave OS",
    cn: "梦核频道",
    description: "超现实桌面与漂浮窗口。柔软渐变、可拖动任务窗口和梦境频道，把压力转化成可探索空间。",
    statement: "如果学习是一场梦，你可以决定它的方向。",
    tags: ["Dreamcore", "Windows", "Soft"],
    accent: "#ff83db",
    tasks: [
      { label: "打开“动态规划”梦境", meta: "WINDOW 01 · 45 MIN" },
      { label: "回收昨日记忆碎片", meta: "WINDOW 02 · 22 MIN" },
      { label: "写一封信给明天", meta: "WINDOW 03 · 12 MIN" },
    ],
  },
  {
    slug: "cipher",
    number: "12",
    name: "Cipher Bureau",
    cn: "密档侦探",
    description: "调查档案式学习。划开涂黑内容、连接证据与薄弱点，把一道错题还原成完整的认知案卷。",
    statement: "每个错误都留下了证据。",
    tags: ["Investigation", "Redacted", "Tension"],
    accent: "#d11f2f",
    tasks: [
      { label: "证据 A：错误状态定义", meta: "FILE 01 · CLASSIFIED" },
      { label: "证据 B：遗漏边界", meta: "FILE 02 · URGENT" },
      { label: "证据 C：复杂度误判", meta: "FILE 03 · OPEN" },
    ],
  },
  {
    slug: "synth",
    number: "13",
    name: "Synth Sequence",
    cn: "合成音序",
    description: "音乐工作站式学习。任务是音轨，专注区间是节拍，打开或关闭步骤即可重新编排今日节奏。",
    statement: "不要等状态出现，先编出自己的节奏。",
    tags: ["Sequencer", "Audio", "Retro"],
    accent: "#45ff9a",
    tasks: [
      { label: "BASS / 状态定义", meta: "TRACK 01 · 120 BPM" },
      { label: "LEAD / 转移方程", meta: "TRACK 02 · 96 BPM" },
      { label: "PAD / 间隔复习", meta: "TRACK 03 · 72 BPM" },
    ],
  },
  {
    slug: "inkflow",
    number: "14",
    name: "Inkflow",
    cn: "水墨流场",
    description: "留白、水墨与实时笔触。移动指针可以留下逐渐消散的墨迹，任务随一次次落笔缓慢显形。",
    statement: "留白不是空，它让真正重要的东西出现。",
    tags: ["Ink", "Gesture", "Silence"],
    accent: "#20201e",
    tasks: [
      { label: "一笔：写出状态语义", meta: "墨一 · 四十五分" },
      { label: "二笔：推出转移路径", meta: "墨二 · 三十分" },
      { label: "三笔：留一句复盘", meta: "墨三 · 十五分" },
    ],
  },
  {
    slug: "axiom",
    number: "15",
    name: "Axiom Atelier",
    cn: "公理证明所",
    description: "为数学研究设计的证明工作台。命题、引理、反例与依赖关系在同一张证明图上逐层展开，让直觉最终落成可检查的论证。",
    statement: "把直觉写成可以被检验的证明。",
    tags: ["Mathematics", "Proof", "Rigour"],
    accent: "#3157d8",
    tasks: [
      { label: "泛函分析：证明压缩映射", meta: "THEOREM 01 · 52 MIN" },
      { label: "概率论：构造鞅收敛边界", meta: "LEMMA 02 · 38 MIN" },
      { label: "优化理论：检查 KKT 充分性", meta: "PROOF 03 · 26 MIN" },
    ],
  },
  {
    slug: "reactor",
    number: "16",
    name: "Graph Reactor",
    cn: "图算法反应堆",
    description: "动态图搜索实验室。BFS、DFS 与 A* 在同一张图上逐帧执行，访问序列、前驱关系和复杂度随着算法推进实时显现。",
    statement: "让每一步搜索，都留下可解释的轨迹。",
    tags: ["Algorithms", "Graph", "Runtime"],
    accent: "#ff8a2a",
    tasks: [
      { label: "最短路：重建 Dijkstra 不变量", meta: "O(E LOG V) · 45 MIN" },
      { label: "数据结构：验证线段树懒标记", meta: "O(LOG N) · 34 MIN" },
      { label: "复杂度：完成势能法摊还分析", meta: "AMORTIZED · 24 MIN" },
    ],
  },
  {
    slug: "gradient",
    number: "17",
    name: "Gradient Atlas",
    cn: "梯度地貌图谱",
    description: "面向机器学习实验的可视化控制台。切换优化器、调节学习率并观察损失点穿越等高线，把训练过程从一条数字变成可理解的地形。",
    statement: "不要只看最终精度，去观察模型如何抵达它。",
    tags: ["Machine Learning", "Loss", "Experiment"],
    accent: "#c8ff36",
    tasks: [
      { label: "复现基线：校准训练协议", meta: "RUN 042 · 50 EPOCHS" },
      { label: "消融实验：比较三种优化器", meta: "ABLATION · 36 MIN" },
      { label: "误差分析：审计失败样本簇", meta: "ERROR SET · 28 MIN" },
    ],
  },
  {
    slug: "latent",
    number: "18",
    name: "Latent Observatory",
    cn: "潜空间天文台",
    description: "AI 研究者的模型观测站。注意力矩阵、表示簇与实验假设互相联动，用探针把模型内部结构转化为可比较、可证伪的研究证据。",
    statement: "模型不是黑箱，它是一片等待测量的空间。",
    tags: ["AI Research", "Attention", "Representation"],
    accent: "#9a8cff",
    tasks: [
      { label: "论文复现：对齐 Transformer 基线", meta: "PAPER 01 · REPRODUCE" },
      { label: "表示探针：定位语义方向", meta: "PROBE 07 · LAYER 18" },
      { label: "评测设计：消除数据泄漏", meta: "EVAL 03 · CONTROLLED" },
    ],
  },
  {
    slug: "kernel",
    number: "19",
    name: "Kernel Room",
    cn: "内核机房",
    description: "从高级抽象下潜到机器执行的系统剖面。指令穿过编译、缓存、CPU 与内存，调度队列和时钟周期共同解释程序真正发生了什么。",
    statement: "理解抽象，要一路追到机器真正执行的地方。",
    tags: ["Computer Systems", "Kernel", "Trace"],
    accent: "#25e6c8",
    tasks: [
      { label: "内存层次：追踪一次 Cache Miss", meta: "TRACE 01 · 240 CYCLES" },
      { label: "并发控制：复现竞态条件", meta: "THREAD 04 · RACE" },
      { label: "分布式：推演一致性协议", meta: "NODE 05 · QUORUM" },
    ],
  },
];

export function getWorld(slug: string) {
  return newWorlds.find((world) => world.slug === slug);
}
