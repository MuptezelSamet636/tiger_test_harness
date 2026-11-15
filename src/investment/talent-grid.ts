// Talent grid access: per-item progression row / tier, the activated-step
// array, and the 801/802 (talent_grid_activate_step / talent_grid_binary_swap)
// request validation. Planning is pure (mirrors vendor.ts) so it can be unit
// tested without a store; apply* performs the store write and mutates the
// loadout in place.
import { itemDef } from "../content/items";
import { levelForXp, progressionDef } from "../content/progressions";
import {
  type TalentGrid,
  type TalentGridNode,
  talentGrid,
} from "../content/talent-grids";
import { k_empty_name_hash } from "../utils/name-hash";
import type { CharacterRecord, CharacterStore } from "./character-store";
import { TALENT_NODE_COUNT } from "./loadout";

// The grid tier a new instance starts at (instance +0x14). The grid carries
// no tier and its steps no tier requirement, so every instance sits at 0.
export const TALENT_GRID_INSTANCE_TIER = 0;

// The progression row an item's talent XP counts in (the wire byte): its
// grid's, 0xFF for none or for an item with no grid.
export function talentGridProgression(defIndex: number): number {
  const progression = talentGridDefinitionForDef(defIndex)?.progression ?? -1;
  return progression < 0 ? 0xff : progression;
}

// The grid an item's tree comes from (the item def's talent grid block). An
// item without one sends grid 0.
export function gridIndexForDef(defIndex: number): number {
  return itemDef(defIndex)?.gridIndex ?? 0;
}

// Whether the item opens a tree: its grid has nodes.
export function hasTalentGrid(defIndex: number): boolean {
  const grid = talentGridDefinitionForDef(defIndex);
  return grid !== undefined && grid.nodes.length > 0;
}

function talentGridDefinitionForDef(defIndex: number): TalentGrid | undefined {
  const gridIndex = itemDef(defIndex)?.gridIndex;
  return gridIndex == null ? undefined : talentGrid(gridIndex);
}

// The talent roll bytes an instance carries (8080405E): one per grid random
// roll row, 8 at most.
export const TALENT_ROLL_SLOTS = 8;

function mix32(value: number): number {
  let x = value >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7f_eb_35_2d);
  x = Math.imul(x ^ (x >>> 15), 0x84_6c_a6_8b);
  return (x ^ (x >>> 16)) >>> 0;
}

// The rolls a new instance makes (one per grid random roll row): 0..maximum,
// a full byte for a row whose maximum is -1, 0 for a slot the grid has no row
// for. The real server rolled once and stored them; here they come from the
// item's soid, so they are stable per item and differ between items.
export function itemTalentRolls(item: {
  defIndex: number;
  soid?: bigint;
}): number[] {
  const rows = talentGridDefinitionForDef(item.defIndex)?.randomRolls ?? [];
  const soid = item.soid ?? 0n;
  const low = Number(soid & 0xff_ff_ff_ffn);
  const high = Number((soid >> 32n) & 0xff_ff_ff_ffn);
  return Array.from({ length: TALENT_ROLL_SLOTS }, (_, row) => {
    const maximum = rows[row];
    if (maximum === undefined) {
      return 0;
    }
    const hash = mix32(low ^ mix32(high ^ mix32(row + 1)));
    return maximum < 0 ? hash & 0xff : hash % (maximum + 1);
  });
}

// The byte a new instance rolls below its grid's instanceRollLimit (talent
// instance +0x4E), from the item's soid like its rolls; undefined for a grid
// whose limit is 0 or 1. What the client does with it is not known yet: the
// fusion rifles' element node (exclusive, no roll row, 3 steps) is the
// suspect.
export function itemTalentByte(item: {
  defIndex: number;
  soid?: bigint;
}): number | undefined {
  const limit = talentGridDefinitionForDef(item.defIndex)?.instanceRollLimit ?? 0;
  if (limit <= 1) {
    return;
  }
  const soid = item.soid ?? 0n;
  const low = Number(soid & 0xff_ff_ff_ffn);
  const high = Number((soid >> 32n) & 0xff_ff_ff_ffn);
  return mix32(low ^ mix32(high ^ 0x4e_4e_4e_4e)) % limit;
}

