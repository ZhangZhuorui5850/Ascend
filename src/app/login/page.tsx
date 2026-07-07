import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] | undefined }>;
}) {
  const resolved = await searchParams;
  const nextPath = typeof resolved.next === "string" ? resolved.next : undefined;

  return (
    <main className="loginShell">
      <section className="loginHero">
        <div>
          <span className="brandMark">Z</span>
          <h2>ZGCA 学习工作台</h2>
          <p>日历驱动、资料收纳、复习和总结，都为当天学习服务。</p>
        </div>
      </section>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
