import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

export interface SiteConfig {
  site_url: string
  builder_mode: boolean
  geoblock: boolean
  builder_code: string
  order_metadata: string
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  site_url: '',
  builder_mode: false,
  geoblock: false,
  builder_code: '',
  order_metadata: ZERO_BYTES32,
}

const readString = (value: unknown, field: keyof SiteConfig): string => {
  if (value === undefined) {
    return DEFAULT_SITE_CONFIG[field] as string
  }
  if (typeof value !== 'string') {
    throw new Error(`.sdk/site-config.json field ${field} must be a string`)
  }
  return value
}

const readBoolean = (value: unknown, field: keyof SiteConfig): boolean => {
  if (value === undefined) {
    return DEFAULT_SITE_CONFIG[field] as boolean
  }
  if (typeof value !== 'boolean') {
    throw new Error(`.sdk/site-config.json field ${field} must be a boolean`)
  }
  return value
}

const loadSiteConfigFrom = (configPath: string): SiteConfig | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw new Error(`Invalid ${configPath}: ${String(error)}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid ${configPath}: expected a JSON object`)
  }

  const config = parsed as Partial<Record<keyof SiteConfig, unknown>>

  return {
    site_url: readString(config.site_url, 'site_url'),
    builder_mode: readBoolean(config.builder_mode, 'builder_mode'),
    geoblock: readBoolean(config.geoblock, 'geoblock'),
    builder_code: readString(config.builder_code, 'builder_code'),
    order_metadata: readString(config.order_metadata, 'order_metadata'),
  }
}

const loadSiteConfig = (): SiteConfig => {
  const candidatePaths = [
    resolve(process.cwd(), '.sdk/site-config.json'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../.sdk/site-config.json'),
  ]

  for (const configPath of candidatePaths) {
    const config = loadSiteConfigFrom(configPath)
    if (config) {
      return config
    }
  }

  return { ...DEFAULT_SITE_CONFIG }
}

export const SITE_CONFIG: SiteConfig = loadSiteConfig()

export const GEOBLOCK_HOST = 'https://geoblock.kuest.com'

export const getSiteOrderContext = (): {
  builderCode?: string
  metadata?: string
} => {
  const builderCode = SITE_CONFIG.builder_code.trim()
  const metadata = SITE_CONFIG.order_metadata.trim()
  return {
    ...(builderCode ? { builderCode } : {}),
    ...(metadata && metadata !== ZERO_BYTES32 ? { metadata } : {}),
  }
}
