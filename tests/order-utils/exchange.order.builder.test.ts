import { Wallet } from '@ethersproject/wallet'

import type { Order, OrderData } from '../../src/order-utils/index.ts'

import { ExchangeOrderBuilder, SignatureType, Side as OrderSide } from '../../src/order-utils/index.ts'

const CHAIN_ID = 137
const EXCHANGE_ADDRESS = '0x0000000000000000000000000000000000000001'
const OWNER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const SAMPLE_BUILDER = '0x0000000000000000000000001111111111111111111111111111111111111111'
const SAMPLE_METADATA = '0x0000000000000000000000000000000000000000000000000000000000000042'
const SAMPLE_TIMESTAMP = '1715731200000'

const createOrderData = (signer: string): OrderData => ({
  maker: signer,
  tokenId: '101',
  makerAmount: '1000000',
  takerAmount: '2000000',
  side: OrderSide.BUY,
  signer,
  expiration: '0',
  timestamp: SAMPLE_TIMESTAMP,
  metadata: SAMPLE_METADATA,
  builder: SAMPLE_BUILDER,
  signatureType: SignatureType.DEPOSIT_WALLET,
})

describe('ExchangeOrderBuilder', () => {
  it('signs orders with a providerless ethers wallet', async () => {
    const wallet = new Wallet(OWNER_PRIVATE_KEY)
    const address = await wallet.getAddress()
    const builder = new ExchangeOrderBuilder(EXCHANGE_ADDRESS, CHAIN_ID, wallet, () => '123')

    const signedOrder = await builder.buildSignedOrder(createOrderData(address))

    expect(signedOrder.signer).to.equal(address)
    expect(signedOrder.salt).to.equal('123')
    expect(signedOrder.signature).to.match(/^0x[0-9a-f]+$/i)
  })

  it('signs orders with a WalletClient-compatible signer and forwards primaryType', async () => {
    const walletClientAddress = '0x00000000000000000000000000000000000000a1'
    let receivedPrimaryType = ''
    const walletClientMock = {
      chain: { id: CHAIN_ID },
      account: { address: walletClientAddress },
      transport: {
        config: {},
        name: 'mock-transport',
        request: async (_args: { method: string; params?: unknown[] }) => null,
        type: 'custom',
        value: {},
      },
      requestAddresses: async (): Promise<string[]> => [walletClientAddress],
      signMessage: async (_args: unknown): Promise<string> => '0x01',
      signTypedData: async (args: { primaryType: string }): Promise<string> => {
        receivedPrimaryType = args.primaryType
        return '0xdeadbeef'
      },
      sendTransaction: async (_args: unknown): Promise<string> => '0xabc',
    }
    const builder = new ExchangeOrderBuilder(EXCHANGE_ADDRESS, CHAIN_ID, walletClientMock as any, () => '456')

    const signedOrder = await builder.buildSignedOrder(createOrderData(walletClientAddress))

    expect(signedOrder.signature).to.match(/^0xdeadbeef[0-9a-f]+$/i)
    expect(receivedPrimaryType).to.equal('TypedDataSign')
  })

  it('throws when the Deposit Wallet is not both maker and order signer', async () => {
    const wallet = new Wallet(OWNER_PRIVATE_KEY)
    const builder = new ExchangeOrderBuilder(EXCHANGE_ADDRESS, CHAIN_ID, wallet, () => '789')
    const badOrderData = {
      ...createOrderData('0x00000000000000000000000000000000000000b2'),
      maker: '0x00000000000000000000000000000000000000c3',
    }

    let thrownError: unknown
    try {
      await builder.buildOrder(badOrderData)
    } catch (err) {
      thrownError = err
    }

    expect(thrownError).to.be.instanceOf(Error)
    expect((thrownError as Error).message).to.equal(
      'Deposit Wallet orders must use the Deposit Wallet as maker and signer',
    )
  })

  it('builds a deterministic order hash', () => {
    const wallet = new Wallet(OWNER_PRIVATE_KEY)
    const builder = new ExchangeOrderBuilder(EXCHANGE_ADDRESS, CHAIN_ID, wallet)
    const order: Order = {
      salt: '1',
      maker: '0x1111111111111111111111111111111111111111',
      signer: '0x1111111111111111111111111111111111111111',
      tokenId: '101',
      makerAmount: '1000000',
      takerAmount: '2000000',
      expiration: '0',
      timestamp: SAMPLE_TIMESTAMP,
      metadata: SAMPLE_METADATA,
      builder: SAMPLE_BUILDER,
      side: OrderSide.BUY,
      signatureType: SignatureType.DEPOSIT_WALLET,
    }

    const typedDataA = builder.buildOrderTypedData(order)
    const typedDataB = builder.buildOrderTypedData(order)
    const orderHashA = builder.buildOrderHash(typedDataA)
    const orderHashB = builder.buildOrderHash(typedDataB)

    expect(orderHashA).to.match(/^0x[0-9a-f]{64}$/i)
    expect(orderHashA).to.equal(orderHashB)
  })
})