// A roll as the wire byte. The client reads the bytes as fractions (byte /
// 255, d1preservation items-and-gear: "consumed as byte/255.0 interpolants"),
// so a node row's value k of 0..maximum goes out in the middle of the bytes
// that read as step k both when the client floors fraction x steps and when
// it rounds fraction x maximum. A full-byte (stat) row goes out as is.
export function talentRollByte(value: number, maximum: number): number {
  if (maximum < 0) {
    return value & 0xff;
  }
  if (maximum === 0) {
    return 0;
  }
  const steps = maximum + 1;
  const low = Math.max(value / steps, (value - 0.5) / maximum);
  const high = Math.min((value + 1) / steps, (value + 0.5) / maximum);
  return Math.min(0xff, Math.max(0, Math.round((0xff * (low + high)) / 2)));
}

// The item's rolls as the 8 wire bytes (8080405E).
export function itemTalentRollBytes(item: {
  defIndex: number;
  soid?: bigint;
}): number[] {
  const rows = talentGridDefinitionForDef(item.defIndex)?.randomRolls ?? [];
  return itemTalentRolls(item).map((value, row) =>
    talentRollByte(value, rows[row] ?? 0)
  );
}

// The step an exclusive node with a random slot offers: the one its row
// rolled. undefined for any other node (its steps activate in order).
function rolledStep(
  node: TalentGridNode,
  rolls: readonly number[]
): number | undefined {
  if (!node.exclusive || node.randomSlot === undefined || node.randomSlot < 0) {
    return;
  }
  const roll = rolls[node.randomSlot] ?? 0;
  return Math.min(roll, Math.max(0, node.steps.length - 1));
}

// The nodes sharing this node's binary pair hash: a group of which only one
// can be active. Empty for a node outside one.
function binaryGroupOf(
  grid: TalentGrid,
  node: TalentGridNode
): TalentGridNode[] {
  if (node.binaryPairHash === k_empty_name_hash) {
    return [];
  }
  return grid.nodes.filter(
    (other) =>
      other.index !== node.index && other.binaryPairHash === node.binaryPairHash
  );
}

// Status codes mirroring the client's activate-step return value (0 = ok).
// wireTalentStatus below maps them onto the 3-bit wire range.
export const TALENT_STATUS_OK = 0 as const;
export const TALENT_STATUS_TIER = 2 as const; // instance+20 < step+42, not produced: steps carry no tier
export const TALENT_STATUS_PREREQUISITE = 3 as const; // a prerequisite node isn't activated
export const TALENT_STATUS_ALREADY_MAXED = 4 as const; // node has no more steps to activate
export const TALENT_STATUS_UNLOCK_EXPRESSION = 5 as const; // unlock expression, not implemented (see below)
export const TALENT_STATUS_MATERIALS = 6 as const; // material cost, not implemented (see below)
export const TALENT_STATUS_ITEM_LEVEL = 7 as const; // item level < step+43
export const TALENT_STATUS_WRONG_BINARY_SIDE = 8 as const; // the node's group already has an active member

type TalentStatus =
  | typeof TALENT_STATUS_ALREADY_MAXED
  | typeof TALENT_STATUS_ITEM_LEVEL
  | typeof TALENT_STATUS_MATERIALS
  | typeof TALENT_STATUS_OK
  | typeof TALENT_STATUS_PREREQUISITE
  | typeof TALENT_STATUS_TIER
  | typeof TALENT_STATUS_UNLOCK_EXPRESSION
  | typeof TALENT_STATUS_WRONG_BINARY_SIDE;

// The 80801AC6/80801AC8 status rides the same 80801A2B nest as every other
// response (i8, 3-bit wire width, bias 1): values above 6 don't fit, and 0
// and 6 both read back as success. This folds the ladder above onto 1..5 so
// a failure never wraps into another status or into "success". The client
// only logs the value on failure, so a many-to-one mapping is fine.
export function wireTalentStatus(status: TalentStatus): number {
  switch (status) {
    case TALENT_STATUS_OK:
      return 0;
    case TALENT_STATUS_MATERIALS:
      return 1;
    case TALENT_STATUS_TIER:
    case TALENT_STATUS_ITEM_LEVEL:
      return 2;
    case TALENT_STATUS_PREREQUISITE:
      return 3;
    case TALENT_STATUS_ALREADY_MAXED:
    case TALENT_STATUS_WRONG_BINARY_SIDE:
      return 4;
    case TALENT_STATUS_UNLOCK_EXPRESSION:
      return 5;
    default:
      return 1;
  }
}

