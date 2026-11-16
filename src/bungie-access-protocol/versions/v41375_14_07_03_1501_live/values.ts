import { event_message } from "@blamnetwork/datamine";
import type { rsat } from "@blamnetwork/rsat";
import { equipSlotIds } from "../../../content/inventory";
import { itemDef } from "../../../content/items";
import {
  type SubclassBuild,
  subclassBuilds,
  talentGridGrants,
} from "../../../content/talent-grids";
import {
  characterProgressionRows,
  characterStatOverride,
  levelCap,
  levelOf,
} from "../../../investment/character-level";
import type { CharacterRecord } from "../../../investment/character-store";
import { unpackColorGroup } from "../../../investment/color-group";
import { bagIndexForBucket } from "../../../investment/inventory-layout";
import type { LoadoutItem, StatPair } from "../../../investment/loadout";
import { starterSubclassDef } from "../../../investment/loadout";
import {
  LOOT_SLOT_COUNT,
  type LootSlot,
  lootTableForCharacter,
} from "../../../investment/loot";
import type { ItemPrimaryStat } from "../../../investment/primary-stat";
import {
  activeAbilityModifiers,
  activeAbilityOverrides,
  activeTalentNodes,
  describeActiveTalentNodes,
  activeTalentPerks,
  gridIndexForDef,
  itemPerks,
  itemTalentByte,
  wireTalentNodeStates,
  itemTalentRollBytes,
  hasTalentGrid,
  talentGridProgression,
} from "../../../investment/talent-grid";
import { readDebugToggles } from "../../../dev-config/debug-toggles";
import { loadWebTigerEnv } from "../../../env";
import { k_empty_name_hash } from "../../../utils/name-hash";
import { characterStats, weaponStats } from "./character-stats";
import {
  DEFAULT_ORBIT_KEY,
  DEFAULT_PROFILE_AMMO,
  EMPTY_ORBIT_KEY,
  GEAR_LIST_7,
  GEAR_LIST_8,
  PEER_PRIMARY_UNKNOWN2_COUNT,
  PEER_PRIMARY_UNKNOWN3_COUNT,
  SELF_CHARACTER_UNKNOWN5,
  SELF_CHARACTER_UNKNOWN8,
} from "./character-values";
import {
  DIRECTOR_DEBUG_UNLOCK,
  directorAccountSlotValues,
  directorCharacterSlotValues,
  directorDebugFlagList,
  directorOfferSlotValues,
} from "./director-policy";
import {
  type CharacterProfileValue,
  parseAccountProfile,
  parseCharacterProfile,
} from "./messages";
import { accountBuckets } from "../../../content/inventory";
import { accountProfile } from "../../../investment/account-profiles";
import { accountVault } from "../../../investment/account-vault";
import type {
  InspectionCharacterValue,
  InspectionPrimaryValue,
} from "./queuez/inspection";
import type { PeerCharacterValue, PeerPrimaryValue } from "./queuez/peer";
import type { RosterMemberValue } from "./queuez/roster";
import type {
  SelectCharacterCharacterValue,
  SelectCharacterPrimaryValue,
  SelectCharacterSchemas,
} from "./queuez/select-character";
import type {
  InventoryItemValue,
  SelfCharacterValue,
  SelfPrimaryValue,
  SelfSchemas,
} from "./queuez/self";

type LootSlotValue = rsat.Infer<SelfSchemas["Unknown80801829"]>;
type AppearanceF0Value = rsat.Infer<SelfSchemas["Unknown8080181A"]>;
type GearValue = rsat.Infer<SelectCharacterSchemas["Unknown80801855"]>;

// Values for the self, select_character, peer, roster and inspection families.
// Fields without a value of ours are absent.

function appearanceEc(character: CharacterRecord) {
  const a = character.appearance;
  return { unknown0: a.race, unknown1: a.gender, unknown2: a.classIndex };
}

// Hair and feature colour are a group of three each, unpacked from the one
// stored integer (color-group.ts).
function appearanceF0(character: CharacterRecord): AppearanceF0Value {
  const a = character.appearance;
  const group = unpackColorGroup;
  return {
    unknown0: a.faceIndex,
    unknown1: a.hairIndex,
    unknown2: a.featureIndex,
    unknown3: a.decalIndex,
    unknown4: a.skinColor,
    unknown5: a.lipColor,
    unknown6: a.eyeColor,
    unknown7: group(a.hairColor),
    unknown8: group(a.featureColor),
    unknown9: a.decalColor,
    unknown10: a.personalityId,
    unknown11: a.helmetPreference,
  };
}

// Roster soid array size (self and select primaries).
const SELF_ROSTER_MAX = 10;

