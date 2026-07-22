// ==UserScript==
// @name         Torn PDA - Stock Portfolio Advisor V4.1 - Color Recovery Merge
// @namespace    wes-stock-portfolio-advisor
// @version      4.1.3-color-recovery
// @description  Portfolio advisor with shopping list and completed-block rebalancer.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// ==/UserScript==

(function () {
    'use strict';

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

    // Application lifecycle and recommendation states.
    const BrainState = Object.freeze({

        READY: "READY",

        SCANNING: "SCANNING",

        KEEP_SAVING: "KEEP_SAVING",

        REBALANCE_RECOMMENDATION: "REBALANCE_RECOMMENDATION",

        BUY_RECOMMENDATION: "BUY_RECOMMENDATION",

        ERROR: "ERROR"

    });

    const LIVE_DIVIDEND_ITEMS = {
        SYM: 'Drug Pack',
        FHG: 'Feathery Hotel Coupon',
        PRN: 'Erotic DVD',
        THS: 'Box of Medical Supplies',
        EWM: 'Box of Grenades',
        LSC: 'Lottery Voucher',
        LAG: "Lawyer's Business Card",
        ASS: 'Six-Pack of Alcohol',
        MUN: 'Six-Pack of Energy Drink'
    };

    const LIVE_DIVIDEND_CACHE = {};
    const STOCKS = {
        SYM: { required: 500000, payoutValue: 4347715, days: 7, maxInc: 4, benefit: 'Drug Pack' },
        FHG: { required: 2000000, payoutValue: 13460323, days: 7, maxInc: 4, benefit: 'Feathery Hotel Coupon' },
        PRN: { required: 1000000, payoutValue: 4101132, days: 7, maxInc: 4, benefit: 'Erotic DVD' },
        GRN: { required: 500000, payoutValue: 4000000, days: 31, maxInc: 4, benefit: 'Travel value' },
        MUN: { required: 5000000, payoutValue: 14555277, days: 7, maxInc: 4, benefit: 'Munster energy value' },
        IOU: { required: 3000000, payoutValue: 12000000, days: 31, maxInc: 4, benefit: 'Casino value' },
        THS: { required: 150000, payoutValue: 272023, days: 7, maxInc: 4, benefit: 'Medical value' },
        PTS: { required: 10000000, payoutValue: 3242800, days: 7, maxInc: 4, benefit: 'Points value' },
        TMI: { required: 6000000, payoutValue: 25000000, days: 31, maxInc: 4, benefit: 'TMI value' },
        HRG: { required: 10000000, payoutValue: 45456057.69, days: 31, maxInc: 4, benefit: 'Medical item value' },
        EWM: { required: 1000000, payoutValue: 1081975, days: 7, maxInc: 4, benefit: 'Grenade box value' },
        TCT: { required: 100000, payoutValue: 1000000, days: 31, maxInc: 4, benefit: 'TCT value' },
        LSC: { required: 500000, payoutValue: 903347, days: 7, maxInc: 4, benefit: 'Lottery Voucher' },
        TSB: { required: 3000000, payoutValue: 50000000, days: 31, maxInc: 4, benefit: 'TSB value' },
        CNC: { required: 7500000, payoutValue: 80000000, days: 31, maxInc: 4, benefit: 'CNC value' },
        ASS: { required: 1000000, payoutValue: 951567, days: 7, maxInc: 4, benefit: 'Alcohol pack value' },
        LAG: { required: 750000, payoutValue: 199225, days: 7, maxInc: 4, benefit: 'Lawyer Business Card' },
        TCC: { required: 7500000, payoutValue: 3650908.857, days: 31, maxInc: 4, benefit: 'TCC value' },
        IIL: { required: 1000000, payoutValue: 2421531, days: 14.4, maxInc: 1, benefit: 'Tunneling Virus' }
    };
    const STOCK_METADATA = {    // Monetary / ROI-modeled stocks
        SYM: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        FHG: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        PRN: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        GRN: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        MUN: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        IOU: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        THS: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        PTS: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        TMI: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        HRG: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        EWM: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        TCT: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        LSC: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        TSB: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        CNC: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        ASS: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        LAG: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },
        TCC: { category: 'Monetary', optimizationEligible: true, explanation: 'Benefit has an objective payout value modeled in STOCKS.' },

        // Known but excluded from optimization
        IIL: {
            category: 'Conditional',
            optimizationEligible: false,
            explanation: 'Tunneling Virus value depends on assumptions Brain does not currently model objectively.'
        },

        ELT: {
            name: 'Empty Lunchbox Traders',
            required: 5000000,
            category: 'Strategic',
            benefit: '10% Home Upgrade Discount',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        EVL: {
            name: 'Evil Ducks Candy Corp',
            required: 100000,
            category: 'Strategic',
            benefit: '1000 Happiness',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        CBD: {
            name: 'HappyHerbal Releaf Co.',
            required: 350000,
            category: 'Strategic',
            benefit: '50 Nerve',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        IST: {
            name: 'International School TC',
            required: 100000,
            category: 'Strategic',
            benefit: 'Free Edu. Courses',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        LOS: {
            name: 'Lo Squalo Waste Management',
            required: 7500000,
            category: 'Strategic',
            benefit: '25% Boost to mission rewards',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        MCS: {
            name: 'Mc Smoogle Corp',
            required: 350000,
            category: 'Strategic',
            benefit: '100 Energy',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        MSG: {
            name: 'Messaging Inc.',
            required: 300000,
            category: 'Strategic',
            benefit: 'Free Classified Advertising',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        SYS: {
            name: 'Syscore MFG',
            required: 3000000,
            category: 'Strategic',
            benefit: 'Advanced Firewall',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        TCP: {
            name: 'TC Media Productions',
            required: 1000000,
            category: 'Strategic',
            benefit: 'Company Sales Boost',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        TGP: {
            name: 'Tell Group Plc.',
            required: 2500000,
            category: 'Strategic',
            benefit: 'Company Advertising Boost',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        TCI: {
            name: 'Torn City Investments',
            required: 1500000,
            category: 'Strategic',
            benefit: '10% Bank Interest Bonus',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        TCM: {
            name: 'Torn City Motors',
            required: 1000000,
            category: 'Strategic',
            benefit: '10% Racing Skill Boost',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        WSU: {
            name: 'West Side University',
            required: 1000000,
            category: 'Strategic',
            benefit: '-10% Edu. Course Time',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        WLT: {
            name: 'Wind Lines Travel',
            required: 9000000,
            category: 'Strategic',
            benefit: 'Private Jet Access',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        },

        YAZ: {
            name: 'Yazoo',
            required: 1000000,
            category: 'Strategic',
            benefit: 'Free Banner Advertising',
            optimizationEligible: false,
            explanation: 'Strategic benefit cannot be valued objectively.'
        }

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
    // ----------------------------------------------------------------------------
    // These helper functions provide the public interface to Brain's knowledge.
    //
    // Portfolio logic should ask questions through these helpers rather than
    // accessing STOCK_METADATA directly.
    //
    // This keeps Brain's reasoning independent of how knowledge is stored.
    // ============================================================================

    function getStockMetadata(acronym) {
        return STOCK_METADATA[acronym] || {};
    }

    function isOptimizationEligible(acronym) {
        return getStockMetadata(acronym).optimizationEligible !== false;
    }

    function getOptimizationExplanation(acronym) {
        return getStockMetadata(acronym).explanation || 'No optimization explanation recorded.';
    }

    function isStrategicStock(acronym) {
        return getStockMetadata(acronym).category === 'Strategic';
    }
    // Returns Brain's knowledge about a stock.
    // Unknown stocks return an empty object.
    function getStockMetadata(acronym) {
        return STOCK_METADATA[acronym] || {};
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

    function api(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: r => {
                    try {
                        const json = JSON.parse(r.responseText);
                        if (json.error) reject(json.error); else resolve(json);
                    } catch (e) { reject(e); }
                },
                onerror: reject
            });
        });
    }

    async function refreshLiveDividendValues(apiKey) {
        try {
            const response = await api(
                `https://api.torn.com/v2/torn/items?key=${encodeURIComponent(apiKey)}`
            );

            const items = Array.isArray(response.items) ? response.items : [];

            const itemsByName = new Map(
                items.map(item => [
                    String(item.name || '').trim().toLowerCase(),
                    item
                ])
            );

            let updatedCount = 0;

            Object.entries(LIVE_DIVIDEND_ITEMS).forEach(([acronym, itemName]) => {
                const item = itemsByName.get(itemName.toLowerCase());
                const marketPrice = Number(item?.value?.market_price);

                if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
                    console.warn(
                        `[Brain v4.1] No valid live value found for ${acronym}: ${itemName}`
                    );
                    return;
                }

                LIVE_DIVIDEND_CACHE[acronym] = {
                    price: marketPrice,
                    itemId: item.id,
                    itemName: item.name,
                    updated: Date.now()
                };

                updatedCount++;
            });

            console.log(
                `[Brain v4.1] Updated ${updatedCount}/${Object.keys(LIVE_DIVIDEND_ITEMS).length} live dividend values.`
            );


            return updatedCount > 0;
        } catch (error) {
            console.warn(
                '[Brain v4.1] Live dividend price fetch failed. Existing fallback values remain available.',
                error
            );

            return false;
        }
    }


    function annualValue(cfg) { return cfg.payoutValue * (365 / cfg.days); }
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
                const yearly = annualValue(cfg);
                return {
                    acronym, name: market.name, increment: inc, target, need, cost, yearly,
                    roi: yearly / cost, payback: cost / yearly, benefit: cfg.benefit
                };
            }
        }
        return null;
    }

    function getCompletedBlocks(acronym, cfg, market, ownedShares) {
        const blocks = [];
        const yearly = annualValue(cfg);

        for (let inc = 1; inc <= cfg.maxInc; inc++) {
            const target = targetForIncrement(cfg.required, inc);
            if (ownedShares < target) break;

            const shares = blockSize(cfg.required, inc);
            const value = shares * market.price;

            blocks.push({
                acronym, name: market.name, increment: inc, shares, value, yearly,
                roi: yearly / value, benefit: cfg.benefit
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

        return Object.keys(STOCK_METADATA)
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

        Object.keys(STOCK_METADATA)
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
                        benefit: metadata.benefit || 'Strategic benefit'
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

            let availableCapital = liquidation.totalCapital;

            const liquidation = simulateLiquidation(
                startingCapital,
                portfolio.holdings,
                byAcronym
            );

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

    async function run() {
        const manualKey =
            document.getElementById('wes-stock-key')?.value.trim() || '';

        const tornPdaKey =
            !/^###.*###$/.test(PDA_API_KEY)
                ? PDA_API_KEY.trim()
                : '';

        const key = tornPdaKey || manualKey;
        const liquidCash = num(document.getElementById('wes-stock-cash').value);

        if (!key) return out('Paste your Torn API key first.');

        if (!tornPdaKey && manualKey) {
            localStorage.setItem(KEY_STORAGE, manualKey);
        }
        localStorage.setItem(CASH_STORAGE, String(liquidCash));
        const parkingSymbols = saveParkingSymbols();
        const strategicSaleLimits = saveStrategicSaleLimits();

        out('Scanning portfolio and calculating rebalance opportunities...');
        const settingsPanel =
            document.getElementById('brain-settings-panel');

        if (settingsPanel) {
            settingsPanel.style.display = 'none';
        }
        try {
            await refreshLiveDividendValues(key);

            Object.entries(LIVE_DIVIDEND_CACHE).forEach(([acronym, liveData]) => {
                const livePrice = Number(liveData?.price);

                if (
                    STOCKS[acronym] &&
                    Number.isFinite(livePrice) &&
                    livePrice > 0
                ) {
                    STOCKS[acronym].payoutValue = livePrice;
                }
            });

            const [marketRaw, userRaw] = await Promise.all([
                api(`https://api.torn.com/torn/?selections=stocks&key=${encodeURIComponent(key)}`),
                api(`https://api.torn.com/user/?selections=stocks&key=${encodeURIComponent(key)}`)
            ]);

            const { byAcronym, idToAcronym } = normalizeMarketStocks(marketRaw.stocks || {});
            const owned = normalizeOwnedShares(userRaw.stocks || {}, idToAcronym);
            const parking = calculateParkingCapital(Object.keys(STOCKS), owned, byAcronym);
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
                        `KEEP SAVING FOR ${brainDecision.target}`;

                    brainDecision.display =
                        `KEEP SAVING FOR ${brainDecision.target}`;

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
<b>-${money(bestRejectedMiss.shortfall)}</b>/year<br><br>

No alternative currently justifies changing the portfolio.
  `;

            let html = `
    ${advisorWidget}
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


            out(html);

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

        } catch (e) {
            out(`API error: ${e.error || e.message || JSON.stringify(e)}`);
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

            localStorage.setItem(KEY_STORAGE, key);
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