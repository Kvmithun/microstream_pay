import algosdk from "algosdk";

export const ALGOD_SERVER =
  process.env.REACT_APP_ALGOD_SERVER || "https://testnet-api.algonode.cloud";
export const ALGOD_PORT = process.env.REACT_APP_ALGOD_PORT || "";
export const ALGOD_TOKEN = process.env.REACT_APP_ALGOD_TOKEN || "";

export const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
export function getAppAddress(appId) {
  if (!appId) {
    return "";
  }
  return algosdk.getApplicationAddress(Number(appId)).toString();
}
