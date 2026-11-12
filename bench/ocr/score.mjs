import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { compareStructure } from "./structure.mjs";

const data = new URL("./data/", import.meta.url);
const output = new URL("./results/", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = (await readFile(new URL("manifest.json", data), "utf8")).replaceAll("\r\n", "\n");
const { cases } = JSON.parse(manifest);
const caseMap = new Map(cases.map((item) => [item.id, item]));
for (const fixture of cases) {
  assert.ok(compareStructure(fixture.canonical, fixture.latex, { latex: true }).structural_match, fixture.id);
  assert.equal(sha256(await readFile(new URL(fixture.image, data))), fixture.sha256, fixture.id);
  assert.equal(sha256(await readFile(new URL(fixture.formulaImage, data))), fixture.formulaSha256, fixture.id);
}

function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}

const reports = [];
for (const filename of (await readdir(output)).filter((name) => name.endsWith(".json") && name !== "scored.json").sort()) {
  const run = JSON.parse(await readFile(new URL(filename, output)));
  assert.equal(run.fixture_sha256, sha256(manifest), `${filename} fixture version`);
  const expected = cases.filter((item) => !run.context || item.image !== item.formulaImage);
  assert.deepEqual(run.rows.map(({ id }) => id), expected.map(({ id }) => id), `${filename} case coverage`);
  const rows = run.rows.map((row) => {
    const item = caseMap.get(row.id);
    const target = run.model === "IBEM-im2typst" ? item.canonical : item.latex;
    return {
      ...row,
      expected: target,
      expected_canonical: item.canonical,
      tags: item.tags,
      exact_match: target.trim() === row.text.trim(),
      compact_exact_match: target.replace(/\s+/gu, "") === row.text.replace(/\s+/gu, ""),
      ...compareStructure(item.canonical, row.text, { latex: run.model !== "IBEM-im2typst" }),
      ...(run.context && {
        expected_label: item.label, expected_instruction: item.instruction,
        context_match: item.label === (row.label ?? "") && item.instruction === (row.instruction ?? ""),
      }),
    };
  });
  const successfulWarm = rows.slice(1).filter((row) => !row.error && row.text.trim()).map((row) => row.elapsed_ms);
  const metric = (items) => ({
    n: items.length,
    exact: items.filter((row) => row.exact_match).length,
    compact_exact: items.filter((row) => row.compact_exact_match).length,
    structure: items.filter((row) => row.structural_match).length,
    operator_errors: items.filter((row) => row.operator_error).length,
    structural_errors: items.filter((row) => row.structure_error).length,
    unparsed: items.filter((row) => row.parse_error).length,
    inference_errors: items.filter((row) => row.error).length,
  });
  const categories = [...new Set(rows.flatMap((row) => row.tags))].sort();
  reports.push({
    filename, model: run.model, device: run.device, provider: run.provider ?? null, context: run.context,
    context_mode: run.context_mode ?? null,
    counts: metric(rows),
    tags: Object.fromEntries(categories.map((tag) => [tag, metric(rows.filter((row) => row.tags.includes(tag)))])),
    load_ms: run.load_ms,
    first_ms: rows[0]?.elapsed_ms ?? null,
    warm_median_ms: run.context ? null : quantile(successfulWarm, 0.5),
    warm_p90_ms: run.context ? null : quantile(successfulWarm, 0.9),
    peak_rss_bytes: run.peak_rss_bytes,
    rows,
  });
}

await writeFile(new URL("scored.json", output), JSON.stringify(reports, null, 2) + "\n");
console.table(reports.map(({ rows, tags, counts, ...report }) => ({ ...report, ...counts })));
