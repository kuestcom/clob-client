import type { BuilderConfig, BuilderHeaderPayload } from "@kuestcom/builder-signing-sdk";
import { END_CURSOR, INITIAL_CURSOR } from "./constants.ts";
import {
    ARE_ORDERS_SCORING,
    CANCEL_ALL,
    CANCEL_MARKET_ORDERS,
    CANCEL_ORDER,
    CANCEL_ORDERS,
    CLOSED_ONLY,
    CREATE_API_KEY,
    CREATE_BUILDER_API_KEY,
    CREATE_READONLY_API_KEY,
    DELETE_API_KEY,
    DELETE_READONLY_API_KEY,
    DERIVE_API_KEY,
    DROP_NOTIFICATIONS,
    GET_API_KEYS,
    GET_BALANCE_ALLOWANCE,
    GET_BUILDER_API_KEYS,
    GET_BUILDER_FEES,
    GET_BUILDER_TRADES,
    GET_CLOB_MARKET,
    GET_EARNINGS_FOR_USER_FOR_DAY,
    GET_LAST_TRADE_PRICE,
    GET_LAST_TRADES_PRICES,
    GET_LIQUIDITY_REWARD_PERCENTAGES,
    GET_MARKET,
    GET_MARKET_TRADES_EVENTS,
    GET_MARKETS,
    GET_MIDPOINT,
    GET_MIDPOINTS,
    GET_NEG_RISK,
    GET_NOTIFICATIONS,
    GET_OPEN_ORDERS,
    GET_ORDER,
    GET_ORDER_BOOK,
    GET_ORDER_BOOKS,
    GET_PRICE,
    GET_PRICES,
    GET_PRICES_HISTORY,
    GET_READONLY_API_KEYS,
    GET_REWARDS_EARNINGS_PERCENTAGES,
    GET_REWARDS_MARKETS,
    GET_REWARDS_MARKETS_CURRENT,
    GET_SAMPLING_MARKETS,
    GET_SAMPLING_SIMPLIFIED_MARKETS,
    GET_SIMPLIFIED_MARKETS,
    GET_SPREAD,
    GET_SPREADS,
    GET_TICK_SIZE,
    GET_TOTAL_EARNINGS_FOR_USER_FOR_DAY,
    GET_TRADES,
    IS_ORDER_SCORING,
    POST_HEARTBEAT,
    POST_ORDER,
    POST_ORDERS,
    REVOKE_BUILDER_API_KEY,
    TIME,
    UPDATE_BALANCE_ALLOWANCE,
    VALIDATE_READONLY_API_KEY,
    VERSION,
} from "./endpoints.ts";
import {
    ApiError,
    BUILDER_AUTH_FAILED,
    BUILDER_AUTH_NOT_AVAILABLE,
    L1_AUTH_UNAVAILABLE_ERROR,
    L2_AUTH_NOT_AVAILABLE,
} from "./errors.ts";
import { createL1Headers, createL2Headers, injectBuilderHeaders } from "./headers/index.ts";
import type { RequestOptions } from "./http-helpers/index.ts";
import {
    DELETE,
    del,
    GET,
    get,
    POST,
    parseDropNotificationParams,
    post,
    put,
} from "./http-helpers/index.ts";
import { OrderBuilder } from "./order-builder/builder.ts";
import { calculateBuyMarketPrice, calculateSellMarketPrice } from "./order-builder/helpers.ts";
import type { SignatureType, SignedOrder } from "./order-utils/index.ts";
import { RfqClient } from "./rfq-client.ts";
import type { IRfqClient, RfqDeps } from "./rfq-deps.ts";
import type { ClobSigner } from "./signer.ts";
import { GEOBLOCK_HOST, getSiteOrderContext, SITE_CONFIG } from "./site-config.ts";
import {
    filterSiteScopedMarkets,
    getSiteMarketScope,
    hasConfiguredSiteScope,
} from "./site-scope.ts";
import type {
    ApiKeyCreds,
    ApiKeyRaw,
    ApiKeysResponse,
    BalanceAllowanceParams,
    BalanceAllowanceResponse,
    BanStatus,
    BookParams,
    BuilderApiKey,
    BuilderApiKeyResponse,
    BuilderFeeRates,
    BuilderTrade,
    Chain,
    CreateOrderOptions,
    DropNotificationParams,
    FeeInfos,
    HeartbeatResponse,
    L2HeaderArgs,
    L2KuestHeader,
    L2WithBuilderHeader,
    MarketDetails,
    MarketPrice,
    MarketReward,
    MarketTradeEvent,
    NegRisk,
    NewOrder,
    Notification,
    OpenOrder,
    OpenOrderParams,
    OpenOrdersResponse,
    OrderBookSummary,
    OrderMarketCancelParams,
    OrderPayload,
    OrderScoring,
    OrderScoringParams,
    OrdersScoring,
    OrdersScoringParams,
    PaginationPayload,
    PostOrdersArgs,
    PriceHistoryFilterParams,
    ReadonlyApiKeyResponse,
    RewardsPercentages,
    TickSize,
    TickSizes,
    TokenConditionMap,
    TotalUserEarning,
    Trade,
    TradeParams,
    UserEarning,
    UserMarketOrder,
    UserOrder,
    UserRewardsEarning,
} from "./types.ts";
import { OrderType, Side } from "./types.ts";
import {
    adjustBuyAmountForFees,
    builderCodeToBytes32,
    generateOrderBookSummaryHash,
    isTickSizeSmaller,
    normalizeNextCursor,
    orderToJson,
    priceValid,
} from "./utilities.ts";

function applySiteOrderContext<T extends UserOrder | UserMarketOrder>(order: T): T {
    return {
        ...order,
        ...getSiteOrderContext(),
    };
}

export class ClobClient {
    readonly host: string;

    readonly chainId: Chain;

    // Used to perform Level 1 authentication and sign orders
    readonly signer?: ClobSigner;

