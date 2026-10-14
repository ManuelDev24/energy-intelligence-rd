// Ejecuta axe (WCAG 2.0/2.1/2.2 A y AA + buenas prácticas) y mide el desborde horizontal de la página actual.
import fs from "node:fs";
import type { Page } from "@playwright/test";

const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
interface Violation { id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> }

export async function axeProblems(page: Page, name: string): Promise<string[]> {
  await page.evaluate(AXE);
  const result = await page.evaluate(async () => {
    // @ts-expect-error axe lo inyecta la propia prueba
    const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return { violations: res.violations as Violation[], overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  const found = result.violations.map((v) => `${name}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  if (result.overflow > 0) found.push(`${name}: desborde horizontal de ${result.overflow}px`);
  return found;
}
