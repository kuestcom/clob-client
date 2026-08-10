import type { SignedOrder } from './order-utils/index.ts'
import type { NewOrder, OrderBookSummary, TickSize } from './types.ts'

import { END_CURSOR } from './constants.ts'
import { ZERO_BYTES32 } from './order-utils/exchange.order.const.ts'
import { SignatureType, Side as UtilsSide } from './order-utils/index.ts'
import { OrderType, Side } from './types.ts'

export const MIN_GTD_EXPIRATION_SECONDS = 3 * 60

export function normalizeNextCursor(value: unknown, currentCursor?: string): string {
  const cursor = typeof value === 'string' ? value.trim() : ''
  if (!cursor || cursor === currentCursor) {
    return END_CURSOR
  }
  return cursor
}

export function orderToJson<T extends OrderType>(
  order: SignedOrder,
  owner: string,
  orderType: T,
  deferExec = false,
  postOnly?: boolean,
): NewOrder<T> {
  if (order.signatureType !== SignatureType.DEPOSIT_WALLET) {
    throw new Error('Kuest order submission supports only Deposit Wallet signature type 3')
  }

  if (postOnly === true && orderType !== OrderType.GTC && orderType !== OrderType.GTD) {
    throw new Error('postOnly is only supported for GTC and GTD orders')
  }

  validateGtdExpiration(order, orderType)

  let side = Side.BUY
  if (order.side === UtilsSide.BUY) {
    side = Side.BUY
  } else {
    side = Side.SELL
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
      timestamp: order.timestamp ?? '0',
      metadata: order.metadata ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
      builder: order.builder ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: order.signature,
    },
    owner,
    orderType,
    ...(typeof postOnly === 'boolean' ? { postOnly } : {}),
  } as NewOrder<T>
}

function validateGtdExpiration(order: SignedOrder, orderType: OrderType) {
  if (orderType !== OrderType.GTD) {
    return
  }

  const expiration = Number(order.expiration)
  if (!Number.isInteger(expiration)) {
    throw new Error('GTD expiration must be a Unix timestamp in seconds')
  }

  const minimumExpiration = Math.floor(Date.now() / 1000) + MIN_GTD_EXPIRATION_SECONDS
  if (expiration < minimumExpiration) {
    throw new Error('GTD expiration must be at least 3 minutes in the future')
  }
}

export const roundNormal = (num: number, decimals: number): number => {
  if (decimalPlaces(num) <= decimals) {
    return num
  }
  return Math.round((num + Number.EPSILON) * 10 ** decimals) / 10 ** decimals
}

export const roundDown = (num: number, decimals: number): number => {
  if (decimalPlaces(num) <= decimals) {
    return num
  }
  return Math.floor(num * 10 ** decimals) / 10 ** decimals
}

export const roundUp = (num: number, decimals: number): number => {
  if (decimalPlaces(num) <= decimals) {
    return num
  }
  return Math.ceil(num * 10 ** decimals) / 10 ** decimals
}

export const decimalPlaces = (num: number): number => {
  if (Number.isInteger(num)) {
    return 0
  }

  const arr = num.toString().split('.')
  if (arr.length <= 1) {
    return 0
  }

  return arr[1].length
}

/**
 * Converts ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Calculates the hash for the given orderbook
 * @param orderbook
 * @returns
 */
export const generateOrderBookSummaryHash = async (orderbook: OrderBookSummary): Promise<string> => {
  orderbook.hash = ''
  const message = JSON.stringify(orderbook)
  const messageBuffer = new TextEncoder().encode(message)
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-1', messageBuffer)
  const hash = arrayBufferToHex(hashBuffer)
  orderbook.hash = hash
  return hash
}

export const isTickSizeSmaller = (a: TickSize, b: TickSize): boolean => {
  return Number.parseFloat(a) < Number.parseFloat(b)
}

export const priceValid = (price: number, tickSize: TickSize): boolean => {
  return price >= Number.parseFloat(tickSize) && price <= 1 - Number.parseFloat(tickSize)
}

export const builderCodeToBytes32 = (builderCode?: string): string => {
  const value = builderCode?.trim()
  if (!value || value === ZERO_BYTES32) {
    return ZERO_BYTES32
  }

  const hex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
  if (/^[0-9a-fA-F]{40}$/.test(hex)) {
    return `0x${hex.padStart(64, '0')}`.toLowerCase()
  }
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return `0x${hex}`.toLowerCase()
  }

  throw new Error('builderCode must be an address or bytes32 hex string')
}

export const adjustBuyAmountForFees = (
  amount: number,
  price: number,
  userUSDCBalance: number,
  kuestTakerFeeRateBps: number,
  builderTakerFeeRateBps: number,
): number => {
  const totalFeeRate = (kuestTakerFeeRateBps + builderTakerFeeRateBps) / 10_000
  const totalCost = amount * (1 + totalFeeRate)
  if (userUSDCBalance >= totalCost) {
    return amount
  }
  const adjusted = userUSDCBalance / (1 + totalFeeRate)
  if (adjusted <= 0) {
    throw new Error(`userUSDCBalance ${userUSDCBalance} too small to cover fees at price ${price}`)
  }
  return adjusted
}

/**
 * Shrinks a market-buy USDC amount so principal plus Kuest's dynamic taker fee
 * and the builder's flat taker fee fit within the available USDC balance.
 * Kuest fees are charged on shares: shares * rate * [price * (1-price)]^exponent.
 */
export const adjustBuyAmountForDynamicFees = (
  amount: number,
  price: number,
  userUSDCBalance: number,
  rate: number,
  exponent: number,
  builderTakerFeeRateBps: number,
): number => {
  if (!(price > 0 && price < 1)) {
    throw new Error(`price ${price} must be between 0 and 1 for dynamic fee calculation`)
  }
  const effectiveShareFeeRate = rate * Math.pow(price * (1 - price), exponent)
  const platformCostRate = effectiveShareFeeRate / price
  const builderCostRate = builderTakerFeeRateBps / 10_000
  const totalCostRate = platformCostRate + builderCostRate
  const totalCost = amount * (1 + totalCostRate)
  if (userUSDCBalance >= totalCost) {
    return amount
  }
  const adjusted = userUSDCBalance / (1 + totalCostRate)
  if (!(adjusted > 0)) {
    throw new Error(`userUSDCBalance ${userUSDCBalance} too small to cover fees at price ${price}`)
  }
  return adjusted
}