    // Used to perform Level 2 authentication
    readonly creds?: ApiKeyCreds;

    readonly orderBuilder: OrderBuilder;

    readonly tickSizes: TickSizes;

    readonly negRisk: NegRisk;

    readonly feeInfos: FeeInfos;

    readonly builderFeeRates: BuilderFeeRates;

    readonly tokenConditionMap: TokenConditionMap;

    readonly geoBlockToken?: string;

    readonly useServerTime?: boolean;

    readonly builderConfig?: BuilderConfig;

    readonly rfq: IRfqClient;

    readonly retryOnError?: boolean;

    readonly throwOnError: boolean;

    private tickSizeTimestamps: Record<string, number>;

    private readonly tickSizeTtlMs: number;

    private geoblockStatus?: {
        blocked: boolean;
        country?: string;
        region?: string;
    };

    // eslint-disable-next-line max-params
    constructor(
        host: string,
        chainId: Chain,
        signer?: ClobSigner,
        creds?: ApiKeyCreds,
        signatureType?: SignatureType,
        funderAddress?: string,
        geoBlockToken?: string,
        useServerTime?: boolean,
        builderConfig?: BuilderConfig,
        getSigner?: () => Promise<ClobSigner> | ClobSigner,
        retryOnError?: boolean,
        tickSizeTtlMs?: number,
        throwOnError?: boolean,
    ) {
        this.host = host.endsWith("/") ? host.slice(0, -1) : host;
        this.chainId = chainId;

        if (signer !== undefined) {
            this.signer = signer;
        }
        if (creds !== undefined) {
            this.creds = creds;
        }
        this.orderBuilder = new OrderBuilder(
            signer as ClobSigner,
            chainId,
            signatureType,
            funderAddress,
            getSigner,
        );
        this.tickSizes = {};
        this.tickSizeTimestamps = {};
        this.tickSizeTtlMs = tickSizeTtlMs ?? 300_000;
        this.negRisk = {};
        this.feeInfos = {};
        this.builderFeeRates = {};
        this.tokenConditionMap = {};
        this.geoBlockToken = geoBlockToken;
        this.useServerTime = useServerTime;
        this.retryOnError = retryOnError;
        this.throwOnError = throwOnError ?? false;
        if (builderConfig !== undefined) {
            this.builderConfig = builderConfig;
        }

        const rfqDeps: RfqDeps = {
            host: this.host,
            signer: this.signer,
            creds: this.creds,
            useServerTime: this.useServerTime,
            geoBlockToken: this.geoBlockToken,
            userType: this.orderBuilder.signatureType,
            getServerTime: this.getServerTime.bind(this),
            getTickSize: this.getTickSize.bind(this),
            resolveTickSize: this._resolveTickSize.bind(this),
            createOrder: this.createOrder.bind(this),
            get: this.get.bind(this),
            post: this.post.bind(this),
            put: this.put.bind(this),
            del: this.del.bind(this),
        };

        this.rfq = new RfqClient(rfqDeps);
    }

    // Public endpoints
    public async getOk(): Promise<any> {
        return this.get(`${this.host}/`);
    }

    public async getServerTime(): Promise<number> {
        return this.get(`${this.host}${TIME}`);
    }

    public async getVersion(): Promise<number> {
        const response = await this.get(`${this.host}${VERSION}`);
        return response?.version ?? 2;
    }

    public async getSamplingSimplifiedMarkets(
        next_cursor = INITIAL_CURSOR,
    ): Promise<PaginationPayload> {
        return this._getSiteScopedMarketPage(GET_SAMPLING_SIMPLIFIED_MARKETS, next_cursor);
    }

    public async getSamplingMarkets(next_cursor = INITIAL_CURSOR): Promise<PaginationPayload> {
        return this._getSiteScopedMarketPage(GET_SAMPLING_MARKETS, next_cursor);
    }

    public async getSimplifiedMarkets(next_cursor = INITIAL_CURSOR): Promise<PaginationPayload> {
        return this._getSiteScopedMarketPage(GET_SIMPLIFIED_MARKETS, next_cursor);
    }

    public async getMarkets(next_cursor = INITIAL_CURSOR): Promise<PaginationPayload> {
        return this._getSiteScopedMarketPage(GET_MARKETS, next_cursor);
    }

    public async getMarket(conditionID: string): Promise<any> {
        return this.get(`${this.host}${GET_MARKET}${conditionID}`);
    }

    public async getClobMarketInfo(conditionID: string): Promise<MarketDetails> {
        const result: MarketDetails = await this.get(
            `${this.host}${GET_CLOB_MARKET}${conditionID}`,
        );
        const tokens = result.t ?? result.tokens;

        if (!tokens) {
            throw new Error(`failed to fetch market info for condition id ${conditionID}`);
        }

        const minTickSize = result.mts ?? result.min_tick_size;
        const negRisk = result.nr ?? result.neg_risk ?? false;
        const fd = result.fd ?? {};
        const makerRateBps = Number(fd.maker_fee_rate_bps ?? fd.builder_maker_fee_rate_bps ?? 0);
        const takerRateBps = Number(fd.taker_fee_rate_bps ?? fd.builder_taker_fee_rate_bps ?? 0);

        for (const token of tokens) {
            const tokenID = token?.t ?? token?.token_id;
            if (!tokenID) {
                continue;
            }

            this.tokenConditionMap[tokenID] = result.c ?? result.condition_id ?? conditionID;
            if (minTickSize !== undefined) {
                this.tickSizes[tokenID] = minTickSize.toString() as TickSize;
                this.tickSizeTimestamps[tokenID] = Date.now();
            }
            this.negRisk[tokenID] = negRisk;
            this.feeInfos[tokenID] = {
                makerRateBps,
                takerRateBps,
                rate: Number(fd.r ?? 0),
                exponent: Number(fd.e ?? 0),
            };
        }

        return result;
    }