// One activated-step array mutation (soid is implied - always the item being
// activated on).
interface TalentNodeMutation {
  node: number;
  value: number;
}

export interface TalentPlanOk {
  itemSoid: bigint;
  mutations: readonly TalentNodeMutation[];
  status: typeof TALENT_STATUS_OK;
}

interface TalentPlanFailure {
  status: Exclude<TalentStatus, typeof TALENT_STATUS_OK>;
}

export type TalentPlan = TalentPlanFailure | TalentPlanOk;

function resolveNode(
  character: CharacterRecord,
  itemSoid: bigint,
  nodeIndex: number
): { grid: TalentGrid; node: TalentGridNode } | TalentPlanFailure {
  const item = character.loadout.item(itemSoid);
  // The client never opens the talent panel without a resolvable grid, so a
  // request that doesn't resolve is unreachable from a legitimate client.
  // PREREQUISITE is the closest status.
  if (!item?.instanced) {
    return { status: TALENT_STATUS_PREREQUISITE };
  }
  const grid = talentGridDefinitionForDef(item.defIndex);
  const node = grid?.nodes.find((n) => n.index === nodeIndex);
  if (!(grid && node) || nodeIndex < 0 || nodeIndex >= TALENT_NODE_COUNT) {
    return { status: TALENT_STATUS_PREREQUISITE };
  }
  return { grid, node };
}

// Prerequisite nodes not activated: a prerequisite counts as done once its
// own node has activated at least one step.
function prerequisitesMet(
  item: { talentNodes: readonly number[] },
  node: TalentGridNode
): boolean {
  return node.prerequisiteNodes.every(
    (idx) => (item.talentNodes[idx] ?? 0) > 0
  );
}

// A step's required node hash: some node of that group must be active.
function requiredNodeActive(
  item: { talentNodes: readonly number[] },
  grid: TalentGrid,
  requiredNodeHash: number
): boolean {
  return (
    requiredNodeHash === k_empty_name_hash ||
    grid.nodes.some(
      (node) =>
        node.binaryPairHash === requiredNodeHash &&
        (item.talentNodes[node.index] ?? 0) > 0
    )
  );
}

// The item's LEVEL, the way the client derives it: run the earned talent XP
// through the grid's own progression and count the per-level thresholds it
// covers. The client's count starts at -1, so one less than the steps cleared:
// a fresh item has no XP, and a progression whose first step costs something
// comes back -1.
function itemLevel(grid: TalentGrid, talentXp: number): number {
  const progression = progressionDef(grid.progression);
  return progression === undefined
    ? 0
    : levelForXp(progression, talentXp).level - 1;
}

// The ladder both 801 and 802 end on: the step's required node, then the
// item level against the step's level requirement (step+0x1B).
function stepGate(
  item: { talentNodes: readonly number[]; talentXp: number },
  grid: TalentGrid,
  node: TalentGridNode,
  stepIndex: number
): TalentStatus {
  const step = node.steps[stepIndex];
  if (!step) {
    return TALENT_STATUS_ALREADY_MAXED;
  }
  if (!requiredNodeActive(item, grid, step.requiredNodeHash)) {
    return TALENT_STATUS_PREREQUISITE;
  }
  if (itemLevel(grid, item.talentXp) < step.levelRequirement) {
    return TALENT_STATUS_ITEM_LEVEL;
  }
  // The unlock expression and material cost are not evaluated; the client
  // already gates both locally before sending this request.
  return TALENT_STATUS_OK;
}

