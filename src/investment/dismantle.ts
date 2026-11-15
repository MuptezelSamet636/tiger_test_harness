// Dismantling (inventory_perform_item_action, nid 402): the client sends it
// when the player holds dismantle on an unequipped piece of gear. The item
// leaves the bag and the character gets glimmer and materials for it.
//
// What a dismantle gives was decided by Bungie's servers: the item's action
// block names an index (+0x28) that is not a material set, and no yield table
// is in the packages. So the amounts here are the harness's own, by tier:
// weapons give Weapon Parts, armour its class's material (the one its talent
// steps cost: Plasteel Plating for titans, Sapphire Wire for hunters,
// Hadronic Essence for warlocks), exotic armour an Exotic Armor Shard too.
import { equipSlotIds, weaponBuckets } from "../content/inventory";
import { itemDef, itemDefs, itemName } from "../content/items";
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

// Weapon Parts / class armour material per dismantle, by tier.
const DISMANTLE_MATERIAL_BY_TIER: ReadonlyMap<number, number> = new Map([
  [3, 1],
  [4, 2],
  [5, 3],
]);

const WEAPON_PARTS = "Weapon Parts";
const EXOTIC_SHARD = "Exotic Armor Shard";
// By wire class index: 0 titan, 1 hunter, 2 warlock.
const ARMOR_MATERIALS = ["Plasteel Plating", "Sapphire Wire", "Hadronic Essence"];

const stackDefs = new Map<string, number | undefined>();

// The stack (non-instanced) def with this English name, undefined if the
// build has none.
function stackDefNamed(name: string): number | undefined {
  if (!stackDefs.has(name)) {
    const index = itemDefs().findIndex(
      (def, i) => def && !def.instanced && itemName(i) === name
    );
    stackDefs.set(name, index < 0 ? undefined : index);
  }
  return stackDefs.get(name);
}

function armorSlots(): ReadonlySet<number> {
  const ids = equipSlotIds();
  return new Set([ids.helmet, ids.gauntlets, ids.chest, ids.legs, ids.classItem]);
}

export interface DismantleMaterial {
  defIndex: number;
  quantity: number;
}

export interface DismantlePlan {
  glimmer: number;
  materials: DismantleMaterial[];
  target: LoadoutItem;
}

function dismantleMaterials(
  target: LoadoutItem,
  characterClass: number
): DismantleMaterial[] {
  const def = itemDef(target.defIndex);
  const amount = DISMANTLE_MATERIAL_BY_TIER.get(def?.tier ?? -1) ?? 0;
  if (!def || amount === 0) {
    return [];
  }
  const names: [string | undefined, number][] = [];
  if (weaponBuckets().has(def.bucket)) {
    names.push([WEAPON_PARTS, amount]);
  } else if (def.equipSlot !== null && armorSlots().has(def.equipSlot)) {
    const armorClass = def.classIndex >= 0 ? def.classIndex : characterClass;
    names.push([ARMOR_MATERIALS[armorClass], amount]);
    if (def.tier === 5) {
      names.push([EXOTIC_SHARD, 1]);
    }
  }
  return names.flatMap(([name, quantity]) => {
    const defIndex = name === undefined ? undefined : stackDefNamed(name);
    return defIndex === undefined ? [] : [{ defIndex, quantity }];
  });
}

// Only an instanced item in the bag (not equipped) dismantles.
export function planDismantle(
  loadout: CharacterLoadout,
  soid: bigint,
  characterClass = -1
): DismantlePlan | undefined {
  const target = loadout.item(soid);
  if (!target?.instanced || target.equipSlot !== null) {
    return;
  }
  const tier = itemDef(target.defIndex)?.tier ?? -1;
  return {
    target,
    glimmer: DISMANTLE_GLIMMER_BY_TIER.get(tier) ?? 0,
    materials: dismantleMaterials(target, characterClass),
  };
}

// Removes the item and credits the glimmer and materials. Returns the removed item's soid
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
  if (glimmerDef !== undefined) {
    await creditStack(store, character, glimmerDef, plan.glimmer);
  }
  for (const material of plan.materials) {
    await creditStack(store, character, material.defIndex, material.quantity);
  }
  return target.soid;
}

// Adds quantity to the character's stack of a def, or starts one.
export async function creditStack(
  store: CharacterStore,
  character: CharacterRecord,
  defIndex: number,
  quantity: number
): Promise<void> {
  if (quantity <= 0) {
    return;
  }
  const { loadout } = character;
  const bucket = bagBucketFor(itemDef(defIndex)?.bucket ?? 0);
  const stack = loadout.stackAt(defIndex, bucket);
  if (stack) {
    stack.quantity += quantity;
    await store.setItemQuantity(stack.soid, stack.quantity);
    return;
  }
  const seed: LoadoutSeed = {
    defIndex,
    bucket,
    equipSlot: null,
    instanced: false,
    quantity,
    artArrangement: 0,
    sandboxPattern: 0,
    power: 0,
  };
  loadout.addItem(await store.addItem(character.soid, seed));
}
