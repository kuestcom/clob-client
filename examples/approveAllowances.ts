import { config as dotenvConfig } from 'dotenv'
import { ethers } from 'ethers'
import { resolve } from 'path'

import { getContractConfig } from '../src/config.ts'
import { Chain } from '../src/index.ts'
import { ctfAbi } from './abi/ctfAbi.ts'
import { usdcAbi } from './abi/usdcAbi.ts'

dotenvConfig({ path: resolve(import.meta.dirname, '../.env') })

export function getWallet(mainnetQ: boolean): ethers.Wallet {
  const pk = process.env.PK as string
  const rpcToken: string = process.env.RPC_TOKEN as string
  let rpcUrl = ''
  if (mainnetQ) {
    rpcUrl = `https://polygon-mainnet.g.alchemy.com/v2/${rpcToken}`
  } else {
    rpcUrl = `https://polygon-amoy.g.alchemy.com/v2/${rpcToken}`
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  let wallet = new ethers.Wallet(pk)
  wallet = wallet.connect(provider)
  return wallet
}

export function getUsdcContract(mainnetQ: boolean, wallet: ethers.Wallet): ethers.Contract {
  const chainId = mainnetQ ? 137 : 80002
  const contractConfig = getContractConfig(chainId)
  return new ethers.Contract(contractConfig.collateral, usdcAbi, wallet)
}

export function getCtfContract(mainnetQ: boolean, wallet: ethers.Wallet): ethers.Contract {
  const chainId = mainnetQ ? 137 : 80002
  const contractConfig = getContractConfig(chainId)
  return new ethers.Contract(contractConfig.conditionalTokens, ctfAbi, wallet)
}

async function main() {
  // --------------------------
  // SET MAINNET OR AMOY HERE
  const isMainnet = false
  // --------------------------
  const wallet = getWallet(isMainnet)
  const walletAddress = await wallet.getAddress()
  const chainId = parseInt(`${process.env.CHAIN_ID || Chain.AMOY}`) as Chain
  console.log(`Address: ${walletAddress}, chainId: ${chainId}`)

  const contractConfig = getContractConfig(chainId)
  const usdc = getUsdcContract(isMainnet, wallet)
  const ctf = getCtfContract(isMainnet, wallet)

  const usdcAddress = await usdc.getAddress()
  const ctfAddress = await ctf.getAddress()
  console.log(`usdc: ${usdcAddress}`)
  console.log(`ctf: ${ctfAddress}`)

  const usdcAllowanceCtf = await usdc.allowance(walletAddress, ctfAddress)
  console.log(`usdcAllowanceCtf: ${usdcAllowanceCtf}`)
  const usdcAllowanceExchange = await usdc.allowance(walletAddress, contractConfig.exchange)
  const conditionalTokensAllowanceExchange = await ctf.isApprovedForAll(walletAddress, contractConfig.exchange)

  let txn

  if (usdcAllowanceCtf <= 0n) {
    txn = await usdc.approve(contractConfig.conditionalTokens, ethers.MaxUint256, {
      gasPrice: 100_000_000_000,
      gasLimit: 200_000,
    })
    console.log(`Setting USDC allowance for CTF: ${txn.hash}`)
  }
  if (usdcAllowanceExchange <= 0n) {
    txn = await usdc.approve(contractConfig.exchange, ethers.MaxUint256, {
      gasPrice: 100_000_000_000,
      gasLimit: 200_000,
    })
    console.log(`Setting USDC allowance for Exchange: ${txn.hash}`)
  }
  if (!conditionalTokensAllowanceExchange) {
    txn = await ctf.setApprovalForAll(contractConfig.exchange, true, {
      gasPrice: 100_000_000_000,
      gasLimit: 200_000,
    })
    console.log(`Setting Conditional Tokens allowance for Exchange: ${txn.hash}`)
  }
  console.log('Allowances set')
}

void main()