// The self primary. investment_signin waits until this object, with soid ==
// accountSoid, is in the object store. The roster is every character on the
// account (max 10); the select list walks it, not family 3's.
export function selfPrimary(
  accountSoid: bigint,
  characterSoid: bigint | null,
  rosterSoids: readonly bigint[] = characterSoid === null ? [] : [characterSoid],
  character: CharacterRecord | null = null
): SelfPrimaryValue {
  const roster = rosterSoids.slice(0, SELF_ROSTER_MAX);
  // Member 7 is the account unlock flags and member 8 the account offers
  // (storage types 4 / 3). Only the slots the activity gates need are set:
  // offer slots 0-5 are bans and 14-80 MOTDs.
  const offerSlots = directorOfferSlotValues();
  return {
    unknown0: {
      soid: accountSoid,
      roster: roster.length ? { soids: roster } : undefined,
      characterSoid: characterSoid ?? undefined,
      // The account settings (controls, brightness, vibration) the client
      // last uploaded (701), absent before the first upload.
      unknown3: storedAccountProfile(accountSoid),
      unknown4: undefined,
      // The account's bag: the vault, once a character is signed in (the
      // vault items' objects come with the character's).
      unknown5:
        characterSoid === null ? undefined : accountBag(accountSoid, character),
      unknown6: undefined,
      unknown7: { unknown0: directorAccountSlotValues() },
      unknown8: { unknown0: false, unknown1: { unknown0: offerSlots } },
      unknown9: undefined,
      unknown10: undefined,
      unknown11: undefined,
      unknown12: undefined,
      unknown13: undefined,
    },
  };
}

// TIGER_ECHO_ACCOUNT_PROFILE sends the stored account profile back in the
// self primary. Read once at harness start: editing .env needs a harness
// restart. Default options (confirmed on 15 Nov: no crashes across game
// starts, and controls/brightness/vibration stick); off (or 0) disables it.
// Modes, largest first:
//   full (or 1)  the whole profile. The client crashed after login_character.
//   settings     unknown1 only (808017D6), without unknown0 (8080172C, the 128
//                optional u64 list plus 4 u32). Crashed in 2 of 3 game starts,
//                2-4 s after login_character.
//   options      808017D6.unknown1 only (808017F0: the option ints and bools),
//                without 808017D6.unknown0 (80801705: two f32 pairs, stored
//                (1,1)/(0,0) on 13 Nov, (0,0)/(0,0) after the crash run).
// The profile is stored either way.
type EchoAccountProfileMode = "off" | "options" | "settings" | "full";
let echoAccountProfileValue: EchoAccountProfileMode | undefined;
function echoAccountProfile(): EchoAccountProfileMode {
  if (echoAccountProfileValue === undefined) {
    loadWebTigerEnv();
    const raw = process.env.TIGER_ECHO_ACCOUNT_PROFILE?.trim().toLowerCase();
    echoAccountProfileValue =
      raw === "1" || raw === "full"
        ? "full"
        : raw === "settings"
          ? "settings"
          : raw === "0" || raw === "off"
            ? "off"
            : "options";
    event_message(
      "networking:bap: account profile echo %s",
      echoAccountProfileValue
    );
  }
  return echoAccountProfileValue;
}

function storedAccountProfile(accountSoid: bigint) {
  const mode = echoAccountProfile();
  if (mode === "off") {
    return;
  }
  const body = accountProfile(accountSoid);
  const parsed = body && parseAccountProfile(body);
  if (!parsed) {
    return;
  }
  if (mode === "full") {
    return parsed;
  }
  if (mode === "settings") {
    return { unknown0: undefined, unknown1: parsed.unknown1 };
  }
  return {
    unknown0: undefined,
    unknown1: { unknown0: undefined, unknown1: parsed.unknown1?.unknown1 },
  };
}

// The profile the client last uploaded (702), else a fresh one: full
// magazine + reserve on every weapon slot (0 / absent spawns the guardian with
// "NO AMMO"). Either way the orbit key is set (Earth when the client has none).
function characterProfile(character: CharacterRecord) {
  const stored = character.profile
    ? parseCharacterProfile(character.profile)
    : null;
  if (!stored) {
    return {
      unknown0: {
        unknown0: DEFAULT_PROFILE_AMMO,
        unknown1: undefined,
        unknown2: undefined,
      },
      unknown1: withOrbitKey(undefined),
    };
  }
  // The guest zeroes heavy ammo on scripted respawns and in crate-only
  // activities, then writes the 0.0 fraction back; echoing that would spawn
  // every later session without heavy ammo.
  const fractions = stored.unknown0?.unknown0;
  return {
    ...stored,
    unknown0:
      fractions && stored.unknown0
        ? { ...stored.unknown0, unknown0: { ...fractions, unknown2: 1 } }
        : stored.unknown0,
    unknown1: withOrbitKey(stored.unknown1),
  };
}

