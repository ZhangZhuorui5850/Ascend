const confirmation = process.env.ASCEND_JUDGE_ATTACK_CONFIRM;
const rawUrl = process.env.ASCEND_JUDGE_ATTACK_GATEWAY_URL?.trim();
const token = process.env.ASCEND_JUDGE_ATTACK_GATEWAY_TOKEN?.trim();

if (confirmation !== "isolated-worker-only") {
  throw new Error(
    "Refusing to run untrusted-code probes. Set ASCEND_JUDGE_ATTACK_CONFIRM=isolated-worker-only.",
  );
}
if (!rawUrl || !token || Buffer.byteLength(token, "utf8") < 32) {
  throw new Error("Set an isolated Gateway URL and a token of at least 32 bytes");
}
const gatewayUrl = new URL(rawUrl);
const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(gatewayUrl.hostname);
if (
  gatewayUrl.hostname === "ascend.zhuorui.me"
  || (gatewayUrl.protocol !== "https:" && !isLoopback)
  || gatewayUrl.username
  || gatewayUrl.password
) {
  throw new Error("Attack audit requires an isolated HTTPS or loopback Gateway, never the Ascend app");
}
gatewayUrl.pathname = gatewayUrl.pathname.replace(/\/+$/, "");
gatewayUrl.search = "";
gatewayUrl.hash = "";

const PROBLEM_REF = "ascend:foundation:sum-two:v1";
const probes = [
  {
    id: "baseline",
    language: "cpp17",
    accepted: ["AC"],
    sourceCode: `
#include <iostream>
int main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n"; }
`,
  },
  {
    id: "infinite-loop",
    language: "cpp17",
    accepted: ["TLE"],
    sourceCode: "int main(){ for(;;){} }",
  },
  {
    id: "memory-pressure",
    language: "python3",
    accepted: ["MLE", "RE", "TLE"],
    sourceCode: "chunks=[]\nwhile True:\n    chunks.append(bytearray(8*1024*1024))\n",
  },
  {
    id: "output-flood",
    language: "cpp17",
    accepted: ["RE", "TLE", "MLE"],
    sourceCode: `
#include <iostream>
int main(){ for(;;) std::cout<<"0123456789"; }
`,
  },
  {
    id: "network-disabled",
    language: "python3",
    accepted: ["AC"],
    sourceCode: `
import socket
s=socket.socket()
s.settimeout(0.2)
try:
    s.connect(("169.254.169.254",80))
    print(999)
except Exception:
    a,b=map(int,input().split())
    print(a+b)
`,
  },
  {
    id: "no-ascend-data-mount",
    language: "cpp17",
    accepted: ["AC"],
    sourceCode: `
#include <filesystem>
#include <iostream>
int main(){
  const char* paths[]={"/opt/apps/ascend/data/workbench.sqlite","/gateway/data/workbench.sqlite","/var/lib/ascend/workbench.sqlite"};
  for(const char* p:paths) if(std::filesystem::exists(p)){ std::cout<<999<<"\\n"; return 0; }
  long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n";
}
`,
  },
  {
    id: "process-limit",
    language: "cpp17",
    accepted: ["AC", "RE"],
    sourceCode: `
#include <iostream>
#include <sys/types.h>
#include <unistd.h>
int main(){
  if(fork()!=-1){ std::cout<<999<<"\\n"; return 0; }
  long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n";
}
`,
  },
  {
    id: "ptrace-blocked",
    language: "cpp17",
    accepted: ["AC", "RE"],
    sourceCode: `
#include <iostream>
#include <sys/ptrace.h>
int main(){
  if(ptrace(PTRACE_TRACEME,0,nullptr,nullptr)!=-1){ std::cout<<999<<"\\n"; return 0; }
  long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n";
}
`,
  },
];

const report = {
  startedAt: new Date().toISOString(),
  gateway: `${gatewayUrl.protocol}//${gatewayUrl.host}`,
  problemRef: PROBLEM_REF,
  results: [],
};

for (const probe of probes) {
  const operationId = `isolation:${Date.now()}:${probe.id}`;
  const created = await request("/v1/submissions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": operationId,
    },
    body: JSON.stringify({
      problemRef: PROBLEM_REF,
      language: probe.language,
      sourceCode: probe.sourceCode.trim(),
      mode: "sample",
    }),
  });
  const result = await poll(created.id, 120_000);
  const passed = probe.accepted.includes(result.status);
  report.results.push({
    id: probe.id,
    status: result.status,
    expected: probe.accepted,
    passed,
    timeMs: result.timeMs ?? null,
    memoryKb: result.memoryKb ?? null,
    failureCode: result.failureCode || "",
  });
  const health = await request("/health", { method: "GET" });
  if (health.ok !== true) throw new Error(`Gateway unhealthy after ${probe.id}`);
  if (!passed) throw new Error(`${probe.id} returned ${result.status}, expected ${probe.accepted.join("/")}`);
}

report.finishedAt = new Date().toISOString();
report.passed = report.results.every((result) => result.passed);
console.log(JSON.stringify(report, null, 2));

async function poll(id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await request(`/v1/submissions/${encodeURIComponent(id)}`, { method: "GET" });
    if (!["CREATING", "QUEUED", "RUNNING"].includes(result.status)) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${id}`);
}

async function request(pathname, init) {
  const response = await fetch(`${gatewayUrl.toString().replace(/\/$/, "")}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${pathname} failed with ${response.status}: ${body.code || body.error || "unknown"}`);
  }
  return body;
}
