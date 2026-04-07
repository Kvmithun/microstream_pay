import algosdk from "algosdk";

export const ALGOD_SERVER =
  process.env.REACT_APP_ALGOD_SERVER || "https://testnet-api.algonode.cloud";
export const ALGOD_PORT = process.env.REACT_APP_ALGOD_PORT || "";
export const ALGOD_TOKEN = process.env.REACT_APP_ALGOD_TOKEN || "";
export const APP_ID = Number(process.env.REACT_APP_APP_ID || 758275892);

export const appIdConfigured = Number.isInteger(APP_ID) && APP_ID > 0;
export const appAddress = appIdConfigured ? algosdk.getApplicationAddress(APP_ID).toString() : "";

export const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
