/**
 * Controlled OpenAPI diff for the AtlasPay change. For the NightHack demo this
 * normalizes the v1->v2 request-body delta into one ProviderChange record.
 * It is deterministic YAML->object comparison scoped to POST /payments; a
 * general diff (oasdiff) can replace it later behind the same interface.
 */
import { parse as parseYaml } from "yaml";

export interface FieldChange {
  operation: string;
  removed: string[];
  addedRequired: string[];
  dataType: string;
}

export interface ProviderChange {
  provider: string;
  fromVersion: string;
  toVersion: string;
  severity: "breaking" | "non_breaking";
  summary: string;
  operations: FieldChange[];
  migrationHint: string;
}

function requestProps(spec: any, path: string): { props: Set<string>; required: Set<string> } {
  const schema =
    spec?.paths?.[path]?.post?.requestBody?.content?.["application/json"]?.schema;
  const ref = schema?.$ref?.split("/").pop();
  const resolved = ref ? spec?.components?.schemas?.[ref] : schema;
  return {
    props: new Set(Object.keys(resolved?.properties ?? {})),
    required: new Set(resolved?.required ?? []),
  };
}

export function diffAtlasPay(v1Yaml: string, v2Yaml: string): ProviderChange {
  const v1 = parseYaml(v1Yaml);
  const v2 = parseYaml(v2Yaml);
  const path = "/payments";
  const a = requestProps(v1, path);
  const b = requestProps(v2, path);

  const removed = [...a.props].filter((p) => !b.props.has(p));
  const addedRequired = [...b.required].filter((p) => !a.required.has(p));
  const breaking = removed.length > 0 || addedRequired.length > 0;

  return {
    provider: "AtlasPay",
    fromVersion: String(v1?.info?.version ?? "1.0.0"),
    toVersion: String(v2?.info?.version ?? "2.0.0"),
    severity: breaking ? "breaking" : "non_breaking",
    summary:
      `POST ${path}: removed ${removed.map((r) => "`" + r + "`").join(", ") || "none"}; ` +
      `now requires ${addedRequired.map((r) => "`" + r + "`").join(", ") || "none"}.`,
    operations: [
      { operation: `POST ${path}`, removed, addedRequired, dataType: "string" },
    ],
    migrationHint: "Rename request key `payment_method` to `payment_method_id`.",
  };
}
