// Runtime debug toggles for the activity host, read from debug-toggles.json in
// the server's working directory at every AH session start and world entry: no
// restart, no env. The file is optional. The page at /debug only shows state;
// this file is the one place that changes it. Example:
//
//   {
//     "startPhase": { "act_cosmo_m0_highway": 2 },
//     "omitScriptRowTypes": [1, 2],
//     "stripNavPoints": true,
//     "actorPlaceBody": "retail",
//     "allowGrantedEquip": true,
//     "grantLevelQuality": "zero"
//   }
//
// The inventory toggles are read by the character store (loadout repair)
// and the self family encoder, on every character read / push.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { activeBuild, e_build } from "../builds";
import { workingDir } from "../env";

export interface DebugToggles {
  // How a placed named actor's auth goes out. "bare" is the place flag alone;
  // "retail" adds what every placement in the 2.3.1 captures carries: [0] = 1
  // and a behaviour of generation 1.
  actorPlaceBody?: "bare" | "retail";
  // Keep non-kit armour / weapons equipped across sign-in. Off, the loadout
  // repair sends any equipped item that is not the class starter kit's back to
  // the bag on read, so a bad equip can never crash-loop sign-in.
  allowGrantedEquip?: boolean;
  // With allowGrantedEquip, keep non-kit armour equipped too. Off, only
  // weapons stay: granted armour crashes the PS4 client at sign-in.
  allowGrantedArmor?: boolean;
  // Fill every gridded item's 8 talent roll bytes (80801846 member 4,
  // 8080405E: per-node step selection read as byte / 255) with this value
  // (0..255) instead of the item's own rolls.
  itemRollByte?: number;
  // Progression index -> XP the self character's progression rows give it
  // (added when the index has no row): reputations (Vanguard is 119,
  // Crucible 120), whose ranks unlock vendor stock.
  progressionXp?: Readonly<Record<string, number>>;
  // What the self primary's account bag carries: "all" (default), "glimmer"
  // (no vault slots), "vault" (no glimmer) or "none". Isolates a crash.
  accountBag?: "all" | "glimmer" | "none" | "vault";
  // Only these vault items (character_item row ids, the item soid's low
  // word) go in the account bag. Isolates a crash to one item.
  vaultInclude?: readonly number[];
  // Every gridded item's talent instance byte (80801846 member 5, +0x4E)
  // instead of its own roll: 0..255, or -1 to send none (as before).
  itemTalentByte?: number;
  // What every item's 80801711 {level, required level, quality} carries
  // instead of the row's own values: "zero" sends 0 / 0 / 0, "def" the def's
  // level block. Isolates the item object from an equip crash.
  grantLevelQuality?: "def" | "zero";
  // Row type ids whose script-written bodies are withheld: applies keep
  // the rows' idle auths and no update goes out for them. 1 squads, 2
  // actors, 4 objects, 5 sequences, 32 player objectives. The binder's
  // lifetime (16) and players (12) are never withheld.
  omitScriptRowTypes?: readonly number[];
  // Send the rowless SensorAuth updates (applies, grants) with their sense
  // rows instead of dropping them (bring-up; rows built from data always keep
  // theirs).
  senseRows?: boolean;
  // Activity name -> the phase index a new instance starts in: that phase's
  // bubble and state (the GAS), the lifetime's phase and its mission's
  // scripts, the way a checkpoint would. act_cosmo_m0_highway: 2 is the
  // breach.
  startPhase?: Readonly<Record<string, number>>;
  // Player objectives go out without their nav point slots.
  stripNavPoints?: boolean;
  // Log every row of each apply (bundle, type, index, auth and sense
  // bodies), to compare one world entry with the next.
  dumpApplyRows?: boolean;
  // A world entry into a bubble this session has been in before spawns its
  // own bundles' placed rows anew: "actors" bumps each placed named actor's
  // incarnation and behaviour generation, "squads" each written squad's epoch
  // and binding generation, "both" both. The Tower plaza's vendors are gone
  // on a return, though the re-entry carries them placed.
  reentryRespawn?: "actors" | "both" | "squads";
  // A swap the client makes without announcing a crossing (no transition
  // token: back over a load zone it came in by) moves the current slice at
  // the state refresh, before the globals go out, as an announced crossing
  // does. Off, the refresh's GAS still names the bubble the client left.
  refreshLandsSlice?: boolean;
  // Every activity's authority promote lists only the bubbles the client
  // holds (the ones it has not abdicated at a swap), as Venus's does, in
  // place of all of them. A bubble left and entered again then comes back
  // into the table, where with all of them listed the table never changes.
  trackedAuthority?: boolean;
}

