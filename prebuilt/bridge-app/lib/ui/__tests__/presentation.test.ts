import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { EvidencePanel } from "../../../components/EvidencePanel";
import { Timeline } from "../../../components/Timeline";
import type { RunEventView } from "../../types";

const root = process.cwd();
Object.assign(globalThis, { React });

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const normalized =
      hex.length === 4
        ? `#${[...hex.slice(1)].map((character) => character.repeat(2)).join("")}`
        : hex;
    const channels = normalized
      .match(/[a-f\d]{2}/gi)
      ?.map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    assert.ok(channels);
    return (
      0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    );
  };

  const brighter = luminance(foreground);
  const darker = luminance(background);
  return (Math.max(brighter, darker) + 0.05) /
    (Math.min(brighter, darker) + 0.05);
}

async function parseComponent(fileName: string) {
  const source = await readFile(`${root}/components/${fileName}`, "utf8");
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function jsxElements(sourceFile: ts.SourceFile, tagName: string): ts.Node[] {
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(sourceFile) === tagName) ||
      (ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(sourceFile) === tagName)
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
}

function attributeValue(
  sourceFile: ts.SourceFile,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  name: string,
): string | undefined {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const attribute = opening.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === name,
  );
  if (!attribute?.initializer) return undefined;
  return ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : attribute.initializer.getText(sourceFile);
}

test("timeline completes the migration-plan stage when plan.created arrives", () => {
  const events: RunEventView[] = [
    {
      sequence: 1,
      actorType: "system",
      eventType: "plan.created",
      stage: "planning",
      status: "ok",
      message: "Bounded plan created.",
      createdAt: "",
    },
  ];

  const html = renderToStaticMarkup(React.createElement(Timeline, { events }));

  assert.match(html, /Migration plan created/);
  assert.match(html, /plan\.created/);
  assert.match(html, /1\/7 complete/);
});

test("pending timeline copy never fabricates repository counts", () => {
  const html = renderToStaticMarkup(
    React.createElement(Timeline, { events: [] }),
  );

  assert.match(html, /Bounded TypeScript discovery/);
  assert.doesNotMatch(html, /\b18 TypeScript files\b/);
});

test("external evidence links open safely in a new tab", () => {
  const html = renderToStaticMarkup(
    React.createElement(EvidencePanel, {
      evidence: {
        pullRequestUrl: "https://github.com/example/repo/pull/1",
        pullRequestNumber: 1,
        commitSha: "abcdef0123456789",
        validationUrl: "https://github.com/example/repo/actions/runs/1",
        validationStatus: "completed",
        validationConclusion: "success",
      },
    }),
  );

  assert.equal((html.match(/target="_blank"/g) ?? []).length, 2);
  assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.equal((html.match(/opens in new tab/g) ?? []).length, 2);
});

test("pending pull-request evidence follows patch creation, not approval", () => {
  const html = renderToStaticMarkup(
    React.createElement(EvidencePanel, { evidence: {} }),
  );

  assert.match(html, /Created after patch commit/);
  assert.doesNotMatch(html, /after plan approval/i);
});

test("room title is the compact page-level heading", async () => {
  const sourceFile = await parseComponent("RoomClient.tsx");
  const titleHeading = jsxElements(sourceFile, "h1").find((node) =>
    node.getText(sourceFile).includes("room.title"),
  );

  assert.ok(titleHeading, "expected room.title to render in an h1");
  assert.match(
    attributeValue(
      sourceFile,
      titleHeading as ts.JsxElement | ts.JsxSelfClosingElement,
      "className",
    ) ?? "",
    /room-title/,
  );
});

test("comment textarea keeps a programmatic label after typing", async () => {
  const sourceFile = await parseComponent("RoomSidebar.tsx");
  const textarea = jsxElements(sourceFile, "textarea")[0] as
    | ts.JsxElement
    | ts.JsxSelfClosingElement
    | undefined;
  const label = jsxElements(sourceFile, "label").find(
    (node) =>
      attributeValue(
        sourceFile,
        node as ts.JsxElement | ts.JsxSelfClosingElement,
        "htmlFor",
      ) === "room-comment",
  );

  assert.ok(textarea, "expected a multiline comment textarea");
  assert.equal(attributeValue(sourceFile, textarea, "id"), "room-comment");
  assert.ok(label, "expected a persistent label for the comment textarea");
});

test("primary buttons meet AA contrast and distinguish disabled from busy", async () => {
  const css = await readFile(`${root}/app/globals.css`, "utf8");
  const sheet = postcss.parse(css);
  const declarations = (selector: string) => {
    const values = new Map<string, string>();
    sheet.walkRules(selector, (rule) => {
      rule.walkDecls((declaration) => {
        values.set(declaration.prop, declaration.value);
      });
    });
    return values;
  };

  const button = declarations(".btn");
  const buttonHover = declarations(".btn:hover");
  const disabled = declarations(".btn:disabled");
  const busy = declarations('.btn[aria-busy="true"]:disabled');
  const rootVariables = declarations(":root");
  const resolveColor = (value: string) => {
    const variable = value.match(/^var\((--[^)]+)\)$/)?.[1];
    return variable ? rootVariables.get(variable) ?? "" : value;
  };

  assert.ok(
    contrastRatio(
      resolveColor(button.get("color") ?? ""),
      resolveColor(button.get("background") ?? ""),
    ) >= 4.5,
    "primary button text/background contrast must be at least 4.5:1",
  );
  assert.ok(
    contrastRatio(
      resolveColor(buttonHover.get("color") ?? ""),
      resolveColor(buttonHover.get("background") ?? ""),
    ) >= 4.5,
    "hovered primary button contrast must remain at least 4.5:1",
  );
  assert.equal(disabled.get("cursor"), "not-allowed");
  assert.equal(busy.get("cursor"), "wait");
});
