// Each signed-in account's vault, loaded at login_account
// (CharacterStore.vaultItems) and kept up to date by the transfers
// (investment/vault.ts), so the self primary can be built without a read.
import type { LoadoutItem } from "./loadout";

export interface VaultItem extends LoadoutItem {
  // The account bucket the item is kept in (content/vault.ts).
  vaultBucket: number;
}

const vaults = new Map<bigint, readonly VaultItem[]>();

export function accountVault(accountSoid: bigint): readonly VaultItem[] {
  return vaults.get(accountSoid) ?? [];
}

export function setAccountVault(
  accountSoid: bigint,
  items: readonly VaultItem[]
): void {
  vaults.set(accountSoid, items);
}
