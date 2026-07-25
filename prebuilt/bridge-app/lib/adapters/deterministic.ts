// Pre-built deterministic implementations for the scan + patch seams.
import { diffAtlasPay } from "../openapi/atlaspay-diff";
import { scanFiles } from "../scanner/impact-scanner";
import { patchSource } from "../patcher/atlaspay-rename";
import type { ChangeDetector, ImpactScanner, PatchEngine, ScanTarget, PatchedFile } from "./interfaces";
import type { ProviderChangeView } from "../types";

export const atlasPayChangeDetector: ChangeDetector = {
  detect(oldSpec, newSpec): ProviderChangeView {
    const d = diffAtlasPay(oldSpec, newSpec);
    const op = d.operations[0];
    return {
      provider: d.provider,
      fromVersion: d.fromVersion,
      toVersion: d.toVersion,
      severity: d.severity,
      summary: d.summary,
      oldSpecUrl: "/fixtures/atlaspay-v1.openapi.yaml",
      newSpecUrl: "/fixtures/atlaspay-v2.openapi.yaml",
      removed: op.removed,
      addedRequired: op.addedRequired,
      operation: op.operation,
    };
  },
};

export const atlasPayScanner: ImpactScanner = {
  scan(files: ScanTarget[]) {
    return scanFiles(files);
  },
};

export const atlasPayPatchEngine: PatchEngine = {
  patch(files: ScanTarget[]): PatchedFile[] {
    return files
      .map((f) => {
        const r = patchSource(f.contents, f.path);
        return { path: f.path, patched: r.patched, edits: r.edits, changed: r.changed };
      })
      .filter((f) => f.changed)
      .map(({ path, patched, edits }) => ({ path, patched, edits }));
  },
};
