// Run after the production build: node --test apps/web/scripts/verify-tailwind-css.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssDir = join(web, ".next/static/css");
const css = postcss.parse(readdirSync(cssDir).filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(join(cssDir, name), "utf8")).join("\n"));
const declarations = (selector, property) => {
  const values = [];
  css.walkRules((rule) => {
    if (rule.selector.split(",").includes(selector)) {
      rule.walkDecls(property, (decl) => values.push(decl.value));
    }
  });
  return values;
};

// These classes occur in real components; jsdom component tests alone cannot prove their CSS exists.
test("the production CSS retains semantic colors and the three token radii", () => {
  for (const [selector, property, expected] of [
    [".bg-background", "background-color", /var\(--background\)/],
    [".text-primary", "color", /var\(--primary\)/],
    [".text-foreground", "color", /var\(--foreground\)/],
    [".bg-danger-bg", "background-color", /(?:254\s+226\s+226|#fee2e2)/i],
    [".border-warning-border", "border-color", /(?:253\s+186\s+116|#fdba74)/i],
    [".bg-quality-inferredBg", "background-color", /(?:241\s+245\s+249|#f1f5f9)/i],
    [".rounded-lg", "border-radius", /^8px$/],
    [".rounded-xl", "border-radius", /^12px$/],
    [".rounded-2xl", "border-radius", /^16px$/],
  ]) {
    assert.ok(declarations(selector, property).some((value) => expected.test(value)), `${selector} ${property} missing or altered: ${declarations(selector, property)}`);
  }
});

test("the web uses Tailwind 4", () => {
  const manifest = JSON.parse(readFileSync(join(web, "package.json"), "utf8"));
  assert.match(manifest.devDependencies.tailwindcss, /^\^?4\./);
});

test("Tailwind 4 no longer brings braces; remaining paths stay visible to audit", () => {
  const root = join(web, "../..");
  const graph = JSON.parse(execFileSync("npm", ["ls", "braces", "--all", "--json"],
    { cwd: root, encoding: "utf8" }));
  assert.doesNotMatch(JSON.stringify(graph), /"tailwindcss"\s*:/,
    "Tailwind still pulls braces; this is not the intended partial mitigation");
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  assert.ok(Object.keys(lock.packages).some((path) => /(^|\/)node_modules\/braces$/.test(path)),
    "When upstream removes braces, update the risk acceptance instead of silently keeping it");
});
