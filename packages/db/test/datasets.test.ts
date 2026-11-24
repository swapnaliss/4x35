import { createReadStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DATASET_COLUMNS,
  type DatasetKind,
  decodeLines,
  detectEncoding,
  parseCsvLine,
  streamCopy,
  toCopyLine,
} from "../src/seed/datasets.js";

// Synthetic 50-line excerpts in the publishers' layouts (fictional places; M0-08).
const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../../fixtures/datasets/${name}`, import.meta.url));

/** Runs the loader on a fixture with a small read buffer, so lines and characters span chunks. */
async function load(kind: DatasetKind, name: string) {
  const out: string[] = [];
  const stats = await streamCopy(
    kind,
    createReadStream(fixture(name), { highWaterMark: 97 }),
    (text) => {
      out.push(text);
    },
  );
  const rows = out
    .join("")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => l.split("\t"));
  return { stats, rows };
}

describe("dataset loader prototype", () => {
  it("projects GeoNames onto country, postcode, place, admin1, admin2", async () => {
    const { stats, rows } = await load("geonames_postal", "geonames-excerpt.tsv");
    expect(stats).toEqual({ kind: "geonames_postal", encoding: "utf-8", rows: 49, skipped: 1 });
    expect(rows.every((r) => r.length === DATASET_COLUMNS.geonames_postal.length)).toBe(true);
    expect(rows[0]).toEqual(["DE", "10000", "Musterdorf 0", "Beispielland", "Kreis Muster"]);
    // an empty admin2 becomes NULL, never an invented value
    expect(rows[3]).toEqual(["IN", "560003", "Kalpitnagar 3", "Udaharan", "\\N"]);
    // the same postcode with two places is kept twice: uniqueness is decided at lookup time
    expect(rows.filter((r) => r[0] === "DE" && r[1] === "10000")).toHaveLength(2);
    // COPY text escapes a backslash
    expect(rows.find((r) => r[1] === "10007" && r[2]?.startsWith("Back"))?.[2]).toBe(
      "Back\\\\slash",
    );
  });

  it("detects Shift_JIS in Japan Post's romanised file and converts it to UTF-8", async () => {
    const { stats, rows } = await load("jp_post_roman", "japanpost-roman-excerpt.sjis.csv");
    expect(stats).toEqual({ kind: "jp_post_roman", encoding: "shift_jis", rows: 50, skipped: 0 });
    expect(rows[1]).toEqual([
      "9990001",
      "東京都",
      "試験市　中央区",
      "架空町1丁目",
      "TOKYO TO",
      "SHIKEN SHI CHUUOU KU",
      "KAKUUCHOU 1 CHOUME",
    ]);
  });

  it("takes postcode, kana and kanji from Japan Post's UTF-8 file", async () => {
    const { stats, rows } = await load("jp_post_kana", "japanpost-kana-excerpt.csv");
    expect(stats).toEqual({ kind: "jp_post_kana", encoding: "utf-8", rows: 50, skipped: 0 });
    expect(rows[0]).toEqual([
      "9990000",
      "ホッカイドウ",
      "シケンシチュウオウク",
      "イカニケイサイガナイバアイ",
      "北海道",
      "試験市中央区",
      "以下に掲載がない場合",
    ]);
  });

  it("detects encodings from raw bytes", () => {
    const sjis = readFileSync(fixture("japanpost-roman-excerpt.sjis.csv"));
    expect(detectEncoding(sjis)).toBe("shift_jis");
    expect(detectEncoding(new TextEncoder().encode("〒100-0001 東京都"))).toBe("utf-8");
    // a UTF-8 character cut at the end of a chunk is still UTF-8
    expect(detectEncoding(new TextEncoder().encode("東").subarray(0, 2))).toBe("utf-8");
  });

  it("splits CRLF and LF lines across chunk boundaries", async () => {
    async function* chunks() {
      yield new TextEncoder().encode("a\r\nb");
      yield new TextEncoder().encode("c\nd");
    }
    const lines: string[] = [];
    for await (const line of decodeLines(chunks())) lines.push(line);
    expect(lines).toEqual(["a", "bc", "d"]);
  });

  it("decides the encoding on the first non-ASCII chunk, not the first chunk", async () => {
    const sjis = readFileSync(fixture("japanpost-roman-excerpt.sjis.csv"));
    async function* chunks() {
      yield new TextEncoder().encode('"0000000",');
      yield sjis.subarray(0, 40);
    }
    let encoding = "";
    const lines: string[] = [];
    for await (const line of decodeLines(chunks(), (e) => {
      encoding = e;
    }))
      lines.push(line);
    expect(encoding).toBe("shift_jis");
    expect(lines[0]).toContain('"0000000","9990000","北海道"');
  });

  it("parses quoted CSV and writes COPY text with NULL and escapes", () => {
    expect(parseCsvLine('"a,b","c""d",,e')).toEqual(["a,b", 'c"d', "", "e"]);
    expect(toCopyLine(["x\ty", null, "a\\b", "l1\nl2"])).toBe("x\\ty\t\\N\ta\\\\b\tl1\\nl2\n");
  });
});
