// What the investment tables hold, as the content readers give it: the shapes
// every build's reader fills in.

// An item's scaling block: the bias that runs through the power stat's
// pre-curve, and the {stat key, value} slots that are added to it.
interface ItemScaling {
  bias: number;
  values: readonly (readonly [number, number])[];
}

// An item definition. Item rows are in item table order, the item definition
// index the wire uses.
// A dye on one dye channel of the item's art: {channel, dye index}, the
// shape of the gear block's dye entries (80801704 {i8, i16}).
export interface ItemDye {
  channel: number;
  dye: number;
}

// The equipable block's three {u8, u16} lists (+0x08, +0x10, +0x20). Weapons
// dye channels 5/6, armour 0/1/2, ships 9/10, sparrows 13, ghosts 14.
export interface ItemDyes {
  // +0x20: what a shader applies (channels 0..2); empty on other items.
  custom: readonly ItemDye[];
  // +0x08: the item's own colours (most gear).
  default: readonly ItemDye[];
  // +0x10: colours the item keeps (raid and vendor armour, many others).
  locked: readonly ItemDye[];
}

export interface ItemDef {
  // -1 = none (the def's 0xFFFF).
  artArrangement: number;
  bucket: number;
  // Wire class index the equip unlock names (0 titan, 1 hunter, 2 warlock),
  // -1 when any class may equip it.
  classIndex: number;
  // Equipable items, in builds that read them.
  dyes?: ItemDyes;
  // null = not equipable.
  equipSlot: number | null;
  // The talent grid table row the item's tree comes from, null without one.
  gridIndex: number | null;
  instanced: boolean;
  // The level block a new instance starts from: level and quality feed the
  // primary stat (investment/primary-stat.ts), level is also the level a
  // character needs to equip it.
  level: number;
  maxStack: number;
  quality: number;
  // Sandbox pattern index, -1 = none (the def's 0xFF).
  sandboxPattern: number;
  // What a build that scales by a bias and values (the alpha) copies into the
  // instance; unset elsewhere.
  scaling?: ItemScaling;
  // Item tiers are numbered by the build (ContentIds.tier); in 41375 0 is
  // currency, 1 basic, 2 common, 3 rare, 4 legendary, 5 exotic.
  tier: number;
  // Weapons only: the stat block as the def authors it, {investment stat,
  // value}.
  weaponStats: readonly (readonly [number, number])[];
  // Perk table indices the def's stat block grants (builds that read them).
  perks?: readonly number[];
}

// An item definition as a reader gives it: items.ts turns the equip unlock's
// class flag into a class and keeps the stat block of weapons only.
export interface ItemRecord
  extends Omit<ItemDef, "classIndex" | "weaponStats"> {
  // The class flag the equip unlock is made of, null when it is not exactly
  // one flag.
  classFlag: number | null;
  // Equipable items: the stat block, {investment stat, value}.
  stats: readonly (readonly [number, number])[];
  // The stat block's perk table indices (builds that read them).
  perks?: readonly number[];
}

export interface VendorPurchase {
  // Item the offer is priced in, only meaningful with explicitCost.
  costDef: number;
  costQuantity: number;
  // False: the item definition's value list prices it instead, which the
  // server does not read.
  explicitCost: boolean;
  // The item on offer, -1 for none.
  itemDef: number;
  // Overrides the item's level block for the new instance; 0 and
  // 0x80000000 keep the definition's.
  level: number;
  // A build that authors a power instead (the alpha): the value of the
  // purchase's key 0 stat, unset when it has none.
  power?: number;
  quantity: number;
}

export interface VendorBucketPair {
  bucket: number;
  // The bucket the vendor keeps items of `bucket` in, 255 for none.
  target: number;
}

export interface Vendor {
  // Pairs of inventory buckets (s_vendor +0x24), in builds that read them.
  // The vault vendor maps each character bucket to the account bucket its
  // items are kept in.
  bucketMap?: readonly VendorBucketPair[];
  // Currency item definition, undefined for a vendor with no wares.
  currencyDef: number | undefined;
  nameHash: number;
  purchases: readonly VendorPurchase[];
}

export interface TalentGridStepStat {
  key: number;
  maximumScale: number;
  minimumScale: number;
  // The grid random roll that lerps the scale, -1 for none.
  randomSlot: number;
  value: number;
}

export interface TalentGridStepLink {
  // The ability a grant binds (link +0x0B), 0xFF for none.
  ability: number;
  // The modifier's name hash, k_empty_name_hash for a grant.
  nameHash: number;
  // The node a chain link follows (link +0x08), 0xFF for none.
  node: number;
  // A modifier's target ability (link +0x04).
  target: number;
  // A chain link's step and index (link +0x09 / +0x0A), 0xFF for none.
  step?: number;
  index?: number;
  // Link +0x0C (a grant's slot << 24).
  word?: number;
}

export interface TalentGridStep {
  levelRequirement: number;
  // Perk table indices the step grants while active (builds that read them).
  perks?: readonly number[];
  // Investment stats the step adds while active: value x scale on the stat
  // with that key (builds that read them).
  stats?: readonly TalentGridStepStat[];
  // The step's ability links (builds that read them): a grant is {empty
  // hash, ability, slot}, a modifier {modifier hash, target ability}.
  links?: readonly TalentGridStepLink[];
  // Some node whose binaryPairHash is this must be active, k_empty_name_hash
  // for none.
  requiredNodeHash: number;
}

