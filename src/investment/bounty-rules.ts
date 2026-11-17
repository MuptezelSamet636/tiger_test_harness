// What counts toward each bounty. The rules were the server's and are not on
// the disc, so these are ours, written from each bounty's description, for
// the live build's bounty defs (content/bounties.ts) and the events the
// harness sees: kills, deaths, finished activities, XP and gathered
// materials. A bounty with no rule here does not move: the ones that need
// how a kill was made (precision, melee, grenade, super, damage type, weapon,
// enemy race or rank) wait for the kill report to be decoded, and the
// Crucible's PvP ones for the Crucible.

import { type LiveActivityKind, liveActivityKind } from "../content/live-activity-kinds";

// The grantXp reason of a turned-in bounty's XP, which counts for no bounty.
export const BOUNTY_REWARD_REASON = "bounty turned in";

export type BountyEvent =
  // An enemy killed by the character.
  | { kind: "kill" }
  // The character died.
  | { kind: "death" }
  // The character's activity finished; `died` if it died in it.
  | { activityIndex: number; died: boolean; kind: "complete" }
  // Level XP earned (kills, completions; not a bounty's own reward).
  | { amount: number; kind: "xp" }
  // A material picked up (gather_material).
  | { kind: "gather" };

type Rule =
  // Each kill counts, in a destination if one is named. resetOnDeath: a
  // death puts the progress back to 0 ("without dying").
  | { destination?: string; on: "kill"; resetOnDeath?: boolean }
  // Each finished activity of these types (and name, destination, tier,
  // level) counts. noDeath: only if the character did not die in it.
  | {
      destination?: string;
      minLevel?: number;
      minTier?: number;
      name?: string;
      noDeath?: boolean;
      on: "complete";
      types: readonly string[];
    }
  // Each point of XP counts, in activities of a tier if one is named.
  | { minTier?: number; on: "xp"; resetOnDeath?: boolean }
  // Each gathered material counts, in a destination if one is named.
  | { destination?: string; on: "gather" };

const STRIKES = ["strike", "heroic-strike", "nightfall"];
const MISSIONS = ["story", "story-heroic", "weekly-heroic"];
const CRUCIBLE = ["crucible"];

// A mission or strike by name, at a tier or above.
const target = (name: string, types: readonly string[], minTier?: number) =>
  ({ minTier, name, on: "complete", types }) as const;

// Live bounty def -> its rule.
const RULES: ReadonlyMap<number, Rule> = new Map<number, Rule>([
  // Crucible: matches, not kills of other Guardians.
  [570, { on: "complete", types: CRUCIBLE }], // Forged in Fire: win 3
  [579, { on: "complete", types: CRUCIBLE }], // Dominion: 5 Control
  [580, { on: "complete", types: CRUCIBLE }], // Reclamation: 5 Salvage
  [581, { on: "complete", types: CRUCIBLE }], // Stay Golden: 5 Rumble
  [582, { on: "complete", types: CRUCIBLE }], // Death or Glory: 5 Clash
  [583, { on: "complete", types: CRUCIBLE }], // All For One: 5 Skirmish
  // Vanguard.
  [648, target("The Devils' Lair", STRIKES)], // TARGET: Sepiks Prime
  [649, target("Winter's Run", STRIKES)], // TARGET: Aksor
  [650, target("Cerberus Vae III", STRIKES)], // TARGET: Valus Ta'aurc
  [651, target("The Summoning Pits", STRIKES)], // TARGET: Phogoth
  [652, target("The Nexus", STRIKES)], // TARGET: Sekrion
  [653, { noDeath: true, on: "complete", types: STRIKES }], // Walking Tall
  [654, { destination: "cosmodrome", on: "gather" }], // Relic Harvest
  [655, { destination: "moon", on: "gather" }],
  [656, { destination: "venus", on: "gather" }],
  [657, { destination: "mars", on: "gather" }],
  [664, { minTier: 3, on: "xp" }], // Battle Scars: 20000 XP at Tier 3
  [666, { on: "kill", resetOnDeath: true }], // Body Dropper: 100, no dying
  [668, { on: "xp", resetOnDeath: true }], // Unstoppable: 9000 XP, no dying
  [669, target("The Sword of Crota", MISSIONS, 2)], // TARGET: Banuk
  [672, { minTier: 2, on: "complete", types: STRIKES }], // Tier 2 Strike
  [673, { minTier: 3, on: "complete", types: STRIKES }], // Tier 3 Strike
  [674, target("Shrine of Oryx", MISSIONS, 2)], // TARGET: Sardok
  [675, target("Eye of a Gate Lord", MISSIONS, 2)], // TARGET: Zydron
  [676, target("The Garden's Spire", MISSIONS, 2)], // TARGET: Primus
  [677, target("The Sword of Crota", MISSIONS, 2)], // TARGET: Merok
  [678, target("Chamber of Night", MISSIONS, 2)], // TARGET: Telthor
  [679, target("Shrine of Oryx", MISSIONS, 2)], // TARGET: Frigoris
  [680, target("Ishtar Collective", MISSIONS, 2)], // Corrective Mind
  [681, target("The Archive", MISSIONS, 2)], // TARGET: Grayliks
  [682, target("The Archive", MISSIONS, 2)], // TARGET: Simiks-3
  [683, target("The Buried City", MISSIONS, 2)], // TARGET: Bracus
  [684, target("A Rising Tide", MISSIONS, 2)], // Prohibitive Mind
  [685, target("The Black Garden", MISSIONS, 2)], // Divisive Mind
  // Exotic weapon bounties that are activities.
  [1422, target("The Summoning Pits", STRIKES, 2)], // A Light in the Dark
  [1441, { minTier: 2, on: "complete", types: STRIKES }], // Toland's Legacy
  [1451, { on: "complete", types: CRUCIBLE }], // An Unknown Patron: win 5
  [1460, { noDeath: true, on: "complete", types: STRIKES }], // Ikora I
  [1464, { on: "complete", types: ["nightfall"] }], // Ikora III
  // Reef.
  [1510, { on: "gather" }], // Relic Harvest - Fallen: Ether, any planet
  [1514, target("Scourge of Winter", MISSIONS)], // Draksis
  [1515, target("The Devils' Lair", [...STRIKES, ...MISSIONS])], // Sepiks
  [2533, { minLevel: 26, noDeath: true, on: "complete", types: STRIKES }],
  [2534, target("The Seeding", MISSIONS)], // TARGET: Omnigul
  [2535, target("The Veil Lifted", MISSIONS)], // TARGET: Velnok
  [2536, target("Now Come Salvation", MISSIONS)], // The White Witch
  [2796, { minLevel: 28, noDeath: true, on: "complete", types: STRIKES }],
  [2797, target("Gone to Ground", MISSIONS)],
  [2798, target("Wolves' Harvest", MISSIONS)],
  [2799, target("The Citadel", MISSIONS)],
]);

