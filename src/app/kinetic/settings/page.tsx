import {
  Bot, Boxes, BrainCircuit, Database, Fingerprint, Gauge, MonitorCog,
  Palette, RadioTower, Settings2, ShieldCheck, Smartphone, Sparkles,
} from "lucide-react";
import { AccountSection } from "@/components/AccountSection";
import { AgentAccessSection } from "@/components/AgentAccessSection";
import { DisplaySection } from "@/components/DisplaySection";
import { DeviceSessions } from "@/components/DeviceSessions";
import { ExportDataSection } from "@/components/ExportDataSection";
import { ExtensionsManager } from "@/components/ExtensionsManager";
import { InstallAppSection } from "@/components/InstallAppSection";
import styles from "@/components/kinetic/KineticSystem.module.css";
import { ModulesSection } from "@/components/ModulesSection";
import { SettingsForm } from "@/components/SettingsForm";
import { listUserSessions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listAgentTokens } from "@/lib/repo/agent-tokens";
import { getSubjects } from "@/lib/repo/knowledge";
import { listWorkspacePlugins } from "@/lib/repo/plugins";
import { getUserProfile } from "@/lib/repo/profile";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

const GROUPS = [
  { id: "identity", label: "身份", icon: Fingerprint },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "study", label: "学习", icon: BrainCircuit },
  { id: "modules", label: "板块", icon: Boxes },
  { id: "extensions", label: "扩展", icon: RadioTower },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "display", label: "显示", icon: MonitorCog },
  { id: "devices", label: "设备", icon: Smartphone },
  { id: "data", label: "数据", icon: Database },
  { id: "app", label: "应用", icon: Sparkles },
] as const;

