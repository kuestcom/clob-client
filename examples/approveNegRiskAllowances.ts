import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { Chain } from "../src/index.ts";
import { getContractConfig } from "../src/config.ts";
import { usdcAbi } from "./abi/usdcAbi.ts";
import { ctfAbi } from "./abi/ctfAbi.ts";

dotenvConfig({ path: resolve(import.meta.dirname, "../.env") });

/**
 * NegRisk markets require separate allowances
 * for the NegRiskCtfExchange and the NegRiskAdapter.
 */

export function getWallet(mainnetQ: boolean): ethers.Wallet {
    const pk = process.env.PK as string;
    const rpcToken: string = process.env.RPC_TOKEN as string;
    let rpcUrl = "";
    if (mainnetQ) {
        rpcUrl = `https://polygon-mainnet.g.alchemy.com/v2/${rpcToken}`;
    } else {
        rpcUrl = `https://polygon-amoy.g.alchemy.com/v2/${rpcToken}`;
    }
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    let wallet = new ethers.Wallet(pk);
    wallet = wallet.connect(provider);
    return wallet;
}

export function getUsdcContract(mainnetQ: boolean, wallet: ethers.Wallet): ethers.Contract {
    const chainId = mainnetQ ? 137 : 80002;
    const contractConfig = getContractConfig(chainId);
    return new ethers.Contract(contractConfig.collateral, usdcAbi, wallet);
}

export function getCtfContract(mainnetQ: boolean, wallet: ethers.Wallet): ethers.Contract {
    const chainId = mainnetQ ? 137 : 80002;
    const contractConfig = getContractConfig(chainId);
    return new ethers.Contract(contractConfig.conditionalTokens, ctfAbi, wallet);
}

async function main() {
    // --------------------------
    // SET MAINNET OR AMOY HERE
    const isMainnet = false;
    // --------------------------
    const wallet = getWallet(isMainnet);
    const walletAddress = await wallet.getAddress();
    const chainId = parseInt(`${process.env.CHAIN_ID || Chain.AMOY}`) as Chain;
    console.log(`Address: ${walletAddress}, chainId: ${chainId}`);

    const contractConfig = getContractConfig(chainId);
    const usdc = getUsdcContract(isMainnet, wallet);
    const ctf = getCtfContract(isMainnet, wallet);

    const usdcAddress = await usdc.getAddress();
    const ctfAddress = await ctf.getAddress();
    console.log(`usdc: ${usdcAddress}`);
    console.log(`ctf: ${ctfAddress}`);

    const usdcAllowanceNegRiskAdapter = await usdc.allowance(
        walletAddress,
        contractConfig.negRiskAdapter,
    );
    console.log(`usdcAllowanceNegRiskAdapter: ${usdcAllowanceNegRiskAdapter}`);
    const usdcAllowanceNegRiskExchange = await usdc.allowance(
        walletAddress,
        contractConfig.negRiskExchange,
    );
    const conditionalTokensAllowanceNegRiskExchange = await ctf.isApprovedForAll(
        walletAddress,
        contractConfig.negRiskExchange,
    );
    const conditionalTokensAllowanceNegRiskAdapter = await ctf.isApprovedForAll(
        walletAddress,
        contractConfig.negRiskAdapter,
    );

    let txn;

    // for splitting through the NegRiskAdapter
    if (usdcAllowanceNegRiskAdapter <= 0n) {
        txn = await usdc.approve(contractConfig.negRiskAdapter, ethers.MaxUint256, {
            gasPrice: 100_000_000_000,
            gasLimit: 200_000,
        });
        console.log(`Setting USDC allowance for NegRiskAdapter: ${txn.hash}`);
    }
    if (usdcAllowanceNegRiskExchange <= 0n) {
        txn = await usdc.approve(contractConfig.negRiskExchange, ethers.MaxUint256, {
            gasPrice: 100_000_000_000,
            gasLimit: 200_000,
        });
        console.log(`Setting USDC allowance for NegRiskExchange: ${txn.hash}`);
    }
    if (!conditionalTokensAllowanceNegRiskExchange) {
        txn = await ctf.setApprovalForAll(contractConfig.negRiskExchange, true, {
            gasPrice: 100_000_000_000,
            gasLimit: 200_000,
        });
        console.log(`Setting Conditional Tokens allowance for NegRiskExchange: ${txn.hash}`);
    }
    if (!conditionalTokensAllowanceNegRiskAdapter) {
        txn = await ctf.setApprovalForAll(contractConfig.negRiskAdapter, true, {
            gasPrice: 100_000_000_000,
            gasLimit: 200_000,
        });
        console.log(`Setting Conditional Tokens allowance for NegRiskAdapter: ${txn.hash}`);
    }
    console.log("Allowances set");
}

main();