// talent_grid_activate_step (801). The client sends only soid+node (step is
// always 0, memset) - the server picks the next step itself, like the
// client.
export function planActivateStep(
  character: CharacterRecord,
  itemSoid: bigint,
  nodeIndex: number
): TalentPlan {
  const resolved = resolveNode(character, itemSoid, nodeIndex);
  if ("status" in resolved) {
    return resolved;
  }
  const { grid, node } = resolved;
  const item = character.loadout.item(itemSoid);
  if (!item) {
    return { status: TALENT_STATUS_PREREQUISITE };
  }
  const current = item.talentNodes[nodeIndex] ?? 0;
  // An exclusive node with a roll has one step to buy: the rolled one.
  const rolled = rolledStep(node, itemTalentRolls(item));
  if (current >= (rolled === undefined ? node.steps.length : 1)) {
    return { status: TALENT_STATUS_ALREADY_MAXED };
  }
  // A node whose group already has an active member must be reached through
  // 802 (talent_grid_binary_swap), not 801 (status 8). A group
  // with nothing chosen yet is a normal first activation, not a swap.
  if (
    binaryGroupOf(grid, node).some(
      (other) => (item.talentNodes[other.index] ?? 0) > 0
    )
  ) {
    return { status: TALENT_STATUS_WRONG_BINARY_SIDE };
  }
  if (!prerequisitesMet(item, node)) {
    return { status: TALENT_STATUS_PREREQUISITE };
  }
  const gate = stepGate(item, grid, node, rolled ?? current);
  if (gate !== TALENT_STATUS_OK) {
    return { status: gate };
  }
  return {
    itemSoid,
    status: TALENT_STATUS_OK,
    mutations: [{ node: nodeIndex, value: current + 1 }],
  };
}

// talent_grid_binary_swap (802): deactivate the currently active member of
// the node's group and activate this one. The group member's own additional
// gate (step+92) is not in the step record and is left out.
export function planBinarySwap(
  character: CharacterRecord,
  itemSoid: bigint,
  nodeIndex: number
): TalentPlan {
  const resolved = resolveNode(character, itemSoid, nodeIndex);
  if ("status" in resolved) {
    return resolved;
  }
  const { grid, node } = resolved;
  const item = character.loadout.item(itemSoid);
  if (!item) {
    return { status: TALENT_STATUS_PREREQUISITE };
  }
  const group = binaryGroupOf(grid, node);
  if (group.length === 0) {
    // Not in a group - 802 doesn't apply.
    return { status: TALENT_STATUS_WRONG_BINARY_SIDE };
  }
  if ((item.talentNodes[nodeIndex] ?? 0) > 0) {
    // Already the active side - nothing to swap to.
    return { status: TALENT_STATUS_ALREADY_MAXED };
  }
  if (!prerequisitesMet(item, node)) {
    return { status: TALENT_STATUS_PREREQUISITE };
  }
  const gate = stepGate(
    item,
    grid,
    node,
    rolledStep(node, itemTalentRolls(item)) ?? 0
  );
  if (gate !== TALENT_STATUS_OK) {
    return { status: gate };
  }
  return {
    itemSoid,
    status: TALENT_STATUS_OK,
    mutations: [
      { node: nodeIndex, value: 1 },
      ...group
        .filter((other) => (item.talentNodes[other.index] ?? 0) > 0)
        .map((other) => ({ node: other.index, value: 0 })),
    ],
  };
}

export async function applyTalentPlan(
  store: CharacterStore,
  character: CharacterRecord,
  plan: TalentPlanOk
): Promise<void> {
  for (const mutation of plan.mutations) {
    character.loadout.setTalentNode(
      plan.itemSoid,
      mutation.node,
      mutation.value
    );
    await store.setItemTalentNode(plan.itemSoid, mutation.node, mutation.value);
  }
}

// Whether a node counts as active on an item: a step activated, or
// auto-granted with no other member of its binary group activated (a swap
// to another member turns an auto-granted default off).
export function isTalentNodeActive(
  grid: TalentGrid,
  item: { talentNodes: readonly number[] },
  node: TalentGridNode
): boolean {
  if ((item.talentNodes[node.index] ?? 0) > 0) {
    return true;
  }
  return (
    node.autoGranted &&
    !binaryGroupOf(grid, node).some(
      (other) => (item.talentNodes[other.index] ?? 0) > 0
    )
  );
}

// The steps active on each active node: the first talentNodes[node] of them,
// at least one for an active auto-granted node; for an exclusive node with a
// roll, the rolled step alone.
function activeSteps(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): { node: TalentGridNode; steps: TalentGridNode["steps"] }[] {
  const grid = talentGridDefinitionForDef(item.defIndex);
  if (!grid) {
    return [];
  }
  const rolls = itemTalentRolls(item);
  return grid.nodes
    .filter((node) => isTalentNodeActive(grid, item, node))
    .map((node) => {
      const rolled = rolledStep(node, rolls);
      const step = rolled === undefined ? undefined : node.steps[rolled];
      return {
        node,
        steps:
          rolled === undefined
            ? node.steps.slice(
                0,
                Math.max(1, item.talentNodes[node.index] ?? 0)
              )
            : step
              ? [step]
              : [],
      };
    });
}