type ProfileBody = NonNullable<CharacterProfileValue["unknown1"]>;

function withOrbitKey(body: ProfileBody | undefined): ProfileBody {
  const key = body?.unknown3;
  const orbit =
    key === undefined || key >>> 0 === EMPTY_ORBIT_KEY
      ? DEFAULT_ORBIT_KEY
      : key;
  return {
    unknown0: body?.unknown0,
    unknown1: body?.unknown1,
    unknown2: body?.unknown2,
    unknown3: orbit,
    unknown4: body?.unknown4,
  };
}

// Bag entries: every item (equipped or not) sits in its bucket's
// bag range. Stacks (currency / materials) carry no item object, so the bag
// entry's soid is 0 and unknown2 is the stack size.
function emptyBagEntry() {
  return { unknown0: -1, unknown1: 0n, unknown2: 0, unknown3: 0 };
}

// Rows are counted per bag range, not per bucket: the currency alias
// (bucket 0) shares the materials bucket's range (5, slots 0..14), so
// counting them apart put the first material on top of the glimmer.
function bagSlots(character: CharacterRecord) {
  const slots = Array.from({ length: 256 }, () => emptyBagEntry());
  const used = new Map<number, number>();
  for (const item of character.loadout.items) {
    const start = bagIndexForBucket(item.bucket);
    // Glimmer goes in the account bag (accountBag) while that is sent.
    if (start < 0 || (sendVault() && inAccountBag(item.defIndex))) {
      continue;
    }
    const bagIndex = start + (used.get(start) ?? 0);
    used.set(start, bagIndex - start + 1);
    slots[bagIndex] = {
      unknown0: item.defIndex,
      unknown1: item.instanced ? item.soid : 0n,
      unknown2: item.quantity,
      unknown3: 0,
    };
  }
  return slots;
}

// The character's progression rows (character-level.ts) with
// debug-toggles.json progressionXp applied: a listed index's row gets that
// XP, added when the character has none (reputations: Vanguard 119, Crucible
// 120, whose ranks gate vendor stock).
function progressionRowsFor(character: CharacterRecord) {
  const rows = characterProgressionRows(character);
  const extra = readDebugToggles().toggles.progressionXp ?? {};
  for (const [key, xp] of Object.entries(extra)) {
    const index = Number(key);
    const row = rows.find((r) => r.unknown3 === index);
    if (row) {
      row.unknown0 = xp;
    } else if (rows.length < 127) {
      rows.push({ unknown0: xp, unknown1: 0, unknown2: 0, unknown3: index });
    }
  }
  return rows;
}

// TIGER_SEND_VAULT=0 in .env sends no account bag (the self primary as it
// was before the vault).
let sendVaultValue: boolean | undefined;
function sendVault(): boolean {
  if (sendVaultValue === undefined) {
    loadWebTigerEnv();
    sendVaultValue = process.env.TIGER_SEND_VAULT?.trim() !== "0";
  }
  return sendVaultValue;
}

// 80804591: the account bag has 128 slots, laid out like the character's
// (80804764, 256) by the inventory def's other-scope rows: the vault buckets
// 22, 23 and 24 at 20, 40 and 60, 20 slots each.
const ACCOUNT_BAG_SLOTS = 128;

// Whether a def's own bucket is in the account's bag: glimmer (899, bucket
// 28, one slot at 80), which the client counts from there ("shared between
// all your characters"). Such a stack is stored with the character and sent
// in the account bag, not the character's.
function inAccountBag(defIndex: number): boolean {
  const bucket = itemDef(defIndex)?.bucket;
  return (
    bucket !== undefined && accountBuckets().some((b) => b.id === bucket)
  );
}

function accountBag(accountSoid: bigint, character: CharacterRecord | null) {
  const { accountBag: bagContents, vaultInclude } = readDebugToggles().toggles;
  const contents = bagContents ?? "all";
  if (!sendVault() || contents === "none") {
    return;
  }
  const withVault = contents === "all" || contents === "vault";
  const withGlimmer = contents === "all" || contents === "glimmer";
  const slots = Array.from({ length: ACCOUNT_BAG_SLOTS }, () =>
    emptyBagEntry()
  );
  const ranges = new Map(accountBuckets().map((b) => [b.id, b]));
  const used = new Map<number, number>();
  const vault = accountVault(accountSoid).filter(
    (item) =>
      !vaultInclude ||
      vaultInclude.includes(Number(item.soid & 0xff_ff_ff_ffn))
  );
  for (const item of withVault ? vault : []) {
    const range = ranges.get(item.vaultBucket);
    const count = used.get(item.vaultBucket) ?? 0;
    if (!range || count >= range.slotCount) {
      continue;
    }
    const bagIndex = range.firstSlot + count;
    if (bagIndex >= ACCOUNT_BAG_SLOTS) {
      continue;
    }
    used.set(item.vaultBucket, count + 1);
    slots[bagIndex] = {
      unknown0: item.defIndex,
      unknown1: item.instanced ? item.soid : 0n,
      unknown2: item.quantity,
      unknown3: 0,
    };
  }
  // The signed-in character's account-bucket stacks (glimmer).
  for (const item of withGlimmer ? (character?.loadout.items ?? []) : []) {
    const bucket = itemDef(item.defIndex)?.bucket ?? -1;
    const range = ranges.get(bucket);
    const count = used.get(bucket) ?? 0;
    if (!range || count >= range.slotCount || item.instanced) {
      continue;
    }
    used.set(bucket, count + 1);
    slots[range.firstSlot + count] = {
      unknown0: item.defIndex,
      unknown1: 0n,
      unknown2: item.quantity,
      unknown3: 0,
    };
  }
  return { unknown0: ACCOUNT_BAG_SLOTS, unknown1: { unknown0: slots } };
}

