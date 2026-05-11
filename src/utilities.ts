import { ZERO_BYTES32 } from "./order-utils/exchange.order.const.ts";
import type { SignedOrder } from "./order-utils/index.ts";
import { SignatureType, Side as UtilsSide } from "./order-utils/index.ts";
import { getSiteOrderPayload } from "./site-config.ts";
import type { NewOrder, OrderBookSummary, TickSize } from "./types.ts";
import { OrderType, Side } from "./types.ts";

export function orderToJson<T extends OrderType>(
    order: SignedOrder,
    owner: string,
    orderType: T,
    deferExec = false,
    postOnly?: boolean,
): NewOrder<T> {
    if (order.signatureType !== SignatureType.DEPOSIT_WALLET) {
        throw new Error("Kuest order submission supports only Deposit Wallet signature type 3");
    }

    if (postOnly === true && orderType !== OrderType.GTC && orderType !== OrderType.GTD) {
        throw new Error("postOnly is only supported for GTC and GTD orders");
    }

    let side = Side.BUY;
    if (order.side === UtilsSide.BUY) {
        side = Side.BUY;
    } else {
        side = Side.SELL;
    }

    return {
        deferExec,
        order: {
            salt: Number.parseInt(order.salt, 10),
            maker: order.maker,
            signer: order.signer,
            tokenId: order.tokenId,
            makerAmount: order.makerAmount,
            takerAmount: order.takerAmount,
            side,
            expiration: order.expiration,
            signatureType: order.signatureType,
            timestamp: order.timestamp ?? "0",
            metadata:
                order.metadata ??
                "0x0000000000000000000000000000000000000000000000000000000000000000",
            builder:
                order.builder ??
                "0x0000000000000000000000000000000000000000000000000000000000000000",
            signature: order.signature,
        },
        owner,
        orderType,
        ...getSiteOrderPayload(),
        ...(typeof postOnly === "boolean" ? { postOnly } : {}),
    } as NewOrder<T>;
}

export const roundNormal = (num: number, decimals: number): number => {
    if (decimalPlaces(num) <= decimals) {
        return num;
    }
    return Math.round((num + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;
};

export const roundDown = (num: number, decimals: number): number => {
    if (decimalPlaces(num) <= decimals) {
        return num;
    }
    return Math.floor(num * 10 ** decimals) / 10 ** decimals;
};

export const roundUp = (num: number, decimals: number): number => {
    if (decimalPlaces(num) <= decimals) {
        return num;
    }
    return Math.ceil(num * 10 ** decimals) / 10 ** decimals;
};

export const decimalPlaces = (num: number): number => {
    if (Number.isInteger(num)) {
        return 0;
    }

    const arr = num.toString().split(".");
    if (arr.length <= 1) {
        return 0;
    }

    return arr[1].length;
};

/**
 * Converts ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Calculates the hash for the given orderbook
 * @param orderbook
 * @returns
 */
export const generateOrderBookSummaryHash = async (
    orderbook: OrderBookSummary,
): Promise<string> => {
    orderbook.hash = "";
    const message = JSON.stringify(orderbook);
    const messageBuffer = new TextEncoder().encode(message);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-1", messageBuffer);
    const hash = arrayBufferToHex(hashBuffer);
    orderbook.hash = hash;
    return hash;
};

export const isTickSizeSmaller = (a: TickSize, b: TickSize): boolean => {
    return Number.parseFloat(a) < Number.parseFloat(b);
};

export const priceValid = (price: number, tickSize: TickSize): boolean => {
    return price >= Number.parseFloat(tickSize) && price <= 1 - Number.parseFloat(tickSize);
};

export const builderCodeToBytes32 = (builderCode?: string): string => {
    const value = builderCode?.trim();
    if (!value || value === ZERO_BYTES32) {
        return ZERO_BYTES32;
    }

    const hex = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
    if (/^[0-9a-fA-F]{40}$/.test(hex)) {
        return `0x${hex.padStart(64, "0")}`.toLowerCase();
    }
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
        return `0x${hex}`.toLowerCase();
    }

    throw new Error("builderCode must be an address or bytes32 hex string");
};

export const adjustBuyAmountForFees = (
    amount: number,
    price: number,
    userUSDCBalance: number,
    kuestTakerFeeRateBps: number,
    builderTakerFeeRateBps: number,
): number => {
    const totalFeeRate = (kuestTakerFeeRateBps + builderTakerFeeRateBps) / 10_000;
    const totalCost = amount * (1 + totalFeeRate);
    if (userUSDCBalance >= totalCost) {
        return amount;
    }
    const adjusted = userUSDCBalance / (1 + totalFeeRate);
    if (adjusted <= 0) {
        throw new Error(
            `userUSDCBalance ${userUSDCBalance} too small to cover fees at price ${price}`,
        );
    }
    return adjusted;
};
