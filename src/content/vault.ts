// The Vault. In 41375 it is a vendor with no wares (row 27) whose bucket pairs
// name the account bucket each character bucket's items are kept in: 22 for
// armour (7..11), 23 for general (materials, consumables, ship, sparrow,
// ghost, emblem, shader) and 24 for weapons (2..4). Its row index is the first
// byte of the transfer request (405).
import { accountBuckets, type InventoryBucket } from "./inventory";
import { vendorDefs } from "./vendors";

interface VaultVendor {
  // Character bucket -> account bucket.
  buckets: ReadonlyMap<number, number>;
  vendorIndex: number;
}

let vault: VaultVendor | null | undefined;

// The first vendor whose bucket pairs point into the account's bag.
export function vaultVendor(): VaultVendor | undefined {
  if (vault === undefined) {
    vault = null;
    const account = new Set(accountBuckets().map((bucket) => bucket.id));
    const vendors = vendorDefs();
    for (let index = 0; index < vendors.length; index++) {
      const pairs = (vendors[index]?.bucketMap ?? []).filter((pair) =>
        account.has(pair.target)
      );
      if (pairs.length > 0) {
        vault = {
          vendorIndex: index,
          buckets: new Map(pairs.map((pair) => [pair.bucket, pair.target])),
        };
        break;
      }
    }
  }
  return vault ?? undefined;
}

// The account bucket a character bucket's items go to, undefined when the
// vault takes none.
export function vaultBucketFor(bucket: number): number | undefined {
  return vaultVendor()?.buckets.get(bucket);
}

// An account bucket's row (bag range), undefined for any other id.
export function accountBucket(id: number): InventoryBucket | undefined {
  return accountBuckets().find((bucket) => bucket.id === id);
}
