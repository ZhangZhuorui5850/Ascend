#!/usr/bin/env python3
"""Export the private algorithm catalog into a browsable Markdown library."""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sqlite3
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import quote


CATEGORY_ORDER = {
    "Ascend 内置训练题": "01-Ascend内置训练题",
    "郭炜课程例题": "02-郭炜课程例题",
    "郭炜课程作业": "03-郭炜课程作业",
    "郭炜课程例题兼作业": "04-郭炜课程例题兼作业",
    "固定题单习题": "05-固定题单习题",
    "中关村学院机试题": "06-中关村学院机试题",
    "个人练习与变式": "07-个人练习与变式",
    "算法模板题": "08-算法模板题",
    "独立导入习题": "09-独立导入习题",
}

KNOWLEDGE_ORDER = {
    "基础语法与模拟": "01-基础语法与模拟",
    "数学与数论": "02-数学与数论",
    "数组与区间": "03-数组与区间",
    "字符串": "04-字符串",
    "排序与二分": "05-排序与二分",
    "双指针": "06-双指针",
    "递归与分治": "07-递归与分治",
    "搜索、枚举与回溯": "08-搜索枚举与回溯",
    "贪心": "09-贪心",
    "动态规划": "10-动态规划",
    "图论": "11-图论",
    "数据结构": "12-数据结构",
    "位运算": "13-位运算",
    "高精度": "14-高精度",
    "组合优化": "15-组合优化",
}

ORIGIN_LABELS = {
    "fixed-list": "固定题单",
    "fixed-list-optional": "固定题单·选做",
    "fixed-list-corrected": "固定题单·校正版",
    "guowei-assignment": "郭炜课程作业",
    "guowei-example": "郭炜课程例题",
    "personal-practice-variant": "个人变式",
    "internal-template": "内部算法模板",
}

TAG_TRANSLATIONS = {
    "arithmetic-progression": "等差数列",
    "array": "数组",
    "array-scan": "数组扫描",
    "binary-search": "二分查找",
    "boolean-logic": "布尔逻辑",
    "boundary": "边界处理",
    "boundary-negative": "负数边界",
    "breadth-first-search": "广度优先搜索",
    "character": "字符处理",
    "comparison": "比较",
    "complexity": "复杂度",
    "conditional": "条件分支",
    "connectivity": "连通性",
    "contiguous-segment": "连续子段",
    "counting": "计数",
    "deduplication": "去重",
    "depth-first-search": "深度优先搜索",
    "digit-processing": "数位处理",
    "divisibility": "整除性",
    "duplicates": "重复元素",
    "dynamic-programming": "动态规划",
    "euclidean-algorithm": "欧几里得算法",
    "graph": "图论",
    "greedy": "贪心",
    "grid": "网格",
    "indexing": "下标处理",
    "input-output": "输入输出",
    "integer-arithmetic": "整数运算",
    "integer-overflow": "整数溢出",
    "interval": "区间",
    "invariant": "循环不变量",
    "kadane": "Kadane 算法",
    "loop": "循环",
    "matching": "匹配",
    "maximum": "最大值",
    "merge": "归并",
    "minimum": "最小值",
    "modulo": "取模",
    "parity": "奇偶性",
    "prefix-sum": "前缀和",
    "queue": "队列",
    "range-query": "区间查询",
    "reverse": "反转",
    "rotation": "循环移位",
    "run-length": "游程编码",
    "scan": "扫描",
    "shortest-path": "最短路",
    "sorted-array": "有序数组",
    "sorting": "排序",
    "space-optimization": "空间优化",
    "stack": "栈",
    "state-machine": "状态机",
    "string": "字符串",
    "string-scan": "字符串扫描",
    "subsequence": "子序列",
    "sum-invariant": "和的不变量",
    "symmetry": "对称性",
    "top-two": "最大两值维护",
    "two-pointers": "双指针",
    "unbounded-knapsack": "完全背包",
    "whitespace": "空白字符",
    "zero-one-knapsack": "0/1 背包",
}