// The equipped soid per equip slot; the inventory UI marks an item equipped
// when its soid is in here.
function equippedSoids(character: CharacterRecord) {
  return Array.from(
    { length: 20 },
    (_, slot) => character.loadout.equipped(slot)?.soid ?? 0n
  );
}

function wireLootSlot(slot: LootSlot | undefined): LootSlotValue {
  if (!slot) {
    return {
      unknown0: undefined,
      unknown1: undefined,
      unknown2: undefined,
      unknown3: undefined,
      unknown4: undefined,
    };
  }
  return {
    unknown0: slot.itemDef,
    unknown1: slot.quantity,
    unknown2: slot.state,
    unknown3: {
      unknown0: {
        unknown0: slot.nonce.incidentNumber,
        unknown1: slot.nonce.submitterSoid,
      },
      unknown1: slot.nonce.ordinal,
    },
    // The bauble cosmetic nest is copied client-side but never read by the
    // loot/pickup code: always send it absent.
    unknown4: undefined,
  };
}

// The self character's loot member: its slot table is the 64
// ground-loot records the client spawns baubles from. Absent unless the
// character's loot table has something to say (an active drop or a one-shot
// pickup clear).
function lootSlots(character: CharacterRecord) {
  const table = lootTableForCharacter(character.soid);
  if (!table.hasPendingWire) {
    return;
  }
  const slots = Array.from({ length: LOOT_SLOT_COUNT }, (_, i) => {
    const slot = table.at(i);
    if (slot) {
      return wireLootSlot(slot);
    }
    if (table.isPendingClear(i)) {
      table.consumePendingClear(i);
      return wireLootSlot({
        itemDef: -1,
        quantity: 0,
        state: 0,
        nonce: { incidentNumber: 0, submitterSoid: 0n, ordinal: 0 },
      });
    }
    return wireLootSlot(undefined);
  });
  return {
    unknown0: undefined,
    unknown1: { unknown0: slots },
    unknown2: undefined,
    unknown3: undefined,
  };
}

export function selfCharacter(character: CharacterRecord): SelfCharacterValue {
  return {
    soid: character.soid,
    unknown1: appearanceEc(character),
    unknown2: appearanceF0(character),
    unknown3: { unknown0: 256, unknown1: { unknown0: bagSlots(character) } },
    unknown4: { unknown0: equippedSoids(character) },
    // [0] is an activity index and [4] whether it was finished: the update
    // handler (sub_828169C8) launches that activity's next one when [4] turns
    // true for the activity the fireteam is in. [1] is a second activity
    // index. Both are -1 (none) until an activity ran: [0] indexes the
    // 468-row activity table unchecked, so any other value crashes the client.
    unknown5: {
      unknown0: character.lastActivity?.index ?? -1,
      ...SELF_CHARACTER_UNKNOWN5,
      unknown4: character.lastActivity?.completed ?? false,
    },
    unknown6: characterProfile(character),
    // Progression rows: the level row (progression 109) at the character's
    // XP (or CHARACTER_LEVEL).
    unknown7: { unknown0: progressionRowsFor(character) },
    unknown8: SELF_CHARACTER_UNKNOWN8,
    unknown9: lootSlots(character),
    // Character unlock flags (storage type 5): story / destination reveals.
    unknown10: {
      unknown0: directorCharacterSlotValues(character.prologuePending),
    },
    unknown11: undefined,
    unknown12: undefined,
    unknown13: undefined,
    unknown14: undefined,
    unknown15: undefined,
    // Server stat totals: light (stat 0) lifts the level past the progression
    // cap. Member 5 is the debug flag list (storage type 0) and member 6 the
    // debug unlock switch, both read only with ServerObject.unknown5 bit 0
    // (director-policy.ts).
    unknown16: {
      unknown0: undefined,
      unknown1: undefined,
      unknown2: undefined,
      unknown3: characterStatOverride(character),
      unknown4: undefined,
      unknown5: directorDebugFlagList(),
      unknown6: DIRECTOR_DEBUG_UNLOCK || undefined,
      unknown7: undefined,
      unknown8: undefined,
      unknown9: undefined,
    },
    unknown17: undefined,
    unknown18: undefined,
  };
}

