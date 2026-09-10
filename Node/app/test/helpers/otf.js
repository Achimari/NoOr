import { readFileSync } from "node:fs";

/**
 * A small, dependency-free reader for the parts of the shipped OTF the
 * typography contract cares about: OS/2 vertical metrics, the name table, and
 * the CFF Private dict plus charstring hinting.
 *
 * The point is to assert against the *binary that ships*, not against the build
 * script's intentions — a build can print "hinted" and still emit a font with an
 * empty Private dict.
 */

function tableDirectory(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i += 1) {
    const p = 12 + i * 16;
    const tag = buf.toString("ascii", p, p + 4);
    tables[tag] = { offset: buf.readUInt32BE(p + 8), length: buf.readUInt32BE(p + 12) };
  }
  return { sfntVersion: buf.toString("ascii", 0, 4), tables };
}

function readOS2(buf, offset) {
  return {
    weightClass: buf.readUInt16BE(offset + 4),
    widthClass: buf.readUInt16BE(offset + 6),
    typoAscender: buf.readInt16BE(offset + 68),
    typoDescender: buf.readInt16BE(offset + 70),
    winAscent: buf.readUInt16BE(offset + 74),
    winDescent: buf.readUInt16BE(offset + 76),
    xHeight: buf.readInt16BE(offset + 86),
    capHeight: buf.readInt16BE(offset + 88),
  };
}

function readName(buf, offset) {
  const count = buf.readUInt16BE(offset + 2);
  const stringOffset = offset + buf.readUInt16BE(offset + 4);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const p = offset + 6 + i * 12;
    const platformID = buf.readUInt16BE(p);
    const nameID = buf.readUInt16BE(p + 6);
    const length = buf.readUInt16BE(p + 8);
    const off = buf.readUInt16BE(p + 10);
    const raw = buf.subarray(stringOffset + off, stringOffset + off + length);
    // Platform 3 (Windows) is UTF-16BE; platform 1 (Mac) is single-byte.
    const value = platformID === 3 ? raw.swap16().toString("utf16le") : raw.toString("latin1");
    if (out[nameID] === undefined) out[nameID] = value;
  }
  return out;
}

/** CFF INDEX → array of Buffers. */
function readIndex(buf, pos) {
  const count = buf.readUInt16BE(pos);
  if (count === 0) return { items: [], end: pos + 2 };
  const offSize = buf.readUInt8(pos + 2);
  const offsetsAt = pos + 3;
  const readOffset = (i) => {
    let v = 0;
    for (let b = 0; b < offSize; b += 1) v = (v << 8) | buf.readUInt8(offsetsAt + i * offSize + b);
    return v;
  };
  const dataStart = offsetsAt + (count + 1) * offSize - 1;
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push(buf.subarray(dataStart + readOffset(i), dataStart + readOffset(i + 1)));
  }
  return { items, end: dataStart + readOffset(count) };
}

/** CFF DICT → { operatorKey: [operands] }. Escaped ops are keyed "12 n". */
function readDict(data) {
  const dict = {};
  let operands = [];
  let i = 0;
  while (i < data.length) {
    const b0 = data.readUInt8(i);
    if (b0 <= 21) {
      let key = String(b0);
      i += 1;
      if (b0 === 12) {
        key = `12 ${data.readUInt8(i)}`;
        i += 1;
      }
      dict[key] = operands;
      operands = [];
    } else if (b0 === 28) {
      operands.push(data.readInt16BE(i + 1));
      i += 3;
    } else if (b0 === 29) {
      operands.push(data.readInt32BE(i + 1));
      i += 5;
    } else if (b0 === 30) {
      // real number: nibble-encoded, terminated by 0xf
      let str = "";
      i += 1;
      let done = false;
      while (i < data.length && !done) {
        const byte = data.readUInt8(i);
        i += 1;
        for (const nibble of [byte >> 4, byte & 15]) {
          if (nibble <= 9) str += String(nibble);
          else if (nibble === 10) str += ".";
          else if (nibble === 11) str += "E";
          else if (nibble === 12) str += "E-";
          else if (nibble === 14) str += "-";
          else if (nibble === 15) { done = true; break; }
        }
      }
      operands.push(parseFloat(str));
    } else if (b0 >= 32 && b0 <= 246) {
      operands.push(b0 - 139);
      i += 1;
    } else if (b0 >= 247 && b0 <= 250) {
      operands.push((b0 - 247) * 256 + data.readUInt8(i + 1) + 108);
      i += 2;
    } else if (b0 >= 251 && b0 <= 254) {
      operands.push(-(b0 - 251) * 256 - data.readUInt8(i + 1) - 108);
      i += 2;
    } else {
      i += 1;
    }
  }
  return dict;
}

/** Undo CFF delta encoding (each value is relative to the previous). */
function undelta(values) {
  const out = [];
  let running = 0;
  for (const v of values) {
    running += v;
    out.push(running);
  }
  return out;
}

const HINT_OPS = new Set([1, 3, 18, 23, 19, 20]); // hstem vstem hstemhm vstemhm hintmask cntrmask

/** True when the charstring reaches a stem or mask operator. */
function isHinted(cs) {
  let i = 0;
  while (i < cs.length) {
    const b0 = cs.readUInt8(i);
    if (b0 >= 32 && b0 <= 246) { i += 1; continue; }
    if (b0 >= 247 && b0 <= 254) { i += 2; continue; }
    if (b0 === 28) { i += 3; continue; }
    if (b0 === 255) { i += 5; continue; }
    // operator
    if (HINT_OPS.has(b0)) return true;
    i += b0 === 12 ? 2 : 1;
  }
  return false;
}

export function readFont(filePath) {
  const buf = readFileSync(filePath);
  const { sfntVersion, tables } = tableDirectory(buf);
  const os2 = readOS2(buf, tables["OS/2"].offset);
  const names = readName(buf, tables.name.offset);

  const cffStart = tables["CFF "].offset;
  const headerSize = buf.readUInt8(cffStart + 2);
  let pos = cffStart + headerSize;
  pos = readIndex(buf, pos).end;                    // Name INDEX
  const topDicts = readIndex(buf, pos);             // Top DICT INDEX
  const top = readDict(topDicts.items[0]);

  const [privateSize, privateOffset] = top["18"] || [0, 0];
  const priv = privateSize
    ? readDict(buf.subarray(cffStart + privateOffset, cffStart + privateOffset + privateSize))
    : {};

  const charStringsOffset = (top["17"] || [0])[0];
  const charStrings = charStringsOffset ? readIndex(buf, cffStart + charStringsOffset).items : [];
  const hintedCharstrings = charStrings.reduce((n, cs) => n + (isHinted(cs) ? 1 : 0), 0);

  return {
    sfntVersion,
    hasCFF: Boolean(tables["CFF "]),
    hasGlyf: Boolean(tables.glyf),
    familyName: names[1],
    version: (names[5] || "").replace(/^Version\s+/, ""),
    ...os2,
    blueValues: priv["6"] ? undelta(priv["6"]) : [],
    otherBlues: priv["7"] ? undelta(priv["7"]) : [],
    stdHW: (priv["10"] || [0])[0],
    stdVW: (priv["11"] || [0])[0],
    stemSnapH: priv["12 12"] ? undelta(priv["12 12"]) : [],
    stemSnapV: priv["12 13"] ? undelta(priv["12 13"]) : [],
    glyphCount: charStrings.length,
    hintedCharstrings,
  };
}
