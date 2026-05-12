import { type Address, encodeAbiParameters, hashTypedData, keccak256, toHex } from "viem";
import type { ClobSigner } from "../signer.ts";
import { signTypedDataWithSigner } from "../signer.ts";
import {
    EIP712_DOMAIN,
    ORDER_STRUCTURE,
    PROTOCOL_NAME,
    PROTOCOL_VERSION,
    ZERO_BYTES32,
} from "./exchange.order.const.ts";
import type { EIP712TypedData } from "./model/eip712.model.ts";
import type {
    Order,
    OrderData,
    OrderHash,
    OrderSignature,
    SignedOrder,
} from "./model/order.model.ts";
import { SignatureType } from "./model/signature-types.model.ts";
import { generateOrderSalt } from "./utils.ts";

const ORDER_TYPE_STRING =
    "Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)";
const ORDER_TYPE_HASH = keccak256(toHex(ORDER_TYPE_STRING));
const DOMAIN_TYPE_HASH = keccak256(
    toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);
const TYPED_DATA_SIGN_STRUCT = [
    { name: "contents", type: "Order" },
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
];
const PROTOCOL_NAME_HASH = keccak256(toHex(PROTOCOL_NAME));
const PROTOCOL_VERSION_HASH = keccak256(toHex(PROTOCOL_VERSION));

export class ExchangeOrderBuilder {
    private readonly appDomainSeparator: `0x${string}`;

    constructor(
        private readonly contractAddress: string,
        private readonly chainId: number,
        private readonly signer: ClobSigner,
        private readonly generateSalt = generateOrderSalt,
    ) {
        this.appDomainSeparator = keccak256(
            encodeAbiParameters(
                [
                    { type: "bytes32" },
                    { type: "bytes32" },
                    { type: "bytes32" },
                    { type: "uint256" },
                    { type: "address" },
                ],
                [
                    DOMAIN_TYPE_HASH,
                    PROTOCOL_NAME_HASH,
                    PROTOCOL_VERSION_HASH,
                    BigInt(chainId),
                    contractAddress as Address,
                ],
            ),
        );
    }

    /**
     * Build an order object including the signature.
     */
    async buildSignedOrder(orderData: OrderData): Promise<SignedOrder> {
        const order = await this.buildOrder(orderData);
        const orderTypedData = this.buildOrderTypedData(order);
        const orderSignature = await this.buildOrderSignature(orderTypedData);

        return {
            ...order,
            signature: orderSignature,
        } as SignedOrder;
    }

    /**
     * Creates an Order object from order data.
     */
    async buildOrder({
        maker,
        tokenId,
        makerAmount,
        takerAmount,
        side,
        signer,
        expiration,
        timestamp,
        metadata,
        builder,
        signatureType,
    }: OrderData): Promise<Order> {
        if (typeof signer === "undefined" || !signer) {
            signer = maker;
        }

        if (typeof expiration === "undefined" || !expiration) {
            expiration = "0";
        }
        if (typeof timestamp === "undefined" || !timestamp) {
            timestamp = Date.now().toString();
        }
        if (typeof metadata === "undefined" || !metadata) {
            metadata = ZERO_BYTES32;
        }
        if (typeof builder === "undefined" || !builder) {
            builder = ZERO_BYTES32;
        }

        if (typeof signatureType === "undefined" || !signatureType) {
            signatureType = SignatureType.DEPOSIT_WALLET;
        }
        if (signatureType !== SignatureType.DEPOSIT_WALLET) {
            throw new Error("Kuest order signing supports only Deposit Wallet signature type 3");
        }
        if (signer !== maker) {
            throw new Error(
                "Deposit Wallet orders must use the Deposit Wallet as maker and signer",
            );
        }

        return {
            salt: this.generateSalt(),
            maker,
            signer,
            tokenId,
            makerAmount,
            takerAmount,
            expiration,
            timestamp,
            metadata,
            builder,
            side,
            signatureType,
        };
    }

    /**
     * Parses an Order object to EIP712 typed data.
     */
    buildOrderTypedData(order: Order): EIP712TypedData {
        return {
            primaryType: "Order",
            types: {
                EIP712Domain: EIP712_DOMAIN,
                Order: ORDER_STRUCTURE,
            },
            domain: {
                name: PROTOCOL_NAME,
                version: PROTOCOL_VERSION,
                chainId: this.chainId,
                verifyingContract: this.contractAddress,
            },
            message: {
                salt: order.salt,
                maker: order.maker,
                signer: order.signer,
                tokenId: order.tokenId,
                makerAmount: order.makerAmount,
                takerAmount: order.takerAmount,
                side: order.side,
                signatureType: order.signatureType,
                timestamp: order.timestamp,
                metadata: order.metadata,
                builder: order.builder,
            },
        };
    }

    /**
     * Generates order signature from EIP712 typed data.
     */
    async buildOrderSignature(typedData: EIP712TypedData): Promise<OrderSignature> {
        const { EIP712Domain: _, ...orderTypes } = typedData.types;

        const innerSignature = await signTypedDataWithSigner({
            signer: this.signer,
            domain: {
                name: PROTOCOL_NAME,
                version: PROTOCOL_VERSION,
                chainId: this.chainId,
                verifyingContract: this.contractAddress,
            },
            types: {
                TypedDataSign: TYPED_DATA_SIGN_STRUCT,
                Order: orderTypes.Order,
            },
            value: {
                contents: typedData.message,
                name: "DepositWallet",
                version: "1",
                chainId: this.chainId,
                verifyingContract: typedData.message.signer,
                salt: ZERO_BYTES32,
            },
            primaryType: "TypedDataSign",
        });

        const message = typedData.message;
        const contentsHash = keccak256(
            encodeAbiParameters(
                [
                    { type: "bytes32" },
                    { type: "uint256" },
                    { type: "address" },
                    { type: "address" },
                    { type: "uint256" },
                    { type: "uint256" },
                    { type: "uint256" },
                    { type: "uint8" },
                    { type: "uint8" },
                    { type: "uint256" },
                    { type: "bytes32" },
                    { type: "bytes32" },
                ],
                [
                    ORDER_TYPE_HASH,
                    BigInt(message.salt as string),
                    message.maker as Address,
                    message.signer as Address,
                    BigInt(message.tokenId as string),
                    BigInt(message.makerAmount as string),
                    BigInt(message.takerAmount as string),
                    message.side as number,
                    message.signatureType as number,
                    BigInt(message.timestamp as string),
                    message.metadata as `0x${string}`,
                    message.builder as `0x${string}`,
                ],
            ),
        );
        const contentsTypeLength = ORDER_TYPE_STRING.length.toString(16).padStart(4, "0");
        return `0x${innerSignature.slice(2)}${this.appDomainSeparator.slice(2)}${contentsHash.slice(2)}${toHex(ORDER_TYPE_STRING).slice(2)}${contentsTypeLength}`;
    }

    /**
     * Generates the hash of the order from EIP712 typed data.
     */
    buildOrderHash(orderTypedData: EIP712TypedData): OrderHash {
        const { EIP712Domain: _, ...orderTypes } = orderTypedData.types;

        return hashTypedData({
            domain: orderTypedData.domain,
            types: orderTypes,
            primaryType: orderTypedData.primaryType,
            message: orderTypedData.message,
        });
    }
}
