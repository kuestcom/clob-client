type ContractConfig = {
    exchange: string;
    negRiskAdapter: string;
    negRiskExchange: string;
    collateral: string;
    conditionalTokens: string;
};

const AMOY_CONTRACTS: ContractConfig = {
    exchange: "0x4bB1871fdaE80331ce5fF87547b8ff886D1695a5",
    negRiskAdapter: "0xd9416E904e1ab925ad72F03F6D6ce0Aa80fd2dC5",
    negRiskExchange: "0xdb1E374a05130d7DE3F16677066553F225D2eE53",
    collateral: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    conditionalTokens: "0x4682048725865bf17067bd85fF518527A262A9C7",
};

const MATIC_CONTRACTS: ContractConfig = {
    exchange: "0x4bB1871fdaE80331ce5fF87547b8ff886D1695a5",
    negRiskAdapter: "0xd9416E904e1ab925ad72F03F6D6ce0Aa80fd2dC5",
    negRiskExchange: "0xdb1E374a05130d7DE3F16677066553F225D2eE53",
    collateral: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    conditionalTokens: "0x4682048725865bf17067bd85fF518527A262A9C7",
};

const COLLATERAL_TOKEN_DECIMALS = 6;
const CONDITIONAL_TOKEN_DECIMALS = 6;

const getContractConfig = (chainID: number): ContractConfig => {
    switch (chainID) {
        case 137:
            return MATIC_CONTRACTS;
        case 80002:
            return AMOY_CONTRACTS;
        default:
            throw new Error("Invalid network");
    }
};

export type { ContractConfig };
export { COLLATERAL_TOKEN_DECIMALS, CONDITIONAL_TOKEN_DECIMALS, getContractConfig };