PRIMARY_KNOWLEDGE = {
    "input-output": "基础语法与模拟",
    "complexity": "数学与数论",
    "conditional": "基础语法与模拟",
    "loop": "基础语法与模拟",
    "array-scan": "数组与区间",
    "array": "数组与区间",
    "string": "字符串",
    "string-scan": "字符串",
    "stack": "数据结构",
    "binary-search": "排序与二分",
    "two-pointers": "双指针",
    "sorted-array": "数组与区间",
    "prefix-sum": "数组与区间",
    "dynamic-programming": "动态规划",
    "sorting": "排序与二分",
    "breadth-first-search": "搜索、枚举与回溯",
    "euclidean-algorithm": "数学与数论",
    "depth-first-search": "图论",
    "枚举": "搜索、枚举与回溯",
    "二分答案": "排序与二分",
    "分治": "递归与分治",
    "动态规划": "动态规划",
    "DFS": "搜索、枚举与回溯",
    "BFS": "搜索、枚举与回溯",
    "贪心": "贪心",
    "递归": "递归与分治",
    "字符串": "字符串",
    "01分数规划": "动态规划",
    "多维0/1背包": "动态规划",
    "数学": "数学与数论",
    "模拟": "基础语法与模拟",
    "图论": "图论",
    "单位换算": "数学与数论",
    "区间赋值": "数据结构",
    "高精度": "高精度",
    "记忆化搜索": "动态规划",
    "位运算": "位运算",
    "结构体": "数据结构",
    "map": "数据结构",
    "双指针": "双指针",
    "区间": "数组与区间",
    "priority_queue": "数据结构",
    "组合优化": "组合优化",
}

DIFFICULTY_LABELS = {
    "foundation": "入门",
    "standard": "标准",
}


