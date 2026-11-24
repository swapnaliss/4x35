/**
 * Reference-dataset loader prototype (M0-08 spike; M2-11 turns it into the production seed).
 *
 * Streams a publisher file, decodes it (Japan Post's romanised file is Shift_JIS; everything else
 * is UTF-8), keeps only the columns ADR 0003 needs and emits Postgres `COPY ... FROM STDIN` text
 * rows. It performs no I/O of its own: callers hand it bytes (for example `unzip -p` output) and a
 * sink (for example `psql -c "COPY ..."` stdin, or `pg-copy-streams` once M0-06 adds `pg`).
 *
 * Values are copied verbatim from the source (trimmed only); nothing is normalised or invented.
 */

/** The scratch tables of the spike. M1-02 owns the production tables (`geonames_postal`, `jp_post`). */
export type DatasetKind = "geonames_postal" | "jp_post_roman" | "jp_post_kana";

/** Column order of each kind's COPY rows. */
export const DATASET_COLUMNS = {
  geonames_postal: ["country", "postcode", "place", "admin1", "admin2"],
  jp_post_roman: [
    "postcode",
    "prefecture_kanji",
    "city_kanji",
    "town_kanji",
    "prefecture_romaji",
    "city_romaji",
    "town_romaji",
  ],
  jp_post_kana: [
    "postcode",
    "prefecture_kana",
    "city_kana",
    "town_kana",
    "prefecture_kanji",
    "city_kanji",
    "town_kanji",
  ],
} as const satisfies Record<DatasetKind, readonly string[]>;

export type Encoding = "utf-8" | "shift_jis";
export type Row = (string | null)[];

export interface LoadStats {
  kind: DatasetKind;
  encoding: Encoding;
  rows: number;
  /** Lines that were blank or had too few fields; never silently repaired. */
  skipped: number;
}

/**
 * UTF-8 if the sample decodes strictly as UTF-8 (a multi-byte sequence cut at the end of the sample
 * is allowed), Shift_JIS otherwise. Japan Post publishes KEN_ALL_ROME.CSV in Shift_JIS.
 */
export function detectEncoding(sample: Uint8Array): Encoding {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: true });
    return "utf-8";
  } catch {
    return "shift_jis";
  }
}

const isAscii = (bytes: Uint8Array): boolean => bytes.every((b) => b < 0x80);
const ASCII = new TextDecoder("utf-8");

/**
 * Decodes a byte stream into lines without the line terminator (LF or CRLF). The encoding is
 * decided on the first chunk that holds a non-ASCII byte (pure ASCII decodes the same either way).
 */
export async function* decodeLines(
  chunks: AsyncIterable<Uint8Array>,
  onEncoding?: (encoding: Encoding) => void,
): AsyncGenerator<string> {
  let decoder: InstanceType<typeof TextDecoder> | undefined;
  let rest = "";
  const choose = (encoding: Encoding) => {
    onEncoding?.(encoding);
    decoder = new TextDecoder(encoding);
    return decoder;
  };
  for await (const chunk of chunks) {
    const d = decoder ?? (isAscii(chunk) ? undefined : choose(detectEncoding(chunk)));
    rest += (d ?? ASCII).decode(chunk, { stream: d !== undefined });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) yield line.endsWith("\r") ? line.slice(0, -1) : line;
  }
  rest += (decoder ?? choose("utf-8")).decode();
  if (rest.length > 0) yield rest.endsWith("\r") ? rest.slice(0, -1) : rest;
}

/** One CSV record (RFC 4180 quoting, `""` escapes a quote). Japan Post records are single-line. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

const orNull = (value: string | undefined): string | null => {
  const v = value?.trim() ?? "";
  return v === "" ? null : v;
};

/**
 * Projects one source line onto the kind's columns. Returns null for a line that cannot be a
 * record (blank, too few fields, no postcode); the caller counts it as skipped.
 */
export function parseRecord(kind: DatasetKind, line: string): Row | null {
  if (line.trim() === "") return null;
  switch (kind) {
    case "geonames_postal": {
      // country, postal code, place, admin name1, admin code1, admin name2, ... (tab-separated)
      const f = line.split("\t");
      if (f.length < 6) return null;
      const row = [orNull(f[0]), orNull(f[1]), orNull(f[2]), orNull(f[3]), orNull(f[5])];
      return row[0] === null || row[1] === null ? null : row;
    }
    case "jp_post_roman": {
      // postcode, prefecture, city, town (kanji), prefecture, city, town (romaji)
      const f = parseCsvLine(line);
      if (f.length < 7) return null;
      const row = f.slice(0, 7).map(orNull);
      return row[0] === null ? null : row;
    }
    case "jp_post_kana": {
      // jis code, old postcode, postcode, 3 x kana, 3 x kanji, 6 flags (utf_ken_all.csv)
      const f = parseCsvLine(line);
      if (f.length < 9) return null;
      const row = f.slice(2, 9).map(orNull);
      return row[0] === null ? null : row;
    }
  }
}

/** One row in Postgres COPY text format: tab-separated, `\N` for null, backslash escapes. */
export function toCopyLine(row: Row): string {
  return `${row
    .map((v) =>
      v === null
        ? "\\N"
        : v
            .replaceAll("\\", "\\\\")
            .replaceAll("\t", "\\t")
            .replaceAll("\n", "\\n")
            .replaceAll("\r", "\\r"),
    )
    .join("\t")}\n`;
}

/**
 * Streams `input` (the publisher file's bytes) into `write` as COPY text rows for `kind`'s columns.
 * `write` may return a promise to apply backpressure.
 */
export async function streamCopy(
  kind: DatasetKind,
  input: AsyncIterable<Uint8Array>,
  write: (copyText: string) => void | Promise<void>,
): Promise<LoadStats> {
  const stats: LoadStats = { kind, encoding: "utf-8", rows: 0, skipped: 0 };
  const batch: string[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await write(batch.join(""));
    batch.length = 0;
  };
  for await (const line of decodeLines(input, (e) => {
    stats.encoding = e;
  })) {
    const row = parseRecord(kind, line);
    if (row === null) {
      if (line.trim() !== "") stats.skipped += 1;
      continue;
    }
    batch.push(toCopyLine(row));
    stats.rows += 1;
    if (batch.length >= 5000) await flush();
  }
  await flush();
  return stats;
}
