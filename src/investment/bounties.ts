// Bounty progress and rewards (content/bounties.ts says what a bounty is).
// The progress is kept as the active bounty's talent XP. At its target the
// active bounty leaves the bag and its completed one goes in; turning that in
// (a Bounty Tracker purchase that costs it) grants its contents.

import { bountyProgression } from "../content/bounties";
import { itemDef } from "../content/items";
import type { CharacterRecord, CharacterStore } from "./character-store";
import { bagBucketFor } from "./inventory-layout";
import type { LoadoutItem, LoadoutSeed } from "./loadout";

// The live build's reward items (what a bounty's contents name) and the
// progression each raises; Experience raises the level. Progression names
// (fnv1): 116 faction_cryptarch, 117 faction_event_iron_banner, 118
// faction_event_queen, 119 faction_fotc_vanguard, 120 faction_pvp.
const EXPERIENCE_ITEM = 844;
const REPUTATION_ITEMS: ReadonlyMap<number, number> = new Map([
  [840, 116], // Cryptarch Reputation
  [841, 117], // Iron Banner Reputation
  [842, 120], // Crucible Reputation
  [843, 118], // Queen's Favor
  [848, 119], // Vanguard Reputation
]);

export interface BountyAdvance {
  // Active bounties whose progress moved (their item objects change).
  changed: bigint[];
  // Completed this time: the active bounty's soid went, the completed one
  // came in as a stack.
  completed: { defIndex: number; removed: bigint }[];
}

// Add `amount` progress to each of `bounties` (active bounty items). One that
// reaches its target is swapped for its completed bounty.
export async function advanceBounties(
  store: CharacterStore,
  character: CharacterRecord,
  bounties: readonly LoadoutItem[],
  amount: number
): Promise<BountyAdvance> {
  const result: BountyAdvance = { changed: [], completed: [] };
  for (const item of bounties) {
    const progression = bountyProgression(item.defIndex);
    if (!progression || amount <= 0) {
      continue;
    }
    const progress = Math.min(progression.target, item.talentXp + amount);
    if (progress < progression.target) {
      item.talentXp = progress;
      await store.setItemTalentXp?.(item.soid, progress);
      result.changed.push(item.soid);
      continue;
    }
    await store.removeItem(item.soid);
    character.loadout.removeItem(item.soid);
    await addStack(store, character, progression.completedDef, 1);
    result.completed.push({ defIndex: item.defIndex, removed: item.soid });
  }
  return result;
}

// The character's active bounties.
export function activeBounties(character: CharacterRecord): LoadoutItem[] {
  return character.loadout.items.filter(
    (item) => bountyProgression(item.defIndex) !== undefined
  );
}

async function addStack(
  store: CharacterStore,
  character: CharacterRecord,
  defIndex: number,
  quantity: number
): Promise<void> {
  const def = itemDef(defIndex);
  if (!def) {
    return;
  }
  const bucket = bagBucketFor(def.bucket);
  const existing = character.loadout.stackAt(defIndex, bucket);
  if (existing) {
    existing.quantity += quantity;
    await store.setItemQuantity(existing.soid, existing.quantity);
    return;
  }
  const seed: LoadoutSeed = {
    defIndex,
    bucket,
    equipSlot: null,
    instanced: false,
    quantity,
    artArrangement: def.artArrangement,
    sandboxPattern: def.sandboxPattern,
    power: 0,
  };
  character.loadout.addItem(await store.addItem(character.soid, seed));
}

export interface BountyRewards {
  // Level XP.
  experience: number;
  // Progression index -> XP.
  reputation: Map<number, number>;
}

// What a completed bounty's contents grant.
export function bountyRewards(completedDef: number): BountyRewards {
  const rewards: BountyRewards = { experience: 0, reputation: new Map() };
  for (const { count, item } of itemDef(completedDef)?.contents ?? []) {
    if (item === EXPERIENCE_ITEM) {
      rewards.experience += count;
      continue;
    }
    const progression = REPUTATION_ITEMS.get(item);
    if (progression !== undefined) {
      rewards.reputation.set(
        progression,
        (rewards.reputation.get(progression) ?? 0) + count
      );
    }
  }
  return rewards;
}
