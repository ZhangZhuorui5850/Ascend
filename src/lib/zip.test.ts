import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, createZip, createZipStream } from "./zip";

const MODIFIED_AT = new Date("2026-07-18T08:30:00Z");

/** 手工解析 EOCD + 中央目录 + 本地文件头，不依赖任何解压库。 */
function parseZip(zip: Buffer) {
  // EOCD 无注释时固定 22 字节且位于末尾。
  const eocdOffset = zip.length - 22;
  expect(zip.readUInt32LE(eocdOffset)).toBe(0x06054b50);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralSize = zip.readUInt32LE(eocdOffset + 12);
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);
  expect(centralOffset + centralSize).toBe(eocdOffset);

  const entries: Array<{
    name: string;
    flag: number;
    method: number;
    crc: number;
    size: number;
    data: Buffer;
  }> = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const flag = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const crc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    // 本地文件头与中央目录必须一致。
    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
    expect(zip.readUInt16LE(localOffset + 6)).toBe(flag);
    expect(zip.readUInt32LE(localOffset + 14)).toBe(crc);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    expect(zip.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8")).toBe(name);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);

    entries.push({ name, flag, method, crc, size, data: Buffer.from(data) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  expect(cursor).toBe(centralOffset + centralSize);
  return entries;
}

describe("crc32", () => {
  it("matches the standard check vector", () => {
    // CRC-32/ISO-HDLC 的公认校验值："123456789" -> 0xCBF43926
    expect(crc32(Buffer.from("123456789", "ascii"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe("createZip", () => {
  it("writes a structurally valid stored zip with UTF-8 names", () => {
    const zip = createZip(
      [
        { name: "data.json", data: '{"ok":true}' },
        { name: "summary.md", data: "# 摘要\n中文内容" },
        { name: "assets/错题截图.png", data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]) },
      ],
      { modifiedAt: MODIFIED_AT },
    );

    const entries = parseZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["data.json", "summary.md", "assets/错题截图.png"]);
    for (const entry of entries) {
      expect(entry.method).toBe(0); // stored
      expect(entry.flag & 0x0800).toBe(0x0800); // UTF-8 文件名标志位 bit 11
      expect(entry.crc).toBe(crc32(entry.data));
      expect(entry.size).toBe(entry.data.length);
    }
    expect(entries[0].data.toString("utf8")).toBe('{"ok":true}');
    expect(entries[1].data.toString("utf8")).toBe("# 摘要\n中文内容");
    expect([...entries[2].data]).toEqual([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
  });

  it("handles empty archives and empty files", () => {
    const empty = createZip([], { modifiedAt: MODIFIED_AT });
    expect(empty.length).toBe(22);
    expect(parseZip(empty)).toEqual([]);

    const zip = createZip([{ name: "empty.txt", data: "" }], { modifiedAt: MODIFIED_AT });
    const [entry] = parseZip(zip);
    expect(entry.size).toBe(0);
    expect(entry.crc).toBe(0);
  });

  it("rejects duplicate and unsafe entry names", () => {
    expect(() => createZip(
      [{ name: "a.txt", data: "1" }, { name: "a.txt", data: "2" }],
      { modifiedAt: MODIFIED_AT },
    )).toThrow(/Duplicate/);
    expect(() => createZip([{ name: "/abs.txt", data: "" }], { modifiedAt: MODIFIED_AT })).toThrow(/Invalid/);
    expect(() => createZip([{ name: "a/../b.txt", data: "" }], { modifiedAt: MODIFIED_AT })).toThrow(/Invalid/);
    expect(() => createZip([{ name: "", data: "" }], { modifiedAt: MODIFIED_AT })).toThrow(/Invalid/);
  });

  it("is accepted by an independent unzip implementation (python zipfile)", () => {
    const probe = spawnSync("python3", ["-c", "import zipfile"], { stdio: "ignore" });
    if (probe.error || probe.status !== 0) return; // 机器上没有 python3 时跳过；结构校验已由上面的手工解析覆盖

    const zip = createZip(
      [
        { name: "data.json", data: '{"schema":1}' },
        { name: "assets/子目录/笔记.md", data: "# 你好" },
      ],
      { modifiedAt: MODIFIED_AT },
    );
    const dir = mkdtempSync(path.join(tmpdir(), "ascend-zip-"));
    try {
      const zipPath = path.join(dir, "test.zip");
      writeFileSync(zipPath, zip);
      const result = spawnSync("python3", ["-c", [
        "import json, sys, zipfile",
        "zf = zipfile.ZipFile(sys.argv[1])",
        "assert zf.testzip() is None",
        "names = zf.namelist()",
        "assert names == ['data.json', 'assets/\\u5b50\\u76ee\\u5f55/\\u7b14\\u8bb0.md'], names",
        "assert json.loads(zf.read('data.json')) == {'schema': 1}",
        "assert zf.read(names[1]).decode('utf-8') == '# \\u4f60\\u597d'",
        "infos = zf.infolist()",
        "assert all(info.compress_type == zipfile.ZIP_STORED for info in infos)",
        "print('ok')",
      ].join("\n"), zipPath], { encoding: "utf8" });
      expect(result.stderr).toBe("");
      expect(result.stdout.trim()).toBe("ok");
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createZipStream", () => {
  it("streams data-descriptor entries accepted by an independent unzip implementation", async () => {
    const probe = spawnSync("python3", ["-c", "import zipfile"], { stdio: "ignore" });
    if (probe.error || probe.status !== 0) return;

    async function* chunkedFile() {
      yield Buffer.from("分块");
      yield Buffer.from("附件");
    }
    const stream = createZipStream(
      [
        { name: "data.json", data: '{"streamed":true}' },
        { name: "assets/大文件.txt", expectedSize: Buffer.byteLength("分块附件"), stream: chunkedFile },
      ],
      { modifiedAt: MODIFIED_AT },
    );
    const zip = Buffer.from(await new Response(stream).arrayBuffer());
    const dir = mkdtempSync(path.join(tmpdir(), "ascend-stream-zip-"));
    try {
      const zipPath = path.join(dir, "stream.zip");
      writeFileSync(zipPath, zip);
      const result = spawnSync("python3", ["-c", [
        "import json, sys, zipfile",
        "zf = zipfile.ZipFile(sys.argv[1])",
        "assert zf.testzip() is None",
        "assert json.loads(zf.read('data.json')) == {'streamed': True}",
        "assert zf.read('assets/\\u5927\\u6587\\u4ef6.txt').decode('utf-8') == '\\u5206\\u5757\\u9644\\u4ef6'",
        "assert all(info.flag_bits & 0x08 for info in zf.infolist())",
        "print('ok')",
      ].join("\n"), zipPath], { encoding: "utf8" });
      expect(result.stderr).toBe("");
      expect(result.stdout.trim()).toBe("ok");
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects entries without exactly one source before starting the response", () => {
    expect(() => createZipStream([{ name: "empty.txt" }], { modifiedAt: MODIFIED_AT })).toThrow(
      "exactly one data source",
    );
    expect(() => createZipStream(
      [{ name: "ambiguous.txt", data: "", stream: async function* source() { yield Buffer.alloc(0); } }],
      { modifiedAt: MODIFIED_AT },
    )).toThrow("exactly one data source");
    expect(() => createZipStream(
      [{ name: "unknown-size.txt", stream: async function* source() { yield Buffer.from("x"); } }],
      { modifiedAt: MODIFIED_AT },
    )).toThrow("expectedSize");
  });

  it("rejects ZIP32 overflow before opening a stream source", () => {
    let opened = false;
    expect(() => createZipStream(
      [{
        name: "too-large.bin",
        expectedSize: 0xffffffff,
        stream: async function* source() {
          opened = true;
          yield Buffer.alloc(0);
        },
      }],
      { modifiedAt: MODIFIED_AT },
    )).toThrow("ZIP32");
    expect(opened).toBe(false);
  });

  it("fails if a streamed file changes size after preflight", async () => {
    const stream = createZipStream(
      [{
        name: "changed.txt",
        expectedSize: 2,
        stream: async function* source() {
          yield Buffer.from("one");
        },
      }],
      { modifiedAt: MODIFIED_AT },
    );
    await expect(new Response(stream).arrayBuffer()).rejects.toThrow("size changed");
  });

  it("closes the active source iterator when the client cancels", async () => {
    let closed = false;
    const stream = createZipStream(
      [{
        name: "cancelled.bin",
        expectedSize: 1024,
        stream: async function* source() {
          try {
            while (true) yield Buffer.from("x");
          } finally {
            closed = true;
          }
        },
      }],
      { modifiedAt: MODIFIED_AT },
    );
    const reader = stream.getReader();
    await reader.read(); // local header
    await reader.read(); // first source chunk
    await reader.cancel();

    expect(closed).toBe(true);
  });
});