// D1's difficulty tiers by activity type and level: Tier 1 the story and the
// plain strikes, Tier 2 the heroic missions and the level 18-22 strikes, Tier
// 3 the weekly heroics, the Nightfall, raids and the level 24+ strikes.
export function activityTier(kind: LiveActivityKind): number {
  switch (kind.type) {
    case "story-heroic":
      return 2;
    case "heroic-strike":
      return kind.level >= 24 ? 3 : 2;
    case "weekly-heroic":
    case "nightfall":
    case "raid":
      return 3;
    default:
      return 1;
  }
}

export interface BountyContext {
  // The activity the character is in (its last joined), if any.
  activityIndex?: number;
}

// What an event does to a bounty: progress to add, "reset" to put it back to
// 0, or nothing.
export function bountyEffect(
  defIndex: number,
  event: BountyEvent,
  context: BountyContext
): number | "reset" | undefined {
  const rule = RULES.get(defIndex);
  if (!rule) {
    return;
  }
  const here =
    context.activityIndex === undefined
      ? undefined
      : liveActivityKind(context.activityIndex);
  if (event.kind === "death") {
    return (rule.on === "kill" || rule.on === "xp") && rule.resetOnDeath
      ? "reset"
      : undefined;
  }
  if (event.kind === "kill" && rule.on === "kill") {
    return !rule.destination || here?.destination === rule.destination
      ? 1
      : undefined;
  }
  if (event.kind === "gather" && rule.on === "gather") {
    return !rule.destination || here?.destination === rule.destination
      ? 1
      : undefined;
  }
  if (event.kind === "xp" && rule.on === "xp") {
    if (rule.minTier !== undefined && !(here && activityTier(here) >= rule.minTier)) {
      return;
    }
    return event.amount;
  }
  if (event.kind === "complete" && rule.on === "complete") {
    const done = liveActivityKind(event.activityIndex);
    if (
      !done ||
      !rule.types.includes(done.type) ||
      (rule.name !== undefined && !done.name.endsWith(rule.name)) ||
      (rule.destination !== undefined &&
        done.destination !== rule.destination) ||
      (rule.minTier !== undefined && activityTier(done) < rule.minTier) ||
      (rule.minLevel !== undefined && done.level < rule.minLevel) ||
      (rule.noDeath && event.died)
    ) {
      return;
    }
    return 1;
  }
  return;
}
