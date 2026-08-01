import type {
  PlannerReminderAnchor,
  PlannerReminderChannel,
  PlannerReminderStatus,
} from "@/lib/planner/types";

const reminderAnchorLabels: Record<PlannerReminderAnchor, string> = {
  due: "到期时间",
  scheduled_start: "计划开始",
  event_start: "事件开始",
  exact: "指定时间",
};

const reminderChannelLabels: Record<PlannerReminderChannel, string> = {
  in_app: "应用内",
  web_push: "Web Push",
};

const reminderStatusLabels: Record<PlannerReminderStatus, string> = {
  pending: "待发送",
  leased: "发送中",
  sent: "已发送",
  failed: "发送失败",
  canceled: "已取消",
};

export function plannerReminderAnchorLabel(anchor: PlannerReminderAnchor): string {
  return reminderAnchorLabels[anchor];
}

export function plannerReminderChannelLabel(channel: PlannerReminderChannel): string {
  return reminderChannelLabels[channel];
}

export function plannerReminderStatusLabel(status: PlannerReminderStatus): string {
  return reminderStatusLabels[status];
}
