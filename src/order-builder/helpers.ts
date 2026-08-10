import { parseUnits } from 'viem'

import type { OrderData, SignedOrder } from '../order-utils/index.ts'
import type { ClobSigner } from '../signer.ts'
import type {
  Chain,
  CreateOrderOptions,
  OrderSummary,
  RoundConfig,
  TickSize,
  UserMarketOrder,
  UserOrder,
} from '../types.ts'

import { COLLATERAL_TOKEN_DECIMALS, getContractConfig } from '../config.ts'
import { ZERO_BYTES32 } from '../order-utils/exchange.order.const.ts'
import { ExchangeOrderBuilder, SignatureType, Side as UtilsSide } from '../order-utils/index.ts'
import { OrderType, Side } from '../types.ts'
import { builderCodeToBytes32, decimalPlaces, roundDown, roundNormal, roundUp } from '../utilities.ts'

export const ROUNDING_CONFIG: Record<TickSize, RoundConfig> = {
  '0.1': {
    price: 1,
    size: 2,
    amount: 3,
  },
  '0.01': {
    price: 2,
    size: 2,
    amount: 4,
  },
  '0.001': {
    price: 3,
    size: 2,
    amount: 5,
  },
  '0.0001': {
    price: 4,
    size: 2,
    amount: 6,
  },
}

/**
 * Generate and sign an order
 *
 * @param signer
 * @param exchangeAddress ctf exchange contract address
 * @param chainId
 * @param OrderData
 * @returns SignedOrder
 */
export const buildOrder = async (
  signer: ClobSigner,
  exchangeAddress: string,
  chainId: number,
  orderData: OrderData,
): Promise<SignedOrder> => {
  const cTFExchangeOrderBuilder = new ExchangeOrderBuilder(exchangeAddress, chainId, signer)
  return cTFExchangeOrderBuilder.buildSignedOrder(orderData)
}

export const getOrderRawAmounts = (
  side: Side,
  size: number,
  price: number,
  roundConfig: RoundConfig,
): { side: UtilsSide; rawMakerAmt: number; rawTakerAmt: number } => {
  const rawPrice = roundNormal(price, roundConfig.price)

  if (side === Side.BUY) {
    // force 2 decimals places
    const rawTakerAmt = roundDown(size, roundConfig.size)

    let rawMakerAmt = rawTakerAmt * rawPrice
    if (decimalPlaces(rawMakerAmt) > roundConfig.amount) {
      rawMakerAmt = roundUp(rawMakerAmt, roundConfig.amount + 4)
      if (decimalPlaces(rawMakerAmt) > roundConfig.amount) {
        rawMakerAmt = roundDown(rawMakerAmt, roundConfig.amount)
      }
    }

    return {
      side: UtilsSide.BUY,
      rawMakerAmt,
      rawTakerAmt,
    }
  }
  const rawMakerAmt = roundDown(size, roundConfig.size)

  let rawTakerAmt = rawMakerAmt * rawPrice
  if (decimalPlaces(rawTakerAmt) > roundConfig.amount) {
    rawTakerAmt = roundUp(rawTakerAmt, roundConfig.amount + 4)
    if (decimalPlaces(rawTakerAmt) > roundConfig.amount) {
      rawTakerAmt = roundDown(rawTakerAmt, roundConfig.amount)
    }
  }

  return {
    side: UtilsSide.SELL,
    rawMakerAmt,
    rawTakerAmt,
  }
}

/**
 * Translate simple user order to args used to generate Orders
 */
export const buildOrderCreationArgs = async (
  signer: string,
  maker: string,
  signatureType: SignatureType,
  userOrder: UserOrder,
  roundConfig: RoundConfig,
): Promise<OrderData> => {
  const { side, rawMakerAmt, rawTakerAmt } = getOrderRawAmounts(
    userOrder.side,
    userOrder.size,
    userOrder.price,
    roundConfig,
  )

  const makerAmount = parseUnits(rawMakerAmt.toString(), COLLATERAL_TOKEN_DECIMALS).toString()
  const takerAmount = parseUnits(rawTakerAmt.toString(), COLLATERAL_TOKEN_DECIMALS).toString()

  return {
    maker,
    tokenId: userOrder.tokenID,
    makerAmount,
    takerAmount,
    side,
    signer,
    expiration: (userOrder.expiration || 0).toString(),
    timestamp: Date.now().toString(),
    metadata: userOrder.metadata ?? ZERO_BYTES32,
    builder: builderCodeToBytes32(userOrder.builderCode),
    signatureType,
  } as OrderData
}

export const createOrder = async (
  eoaSigner: ClobSigner,
  chainId: Chain,
  signatureType: SignatureType,
  funderAddress: string | undefined,
  userOrder: UserOrder,
  options: CreateOrderOptions,
): Promise<SignedOrder> => {
  if (signatureType !== SignatureType.DEPOSIT_WALLET) {
    throw new Error('Kuest order flow supports only Deposit Wallet signature type 3')
  }
  if (!funderAddress) {
    throw new Error('Deposit Wallet funder address is required for Kuest orders')
  }
  const maker = funderAddress
  const contractConfig = getContractConfig(chainId)

  const orderData = await buildOrderCreationArgs(
    maker,
    maker,
    signatureType,
    userOrder,
    ROUNDING_CONFIG[options.tickSize],
  )

  const exchangeContract = options.negRisk ? contractConfig.negRiskExchange : contractConfig.exchange

  return buildOrder(eoaSigner, exchangeContract, chainId, orderData)
}