// The client's "none" for an i16 table index (grid, progression): 0xFFFF.
const NO_INDEX = -1;

// An item: the soid, def index and the primary stat {i32 level, i32 required
// level, i16 quality} (Attack / Defense): the stat curve of level + quality /
// 10 (investment/primary-stat.ts), and equipping needs required level <= the
// level progression.
export function inventoryItem(
  item: LoadoutItem,
  primary: ItemPrimaryStat
): InventoryItemValue {
  return {
    soid: item.soid,
    unknown1: { unknown0: 0n, unknown1: -1 },
    unknown2: {
      unknown0: primary.level,
      unknown1: primary.requiredLevel,
      unknown2: primary.quality,
    },
    defIndex: item.defIndex,
    unknown4: talentGridInstance(item),
  };
}

// TIGER_SEND_TALENT_GRIDS=0 in .env goes back to sending no grid at all.
let sendGridsValue: boolean | undefined;
function sendTalentGrids(): boolean {
  if (sendGridsValue === undefined) {
    loadWebTigerEnv();
    sendGridsValue = process.env.TIGER_SEND_TALENT_GRIDS?.trim() !== "0";
  }
  return sendGridsValue;
}

// 808043C6: 36 u8, taken as one activated-step count per node like the
// alpha's 50-wide array (an assumption: the width differs and the live layout
// is unconfirmed).
const LIVE_TALENT_NODE_BYTES = 36;

// The item's talent grid instance (80801846): its progression row (talent
// XP, the grid's progression index), the grid index and the node states.
//
// Upstream sent the grid and progression as none, because the unlock flag
// rebuild looks up the grid tag of every bag and equipped item and the client
// only streams in the grids its item defs name: any other index is never
// resident, the rebuild (sub_831B1A60) clears its valid byte, no activity
// status is computed and every director node says "Requirements Not Met".
// The item def's own grid is the one the client streams in, so it is sent
// here; an item without a grid keeps none.
function talentGridInstance(item: LoadoutItem) {
  const withGrid = sendTalentGrids() && hasTalentGrid(item.defIndex);
  // 0xFF is talentGridProgression's "none" (the alpha's u8 field); this one is
  // an i16.
  const progression = withGrid ? talentGridProgression(item.defIndex) : 0xff;
  return {
    unknown0: {
      unknown0: item.talentXp,
      unknown1: 0,
      unknown2: undefined,
      unknown3: progression === 0xff ? NO_INDEX : progression,
    },
    unknown1: undefined,
    unknown2: withGrid ? gridIndexForDef(item.defIndex) : NO_INDEX,
    unknown3: withGrid
      ? (() => {
          const states = wireTalentNodeStates(item);
          return {
            unknown0: Array.from(
              { length: LIVE_TALENT_NODE_BYTES },
              (_, i) => states[i] ?? 0
            ),
          };
        })()
      : undefined,
    // The talent roll bytes (8080405E), one per grid random roll row: the
    // step an exclusive node offers, or a stat's scale (byte / 255). Absent,
    // signing in with granted armour equipped crashed the client.
    unknown4: withGrid ? itemRollBytes(item) : undefined,
    // +0x4E, rolled below the grid's instanceRollLimit (talent-grid.ts);
    // debug-toggles itemTalentByte overrides it (-1: none).
    unknown5: withGrid ? instanceTalentByte(item) : undefined,
  };
}

function instanceTalentByte(item: LoadoutItem): number | undefined {
  const forced = readDebugToggles().toggles.itemTalentByte;
  if (forced !== undefined) {
    return forced < 0 ? undefined : forced;
  }
  return itemTalentByte(item);
}

// The item's own rolls (itemTalentRollBytes), which pick the perks of its
// exclusive nodes; debug-toggles.json itemRollByte puts every roll at that
// value instead (every item of a grid then rolls the same perks).
function itemRollBytes(item: LoadoutItem) {
  const byte = readDebugToggles().toggles.itemRollByte;
  return {
    unknown0:
      byte === undefined
        ? itemTalentRollBytes(item)
        : Array.from({ length: 8 }, () => byte),
  };
}

// Select-character primary: soid and the roster. unknown2 (27 x i16)
// and unknown3 stay absent.
export function selectCharacterPrimary(
  accountSoid: bigint,
  characterSoids: readonly bigint[]
): SelectCharacterPrimaryValue {
  return {
    soid: accountSoid,
    roster: characterSoids.length ? { soids: [...characterSoids] } : undefined,
    unknown2: undefined,
    unknown3: undefined,
  };
}

