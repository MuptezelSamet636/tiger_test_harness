import type { DemonwareBuild } from "../demonware-build";

// Destiny's Demonware title, set in demonware_lobby_update. 18407 is the
// Xbox 360 client's; the PS4 client (CUSA00568) uses 5474.
const DEMONWARE_TITLE_ID = 5474;

// 1021 is the lobby port after Demonware auth (demonware_lobby_update); 1020
// is the unauthenticated one.
const LOBBY_PORTS = [1020, 1021, 1011] as const;

// bdAuth task ids: the 360 client asks with 42 and wants 43 back (checked at
// 0x83078C44, code 700 at 0x83078CB4); the PS4 client asks with 46 and wants
// 47.
const AUTH_TASK_REQUEST = 46;
const AUTH_TASK_REPLY = 47;
const AUTH_CODE_OK = 700;

// bdAuthTicket magic, checked at 0x83078E60 (bytes DE AD BD EF).
const AUTH_TICKET_MAGIC = 0xef_bd_ad_de;

export function loadDemonwareBuild(): DemonwareBuild {
  return {
    auth: {
      authCodeOk: AUTH_CODE_OK,
      authTaskReply: AUTH_TASK_REPLY,
      authTaskRequest: AUTH_TASK_REQUEST,
      authTicketMagic: AUTH_TICKET_MAGIC,
      titleId: DEMONWARE_TITLE_ID,
    },
    lobbyPorts: LOBBY_PORTS,
    // The PS4 client speaks lobby protocol 210 and matchmaking service 138
    // (the 360 client: 200 and 21).
    lobbyProtocol: 210,
    matchMakingService: 138,
  };
}
