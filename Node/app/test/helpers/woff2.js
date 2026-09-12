import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

/**
 * A small, dependency-free reader for the parts of a shipped WOFF2 the
 * typography contract cares about: the OS/2 weight class, the character map,
 * the name table and the variable-font axes.
 *
 * The point, as with the OTF reader beside it, is to assert against the
 * *binary that ships*. A stylesheet can declare `font-weight: 600` and a
 * README can claim Cyrillic coverage while the file delivers neither; only
 * reading the tables proves it.
 *
 * WOFF2 stores its table directory outside the compressed block and the table
 * data inside it, concatenated in directory order with no padding. Only `glyf`
 * and `loca` are ever transformed, and this reader needs neither, so the
 * remaining tables can be sliced straight out of the decompressed stream.
 */

// The 63 known table tags, in the order the WOFF2 specification assigns them.
const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

function readUIntBase128(buf, start) {
  let value = 0;
  let offset = start;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[offset];
    offset += 1;
    if (i === 0 && byte === 0x80) throw new Error("WOFF2: leading zero in UIntBase128");
    if (value & 0xfe000000) throw new Error("WOFF2: UIntBase128 overflow");
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value: value >>> 0, offset };
  }
  throw new Error("WOFF2: UIntBase128 too long");
}

/** Splits the decompressed block into `{ tag: Buffer }`. */
function readTables(file) {
  const buf = readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "wOF2") throw new Error(`${file} is not a WOFF2 file`);

  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);

  const directory = [];
  let cursor = 48;
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[cursor];
    cursor += 1;
    const tagIndex = flags & 0x3f;
    let tag;
    if (tagIndex === 0x3f) {
      tag = buf.toString("ascii", cursor, cursor + 4);
      cursor += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex];
    }

    const transformVersion = (flags >> 6) & 0x03;
    const origRead = readUIntBase128(buf, cursor);
    cursor = origRead.offset;

    // Only glyf/loca carry a transform at version 0; every other table is
    // transformed only when the version is non-zero.
    const transformed =
      tag === "glyf" || tag === "loca" ? transformVersion !== 3 : transformVersion !== 0;

    let length = origRead.value;
    if (transformed) {
      const transformRead = readUIntBase128(buf, cursor);
      cursor = transformRead.offset;
      length = transformRead.value;
    }

    directory.push({ tag, length });
  }

  const compressed = buf.subarray(cursor, cursor + totalCompressedSize);
  const stream = brotliDecompressSync(compressed);

  const tables = {};
  let at = 0;
  for (const { tag, length } of directory) {
    tables[tag] = stream.subarray(at, at + length);
    at += length;
  }
  return tables;
}

function readCmap(table) {
  if (!table || table.length === 0) return new Set();
  const codepoints = new Set();
  const numSubtables = table.readUInt16BE(2);

  for (let i = 0; i < numSubtables; i += 1) {
    const record = 4 + i * 8;
    const offset = table.readUInt32BE(record + 4);
    const format = table.readUInt16BE(offset);

    if (format === 4) {
      const segCountX2 = table.readUInt16BE(offset + 6);
      const segCount = segCountX2 / 2;
      const endBase = offset + 14;
      const startBase = endBase + segCountX2 + 2;
      const deltaBase = startBase + segCountX2;
      const rangeBase = deltaBase + segCountX2;

      for (let seg = 0; seg < segCount; seg += 1) {
        const end = table.readUInt16BE(endBase + seg * 2);
        const start = table.readUInt16BE(startBase + seg * 2);
        if (start === 0xffff) continue;
        const rangeOffset = table.readUInt16BE(rangeBase + seg * 2);
        for (let code = start; code <= end && code !== 0xffff; code += 1) {
          if (rangeOffset === 0) {
            const delta = table.readInt16BE(deltaBase + seg * 2);
            if (((code + delta) & 0xffff) !== 0) codepoints.add(code);
          } else {
            const glyphAt = rangeBase + seg * 2 + rangeOffset + (code - start) * 2;
            if (glyphAt + 1 < table.length && table.readUInt16BE(glyphAt) !== 0) codepoints.add(code);
          }
        }
      }
    } else if (format === 12) {
      const nGroups = table.readUInt32BE(offset + 12);
      for (let group = 0; group < nGroups; group += 1) {
        const at = offset + 16 + group * 12;
        const start = table.readUInt32BE(at);
        const end = table.readUInt32BE(at + 4);
        for (let code = start; code <= end; code += 1) codepoints.add(code);
      }
    }
  }
  return codepoints;
}

function readNames(table) {
  if (!table || table.length === 0) return {};
  const count = table.readUInt16BE(2);
  const stringOffset = table.readUInt16BE(4);
  const names = {};

  for (let i = 0; i < count; i += 1) {
    const record = 6 + i * 12;
    const platformId = table.readUInt16BE(record);
    const nameId = table.readUInt16BE(record + 6);
    const length = table.readUInt16BE(record + 8);
    const offset = table.readUInt16BE(record + 10);
    const bytes = table.subarray(stringOffset + offset, stringOffset + offset + length);
    const value = platformId === 1 ? bytes.toString("latin1") : bytes.toString("utf16le").replace(/\0/g, "");
    // Platform 3 (Windows) strings are big-endian UTF-16; swap before decoding.
    const decoded =
      platformId === 3 ? Buffer.from(bytes).swap16().toString("utf16le") : value;
    if (names[nameId] === undefined) names[nameId] = decoded;
  }
  return names;
}

function readFvar(table) {
  if (!table || table.length === 0) return null;
  const axesArrayOffset = table.readUInt16BE(4);
  const axisCount = table.readUInt16BE(8);
  const axisSize = table.readUInt16BE(10);
  const axes = [];

  for (let i = 0; i < axisCount; i += 1) {
    const at = axesArrayOffset + i * axisSize;
    axes.push({
      tag: table.toString("ascii", at, at + 4),
      min: table.readInt32BE(at + 4) / 65536,
      default: table.readInt32BE(at + 8) / 65536,
      max: table.readInt32BE(at + 12) / 65536,
    });
  }
  return axes;
}

/**
 * Reads the shipped WOFF2 at `file` and returns the facts the type contract
 * asserts on.
 */
export function readWoff2(file) {
  const tables = readTables(file);
  const os2 = tables["OS/2"];
  const names = readNames(tables.name);
  const codepoints = readCmap(tables.cmap);

  return {
    tags: Object.keys(tables).sort(),
    weightClass: os2 ? os2.readUInt16BE(4) : null,
    widthClass: os2 ? os2.readUInt16BE(6) : null,
    numGlyphs: tables.maxp ? tables.maxp.readUInt16BE(4) : null,
    familyName: names[1],
    subfamilyName: names[2],
    versionString: names[5],
    licenseDescription: names[13],
    licenseUrl: names[14],
    axes: readFvar(tables.fvar),
    codepoints,
    covers: (...chars) => chars.every((char) => codepoints.has(char.codePointAt(0))),
    coverage: (chars) => chars.filter((char) => codepoints.has(char.codePointAt(0))).length,
  };
}
