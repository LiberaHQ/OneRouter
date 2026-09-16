import * as engine from "./engine";

// /v1/me/credit hands out balance for nothing. Fine while the engine is local and
// there's nothing real to spend; must be opted into once a real upstream is
// configured, or it's a free-money endpoint on a live gateway.
export const DEV_CREDIT = (process.env.ONEROUTER_DEV_CREDIT ?? (engine.LIVE ? "0" : "1")) === "1";

export const MAX_BODY = 2 * 1024 * 1024;