export const getMarketOrderRawAmounts = (
  side: Side,
  amount: number,
  price: number,
  roundConfig: RoundConfig,
): { side: UtilsSide; rawMakerAmt: number; rawTakerAmt: number } => {
  // force 2 decimals places
  const rawPrice = roundDown(price, roundConfig.price)

  if (side === Side.BUY) {
    const rawMakerAmt = roundDown(amount, roundConfig.size)
    let rawTakerAmt = rawMakerAmt / rawPrice
    if (decimalPlaces(rawTakerAmt) > roundConfig.amount) {
      rawTakerAmt = roundUp(rawTakerAmt, roundConfig.amount + 4)
      if (decimalPlaces(rawTakerAmt) > roundConfig.amount) {
        rawTakerAmt = roundDown(rawTakerAmt, roundConfig.amount)
      }
    }
    return {
      side: UtilsSide.BUY,
      rawMakerAmt,
      rawTakerAmt,
    }
  }
  const rawMakerAmt = roundDown(amount, roundConfig.size)
  let rawTakerAmt = rawMakerAmt * rawPrice
  if (decimalPlaces(rawTakerAmt) > roundConfig.amount) {
    rawTakerAmt = roundUp(rawTakerAmt, roundConfig.amount + 4)
    if (decimalPlaces(rawTakerAmt) > roundConfig.amount) {
      rawTakerAmt = roundDown(rawTakerAmt, roundConfig.amount)
    }
  }

  return {
    side: UtilsSide.SELL,
    rawMakerAmt,
    rawTakerAmt,
  }
}

/**
 * Translate simple user market order to args used to generate Orders
 */
export const buildMarketOrderCreationArgs = async (
  signer: string,
  maker: string,
  signatureType: SignatureType,
  userMarketOrder: UserMarketOrder,
  roundConfig: RoundConfig,
): Promise<OrderData> => {
  const { side, rawMakerAmt, rawTakerAmt } = getMarketOrderRawAmounts(
    userMarketOrder.side,
    userMarketOrder.amount,
    userMarketOrder.price || 1,
    roundConfig,
  )

  const makerAmount = parseUnits(rawMakerAmt.toString(), COLLATERAL_TOKEN_DECIMALS).toString()
  const takerAmount = parseUnits(rawTakerAmt.toString(), COLLATERAL_TOKEN_DECIMALS).toString()

  return {
    maker,
    tokenId: userMarketOrder.tokenID,
    makerAmount,
    takerAmount,
    side,
    signer,
    expiration: '0',
    timestamp: Date.now().toString(),
    metadata: userMarketOrder.metadata ?? ZERO_BYTES32,
    builder: builderCodeToBytes32(userMarketOrder.builderCode),
    signatureType,
  } as OrderData
}

export const createMarketOrder = async (
  eoaSigner: ClobSigner,
  chainId: Chain,
  signatureType: SignatureType,
  funderAddress: string | undefined,
  userMarketOrder: UserMarketOrder,
  options: CreateOrderOptions,
): Promise<SignedOrder> => {
  if (signatureType !== SignatureType.DEPOSIT_WALLET) {
    throw new Error('Kuest order flow supports only Deposit Wallet signature type 3')
  }
  if (!funderAddress) {
    throw new Error('Deposit Wallet funder address is required for Kuest orders')
  }
  const maker = funderAddress
  const contractConfig = getContractConfig(chainId)

  const orderData = await buildMarketOrderCreationArgs(
    maker,
    maker,
    signatureType,
    userMarketOrder,
    ROUNDING_CONFIG[options.tickSize],
  )

  const exchangeContract = options.negRisk ? contractConfig.negRiskExchange : contractConfig.exchange

  return buildOrder(eoaSigner, exchangeContract, chainId, orderData)
}

/**
 * calculateBuyMarketPrice calculates the market price to buy a $$ amount
 * @param positions
 * @param amountToMatch worth to buy
 * @returns
 */
export const calculateBuyMarketPrice = (positions: OrderSummary[], amountToMatch: number, orderType: OrderType) => {
  if (!positions.length) {
    throw new Error('no match')
  }
  let sum = 0
  /*
    Asks:
    [
        { price: '0.6', size: '100' },
        { price: '0.55', size: '100' },
        { price: '0.5', size: '100' }
    ]
    So, if the amount to match is $150 that will be reached at first position so price will be 0.6
    */
  for (let i = positions.length - 1; i >= 0; i--) {
    const p = positions[i]
    sum += Number.parseFloat(p.size) * Number.parseFloat(p.price)
    if (sum >= amountToMatch) {
      return Number.parseFloat(p.price)
    }
  }
  if (orderType === OrderType.FOK) {
    throw new Error('no match')
  }
  return Number.parseFloat(positions[0].price)
}

/**
 * calculateSellMarketPrice calculates the market price to sell a shares
 * @param positions
 * @param amountToMatch sells to share
 * @returns
 */
export const calculateSellMarketPrice = (positions: OrderSummary[], amountToMatch: number, orderType: OrderType) => {
  if (!positions.length) {
    throw new Error('no match')
  }
  let sum = 0
  /*
    Bids:
    [
        { price: '0.4', size: '100' },
        { price: '0.45', size: '100' },
        { price: '0.5', size: '100' }
    ]
    So, if the amount to match is 300 that will be reached at the first position so price will be 0.4
    */
  for (let i = positions.length - 1; i >= 0; i--) {
    const p = positions[i]
    sum += Number.parseFloat(p.size)
    if (sum >= amountToMatch) {
      return Number.parseFloat(p.price)
    }
  }
  if (orderType === OrderType.FOK) {
    throw new Error('no match')
  }
  return Number.parseFloat(positions[0].price)
}