    public async getBuilderFeeRate(builderCode: string): Promise<{ maker: number; taker: number }> {
        const normalizedBuilderCode = builderCodeToBytes32(builderCode);
        await this.ensureBuilderFeeRateCached(normalizedBuilderCode);
        return this.builderFeeRates[normalizedBuilderCode] ?? { maker: 0, taker: 0 };
    }

    public async getOrderBook(tokenID: string): Promise<OrderBookSummary> {
        const result: OrderBookSummary = await this.get(`${this.host}${GET_ORDER_BOOK}`, {
            params: { token_id: tokenID },
        });
        this.updateTickSizeFromOrderBook(result);
        return result;
    }

    public async getOrderBooks(params: BookParams[]): Promise<OrderBookSummary[]> {
        const results: OrderBookSummary[] = await this.post(`${this.host}${GET_ORDER_BOOKS}`, {
            data: params,
        });
        for (const book of results) {
            this.updateTickSizeFromOrderBook(book);
        }
        return results;
    }

    public async getTickSize(tokenID: string): Promise<TickSize> {
        const cachedAt = this.tickSizeTimestamps[tokenID];

        if (tokenID in this.tickSizes && cachedAt && Date.now() - cachedAt < this.tickSizeTtlMs) {
            return this.tickSizes[tokenID];
        }

        if (tokenID in this.tokenConditionMap) {
            await this.getClobMarketInfo(this.tokenConditionMap[tokenID]);
            if (tokenID in this.tickSizes) {
                return this.tickSizes[tokenID];
            }
        }

        const result = await this.get(`${this.host}${GET_TICK_SIZE}`, {
            params: { token_id: tokenID },
        });
        if (result.error) {
            throw new Error(result.error);
        }
        this.tickSizes[tokenID] = result.minimum_tick_size.toString() as TickSize;
        this.tickSizeTimestamps[tokenID] = Date.now();

        return this.tickSizes[tokenID];
    }

    /**
     * Clears the tick size cache, forcing fresh fetches on the next access.
     * @param tokenID - If provided, only clears the cache for this token. Otherwise clears all.
     */
    public clearTickSizeCache(tokenID?: string): void {
        if (tokenID !== undefined) {
            delete this.tickSizes[tokenID];
            delete this.tickSizeTimestamps[tokenID];
        } else {
            for (const key of Object.keys(this.tickSizes)) {
                delete this.tickSizes[key];
            }
            this.tickSizeTimestamps = {};
        }
    }

    public async getNegRisk(tokenID: string): Promise<boolean> {
        if (tokenID in this.negRisk) {
            return this.negRisk[tokenID];
        }

        if (tokenID in this.tokenConditionMap) {
            await this.getClobMarketInfo(this.tokenConditionMap[tokenID]);
            return this.negRisk[tokenID];
        }

        const result = await this.get(`${this.host}${GET_NEG_RISK}`, {
            params: { token_id: tokenID },
        });
        if (result.error) {
            throw new Error(result.error);
        }
        this.negRisk[tokenID] = result.neg_risk as boolean;

        return this.negRisk[tokenID];
    }

    /**
     * Calculates the hash for the given orderbook
     * @param orderbook
     * @returns
     */
    public getOrderBookHash(orderbook: OrderBookSummary): Promise<string> {
        return generateOrderBookSummaryHash(orderbook);
    }

    public async getMidpoint(tokenID: string): Promise<any> {
        return this.get(`${this.host}${GET_MIDPOINT}`, {
            params: { token_id: tokenID },
        });
    }

    public async getMidpoints(params: BookParams[]): Promise<any> {
        return this.post(`${this.host}${GET_MIDPOINTS}`, {
            data: params,
        });
    }

    public async getPrice(tokenID: string, side: string): Promise<any> {
        return this.get(`${this.host}${GET_PRICE}`, {
            params: { token_id: tokenID, side: side },
        });
    }

    public async getPrices(params: BookParams[]): Promise<any> {
        return this.post(`${this.host}${GET_PRICES}`, {
            data: params,
        });
    }

    public async getSpread(tokenID: string): Promise<any> {
        return this.get(`${this.host}${GET_SPREAD}`, {
            params: { token_id: tokenID },
        });
    }

    public async getSpreads(params: BookParams[]): Promise<any> {
        return this.post(`${this.host}${GET_SPREADS}`, {
            data: params,
        });
    }

    public async getLastTradePrice(tokenID: string): Promise<any> {
        return this.get(`${this.host}${GET_LAST_TRADE_PRICE}`, {
            params: { token_id: tokenID },
        });
    }

    public async getLastTradesPrices(params: BookParams[]): Promise<any> {
        return this.post(`${this.host}${GET_LAST_TRADES_PRICES}`, {
            data: params,
        });
    }

    public async getPricesHistory(params: PriceHistoryFilterParams): Promise<MarketPrice[]> {
        return this.get(`${this.host}${GET_PRICES_HISTORY}`, {
            params,
        });
    }

    // L1 Authed

