// The inventory buckets and equip slots, read off the disc packages on first
// use. A bucket groups items in the bag; an equip slot is where an equipped
// item sits in the character's gear.
import type { InventoryBucket, InventoryTable } from "./model/investment";
import { contentBuild } from "./versions";

export type { InventoryBucket } from "./model/investment";

// The build's equip slot ids: the equip slot byte of an item def's equipable
// block, also the index into the equipped soid and gear slot arrays. The
// packages order the slots but don't name them.
export function equipSlotIds() {
  return contentBuild().ids.equipSlot;
}

// The build's inventory bucket ids, named by the equip slot their defs use
// (inventory.test.ts checks each against equipSlotToBucket).
export function bucketIds() {
  return contentBuild().ids.bucket;
}

let weapons: ReadonlySet<number> | undefined;

// The buckets weapons are in, one per weapon equip slot.
export function weaponBuckets(): ReadonlySet<number> {
  const { kinetic, energy, power } = bucketIds();
  weapons ??= new Set([kinetic, energy, power]);
  return weapons;
}

let table: InventoryTable | undefined;
let buckets: readonly InventoryBucket[] | undefined;
let slotBuckets: readonly number[] | undefined;

function inventoryTable(): InventoryTable {
  table ??= contentBuild().readers.inventoryTable();
  return table;
}

// The character's bag, in slot order: every bucket row except the other
// scopes'.
export function inventoryBuckets(): readonly InventoryBucket[] {
  if (!buckets) {
    buckets = inventoryTable()
      .rows.filter((row) => !row.otherScope)
      .map(({ id, firstSlot, slotCount }) => ({ id, firstSlot, slotCount }));
  }
  return buckets ?? [];
}

let account: readonly InventoryBucket[] | undefined;

// The account's bag (the other scope's rows): 41375 has 21 (0..19), 22, 23
// and 24 (20 slots each from 20) and 28 (one slot at 80), in a 128-slot bag.
export function accountBuckets(): readonly InventoryBucket[] {
  if (!account) {
    account = inventoryTable()
      .rows.filter((row) => row.otherScope)
      .map(({ id, firstSlot, slotCount }) => ({ id, firstSlot, slotCount }));
  }
  return account ?? [];
}

// The bucket each equip slot's items are in: the bucket rows in order, minus
// the ones with no equip slot.
export function equipSlotToBucket(): readonly number[] {
  if (!slotBuckets) {
    const { rows, unequippable } = inventoryTable();
    slotBuckets = rows
      .map((row) => row.id)
      .filter((id) => !unequippable.includes(id));
  }
  return slotBuckets ?? [];
}
