import vm from "node:vm";
import type { KnowledgePoint, KnowledgeSeed, Subject, Tier } from "./types";

const TIER_NAME: Record<Tier, string> = {
  r: "精通",
  y: "掌握",
  g: "了解",
};

type RawPoint = [Tier, string, boolean];
type RawSubmodule = [string, RawPoint[]];
type RawModule = [string, string, string, RawSubmodule[]];

export function extractKnowledgeSeed(html: string): KnowledgeSeed {
  const match = html.match(/const DATA = (\[[\s\S]*?\]);\s*\n\s*const TIERNAME/);
  if (!match) {
    throw new Error("Could not find DATA block in knowledge map HTML");
  }

  const data = vm.runInNewContext(match[1], {}, { timeout: 1000 }) as RawModule[];
  if (data.length === 0) return buildFallbackKnowledgeSeed();

  return buildKnowledgeSeed(data);
}

function buildKnowledgeSeed(data: RawModule[]): KnowledgeSeed {
  const subjects: Subject[] = [];
  const points: KnowledgePoint[] = [];

  data.forEach(([code, name, description, submodules], moduleIndex) => {
    subjects.push({ code, name, description });

    submodules.forEach(([submodule, rawPoints], subIndex) => {
      rawPoints.forEach(([tier, title, exam], pointIndex) => {
        points.push({
          id: `${code}-${subIndex + 1}-${pointIndex + 1}`,
          subjectCode: code,
          subjectName: name,
          submodule,
          tier,
          tierName: TIER_NAME[tier],
          title,
          exam,
          status: "未学",
          mastery: 0,
        });
      });
    });

    if (subjects[moduleIndex].code !== code) {
      throw new Error(`Subject order mismatch for ${code}`);
    }
  });

  return { subjects, points };
}

function buildFallbackKnowledgeSeed(): KnowledgeSeed {
  return buildKnowledgeSeed([
    [
      "M1",
      "线性代数",
      "矩阵、秩、特征值、二次型与线性代数计算能力。",
      [
        ["矩阵与行列式", makeFallbackPoints("矩阵运算", 4, ["矩阵乘法", "逆矩阵", "分块矩阵", "行列式计算"])],
        ["秩与线性方程组", makeFallbackPoints("秩与方程组", 4, ["初等变换", "向量组线性相关", "基础解系", "齐次方程组"])],
        ["特征值与二次型", makeFallbackPoints("特征值", 8, ["特征值计算", "相似对角化", "A^n 速算", "正定二次型"])],
      ],
    ],
    [
      "M2",
      "概率统计",
      "概率、随机变量、估计、检验与统计推断。",
      [
        ["概率基础", makeFallbackPoints("概率基础", 5, ["条件概率", "全概率公式", "贝叶斯公式", "独立性"])],
        ["随机变量", makeFallbackPoints("随机变量", 5, ["分布函数", "期望方差", "常见分布", "联合分布"])],
        ["统计推断", makeFallbackPoints("统计推断", 6, ["矩估计", "极大似然", "置信区间", "假设检验"])],
      ],
    ],
    [
      "M3",
      "最优化",
      "凸优化、拉格朗日、KKT 与常用优化算法。",
      [
        ["基础优化", makeFallbackPoints("优化基础", 5, ["梯度", "Hessian", "凸函数", "约束优化"])],
        ["KKT", makeFallbackPoints("KKT", 5, ["拉格朗日乘子", "互补松弛", "对偶问题", "约束资格"])],
        ["算法", makeFallbackPoints("优化算法", 6, ["梯度下降", "牛顿法", "线搜索", "收敛判断"])],
      ],
    ],
    [
      "M4",
      "机器学习",
      "监督学习、降维、模型评估与机器学习基础模型。",
      [
        ["基础模型", makeFallbackPoints("学习模型", 5, ["线性回归", "逻辑回归", "朴素贝叶斯", "KNN"])],
        ["降维与评估", makeFallbackPoints("模型评估", 5, ["PCA 手算", "协方差矩阵特征分解", "交叉验证", "混淆矩阵"])],
        ["神经网络", makeFallbackPoints("神经网络", 6, ["反向传播", "激活函数", "损失函数", "正则化"])],
      ],
    ],
    [
      "M5",
      "算法与数据结构",
      "基础数据结构、图论、动态规划与复杂度分析。",
      [
        ["数据结构", makeFallbackPoints("数据结构", 5, ["栈与队列", "哈希表", "堆", "并查集"])],
        ["图算法", makeFallbackPoints("图算法", 5, ["BFS", "DFS", "最短路", "拓扑排序"])],
        ["动态规划", makeFallbackPoints("动态规划", 6, ["状态定义", "转移方程", "背包", "区间 DP"])],
      ],
    ],
    [
      "M6",
      "编程与机试",
      "输入输出、工程实现、调试与机试题型。",
      [
        ["基础编程", makeFallbackPoints("编程基础", 5, ["I/O 模板", "字符串处理", "数组模拟", "边界条件"])],
        ["机试专项", makeFallbackPoints("机试专项", 5, ["排序检索", "模拟题", "贪心", "搜索"])],
        ["工程习惯", makeFallbackPoints("工程习惯", 6, ["复杂度估计", "测试样例", "调试日志", "代码整理"])],
      ],
    ],
    [
      "M7",
      "综合应用",
      "跨模块综合题、模考复盘与冲刺整合。",
      [
        ["综合题", makeFallbackPoints("综合题", 5, ["线代概率综合", "优化机器学习综合", "算法建模", "证明题"])],
        ["模考复盘", makeFallbackPoints("模考复盘", 5, ["错题归因", "时间分配", "薄弱点回炉", "二刷计划"])],
        ["冲刺", makeFallbackPoints("冲刺", 6, ["高频考点", "公式卡片", "临场策略", "查漏补缺"])],
      ],
    ],
  ]);
}

function makeFallbackPoints(prefix: string, count: number, named: string[]): RawPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const title = named[index] ?? `${prefix} ${index + 1}`;
    return [index < Math.ceil(count / 2) ? "r" : index % 2 === 0 ? "y" : "g", title, title.includes("PCA") || index === 0];
  });
}
