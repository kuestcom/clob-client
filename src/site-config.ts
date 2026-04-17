export interface SiteConfig {
    site_url: string;
    fee_bps: number;
    fee_receiver: string;
    builder_mode: boolean;
    geoblock: boolean;
}

export const SITE_CONFIG: SiteConfig = {
    site_url: "",
    fee_bps: 0,
    fee_receiver: "",
    builder_mode: false,
    geoblock: false,
};

export const GEOBLOCK_HOST = "https://geoblock.kuest.com";

export const getSiteOrderPayload = (): {
    fee_bps?: number;
    fee_receiver?: string;
} => {
    if (!SITE_CONFIG.fee_receiver.trim()) {
        return {};
    }

    return {
        fee_bps: SITE_CONFIG.fee_bps,
        fee_receiver: SITE_CONFIG.fee_receiver,
    };
};
