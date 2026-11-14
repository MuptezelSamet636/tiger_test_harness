// Moving an item between a character's bag and the account's vault (the
// transfer request, 405). Which way it goes follows where the item is: in the
// character's bag it goes to the account bucket the vault vendor pairs with
// its bucket, in the vault it comes back to its def's bucket. Only instanced
// items move; stacks (materials, consumables) stay where they are for now.
import { itemDef } from "../content/items";
import { accountBucket, vaultBucketFor } from "../content/vault";
import { accountVault, setAccountVault, type VaultItem } from "./account-vault";
import type { CharacterRecord, CharacterStore } from "./character-store";
import { bucketSlotCounts } from "./inventory-layout";

export type VaultTransferResult =
  | {
      ok: true;
      direction: "to vault" | "from vault";
      defIndex: number;
      bucket: number;
    }
  | { ok: false; reason: string };

const failed = (reason: string): VaultTransferResult => ({
  ok: false,
  reason,
});

export async function transferItem(
  store: CharacterStore,
  character: CharacterRecord,
  soid: bigint
): Promise<VaultTransferResult> {
  const accountSoid = character.accountSoid;
  const vault = accountVault(accountSoid);

  const inBag = character.loadout.item(soid);
  if (inBag) {
    if (!inBag.instanced) {
      return failed("stack");
    }
    if (inBag.equipSlot !== null) {
      return failed("equipped");
    }
    const target = vaultBucketFor(inBag.bucket);
    const range = target === undefined ? undefined : accountBucket(target);
    if (target === undefined || !range) {
      return failed(`bucket ${inBag.bucket} has no vault bucket`);
    }
    const used = vault.filter((item) => item.vaultBucket === target).length;
    if (used >= range.slotCount) {
      return failed(`vault bucket ${target} full`);
    }
    if (!store.moveItemToVault) {
      return failed("store has no vault");
    }
    await store.moveItemToVault(soid, target);
    character.loadout.removeItem(soid);
    const moved: VaultItem = { ...inBag, equipSlot: null, vaultBucket: target };
    setAccountVault(accountSoid, [...vault, moved]);
    return {
      ok: true,
      direction: "to vault",
      defIndex: inBag.defIndex,
      bucket: target,
    };
  }

  const stored = vault.find((item) => item.soid === soid);
  if (!stored) {
    return failed("not in the bag or the vault");
  }
  const def = itemDef(stored.defIndex);
  if (
    def &&
    def.classIndex !== -1 &&
    def.classIndex !== character.appearance.classIndex
  ) {
    return failed("other class");
  }
  const capacity = bucketSlotCounts()[stored.bucket];
  if (
    capacity === undefined ||
    character.loadout.bucketCount(stored.bucket) >= capacity
  ) {
    return failed(`bag bucket ${stored.bucket} full`);
  }
  if (!store.moveItemFromVault) {
    return failed("store has no vault");
  }
  await store.moveItemFromVault(soid, character.soid);
  const { vaultBucket: _vaultBucket, ...item } = stored;
  character.loadout.addItem({ ...item, equipSlot: null });
  setAccountVault(
    accountSoid,
    vault.filter((entry) => entry.soid !== soid)
  );
  return {
    ok: true,
    direction: "from vault",
    defIndex: stored.defIndex,
    bucket: stored.bucket,
  };
}
