// Dismantling (inventory_perform_item_action, nid 402): the client sends it
// when the player holds dismantle on an unequipped piece of gear. The item
// leaves the bag and the character gets glimmer for it.
//
// The real rewards (glimmer plus weapon parts / armour materials, by the
// item's own dismantle action) aren't read from the packages yet, so the
// glimmer here is a stand-in by tier.
import { itemDef } from "../content/items";
import type { CharacterRecord, CharacterStore } from "./character-store";
import { bagBucketFor } from "./inventory-layout";
import type { CharacterLoadout, LoadoutItem, LoadoutSeed } from "./loadout";
import { starterCurrencyDef } from "./stubs/starting-currency";

// 41375 tiers: 2 common, 3 rare, 4 legendary, 5 exotic.
const DISMANTLE_GLIMMER_BY_TIER: ReadonlyMap<number, number> = new Map([
  [2, 25],
  [3, 75],
  [4, 200],
  [5, 500],
]);

export interface DismantlePlan {
  glimmer: number;
  target: LoadoutItem;
}

// Only an instanced item in the bag (not equipped) dismantles.
export function planDismantle(
  loadout: CharacterLoadout,
  soid: bigint
): DismantlePlan | undefined {
  const target = loadout.item(soid);
  if (!target?.instanced || target.equipSlot !== null) {
    return;
  }
  const tier = itemDef(target.defIndex)?.tier ?? -1;
  return { target, glimmer: DISMANTLE_GLIMMER_BY_TIER.get(tier) ?? 0 };
}

// Removes the item and credits the glimmer. Returns the removed item's soid
// (for the wire deletion).
export async function applyDismantle(
  store: CharacterStore,
  character: CharacterRecord,
  plan: DismantlePlan
): Promise<bigint> {
  const { loadout } = character;
  const { target } = plan;
  await store.removeItem(target.soid);
  loadout.removeItem(target.soid);

  const glimmerDef = starterCurrencyDef();
  if (glimmerDef !== undefined && plan.glimmer > 0) {
    const bucket = bagBucketFor(itemDef(glimmerDef)?.bucket ?? 0);
    const stack = loadout.stackAt(glimmerDef, bucket);
    if (stack) {
      stack.quantity += plan.glimmer;
      await store.setItemQuantity(stack.soid, stack.quantity);
    } else {
      const seed: LoadoutSeed = {
        defIndex: glimmerDef,
        bucket,
        equipSlot: null,
        instanced: false,
        quantity: plan.glimmer,
        artArrangement: 0,
        sandboxPattern: 0,
        power: 0,
      };
      loadout.addItem(await store.addItem(character.soid, seed));
    }
  }
  return target.soid;
}