// The perks an item's grid grants as it stands.
export function activeTalentPerks(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): number[] {
  return activeSteps(item).flatMap(({ steps }) =>
    steps.flatMap((step) => step.perks ?? [])
  );
}

// The investment stats an item's active steps add, by stat key: value x
// scale, the scale the minimum one, or lerped to the maximum by the item's
// roll in the stat's random slot / 255.
export function activeTalentStats(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): Map<number, number> {
  const stats = new Map<number, number>();
  const rolls = itemTalentRolls(item);
  for (const { steps } of activeSteps(item)) {
    for (const step of steps) {
      for (const stat of step.stats ?? []) {
        const scale =
          stat.randomSlot >= 0
            ? stat.minimumScale +
              ((stat.maximumScale - stat.minimumScale) *
                (rolls[stat.randomSlot] ?? 0)) /
                255
            : stat.minimumScale;
        stats.set(
          stat.key,
          (stats.get(stat.key) ?? 0) + Math.round(stat.value * scale)
        );
      }
    }
  }
  return stats;
}

// The nodes active on an item, by index (isTalentNodeActive).
export function activeTalentNodes(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): Set<number> {
  return new Set(activeSteps(item).map(({ node }) => node.index));
}

// The ability modifiers an item's active steps carry: {modifier hash, target
// ability} for every link with a name hash (a grant's is empty).
export function activeAbilityModifiers(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): { hash: number; target: number }[] {
  const found: { hash: number; target: number }[] = [];
  for (const { steps } of activeSteps(item)) {
    for (const step of steps) {
      for (const link of step.links ?? []) {
        if (link.nameHash !== k_empty_name_hash && link.nameHash !== 0) {
          found.push({ hash: link.nameHash >>> 0, target: link.target });
        }
      }
    }
  }
  return found;
}

// An item's whole perk list as the world reads it: the def's own perks, then
// its active talent perks, deduplicated.
export function itemPerks(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): number[] {
  return [
    ...new Set([...(itemDef(item.defIndex)?.perks ?? []), ...activeTalentPerks(item)]),
  ];
}

// One line per active node of an item's grid: its index, auto flag, active
// step count, and every link of its active steps as
// hash/target/node/ability (hex hash), for the log.
export function describeActiveTalentNodes(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): string {
  return activeSteps(item)
    .map(({ node, steps }) => {
      const links = steps
        .flatMap((step) => step.links ?? [])
        .map(
          (link) =>
            `${(link.nameHash >>> 0).toString(16)}/${link.target}/${link.node}/${link.ability}`
        );
      return `n${node.index}${node.autoGranted ? "a" : ""}x${steps.length}[${links.join(" ")}]`;
    })
    .join(" ");
}

const LINK_NONE = 0xff;

// Ability overrides an item's active steps make through chain links: a link
// with node, step, index and ability all set points at another node's grant
// (node, step, link index) and puts its own ability in that grant's slot.
// Voidwalker's Blink is one: node 8's link {node 14, step 0, index 0,
// ability 0} turns node 14's jump grant (ability 4, slot 3) into ability 0.
// Only applies while the pointed-at node is active.
export function activeAbilityOverrides(item: {
  defIndex: number;
  soid?: bigint;
  talentNodes: readonly number[];
}): { ability: number; slot: number }[] {
  const grid = talentGridDefinitionForDef(item.defIndex);
  if (!grid) {
    return [];
  }
  const overrides: { ability: number; slot: number }[] = [];
  for (const { steps } of activeSteps(item)) {
    for (const step of steps) {
      for (const link of step.links ?? []) {
        if (
          link.node === LINK_NONE ||
          link.step === undefined ||
          link.step === LINK_NONE ||
          link.index === undefined ||
          link.index === LINK_NONE ||
          link.ability === LINK_NONE
        ) {
          continue;
        }
        const targetNode = grid.nodes[link.node];
        const target = targetNode?.steps[link.step]?.links?.[link.index];
        if (
          !(targetNode && target?.word) ||
          !isTalentNodeActive(grid, item, targetNode)
        ) {
          continue;
        }
        overrides.push({ ability: link.ability, slot: target.word >>> 24 });
      }
    }
  }
  return overrides;
}
