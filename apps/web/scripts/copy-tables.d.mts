export interface CopyRow {
  file: string;
  key: string;
  en: string;
}
export function readCopyTables(repoRoot: string): CopyRow[];