export interface TalentGridNode {
  autoGranted: boolean;
  // One step, the one the instance's roll in randomSlot picks, is the only
  // one that can be active (builds that read it). Otherwise steps activate
  // in order.
  exclusive?: boolean;
  // The grid random roll row that picks an exclusive node's step, -1 for
  // none (builds that read it).
  randomSlot?: number;
  // Shared by the nodes of one group, of which only one can be active;
  // k_empty_name_hash otherwise.
  binaryPairHash: number;
  index: number;
  nameHash: number;
  prerequisiteNodes: readonly number[];
  steps: readonly TalentGridStep[];
}

export interface TalentGrid {
  index: number;
  nodes: readonly TalentGridNode[];
  // Per random roll row, the largest value a new instance rolls for it, -1
  // for a full byte (a 0..1 stat scale). Builds that read them.
  randomRolls?: readonly number[];
  // The progression the grid's XP comes from, -1 for none.
  progression: number;
}

export interface AbilityGrant {
  ability: number;
  auto: boolean;
  level: number;
  node: number;
  slot: number;
}

// What a subclass's starting build is chosen from.
export interface TalentGridBuildSource {
  grants: readonly AbilityGrant[];
  nodes: readonly {
    autoGranted: boolean;
    // Perk table indices of the node's steps.
    perks: readonly number[];
  }[];
}

export interface SubclassBuild {
  // Ability table index (the client's ability table) per ability slot:
  // grenade, super, melee, jump, movement. -1 = the grid binds none.
  abilities: readonly number[];
  // Talent grid table row the def names.
  grid: number;
  // Grid nodes the build activates: auto-granted and picked ability nodes.
  nodes: readonly number[];
  // Perk table indices of those nodes' steps.
  perks: readonly number[];
}

export interface ProgressionStep {
  // 0xFFFF when the step grants nothing.
  grantedItem: number;
  xpRequired: number;
}

export interface ProgressionDef {
  // Past the last step the last step repeats and the level keeps climbing.
  clampAtMax: boolean;
  index: number;
  nameHash: number;
  steps: readonly ProgressionStep[];
}

export interface CharacterConstants {
  // Past it, the level is the light-derived level if higher.
  levelCap: number;
  // Progression indices by role.
  progressions: readonly number[];
  // Stat indices by role; [0] is the light stat.
  stats: readonly number[];
}

export interface ClientDestination {
  index: number;
  // The progressions the destination advances.
  progressions: readonly number[];
}

export interface StatCurvePoint {
  x: number;
  y: number;
}

interface StatCurveDamageWeight {
  damageType: number;
  weight: number;
}

export interface StatCurveSlotWeight {
  equipSlot: number;
  weight: number;
}

export interface StatCurve {
  // A build that weights by damage type (the alpha) lists the weights here;
  // the others leave it empty.
  damageWeights: readonly StatCurveDamageWeight[];
  index: number;
  // The stat's name hash.
  nameHash: number;
  // The curve proper, piecewise linear.
  points: StatCurvePoint[];
  // What an item's quality (in tenths) is clamped to before it is added to
  // the level on the curve's x axis.
  qualityPoints: StatCurvePoint[];
  // Per equip slot weights; armour splits a stat's value between its slots
  // by them.
  slotWeights: readonly StatCurveSlotWeight[];
}

export interface NewCharacterFlag {
  flag: number;
  value: number;
}

// A new character's defaults per class and race.
interface NewCharacterRow {
  class: number;
  // The class unlock flags the character gets. Some are shared by every
  // class; the rest, seven to a class, are consecutive and name the class.
  classFlags: readonly number[];
  // The flags a character of this class and race is created with.
  flags: readonly NewCharacterFlag[];
  race: number;
}

export interface NewCharacterTable {
  defaults: readonly NewCharacterRow[];
  // Per class, the item defs of its starting gear.
  startingGear: readonly { class: number; items: readonly number[] }[];
}

export interface NewCharacterDefaults {
  // The starting gear by the equip slot each def names: five armour pieces,
  // the class emblem, ghost and sparrow.
  items: Readonly<Record<number, number>>;
  // The subclass def whose equip unlock is the class's own flag.
  subclass: number;
}

export interface InventoryBucket {
  // Bag slots [firstSlot, firstSlot + slotCount).
  firstSlot: number;
  id: number;
  slotCount: number;
}

interface InventoryTableRow extends InventoryBucket {
  // The bucket belongs to another scope than the character's bag.
  otherScope: boolean;
}

export interface InventoryTable {
  rows: readonly InventoryTableRow[];
  // The bucket row ids with no equip slot.
  unequippable: readonly number[];
}

export interface Ability {
  nameHash: number;
}

export interface ServerMessage {
  // fnv1 of the message's name.
  nameHash: number;
  networkId: number;
  requestSchema: number;
  responseSchema: number;
}

// An activity's definition: its name and, for a playlist, the activity ids it
// picks from.
export interface ActivityDefinition {
  // Empty for a hole in the table.
  name: string;
  playlist: readonly number[];
  // Each playlist entry's weight, where the build authors them (the alpha).
  playlistWeights?: readonly number[];
}

// The three slot arrays a flag can come from. A flag with none (source
// "none") is set only by the time table, a progression row or the universe
// list.
export type UnlockScope = "account" | "offer" | "character";
export type UnlockFlagSource = UnlockScope | "none";

export interface UnlockTime {
  // Seconds since the epoch.
  time: bigint;
  // The build's unlockFlagSet sets the flag; the other value clears it.
  value: number;
}

export interface UnlockTables {
  // Per scope, the flag each slot sets (negative for none).
  flagOfSlot: Readonly<Record<UnlockScope, readonly number[]>>;
  // Where each flag comes from, by flag.
  sources: readonly UnlockFlagSource[];
  // The time table's rows in table order.
  times: readonly (UnlockTime & { flag: number })[];
}

// The package header fields the content manifest echoes.
export interface PackageHeaderFields {
  headerValue: bigint;
  language: number;
  packageId: number;
  patch: number;
}
