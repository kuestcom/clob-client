import { get } from "./http-helpers/index.ts";
import { SITE_CONFIG } from "./site-config.ts";

const SITE_SCOPE_TTL_MS = 5 * 60 * 1000;
const SITE_EVENTS_LIMIT = 100;
const SITE_EVENTS_MAX_PAGES = 50;
const CONDITION_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const TOKEN_ID_PATTERN = /^(0x[0-9a-fA-F]+|\d+)$/;

export interface SiteMarketScope {
    conditionIds: Set<string>;
    tokenIds: Set<string>;
}

interface SiteScopeCacheEntry {
    scope: SiteMarketScope;
    expiresAt: number;
}

let siteScopeCache: SiteScopeCacheEntry | undefined;

export const hasConfiguredSiteScope = (): boolean => SITE_CONFIG.site_url.trim().length > 0;

export const normalizeConditionId = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    return CONDITION_ID_PATTERN.test(normalized) ? normalized : undefined;
};

export const normalizeTokenId = (value: unknown): string | undefined => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
        return undefined;
    }
    const normalized = String(value).trim().toLowerCase();
    return TOKEN_ID_PATTERN.test(normalized) ? normalized : undefined;
};

const normalizeSiteOrigin = (): string => {
    const raw = SITE_CONFIG.site_url.trim();
    if (!raw) {
        throw new Error("site_url must be configured for site-scoped market discovery");
    }

    const candidate =
        raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    const url = new URL(candidate);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
};

const siteApiUrl = (path: string, params: Record<string, string>): string => {
    const url = new URL(path, `${normalizeSiteOrigin()}/`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
};

const addConditionId = (scope: SiteMarketScope, value: unknown): void => {
    const conditionId = normalizeConditionId(value);
    if (conditionId) {
        scope.conditionIds.add(conditionId);
    }
};

const addTokenId = (scope: SiteMarketScope, value: unknown): void => {
    const tokenId = normalizeTokenId(value);
    if (tokenId) {
        scope.tokenIds.add(tokenId);
    }
};

const collectMarketScope = (value: unknown, scope: SiteMarketScope): void => {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectMarketScope(item, scope);
        }
        return;
    }

    if (typeof value !== "object" || value === null) {
        return;
    }

    const record = value as Record<string, unknown>;
    addConditionId(scope, record.condition_id);
    addConditionId(scope, record.conditionId);
    addConditionId(scope, record.conditionID);
    addConditionId(scope, record.c);

    addTokenId(scope, record.token_id);
    addTokenId(scope, record.tokenId);
    addTokenId(scope, record.asset_id);
    addTokenId(scope, record.assetId);
    addTokenId(scope, record.t);

    collectMarketScope(record.markets, scope);
    collectMarketScope(record.outcomes, scope);
    collectMarketScope(record.tokens, scope);
    collectMarketScope(record.clob_token_ids, scope);
    collectMarketScope(record.clobTokenIds, scope);
    collectMarketScope(record.outcome_assets, scope);
    collectMarketScope(record.outcomeAssets, scope);
};

const emptyScope = (): SiteMarketScope => ({
    conditionIds: new Set<string>(),
    tokenIds: new Set<string>(),
});

export const getSiteMarketScope = async (): Promise<SiteMarketScope> => {
    if (!hasConfiguredSiteScope()) {
        return emptyScope();
    }

    if (siteScopeCache && siteScopeCache.expiresAt > Date.now()) {
        return siteScopeCache.scope;
    }

    const scope = emptyScope();
    for (let page = 0; page < SITE_EVENTS_MAX_PAGES; page += 1) {
        const events = await get(
            siteApiUrl("/api/events", {
                status: "active",
                includeBookmarkState: "false",
                limit: String(SITE_EVENTS_LIMIT),
                offset: String(page * SITE_EVENTS_LIMIT),
            }),
        );

        if (!Array.isArray(events)) {
            throw new Error("site-scoped market discovery expected /api/events to return an array");
        }

        collectMarketScope(events, scope);
        if (events.length < SITE_EVENTS_LIMIT) {
            break;
        }
    }

    siteScopeCache = {
        scope,
        expiresAt: Date.now() + SITE_SCOPE_TTL_MS,
    };
    return scope;
};

const marketConditionId = (market: unknown): string | undefined => {
    if (typeof market !== "object" || market === null) {
        return undefined;
    }
    const record = market as Record<string, unknown>;
    return (
        normalizeConditionId(record.condition_id) ??
        normalizeConditionId(record.conditionId) ??
        normalizeConditionId(record.conditionID) ??
        normalizeConditionId(record.c)
    );
};

const marketHasAllowedToken = (market: unknown, scope: SiteMarketScope): boolean => {
    const localScope = emptyScope();
    collectMarketScope(market, localScope);
    for (const tokenId of localScope.tokenIds) {
        if (scope.tokenIds.has(tokenId)) {
            return true;
        }
    }
    return false;
};

export const filterSiteScopedMarkets = <T>(markets: T[], scope: SiteMarketScope): T[] => {
    if (scope.conditionIds.size === 0 && scope.tokenIds.size === 0) {
        return [];
    }

    return markets.filter(market => {
        const conditionId = marketConditionId(market);
        if (conditionId && scope.conditionIds.has(conditionId)) {
            return true;
        }
        return marketHasAllowedToken(market, scope);
    });
};
