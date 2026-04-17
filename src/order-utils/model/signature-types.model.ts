export enum SignatureType {
    /**
     * ECDSA EIP712 signatures signed by EOAs
     */
    EOA = 0,

    /**
     * EIP712 signatures signed by EOAs that own Kuest Proxy wallets
     */
    KUEST_PROXY = 1,

    /**
     * EIP712 signatures signed by EOAs that own Kuest Gnosis safes
     */
    KUEST_GNOSIS_SAFE = 2,
}