// The gear block's perk list size.
const GEAR_PERK_SLOTS = 26;

// The equipped subclass's starting build, else the class's starter subclass.
function subclassBuild(character: CharacterRecord): SubclassBuild {
  const equipped = character.loadout.equipped(
    equipSlotIds().subclass
  )?.defIndex;
  return (
    subclassBuilds().get(equipped ?? -1) ??
    subclassBuilds().get(starterSubclassDef(character.appearance.classIndex))!
  );
}

const EMPTY_DYE = { unknown0: -1, unknown1: -1 };
const EMPTY_DYES = {
  unknown0: [EMPTY_DYE, EMPTY_DYE, EMPTY_DYE, EMPTY_DYE, EMPTY_DYE, EMPTY_DYE],
};

function pad16(values: readonly number[], fill = -1): number[] {
  return Array.from({ length: 16 }, (_, i) =>
    i < values.length ? values[i]! : fill
  );
}

function statSlots(pairs: readonly StatPair[]) {
  return Array.from({ length: 16 }, (_, i) => {
    const [a, b] = i < pairs.length ? pairs[i]! : ([-1, 0] as const);
    return { unknown0: a, unknown1: b };
  });
}

// An empty slot has no pattern (-1), not 0 (2.3.1 peer character capture).
function emptyEquipSlot() {
  return {
    unknown0: 0n,
    unknown1: -1,
    unknown2: -1,
    unknown3: -1,
    unknown4: EMPTY_DYES,
  };
}

// TIGER_SEND_DYES=0 in .env sends every slot's dyes as none again.
let sendDyesValue: boolean | undefined;
function sendDyes(): boolean {
  if (sendDyesValue === undefined) {
    loadWebTigerEnv();
    sendDyesValue = process.env.TIGER_SEND_DYES?.trim() !== "0";
  }
  return sendDyesValue;
}

const DYE_ENTRIES = 6;

// An equipped item's dyes (808046BC: 6 x {channel, dye}, -1 for none), from
// its def (ItemDyes): its own colours, then an equipped shader's on the
// armour channels, then the colours it keeps. At most 4 per def in 41375.
// The order (shader over default, locked over both) is a reading of the
// three lists' names, not confirmed.
function slotDyes(
  item: LoadoutItem,
  shader: readonly { channel: number; dye: number }[]
) {
  const dyes = itemDef(item.defIndex)?.dyes;
  if (!(dyes && sendDyes())) {
    return EMPTY_DYES;
  }
  const byChannel = new Map<number, number>();
  for (const { channel, dye } of dyes.default) {
    byChannel.set(channel, dye);
  }
  for (const { channel, dye } of shader) {
    if (byChannel.has(channel)) {
      byChannel.set(channel, dye);
    }
  }
  for (const { channel, dye } of dyes.locked) {
    byChannel.set(channel, dye);
  }
  const entries = [...byChannel]
    .sort((a, b) => a[0] - b[0])
    .slice(0, DYE_ENTRIES)
    .map(([channel, dye]) => ({ unknown0: channel, unknown1: dye }));
  while (entries.length < DYE_ENTRIES) {
    entries.push(EMPTY_DYE);
  }
  return { unknown0: entries };
}

// The armour equip slots a shader colours.
function shadedSlots(): ReadonlySet<number> {
  const ids = equipSlotIds();
  return new Set([
    ids.helmet,
    ids.gauntlets,
    ids.chest,
    ids.legs,
    ids.classItem,
  ]);
}

// Per equip slot: soid, def, sandbox pattern (the byte the guest builds the
// weapon / ship sobject from), art arrangement, dyes.
function equipSlots(character: CharacterRecord) {
  const slots = Array.from({ length: 20 }, () => emptyEquipSlot());
  const shaderItem = character.loadout.equipped(equipSlotIds().shader);
  const shader = shaderItem
    ? (itemDef(shaderItem.defIndex)?.dyes?.custom ?? [])
    : [];
  const shaded = shadedSlots();
  for (let slot = 0; slot < slots.length; slot++) {
    const item = character.loadout.equipped(slot);
    if (item) {
      slots[slot] = {
        unknown0: item.soid,
        unknown1: item.defIndex,
        unknown2: item.sandboxPattern,
        unknown3: item.artArrangement,
        unknown4: slotDyes(item, shaded.has(slot) ? shader : []),
      };
    }
  }
  return slots;
}

