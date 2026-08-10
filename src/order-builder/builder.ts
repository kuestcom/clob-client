import type { SignedOrder } from '../order-utils/index.ts'
import type { ClobSigner } from '../signer.ts'
import type { Chain, CreateOrderOptions, UserMarketOrder, UserOrder } from '../types.ts'

import { SignatureType } from '../order-utils/index.ts'
import { createMarketOrder, createOrder } from './helpers.ts'

export class OrderBuilder {
  readonly signer: ClobSigner

  readonly chainId: Chain

  // Kuest only supports Deposit Wallet order signatures.
  readonly signatureType: SignatureType

  // Deposit Wallet address that holds funds and appears as order maker.
  readonly funderAddress?: string

  /**
   * Optional function to dynamically resolve the signer.
   * If provided, this function will be called to obtain a fresh signer instance
   * (e.g., for smart contract wallets or when the signer may change).
   * Should return an ethers-compatible signer or WalletClient, or a Promise resolving to one.
   * If not provided, the static `signer` property is used.
   */
  private getSigner?: () => Promise<ClobSigner> | ClobSigner

  constructor(
    signer: ClobSigner,
    chainId: Chain,
    signatureType?: SignatureType,
    funderAddress?: string,
    getSigner?: () => Promise<ClobSigner> | ClobSigner,
  ) {
    this.signer = signer
    this.chainId = chainId
    this.signatureType = signatureType ?? SignatureType.DEPOSIT_WALLET
    if (this.signatureType !== SignatureType.DEPOSIT_WALLET) {
      throw new Error('Kuest order flow supports only Deposit Wallet signature type 3')
    }
    this.funderAddress = funderAddress
    this.getSigner = getSigner
  }

  /**
   * Generate and sign an order
   */
  public async buildOrder(userOrder: UserOrder, options: CreateOrderOptions): Promise<SignedOrder> {
    const signer = await this.resolveSigner()
    return createOrder(signer, this.chainId, this.signatureType, this.funderAddress, userOrder, options)
  }

  /**
   * Generate and sign a market order
   */
  public async buildMarketOrder(userMarketOrder: UserMarketOrder, options: CreateOrderOptions): Promise<SignedOrder> {
    const signer = await this.resolveSigner()
    return createMarketOrder(signer, this.chainId, this.signatureType, this.funderAddress, userMarketOrder, options)
  }

  /** Unified getter: use fresh signer if available */
  private async resolveSigner(): Promise<ClobSigner> {
    if (this.getSigner) {
      const s = await this.getSigner()
      if (!s) throw new Error('getSigner() function returned undefined or null')
      return s
    }
    return this.signer
  }
}
