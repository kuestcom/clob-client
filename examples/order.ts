//npm install @kuestcom/clob-client
//npm install ethers
//Client initialization example and dumping API Keys

import { Wallet } from '@ethersproject/wallet'

import { ClobClient, OrderType, Side, SignatureType } from '../src/index.ts'

const host = 'https://clob.kuest.com'
const funder = '' //This is your Deposit Wallet address that holds funds.
const signer = new Wallet('') //This is your Private Key. If using email login export from https://reveal.magic.link/kuest otherwise export from your Web3 Application

//In general don't create a new API key, always derive or createOrDerive
const creds = new ClobClient(host, 80002, signer).createOrDeriveApiKey()

const signatureType = SignatureType.DEPOSIT_WALLET
void (async () => {
  const clobClient = new ClobClient(host, 80002, signer, await creds, signatureType, funder)
  const resp2 = await clobClient.createAndPostOrder(
    {
      tokenID: '', //Use https://docs.kuest.com/developers/gamma-markets-api/get-markets to grab a sample token
      price: 0.01,
      side: Side.BUY,
      size: 5,
    },
    { tickSize: '0.001', negRisk: false }, //You'll need to adjust these based on the market. Get the tickSize and negRisk T/F from the get-markets above
    //{ tickSize: "0.001",negRisk: true },

    OrderType.GTC,
    false, // deferExec
    false, // postOnly (set true to avoid immediate matching; only supported for GTC/GTD)
  )
  console.log(resp2)
})()
