import { vaultVendor } from "../../../content/vault";
import { transferItem } from "../../../investment/vault";
import type { WorldServerHandler } from "../../world-server/context";
import {
  buildVaultTransferResponseBody,
  parseVaultTransferRequest,
} from "./messages";

// The transfer request's network id; its name is not cracked
// (server-message-ids.ts).
export const VAULT_TRANSFER_NETWORK_ID = 405;

// The vault terminal's transfer (405), both ways (investment/vault.ts). On
// success the self family is pushed whole: the character's bag and the
// account's vault (self primary) both changed, and a vault item's object has
// to be on the client wherever it sits.
export const vaultTransfer: WorldServerHandler = async (
  ctx,
  message,
  networkId
) => {
  const req = parseVaultTransferRequest(message.body);
  const character = ctx.character();
  let ok = false;
  let detail: string;
  if (!req) {
    detail = "unparsed";
  } else if (!character) {
    detail = "no character";
  } else if (req.vendorIndex !== vaultVendor()?.vendorIndex) {
    detail = `vendor ${req.vendorIndex} is not the vault`;
  } else {
    const result = await transferItem(ctx.store, character, req.itemSoid);
    ok = result.ok;
    detail = result.ok
      ? `${result.direction} def=${result.defIndex} bucket=${result.bucket}`
      : `refused: ${result.reason}`;
  }
  ctx.reply(
    message,
    buildVaultTransferResponseBody(networkId, ok),
    `vault transfer ${ok ? "ok" : "FAILED"} ` +
      `soid=0x${(req?.itemSoid ?? 0n).toString(16)} ` +
      `vendor=${req?.vendorIndex ?? "?"} bucket=${req?.bucket ?? "?"} ` +
      `qty=${req?.quantity ?? "?"} ${detail}`
  );
  if (ok) {
    ctx.pushSelfUpdate("vault transfer");
  }
};
