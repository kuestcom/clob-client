//npm install @kuestcom/clob-client
//npm install ethers
//Client initialization example and dumping API Keys

import { Chain, ClobClient, OrderType, Side, SignatureType } from "../src/index.ts";
import { Wallet } from "@ethersproject/wallet";

const host = "https://clob.kuest.com";
const chainId = parseInt(`${process.env.CHAIN_ID || Chain.POLYGON}`) as Chain;
const funder = process.env.DEPOSIT_WALLET || ""; // Deposit Wallet address that holds funds.
const signer = new Wallet(process.env.PK || ""); // Private key for the owner wallet.

//In general don't create a new API key, always derive or createOrDerive
const creds = new ClobClient(host, chainId, signer).createOrDeriveApiKey();

const signatureType = SignatureType.DEPOSIT_WALLET;
(async () => {
    const clobClient = new ClobClient(host, chainId, signer, await creds, signatureType, funder);
    const resp2 = await clobClient.createAndPostOrder(
        {
            tokenID: "", //Use https://docs.kuest.com/developers/gamma-markets-api/get-markets to grab a sample token
            price: 0.01,
            side: Side.BUY,
            size: 5,
        },
        { tickSize: "0.001", negRisk: false }, //You'll need to adjust these based on the market. Get the tickSize and negRisk T/F from the get-markets above
        //{ tickSize: "0.001",negRisk: true },

        OrderType.GTC,
        false, // deferExec
        false, // postOnly (set true to avoid immediate matching; only supported for GTC/GTD)
    );
    console.log(resp2);
})();
