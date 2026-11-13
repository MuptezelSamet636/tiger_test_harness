// node scripts/dump-talent-grid.mjs <item def index> [out file]
//   Writes an item's talent grid as the server reads it: every node (auto,
//   binary pair, prerequisites) and every step (level, required node, perks,
//   stats, links with all their fields). Run from the repo root after
//   `npm run build`; the server may keep running.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import dotenv from "dotenv";

dotenv.config({ quiet: true });
const require = createRequire(import.meta.url);
const { itemDef } = require("../dist/content/items.js");
const { talentGrid } = require("../dist/content/talent-grids.js");

const defIndex = Number(process.argv[2]);
const out = process.argv[3] ?? `talent-grid-${defIndex}.txt`;
const def = itemDef(defIndex);
if (!def || def.gridIndex == null) {
  console.error(`item def ${defIndex} has no talent grid`);
  process.exit(1);
}
const grid = talentGrid(def.gridIndex);
const hex = (n) => (n >>> 0).toString(16);
const lines = [
  `def ${defIndex} grid ${def.gridIndex} progression ${grid.progression} nodes ${grid.nodes.length}`,
];
for (const node of grid.nodes) {
  lines.push(
    `node ${node.index} hash ${hex(node.nameHash)} auto ${node.autoGranted} ` +
      `binary ${hex(node.binaryPairHash)} prereq [${node.prerequisiteNodes.join(",")}]`
  );
  node.steps.forEach((step, i) => {
    const links = (step.links ?? []).map(
      (l) =>
        `{hash ${hex(l.nameHash)} target ${l.target} node ${l.node} step ${l.step} ` +
        `index ${l.index} ability ${l.ability} word ${hex(l.word ?? 0)}}`
    );
    const stats = (step.stats ?? []).map(
      (s) => `${s.key}:${s.value}x${s.minimumScale}-${s.maximumScale}r${s.randomSlot}`
    );
    lines.push(
      `  step ${i} level ${step.levelRequirement} requires ${hex(step.requiredNodeHash)} ` +
        `perks [${(step.perks ?? []).join(",")}] stats [${stats.join(" ")}] links ${links.join(" ")}`
    );
  });
}
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`wrote ${out} (${grid.nodes.length} nodes)`);