def parse_json(value: str, fallback: Any) -> Any:
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def safe_filename(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    normalized = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    return normalized[:96] or "未命名题目"


def markdown_value(value: Any) -> str:
    text = str(value or "待补充").strip() or "待补充"
    return text.replace("|", "\\|").replace("\n", "<br>")


def classify_problem(provider: str, source_path: str, origins: list[str]) -> str:
    origin_set = set(origins)
    if provider == "ascend":
        return "Ascend 内置训练题"
    if "guowei-example" in origin_set and "guowei-assignment" in origin_set:
        return "郭炜课程例题兼作业"
    if "guowei-example" in origin_set:
        return "郭炜课程例题"
    if "guowei-assignment" in origin_set:
        return "郭炜课程作业"
    if source_path.startswith("exercises/official/"):
        return "中关村学院机试题"
    if "internal-template" in origin_set or source_path.startswith("exercises/templates/"):
        return "算法模板题"
    if "personal-practice-variant" in origin_set or source_path.startswith("exercises/practice/"):
        return "个人练习与变式"
    if any(origin.startswith("fixed-list") for origin in origins):
        return "固定题单习题"
    return "独立导入习题"


def course_role(category: str) -> str:
    return {
        "Ascend 内置训练题": "Ascend 原创训练",
        "郭炜课程例题": "课程例题",
        "郭炜课程作业": "课程作业/习题",
        "郭炜课程例题兼作业": "课程例题、课程作业",
        "固定题单习题": "固定题单练习",
        "中关村学院机试题": "机试真题",
        "个人练习与变式": "个人练习/变式",
        "算法模板题": "算法模板训练",
        "独立导入习题": "独立练习",
    }[category]


def primary_knowledge(tags: list[str]) -> str:
    first_tag = tags[0] if tags else ""
    return PRIMARY_KNOWLEDGE.get(first_tag, "基础语法与模拟")


def translated_tags(tags: list[str]) -> list[str]:
    return [TAG_TRANSLATIONS.get(tag, tag) for tag in tags]


def source_identity(row: sqlite3.Row, source_path: str) -> tuple[str, str]:
    provider = row["provider_id"]
    external_id = row["external_problem_id"]
    if provider == "openjudge":
        return "OpenJudge", f"OpenJudge {external_id}"
    if provider == "bailian":
        return "OpenJudge 百练", f"百练 {external_id}"
    if provider == "poj":
        return "POJ", f"POJ {external_id}"
    if provider == "ascend":
        return "Ascend 原创题库", external_id
    if provider == "zgca-official":
        match = re.search(r"/([0-9]{2})-[^/]+(?:\.cpp)?$", source_path)
        number = int(match.group(1)) if match else external_id
        return "中关村学院机试", f"机试第 {number} 题"
    if "course-guowei" in source_path:
        return "郭炜课程本地资料", external_id
    if source_path.startswith("exercises/templates/"):
        return "本地算法模板库", external_id
    if source_path.startswith("exercises/practice/"):
        return "个人练习题库", external_id
    return "本地导入题库", external_id


def source_link(url: str) -> str:
    if re.match(r"^https?://", url, flags=re.IGNORECASE):
        return f"[打开原题]({url})"
    return f"`{url}`"


def description_only(statement: str) -> str:
    """Keep the description while structured input/output/examples render below."""
    text = statement.strip()
    text = re.sub(r"^#\s+[^\n]+\n+", "", text, count=1)
    description_heading = re.search(r"^##\s*题目描述\s*$", text, flags=re.MULTILINE)
    if description_heading:
        text = text[description_heading.end() :].lstrip()
        next_section = re.search(r"^##\s*(?:输入|输出|样例)", text, flags=re.MULTILINE)
        if next_section:
            text = text[: next_section.start()].rstrip()
    return text


def render_examples(examples: list[dict[str, Any]]) -> str:
    if not examples:
        return "待补充（数据库样例字段为空）。"
    sections: list[str] = []
    for index, example in enumerate(examples, start=1):
        sections.extend(
            [
                f"### 样例 {index}",
                "",
                "输入：",
                "",
                "~~~text",
                str(example.get("input", "")).rstrip("\n"),
                "~~~",
                "",
                "输出：",
                "",
                "~~~text",
                str(example.get("output", "")).rstrip("\n"),
                "~~~",
            ]
        )
        explanation = str(example.get("explanation", "")).strip()
        if explanation:
            sections.extend(["", f"说明：{explanation}"])
        sections.append("")
    return "\n".join(sections).rstrip()


def render_problem(problem: dict[str, Any]) -> str:
    tags = problem["tags"]
    display_tags = problem["display_tags"]
    origins = problem["origins"]
    origin_text = "、".join(ORIGIN_LABELS.get(origin, origin) for origin in origins) or "数据库内置目录"
    local_path = problem["source_path"] or "数据库内置题库"
    confidence = problem["import_metadata"].get("statementConfidence", "内置题面")
    verified = problem["import_metadata"].get("verified", "题面已纳入 Ascend 题库")
    license_source = problem["license"].get("source") or problem["license"].get("origin") or "Ascend 数据库"
    access = problem["license"].get("access", "workspace")
    difficulty = DIFFICULTY_LABELS.get(problem["difficulty_band"], problem["difficulty_band"] or "待标注")
    priority = problem["priority_band"] or "待标注"
    phase = problem["phase_key"] or "待标注"
    notes = problem["notes"].strip()
    note_section = f"\n\n## 备注\n\n{notes}" if notes else ""

    return f"""# {problem['library_number']} {problem['title']}

## 分类信息

| 字段 | 内容 |
| --- | --- |
| 题目类别 | {markdown_value(problem['category'])} |
| 课程角色 | {markdown_value(problem['course_role'])} |
| 来源平台 | {markdown_value(problem['source_platform'])} |
| 来源题号/标识 | {markdown_value(problem['source_number'])} |
| 原题链接 | {source_link(problem['source_url'])} |
| 主要知识点 | {markdown_value(problem['primary_knowledge'])} |
| 知识点标签 | {markdown_value('、'.join(display_tags))} |
| 数据库原始标签 | {markdown_value('、'.join(tags))} |
| 课程/题单来源标签 | {markdown_value(origin_text)} |
| 训练阶段 | {markdown_value(phase)} |
| 难度 | {markdown_value(difficulty)} |
| 优先级 | {markdown_value(priority)} |
| 本地来源文件 | `{local_path}` |

## 题目描述

{description_only(problem['statement_markdown'])}

## 输入格式

{problem['input_specification'].strip() or '待补充（数据库输入格式字段为空）。'}

## 输出格式

{problem['output_specification'].strip() or '待补充（数据库输出格式字段为空）。'}

## 样例

{render_examples(problem['examples'])}{note_section}

## 来源与质量记录

- 题面来源：{license_source}
- 访问范围：{access}
- 题面可靠性：{confidence}
- 验证记录：{verified}
- 数据库题目 ID：{problem['id']}
"""


def load_problems(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        """
        SELECT p.*, l.library_number
        FROM algorithm_problems p
        JOIN algorithm_library_items l
          ON l.workspace_id = p.workspace_id
         AND l.problem_id = p.id
        ORDER BY l.library_number
        """
    ).fetchall()
    problems: list[dict[str, Any]] = []
    for row in rows:
        metadata = parse_json(row["metadata_json"], {})
        import_metadata = metadata.get("import", {}) if isinstance(metadata, dict) else {}
        origins = import_metadata.get("origins", []) if isinstance(import_metadata, dict) else []
        source_path = import_metadata.get("sourcePath", "") if isinstance(import_metadata, dict) else ""
        tags = parse_json(row["tags_json"], [])
        category = classify_problem(row["provider_id"], source_path, origins)
        source_platform, source_number = source_identity(row, source_path)
        library_number = f"P{row['library_number']:03d}"
        knowledge = primary_knowledge(tags)
        title = row["title"]
        filename = f"{library_number}-{safe_filename(title)}.md"
        relative_path = Path("题目") / CATEGORY_ORDER[category] / KNOWLEDGE_ORDER[knowledge] / filename
        problems.append(
            {
                **dict(row),
                "library_number": library_number,
                "tags": tags,
                "display_tags": translated_tags(tags),
                "metadata": metadata,
                "import_metadata": import_metadata,
                "origins": origins,
                "source_path": source_path,
                "license": parse_json(row["license_metadata_json"], {}),
                "examples": parse_json(row["examples_json"], []),
                "category": category,
                "course_role": course_role(category),
                "primary_knowledge": knowledge,
                "source_platform": source_platform,
                "source_number": source_number,
                "relative_path": relative_path,
            }
        )
    return problems


def validate_problems(problems: list[dict[str, Any]]) -> None:
    if not problems:
        raise ValueError("No problems found")
    ids = [problem["id"] for problem in problems]
    numbers = [problem["library_number"] for problem in problems]
    paths = [str(problem["relative_path"]) for problem in problems]
    for label, values in (("problem IDs", ids), ("library numbers", numbers), ("output paths", paths)):
        if len(values) != len(set(values)):
            raise ValueError(f"Duplicate {label} detected")
    for problem in problems:
        if not problem["title"].strip() or not problem["statement_markdown"].strip() or not problem["tags"]:
            raise ValueError(f"Required content missing for {problem['library_number']}")


def write_catalog(output_root: Path, problems: list[dict[str, Any]]) -> None:
    fields = [
        "永久题号",
        "数据库ID",
        "题目名称",
        "题目类别",
        "课程角色",
        "主要知识点",
        "全部知识点",
        "来源平台",
        "来源题号或标识",
        "原题链接",
        "课程或题单来源标签",
        "训练阶段",
        "难度",
        "优先级",
        "本地来源文件",
        "题目文件",
    ]
    with (output_root / "题目总表.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for problem in problems:
            writer.writerow(
                {
                    "永久题号": problem["library_number"],
                    "数据库ID": problem["id"],
                    "题目名称": problem["title"],
                    "题目类别": problem["category"],
                    "课程角色": problem["course_role"],
                    "主要知识点": problem["primary_knowledge"],
                    "全部知识点": "；".join(problem["display_tags"]),
                    "来源平台": problem["source_platform"],
                    "来源题号或标识": problem["source_number"],
                    "原题链接": problem["source_url"],
                    "课程或题单来源标签": "；".join(
                        ORIGIN_LABELS.get(origin, origin) for origin in problem["origins"]
                    ),
                    "训练阶段": problem["phase_key"],
                    "难度": DIFFICULTY_LABELS.get(
                        problem["difficulty_band"], problem["difficulty_band"]
                    ),
                    "优先级": problem["priority_band"],
                    "本地来源文件": problem["source_path"],
                    "题目文件": str(problem["relative_path"]),
                }
            )


def write_index(output_root: Path, problems: list[dict[str, Any]]) -> None:
    problem_count = len(problems)
    category_counts = Counter(problem["category"] for problem in problems)
    knowledge_counts = Counter(problem["primary_knowledge"] for problem in problems)
    lines = [
        f"# {problem_count} 道算法题索引",
        "",
        "题目按“题目类别 → 主要知识点”存放。永久题号与 Ascend 题库一致。",
        "",
        "## 类别统计",
        "",
        "| 类别 | 数量 |",
        "| --- | ---: |",
    ]
    for category in CATEGORY_ORDER:
        count = category_counts.get(category, 0)
        if count:
            lines.append(f"| {category} | {count} |")
    lines.extend(["", "## 主要知识点统计", "", "| 主要知识点 | 数量 |", "| --- | ---: |"])
    for knowledge in KNOWLEDGE_ORDER:
        count = knowledge_counts.get(knowledge, 0)
        if count:
            lines.append(f"| {knowledge} | {count} |")
    lines.extend(["", "## 题目清单", ""])
    for category in CATEGORY_ORDER:
        category_problems = [problem for problem in problems if problem["category"] == category]
        if not category_problems:
            continue
        lines.extend([f"### {category}", ""])
        for problem in category_problems:
            link = quote(problem["relative_path"].as_posix(), safe="/")
            lines.append(
                f"- [{problem['library_number']} {problem['title']}]({link}) — "
                f"{problem['primary_knowledge']}；{problem['source_platform']}；{problem['source_number']}"
            )
        lines.append("")
    (output_root / "题目索引.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_readme(output_root: Path, problems: list[dict[str, Any]], database_path: Path) -> None:
    problem_count = len(problems)
    category_counts = Counter(problem["category"] for problem in problems)
    missing_input = [p["library_number"] for p in problems if not p["input_specification"].strip()]
    missing_output = [p["library_number"] for p in problems if not p["output_specification"].strip()]
    missing_examples = [p["library_number"] for p in problems if not p["examples"]]
    oj_count = sum(p["provider_id"] in {"openjudge", "bailian", "poj"} for p in problems)
    category_lines = "\n".join(
        f"- {category}：{category_counts[category]} 道"
        for category in CATEGORY_ORDER
        if category_counts.get(category)
    )
    readme = f"""# 算法题分类库

本目录从 `{database_path.as_posix()}` 的当前 Ascend 题库导出，共 {problem_count} 道题。每道题拥有独立 Markdown 文件，目录层级为“题目类别 → 主要知识点”。

## 快速入口

- [题目索引](题目索引.md)：按类别浏览全部题目
- [题目总表](题目总表.csv)：筛选课程角色、知识点、OJ 来源和题号
- `题目/`：{problem_count} 个完整题面文件
- `manifest.json`：机器可读的导出清单与分类结果

## 类别

{category_lines}

课程题依据数据库 `origins` 标记分类。9 道题同时拥有“郭炜课程例题”和“郭炜课程作业”标记，进入“郭炜课程例题兼作业”目录。固定题单等附加来源继续保留在每道题的“课程/题单来源标签”中。

## 来源题号

共 {oj_count} 道题带有 OpenJudge、百练或 POJ 题号。其余题目使用 Ascend 内部标识、机试题号或本地资料标识。每道题同时保存来源平台、题号、原题链接和本地来源路径。

## 知识点

“主要知识点”用于目录归档，由数据库第一个知识点标签映射到统一中文分类；“知识点标签”保留该题全部内容标签；“数据库原始标签”方便核对原始记录。

## 数据质量记录

- {problem_count} 道题均有唯一永久题号、标题、题面和知识点标签。
- 输入格式待补充：{', '.join(missing_input)}。
- 输出格式待补充：{', '.join(missing_output)}。
- 样例待补充：{', '.join(missing_examples)}。
- 本目录是私人工作区导出，题目访问与转载范围以每个文件的“来源与质量记录”为准。

本导出聚焦题面、分类和来源信息；参考实现继续保存在 Ascend 原数据库元数据中。
"""
    (output_root / "README.md").write_text(readme, encoding="utf-8")


def export_library(database_path: Path, output_root: Path) -> None:
    if not database_path.is_file():
        raise FileNotFoundError(f"Database not found: {database_path}")
    output_root.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(f"file:{database_path.resolve()}?mode=ro", uri=True)
    try:
        problems = load_problems(connection)
        validate_problems(problems)
        source_updated_at = connection.execute("SELECT MAX(updated_at) FROM algorithm_problems").fetchone()[0]
    finally:
        connection.close()

    problem_root = output_root / "题目"
    if problem_root.exists():
        shutil.rmtree(problem_root)

    for problem in problems:
        destination = output_root / problem["relative_path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(render_problem(problem), encoding="utf-8")

    write_catalog(output_root, problems)
    write_index(output_root, problems)
    write_readme(output_root, problems, database_path)
    manifest = {
        "sourceDatabase": database_path.as_posix(),
        "sourceUpdatedAt": source_updated_at,
        "problemCount": len(problems),
        "problems": [
            {
                "libraryNumber": problem["library_number"],
                "databaseId": problem["id"],
                "title": problem["title"],
                "category": problem["category"],
                "primaryKnowledge": problem["primary_knowledge"],
                "sourcePlatform": problem["source_platform"],
                "sourceNumber": problem["source_number"],
                "path": problem["relative_path"].as_posix(),
            }
            for problem in problems
        ],
    }
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Exported {len(problems)} problems to {output_root}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("data/workbench.sqlite"))
    parser.add_argument("--output", type=Path, default=Path("data/algorithm-problem-library"))
    args = parser.parse_args()
    export_library(args.db, args.output)


if __name__ == "__main__":
    main()
