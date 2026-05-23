import type { Account, Address, WalletClient } from "viem";

type TypedDataDomain = Record<string, unknown>;
type TypedDataTypes = Record<string, Array<{ name: string; type: string }>>;
type TypedDataValue = Record<string, unknown>;

interface EthersV5Signer {
    _signTypedData(
        domain: TypedDataDomain,
        types: TypedDataTypes,
        value: TypedDataValue,
    ): Promise<string>;
    getAddress(): Promise<string>;
}

interface EthersV6Signer {
    signTypedData(
        domain: TypedDataDomain,
        types: TypedDataTypes,
        value: TypedDataValue,
    ): Promise<string>;
    getAddress(): Promise<string>;
}

type EthersSigner = EthersV5Signer | EthersV6Signer;

const hasFunction = (value: unknown, key: string): boolean =>
    typeof (value as Record<string, unknown>)[key] === "function";

export type ClobSigner = EthersSigner | WalletClient;

const isEthersTypedDataSigner = (signer: ClobSigner): signer is EthersSigner =>
    // eslint-disable-next-line no-underscore-dangle
    hasFunction(signer, "_signTypedData") ||
    (hasFunction(signer, "signTypedData") &&
        hasFunction(signer, "getAddress") &&
        !isWalletClientSigner(signer));

const isWalletClientSigner = (signer: ClobSigner): signer is WalletClient =>
    hasFunction(signer, "signTypedData") &&
    (typeof (signer as WalletClient).account !== "undefined" ||
        hasFunction(signer, "requestAddresses") ||
        hasFunction(signer, "getAddresses"));

export const getWalletClientAddress = async (walletClient: WalletClient): Promise<Address> => {
    const accountAddress = walletClient.account?.address;
    if (typeof accountAddress === "string" && accountAddress.length > 0) {
        return accountAddress as Address;
    }

    if (typeof walletClient.requestAddresses === "function") {
        const [address] = await walletClient.requestAddresses();
        if (typeof address === "string" && address.length > 0) {
            return address as Address;
        }
    }

    if (typeof walletClient.getAddresses === "function") {
        const [address] = await walletClient.getAddresses();
        if (typeof address === "string" && address.length > 0) {
            return address as Address;
        }
    }

    throw new Error("wallet client is missing account address");
};

export const getSignerAddress = async (signer: ClobSigner): Promise<string> => {
    if (isEthersTypedDataSigner(signer)) {
        return signer.getAddress();
    }

    if (isWalletClientSigner(signer)) {
        return getWalletClientAddress(signer);
    }

    throw new Error("unsupported signer type");
};

export const signTypedDataWithSigner = async ({
    signer,
    domain,
    types,
    value,
    primaryType,
}: {
    signer: ClobSigner;
    domain: TypedDataDomain;
    types: TypedDataTypes;
    value: TypedDataValue;
    primaryType?: string;
}): Promise<string> => {
    if (isEthersTypedDataSigner(signer)) {
        if ("_signTypedData" in signer) {
            // eslint-disable-next-line no-underscore-dangle
            return signer._signTypedData(domain, types, value);
        }

        return signer.signTypedData(domain, types, value);
    }

    if (isWalletClientSigner(signer)) {
        const account: Account | Address = signer.account ?? (await getWalletClientAddress(signer));
        return signer.signTypedData({
            account,
            domain,
            types,
            primaryType,
            message: value,
        } as Parameters<WalletClient["signTypedData"]>[0]);
    }

    throw new Error("unsupported signer type");
};
