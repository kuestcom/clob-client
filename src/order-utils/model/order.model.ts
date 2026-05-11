import type { EIP712Object } from "./eip712.model.ts";
import type { Side } from "./order-side.model.ts";
import type { SignatureType } from "./signature-types.model.ts";

export type OrderSignature = string;

export type OrderHash = string;

export interface OrderData {
    /**
     * Maker of the order, i.e the source of funds for the order
     */
    maker: string;

    /**
     * Token Id of the CTF ERC1155 asset to be bought or sold.
     * If BUY, this is the tokenId of the asset to be bought, i.e the makerAssetId
     * If SELL, this is the tokenId of the asset to be sold, i.e the takerAssetId
     */
    tokenId: string;

    /**
     * Maker amount, i.e the max amount of tokens to be sold
     */
    makerAmount: string;

    /**
     * Taker amount, i.e the minimum amount of tokens to be received
     */
    takerAmount: string;

    /**
     * The side of the order, BUY or SELL
     */
    side: Side;

    /**
     * Signer of the order. Optional, if it is not present the signer is the maker of the order.
     */
    signer?: string;

    /**
     * Expiration timestamp kept offchain by the CLOB.
     */
    expiration?: string;

    /**
     * Millisecond timestamp included in the signed order.
     */
    timestamp?: string;

    /**
     * Metadata bytes32 included in the signed order.
     */
    metadata?: string;

    /**
     * Builder code bytes32 included in the signed order.
     */
    builder?: string;

    /**
     * Signature type used by the Order. Kuest supports only Deposit Wallet type 3.
     */
    signatureType?: SignatureType;
}

export interface Order extends EIP712Object {
    /**
     * Unique salt to ensure entropy
     */
    readonly salt: string;

    /**
     * Maker of the order, i.e the source of funds for the order
     */
    readonly maker: string;

    /**
     * Signer of the order
     */
    readonly signer: string;

    /**
     * Token Id of the CTF ERC1155 asset to be bought or sold.
     * If BUY, this is the tokenId of the asset to be bought, i.e the makerAssetId
     * If SELL, this is the tokenId of the asset to be sold, i.e the takerAssetId
     */
    readonly tokenId: string;

    /**
     * Maker amount, i.e the max amount of tokens to be sold
     */
    readonly makerAmount: string;

    /**
     * Taker amount, i.e the minimum amount of tokens to be received
     */
    readonly takerAmount: string;

    /**
     * Expiration timestamp kept offchain by the CLOB.
     */
    readonly expiration: string;

    /**
     * Millisecond timestamp included in the signed order.
     */
    readonly timestamp: string;

    /**
     * Metadata bytes32 included in the signed order.
     */
    readonly metadata: string;

    /**
     * Builder code bytes32 included in the signed order.
     */
    readonly builder: string;

    /**
     * The side of the order, BUY or SELL
     */
    readonly side: Side;

    /**
     * Signature type used by the Order
     */
    readonly signatureType: SignatureType;
}

export interface SignedOrder extends Order {
    /**
     * The order signature
     */
    readonly signature: OrderSignature;
}
