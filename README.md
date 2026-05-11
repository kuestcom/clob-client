# Kuest CLOB Client

<a href='https://www.npmjs.com/package/@kuestcom/clob-client'>
    <img src='https://img.shields.io/npm/v/@kuestcom/clob-client.svg' alt='NPM'/>
</a>

Typescript client for the Kuest CLOB

### Usage

```ts
// npm install @kuestcom/clob-client
// npm install ethers
// Client initialization example and dumping API Keys

import { ApiKeyCreds, ClobClient, OrderType, Side, SignatureType } from "@kuestcom/clob-client";
import { Wallet } from "@ethersproject/wallet";

const host = 'https://clob.kuest.com';
const depositWallet = ''; // Deposit Wallet address that holds funds.
const signer = new Wallet(""); // This is your Private Key.


// In general don't create a new API key, always derive or createOrDerive
const creds = new ClobClient(host, 80002, signer).createOrDeriveApiKey();

  (async () => {
    const clobClient = new ClobClient(
        host,
        80002,
        signer,
        await creds,
        SignatureType.DEPOSIT_WALLET,
        depositWallet,
    );
    const resp2 = await clobClient.createAndPostOrder(
        {
            tokenID: "", //Use https://docs.kuest.com/developers/gamma-markets-api/get-markets to grab a sample token
            price: 0.01,
            side: Side.BUY,
            size: 5,
        },
        { tickSize: "0.001",negRisk: false }, //You'll need to adjust these based on the market. Get the tickSize and negRisk T/F from the get-markets above
        //{ tickSize: "0.001",negRisk: true },

        OrderType.GTC, 
    );
    console.log(resp2)
  })();
```

See [examples](examples/) for more information

### Builder signing

Builder signing: controlled by `src/site-config.ts`.
Set `builder_mode` to `true` there to enable builder headers for this SDK build.

### Using viem WalletClient

```ts
import { ClobClient } from "@kuestcom/clob-client";
import { createWalletClient, http } from "viem";
import { polygonAmoy } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const host = "https://clob.kuest.com";
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
    account,
    chain: polygonAmoy,
    transport: http(),
});

const clobClient = new ClobClient(host, 80002, walletClient);
```

### Error Handling

By default, API errors are returned as `{ error: "...", status: ... }` objects. To have the client throw errors instead, pass `throwOnError: true` as the last constructor argument:

```ts
import { ClobClient, ApiError, SignatureType } from "@kuestcom/clob-client";

const clobClient = new ClobClient(
    host, 80002, signer, await creds, SignatureType.DEPOSIT_WALLET, depositWallet,
    undefined, // geoBlockToken
    undefined, // useServerTime
    undefined, // builderConfig
    undefined, // getSigner
    undefined, // retryOnError
    undefined, // tickSizeTtlMs
    true,      // throwOnError
);

try {
    const book = await clobClient.getOrderBook(tokenID);
} catch (e) {
    if (e instanceof ApiError) {
        console.log(e.message); // "No orderbook exists for the requested token id"
        console.log(e.status);  // 404
        console.log(e.data);    // full error response object from the API
    }
}
```
