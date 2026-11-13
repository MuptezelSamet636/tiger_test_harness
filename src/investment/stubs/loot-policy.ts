import { itemDef } from "../../content/items";
import { vendorDefs } from "../../content/vendors";
import { loadWebTigerEnv } from "../../env";
import { bucketBagStarts } from "../inventory-layout";

// Drop config: every eligible kill rolls a chance, then picks one def
// uniformly from the pool. Kept as one small object so tuning doesn't touch
// the roll logic.
interface LootDropConfig {
  // Replaces the value-proportional stand-in below with a fixed chance when
  // set.
  readonly chanceOverride?: number;
  readonly quantity: number;
}

// TIGER_LOOT_DROP_CHANCE (0..1) in .env: the chance a kill drops loot. The
// harness has no reward row value per combatant yet, so kills go through this
// fixed chance; unset gives DEFAULT_LOOT_DROP_CHANCE.
const DEFAULT_LOOT_DROP_CHANCE = 0.1;

function lootDropChance(): number {
  loadWebTigerEnv();
  const raw = process.env.TIGER_LOOT_DROP_CHANCE?.trim();
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_LOOT_DROP_CHANCE;
}

export const LOOT_DROP_CONFIG: LootDropConfig = {
  chanceOverride: lootDropChance(),
  quantity: 1,
};

// The true per-kill drop chance is server data the disc doesn't ship. This
// stand-in is the reward row's value over 1000, clamped to [0,1] - about 5%
// for a dreg, 100% for a strike boss. chanceOverride replaces it outright.
export function dropChanceForValue(value: number): number {
  if (LOOT_DROP_CONFIG.chanceOverride !== undefined) {
    return LOOT_DROP_CONFIG.chanceOverride;
  }
  return Math.min(1, Math.max(0, value / 1000));
}

let lootPool: readonly number[] | undefined;

// Pool: every instanced vendor offer with a real bag bucket, deduped by def
// index.
export function lootPoolDefs(): readonly number[] {
  if (!lootPool) {
    const seen = new Set<number>();
    for (const vendor of vendorDefs()) {
      for (const purchase of vendor.purchases) {
        const def = itemDef(purchase.itemDef);
        if (def?.instanced && bucketBagStarts()[def.bucket] !== undefined) {
          seen.add(purchase.itemDef);
        }
      }
    }
    lootPool = [...seen];
  }
  return lootPool;
}
