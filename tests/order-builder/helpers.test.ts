import { Wallet } from "@ethersproject/wallet";
import { describe, expect, it } from "vitest";
import { createOrder } from "../../src/order-builder/helpers.ts";
import { SignatureType } from "../../src/order-utils/index.ts";
import { Chain, Side } from "../../src/types.ts";

const PRIVATE_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEPOSIT_WALLET = "0x1111111111111111111111111111111111111111";

describe("createOrder", () => {
    it("builds Deposit Wallet type 3 orders with the funder as maker and signer", async () => {
        const wallet = new Wallet(PRIVATE_KEY);
        const signedOrder = await createOrder(
            wallet,
            Chain.AMOY,
            SignatureType.DEPOSIT_WALLET,
            DEPOSIT_WALLET,
            {
                tokenID: "101",
                price: 0.5,
                size: 10,
                side: Side.BUY,
            },
            {
                tickSize: "0.01",
                negRisk: false,
            },
        );

        expect(signedOrder.maker).to.equal(DEPOSIT_WALLET);
        expect(signedOrder.signer).to.equal(DEPOSIT_WALLET);
        expect(signedOrder.signatureType).to.equal(SignatureType.DEPOSIT_WALLET);
        expect(signedOrder.signature).to.match(/^0x[0-9a-f]+$/i);
        expect(signedOrder.signature.length).to.be.greaterThan(132);
    });

    it("rejects legacy signature types", async () => {
        const wallet = new Wallet(PRIVATE_KEY);
        await expect(
            createOrder(
                wallet,
                Chain.AMOY,
                1 as SignatureType,
                DEPOSIT_WALLET,
                {
                    tokenID: "101",
                    price: 0.5,
                    size: 10,
                    side: Side.BUY,
                },
                {
                    tickSize: "0.01",
                    negRisk: false,
                },
            ),
        ).rejects.toThrow("Deposit Wallet signature type 3");
    });
});
