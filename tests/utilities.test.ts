import { describe, expect, it } from "vitest";
import { ZERO_BYTES32 } from "../src/order-utils/exchange.order.const.ts";
import { SignatureType, Side as OrderSide } from "../src/order-utils/index.ts";
import { OrderType } from "../src/types.ts";
import { orderToJson } from "../src/utilities.ts";

const signedOrder = {
    salt: "1",
    maker: "0x1111111111111111111111111111111111111111",
    signer: "0x1111111111111111111111111111111111111111",
    tokenId: "101",
    makerAmount: "1000000",
    takerAmount: "2000000",
    side: OrderSide.BUY,
    expiration: "0",
    timestamp: "1715731200000",
    metadata: ZERO_BYTES32,
    builder: ZERO_BYTES32,
    signatureType: SignatureType.DEPOSIT_WALLET,
    signature: "0x1234",
};

describe("orderToJson", () => {
    it("serializes Deposit Wallet type 3 orders", () => {
        const payload = orderToJson(signedOrder, "owner-key", OrderType.GTC);

        expect(payload.order.signatureType).to.equal(3);
        expect(payload.order.maker).to.equal(signedOrder.maker);
        expect(payload.order.signer).to.equal(signedOrder.signer);
        expect(payload.owner).to.equal("owner-key");
    });

    it("rejects legacy signature types", () => {
        expect(() =>
            orderToJson(
                {
                    ...signedOrder,
                    signatureType: 2 as SignatureType,
                },
                "owner-key",
                OrderType.GTC,
            ),
        ).toThrow("Deposit Wallet signature type 3");
    });
});