    /**
     * Creates a new API key for a user
     * @param nonce
     * @returns ApiKeyCreds
     */
    public async createApiKey(nonce?: number): Promise<ApiKeyCreds> {
        this.canL1Auth();

        const endpoint = `${this.host}${CREATE_API_KEY}`;
        const headers = await createL1Headers(
            this.signer as ClobSigner,
            this.chainId,
            nonce,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return await this.post(endpoint, { headers }).then((apiKeyRaw: ApiKeyRaw) => {
            const apiKey: ApiKeyCreds = {
                key: apiKeyRaw.apiKey,
                secret: apiKeyRaw.secret,
                passphrase: apiKeyRaw.passphrase,
            };
            return apiKey;
        });
    }

    /**
     * Derives an existing API key for a user
     * @param nonce
     * @returns ApiKeyCreds
     */
    public async deriveApiKey(nonce?: number): Promise<ApiKeyCreds> {
        this.canL1Auth();

        const endpoint = `${this.host}${DERIVE_API_KEY}`;
        const headers = await createL1Headers(
            this.signer as ClobSigner,
            this.chainId,
            nonce,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return await this.get(endpoint, { headers }).then((apiKeyRaw: ApiKeyRaw) => {
            const apiKey: ApiKeyCreds = {
                key: apiKeyRaw.apiKey,
                secret: apiKeyRaw.secret,
                passphrase: apiKeyRaw.passphrase,
            };
            return apiKey;
        });
    }

    public async createOrDeriveApiKey(nonce?: number): Promise<ApiKeyCreds> {
        return this.createApiKey(nonce).then(response => {
            if (!response.key) {
                return this.deriveApiKey(nonce);
            }
            return response;
        });
    }

    public async getApiKeys(): Promise<ApiKeysResponse> {
        this.canL2Auth();

        const endpoint = GET_API_KEYS;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.get(`${this.host}${endpoint}`, { headers });
    }

    public async getClosedOnlyMode(): Promise<BanStatus> {
        this.canL2Auth();

        const endpoint = CLOSED_ONLY;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.get(`${this.host}${endpoint}`, { headers });
    }

    public async deleteApiKey(): Promise<any> {
        this.canL2Auth();

        const endpoint = DELETE_API_KEY;
        const headerArgs = {
            method: DELETE,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.del(`${this.host}${endpoint}`, { headers });
    }

    /**
     * Creates a new readonly API key for a user
     * @returns ReadonlyApiKeyResponse
     */
    public async createReadonlyApiKey(): Promise<ReadonlyApiKeyResponse> {
        this.canL2Auth();

        const endpoint = CREATE_READONLY_API_KEY;
        const headerArgs = {
            method: POST,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.post(`${this.host}${endpoint}`, { headers });
    }

    public async getReadonlyApiKeys(): Promise<string[]> {
        this.canL2Auth();

        const endpoint = GET_READONLY_API_KEYS;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.get(`${this.host}${endpoint}`, { headers });
    }

    /**
     * Deletes a readonly API key for a user
     * @param key The readonly API key to delete
     * @returns boolean
     */
    public async deleteReadonlyApiKey(key: string): Promise<boolean> {
        this.canL2Auth();

        const endpoint = DELETE_READONLY_API_KEY;
        const payload = { key };
        const headerArgs = {
            method: DELETE,
            requestPath: endpoint,
            body: JSON.stringify(payload),
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.del(`${this.host}${endpoint}`, { headers, data: payload });
    }

    /**
     * Validates a readonly API key for a given address
     * @param address The wallet address
     * @param key The readonly API key to validate
     * @returns string
     */
    public async validateReadonlyApiKey(address: string, key: string): Promise<string> {
        return this.get(`${this.host}${VALIDATE_READONLY_API_KEY}`, {
            params: { address, key },
        });
    }

    public async getOrder(orderID: string): Promise<OpenOrder> {
        this.canL2Auth();

        const endpoint = `${GET_ORDER}${orderID}`;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        // builders flow
        if (this.canBuilderAuth()) {
            const builderHeaders = await this._generateBuilderHeaders(headers, headerArgs);
            if (builderHeaders !== undefined) {
                return this.get(`${this.host}${endpoint}`, { headers: builderHeaders });
            }
        }

        return this.get(`${this.host}${endpoint}`, { headers });
    }

    public async getTrades(
        params?: TradeParams,
        only_first_page = false,
        next_cursor?: string,
    ): Promise<Trade[]> {
        this.canL2Auth();

        const endpoint = GET_TRADES;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        let results: Trade[] = [];
        next_cursor = next_cursor || INITIAL_CURSOR;
        while (next_cursor !== END_CURSOR && (next_cursor === INITIAL_CURSOR || !only_first_page)) {
            const _params = {
                ...params,
                next_cursor,
            };
            const response = await this.get(`${this.host}${endpoint}`, {
                headers,
                params: _params,
            });
            next_cursor = normalizeNextCursor(response.next_cursor, next_cursor);
            results = [...results, ...response.data];
        }
        return results;
    }

    public async getTradesPaginated(
        params?: TradeParams,
        next_cursor?: string,
    ): Promise<{ trades: Trade[]; next_cursor: string; limit: number; count: number }> {
        this.canL2Auth();

        const endpoint = GET_TRADES;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        next_cursor = next_cursor || INITIAL_CURSOR;

        const _params = { ...params, next_cursor };

        const {
            data,
            ...rest
        }: {
            data: Trade[];
            next_cursor: string;
            limit: number;
            count: number;
        } = await this.get(`${this.host}${endpoint}`, {
            headers,
            params: _params,
        });

        return { trades: Array.isArray(data) ? [...data] : [], ...rest };
    }

    public async getBuilderTrades(
        params?: TradeParams,
        next_cursor?: string,
    ): Promise<{ trades: BuilderTrade[]; next_cursor: string; limit: number; count: number }> {
        this.mustBuilderAuth();

        const endpoint = GET_BUILDER_TRADES;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await this._getBuilderHeaders(headerArgs.method, headerArgs.requestPath);

        if (headers === undefined || headers === null) {
            throw BUILDER_AUTH_FAILED;
        }

        next_cursor = next_cursor || INITIAL_CURSOR;

        const _params = { ...params, next_cursor };

        const {
            data,
            ...rest
        }: {
            data: BuilderTrade[];
            next_cursor: string;
            limit: number;
            count: number;
        } = await this.get(`${this.host}${endpoint}`, {
            headers,
            params: _params,
        });

        return { trades: Array.isArray(data) ? [...data] : [], ...rest };
    }

    public async getNotifications(): Promise<Notification[]> {
        this.canL2Auth();

        const endpoint = GET_NOTIFICATIONS;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.get(`${this.host}${endpoint}`, {
            headers,
            params: { signature_type: this.orderBuilder.signatureType },
        });
    }

    public async dropNotifications(params?: DropNotificationParams): Promise<void> {
        this.canL2Auth();

        const endpoint = DROP_NOTIFICATIONS;
        const l2HeaderArgs = {
            method: DELETE,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.del(`${this.host}${endpoint}`, {
            headers,
            params: parseDropNotificationParams(params),
        });
    }

    public async getBalanceAllowance(
        params?: BalanceAllowanceParams,
    ): Promise<BalanceAllowanceResponse> {
        this.canL2Auth();

        const endpoint = GET_BALANCE_ALLOWANCE;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        const _params = {
            ...params,
            signature_type: this.orderBuilder.signatureType,
        };

        return this.get(`${this.host}${endpoint}`, { headers, params: _params });
    }

    public async updateBalanceAllowance(params?: BalanceAllowanceParams): Promise<void> {
        this.canL2Auth();

        const endpoint = UPDATE_BALANCE_ALLOWANCE;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        const _params = {
            ...params,
            signature_type: this.orderBuilder.signatureType,
        };

        return this.get(`${this.host}${endpoint}`, { headers, params: _params });
    }

    public async createOrder(
        userOrder: UserOrder,
        options?: Partial<CreateOrderOptions>,
    ): Promise<SignedOrder> {
        this.canL1Auth();

        const orderToSign = applySiteOrderContext(userOrder);
        const { tokenID } = orderToSign;

        const tickSize = await this._resolveTickSize(tokenID, options?.tickSize);

        if (!priceValid(orderToSign.price, tickSize)) {
            throw new Error(
                `invalid price (${orderToSign.price}), min: ${Number.parseFloat(tickSize)} - max: ${
                    1 - Number.parseFloat(tickSize)
                }`,
            );
        }

        const negRisk = options?.negRisk ?? (await this.getNegRisk(tokenID));

        return this.orderBuilder.buildOrder(orderToSign, {
            tickSize,
            negRisk,
        });
    }

    public async createMarketOrder(
        userMarketOrder: UserMarketOrder,
        options?: Partial<CreateOrderOptions>,
    ): Promise<SignedOrder> {
        this.canL1Auth();

        const orderToSign = applySiteOrderContext(userMarketOrder);
        const { tokenID } = orderToSign;

        const tickSize = await this._resolveTickSize(tokenID, options?.tickSize);

        if (!orderToSign.price) {
            orderToSign.price = await this.calculateMarketPrice(
                tokenID,
                orderToSign.side,
                orderToSign.amount,
                orderToSign.orderType,
            );
        }

        if (!priceValid(orderToSign.price, tickSize)) {
            throw new Error(
                `invalid price (${orderToSign.price}), min: ${Number.parseFloat(tickSize)} - max: ${
                    1 - Number.parseFloat(tickSize)
                }`,
            );
        }

        orderToSign.builderCode = builderCodeToBytes32(orderToSign.builderCode);

        if (orderToSign.side === Side.BUY && orderToSign.userUSDCBalance !== undefined) {
            await this._ensureMarketInfoCached(tokenID);
            await this.ensureBuilderFeeRateCached(orderToSign.builderCode);
            const fees = this.feeInfos[tokenID] ?? {
                makerRateBps: 0,
                takerRateBps: 0,
                rate: 0,
                exponent: 0,
            };
            const builderTakerFeeRateBps =
                this.builderFeeRates[orderToSign.builderCode]?.taker ?? 0;
            orderToSign.amount = adjustBuyAmountForFees(
                orderToSign.amount,
                orderToSign.price ?? 0,
                orderToSign.userUSDCBalance,
                fees.takerRateBps,
                builderTakerFeeRateBps,
            );
        }

        const negRisk = options?.negRisk ?? (await this.getNegRisk(tokenID));

        return this.orderBuilder.buildMarketOrder(orderToSign, {
            tickSize,
            negRisk,
        });
    }

    public async createAndPostOrder<T extends OrderType.GTC | OrderType.GTD = OrderType.GTC>(
        userOrder: UserOrder,
        options?: Partial<CreateOrderOptions>,
        orderType: T = OrderType.GTC as T,
        deferExec = false,
        postOnly = false,
    ): Promise<any> {
        const order = await this.createOrder(userOrder, options);
        return this.postOrder(order, orderType, deferExec, postOnly);
    }

    public async createAndPostMarketOrder<T extends OrderType.FOK | OrderType.FAK = OrderType.FOK>(
        userMarketOrder: UserMarketOrder,
        options?: Partial<CreateOrderOptions>,
        orderType: T = OrderType.FOK as T,
        deferExec = false,
    ): Promise<any> {
        const order = await this.createMarketOrder(userMarketOrder, options);
        return this.postOrder(order, orderType, deferExec);
    }

    public async getOpenOrders(
        params?: OpenOrderParams,
        only_first_page = false,
        next_cursor?: string,
    ): Promise<OpenOrdersResponse> {
        this.canL2Auth();
        const endpoint = GET_OPEN_ORDERS;
        const l2HeaderArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        // builders flow
        let requestHeaders = headers;
        if (this.canBuilderAuth()) {
            const builderHeaders = await this._generateBuilderHeaders(headers, l2HeaderArgs);
            if (builderHeaders !== undefined) {
                requestHeaders = builderHeaders;
            }
        }

        let results: OpenOrder[] = [];
        next_cursor = next_cursor || INITIAL_CURSOR;
        while (next_cursor !== END_CURSOR && (next_cursor === INITIAL_CURSOR || !only_first_page)) {
            const _params = {
                ...params,
                next_cursor,
            };
            const response = await this.get(`${this.host}${endpoint}`, {
                headers: requestHeaders,
                params: _params,
            });
            next_cursor = normalizeNextCursor(response.next_cursor, next_cursor);
            results = [...results, ...response.data];
        }
        return results;
    }

    public async postOrder<T extends OrderType = OrderType.GTC>(
        order: SignedOrder,
        orderType: T = OrderType.GTC as T,
        deferExec = false,
        postOnly = false,
    ): Promise<any> {
        this.canL2Auth();
        const endpoint = POST_ORDER;
        const orderPayload = orderToJson(
            order,
            this.creds?.key || "",
            orderType,
            deferExec,
            postOnly,
        );

        const l2HeaderArgs = {
            method: POST,
            requestPath: endpoint,
            body: JSON.stringify(orderPayload),
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        // builders flow
        if (this.canBuilderAuth()) {
            const builderHeaders = await this._generateBuilderHeaders(headers, l2HeaderArgs);
            if (builderHeaders !== undefined) {
                return this.post(`${this.host}${endpoint}`, {
                    headers: builderHeaders,
                    data: orderPayload,
                });
            }
        }

        return this.post(`${this.host}${endpoint}`, { headers, data: orderPayload });
    }

    public async postOrders(
        args: PostOrdersArgs[],
        deferExec = false,
        defaultPostOnly = false,
    ): Promise<any> {
        this.canL2Auth();
        const endpoint = POST_ORDERS;
        const ordersPayload: NewOrder<any>[] = [];
        for (const { order, orderType, postOnly: orderPostOnly } of args) {
            const orderPayload = orderToJson(
                order,
                this.creds?.key || "",
                orderType,
                deferExec,
                orderPostOnly ?? defaultPostOnly,
            );
            ordersPayload.push(orderPayload);
        }

        const l2HeaderArgs = {
            method: POST,
            requestPath: endpoint,
            body: JSON.stringify(ordersPayload),
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        // builders flow
        if (this.canBuilderAuth()) {
            const builderHeaders = await this._generateBuilderHeaders(headers, l2HeaderArgs);
            if (builderHeaders !== undefined) {
                return this.post(`${this.host}${endpoint}`, {
                    headers: builderHeaders,
                    data: ordersPayload,
                });
            }
        }

        return this.post(`${this.host}${endpoint}`, { headers, data: ordersPayload });
    }

    public async cancelOrder(payload: OrderPayload): Promise<any> {
        this.canL2Auth();
        const endpoint = CANCEL_ORDER;
        const l2HeaderArgs = {
            method: DELETE,
            requestPath: endpoint,
            body: JSON.stringify(payload),
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );
        return this.del(`${this.host}${endpoint}`, { headers, data: payload });
    }

    public async cancelOrders(ordersHashes: string[]): Promise<any> {
        this.canL2Auth();
        const endpoint = CANCEL_ORDERS;
        const l2HeaderArgs = {
            method: DELETE,
            requestPath: endpoint,
            body: JSON.stringify(ordersHashes),
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );
        return this.del(`${this.host}${endpoint}`, { headers, data: ordersHashes });
    }

    public async cancelAll(): Promise<any> {
        this.canL2Auth();
        const endpoint = CANCEL_ALL;
        const l2HeaderArgs = {
            method: DELETE,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );
        return this.del(`${this.host}${endpoint}`, { headers });
    }

    /**
     * Sends a heartbeat to the server to keep the session active.
     *
     * If heartbeats are started and one isn't sent within 10s, all orders will be cancelled.
     * Requires Level 2 authentication.
     *
     * Pass the previously returned `heartbeat_id` to chain heartbeats.
     * Pass `undefined`/`null` to start a new heartbeat chain.
     */
    public async postHeartbeat(heartbeatId?: string | null): Promise<HeartbeatResponse> {
        this.canL2Auth();
        const endpoint = POST_HEARTBEAT;

        const bodyObj = { heartbeat_id: heartbeatId ?? null };
        const serialized = JSON.stringify(bodyObj);

        const l2HeaderArgs = {
            method: POST,
            requestPath: endpoint,
            body: serialized,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.post(`${this.host}${endpoint}`, { headers, data: serialized });
    }

    public async cancelMarketOrders(payload: OrderMarketCancelParams): Promise<any> {
        this.canL2Auth();
        const endpoint = CANCEL_MARKET_ORDERS;
        const l2HeaderArgs = {
            method: DELETE,
            requestPath: endpoint,
            body: JSON.stringify(payload),
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            l2HeaderArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );
        return this.del(`${this.host}${endpoint}`, { headers, data: payload });
    }

    public async isOrderScoring(params?: OrderScoringParams): Promise<OrderScoring> {
        this.canL2Auth();

        const endpoint = IS_ORDER_SCORING;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.get(`${this.host}${endpoint}`, { headers, params });
    }

    public async areOrdersScoring(params?: OrdersScoringParams): Promise<OrdersScoring> {
        this.canL2Auth();

        const endpoint = ARE_ORDERS_SCORING;
        const payload = JSON.stringify(params?.orderIds);
        const headerArgs = {
            method: POST,
            requestPath: endpoint,
            body: payload,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.post(`${this.host}${endpoint}`, {
            headers,
            data: payload,
        });
    }

    // Rewards
    public async getEarningsForUserForDay(date: string): Promise<UserEarning[]> {
        this.canL2Auth();

        const endpoint = GET_EARNINGS_FOR_USER_FOR_DAY;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        let results: UserEarning[] = [];
        let next_cursor = INITIAL_CURSOR;
        while (next_cursor !== END_CURSOR) {
            const params = {
                date,
                signature_type: this.orderBuilder.signatureType,
                next_cursor,
            };

            const response = await this.get(`${this.host}${endpoint}`, {
                headers,
                params,
            });
            next_cursor = normalizeNextCursor(response.next_cursor, next_cursor);
            results = [...results, ...response.data];
        }
        return results;
    }

    public async getTotalEarningsForUserForDay(date: string): Promise<TotalUserEarning[]> {
        this.canL2Auth();

        const endpoint = GET_TOTAL_EARNINGS_FOR_USER_FOR_DAY;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        const params = {
            date,
            signature_type: this.orderBuilder.signatureType,
        };

        return await this.get(`${this.host}${endpoint}`, {
            headers,
            params,
        });
    }

    public async getUserEarningsAndMarketsConfig(
        date: string,
        order_by = "",
        position = "",
        no_competition = false,
    ): Promise<UserRewardsEarning[]> {
        this.canL2Auth();

        const endpoint = GET_REWARDS_EARNINGS_PERCENTAGES;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        let results: UserRewardsEarning[] = [];
        let next_cursor = INITIAL_CURSOR;
        while (next_cursor !== END_CURSOR) {
            const params = {
                date,
                signature_type: this.orderBuilder.signatureType,
                next_cursor,
                order_by,
                position,
                no_competition,
            };

            const response = await this.get(`${this.host}${endpoint}`, {
                headers,
                params,
            });
            next_cursor = normalizeNextCursor(response.next_cursor, next_cursor);
            results = [...results, ...response.data];
        }
        return results;
    }

    public async getRewardPercentages(): Promise<RewardsPercentages> {
        this.canL2Auth();

        const endpoint = GET_LIQUIDITY_REWARD_PERCENTAGES;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        const _params = {
            signature_type: this.orderBuilder.signatureType,
        };

        return this.get(`${this.host}${endpoint}`, { headers, params: _params });
    }

    public async getCurrentRewards(): Promise<MarketReward[]> {
        let results: MarketReward[] = [];
        let next_cursor = INITIAL_CURSOR;
        while (next_cursor !== END_CURSOR) {
            const response = await this.get(`${this.host}${GET_REWARDS_MARKETS_CURRENT}`, {
                params: { next_cursor },
            });
            next_cursor = normalizeNextCursor(response.next_cursor, next_cursor);
            results = [...results, ...response.data];
        }
        return results;
    }

    public async getRawRewardsForMarket(conditionId: string): Promise<MarketReward[]> {
        let results: MarketReward[] = [];
        let next_cursor = INITIAL_CURSOR;
        while (next_cursor !== END_CURSOR) {
            const response = await this.get(`${this.host}${GET_REWARDS_MARKETS}${conditionId}`, {
                params: { next_cursor },
            });
            next_cursor = normalizeNextCursor(response.next_cursor, next_cursor);
            results = [...results, ...response.data];
        }
        return results;
    }

    public async getMarketTradesEvents(conditionID: string): Promise<MarketTradeEvent[]> {
        return this.get(`${this.host}${GET_MARKET_TRADES_EVENTS}${conditionID}`);
    }

    public async calculateMarketPrice(
        tokenID: string,
        side: Side,
        amount: number,
        orderType: OrderType = OrderType.FOK,
    ): Promise<number> {
        const book = await this.getOrderBook(tokenID);
        if (!book) {
            throw new Error("no orderbook");
        }
        if (side === Side.BUY) {
            if (!book.asks) {
                throw new Error("no match");
            }
            return calculateBuyMarketPrice(book.asks, amount, orderType);
        }
        if (!book.bids) {
            throw new Error("no match");
        }
        return calculateSellMarketPrice(book.bids, amount, orderType);
    }

    public async createBuilderApiKey(): Promise<BuilderApiKey> {
        if (!SITE_CONFIG.builder_mode) {
            throw BUILDER_AUTH_NOT_AVAILABLE;
        }
        this.canL2Auth();

        const endpoint = CREATE_BUILDER_API_KEY;
        const headerArgs = {
            method: POST,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.post(`${this.host}${endpoint}`, { headers });
    }

    public async getBuilderApiKeys(): Promise<BuilderApiKeyResponse[]> {
        if (!SITE_CONFIG.builder_mode) {
            throw BUILDER_AUTH_NOT_AVAILABLE;
        }
        this.canL2Auth();

        const endpoint = GET_BUILDER_API_KEYS;
        const headerArgs = {
            method: GET,
            requestPath: endpoint,
        };

        const headers = await createL2Headers(
            this.signer as ClobSigner,
            this.creds as ApiKeyCreds,
            headerArgs,
            this.useServerTime ? await this.getServerTime() : undefined,
        );

        return this.get(`${this.host}${endpoint}`, { headers });
    }

    public async revokeBuilderApiKey(): Promise<any> {
        this.mustBuilderAuth();

        const endpoint = REVOKE_BUILDER_API_KEY;
        const headerArgs = {
            method: DELETE,
            requestPath: endpoint,
        };

        const headers = await this._getBuilderHeaders(headerArgs.method, headerArgs.requestPath);
        if (headers === undefined || headers === null) {
            throw BUILDER_AUTH_FAILED;
        }

        return this.del(`${this.host}${endpoint}`, { headers });
    }

    private async _ensureMarketInfoCached(tokenID: string): Promise<void> {
        if (tokenID in this.feeInfos) {
            return;
        }

        let conditionID = this.tokenConditionMap[tokenID];
        if (!conditionID) {
            const book = await this.getOrderBook(tokenID);
            conditionID = book?.market;
            if (!conditionID) {
                throw new Error(`failed to resolve condition id for token ${tokenID}`);
            }
            this.tokenConditionMap[tokenID] = conditionID;
        }

        await this.getClobMarketInfo(conditionID);
    }

    private async _getSiteScopedMarketPage(
        endpoint: string,
        next_cursor = INITIAL_CURSOR,
    ): Promise<PaginationPayload> {
        if (!hasConfiguredSiteScope()) {
            return this.get(`${this.host}${endpoint}`, {
                params: { next_cursor },
            });
        }

        let cursor = next_cursor;
        while (true) {
            const response = await this.get(`${this.host}${endpoint}`, {
                params: { next_cursor: cursor },
            });
            const data = Array.isArray(response?.data) ? response.data : [];
            const scope = await getSiteMarketScope();
            const filtered = filterSiteScopedMarkets(data, scope);
            const scopedResponse = { ...response, data: filtered };
            const responseCursor =
                typeof response?.next_cursor === "string" ? response.next_cursor : END_CURSOR;

            if (filtered.length > 0 || responseCursor === END_CURSOR || responseCursor === cursor) {
                return scopedResponse;
            }

            cursor = responseCursor;
        }
    }

    private async ensureBuilderFeeRateCached(builderCode?: string): Promise<void> {
        const normalizedBuilderCode = builderCodeToBytes32(builderCode);
        if (normalizedBuilderCode === builderCodeToBytes32()) {
            return;
        }
        if (normalizedBuilderCode in this.builderFeeRates) {
            return;
        }

        const result = await this.get(`${this.host}${GET_BUILDER_FEES}${normalizedBuilderCode}`);
        this.builderFeeRates[normalizedBuilderCode] = {
            maker: Number(result.builder_maker_fee_rate_bps ?? 0),
            taker: Number(result.builder_taker_fee_rate_bps ?? 0),
        };
    }

    protected async _resolveTickSize(tokenID: string, tickSize?: TickSize): Promise<TickSize> {
        const minTickSize = await this.getTickSize(tokenID);
        if (tickSize) {
            if (isTickSizeSmaller(tickSize, minTickSize)) {
                throw new Error(
                    `invalid tick size (${tickSize}), minimum for the market is ${minTickSize}`,
                );
            }
        } else {
            tickSize = minTickSize;
        }
        return tickSize;
    }

    // http methods
    protected async get(endpoint: string, options?: RequestOptions) {
        const result = await get(endpoint, {
            ...options,
            params: { ...options?.params, geo_block_token: this.geoBlockToken },
        });
        return this.throwIfError(result);
    }

    protected async post(endpoint: string, options?: RequestOptions) {
        await this.ensureGeoblockAllowed();
        const result = await post(
            endpoint,
            {
                ...options,
                params: { ...options?.params, geo_block_token: this.geoBlockToken },
            },
            this.retryOnError,
        );
        return this.throwIfError(result);
    }

    protected async put(endpoint: string, options?: RequestOptions) {
        await this.ensureGeoblockAllowed();
        const result = await put(endpoint, {
            ...options,
            params: { ...options?.params, geo_block_token: this.geoBlockToken },
        });
        return this.throwIfError(result);
    }

    protected async del(endpoint: string, options?: RequestOptions) {
        await this.ensureGeoblockAllowed();
        const result = await del(endpoint, {
            ...options,
            params: { ...options?.params, geo_block_token: this.geoBlockToken },
        });
        return this.throwIfError(result);
    }

    private throwIfError(result: any): any {
        if (this.throwOnError && result && typeof result === "object" && "error" in result) {
            const msg =
                typeof result.error === "string" ? result.error : JSON.stringify(result.error);
            throw new ApiError(msg, result.status, result);
        }
        return result;
    }

    private canL1Auth(): void {
        if (this.signer === undefined) {
            throw L1_AUTH_UNAVAILABLE_ERROR;
        }
    }

    private canL2Auth(): void {
        if (this.signer === undefined) {
            throw L1_AUTH_UNAVAILABLE_ERROR;
        }

        if (this.creds === undefined) {
            throw L2_AUTH_NOT_AVAILABLE;
        }
    }

    private mustBuilderAuth(): void {
        if (!this.canBuilderAuth()) {
            throw BUILDER_AUTH_NOT_AVAILABLE;
        }
    }

    private canBuilderAuth(): boolean {
        return SITE_CONFIG.builder_mode && (this.builderConfig?.isValid() ?? false);
    }

    private async _generateBuilderHeaders(
        headers: L2KuestHeader,
        headerArgs: L2HeaderArgs,
    ): Promise<L2WithBuilderHeader | undefined> {
        if (this.builderConfig !== undefined) {
            const builderHeaders = await this._getBuilderHeaders(
                headerArgs.method,
                headerArgs.requestPath,
                headerArgs.body,
            );
            if (builderHeaders === undefined || builderHeaders === null) {
                return undefined;
            }
            return injectBuilderHeaders(headers, builderHeaders);
        }

        return undefined;
    }

    private async _getBuilderHeaders(
        method: string,
        path: string,
        body?: string,
    ): Promise<BuilderHeaderPayload | undefined> {
        return (this.builderConfig as BuilderConfig).generateBuilderHeaders(method, path, body);
    }

    private async ensureGeoblockAllowed(): Promise<void> {
        if (!SITE_CONFIG.geoblock) {
            return;
        }

        if (this.geoblockStatus === undefined) {
            if (!SITE_CONFIG.site_url.trim()) {
                throw new Error("site_url must be configured when geoblock is enabled");
            }

            const result = await get(
                `${GEOBLOCK_HOST}/?url=${encodeURIComponent(SITE_CONFIG.site_url)}`,
            );
            if (result && typeof result === "object" && "error" in result) {
                const message =
                    typeof result.error === "string" ? result.error : JSON.stringify(result.error);
                throw new ApiError(message, result.status, result);
            }
            this.geoblockStatus = result;
        }

        if (this.geoblockStatus?.blocked) {
            throw new Error(
                `trading blocked for configured site_url (${SITE_CONFIG.site_url}) in ${this.geoblockStatus.country ?? "unknown"}, ${this.geoblockStatus.region ?? "unknown"}`,
            );
        }
    }

    /**
     * Opportunistically updates the tick size cache from an order book response.
     */
    private updateTickSizeFromOrderBook(book: OrderBookSummary): void {
        if (book?.asset_id && book?.tick_size) {
            const tickSize = book.tick_size as TickSize;
            this.tickSizes[book.asset_id] = tickSize;
            this.tickSizeTimestamps[book.asset_id] = Date.now();
        }
    }
}