// What the PS4 live build's Tower runs with unless debug-toggles.json says
// otherwise: the vendors need the retail place body to show at all, and the
// tracked authority table to show again in a bubble entered a second time.
const LIVE_TOWER_DEFAULTS: DebugToggles = {
  actorPlaceBody: "retail",
  trackedAuthority: true,
};

// The toggles an activity runs with: the file's, over the activity's own
// defaults.
export function activityToggles(
  toggles: DebugToggles,
  activityName: string | undefined
): DebugToggles {
  if (
    !activityName?.startsWith("city_tower") ||
    activeBuild() !== e_build.v41375_14_07_03_1501_live
  ) {
    return toggles;
  }
  return { ...LIVE_TOWER_DEFAULTS, ...toggles };
}

interface DebugTogglesRead {
  // What could not be read or was not understood, for the log.
  problems: readonly string[];
  source: "file" | "none" | "test";
  toggles: DebugToggles;
}

const DEBUG_TOGGLES_FILE = "debug-toggles.json";

const NO_TOGGLES: DebugTogglesRead = {
  problems: [],
  source: "none",
  toggles: {},
};

let testToggles: DebugToggles | undefined;
let cached:
  | { mtimeMs: number; path: string; read: DebugTogglesRead }
  | undefined;

function debugTogglesPath(): string {
  return resolve(workingDir(), DEBUG_TOGGLES_FILE);
}

// The toggles as the file has them now. Re-read when the file changes;
// a stat per call otherwise.
export function readDebugToggles(path = debugTogglesPath()): DebugTogglesRead {
  if (testToggles) {
    return { problems: [], source: "test", toggles: testToggles };
  }
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    cached = undefined;
    return NO_TOGGLES;
  }
  if (cached && cached.path === path && cached.mtimeMs === mtimeMs) {
    return cached.read;
  }
  let read: DebugTogglesRead;
  try {
    read = parseDebugToggles(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    read = {
      problems: [
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      ],
      source: "file",
      toggles: {},
    };
  }
  cached = { mtimeMs, path, read };
  return read;
}

// Tests set the toggles directly; undefined goes back to the file.
export function setDebugTogglesForTest(
  toggles: DebugToggles | undefined
): void {
  testToggles = toggles;
}

