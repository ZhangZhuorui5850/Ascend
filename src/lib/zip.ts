/**
 * 无依赖的最小 ZIP writer（仅 stored 不压缩）。
 *
 * 产出结构：[每个条目的本地文件头+数据] + [中央目录] + [EOCD]。
 * 文件名一律按 UTF-8 编码并设置通用标志位 bit 11（Language encoding flag），
 * 保证中文等非 ASCII 文件名在主流解压工具里正确显示。
 * 不支持 ZIP64：条目数或尺寸超出 32 位限制时直接抛错（导出场景远达不到）。
 */

export type ZipFileEntry = {
  /** zip 内路径，永远用 "/" 分隔；不允许为空、以 "/" 开头或包含 ".." 段。 */
  name: string;
  data: Uint8Array | string;
  /** 条目修改时间；缺省用 createZip options 里的整体时间。 */
  modifiedAt?: Date;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP 时间戳是 MS-DOS 格式（2 秒精度，1980 起算）；统一按 UTC 取字段并做钳位。 */
function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.min(2107, Math.max(1980, value.getUTCFullYear()));
  const date = ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate();
  const time = (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | (value.getUTCSeconds() >> 1);
  return { date, time };
}

function normalizeEntryName(raw: string): string {
  const name = raw.replaceAll("\\", "/");
  if (!name || name.startsWith("/")) throw new Error(`Invalid zip entry name: ${raw}`);
  const segments = name.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid zip entry name: ${raw}`);
  }
  return name;
}

const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
/** 通用标志 bit 11：文件名/注释为 UTF-8。 */
const UTF8_FLAG = 0x0800;
/** version made by：高字节 3=Unix，低字节 20=2.0。 */
const VERSION_MADE_BY = (3 << 8) | 20;
const VERSION_NEEDED = 20;

export function createZip(entries: ZipFileEntry[], options: { modifiedAt: Date }): Buffer {
  if (entries.length > MAX_UINT16) throw new Error("ZIP 条目数超出上限");

  const seen = new Set<string>();
  const prepared = entries.map((entry) => {
    const name = normalizeEntryName(entry.name);
    if (seen.has(name)) throw new Error(`Duplicate zip entry name: ${name}`);
    seen.add(name);
    const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : entry.data;
    if (data.length > MAX_UINT32) throw new Error(`Zip entry too large: ${name}`);
    return {
      nameBytes: Buffer.from(name, "utf8"),
      data,
      crc: crc32(data),
      ...dosDateTime(entry.modifiedAt ?? options.modifiedAt),
    };
  });

  const chunks: Buffer[] = [];
  let offset = 0;
  const centralRecords: Buffer[] = [];

  for (const entry of prepared) {
    if (offset > MAX_UINT32) throw new Error("ZIP 总体积超出上限");

    const local = Buffer.alloc(30 + entry.nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(entry.time, 10);
    local.writeUInt16LE(entry.date, 12);
    local.writeUInt32LE(entry.crc, 14);
    local.writeUInt32LE(entry.data.length, 18); // compressed size（stored 等于原始大小）
    local.writeUInt32LE(entry.data.length, 22); // uncompressed size
    local.writeUInt16LE(entry.nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    entry.nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + entry.nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt16LE(entry.time, 12);
    central.writeUInt16LE(entry.date, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entry.nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes：Unix 普通文件 0644
    central.writeUInt32LE(offset, 42); // local header offset
    entry.nameBytes.copy(central, 46);
    centralRecords.push(central);

    chunks.push(local, Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength));
    offset += local.length + entry.data.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const record of centralRecords) {
    chunks.push(record);
    centralSize += record.length;
  }
  if (centralOffset + centralSize > MAX_UINT32) throw new Error("ZIP 总体积超出上限");

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(prepared.length, 8);
  eocd.writeUInt16LE(prepared.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  chunks.push(eocd);

  return Buffer.concat(chunks);
}
