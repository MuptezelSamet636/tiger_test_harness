// Engrams. An engram the Cryptarch decodes (and every engram he sells for
// glimmer) is a decode item: its action is "decrypt", runs on acquire and
// consumes the item, and hands a reward resolver row the gear it becomes.
// The world engrams (instanced, no action) are what a decode at the
// Cryptarch costs. The resolver's rows are not read yet, so the server picks
// the gear itself: one of the loot pool's (vendor-offered) defs in the decode
// item's own bucket - each family of five decode items names the gear slot
// it decodes into (gauntlets, chest, class item, helmet, legs, heavy,
// primary, special) - of a tier the engram's tier gives.

import { itemDef } from "../content/items";
import type { ItemDef } from "../content/model/investment";
import { lootPoolDefs } from "./stubs/loot-policy";

// fnv1("decrypt"): the decode items' action kind.
export const DECRYPT_ACTION_HASH = 0xc4_b6_72_20;

// Live build tiers (def tier): 1 basic, 2 common, 3 rare, 4 legendary,
// 5 exotic. A decode item carries its engram's tier: Encoded 1, Encrypted 2,
// Decoherent 3, Legendary 4, Exotic 5. Our stand-in for the resolver: the
// tier the gear comes out at, and the chance it comes out a tier higher.
const DECODE_TIERS: ReadonlyMap<number, { tier: number; upgrade: number }> =
  new Map([
    [1, { tier: 2, upgrade: 0.1 }],
    [2, { tier: 3, upgrade: 0.1 }],
    [3, { tier: 3, upgrade: 0.25 }],
    [4, { tier: 4, upgrade: 0.05 }],
    [5, { tier: 5, upgrade: 0 }],
  ]);

const HIGHEST_TIER = 5;

// A def decodes when acquired: its action is a consumed decrypt that runs on
// acquire.
export function isDecodeItem(def: ItemDef | undefined): boolean {
  const action = def?.action;
  return (
    action !== undefined &&
    action.typeHash === DECRYPT_ACTION_HASH &&
    action.onAcquire &&
    action.consumed
  );
}

// The gear a decode item becomes for a character of `classIndex`: a loot
// pool def in the decode item's bucket that the class can equip, at the
// engram's decode tier (one higher on an upgrade roll), else the nearest
// lower tier the bucket has. Undefined when the bucket has none.
export function pickDecodedDef(
  decodeDefIndex: number,
  classIndex: number,
  random: () => number = Math.random
): number | undefined {
  const decode = itemDef(decodeDefIndex);
  if (!(decode && isDecodeItem(decode))) {
    return;
  }
  const rule = DECODE_TIERS.get(decode.tier) ?? { tier: 2, upgrade: 0 };
  const wanted = Math.min(
    HIGHEST_TIER,
    rule.tier + (random() < rule.upgrade ? 1 : 0)
  );
  const byTier = new Map<number, number[]>();
  for (const defIndex of lootPoolDefs()) {
    const def = itemDef(defIndex);
    if (
      !def ||
      def.bucket !== decode.bucket ||
      (def.classIndex !== -1 && def.classIndex !== classIndex)
    ) {
      continue;
    }
    const list = byTier.get(def.tier) ?? [];
    list.push(defIndex);
    byTier.set(def.tier, list);
  }
  for (let tier = wanted; tier >= 1; tier--) {
    const defs = byTier.get(tier);
    if (defs && defs.length > 0) {
      return defs[Math.floor(random() * defs.length)];
    }
  }
  return;
}
