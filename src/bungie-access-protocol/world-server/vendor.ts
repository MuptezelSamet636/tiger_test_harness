import {
  applyPurchase,
  applySale,
  planPurchase,
  planSale,
  VENDOR_STATUS_INVALID_ARGUMENTS,
  VENDOR_STATUS_OK,
} from "../../investment/vendor";
import {
  buildVendorBuyItemResponseBody,
  buildVendorSellItemResponseBody,
  parseVendorBuyItemRequest,
  parseVendorSellItemRequest,
} from "../rsat";
import { BOUNTY_REWARD_REASON } from "../../investment/bounty-rules";
import { selfFamilyPublisherFor } from "../../players/registry";
import type { WorldServerHandler } from "./context";

export const vendorBuyItem: WorldServerHandler = async (ctx, message) => {
  const req = parseVendorBuyItemRequest(message.body);
  const character = ctx.character();
  const loadout = character?.loadout;
  const plan =
    req && loadout
      ? planPurchase(
          loadout,
          req.vendorIndex,
          req.purchaseIndex,
          character?.appearance.classIndex
        )
      : { status: VENDOR_STATUS_INVALID_ARGUMENTS };
  let newItemSoid: bigint | null = null;
  // An instanced cost (a world engram the Cryptarch decodes) leaves the bag.
  let spentSoid: bigint | null = null;
  let granted = "";
  if (plan.status === VENDOR_STATUS_OK && character) {
    newItemSoid = await applyPurchase(ctx.store, character, plan);
    spentSoid = plan.cost?.remove ? plan.cost.item.soid : null;
    // A bounty turned in: its XP and reputation.
    if (plan.action.kind === "consume") {
      const { experience, reputation } = plan.action.rewards;
      for (const [index, amount] of reputation) {
        const xp = await ctx.store.addProgression?.(
          character.soid,
          index,
          amount
        );
        if (xp !== undefined) {
          character.reputation = { ...character.reputation, [index]: xp };
        }
        granted += ` +${amount} progression ${index}`;
      }
      if (experience > 0) {
        selfFamilyPublisherFor(character.soid)?.grantXp(
          experience,
          BOUNTY_REWARD_REASON
        );
        granted += ` +${experience} XP`;
      }
    }
  }
  ctx.reply(
    message,
    buildVendorBuyItemResponseBody(plan.status),
    `vendor_buy_item vendor=${req?.vendorIndex ?? -1} ` +
      `purchase=${req?.purchaseIndex ?? -1} status=${plan.status}` +
      (plan.status === VENDOR_STATUS_OK && plan.action.kind === "insert"
        ? ` gave def=${plan.action.seed.defIndex}`
        : "") +
      (spentSoid ? ` spent soid=0x${spentSoid.toString(16)}` : "") +
      granted
  );
  if (plan.status === VENDOR_STATUS_OK) {
    ctx.pushInventoryChange(
      newItemSoid ? [newItemSoid] : [],
      spentSoid ? [spentSoid] : [],
      "vendor_buy_item"
    );
  }
};

export const vendorSellItem: WorldServerHandler = async (ctx, message) => {
  const req = parseVendorSellItemRequest(message.body);
  const character = ctx.character();
  const loadout = character?.loadout;
  const plan =
    req && loadout
      ? planSale(loadout, req.vendorIndex, req, req.quantity)
      : { status: VENDOR_STATUS_INVALID_ARGUMENTS };
  let removedItemSoid: bigint | null = null;
  if (plan.status === VENDOR_STATUS_OK && character) {
    removedItemSoid = await applySale(ctx.store, character, plan);
  }
  ctx.reply(
    message,
    buildVendorSellItemResponseBody(plan.status),
    `vendor_sell_item vendor=${req?.vendorIndex ?? -1} ` +
      `soid=0x${(req?.itemSoid ?? 0n).toString(16)} status=${plan.status}`
  );
  if (plan.status === VENDOR_STATUS_OK) {
    ctx.pushInventoryChange(
      [],
      removedItemSoid ? [removedItemSoid] : [],
      "vendor_sell_item"
    );
  }
};
