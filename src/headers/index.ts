import type { BuilderHeaderPayload } from '@kuestcom/builder-signing-sdk'

import type { ClobSigner } from '../signer.ts'
import type { ApiKeyCreds, Chain, L1KuestHeader, L2HeaderArgs, L2KuestHeader, L2WithBuilderHeader } from '../types.ts'

import { getSignerAddress } from '../signer.ts'
import { buildClobEip712Signature, buildKuestHmacSignature } from '../signing/index.ts'

export const createL1Headers = async (
  signer: ClobSigner,
  chainId: Chain,
  nonce?: number,
  timestamp?: number,
): Promise<L1KuestHeader> => {
  let ts = Math.floor(Date.now() / 1000)
  if (timestamp !== undefined) {
    ts = timestamp
  }
  let n = 0 // Default nonce is 0
  if (nonce !== undefined) {
    n = nonce
  }

  const sig = await buildClobEip712Signature(signer, chainId, ts, n)
  const address = await getSignerAddress(signer)

  const headers = {
    KUEST_ADDRESS: address,
    KUEST_SIGNATURE: sig,
    KUEST_TIMESTAMP: `${ts}`,
    KUEST_NONCE: `${n}`,
  }
  return headers
}

export const createL2Headers = async (
  signer: ClobSigner,
  creds: ApiKeyCreds,
  l2HeaderArgs: L2HeaderArgs,
  timestamp?: number,
): Promise<L2KuestHeader> => {
  let ts = Math.floor(Date.now() / 1000)
  if (timestamp !== undefined) {
    ts = timestamp
  }
  const address = await getSignerAddress(signer)

  const sig = await buildKuestHmacSignature(
    creds.secret,
    ts,
    l2HeaderArgs.method,
    l2HeaderArgs.requestPath,
    l2HeaderArgs.body,
  )

  const headers = {
    KUEST_ADDRESS: address,
    KUEST_SIGNATURE: sig,
    KUEST_TIMESTAMP: `${ts}`,
    KUEST_API_KEY: creds.key,
    KUEST_PASSPHRASE: creds.passphrase,
  }

  return headers
}

export const injectBuilderHeaders = (
  l2Header: L2KuestHeader,
  builderHeaders: BuilderHeaderPayload,
): L2WithBuilderHeader =>
  ({
    ...l2Header,
    ...builderHeaders,
  }) as L2WithBuilderHeader