export function parseDebugToggles(raw: unknown): DebugTogglesRead {
  const problems: string[] = [];
  const toggles: DebugToggles = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { problems: ["not a JSON object"], source: "file", toggles };
  }
  for (const [key, value] of Object.entries(raw)) {
    switch (key) {
      case "actorPlaceBody":
        if (value === "bare" || value === "retail") {
          toggles.actorPlaceBody = value;
        } else {
          problems.push(`${key}: expected "bare" or "retail"`);
        }
        break;
      case "allowGrantedEquip":
        if (typeof value === "boolean") {
          toggles.allowGrantedEquip = value;
        } else {
          problems.push(`${key}: expected true or false`);
        }
        break;
      case "reentryRespawn":
        if (value === "actors" || value === "both" || value === "squads") {
          toggles.reentryRespawn = value;
        } else {
          problems.push(`${key}: expected "actors", "squads" or "both"`);
        }
        break;
      case "trackedAuthority":
        if (typeof value === "boolean") {
          toggles.trackedAuthority = value;
        } else {
          problems.push(`${key}: expected true or false`);
        }
        break;
      case "refreshLandsSlice":
        if (typeof value === "boolean") {
          toggles.refreshLandsSlice = value;
        } else {
          problems.push(`${key}: expected true or false`);
        }
        break;
      case "dumpApplyRows":
        if (typeof value === "boolean") {
          toggles.dumpApplyRows = value;
        } else {
          problems.push(`${key}: expected true or false`);
        }
        break;
      case "allowGrantedArmor":
        if (typeof value === "boolean") {
          toggles.allowGrantedArmor = value;
        } else {
          problems.push(`${key}: expected true or false`);
        }
        break;
      case "grantLevelQuality":
        if (value === "def" || value === "zero") {
          toggles.grantLevelQuality = value;
        } else {
          problems.push(`${key}: expected "def" or "zero"`);
        }
        break;
      case "progressionXp":
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.entries(value).every(
            ([index, xp]) =>
              /^\d+$/.test(index) && Number.isInteger(xp) && (xp as number) >= 0
          )
        ) {
          toggles.progressionXp = value as Record<string, number>;
        } else {
          problems.push(`${key}: expected {"progression index": xp}`);
        }
        break;
      case "accountBag":
        if (
          value === "all" ||
          value === "glimmer" ||
          value === "none" ||
          value === "vault"
        ) {
          toggles.accountBag = value;
        } else {
          problems.push(`${key}: expected "all", "glimmer", "vault" or "none"`);
        }
        break;
      case "vaultInclude":
        if (
          Array.isArray(value) &&
          value.every((id) => Number.isInteger(id) && id >= 0)
        ) {
          toggles.vaultInclude = value as number[];
        } else {
          problems.push(`${key}: expected a list of item row ids`);
        }
        break;
      case "itemTalentByte":
        if (Number.isInteger(value) && (value as number) >= -1 && (value as number) <= 255) {
          toggles.itemTalentByte = value as number;
        } else {
          problems.push(`${key}: expected a whole number -1..255`);
        }
        break;
      case "itemRollByte":
        if (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 255) {
          toggles.itemRollByte = value as number;
        } else {
          problems.push(`${key}: expected a whole number 0..255`);
        }
        break;
      case "omitScriptRowTypes":
        if (
          Array.isArray(value) &&
          value.every((type) => Number.isInteger(type) && type >= 0)
        ) {
          toggles.omitScriptRowTypes = value as number[];
        } else {
          problems.push(`${key}: expected a list of row type ids`);
        }
        break;
      case "senseRows":
        if (typeof value === "boolean") {
          toggles.senseRows = value;
        } else {
          problems.push(`${key}: expected true or false`);
        }
        break;
      case "startPhase":
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          Object.values(value).every(
            (index) => Number.isInteger(index) && (index as number) >= 0
          )
        ) {
          toggles.startPhase = value as Record<string, number>;
        } else {
          problems.push(`${key}: expected { "<activity>": <phase index> }`);
        }
        break;
      case "stripNavPoints":
        if (typeof value === "boolean") {
          toggles.stripNavPoints = value;
        } else {
          problems.push(`${key}: expected true or false`);
        }
        break;
      default:
        problems.push(`${key}: unknown toggle`);
    }
  }
  return { problems, source: "file", toggles };
}

export function describeDebugToggles(read: DebugTogglesRead): string {
  const set = Object.keys(read.toggles).length > 0;
  const body = set
    ? JSON.stringify(read.toggles)
    : `none (${read.source === "none" ? `no ${DEBUG_TOGGLES_FILE}` : "empty"})`;
  return read.problems.length > 0
    ? `${body} problems: ${read.problems.join("; ")}`
    : body;
}
