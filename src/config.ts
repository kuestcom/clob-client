type ContractConfig = {
  exchange: string
  negRiskAdapter: string
  negRiskExchange: string
  collateral: string
  conditionalTokens: string
}

const AMOY_CONTRACTS: ContractConfig = {
  exchange: '0xaa1b8dE834E16eC69C044F5300041673C968c9eF',
  negRiskAdapter: '0xd9416E904e1ab925ad72F03F6D6ce0Aa80fd2dC5',
  negRiskExchange: '0xe7FA09cA716FDf498d74AFF618d32AFeacc310aB',
  collateral: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  conditionalTokens: '0x4682048725865bf17067bd85fF518527A262A9C7',
}

const MATIC_CONTRACTS: ContractConfig = {
  exchange: '0xaa1b8dE834E16eC69C044F5300041673C968c9eF',
  negRiskAdapter: '0xd9416E904e1ab925ad72F03F6D6ce0Aa80fd2dC5',
  negRiskExchange: '0xe7FA09cA716FDf498d74AFF618d32AFeacc310aB',
  collateral: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  conditionalTokens: '0x4682048725865bf17067bd85fF518527A262A9C7',
}

const COLLATERAL_TOKEN_DECIMALS = 6
const CONDITIONAL_TOKEN_DECIMALS = 6

const getContractConfig = (chainID: number): ContractConfig => {
  switch (chainID) {
    case 137:
      return MATIC_CONTRACTS
    case 80002:
      return AMOY_CONTRACTS
    default:
      throw new Error('Invalid network')
  }
}

export type { ContractConfig }
export { COLLATERAL_TOKEN_DECIMALS, CONDITIONAL_TOKEN_DECIMALS, getContractConfig }
