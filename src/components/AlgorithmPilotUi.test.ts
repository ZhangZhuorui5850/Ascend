import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const extensions = readFileSync(
  new URL("./ExtensionsManager.tsx", import.meta.url),
  "utf8",
);
const admin = readFileSync(
  new URL("./admin/AlgorithmPilotAdminActions.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../app/practice/algorithms/page.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../styles/domains/extensions.css", import.meta.url),
  "utf8",
);

describe("algorithm pilot UI contract", () => {
  it("requires an explicit user checkbox before requesting the isolated-Judge pilot", () => {
    expect(extensions).toContain("requestAlgorithmPilotAction({ consent })");
    expect(extensions).toContain('type="checkbox"');
    expect(extensions).toContain("我理解代码会发送到独立 Judge");
    expect(extensions).toContain("disabled={!consent || pending}");
    expect(extensions).toContain("需管理员批准后才能在线评测");
  });

  it("gives administrators explicit approve and pause controls with cohort evidence", () => {
    expect(admin).toContain('update("approved")');
    expect(admin).toContain('update("paused")');
    expect(admin).toContain("试点批次");
    expect(admin).toContain("同意版本");
    expect(admin).toContain("所有变更都会写入审计日志");
  });

  it("exposes Judge runtime availability to the training board", () => {
    expect(page).toContain("getJudgeRuntimeAvailability(db, access)");
  });

  it("provides a narrow-screen layout for pilot facts and cards", () => {
    expect(styles).toContain(".algorithmPilotRequest");
    expect(styles).toContain(".algorithmPilotAdmin");
    expect(styles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*\.algorithmPilotFacts\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/,
    );
  });
});
