import { describe, expect, it, vi } from 'vite-plus/test'

import { ZERO_BYTES32 } from '../src/order-utils/exchange.order.const.ts'
import { Side as OrderSide, SignatureType } from '../src/order-utils/index.ts'
import { OrderType } from '../src/types.ts'
import {
  adjustBuyAmountForDynamicFees,
  calculateDynamicFeeBreakdown,
  MIN_GTD_EXPIRATION_SECONDS,
  normalizeNextCursor,
  orderToJson,
  parseBuilderFeeRateResponse,
} from '../src/utilities.ts'

const signedOrder = {
  salt: '1',
  maker: '0x1111111111111111111111111111111111111111',
  signer: '0x1111111111111111111111111111111111111111',
  tokenId: '101',
  makerAmount: '1000000',
  takerAmount: '2000000',
  side: OrderSide.BUY,
  expiration: '0',
  timestamp: '1715731200000',
  metadata: ZERO_BYTES32,
  builder: ZERO_BYTES32,
  signatureType: SignatureType.DEPOSIT_WALLET,
  signature: '0x1234',
}

describe('orderToJson', () => {
  it('serializes Deposit Wallet type 3 orders', () => {
    const payload = orderToJson(signedOrder, 'owner-key', OrderType.GTC)

    expect(payload.order.signatureType).to.equal(3)
    expect(payload.order.maker).to.equal(signedOrder.maker)
    expect(payload.order.signer).to.equal(signedOrder.signer)
    expect(payload.owner).to.equal('owner-key')
  })

  it('rejects legacy signature types', () => {
    expect(() =>
      orderToJson(
        {
          ...signedOrder,
          signatureType: 2 as SignatureType,
        },
        'owner-key',
        OrderType.GTC,
      ),
    ).toThrow('Deposit Wallet signature type 3')
  })

  it('rejects GTD orders below the minimum expiration', () => {
    expect(() =>
      orderToJson(
        {
          ...signedOrder,
          expiration: `${Math.floor(Date.now() / 1000) + 60}`,
        },
        'owner-key',
        OrderType.GTD,
      ),
    ).toThrow('GTD expiration must be at least 3 minutes in the future')
  })

  it('serializes GTD orders at the minimum expiration', () => {
    const now = 1_715_731_200_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const expiration = Math.floor(now / 1000) + MIN_GTD_EXPIRATION_SECONDS

    try {
      const payload = orderToJson(
        {
          ...signedOrder,
          expiration: `${expiration}`,
        },
        'owner-key',
        OrderType.GTD,
      )

      expect(payload.order.expiration).to.equal(`${expiration}`)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('serializes GTD orders above the minimum expiration', () => {
    const expiration = Math.floor(Date.now() / 1000) + MIN_GTD_EXPIRATION_SECONDS + 1

    const payload = orderToJson(
      {
        ...signedOrder,
        expiration: `${expiration}`,
      },
      'owner-key',
      OrderType.GTD,
    )

    expect(payload.order.expiration).to.equal(`${expiration}`)
  })
})

describe('normalizeNextCursor', () => {
  it('normalizes missing and empty cursors to the end cursor', () => {
    expect(normalizeNextCursor(undefined)).to.equal('LTE=')
    expect(normalizeNextCursor('')).to.equal('LTE=')
    expect(normalizeNextCursor('   ')).to.equal('LTE=')
  })

  it('stops pagination when the server repeats the current cursor', () => {
    expect(normalizeNextCursor('MA==', 'MA==')).to.equal('LTE=')
  })

  it('preserves a new non-empty cursor', () => {
    expect(normalizeNextCursor('MTAw', 'MA==')).to.equal('MTAw')
  })
})

describe('dynamic taker fee sizing', () => {
  it.each([0, 100])('parses a %s bps maker-flat fixture', (makerFlat) => {
    expect(
      parseBuilderFeeRateResponse({
        builder_taker_fee_share_bps: 3_000,
        builder_maker_flat_fee_bps: makerFlat,
      }),
    ).toEqual({ makerFlat, takerShare: 3_000 })
  })

  it('uses the unregistered-builder fallback fixture', () => {
    expect(parseBuilderFeeRateResponse({})).toEqual({ makerFlat: 0, takerShare: 3_000 })
  })

  it.each([
    [0.01, 0.04366],
    [0.1, 0.3969],
    [0.5, 1.1025],
    [0.9, 0.3969],
    [0.99, 0.04366],
  ])('matches the Crypto golden base at %s', (price, expectedBase) => {
    expect(calculateDynamicFeeBreakdown(100, price, 0.0441, 1).kuestFeeBase).toBe(expectedBase)
  })

  it.each([
    ['crypto', 0.0441, 1.1025],
    ['sports', 0.0315, 0.7875],
    ['geopolitics', 0.0252, 0.63],
    ['finance', 0.0252, 0.63],
    ['general', 0.0315, 0.7875],
  ])('matches the %s midpoint fixture', (_category, rate, expectedBase) => {
    expect(calculateDynamicFeeBreakdown(100, 0.5, rate, 1).kuestFeeBase).toBe(expectedBase)
  })

  it.each([
    [2_000, 1.37813, 0.275626, 1.102504],
    [3_000, 1.575, 0.4725, 1.1025],
    [4_500, 2.00455, 0.902047, 1.102503],
  ])('grosses up and splits a %s bps operator share', (share, totalFee, operatorFee, kuestFee) => {
    expect(calculateDynamicFeeBreakdown(100, 0.5, 0.0441, 1, share)).toEqual({
      kuestFeeBase: 1.1025,
      totalFee,
      operatorFee,
      kuestFee,
    })
  })

  it('uses 3000 bps when the builder share is omitted', () => {
    expect(calculateDynamicFeeBreakdown(100, 0.5, 0.0441, 1)).toEqual(
      calculateDynamicFeeBreakdown(100, 0.5, 0.0441, 1, 3_000),
    )
  })

  it('rounds below-threshold fees to zero', () => {
    expect(calculateDynamicFeeBreakdown(0.001, 0.5, 0.0252, 1)).toEqual({
      kuestFeeBase: 0,
      kuestFee: 0,
      operatorFee: 0,
      totalFee: 0,
    })
  })

  it.each([
    ['crypto', 0.0441],
    ['sports', 0.0315],
    ['finance', 0.0252],
    ['general', 0.0315],
    ['geopolitics', 0.0252],
  ])('keeps principal plus %s fees within the balance', (_category, rate) => {
    const balance = 100
    const price = 0.5
    const builderShareBps = 3000
    const adjusted = adjustBuyAmountForDynamicFees(balance, price, balance, rate, 1, builderShareBps)
    const totalFee = calculateDynamicFeeBreakdown(adjusted / price, price, rate, 1, builderShareBps).totalFee

    expect(adjusted + totalFee).toBeLessThanOrEqual(balance)
    expect(balance - adjusted - totalFee).toBeLessThan(0.000002)
  })

  it('does not shrink an amount when the balance already covers dynamic fees', () => {
    expect(adjustBuyAmountForDynamicFees(100, 0.5, 104, 0.0441, 1, 3000)).toBe(100)
  })
})
