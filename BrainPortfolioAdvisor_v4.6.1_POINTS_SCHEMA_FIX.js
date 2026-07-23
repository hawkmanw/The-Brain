// ==UserScript==
// @name         Torn PDA - Stock Portfolio Advisor V4.6.1 - Points Schema Fix
// @namespace    wes-stock-portfolio-advisor
// @version      4.6.1
// @description  Evidence-driven portfolio advisor with corrected Torn Points Market schema parsing, staged diagnostics, patient API timeouts, and no fallback valuations.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================================
    // The Brain
    //
    // Observe honestly.
    // Reason carefully.
    // Speak truthfully.
    // Respect uncertainty.
    // Earn trust.
    //
    // These principles govern every recommendation. Missing evidence is reported,
    // never concealed or replaced with an invented fallback value.
    // ============================================================================


    //Quick guard
    if (!location.href.includes('sid=stocks')) return;
    /*
  /*
  ===============================================================================
  The Brain Charter
  ===============================================================================

  Mission
  -------
  Determine the mathematically optimal Torn stock portfolio using current market
  conditions, then recommend the sequence of actions that most improves the user's
  portfolio toward that optimum.

  Core Assumption
  ---------------
  The current portfolio is treated as a starting point,
  not as the desired destination.

  Brain first determines the portfolio it would build if starting from scratch
  using today's market conditions and available capital.

  Every recommendation is then evaluated by how much it moves the current
  portfolio toward that optimal portfolio.

  Guiding Principles
  ------------------
  • Optimization Engine, not Reporter.
  • Brain optimizes portfolios—not individual stocks.
  • Every holding is evaluated.
  • No holding is presumed correct.
  • No capital is presumed untouchable during analysis.
  • Recommendations remain practical and confidence-driven.
  • Every recommendation must be explainable.
  • Every widget answers one question well.
  • Never imply certainty.
  • Human judgment remains part of the process.
  • Remove redundant presentation before adding features.
  • One logical improvement per checkpoint.

  Non-Goals
  ---------
  • Strategic stock benefits are acknowledged but are not assigned speculative dollar values.

  • Do not optimize for every possible play style.

  • Do not hide assumptions from the user.

  • When trade-offs cannot be measured objectively,
    Brain informs the user rather than deciding for them.

  ===============================================================================
  */
    /*
   ────────────────────────────────────────────────────

   The Brain Design Charter

   The Brain's uniqueness comes from its intelligence, not its appearance.

   The Brain thinks once. Everything else is presentation.

   The Brain exists to help players make better decisions.

   It answers one question:

       "What should I do next?"

   The Brain reasons first. Presentation follows.

   The Brain speaks with one voice.

   The Brain reveals one thought at a time.

   The Brain speaks in plain language.

   It recommends actions using words every Torn player can understand.

   Financial terminology is used only when it improves understanding.

   Operation Chameleon Discovery:
   The Brain began life as a Torn widget. Operation Chameleon transforms the widget into The Brain.

   Whenever practical, the Brain is constructed from Torn's native UI components rather than recreating them. Appearance is inherited as a consequence.
   Prefer inheriting Torn's presentation over defining our own.

   Every new feature should make at least one existing piece of code simpler.

   The Brain speaks through a single interface.

   Before analysis, it welcomes the user.

   After analysis, it presents a recommendation,
   explains its reasoning,
   and provides supporting evidence.

   There is only one Brain.

   The Brain thinks once. The Brain speaks once.

   Only one box. One box to rule them all.

   Colors represent actions:

   🟢 KEEP SAVING
   🟠 REBALANCE
   🔵 BUY
   🔴 ERROR

   Evidence supports the recommendation.
   It never competes with it.

   The Brain never asks the player to read more than they need to make the next good decision.

   Occam's Razor

   Prefer removing code over adding code.
   Prefer composing native Torn components over
   recreating them.
   Prefer removing words over adding them.
   ────────────────────────────────────────────────────
   */
    const KEY_STORAGE = 'wes_stock_roi_api_key_v33';
    // TornPDA automatically replaces this placeholder with the user's API key.
    const PDA_API_KEY = '###PDA-APIKEY###';
    const CASH_STORAGE = 'wes_stock_roi_cash_v33';
    const PARKING_STORAGE = 'wes_stock_cash_parking_v33';
    const STRATEGIC_SALE_STORAGE = 'wes_stock_strategic_sale_blocks_v41';
    const MIN_EXTRA_ANNUAL_GAIN = 5000000;
    const API_TIMEOUTS = Object.freeze({
        stocks: 10000,
        portfolio: 10000,
        items: 15000,
        points: 15000,
        default: 10000
    });
    const SLOW_NOTICE_MS = 5000;
    let analysisInProgress = false;

    // Application lifecycle and recommendation states.
    const BrainState = Object.freeze({

        READY: "READY",

        SCANNING: "SCANNING",

        KEEP_SAVING: "KEEP_SAVING",

        REBALANCE_RECOMMENDATION: "REBALANCE_RECOMMENDATION",

        BUY_RECOMMENDATION: "BUY_RECOMMENDATION",

        ERROR: "ERROR"

    });

    const LIVE_DIVIDEND_CACHE = {};

    const RewardValueStatus = Object.freeze({
        KNOWN: 'known',
        UNAVAILABLE: 'unavailable',
        NOT_APPLICABLE: 'not_applicable'
    });

    // One canonical definition per stock. rewardType determines how Brain treats
    // the reward: market and cash participate in ROI; benefit and special do not.
    const STOCKS = {
        SYM: { required: 500000, rewardType: 'market', item: 'Drug Pack', days: 7, maxInc: 4 },
        FHG: { required: 2000000, rewardType: 'market', item: 'Feathery Hotel Coupon', days: 7, maxInc: 4 },
        PRN: { required: 1000000, rewardType: 'market', item: 'Erotic DVD', days: 7, maxInc: 4 },
        MUN: { required: 5000000, rewardType: 'market', item: 'Six-Pack of Energy Drink', days: 7, maxInc: 4 },
        THS: { required: 150000, rewardType: 'market', item: 'Box of Medical Supplies', days: 7, maxInc: 4 },
        EWM: { required: 1000000, rewardType: 'market', item: 'Box of Grenades', days: 7, maxInc: 4 },
        LSC: { required: 500000, rewardType: 'market', item: 'Lottery Voucher', days: 7, maxInc: 4 },
        ASS: { required: 1000000, rewardType: 'market', item: 'Six-Pack of Alcohol', days: 7, maxInc: 4 },
        LAG: { required: 750000, rewardType: 'market', item: "Lawyer's Business Card", days: 7, maxInc: 4 },

        // PTS pays 100 points every seven days. The value is derived from the live
        // Points Market using a quantity-weighted average of the listings Torn returns.
        PTS: { required: 10000000, rewardType: 'market', marketSource: 'points', rewardAmount: 100, description: '100 Points', days: 7, maxInc: 4 },
        HRG: { required: 10000000, rewardType: 'market', description: 'Medical item reward', days: 31, maxInc: 4 },
        TCC: { required: 7500000, rewardType: 'special', description: 'Random Clothing Cache', maxInc: 4 },

        GRN: { required: 500000, rewardType: 'cash', cashAmount: 4000000, days: 31, maxInc: 4, description: 'Cash dividend' },
        IOU: { required: 3000000, rewardType: 'cash', cashAmount: 12000000, days: 31, maxInc: 4, description: 'Cash dividend' },
        TMI: { required: 6000000, rewardType: 'cash', cashAmount: 25000000, days: 31, maxInc: 4, description: 'Cash dividend' },
        TCT: { required: 100000, rewardType: 'cash', cashAmount: 1000000, days: 31, maxInc: 4, description: 'Cash dividend' },
        TSB: { required: 3000000, rewardType: 'cash', cashAmount: 50000000, days: 31, maxInc: 4, description: 'Cash dividend' },
        CNC: { required: 7500000, rewardType: 'cash', cashAmount: 80000000, days: 31, maxInc: 4, description: 'Cash dividend' },

        IIL: { required: 1000000, rewardType: 'benefit', maxInc: 1, description: '50% Coding Time Reduction' },
        ELT: { name: 'Empty Lunchbox Traders', required: 5000000, rewardType: 'benefit', maxInc: 4, description: '10% Home Upgrade Discount' },
        EVL: { name: 'Evil Ducks Candy Corp', required: 100000, rewardType: 'benefit', maxInc: 4, description: '1000 Happiness every 7 days' },
        CBD: { name: 'HappyHerbal Releaf Co.', required: 350000, rewardType: 'benefit', maxInc: 4, description: '50 Nerve' },
        IST: { name: 'International School TC', required: 100000, rewardType: 'benefit', maxInc: 4, description: 'Free Education Courses' },
        LOS: { name: 'Lo Squalo Waste Management', required: 7500000, rewardType: 'benefit', maxInc: 4, description: '25% Mission Reward Bonus' },
        MCS: { name: 'Mc Smoogle Corp', required: 350000, rewardType: 'benefit', maxInc: 4, description: '100 Energy every 7 days' },
        MSG: { name: 'Messaging Inc.', required: 300000, rewardType: 'benefit', maxInc: 4, description: 'Free Classified Advertising' },
        SYS: { name: 'Syscore MFG', required: 3000000, rewardType: 'benefit', maxInc: 4, description: 'Advanced Firewall' },
        TCP: { name: 'TC Media Productions', required: 1000000, rewardType: 'benefit', maxInc: 4, description: 'Company Sales Boost' },
        TGP: { name: 'Tell Group Plc.', required: 2500000, rewardType: 'benefit', maxInc: 4, description: 'Company Advertising Boost' },
        TCI: { name: 'Torn City Investments', required: 1500000, rewardType: 'benefit', maxInc: 4, description: '10% Bank Interest Bonus' },
        TCM: { name: 'Torn City Motors', required: 1000000, rewardType: 'benefit', maxInc: 4, description: '10% Racing Skill Boost' },
        WSU: { name: 'West Side University', required: 1000000, rewardType: 'benefit', maxInc: 4, description: '10% Education Course Time Reduction' },
        WLT: { name: 'Wind Lines Travel', required: 9000000, rewardType: 'benefit', maxInc: 4, description: 'Private Jet Access' },
        YAZ: { name: 'Yazoo', required: 1000000, rewardType: 'benefit', maxInc: 4, description: 'Free Banner Advertising' },
        BAG: { name: "Big Al's Gun Shop", required: 3000000, rewardType: 'special', maxInc: 4, description: 'Ammo Pack' }
    };

    function num(v) { const n = Number(String(v).replace(/[,$\s]/g, '')); return Number.isFinite(n) ? n : 0; }
    function money(n) { if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'; return '$' + Math.round(n).toLocaleString(); }
    function pct(n) { return (n * 100).toFixed(2) + '%'; }

    function formatAcronymList(acronyms) {
        const unique = [...new Set(acronyms)];

        if (unique.length === 0) return '';
        if (unique.length === 1) return unique[0];
        if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;

        return `${unique.slice(0, -1).join(', ')}, and ${unique.at(-1)}`;
    }
    // ============================================================================
    // Brain Knowledge API
    // ============================================================================

    function getStockMetadata(acronym) {
        return STOCKS[acronym] || {};
    }

    function isOptimizationEligible(acronym) {
        return ['market', 'cash'].includes(getStockMetadata(acronym).rewardType);
    }

    function getOptimizationExplanation(acronym) {
        const cfg = getStockMetadata(acronym);
        if (isOptimizationEligible(acronym)) return 'Reward has an objective annual value.';
        if (cfg.rewardType === 'benefit') return 'Gameplay benefit is intentionally not monetized.';
        if (cfg.rewardType === 'special') return 'Reward has no objective market value.';
        return 'No optimization explanation recorded.';
    }

    function isStrategicStock(acronym) {
        return getStockMetadata(acronym).rewardType === 'benefit';
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function sellPressureScore(block, bestRoi) {
        const roiGap = Math.max(0, bestRoi - block.roi);
        const roiPressure = clamp(roiGap / 0.15, 0, 1);
        const weakRoiPressure = clamp((0.15 - block.roi) / 0.15, 0, 1);
        return Math.round((roiPressure * 70) + (weakRoiPressure * 30));
    }

    function api(url, options = {}) {
        const timeoutMs = options.timeoutMs || API_TIMEOUTS.default;
        const label = options.label || 'Torn';

        return new Promise((resolve, reject) => {
            const requestedAt = performance.now();
            let slowTimer = null;

            if (typeof options.onSlow === 'function') {
                slowTimer = setTimeout(() => {
                    options.onSlow({
                        label,
                        elapsedMs: Math.round(performance.now() - requestedAt),
                        timeoutMs
                    });
                }, Math.min(SLOW_NOTICE_MS, Math.max(1000, timeoutMs - 1000)));
            }

            const finish = callback => value => {
                if (slowTimer) clearTimeout(slowTimer);
                callback(value);
            };

            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: timeoutMs,

                onload: finish(response => {
                    const status = Number(response.status || 0);
                    if (status < 200 || status >= 300) {
                        reject({
                            kind: 'http',
                            status,
                            message: `${label} returned HTTP ${status || 'unknown'}.`,
                            details: response.responseText
                        });
                        return;
                    }

                    try {
                        const json = JSON.parse(response.responseText);

                        if (json.error) {
                            reject({
                                kind: 'torn_api',
                                code: json.error.code,
                                message: json.error.error || json.error.message || 'Torn rejected the request.',
                                details: json.error
                            });
                            return;
                        }

                        resolve({
                            data: json,
                            diagnostic: {
                                label,
                                status,
                                elapsedMs: Math.round(performance.now() - requestedAt)
                            }
                        });
                    } catch (error) {
                        reject({
                            kind: 'invalid_response',
                            message: `${label} returned a response The Brain could not read.`,
                            details: error
                        });
                    }
                }),

                ontimeout: finish(() => reject({
                    kind: 'timeout',
                    label,
                    timeoutMs,
                    message: `${label} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
                })),

                onerror: finish(error => reject({
                    kind: 'network',
                    label,
                    message: `${label} could not be reached.`,
                    details: error
                }))
            });
        });
    }

    function normalizePointListings(response) {
        const listings = [];
        const visited = new Set();

        function readPositiveNumber(object, keys) {
            for (const key of keys) {
                const value = Number(object?.[key]);
                if (Number.isFinite(value) && value > 0) return value;
            }
            return null;
        }

        function walk(value) {
            if (!value || typeof value !== 'object' || visited.has(value)) return;
            visited.add(value);

            if (!Array.isArray(value)) {
                const amount = readPositiveNumber(value, [
                    'amount', 'quantity', 'points', 'qty', 'available'
                ]);
                // Torn's pointsmarket selection currently uses `cost` for the
                // per-point price and `quantity` for the number of points. Do not
                // interpret `cost` as a listing total: doing so divides the real
                // per-point price by quantity and rejects every otherwise valid row.
                let price = readPositiveNumber(value, [
                    'price', 'cost', 'cost_each', 'costEach', 'unit_price', 'unitPrice'
                ]);
                const total = readPositiveNumber(value, [
                    'total', 'total_price', 'totalPrice', 'listing_total', 'listingTotal'
                ]);

                if (!price && amount && total) price = total / amount;

                // Point prices are currently around tens of thousands. These broad
                // bounds reject IDs, timestamps, totals, and malformed fields without
                // hard-coding today's exact market price.
                if (amount && price && price >= 1000 && price <= 1000000) {
                    listings.push({ amount, price });
                }
            }

            Object.values(value).forEach(walk);
        }

        walk(response);

        // Recursive schemas can expose the same listing through nested aliases.
        // Deduplicate exact amount/price pairs while preserving genuinely repeated
        // listings from different sellers by retaining at most the observed count.
        const counts = new Map();
        return listings.filter(listing => {
            const key = `${listing.amount}:${listing.price}`;
            const seen = counts.get(key) || 0;
            counts.set(key, seen + 1);
            return seen < 100;
        });
    }

    function calculateObservedPointPrice(listings) {
        const valid = (listings || []).filter(listing =>
            Number.isFinite(listing.amount) && listing.amount > 0 &&
            Number.isFinite(listing.price) && listing.price > 0
        );

        if (!valid.length) return null;

        const sortedPrices = valid.map(listing => listing.price).sort((a, b) => a - b);
        const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

        // Guard against malformed API rows while retaining normal market depth.
        // A 20% band around the median is deliberately generous and is only a
        // validation fence, not a claim that The Brain sees the full order book.
        const accepted = valid.filter(listing =>
            listing.price >= medianPrice * 0.80 && listing.price <= medianPrice * 1.20
        );

        const totalPoints = accepted.reduce((sum, listing) => sum + listing.amount, 0);
        if (totalPoints <= 0) return null;

        const weightedTotal = accepted.reduce(
            (sum, listing) => sum + (listing.price * listing.amount),
            0
        );

        return {
            pricePerPoint: weightedTotal / totalPoints,
            listingCount: accepted.length,
            totalPoints,
            rejectedCount: valid.length - accepted.length,
            lowestPrice: Math.min(...accepted.map(listing => listing.price)),
            highestPrice: Math.max(...accepted.map(listing => listing.price))
        };
    }

    async function refreshLiveDividendValues(apiKey) {
        // A fresh analysis must be based on a fresh, internally consistent snapshot.
        Object.keys(LIVE_DIVIDEND_CACHE).forEach(key => delete LIVE_DIVIDEND_CACHE[key]);

        const report = {
            updated: [],
            unavailable: [],
            diagnostics: [],
            evidence: {},
            fetchedAt: Date.now()
        };

        const itemRewards = Object.entries(STOCKS)
            .filter(([, cfg]) => cfg.rewardType === 'market' && cfg.item);

        const unsourcedMarketRewards = Object.entries(STOCKS)
            .filter(([, cfg]) =>
                cfg.rewardType === 'market' &&
                !cfg.item &&
                cfg.marketSource !== 'points'
            );

        unsourcedMarketRewards.forEach(([acronym, cfg]) => {
            report.unavailable.push({
                acronym,
                reward: cfg.description || 'Market-valued reward',
                reason: 'No live valuation source is connected.'
            });
        });

        try {
            const result = await api(
                `https://api.torn.com/v2/torn/items?key=${encodeURIComponent(apiKey)}`,
                {
                    timeoutMs: API_TIMEOUTS.items,
                    label: 'Torn item market',
                    onSlow: () => setAnalysisProgress('Still waiting for Torn item-market evidence...')
                }
            );
            report.diagnostics.push(result.diagnostic);
            const response = result.data;

            const items = Array.isArray(response.items) ? response.items : [];
            const itemsByName = new Map(
                items.map(item => [
                    String(item.name || '').trim().toLowerCase(),
                    item
                ])
            );

            itemRewards.forEach(([acronym, cfg]) => {
                const item = itemsByName.get(cfg.item.toLowerCase());
                const marketPrice = Number(item?.value?.market_price);

                if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
                    report.unavailable.push({
                        acronym,
                        reward: cfg.item,
                        reason: 'Torn did not return a valid current market price.'
                    });
                    return;
                }

                LIVE_DIVIDEND_CACHE[acronym] = {
                    status: RewardValueStatus.KNOWN,
                    price: marketPrice,
                    itemId: item.id,
                    itemName: item.name,
                    updated: report.fetchedAt,
                    source: 'Torn items API'
                };

                report.updated.push(acronym);
            });
        } catch (error) {
            itemRewards.forEach(([acronym, cfg]) => {
                report.unavailable.push({
                    acronym,
                    reward: cfg.item,
                    reason: 'The live reward-price request failed.'
                });
            });
            report.itemError = error;
        }

        try {
            const result = await api(
                `https://api.torn.com/v2/market/?selections=pointsmarket&limit=100&key=${encodeURIComponent(apiKey)}`,
                {
                    timeoutMs: API_TIMEOUTS.points,
                    label: 'Torn points market',
                    onSlow: () => setAnalysisProgress('Still waiting for Torn points-market evidence...')
                }
            );
            report.diagnostics.push(result.diagnostic);

            const listings = normalizePointListings(result.data);
            const observed = calculateObservedPointPrice(listings);
            const cfg = STOCKS.PTS;

            if (!observed || !Number.isFinite(observed.pricePerPoint) || observed.pricePerPoint <= 0) {
                report.unavailable.push({
                    acronym: 'PTS',
                    reward: cfg.description,
                    reason: 'Torn returned no usable point listings after schema validation.'
                });
            } else {
                const rewardValue = observed.pricePerPoint * cfg.rewardAmount;

                LIVE_DIVIDEND_CACHE.PTS = {
                    status: RewardValueStatus.KNOWN,
                    price: rewardValue,
                    pricePerPoint: observed.pricePerPoint,
                    rewardAmount: cfg.rewardAmount,
                    listingCount: observed.listingCount,
                    totalPoints: observed.totalPoints,
                    rejectedCount: observed.rejectedCount,
                    lowestPrice: observed.lowestPrice,
                    highestPrice: observed.highestPrice,
                    updated: report.fetchedAt,
                    source: 'Torn Points Market — quantity-weighted average of returned listings'
                };

                report.evidence.PTS = LIVE_DIVIDEND_CACHE.PTS;
                report.updated.push('PTS');
            }
        } catch (error) {
            report.unavailable.push({
                acronym: 'PTS',
                reward: STOCKS.PTS.description,
                reason: 'The live points-market request failed.'
            });
            report.pointsError = error;
        }

        console.log(
            `[Brain v4.6] Live reward values: ${report.updated.length} known, ` +
            `${report.unavailable.length} unavailable.`,
            report
        );

        return report;
    }

    function rewardValueState(acronym, cfg) {
        switch (cfg.rewardType) {
            case 'cash':
                return {
                    status: RewardValueStatus.KNOWN,
                    value: cfg.cashAmount,
                    source: 'Fixed Torn cash dividend'
                };

            case 'market': {
                const live = LIVE_DIVIDEND_CACHE[acronym];
                if (live?.status === RewardValueStatus.KNOWN &&
                    Number.isFinite(live.price) && live.price > 0) {
                    return {
                        status: RewardValueStatus.KNOWN,
                        value: live.price,
                        source: live.source,
                        updated: live.updated
                    };
                }

                return {
                    status: RewardValueStatus.UNAVAILABLE,
                    value: null,
                    source: null
                };
            }

            case 'benefit':
            case 'special':
            default:
                return {
                    status: RewardValueStatus.NOT_APPLICABLE,
                    value: null,
                    source: null
                };
        }
    }


    function annualValue(cfg, acronym) {
        const reward = rewardValueState(acronym, cfg);

        if (reward.status !== RewardValueStatus.KNOWN) {
            return null;
        }

        return reward.value * (365 / cfg.days);
    }
    function targetForIncrement(required, inc) { return required * (Math.pow(2, inc) - 1); }
    function blockSize(required, inc) { return required * Math.pow(2, inc - 1); }

    function completedTarget(required, maxInc, ownedShares) {
        let target = 0;
        for (let inc = 1; inc <= maxInc; inc++) {
            const t = targetForIncrement(required, inc);
            if (ownedShares >= t) target = t; else break;
        }
        return target;
    }

    function normalizeMarketStocks(marketStocks) {
        const byAcronym = {};
        const idToAcronym = {};

        Object.entries(marketStocks || {}).forEach(([id, s]) => {
            const acronym = s.acronym || s.ticker || s.symbol || s.stock;
            const price = num(s.current_price || s.price || s.value);
            if (!acronym || !price) return;

            byAcronym[acronym] = { acronym, id: String(id), name: s.name || acronym, price };
            idToAcronym[String(id)] = acronym;
            if (s.id) idToAcronym[String(s.id)] = acronym;
            if (s.stock_id) idToAcronym[String(s.stock_id)] = acronym;
        });

        return { byAcronym, idToAcronym };
    }

    function normalizeOwnedShares(userStocks, idToAcronym) {
        const owned = {};

        Object.entries(userStocks || {}).forEach(([id, s]) => {
            const acronym = s.acronym || s.ticker || s.symbol || s.stock || idToAcronym[String(id)] || idToAcronym[String(s.stock_id)];
            if (!acronym) return;

            let shares = 0;

            function walk(x) {
                if (!x || typeof x !== 'object') return;
                Object.entries(x).forEach(([k, v]) => {
                    const key = k.toLowerCase();
                    if (typeof v === 'number' && ['shares', 'total_shares', 'quantity', 'amount'].includes(key)) {
                        shares = Math.max(shares, v);
                    }
                    if (typeof v === 'object') walk(v);
                });
            }

            walk(s);
            if (shares > 0) owned[acronym] = Math.max(owned[acronym] || 0, shares);
        });

        return owned;
    }

    function getNextOpportunity(acronym, cfg, market, ownedShares) {

        if (!isOptimizationEligible(acronym))
            return null;

        for (let inc = 1; inc <= cfg.maxInc; inc++) {

            const target = targetForIncrement(cfg.required, inc);
            if (ownedShares < target) {
                const need = target - ownedShares;
                const cost = need * market.price;
                const yearly = annualValue(cfg, acronym);
                if (!Number.isFinite(yearly) || yearly <= 0) return null;

                return {
                    acronym, name: market.name, increment: inc, target, need, cost, yearly,
                    roi: yearly / cost, payback: cost / yearly, benefit: cfg.item || cfg.description
                };
            }
        }
        return null;
    }

    function getCompletedBlocks(acronym, cfg, market, ownedShares) {
        if (!isOptimizationEligible(acronym)) return [];

        const blocks = [];
        const yearly = annualValue(cfg, acronym);
        if (!Number.isFinite(yearly) || yearly <= 0) return [];

        for (let inc = 1; inc <= cfg.maxInc; inc++) {
            const target = targetForIncrement(cfg.required, inc);
            if (ownedShares < target) break;

            const shares = blockSize(cfg.required, inc);
            const value = shares * market.price;

            blocks.push({
                acronym, name: market.name, increment: inc, shares, value, yearly,
                roi: yearly / value, benefit: cfg.item || cfg.description
            });
        }

        return blocks;
    }

    function getParkingSymbols() {
        try { return JSON.parse(localStorage.getItem(PARKING_STORAGE) || '[]'); }
        catch (e) { return []; }
    }


    function saveParkingSymbols() {
        const checked = [...document.querySelectorAll('.wes-parking-check:checked')].map(x => x.value);
        localStorage.setItem(PARKING_STORAGE, JSON.stringify(checked));
        return checked;
    }


    // ============================================================================
    // Strategic Sale Limits - Checkpoints 1 and 2
    // ----------------------------------------------------------------------------
    // Stores how many completed blocks of each Strategic stock the player is
    // willing to let The Brain consider selling.
    //
    // Checkpoint 1 stores the player's limits. Checkpoint 2 converts only the
    // newest allowed Strategic blocks into candidates for the rebalance engine.
    // ============================================================================

    function getStrategicSaleLimits() {
        try {
            const saved = JSON.parse(
                localStorage.getItem(STRATEGIC_SALE_STORAGE) || '{}'
            );

            return saved && typeof saved === 'object'
                ? saved
                : {};
        } catch (e) {
            return {};
        }
    }

    function saveStrategicSaleLimits() {
        const limits = {};

        document
            .querySelectorAll('.wes-strategic-sale-limit')
            .forEach(select => {
                limits[select.dataset.acronym] = clamp(
                    Math.floor(num(select.value)),
                    0,
                    4
                );
            });

        localStorage.setItem(
            STRATEGIC_SALE_STORAGE,
            JSON.stringify(limits)
        );

        return limits;
    }

    function buildStrategicSaleControls() {
        const savedLimits = getStrategicSaleLimits();

        return Object.keys(STOCKS)
            .filter(isStrategicStock)
            .sort()
            .map(acronym => {
                const selectedLimit = clamp(
                    Math.floor(num(savedLimits[acronym])),
                    0,
                    4
                );

                const options = Array.from(
                    { length: 5 },
                    (_, blockCount) => `
                        <option value="${blockCount}"
                            ${blockCount === selectedLimit ? 'selected' : ''}>
                            ${blockCount}
                        </option>
                    `
                ).join('');

                return `
                    <label style="
                        display:inline-flex;
                        align-items:center;
                        gap:5px;
                        padding:4px 6px;
                        white-space:nowrap;
                    ">
                        <b>${acronym}</b>

                        <select
                            class="wes-strategic-sale-limit"
                            data-acronym="${acronym}"
                            aria-label="${acronym} eligible blocks"
                            style="
                                width:48px;
                                padding:2px;
                            ">
                            ${options}
                        </select>
                    </label>
                `;
            })
            .join('');
    }

    // Builds only the Strategic completed blocks the player has explicitly
    // allowed The Brain to consider selling. Older blocks remain protected.
    function getEligibleStrategicSaleBlocks(owned, byAcronym, saleLimits) {
        const eligibleBlocks = [];
        const maxIncrements = 4;

        Object.keys(STOCKS)
            .filter(isStrategicStock)
            .forEach(acronym => {
                const metadata = getStockMetadata(acronym);
                const market = byAcronym[acronym];
                const required = num(metadata.required);
                const ownedShares = owned[acronym] || 0;
                const allowedCount = clamp(
                    Math.floor(num(saleLimits[acronym])),
                    0,
                    maxIncrements
                );

                if (!market || required <= 0 || ownedShares <= 0 || allowedCount <= 0) {
                    return;
                }

                const completed = [];

                for (let increment = 1; increment <= maxIncrements; increment++) {
                    const target = targetForIncrement(required, increment);
                    if (ownedShares < target) break;

                    const shares = blockSize(required, increment);

                    completed.push({
                        acronym,
                        name: market.name || metadata.name || acronym,
                        increment,
                        shares,
                        value: shares * market.price,
                        yearly: 0,
                        roi: 0,
                        benefit: metadata.description || 'Gameplay benefit'
                    });
                }

                // A limit of 1 exposes only the newest completed block, a limit of
                // 2 exposes the two newest, and so on. Earlier blocks stay protected.
                eligibleBlocks.push(...completed.slice(-allowedCount));
            });

        return eligibleBlocks;
    }


    function calculateParkingCapital(parkingSymbols, owned, byAcronym) {
        let total = 0;
        const rows = [];

        parkingSymbols.forEach(acronym => {
            const cfg = STOCKS[acronym];
            const market = byAcronym[acronym];
            if (!cfg || !market) return;

            const have = owned[acronym] || 0;
            if (have <= 0) return;

            const protectedCompleted = completedTarget(cfg.required, cfg.maxInc, have);
            const parkedShares = Math.max(0, have - protectedCompleted);
            if (parkedShares <= 0) return;

            const value = parkedShares * market.price;
            total += value;
            rows.push({ acronym, shares: parkedShares, value });
        });

        return { total, rows };
    }

    function buildShoppingList(owned, byAcronym, startingCapital, parkingSymbols, excludeSymbols) {
        function applyPurchase(portfolio, opportunity) {

            portfolio.holdings[opportunity.acronym] =
                opportunity.target;

            portfolio.purchases.push(opportunity);

            portfolio.totalSpent += opportunity.cost;

            portfolio.yearlyIncome += opportunity.yearly;

            portfolio.cashRemaining -= opportunity.cost;
        }

        // ============================================================================
        // Portfolio Constructor
        // ----------------------------------------------------------------------------
        // Brain constructs the mathematically optimal portfolio from a single pool of
        // Deployable Capital.
        //
        // Process:
        //
        // 1. Sell every optimization-eligible holding (simulation only).
        // 2. Add the proceeds to Deployable Capital.
        // 3. Survey the market.
        // 4. Purchase the highest-ROI completed block.
        // 5. Reduce remaining Deployable Capital.
        // 6. Repeat until no further purchases are possible.
        //
        // This engine does not compare against the user's current portfolio.
        // Its only responsibility is constructing the ideal portfolio.
        //
        // Portfolio comparison and rebalance recommendations are handled separately.
        // ============================================================================
        function simulateLiquidation(
            deployableCapital,
            owned,
            byAcronym
        ) {

            const liquidation = {
                totalCapital: deployableCapital,
                liquidationValue: 0,
                liquidatedHoldings: []
            };

            Object.entries(owned).forEach(([acronym, shares]) => {
                if (!isOptimizationEligible(acronym)) {
                    return;
                }

                const stock = byAcronym[acronym];

                if (!stock) {
                    return;
                }

                const holdingValue = shares * stock.price;

                liquidation.liquidationValue += holdingValue;

                liquidation.totalCapital += holdingValue;

                liquidation.liquidatedHoldings.push({
                    acronym,
                    shares,
                    value: holdingValue
                });

            });

            return liquidation;
        }

        function collectOpportunities(portfolio, byAcronym) {

            const opportunities = [];

            Object.entries(STOCKS).forEach(([acronym, cfg]) => {

                const ownedShares = portfolio.holdings[acronym] || 0;

                const opportunity = getNextOpportunity(
                    acronym,
                    cfg,
                    byAcronym,
                    ownedShares
                );

                if (opportunity) {
                    opportunities.push(opportunity);
                }
            });

            opportunities.sort((a, b) => {

                if (b.roi !== a.roi)
                    return b.roi - a.roi;

                return a.cost - b.cost;
            });

            return opportunities;
        }
        function buildIdealPortfolio(startingCapital, owned, byAcronym) {

            const portfolio = {
                cashRemaining: startingCapital,
                holdings: { ...owned },
                purchases: [],
                yearlyIncome: 0,
                totalSpent: 0
            };

            const liquidation = simulateLiquidation(
                startingCapital,
                portfolio.holdings,
                byAcronym
            );

            let availableCapital = liquidation.totalCapital;

            portfolio.cashRemaining = liquidation.totalCapital;

            let opportunities = collectOpportunities(portfolio, byAcronym);

            while (true) {

                const bestOpportunity = opportunities[0];

                if (!bestOpportunity)
                    break;

                applyPurchase(portfolio, bestOpportunity);

                // availableCapital = portfolio.cashRemaining;

                opportunities = collectOpportunities(portfolio, byAcronym);

                if (portfolio.purchases.length >= 5) {
                    break;
                }

            }
            // portfolio.cashRemaining = availableCapital;

            console.log("Constructor purchases:", portfolio.purchases.length, portfolio);

            return portfolio;
        }
        let capital = startingCapital;
        let simulatedOwned = Object.assign({}, owned);
        const parkingSet = new Set(parkingSymbols || []);
        const excludeSet = new Set(excludeSymbols || []);
        const buys = [];
        let totalCost = 0;
        let totalYearly = 0;

        for (let step = 1; step <= 10; step++) {
            const candidates = [];

            Object.entries(STOCKS).forEach(([acronym, cfg]) => {


                if (excludeSet.has(acronym)) return;

                const market = byAcronym[acronym];
                if (!market) return;

                const have = simulatedOwned[acronym] || 0;
                const next = getNextOpportunity(acronym, cfg, market, have);
                if (!next) return;

                if (next.cost <= capital) candidates.push(next);
            });

            if (!candidates.length) break;

            candidates.sort((a, b) => {
                if (b.roi !== a.roi) return b.roi - a.roi;
                return a.cost - b.cost;
            });

            const pick = candidates[0];

            buys.push({
                step,
                acronym: pick.acronym,
                name: pick.name,
                increment: pick.increment,
                need: pick.need,
                cost: pick.cost,
                yearly: pick.yearly,
                roi: pick.roi,
                payback: pick.payback,
                capitalAfter: capital - pick.cost
            });

            capital -= pick.cost;
            totalCost += pick.cost;
            totalYearly += pick.yearly;
            simulatedOwned[pick.acronym] = pick.target;
        }

        return {
            buys,
            startingCapital,
            remainingCapital: capital,
            totalCost,
            totalYearly,
            utilization: startingCapital > 0 ? totalCost / startingCapital : 0
        };
    }

    /*
  ==========================================================
  What If? - Design Philosophy
  ==========================================================

  Purpose

  Allow the user to safely explore alternative portfolio
  decisions before committing real capital.

  Question Answered

  "What happens if I choose to sell these completed blocks?"

  Design Principles

  • Simulation is exploration, not recommendation.
  • The advisor recommends.
  • The user explores.
  • Human judgment remains part of the process.
  • The simulator never changes the user's real portfolio.
  • No real portfolio data is modified.
  • Every scenario is temporary.
  • Reuse advisor logic whenever possible.
  • The simulator changes the inputs, never the algorithms.
  • Every scenario should be explainable.
  */

    function createScenarioPortfolio(
        owned,
        completedBlocks,
        deployableCapital,
        scenarioActions
    ) {

        const simulatedOwned = { ...owned };
        const simulatedCompletedBlocks = [...completedBlocks];
        const sellActions = scenarioActions.filter(
            action => action.type === 'sell'
        );
        let simulatedDeployableCapital = deployableCapital;

        sellActions.forEach(action => {
            const targetBlock = simulatedCompletedBlocks.find(
                b =>
                    b.acronym === action.acronym &&
                    b.increment === action.increment
            );

            if (!targetBlock) return;

            simulatedDeployableCapital += action.capitalFreed || 0;

            targetBlock.shares -= action.shares || 0;

            if (simulatedOwned[action.acronym] != null) {
                simulatedOwned[action.acronym] = Math.max(
                    0,
                    simulatedOwned[action.acronym] - (action.shares || 0)
                );
            }

            if (targetBlock.shares <= 0) {
                const removeIndex = simulatedCompletedBlocks.indexOf(targetBlock);
                if (removeIndex !== -1) {
                    simulatedCompletedBlocks.splice(removeIndex, 1);
                }
            }
        });

        return {
            owned: simulatedOwned,
            completedBlocks: simulatedCompletedBlocks,
            deployableCapital: simulatedDeployableCapital,
            sellActions
        };

    }

    function getScenarioCapitalFreed(scenario) {
        const sellActions = scenario?.sellActions || [];

        return sellActions.reduce((total, action) => {
            return total + (action.capitalFreed || 0);
        }, 0);
    }

    function getScenarioSellCount(scenario) {
        return (scenario?.sellActions || []).length;
    }

    function isScenarioCleaner(candidate, currentBest) {
        if (!currentBest) return true;

        const candidateCapital = getScenarioCapitalFreed(candidate);
        const currentCapital = getScenarioCapitalFreed(currentBest);

        if (candidateCapital > currentCapital) return true;
        if (candidateCapital < currentCapital) return false;

        return getScenarioSellCount(candidate) < getScenarioSellCount(currentBest);
    }

    const IDEA_SCORE_PRESSURE_WEIGHT = 250000;
    const IDEA_SCORE_COMPLETED_BLOCK_WEIGHT = 100;
    const IDEA_SCORE_SELL_COUNT_PENALTY = 1000;
    const IDEA_SCORE_WEIGHTS = {
        pressure: IDEA_SCORE_PRESSURE_WEIGHT,
        completedBlock: IDEA_SCORE_COMPLETED_BLOCK_WEIGHT,
        sellCountPenalty: IDEA_SCORE_SELL_COUNT_PENALTY
    };

    function calculateIdeaScore(extraVsCurrentPlan, pressure, completedBlocksRemaining, sellCount) {

        const annualGainScore = extraVsCurrentPlan;

        const pressureScore =
            pressure * IDEA_SCORE_PRESSURE_WEIGHT;

        const completedBlockScore =
            completedBlocksRemaining *
            IDEA_SCORE_COMPLETED_BLOCK_WEIGHT;

        const sellPenalty =
            sellCount *
            IDEA_SCORE_SELL_COUNT_PENALTY;

        const totalScore =
            annualGainScore +
            pressureScore +
            completedBlockScore -
            sellPenalty;

        return totalScore;
    }

    function buildRebalanceIdeas(completedBlocks, owned, byAcronym, deployableCapital, parkingSymbols, baselineShopping, bestAvailableRoi) {
        const ideas = [];
        const nearMisses = [];


        completedBlocks.forEach(sell => {

            const simulatedOwned = Object.assign({}, owned);
            simulatedOwned[sell.acronym] = Math.max(0, (simulatedOwned[sell.acronym] || 0) - sell.shares);

            const shopping = buildShoppingList(
                simulatedOwned,
                byAcronym,
                deployableCapital + sell.value,
                parkingSymbols,
                [sell.acronym]
            );

            if (!shopping.buys.length) return;

            const netAnnualAfterSale = shopping.totalYearly - sell.yearly;
            const roiGap = Math.max(0, bestAvailableRoi - sell.roi);
            const extraVsCurrentPlan = netAnnualAfterSale - (baselineShopping ? baselineShopping.totalYearly : 0);
            const pressure = sellPressureScore(sell, bestAvailableRoi);
            if (extraVsCurrentPlan < MIN_EXTRA_ANNUAL_GAIN) {
                nearMisses.push({
                    sell,
                    shopping,
                    buy: shopping.buys[0] || null,
                    netAnnualAfterSale,
                    roiGap,
                    pressure,
                    extraVsCurrentPlan,
                    shortfall: MIN_EXTRA_ANNUAL_GAIN - extraVsCurrentPlan,
                    capitalAfter: shopping.remainingCapital,
                    score: extraVsCurrentPlan + (pressure * 250000)
                });
                return;
            }
            const scenario = createScenarioPortfolio(
                owned,
                completedBlocks,
                deployableCapital,
                [{
                    type: 'sell',
                    acronym: sell.acronym,
                    increment: sell.increment,
                    shares: sell.shares,
                    capitalFreed: sell.value
                }]
            );
            const capitalFreed = getScenarioCapitalFreed(scenario);
            const sellCount = getScenarioSellCount(scenario);
            const scenarioDeployableCapital = scenario.deployableCapital;
            const completedBlocksRemaining = scenario.completedBlocks.length;
            ideas.push({
                sell,
                shopping,
                netAnnualAfterSale,
                roiGap,
                pressure,
                extraVsCurrentPlan,
                capitalAfter: shopping.remainingCapital,
                scenario,
                capitalFreed,
                sellCount,
                deployableCapital: scenarioDeployableCapital,
                completedBlocksRemaining,
                score: calculateIdeaScore(extraVsCurrentPlan, pressure, completedBlocksRemaining, sellCount)
            })
        });

        nearMisses.sort((a, b) => a.shortfall - b.shortfall);

        ideas.sort((a, b) => {

            if (b.score !== a.score) {
                return b.score - a.score;
            }

            if (b.completedBlocksRemaining !== a.completedBlocksRemaining) {
                return b.completedBlocksRemaining - a.completedBlocksRemaining;
            }

            if (a.sellCount !== b.sellCount) {
                return a.sellCount - b.sellCount;
            }

            if (b.deployableCapital !== a.deployableCapital) {
                return b.deployableCapital - a.deployableCapital;
            }

            return b.capitalFreed - a.capitalFreed;
        });

        const runnerUp = ideas.length > 1 ? ideas[1] : null;

        if (ideas.length > 0) {
            ideas[0].runnerUp = runnerUp;
        }
        ideas.nearMisses = nearMisses;
        return ideas;
    }

    function card(title, body, accent) {
        return `
      <div style="margin:8px 0;padding:10px;border-radius:10px;border:1px solid ${accent || '#555'};background:#171717;">
        <div style="font-weight:bold;font-size:14px;margin-bottom:6px;">${title}</div>
        ${body}
      </div>
    `;
    }

    function buildReasoningLines(idea) {
        const reasons = [];
        const runnerUp = idea.runnerUp || null;
        const hasRunnerUp = !!runnerUp;

        reasons.push({
            type: "info",
            text: `Annual gain: ${money(idea.netAnnualAfterSale)}`
        });
        if (
            hasRunnerUp &&
            idea.netAnnualAfterSale > runnerUp.netAnnualAfterSale
        ) {
            const annualDifference =
                idea.netAnnualAfterSale -
                runnerUp.netAnnualAfterSale;

            if (annualDifference >= 1000000) {
                reasons.push({
                    type: "positive",
                    text:
                        `Earns ${money(annualDifference)} more annually than the runner-up`
                });
            }
        }

        if (idea.sellCount === 1) {
            reasons.push({
                type: "positive",
                text: "Only one completed block sold"
            });
        } else if (idea.sellCount > 1) {
            reasons.push({
                type: "info",
                text: `${idea.sellCount} completed blocks sold`
            });
        }

        reasons.push({
            type: "info",
            text: `${idea.completedBlocksRemaining} completed blocks remain`
        });

        return reasons;
    }
    function out(html) {
        const el = document.getElementById('wes-stock-output');
        if (el) el.innerHTML = html;
    }


    function setBrainHeader(title, color) {
        const headerContent = document.getElementById('brain-header-content');
        if (!headerContent) return;

        headerContent.innerHTML = `
<div style="font-size:22px;font-weight:bold;color:${color};line-height:1.1;">
    ${'\u{1F9E0}'} ${title}
</div>`;
    }

    const THINKING_STAGES = [
        'Connecting to Torn',
        'Retrieving live reward prices',
        'Reading stock market',
        'Reading your portfolio',
        'Validating evidence',
        'Evaluating opportunities',
        'Comparing alternatives',
        'Preparing recommendation'
    ];
    let activeThinkingStage = -1;
    let thinkingStageStartedAt = 0;

    function setAnalysisProgress(message, stageIndex = activeThinkingStage) {
        if (Number.isInteger(stageIndex) && stageIndex >= 0) {
            activeThinkingStage = stageIndex;
            thinkingStageStartedAt = performance.now();
        }

        setBrainHeader('Thinking...', '#6fd3ff');
        const rows = THINKING_STAGES.map((stage, index) => {
            const symbol = index < activeThinkingStage ? '✓' : index === activeThinkingStage ? '⟳' : '○';
            const tone = index < activeThinkingStage ? '#9cbe64' : index === activeThinkingStage ? '#6fd3ff' : '#777';
            return `<div style="color:${tone};margin:3px 0;">${symbol} ${stage}</div>`;
        }).join('');

        out(`
            <div style="font-size:15px;color:#d8d8d8;line-height:1.5;">
                ${message}
            </div>
            <div style="margin-top:9px;line-height:1.45;">${rows}</div>
            <div style="margin-top:8px;color:#888;">
                The Brain is gathering evidence before it speaks.
            </div>
        `);
    }

    function setAnalyzeButton(state) {
        const button = document.getElementById('wes-stock-run');
        if (!button) return;

        const labels = {
            idle: 'Analyze',
            thinking: 'Thinking...',
            success: 'Analyze Again',
            retry: 'Retry'
        };

        button.textContent = labels[state] || labels.idle;
        button.disabled = state === 'thinking';
        button.setAttribute('aria-busy', state === 'thinking' ? 'true' : 'false');
        button.style.opacity = state === 'thinking' ? '0.65' : '1';
        button.style.cursor = state === 'thinking' ? 'wait' : 'pointer';
    }

    function retryButtonHtml(label = 'Retry analysis') {
        return `
            <button id="wes-stock-retry" style="margin-top:12px;">
                ${label}
            </button>
        `;
    }

    function wireRetryButton() {
        const retry = document.getElementById('wes-stock-retry');
        if (retry) retry.onclick = run;
    }

    function describeAnalysisError(error) {
        switch (error?.kind) {
            case 'timeout':
                return error.message || 'Live evidence timed out before it could be verified.';
            case 'http':
                return error.message || `Torn returned HTTP ${error.status || 'unknown'}.`;
            case 'network':
                return 'The network request failed before Torn returned usable evidence.';
            case 'torn_api':
                return error.message || 'Torn rejected the request.';
            case 'invalid_response':
                return 'Torn returned data The Brain could not safely interpret.';
            default:
                return error?.message || error?.error || 'An unexpected analysis error occurred.';
        }
    }

    function renderUnavailableData(unavailable) {
        const unique = [...new Map(
            unavailable.map(entry => [entry.acronym, entry])
        ).values()].sort((a, b) => a.acronym.localeCompare(b.acronym));

        const rows = unique.map(entry => `
            <div style="margin-top:7px;">
                <b>${entry.acronym}</b> — ${entry.reward}<br>
                <small style="color:#aaa;">${entry.reason}</small>
            </div>
        `).join('');

        setBrainHeader('Accurate recommendation unavailable', '#ff7777');
        out(`
            <div style="font-size:15px;color:#d8d8d8;line-height:1.5;margin:6px 0 10px 0;">
                The Brain cannot truthfully determine the best action because current
                values are unavailable for one or more market-valued rewards.
            </div>
            <details open>
                <summary>Unavailable evidence</summary>
                <div style="margin-top:6px;">
                    ${rows}
                </div>
            </details>
            <div style="margin-top:10px;color:#ffb3b3;">
                No fallback prices were used. No buy, save, hold, or rebalance
                recommendation was produced.
            </div>
            ${retryButtonHtml('Retry live prices')}
        `);
        wireRetryButton();
    }

    async function run() {
        if (analysisInProgress) return;

        analysisInProgress = true;
        const startedAt = performance.now();
        let finalButtonState = 'retry';
        setAnalyzeButton('thinking');

        const manualKey =
            document.getElementById('wes-stock-key')?.value.trim() || '';

        const tornPdaKey =
            !/^###.*###$/.test(PDA_API_KEY)
                ? PDA_API_KEY.trim()
                : '';

        const key = tornPdaKey || manualKey;
        const liquidCash = num(document.getElementById('wes-stock-cash').value);

        if (!key) {
            out(`Paste your Torn API key first.${retryButtonHtml('Try again')}`);
            wireRetryButton();
            analysisInProgress = false;
            setAnalyzeButton('retry');
            return;
        }

        if (!tornPdaKey && manualKey) {
            localStorage.setItem(KEY_STORAGE, manualKey);
        }
        localStorage.setItem(CASH_STORAGE, String(liquidCash));
        const parkingSymbols = saveParkingSymbols();
        const strategicSaleLimits = saveStrategicSaleLimits();

        activeThinkingStage = -1;
        setAnalysisProgress('Connecting to Torn...', 0);
        const settingsPanel =
            document.getElementById('brain-settings-panel');

        if (settingsPanel) {
            settingsPanel.style.display = 'none';
        }
        try {
            setAnalysisProgress('Retrieving live reward prices...', 1);
            const rewardValueReport = await refreshLiveDividendValues(key);

            setAnalysisProgress('Reading the stock market...', 2);
            const marketResult = await api(
                `https://api.torn.com/torn/?selections=stocks&key=${encodeURIComponent(key)}`,
                {
                    timeoutMs: API_TIMEOUTS.stocks,
                    label: 'Torn stock market',
                    onSlow: () => setAnalysisProgress('Still waiting for Torn stock-market evidence...')
                }
            );

            setAnalysisProgress('Reading your portfolio...', 3);
            const portfolioResult = await api(
                `https://api.torn.com/user/?selections=stocks&key=${encodeURIComponent(key)}`,
                {
                    timeoutMs: API_TIMEOUTS.portfolio,
                    label: 'Torn portfolio',
                    onSlow: () => setAnalysisProgress('Still waiting for Torn portfolio evidence...')
                }
            );

            const marketRaw = marketResult.data;
            const userRaw = portfolioResult.data;
            const apiDiagnostics = [
                ...(rewardValueReport.diagnostics || []),
                marketResult.diagnostic,
                portfolioResult.diagnostic
            ];

            setAnalysisProgress('Validating the evidence...', 4);
            const { byAcronym, idToAcronym } = normalizeMarketStocks(marketRaw.stocks || {});
            const owned = normalizeOwnedShares(userRaw.stocks || {}, idToAcronym);

            const parking = calculateParkingCapital(Object.keys(STOCKS), owned, byAcronym);
            const preliminaryCapital = liquidCash + parking.total;

            // An unavailable valuation is material only when it could affect today's action:
            // the player owns a completed block, or the next block is currently affordable.
            const materialUnavailableValues = rewardValueReport.unavailable.filter(entry => {
                const cfg = STOCKS[entry.acronym];
                const market = byAcronym[entry.acronym];
                if (!cfg || !market) return false;

                const have = owned[entry.acronym] || 0;
                const ownsCompletedBlock = completedTarget(cfg.required, cfg.maxInc, have) > 0;
                const nextTarget = Array.from({ length: cfg.maxInc }, (_, i) => targetForIncrement(cfg.required, i + 1))
                    .find(target => have < target);
                const nextCost = nextTarget ? (nextTarget - have) * market.price : Infinity;

                return ownsCompletedBlock || nextCost <= preliminaryCapital;
            });

            const nonMaterialUnavailableValues = rewardValueReport.unavailable
                .filter(entry => !materialUnavailableValues.some(material => material.acronym === entry.acronym));

            if (materialUnavailableValues.length) {
                renderUnavailableData(materialUnavailableValues);
                finalButtonState = 'retry';
                return;
            }

            setAnalysisProgress('Evaluating opportunities...', 5);
            const deployableCapital = liquidCash + parking.total;
            const parkingSet = new Set(parkingSymbols);

            const opportunities = [];
            const completedBlocks = [];

            Object.entries(STOCKS).forEach(([acronym, cfg]) => {
                const market = byAcronym[acronym];
                if (!market) return;

                const have = owned[acronym] || 0;
                const next = getNextOpportunity(acronym, cfg, market, have);

                if (next && !parkingSet.has(acronym)) opportunities.push(next);
                completedBlocks.push(...getCompletedBlocks(acronym, cfg, market, have));
            });

            opportunities.sort((a, b) => b.roi - a.roi);
            completedBlocks.sort((a, b) => a.roi - b.roi);

            const eligibleStrategicBlocks = getEligibleStrategicSaleBlocks(
                owned,
                byAcronym,
                strategicSaleLimits
            );

            const rebalanceCandidates = [
                ...completedBlocks,
                ...eligibleStrategicBlocks
            ].sort((a, b) => a.roi - b.roi);

            const shopping = buildShoppingList(owned, byAcronym, deployableCapital, parkingSymbols, []);
            const bestAvailableRoi = shopping.buys.length ? shopping.buys[0].roi : 0;
            setAnalysisProgress('Comparing alternatives...', 6);
            const rebalanceIdeas = buildRebalanceIdeas(rebalanceCandidates, owned, byAcronym, deployableCapital, parkingSymbols, shopping, bestAvailableRoi);
            const closestMiss = rebalanceIdeas.nearMisses && rebalanceIdeas.nearMisses[0];
            const bestRejectedMiss = closestMiss;

            const bestOverall = opportunities[0];
            const affordable = opportunities.filter(o => o.cost <= deployableCapital).sort((a, b) => b.roi - a.roi)[0];
            const cheapest = [...opportunities].sort((a, b) => a.cost - b.cost)[0];

            let recommendationState = BrainState.KEEP_SAVING;
            let headerAction = 'HOLD';
            let headerTarget = '';

            if (rebalanceIdeas.length && rebalanceIdeas[0].shopping.buys.length) {
                const bestHeaderRebalance = rebalanceIdeas[0];

                recommendationState = BrainState.REBALANCE_RECOMMENDATION;
                headerAction = 'REBALANCE';
                headerTarget =
                    `${bestHeaderRebalance.sell.acronym} → ` +
                    `${bestHeaderRebalance.shopping.buys[0].acronym}`;

            } else if (shopping.buys.length) {
                recommendationState = BrainState.BUY_RECOMMENDATION;
                headerAction = 'BUY';
                headerTarget = formatAcronymList(
                    shopping.buys.map(b => b.acronym)
                );

            } else if (bestOverall) {
                recommendationState = BrainState.KEEP_SAVING;
                headerAction = 'SAVE FOR';
                headerTarget = bestOverall.acronym;
            }

            const brainDecision = {
                state: recommendationState,
                action: headerAction,
                target: headerTarget,

                title: '',
                summary: '',
                display: '',
                evidence: [],
                alternatives: [],
                details: {}
            };

            const portfolioValue = completedBlocks.reduce((s, b) => s + b.value, 0);
            const portfolioYearly = completedBlocks.reduce((s, b) => s + b.yearly, 0);
            const portfolioRoi = portfolioValue ? portfolioYearly / portfolioValue : 0;
            const sellPressureList = completedBlocks
                .map(b => ({
                    ...b,
                    pressure: sellPressureScore(b, bestAvailableRoi)
                }))
                .sort((a, b) => b.pressure - a.pressure);
            let advisorWidget = '';
            let closestMissHtml = '';
            let closestMissSignal = '';
            if (closestMiss && closestMiss.shortfall <= 10000000) {
                closestMissSignal =
                    (
                        closestMiss.pressure >= 30
                            ? 'High-pressure near miss'
                            : closestMiss.pressure >= 10
                                ? 'Moderate-pressure near miss'
                                : 'Low-pressure near miss'
                    ) + ` (${closestMiss.pressure}/100)`;
                closestMissHtml = `
<b>${closestMiss.sell.acronym} Increment ${closestMiss.sell.increment}</b><br>
Signal: <b style="color:${closestMiss.pressure >= 30
                        ? '#ff7777'
                        : closestMiss.pressure >= 10
                            ? '#ffd36a'
                            : '#cccccc'
                    }">${closestMissSignal}</b><br>
Reason: ${closestMiss.pressure >= 10
                        ? 'This holding has both sell pressure and a near-actionable replacement path.'
                        : 'This is close to actionable, but sell pressure is still low.'
                    }<br>

Advisor Take: ${closestMiss.pressure >= 30 && closestMiss.shortfall <= 5000000
                        ? 'Strong watch candidate.'
                        : closestMiss.pressure >= 10 && closestMiss.shortfall <= 5000000
                            ? 'Monitor; may become interesting soon.'
                            : 'Do not act yet.'
                    }<br>

Improvement vs current plan: <b>${money(closestMiss.extraVsCurrentPlan)}</b>/year<br>
Status: <b>${closestMiss.shortfall <= 1000000
                        ? 'Very close'
                        : closestMiss.shortfall <= 5000000
                            ? 'Worth monitoring'
                            : 'Not currently attractive'
                    }</b><br>
Needed improvement: ${money(MIN_EXTRA_ANNUAL_GAIN)}/year<br>
Shortfall: ${money(closestMiss.shortfall)}/year<br>

Distance to Actionable: ${((MIN_EXTRA_ANNUAL_GAIN /
                        (MIN_EXTRA_ANNUAL_GAIN + closestMiss.shortfall)) * 100)
                        .toFixed(1)
                    }%<br>

Progress Score: ${Math.max(
                        0,
                        100 -
                        (
                            closestMiss.shortfall /
                            MIN_EXTRA_ANNUAL_GAIN
                        ) * 100
                    ).toFixed(1)
                    }/100<br>

Action: ${closestMiss.shortfall <= 1000000
                        ? 'Watch closely; this may become actionable soon.'
                        : closestMiss.shortfall <= 5000000
                            ? 'Monitor during future price/dividend changes.'
                            : 'Informational only; not close enough to act on.'
                    }<br>

Additional improvement needed: <b>${money(closestMiss.shortfall)}</b>/year<br>
Sell Pressure: <b>${closestMiss.pressure}/100</b><br>
ROI sold: ${pct(closestMiss.sell.roi)}<br>
ROI gap vs best buy: ${pct(closestMiss.roiGap)}
`;
            } else {
                closestMissHtml = bestRejectedMiss ? `
<span style="color:#aaa;">No actionable near-miss currently detected.</span><br>

Portfolio Status: <b>${bestRejectedMiss.extraVsCurrentPlan < 0
                        ? 'Excellent'
                        : bestRejectedMiss.shortfall <= 5000000
                            ? 'Good — monitor'
                            : 'Stable'
                    }</b><br>

<small style="color:#888;">


${bestRejectedMiss.buy ? `
Rejected trade path:<br>
Sell: <b>${bestRejectedMiss.sell.acronym} Increment ${bestRejectedMiss.sell.increment}</b><br>
Buy: <b>${bestRejectedMiss.buy.acronym} Increment ${bestRejectedMiss.buy.increment}</b><br>
` : ''}

<br>
Capital released: <b>${money(bestRejectedMiss.sell.value)}</b><br>
Capital invested: <b>${money(bestRejectedMiss.shopping.totalCost)}</b><br>
Capital left after rejected path: <b>${money(bestRejectedMiss.capitalAfter)}</b><br>
${bestRejectedMiss.extraVsCurrentPlan >= 0
                        ? `Potential improvement: <b>${money(bestRejectedMiss.extraVsCurrentPlan)}</b>/year<br>`
                        : `Would reduce annual income by: <b>${money(Math.abs(bestRejectedMiss.extraVsCurrentPlan))}</b>/year<br>`
                    }
Required improvement: ${money(MIN_EXTRA_ANNUAL_GAIN)}/year<br>
Shortfall: <b>${money(bestRejectedMiss.shortfall)}</b>/year<br>
Reason rejected: below the action threshold.
</small>
` : '<span style="color:#aaa;">No actionable near-miss currently detected.</span><br><small style="color:#888;">No completed-block sale improved the current shopping plan. Continue monitoring Sell Pressure candidates and future stock purchases.</small>';
            }

            if (rebalanceIdeas.length) {
                const best = rebalanceIdeas[0];

                advisorWidget = `
        <div>

            <div style="
    font-size:15px;
    color:#d8d8d8;
    line-height:1.5;
    margin:6px 0 10px 0;
">
       ${brainDecision.summary}
</div>

<details style="margin-top:6px;">
                <summary>Why?</summary>

                <div>

                Cash from sale:
                    <b>${money(best.sell.value)}</b><br>

                    Dividend given up:
                    <b>${money(best.sell.yearly)}</b>/year<br>

                    Net annual improvement:
                    <b>${money(best.extraVsCurrentPlan)}</b><br>

                    Capital remaining:
                    <b>${money(best.capitalAfter)}</b>
                </div>
            </details>
        </div>
    `;

            } else if (shopping.buys.length) {

                advisorWidget = `
        <div>


            <div style="
    font-size:15px;
    color:#d8d8d8;
    line-height:1.5;
    margin:6px 0 10px 0;
">
        ${brainDecision.summary}
</div>

<details>
                <summary>Why?</summary>

                <div>
                    Expected annual gain:
                    <b>${money(shopping.totalYearly)}</b><br>

                    Capital remaining:
                    <b>${money(shopping.remainingCapital)}</b>
                </div>
            </details>
        </div>
    `;

            } else if (bestOverall) {

                advisorWidget = `
                    <details>
                    <summary>Why?</summary>

                <div>
                    Additional cash needed:
                    <b>${money(
                    Math.max(
                        0,
                        bestOverall.cost - deployableCapital
                    )
                )}</b><br>

                    Target cost:
                    <b>${money(bestOverall.cost)}</b><br>

                    Expected ROI:
                    <b>${pct(bestOverall.roi)}</b>
                </div>
            </details>
        </div>
    `;
            }

            const parkingHtml = parking.rows.length
                ? parking.rows.map(p => `${p.acronym}: ${p.shares.toLocaleString()} shares = ${money(p.value)}`).join('<br>')
                : 'No parked capital detected from selected parking stocks.';

            let shoppingWidgetHtml = '';
            if (shopping.buys.length) {
                shoppingWidgetHtml = shopping.buys.map(b => `
          <div style="margin:6px 0;padding:8px;border:1px solid #444;border-radius:8px;background:#121212;">
            <b>${b.step}. ${b.acronym} Increment ${b.increment}</b><br>
            Need: ${b.need.toLocaleString()} shares<br>
            Cost: ${money(b.cost)}<br>
            ROI: ${pct(b.roi)}<br>
            Payback: ${b.payback.toFixed(2)} years<br>
            Capital after buy: ${money(b.capitalAfter)}
          </div>
        `).join('');
            } else {
                shoppingWidgetHtml = 'No affordable shopping-list buys found.';
            }

            let rebalanceHtml = '';
            if (rebalanceIdeas.length) {
                rebalanceHtml = rebalanceIdeas.slice(0, 3).map((idea, i) => `
          <div style="margin:6px 0;padding:8px;border:1px solid #444;border-radius:8px;background:#121212;">
            <b>${i + 1}. Sell ${idea.sell.acronym} Increment ${idea.sell.increment}</b><br>
            Value: ${money(idea.sell.value)}<br>
            ROI sold: ${pct(idea.sell.roi)}<br>
Sell Pressure: <b>${idea.pressure}/100</b><br>
Pressure score bonus: ${money(idea.pressure * 250000)}<br>
ROI gap vs best buy: ${pct(idea.roiGap)}<br>
Annual return lost: ${money(idea.sell.yearly)}<br><br>
            <b>Buy list:</b><br>
            ${idea.shopping.buys.map(b => `${b.step}. ${b.acronym} Inc ${b.increment} - ${money(b.cost)} - ROI ${pct(b.roi)}`).join('<br>')}
            <br><br>
            Net annual gain over current plan: <b>${money(idea.extraVsCurrentPlan)}</b><br>
Capital remaining: ${money(idea.capitalAfter)}<br><br>

<b>Why this idea?</b><br>
${buildReasoningLines(idea).map(reason => `• ${reason.text}`).join('<br>')}
Capital freed: ${money(idea.capitalFreed)}<br>
Completed blocks remaining: ${idea.completedBlocksRemaining}<br>
Sell count: ${idea.sellCount}<br>
Scenario deployable capital: ${money(idea.deployableCapital)}
          </div>
        `).join('');
            } else {
                rebalanceHtml = 'No completed-block sale improves the current shopping plan by at least ' + money(MIN_EXTRA_ANNUAL_GAIN) + ' per year.';
            }
            let advisorMode = '🟢 KEEP SAVING';
            let advisorModeColor = '#9CBE64';

            switch (brainDecision.state) {

                case BrainState.REBALANCE_RECOMMENDATION:
                    advisorMode = '🟠 REBALANCE RECOMMENDED';
                    advisorModeColor = '#ff9800';
                    break;

                case BrainState.BUY_RECOMMENDATION:
                    advisorMode = '🟢 BUY RECOMMENDED';
                    advisorModeColor = '#9CBE64';
                    break;

                case BrainState.ERROR:
                    advisorMode = '🔴 ACCURATE RECOMMENDATION UNAVAILABLE';
                    advisorModeColor = '#ff7777';
                    break;

                case BrainState.KEEP_SAVING:
                default:
                    advisorMode = '🟢 KEEP SAVING';
                    advisorModeColor = '#9CBE64';
                    break;
            }
            const headerMode = document.getElementById('wes-stock-header-mode');
            if (headerMode) {
                headerMode.innerHTML = advisorMode;
                headerMode.style.color = advisorModeColor;
            }

            switch (brainDecision.action) {
                case 'BUY':
                    brainDecision.title =
                        `Buy ${brainDecision.target}`;

                    brainDecision.display =
                        `Buy ${brainDecision.target}`;

                    brainDecision.summary =
                        `${brainDecision.target} is the best investment opportunity you can afford right now.`;

                    brainDecision.evidence.push(
                        `Buying ${brainDecision.target} is your strongest investment opportunity right now.`
                    );
                    break;

                case 'REBALANCE':
                    brainDecision.title =
                        `Rebalance ${brainDecision.target}`;

                    brainDecision.display =
                        `Rebalance ${brainDecision.target}`;

                    brainDecision.summary =
                        `Changing these holdings should improve your long-term return enough to justify acting.`;

                    brainDecision.evidence.push(
                        'This rebalance should provide more long-term value than your current portfolio.'
                    );
                    break;

                case 'SAVE FOR':
                    brainDecision.title =
                        `SAVE FOR ${brainDecision.target}`;

                    brainDecision.display =
                        `SAVE FOR ${brainDecision.target}`;

                    brainDecision.summary =
                        `${brainDecision.target} is the best investment opportunity available, but it is out of reach for now.`;

                    brainDecision.evidence.push(
                        `${brainDecision.target} is your strongest investment opportunity, but it is not yet affordable.`
                    );
                    break;

                case 'HOLD':
                default:
                    brainDecision.title =
                        'No worthwhile improvement found';

                    brainDecision.display =
                        'No worthwhile improvement found';

                    brainDecision.summary =
                        'The Brain found no worthwhile way to improve your portfolio with the cash available.';

                    brainDecision.evidence.push(
                        'The Brain did not find a worthwhile improvement to your current portfolio.'
                    );
                    break;
            }
            const bestRebalance = rebalanceIdeas.length ? rebalanceIdeas[0] : null;
            const decisionTriggerHtml = bestRebalance
                ? `
    <b>🟢 Confident</b><br><br>
    <b>Decision Margin</b><br>
<b>${money(bestRebalance.extraVsCurrentPlan - MIN_EXTRA_ANNUAL_GAIN)}</b>/year<br><br>

This recommendation justifies changing the portfolio.
  `
                : `
        <b>⚪ Not Confident</b><br><br>
        <b>Decision Margin</b><br>
<b>${bestRejectedMiss ? '-' + money(bestRejectedMiss.shortfall) : 'Not applicable'}</b>/year<br><br>

No alternative currently justifies changing the portfolio.
  `;

            const knownObjectiveRewards = Object.entries(STOCKS).filter(([acronym, cfg]) =>
                ['market', 'cash'].includes(cfg.rewardType) &&
                rewardValueState(acronym, cfg).status === RewardValueStatus.KNOWN
            ).length;
            const excludedRewards = Object.values(STOCKS).filter(cfg =>
                ['benefit', 'special'].includes(cfg.rewardType)
            ).length;
            const confidence = nonMaterialUnavailableValues.length ? 'Moderate' : 'High';
            const diagnosticsHtml = apiDiagnostics.map(diagnostic =>
                `<div>✓ ${diagnostic.label}: ${diagnostic.elapsedMs.toLocaleString()} ms</div>`
            ).join('');
            const exclusionsHtml = nonMaterialUnavailableValues.length
                ? `<div style="margin-top:6px;color:#ffd36a;">⚠ Excluded as non-actionable today: ${formatAcronymList(nonMaterialUnavailableValues.map(entry => entry.acronym))}</div>`
                : '<div style="margin-top:6px;color:#9cbe64;">✓ No material objective valuation was missing.</div>';
            const pointsEvidence = rewardValueReport.evidence?.PTS;
            const pointsEvidenceHtml = pointsEvidence
                ? `<div style="margin-top:8px;">
                    <b>PTS valuation</b><br>
                    ✓ ${pointsEvidence.listingCount.toLocaleString()} returned listings analysed<br>
                    ✓ ${Math.round(pointsEvidence.totalPoints).toLocaleString()} points represented<br>
                    ✓ Observed weighted price: ${money(pointsEvidence.pricePerPoint)} per point<br>
                    ✓ 100-point reward value: ${money(pointsEvidence.price)}<br>
                    <small style="color:#aaa;">Range observed: ${money(pointsEvidence.lowestPrice)}–${money(pointsEvidence.highestPrice)} per point. This describes the listings returned by Torn, not the entire historical market.</small>
                </div>`
                : '';

            let html = `
    ${advisorWidget}
    <details style="margin-top:10px;">
        <summary>Evidence & confidence</summary>
        <div style="margin-top:7px;line-height:1.5;">
            <b>Confidence: ${confidence}</b><br>
            ✓ ${knownObjectiveRewards} objective reward valuations verified<br>
            ✓ ${excludedRewards} non-objective benefits excluded from ROI<br>
            ✓ 0 fallback values used<br>
            ${exclusionsHtml}
            <div style="margin-top:8px;"><b>Source diagnostics</b></div>
            ${diagnosticsHtml}
            ${pointsEvidenceHtml}
        </div>
    </details>
`;
            /*
          ===============================================================================
          Operation Chameleon - Pass 1
          Supporting cards temporarily hidden.
          Retained for future evaluation.
          ===============================================================================

            ${advisorWidget}

          ${card('\u{1F9E0} Decision Reasoning', `
            <b>Why this mode?</b><br>
            ${rebalanceIdeas.length
                              ? `A completed-block sale passed the action threshold of <b>${money(MIN_EXTRA_ANNUAL_GAIN)}</b>/year over the current shopping plan.`
                              : `No completed-block sale beat the current shopping plan by the required <b>${money(MIN_EXTRA_ANNUAL_GAIN)}</b>/year margin.`
                          }<br><br>

            <b>What the advisor is comparing</b><br>
            Current plan annual gain: <b>${money(shopping.totalYearly)}</b><br>
            Best buy ROI: <b>${shopping.buys.length ? pct(shopping.buys[0].roi) : '-'}</b><br>
            Completed blocks checked: <b>${completedBlocks.length}</b><br><br>

            <small style="color:#aaa;">
              Only recommendations exceeding the annual improvement threshold are considered.
            </small>
          `, rebalanceIdeas.length ? '#ff9800' : '#ffd54a')}

          ${card('Deployable Capital', `
                    Deployable Capital (User Entered): <b>${money(liquidCash)}</b><br>
                    Partial Blocks (Calculated): <b>${money(parking.total)}</b><br>
                    Total Deployable Capital: <b>${money(deployableCapital)}</b><br><br>
                    <small><b>Partial-block shares detected:</b><br>${parkingHtml}</small>
                  `, '#4a8ff0')}


                  ${card('Closest Miss', `
          ${closestMissHtml}
          `, closestMiss && closestMiss.shortfall <= 10000000 ? '#d68a2f' : '#666')}
          ${card('Sell Pressure Watchlist', `
          ${sellPressureList.slice(0, 3).map((b, i) => `
          ${i + 1}. <b>${b.acronym} Increment ${b.increment}</b><br>
          Sell Pressure: <b>${b.pressure}/100</b><br>
          ROI: ${pct(b.roi)}<br>
          Value: ${money(b.value)}
          `).join('<br><br>')}
          `, '#d68a2f')}
                  ${card('Portfolio Summary', `
                    Completed block value: <b>${money(portfolioValue)}</b><br>
                    Estimated annual return: <b>${money(portfolioYearly)}</b><br>
                    Portfolio ROI: <b>${pct(portfolioRoi)}</b><br>
                    Completed blocks detected: ${completedBlocks.length}
                  `)}



                  <div style="margin-top:10px;font-weight:bold;">Top Next Buys</div>
                `;


                      opportunities.slice(0, 3).forEach(o => {
                          const affordableNow = o.cost <= deployableCapital;
                          html += card(`${affordableNow ? 'YES' : 'NO'} ${o.acronym} Increment ${o.increment}`, `
                    Need: ${o.need.toLocaleString()} shares<br>
                    Cost: ${money(o.cost)} ${affordableNow ? '' : `- Short ${money(o.cost - deployableCapital)}`}<br>
                    ROI: <b>${pct(o.roi)}</b><br>
                    Payback: ${o.payback.toFixed(2)} years
                  `, affordableNow ? '#3a9f50' : '#555');
                      });


          */


            setAnalysisProgress('Preparing recommendation...', 7);
            out(html);
            finalButtonState = 'success';

            const headerContent =
                document.getElementById('brain-header-content');

            let adviceColor;

            switch (brainDecision.action) {
                case 'BUY':
                    adviceColor = '#9cbe64';
                    break;

                case 'REBALANCE':
                    adviceColor = '#ff9800';
                    break;

                case 'SAVE FOR':
                case 'HOLD':
                default:
                    adviceColor = '#6fd3ff';
                    break;
            }

            if (headerContent) {
                headerContent.innerHTML = `
<div style="
    font-size:22px;
    font-weight:bold;
    color:${adviceColor};
    line-height:1.1;
">
    ${'\u{1F9E0}'} ${brainDecision.title}
</div>
`;

            }

        } catch (error) {
            console.error('[Brain v4.5] Analysis failed:', error);
            setBrainHeader(
                error?.kind === 'timeout'
                    ? 'Accurate recommendation unavailable'
                    : 'Analysis error',
                '#ff7777'
            );
            out(`
                <div style="font-size:15px;color:#d8d8d8;line-height:1.5;">
                    ${describeAnalysisError(error)}
                </div>
                <div style="margin-top:10px;color:#ffb3b3;">
                    No fallback prices were used. No recommendation was produced.
                </div>
                ${retryButtonHtml()}
            `);
            wireRetryButton();
            finalButtonState = 'retry';
        } finally {
            analysisInProgress = false;
            setAnalyzeButton(finalButtonState);
            console.log(
                `[Brain v4.5] Analysis finished in ${Math.round(performance.now() - startedAt)} ms.`
            );
        }
    }

    function createBrainHeader() {
        return `
<div id="brain-header"
     class="title main-title title-black top-round active"
     style="
         display:flex;
         justify-content:space-between;
         align-items:center;
     ">

    <h5 id="brain-header-content" class="box-title">
        \u{1F9E0} The Brain
    </h5>

   <div>
   <button id="wes-stock-run"
    style="
        color:white;
    ">
    Analyze
</button>

<button id="brain-settings-button"
    style="
        color:white;
    ">
    \u2699\uFE0F
</button>
</div>

</div>
`;
    }


    function createBrainContainer() {
        const box = document.createElement('div');

        box.id = 'wes-stock-roi-box';
        box.className = 'sortable-box';
        box.style.margin = '10px 0';

        return box;
    }

    function buildPanel() {
        if (document.getElementById('wes-stock-roi-box')) return;

        const savedParking = getParkingSymbols();
        const strategicSaleControls = buildStrategicSaleControls();

        const parkingChecks = Object.keys(STOCKS).sort().map(acronym => `
      <label style="display:inline-block;margin:3px 8px 3px 0;">
        <input class="wes-parking-check" type="checkbox" value="${acronym}" ${savedParking.includes(acronym) ? 'checked' : ''}>
        ${acronym}
      </label>
    `).join('');


        const box = createBrainContainer();

        box.innerHTML = `

${createBrainHeader()}

<div class="cont-gray bottom-round">


                <div id="wes-stock-output"
    style="
        padding:6px 0;
    ">
                    Ready to analyze your portfolio.
                </div>

                <div id="brain-settings-panel"
                    style="
    display:none;
">

                    <input id="wes-stock-key"
                        type="password"
                        placeholder="Paste Torn API key"
                        style="width:280px;max-width:90%;padding:6px;"><br>

                            <input id="wes-stock-cash"
                                type="text"
                                placeholder="Deployable Capital"
                                style="width:280px;max-width:90%;padding:6px;"><br>

                                    <div>
                                        <div>
                                            Strategic Sale Candidates
                                        </div>

                                        <div>
                                            Choose how many completed blocks of each
                                            strategic-benefit stock The Brain may consider
                                            selling. The default is 0.
                                        </div>

                                        <div style="
                                            display:flex;
                                            flex-wrap:wrap;
                                            gap:6px;
                                            align-items:center;
                                        ">
                                            ${strategicSaleControls}
                                        </div>
                                    </div>

                                    <button id="wes-stock-save">
                                        Save Settings
                                    </button>

                                </div>

                            </div>

                        `;

        const stockMarketRoot = document.querySelector('#stockmarketroot');

        if (stockMarketRoot) {
            stockMarketRoot.prepend(box);
        } else {
            const mainContainer =
                document.querySelector('#mainContainer') || document.body;

            mainContainer.prepend(box);
        }



        const cashInput = document.getElementById('wes-stock-cash');
        const keyInput = document.getElementById('wes-stock-key');
        const savedCash = localStorage.getItem(CASH_STORAGE) || '';
        const savedKey = localStorage.getItem(KEY_STORAGE) || '';
        if (savedCash) cashInput.value = Number(savedCash).toLocaleString('en-US');
        if (savedKey && /^###.*###$/.test(PDA_API_KEY)) keyInput.value = savedKey;

        cashInput.addEventListener('input', () => {
            const digits = cashInput.value.replace(/\D/g, '');

            if (digits === '') {
                cashInput.value = '';
                return;
            }

            cashInput.value = Number(digits).toLocaleString('en-US');
        });

        document.getElementById('brain-settings-button').onclick = () => {
            const settingsPanel =
                document.getElementById('brain-settings-panel');

            if (!settingsPanel) return;

            settingsPanel.style.display =
                settingsPanel.style.display === 'none'
                    ? 'block'
                    : 'none';
        };

        document.getElementById('wes-stock-save').onclick = () => {
            const key =
                document.getElementById('wes-stock-key').value.trim();

            const cash =
                document.getElementById('wes-stock-cash')
                    .value
                    .replace(/,/g, '')
                    .trim();

            if (key) localStorage.setItem(KEY_STORAGE, key);
            localStorage.setItem(CASH_STORAGE, cash);
            saveParkingSymbols();
            saveStrategicSaleLimits();

            out('Settings saved locally.');

            // Close the settings panel using the existing toggle.
            document.getElementById('brain-settings-button')?.click();
        };

        document.getElementById('wes-stock-run').onclick = run;
    }

    setTimeout(buildPanel, 1000);


})();