// 兼容层：实现已拆分到 src/components/subject-workbench/，原路径 re-export 保持既有 import 不变。
export { SubjectWorkbench } from "./subject-workbench/SubjectWorkbench";
export { ConfidenceCell } from "./subject-workbench/ConfidenceCell";
export { TIER_OPTIONS, type PointMoveTarget, type TreeControls } from "./subject-workbench/shared";
