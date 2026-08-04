import { Activity, ArrowDownRight, Blocks, Cable, Orbit, ShieldCheck, Sparkles } from "lucide-react";
import { ExtensionsManager } from "@/components/ExtensionsManager";
import styles from "@/components/kinetic/KineticSystem.module.css";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listWorkspacePlugins } from "@/lib/repo/plugins";

export const dynamic = "force-dynamic";

export default async function KineticExtensionsPage() {
  const access = await requirePageWorkspace("/kinetic/extensions");
  const plugins = listWorkspacePlugins(getDb(), access);
  const enabled = plugins.filter((plugin) => plugin.enabled && plugin.state === "enabled");
  const permissionCount = new Set(plugins.flatMap((plugin) => plugin.manifest.permissions)).size;
  const slotCount = plugins.reduce((sum, plugin) => (
    sum + Object.values(plugin.manifest.slots).filter(Boolean).length
  ), 0);

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} ${styles.extensionHero}`}>
        <div className={styles.heroCopy}>
          <span><Blocks size={15} /> CAPABILITY ORBITS · 能力轨道</span>
          <h1>让系统生长，<br /><em>不让边界失控。</em></h1>
          <p>扩展不是装饰性的入口，而是受权限约束的学习能力。每条轨道都明确写出它能读取、写入和贡献的证据。</p>
          <div className={styles.heroBadges}>
            <span><ShieldCheck size={14} /> 内置审查</span>
            <span><Cable size={14} /> 可逆启停</span>
            <span><Sparkles size={14} /> 数据持续保留</span>
          </div>
        </div>

        <div aria-hidden="true" className={styles.orbitSystem}>
          <i /><i /><i />
          <span className={styles.orbitCore}><Blocks size={28} /><b>{enabled.length}</b><small>LIVE ORBITS</small></span>
          <span className={styles.orbitNodeA}><Activity size={14} /></span>
          <span className={styles.orbitNodeB}><Cable size={14} /></span>
          <span className={styles.orbitNodeC}><Orbit size={14} /></span>
        </div>
      </section>

      <section aria-label="扩展系统指标" className={styles.signalStrip}>
        <div><span>01</span><small>REGISTERED</small><strong>{plugins.length} 条能力轨道</strong></div>
        <div><span>02</span><small>ACTIVE</small><strong>{enabled.length} 条正在运行</strong></div>
        <div><span>03</span><small>PERMISSIONS</small><strong>{permissionCount} 类权限声明</strong></div>
        <div><span>04</span><small>CONNECTIONS</small><strong>{slotCount} 个产品接入点</strong></div>
      </section>

      <section className={styles.systemSurface}>
        <header className={styles.surfaceHeader}>
          <div><span>EXTENSION MANIFEST</span><h2>扩展清单</h2></div>
          <p>启停、排序与试点申请都会直接写入当前工作空间。</p>
          <ArrowDownRight size={25} />
        </header>
        <ExtensionsManager initial={plugins} routePrefix="/kinetic" />
      </section>
    </div>
  );
}
