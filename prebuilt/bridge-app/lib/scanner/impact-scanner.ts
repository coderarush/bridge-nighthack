/**
 * Bridge impact scanner. Reuses the deterministic patcher's matcher so that
 * "files we report as impacted" is exactly "files the patcher will change".
 * That guarantee is the demo's credibility: no phantom impacts, no silent edits.
 */
import { findMatches, OLD_KEY, NEW_KEY } from "../patcher/atlaspay-rename";

export interface FileImpact {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  reason: string;
  confidence: number;
}

export function scanFile(filePath: string, contents: string): FileImpact[] {
  return findMatches(contents, filePath).map((m) => ({
    filePath,
    lineStart: m.line,
    lineEnd: m.line,
    snippet: m.snippet,
    reason: `AtlasPay request key \`${OLD_KEY}\` must become \`${NEW_KEY}\` (verified: sibling \`amount\` present).`,
    confidence: m.confidence,
  }));
}

export function scanFiles(files: { path: string; contents: string }[]): FileImpact[] {
  return files.flatMap((f) => scanFile(f.path, f.contents));
}
