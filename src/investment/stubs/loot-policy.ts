import { equipSlotIds } from "../../content/inventory";
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

// Tier weights for a drop (41375 tiers: 2 common, 3 rare, 4 legendary, 5
// exotic): mostly greens and blues, a legendary now and then, an exotic
// rarely. Tiers not listed (basic, currency) never drop.
const TIER_WEIGHTS: ReadonlyMap<number, number> = new Map([
  [2, 60],
  [3, 30],
  [4, 9],
  [5, 1],
]);

// The equip slots a kill drops for: the three weapons and the five armour
// pieces. Not emblems, shaders, ships, ghosts or bounties.
function dropsForSlot(equipSlot: number | null): boolean {
  if (equipSlot === null) {
    return false;
  }
  const slots = equipSlotIds();
  return [
    slots.primary,
    slots.special,
    slots.heavy,
    slots.helmet,
    slots.gauntlets,
    slots.chest,
    slots.legs,
    slots.classItem,
  ].includes(equipSlot);
}

// Pool: every instanced vendor offer with a real bag bucket that is a weapon
// or an armour piece of a dropping tier, deduped by def index.
export function lootPoolDefs(): readonly number[] {
  if (!lootPool) {
    const seen = new Set<number>();
    for (const vendor of vendorDefs()) {
      for (const purchase of vendor.purchases) {
        const def = itemDef(purchase.itemDef);
        if (
          def?.instanced &&
          bucketBagStarts()[def.bucket] !== undefined &&
          dropsForSlot(def.equipSlot) &&
          TIER_WEIGHTS.has(def.tier)
        ) {
          seen.add(purchase.itemDef);
        }
      }
    }
    lootPool = [...seen];
  }
  return lootPool;
}

// One drop for a character of `classIndex` (undefined: any class): the pool
// narrowed to gear that class can equip, a tier picked by TIER_WEIGHTS among
// the tiers that have any, then a def from that tier.
export function pickLootDef(
  classIndex: number | undefined,
  random: () => number = Math.random
): number | undefined {
  const byTier = new Map<number, number[]>();
  for (const defIndex of lootPoolDefs()) {
    const def = itemDef(defIndex);
    if (
      !def ||
      (classIndex !== undefined &&
        def.classIndex !== -1 &&
        def.classIndex !== classIndex)
    ) {
      continue;
    }
    const tier = byTier.get(def.tier) ?? [];
    tier.push(defIndex);
    byTier.set(def.tier, tier);
  }
  const tiers = [...byTier.keys()];
  const total = tiers.reduce((sum, t) => sum + (TIER_WEIGHTS.get(t) ?? 0), 0);
  if (total === 0) {
    return;
  }
  let roll = random() * total;
  for (const tier of tiers) {
    roll -= TIER_WEIGHTS.get(tier) ?? 0;
    if (roll < 0) {
      const defs = byTier.get(tier) ?? [];
      return defs[Math.floor(random() * defs.length)];
    }
  }
  const last = byTier.get(tiers.at(-1) ?? -1) ?? [];
  return last.at(-1);
}
