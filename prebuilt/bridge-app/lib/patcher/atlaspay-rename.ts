/**
 * Bridge deterministic patch engine — AtlasPay v1 -> v2 field rename.
 *
 * Renames the object-property KEY `payment_method` to `payment_method_id`, and
 * ONLY when that key sits inside an object literal that also has a sibling
 * `amount` property (the AtlasPay POST /payments request shape). This guard is
 * what lets Bridge rename verified request call sites while leaving unrelated
 * strings, comments, and identifiers untouched.
 *
 * No LLM is involved. The transform parses TypeScript with the compiler API,
 * locates the exact character range of each matching key, and splices text so
 * all surrounding formatting is preserved byte-for-byte.
 */
import ts from "typescript";

export const OLD_KEY = "payment_method";
export const NEW_KEY = "payment_method_id";
const GUARD_SIBLING = "amount";

export interface KeyMatch {
  line: number; // 1-based
  column: number; // 1-based
  start: number; // char offset (inclusive) of the key name node
  end: number; // char offset (exclusive)
  kind: "property" | "shorthand";
  snippet: string; // the source line, trimmed
  confidence: number;
}

export interface PatchEdit {
  line: number;
  before: string;
  after: string;
}

export interface PatchResult {
  patched: string;
  edits: PatchEdit[];
  matches: KeyMatch[];
  changed: boolean;
}

function nameText(name: ts.PropertyName | ts.Identifier): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

function objectHasSibling(obj: ts.ObjectLiteralExpression, sibling: string): boolean {
  return obj.properties.some((p) => {
    if (!p.name) return false;
    return nameText(p.name) === sibling;
  });
}

function lineSnippet(sf: ts.SourceFile, pos: number): string {
  const full = sf.getFullText();
  const start = full.lastIndexOf("\n", pos - 1) + 1;
  let end = full.indexOf("\n", pos);
  if (end === -1) end = full.length;
  return full.slice(start, end).trim();
}

/** Find every AtlasPay `payment_method` request key in one source file. */
export function findMatches(sourceText: string, fileName = "file.ts"): KeyMatch[] {
  const sf = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const matches: KeyMatch[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = node.name;
      if (name && nameText(name) === OLD_KEY) {
        const parent = node.parent;
        const guarded =
          ts.isObjectLiteralExpression(parent) && objectHasSibling(parent, GUARD_SIBLING);
        if (guarded) {
          const start = name.getStart(sf);
          const pos = sf.getLineAndCharacterOfPosition(start);
          matches.push({
            line: pos.line + 1,
            column: pos.character + 1,
            start,
            end: name.getEnd(),
            kind: ts.isShorthandPropertyAssignment(node) ? "shorthand" : "property",
            snippet: lineSnippet(sf, start),
            confidence: 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return matches;
}

/** Apply the deterministic rename. Returns patched text + inspectable edits. */
export function patchSource(sourceText: string, fileName = "file.ts"): PatchResult {
  const matches = findMatches(sourceText, fileName);
  if (matches.length === 0) {
    return { patched: sourceText, edits: [], matches, changed: false };
  }
  const descending = [...matches].sort((a, b) => b.start - a.start);
  let out = sourceText;
  const edits: PatchEdit[] = [];
  for (const m of descending) {
    const before = out.slice(m.start, m.end);
    let after: string;
    if (m.kind === "shorthand") {
      // { payment_method } -> { payment_method_id: payment_method }
      after = `${NEW_KEY}: ${OLD_KEY}`;
    } else if (before.startsWith('"') || before.startsWith("'")) {
      // "payment_method" -> "payment_method_id" (preserve quote style)
      const q = before[0];
      after = `${q}${NEW_KEY}${q}`;
    } else {
      after = NEW_KEY;
    }
    out = out.slice(0, m.start) + after + out.slice(m.end);
    edits.push({ line: m.line, before, after });
  }
  edits.reverse();
  return { patched: out, edits, matches, changed: true };
}