// The subclass as the player has built it: per ability slot the grant of an
// active node of its tree (the highest level one if several), else the
// starting build's; the perks of its active nodes (activeTalentPerks).
function characterSubclassBuild(character: CharacterRecord): SubclassBuild {
  const start = subclassBuild(character);
  const item = character.loadout.equipped(equipSlotIds().subclass);
  const gridIndex = item ? itemDef(item.defIndex)?.gridIndex : null;
  if (!(item && sendTalentGrids()) || gridIndex == null) {
    return start;
  }
  const active = activeTalentNodes(item);
  const grants = talentGridGrants(gridIndex).filter((grant) =>
    active.has(grant.node)
  );
  const abilities = start.abilities.map((fallback, slot) => {
    const best = grants
      .filter((grant) => grant.slot === slot)
      .sort((a, b) => b.level - a.level)[0];
    return best ? best.ability : fallback;
  });
  // Chain links that swap a granted ability (Blink for the jump).
  for (const { slot, ability } of activeAbilityOverrides(item)) {
    if (slot < abilities.length) {
      abilities[slot] = ability;
    }
  }
  const build = {
    grid: start.grid,
    nodes: [...active],
    abilities,
    perks: activeTalentPerks(item),
  };
  logSubclassBuild(character, item, build);
  return build;
}

// Diagnostic: the subclass build sent to the world and the active nodes'
// links, logged when it changes (blink and other modifiers).
const loggedSubclassBuilds = new Map<bigint, string>();
function logSubclassBuild(
  character: CharacterRecord,
  item: LoadoutItem,
  build: SubclassBuild
): void {
  const mods = build.abilities.map((ability) =>
    abilityModifiers(character, ability)
      .map((hash) => hash.toString(16))
      .join(",")
  );
  const line =
    `def=${item.defIndex} abilities=[${build.abilities.join(",")}] ` +
    `mods=[${mods.join(" | ")}] perks=[${build.perks.join(",")}] ` +
    `nodes: ${describeActiveTalentNodes(item)}`;
  if (loggedSubclassBuilds.get(character.soid) === line) {
    return;
  }
  loggedSubclassBuilds.set(character.soid, line);
  event_message(
    "networking:bap: subclass build char=0x%I64x %s",
    character.soid,
    line
  );
}

// The subclass build's perks, then every equipped item's active talent perks
// (activeTalentPerks), deduplicated, at most GEAR_PERK_SLOTS.
function gearPerks(
  character: CharacterRecord,
  buildPerks: readonly number[]
): number[] {
  const perks = new Set<number>(buildPerks);
  if (sendTalentGrids()) {
    const slots = equipSlotIds();
    // The subclass's perks come from its build above, the weapons' go in
    // their own lists (weaponPerkList).
    const skip = new Set([slots.subclass, slots.primary, slots.special, slots.heavy]);
    for (let slot = 0; slot < 20; slot++) {
      const item = character.loadout.equipped(slot);
      if (item && !skip.has(slot)) {
        for (const perk of itemPerks(item)) {
          perks.add(perk);
        }
      }
    }
  }
  return [...perks].slice(0, GEAR_PERK_SLOTS);
}

// One weapon slot's 16-entry perk list (itemPerks), or `fallback` (the
// upstream constant) with talent grids off.
function weaponPerkList(
  character: CharacterRecord,
  slot: number,
  fallback: readonly number[]
): number[] {
  const item = character.loadout.equipped(slot);
  if (!sendTalentGrids()) {
    return pad16(fallback);
  }
  return pad16(item ? itemPerks(item).slice(0, 16) : []);
}

// The modifiers the equipped subclass's active nodes put on `ability` (a
// jump's blink, a grenade's upgrade), at most 8.
function abilityModifiers(character: CharacterRecord, ability: number): number[] {
  const item = character.loadout.equipped(equipSlotIds().subclass);
  if (!(item && sendTalentGrids()) || ability < 0) {
    return [];
  }
  return [
    ...new Set(
      activeAbilityModifiers(item)
        .filter((mod) => mod.target === ability)
        .map((mod) => mod.hash)
    ),
  ].slice(0, 8);
}