export default async function KineticSettingsPage() {
  const access = await requirePageWorkspace("/kinetic/settings");
  const db = getDb();
  const settings = getSettings(db, access);
  const sessions = listUserSessions(access.userId, db);
  const profile = getUserProfile(db, access.userId)!;
  const subjects = getSubjects(db, access);
  const agentTokens = listAgentTokens(db, access.userId);
  const plugins = listWorkspacePlugins(db, access);
  const mcpUrl = process.env.APP_DOMAIN
    ? `https://${process.env.APP_DOMAIN}/api/mcp`
    : "http://localhost:3000/api/mcp";
  const enabledModules = settings.modulePrefs.filter((item) => item.enabled).length;
  const enabledPlugins = plugins.filter((plugin) => plugin.enabled && plugin.state === "enabled").length;

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} ${styles.settingsHero}`}>
        <div className={styles.heroCopy}>
          <span><Settings2 size={15} /> PERSONAL CONTROL PLANE · 个人控制面</span>
          <h1>调整系统，<br /><em>而不是迁就系统。</em></h1>
          <p>{settings.learningGoal || "定义你的研究目标、注意力预算与证据节奏。"}</p>
          <div className={styles.heroBadges}>
            <span><ShieldCheck size={14} /> 本地安全边界</span>
            <span><Gauge size={14} /> 每周 {Math.round(settings.weeklyMinutes / 60 * 10) / 10} 小时</span>
            <span><Bot size={14} /> {agentTokens.length} 个 Agent 令牌</span>
          </div>
        </div>
        <div aria-hidden="true" className={styles.controlCore}>
          <i /><i /><i /><i />
          <span><Settings2 size={32} /><b>10</b><small>CONTROL CHANNELS</small></span>
        </div>
      </section>

      <section aria-label="系统状态" className={styles.signalStrip}>
        <div><span>01</span><small>IDENTITY</small><strong>{profile.displayName}</strong></div>
        <div><span>02</span><small>MODULES</small><strong>{enabledModules}/{settings.modulePrefs.length} 个板块在线</strong></div>
        <div><span>03</span><small>EXTENSIONS</small><strong>{enabledPlugins}/{plugins.length} 条轨道在线</strong></div>
        <div><span>04</span><small>SESSIONS</small><strong>{sessions.length} 个有效设备</strong></div>
      </section>

      <nav aria-label="设置分类" className={styles.controlNav}>
        {GROUPS.map(({ id, label, icon: Icon }, index) => (
          <a aria-label={`跳到${label}设置`} href={`#${id}`} key={id}><span>{String(index + 1).padStart(2, "0")}</span><Icon size={15} /><b>{label}</b></a>
        ))}
      </nav>

      <div className={styles.controlStack}>
        <ControlGroup description="个人资料、头像与账户密码。" icon={Fingerprint} id="identity" index="01" title="身份密钥">
          <AccountSection
            email={profile.email}
            profile={{
              userId: profile.userId,
              displayName: profile.displayName,
              avatarKind: profile.avatarKind,
              avatarChar: profile.avatarChar,
              avatarColor: profile.avatarColor,
              avatarVersion: profile.updatedAt,
            }}
          />
        </ControlGroup>

        <ControlGroup description="为 Codex 等研究助手签发可撤销的独立令牌。" icon={Bot} id="agent" index="02" title="Agent 接入">
          <AgentAccessSection mcpUrl={mcpUrl} tokens={agentTokens} />
        </ControlGroup>

        <ControlGroup description="学习目标、投入预算、复习容量与考试里程碑。" icon={BrainCircuit} id="study" index="03" title="研究节奏">
          <SettingsForm initial={settings} subjects={subjects} />
        </ControlGroup>

        <ControlGroup description="决定哪些学习能力出现在轨道和命令面板。" icon={Boxes} id="modules" index="04" title="功能板块">
          <ModulesSection initial={settings.modulePrefs} />
        </ControlGroup>

        <ControlGroup description="管理受信任扩展的启停、顺序与试点状态。" icon={RadioTower} id="extensions" index="05" title="扩展轨道">
          <ExtensionsManager compact initial={plugins} routePrefix="/kinetic" />
        </ControlGroup>

        <ControlGroup description="Kinetic 采用固定的高辨识场域光谱，避免研究信号被换肤语义稀释。" icon={Palette} id="appearance" index="06" title="场域光谱">
          <KineticPaletteContract />
        </ControlGroup>

        <ControlGroup description="为密度、字号、行距、动效与对比度校准阅读体验。" icon={MonitorCog} id="display" index="07" title="显示与阅读">
          <DisplaySection />
        </ControlGroup>

        <ControlGroup description="查看有效会话，并让不再可信的设备立即退出。" icon={Smartphone} id="devices" index="08" title="设备安全">
          <DeviceSessions sessions={sessions} />
        </ControlGroup>

        <ControlGroup description="随时带走任务、知识、证据、资料与设置。" icon={Database} id="data" index="09" title="数据主权">
          <ExportDataSection />
        </ControlGroup>

        <ControlGroup description="把 Ascend 安装成可独立运行的学习应用。" icon={Sparkles} id="app" index="10" title="设备应用">
          <InstallAppSection />
        </ControlGroup>
      </div>
    </div>
  );
}

function KineticPaletteContract() {
  return (
    <section aria-label="Kinetic 场域配色" className={styles.paletteContract}>
      <div><i data-tone="violet" /><span><strong>信号紫</strong><small>主操作、选中与系统轨迹</small></span></div>
      <div><i data-tone="acid" /><span><strong>动量酸绿</strong><small>达成、推进与关键高光</small></span></div>
      <div><i data-tone="orange" /><span><strong>纠偏橙</strong><small>风险、错题与注意力转向</small></span></div>
      <div><i data-tone="mint" /><span><strong>证据薄荷</strong><small>健康、在线与可信反馈</small></span></div>
      <p>这套光谱是 Kinetic 的信息语法，不作为装饰换肤。字号、行距、密度、对比度和减弱动效仍可在下一通道独立校准。</p>
    </section>
  );
}

function ControlGroup({ children, description, icon: Icon, id, index, title }: {
  children: React.ReactNode;
  description: string;
  icon: typeof Settings2;
  id: string;
  index: string;
  title: string;
}) {
  return (
    <section className={styles.controlGroup} id={id}>
      <header>
        <span>{index}</span>
        <i><Icon size={18} /></i>
        <div><small>CONTROL CHANNEL</small><h2>{title}</h2><p>{description}</p></div>
      </header>
      <div className={styles.controlBody}>{children}</div>
    </section>
  );
}
