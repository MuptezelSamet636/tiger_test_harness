import { loadWebTigerEnv } from "../../env";

// The XP the server grants. The real server's numbers aren't on the disc;
// these are stand-ins in the range the launch game paid (tens of XP a kill,
// a couple of thousand for a story mission). Override in .env:
//   TIGER_KILL_XP=25
//   TIGER_ACTIVITY_COMPLETE_XP=1500
//   TIGER_GEAR_XP_MULTIPLIER=1   (equipped gear gets XP x this)
// 0 turns that grant off.
const DEFAULT_KILL_XP = 25;
const DEFAULT_ACTIVITY_COMPLETE_XP = 1500;

function xpSetting(name: string, fallback: number): number {
  loadWebTigerEnv();
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

let killXpValue: number | undefined;
let activityCompleteXpValue: number | undefined;

export function killXp(): number {
  killXpValue ??= xpSetting("TIGER_KILL_XP", DEFAULT_KILL_XP);
  return killXpValue;
}

export function activityCompleteXp(): number {
  activityCompleteXpValue ??= xpSetting(
    "TIGER_ACTIVITY_COMPLETE_XP",
    DEFAULT_ACTIVITY_COMPLETE_XP
  );
  return activityCompleteXpValue;
}

let gearXpMultiplierValue: number | undefined;

// What equipped gear gets per point of character XP (1 = the same, as in the
// game). Raise it to level trees faster.
export function gearXpMultiplier(): number {
  gearXpMultiplierValue ??= xpSetting("TIGER_GEAR_XP_MULTIPLIER", 1);
  return gearXpMultiplierValue;
}
