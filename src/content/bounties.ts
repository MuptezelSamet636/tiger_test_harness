// Bounties. A bounty is three items: the active one (instanced, in the
// bounties bucket) that the Bounty Tracker hands out, the completed one its
// action names as its reward item, and the reward item a turn-in "buys" with
// the completed one. The active bounty's progress is a progression of its
// own, with the item's name hash: its one step is the bounty's target
// ("Defeat 25 Hunters" is 25). The client draws the bar from that
// progression's row on the item. What counts toward it was the server's: it
// is not on the disc.
import { itemDef } from "./items";
import { progressionDef } from "./progressions";

// The progression table is far shorter; the scan stops at its end.
const PROGRESSION_SCAN_LIMIT = 4096;

let byName: Map<number, number> | undefined;

function progressionsByName(): Map<number, number> {
  if (!byName) {
    byName = new Map();
    for (let index = 0; index < PROGRESSION_SCAN_LIMIT; index++) {
      const def = progressionDef(index);
      if (!def) {
        break;
      }
      byName.set(def.nameHash >>> 0, index);
    }
  }
  return byName;
}

export interface BountyProgression {
  // The progression's table row, which the item's progression row names.
  index: number;
  // Its last step's XP: the bounty is complete at this progress.
  target: number;
  // The completed bounty the active one becomes.
  completedDef: number;
}

// The progression of an active bounty: an instanced def whose action names a
// reward item and whose name hash a progression shares.
export function bountyProgression(
  defIndex: number
): BountyProgression | undefined {
  const def = itemDef(defIndex);
  const completedDef = def?.action?.rewardItem ?? -1;
  if (!(def?.instanced && def.nameHash !== undefined && completedDef >= 0)) {
    return;
  }
  const index = progressionsByName().get(def.nameHash);
  const steps = index === undefined ? undefined : progressionDef(index)?.steps;
  const target = steps?.at(-1)?.xpRequired;
  if (index === undefined || target === undefined || target <= 0) {
    return;
  }
  return { completedDef, index, target };
}
