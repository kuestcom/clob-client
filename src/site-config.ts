const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface SiteConfig {
    site_url: string;
    builder_mode: boolean;
    geoblock: boolean;
    builder_code: string;
    order_metadata: string;
}

export const SITE_CONFIG: SiteConfig = {
    site_url: "",
    builder_mode: false,
    geoblock: false,
    builder_code: "",
    order_metadata: ZERO_BYTES32,
};

export const GEOBLOCK_HOST = "https://geoblock.kuest.com";

export const getSiteOrderContext = (): {
    builderCode?: string;
    metadata?: string;
} => {
    const builderCode = SITE_CONFIG.builder_code.trim();
    const metadata = SITE_CONFIG.order_metadata.trim();
    return {
        ...(builderCode ? { builderCode } : {}),
        ...(metadata && metadata !== ZERO_BYTES32 ? { metadata } : {}),
    };
};
