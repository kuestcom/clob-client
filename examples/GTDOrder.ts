import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";
import { ethers } from "ethers";
import {
    type ApiKeyCreds,
    Chain,
    ClobClient,
    OrderType,
    Side,
    SignatureType,
} from "../src/index.ts";

dotenvConfig({ path: resolve(import.meta.dirname, "../.env") });

async function main() {
    const wallet = new ethers.Wallet(`${process.env.PK}`);
    const chainId = parseInt(`${process.env.CHAIN_ID || Chain.AMOY}`, 10) as Chain;
    console.log(`Address: ${await wallet.getAddress()}, chainId: ${chainId}`);

    const host = process.env.CLOB_API_URL || "http://localhost:8080";
    const creds: ApiKeyCreds = {
        key: `${process.env.CLOB_API_KEY}`,
        secret: `${process.env.CLOB_SECRET}`,
        passphrase: `${process.env.CLOB_PASS_PHRASE}`,
    };
    const depositWallet = process.env.DEPOSIT_WALLET;
    if (!depositWallet) {
        throw new Error("DEPOSIT_WALLET is required for Deposit Wallet orders");
    }
    const clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        creds,
        SignatureType.DEPOSIT_WALLET,
        depositWallet,
    );

    // Create a buy order for 100 YES for 0.50c with an expiration of 3 minutes.
    const YES = "71321045679252212594626385532706912750332728571942532289631379312455583992563";
    const threeMinutes = Math.floor(Date.now() / 1000) + 3 * 60 + 10;

    const order = await clobClient.createOrder({
        tokenID: YES,
        price: 0.5,
        side: Side.SELL,
        size: 1000,
        expiration: threeMinutes,
    });
    console.log("Created Order", order);

    // Send it to the server
    const resp = await clobClient.postOrder(order, OrderType.GTD);
    console.log(resp);

    // Create the order and send it to the server in a single step
    const resp2 = await clobClient.createAndPostOrder(
        {
            tokenID: YES,
            price: 0.5,
            side: Side.BUY,
            size: 100,
            expiration: threeMinutes,
        },
        { tickSize: "0.01" },
        OrderType.GTD,
    );
    console.log(resp2);
}

main();