// The gear block the select, roster and inspection screens and the peer
// family show; the player's combat stats are read from here, its own included.
function gear(character: CharacterRecord): GearValue {
  const build = characterSubclassBuild(character);
  return {
    // The progression level (capped at 20), printed lifted by the light in
    // unknown9.
    unknown0: Math.min(levelOf(character), levelCap()),
    // Ability slot i (grenade, super, melee, jump, movement) -> an ability
    // table index from the subclass's grid build.
    unknown1: {
      unknown0: build.abilities.map((ability) => {
        const mods = abilityModifiers(character, ability);
        return {
          unknown0: ability,
          unknown1: {
            unknown0: Array.from(
              { length: 8 },
              (_, i) => mods[i] ?? k_empty_name_hash
            ),
          },
        };
      }),
    },
    unknown2: {
      unknown0: Array.from({ length: 32 }, () => k_empty_name_hash),
    },
    unknown3: { unknown0: equipSlots(character) },
    unknown4: {
      unknown0: Array.from({ length: 8 }, () => ({
        unknown0: -1,
        unknown1: 0n,
      })),
    },
    // The build's perks, void subclass node perks included, then the perks
    // the equipped gear's talent nodes grant (a scope, a perk), which is
    // what the character in the world runs with.
    unknown5: {
      unknown0: (() => {
        const perks = gearPerks(character, build.perks);
        return Array.from(
          { length: GEAR_PERK_SLOTS },
          (_, slot) => perks[slot] ?? -1
        );
      })(),
    },
    // The primary / special / heavy weapon's perks: its def's and its active
    // talent nodes' (its element among them). Upstream sent the starter
    // special and heavy's lists here for every weapon, which kept every
    // special arc.
    unknown6: { unknown0: weaponPerkList(character, equipSlotIds().primary, []) },
    unknown7: {
      unknown0: weaponPerkList(character, equipSlotIds().special, GEAR_LIST_7),
    },
    unknown8: {
      unknown0: weaponPerkList(character, equipSlotIds().heavy, GEAR_LIST_8),
    },
    // The character stats, then the primary / special / heavy weapon stats
    // (character-stats.ts).
    unknown9: { unknown0: statSlots(characterStats(character)) },
    unknown10: {
      unknown0: statSlots(weaponStats(character, equipSlotIds().primary)),
    },
    unknown11: {
      unknown0: statSlots(weaponStats(character, equipSlotIds().special)),
    },
    unknown12: {
      unknown0: statSlots(weaponStats(character, equipSlotIds().heavy)),
    },
  };
}

// The character card summary on the select, fireteam roster and inspection
// screens. Member 2 is the equipped emblem's item def index: the select list
// and the roster card read its row of the item display table for the emblem
// art (0xFFFF draws none). Members 0 (f32) and 1 (i32) are copied to the card
// too.
function characterCard(character: CharacterRecord) {
  return {
    unknown0: undefined,
    unknown1: undefined,
    unknown2: character.loadout.equipped(equipSlotIds().emblem)?.defIndex ?? -1,
  };
}

export function selectCharacterCharacter(
  character: CharacterRecord
): SelectCharacterCharacterValue {
  return {
    soid: character.soid,
    unknown1: appearanceEc(character),
    unknown2: appearanceF0(character),
    unknown3: undefined,
    unknown4: gear(character),
    unknown5: characterCard(character),
  };
}

// Peer and roster primaries share one layout. The 2.3.1 capture sends the
// same 81 bytes for both: soid = account, the signed-in character soid, and
// both i16 tables present and zero.
export function peerPrimary(
  accountSoid: bigint,
  characterSoid: bigint | null
): PeerPrimaryValue {
  return {
    soid: accountSoid,
    characterSoid: characterSoid ?? undefined,
    unknown2: {
      unknown0: Array.from({ length: PEER_PRIMARY_UNKNOWN2_COUNT }, () => 0),
    },
    unknown3: {
      unknown0: Array.from({ length: PEER_PRIMARY_UNKNOWN3_COUNT }, () => 0),
    },
  };
}

export function peerCharacter(character: CharacterRecord): PeerCharacterValue {
  return {
    soid: character.soid,
    unknown1: appearanceEc(character),
    unknown2: appearanceF0(character),
    unknown3: gear(character),
    unknown4: characterCard(character),
  };
}

// The 2.3.1 capture has one roster member, for the signed-in character, in the
// roster baseline; only the soid and the character card are sent.
export function rosterMember(character: CharacterRecord): RosterMemberValue {
  return {
    soid: character.soid,
    unknown1: undefined,
    unknown2: undefined,
    unknown3: {
      unknown0: undefined,
      unknown1: undefined,
      unknown2: characterCard(character),
    },
    unknown4: undefined,
  };
}

export function inspectionPrimary(
  accountSoid: bigint,
  characterSoid: bigint | null
): InspectionPrimaryValue {
  return { soid: accountSoid, characterSoid: characterSoid ?? 0n };
}

// Appearance, the level row in the progression rows (member 3), the gear and
// the character card (member 11). Members 4-9 are absent.
export function inspectionCharacter(
  character: CharacterRecord
): InspectionCharacterValue {
  return {
    soid: character.soid,
    unknown1: appearanceEc(character),
    unknown2: appearanceF0(character),
    unknown3: { unknown0: progressionRowsFor(character) },
    unknown4: undefined,
    unknown5: undefined,
    unknown6: undefined,
    unknown7: undefined,
    unknown8: undefined,
    unknown9: undefined,
    unknown10: gear(character),
    unknown11: characterCard(character),
  };
}
