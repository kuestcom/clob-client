import { describe, expect, it, vi } from "vitest";
import { ZERO_BYTES32 } from "../src/order-utils/exchange.order.const.ts";
import { Side as OrderSide, SignatureType } from "../src/order-utils/index.ts";
import { OrderType } from "../src/types.ts";
import { MIN_GTD_EXPIRATION_SECONDS, normalizeNextCursor, orderToJson } from "../src/utilities.ts";

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

    it("rejects GTD orders below the minimum expiration", () => {
        expect(() =>
            orderToJson(
                {
                    ...signedOrder,
                    expiration: `${Math.floor(Date.now() / 1000) + 60}`,
                },
                "owner-key",
                OrderType.GTD,
            ),
        ).toThrow("GTD expiration must be at least 3 minutes in the future");
    });

    it("serializes GTD orders at the minimum expiration", () => {
        const now = 1_715_731_200_000;
        vi.spyOn(Date, "now").mockReturnValue(now);
        const expiration = Math.floor(now / 1000) + MIN_GTD_EXPIRATION_SECONDS;

        try {
            const payload = orderToJson(
                {
                    ...signedOrder,
                    expiration: `${expiration}`,
                },
                "owner-key",
                OrderType.GTD,
            );

            expect(payload.order.expiration).to.equal(`${expiration}`);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it("serializes GTD orders above the minimum expiration", () => {
        const expiration = Math.floor(Date.now() / 1000) + MIN_GTD_EXPIRATION_SECONDS + 1;

        const payload = orderToJson(
            {
                ...signedOrder,
                expiration: `${expiration}`,
            },
            "owner-key",
            OrderType.GTD,
        );

        expect(payload.order.expiration).to.equal(`${expiration}`);
    });
});

describe("normalizeNextCursor", () => {
    it("normalizes missing and empty cursors to the end cursor", () => {
        expect(normalizeNextCursor(undefined)).to.equal("LTE=");
        expect(normalizeNextCursor("")).to.equal("LTE=");
        expect(normalizeNextCursor("   ")).to.equal("LTE=");
    });

    it("stops pagination when the server repeats the current cursor", () => {
        expect(normalizeNextCursor("MA==", "MA==")).to.equal("LTE=");
    });

    it("preserves a new non-empty cursor", () => {
        expect(normalizeNextCursor("MTAw", "MA==")).to.equal("MTAw");
    });
});
