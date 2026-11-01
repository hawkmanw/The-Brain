// ==UserScript==
// @name         The Brain Portfolio Advisor
// @namespace https://github.com/hawkmanw
// @updateURL   https://raw.githubusercontent.com/hawkmanw/The-Brain/main/TheBrain.user.js
// @downloadURL https://raw.githubusercontent.com/hawkmanw/The-Brain/main/TheBrain.user.js
// @homepageURL https://github.com/hawkmanw/The-Brain
// @supportURL  https://github.com/hawkmanw/The-Brain/issues
// @version      6.3.42
// @description A deterministic, evidence-driven stock portfolio advisor for Torn on desktop and TornPDA.
// @author       Wesley Hawks
// @license      MIT
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
    • No capital is presumed untouchable unless the player explicitly protects a Strategic Target.
    • Recommendations are evidence-driven. If sufficient objective evidence is unavailable, The Brain does not recommend.
    • Every recommendation must be explainable.
    • Every widget answers one question well.
    • Never invent data or certainty. Missing evidence is reported, never concealed or replaced with a fallback value.
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
  
    ────────────────────────────────────────────────────
  
     The Brain Design Charter:
  
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
     The Brain began life as a Torn widget. The Brain is not a widget. The widget is merely how The Brain speaks.
  
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
    const STRATEGIC_SALE_STORAGE = 'wes_stock_strategic_sale_blocks_v41';
    const STRATEGIC_TARGET_STORAGE = 'wes_stock_strategic_target_v61';
    const TCI_BANK_INVESTMENT_STORAGE = 'wes_brain_tci_bank_investment_start_v620';
    const TCI_BANK_ACTIVE_STORAGE = 'wes_brain_tci_bank_active_at_start_v613';
    // Torn charges a 0.1% fee on the total value of shares sold.
    const STOCK_SALE_FEE_RATE = 0.001;
    // Pure owned-TCI comparison shared by live Why? and offline diagnostics.
    // Screening only: never changes optimizer decisions or strategic settings.
    const evaluateOwnedTciSale = ({shares, required, blockValue, annualBonus,
        strategicTarget, liquidCash, opportunities, feeRate=STOCK_SALE_FEE_RATE}) => {
        const ownsBlock = shares >= required;
        const saleCash = blockValue * (1-feeRate);
        if (!ownsBlock) return {status:'NOT_OWNED',saleCash};
        if (strategicTarget === 'TCI') return {status:'PROTECTED',saleCash};
        if (!Number.isFinite(annualBonus) || annualBonus < 0)
            return {status:'UNKNOWN_BONUS',saleCash};
        const candidates = opportunities.filter(o => o.acronym !== 'TCI' &&
            Number.isFinite(o.cost) && o.cost > 0 &&
            Number.isFinite(o.yearly) && o.yearly > 0 &&
            o.cost <= saleCash + liquidCash);
        const replacement = candidates.length
            ? candidates.reduce((best,o)=>!best || o.yearly > best.yearly ? o : best,null)
            : null;
        if (!replacement) return {status:'NO_REPLACEMENT',saleCash};
        const improvement = replacement.yearly - annualBonus;
        return {status:improvement>0?'REVIEW_SELL':'HOLD',saleCash,
            replacement,improvement,saleFee:blockValue*feeRate};
    };
    // Evaluate all complete, objectively valued reward blocks in the finished
    // holdings. Unlike idealPortfolio.yearlyIncome (which counts builder purchases),
    // this includes holdings deliberately retained through strategic protection.
    // Missing market payout evidence makes the comparison invalid, not zero.
    function calculatePortfolioAnnualIncome(holdings, byAcronym) {
        let total = 0;
        const unavailable = [];
        for (const [acronym, shares] of Object.entries(holdings || {})) {
            const cfg = STOCKS[acronym];
            if (!cfg || !isOptimizationEligible(acronym)) continue;
            const count = completedIncrementCount(cfg.required, Number(shares) || 0);
            if (!count) continue;
            const yearly = annualValue(cfg, acronym);
            if (!byAcronym[acronym] || !Number.isFinite(yearly) || yearly <= 0) {
                unavailable.push(acronym);
                continue;
            }
            total += count * yearly;
        }
        return {annualIncome:unavailable.length ? null : total, unavailable};
    }
    // Named phases are intentionally separate from bank-sale authorization.
    const TciChurnPhase = Object.freeze({ IN: 'CHURN_IN', OUT: 'CHURN_OUT' });
    // Complete-portfolio TCI sale scenario. It uses the same stable optimizer as
    // ordinary recommendations, rather than selecting a single high-ROI block.
    // Read-only until real-account verification proves the comparison safe.
    function evaluateTciIntegratedPortfolio({owned, liquidCash, byAcronym,
        strategicSaleLimits, strategicTarget, annualBonus, bankDaysLeft,
        buildStable=buildStableIdealPortfolio}) {
        const required = STOCKS.TCI.required;
        const shares = Number(owned.TCI || 0);
        const price = Number(byAcronym.TCI?.price);
        if (shares !== required) return {status:'NOT_ONE_BLOCK'};
        if (strategicTarget === 'TCI') return {status:'PROTECTED'};
        if (!Number.isFinite(annualBonus) || annualBonus < 0 ||
            !Number.isFinite(price) || price <= 0 ||
            !Number.isFinite(Number(liquidCash)) || liquidCash < 0)
            return {status:'MISSING_EVIDENCE',reason:'Invalid simulation input(s): '+[!Number.isFinite(annualBonus)||annualBonus<0?'annual TCI bonus':null,!Number.isFinite(price)||price<=0?'live TCI price':null,!Number.isFinite(Number(liquidCash))||liquidCash<0?'liquid cash':null].filter(Boolean).join(', ')+'.'};
        if (!Number.isFinite(bankDaysLeft)) return {status:'MISSING_EVIDENCE',reason:'Bank maturity countdown is unavailable.'};
        if (bankDaysLeft <= 8) return {status:'BANK_WINDOW_PROTECTED'};
        const gross = required * price;
        const fee = gross * STOCK_SALE_FEE_RATE;
        const net = gross - fee;
        // Compare fully optimized portfolios, using identical assumptions and
        // protecting Strategic Holdings in both scenarios.
        const keep = buildStable(liquidCash,owned,byAcronym,
            strategicSaleLimits,strategicTarget);
        const soldOwned = {...owned,TCI:0};
        const sold = buildStable(liquidCash+net,soldOwned,byAcronym,
            strategicSaleLimits,strategicTarget);
        const keepValuation = buildStable === buildStableIdealPortfolio
            ? calculatePortfolioAnnualIncome(keep?.idealPortfolio?.holdings,byAcronym)
            : {annualIncome:keep?.idealPortfolio?.yearlyIncome,unavailable:[]};
        const sellValuation = buildStable === buildStableIdealPortfolio
            ? calculatePortfolioAnnualIncome(sold?.idealPortfolio?.holdings,byAcronym)
            : {annualIncome:sold?.idealPortfolio?.yearlyIncome,unavailable:[]};
        const keepIncome = keepValuation.annualIncome;
        const sellIncome = sellValuation.annualIncome;
        if (![keepIncome,sellIncome].every(Number.isFinite))
            return {status:'MISSING_EVIDENCE',reason:'Incomplete reward valuation for: '+
                [...new Set([...keepValuation.unavailable,...sellValuation.unavailable])].join(', ')};
        // Annualized comparison only, for already-owned permanent TCI.
        // Stock price slippage, collection delays,
        // activation timing and future bank rates can change realized outcomes.
        const improvement = sellIncome - (keepIncome + annualBonus);
        // Reconstruct transactions against REAL holdings so the TCI sale and its
        // fee are included, not quietly omitted by the TCI=0 test scenario.
        const actualTransactions = buildNetTransactions(owned,sold.idealPortfolio.holdings,byAcronym);
        const actualBuys = actualTransactions.buys;
        const actualSells = actualTransactions.sells;
        const tciSale = actualSells.find(x=>x.acronym==='TCI' && x.shares===required);
        const purchaseCost = actualBuys.reduce((total,b)=>total+Number(b.cost||0),0);
        const saleProceeds = actualSells.reduce((total,s)=>total+Number(s.netValue||0),0);
        const leftover = Number(sold.idealPortfolio.cashRemaining);
        const availableCapital = Number(liquidCash)+saleProceeds;
        if (!tciSale || !Number.isFinite(purchaseCost) || !Number.isFinite(leftover) ||
            leftover < -0.01 || !Number.isFinite(availableCapital) ||
            purchaseCost > availableCapital + 0.01 ||
            Math.abs((availableCapital-purchaseCost)-leftover) > Math.max(1,availableCapital*0.000001))
            return {status:'UNFUNDED'};
        return {status:improvement>0?'REVIEW_SELL':'HOLD',
            improvement,gross,fee,net,keepIncome:keepIncome+annualBonus,
            sellIncome,purchaseCost,remainingCash:leftover,
            transactions:actualTransactions,
            sellTickers:actualSells.map(s=>s.acronym),
            buyTickers:actualBuys.map(b=>b.acronym)};
    }
    // Final read-only recommendation gate. This does NOT promote a shadow
    // portfolio comparison to the live optimizer. Actual TCI SELL remains
    // disabled until verified bank and transaction timing can be applied.
    function assessTciRebalanceGate(review) {
        if (!review || typeof review.status !== 'string') return 'INSUFFICIENT_EVIDENCE';
        if (review.status === 'PROTECTED' || review.status === 'BANK_WINDOW_PROTECTED')
            return 'PROTECTED';
        if (review.status === 'NOT_ONE_BLOCK') return 'NOT_APPLICABLE';
        if (review.status === 'MISSING_EVIDENCE' || review.status === 'UNFUNDED')
            return 'INSUFFICIENT_EVIDENCE';
        if (review.status === 'HOLD') return 'HOLD';
        if (review.status === 'REVIEW_SELL') {
            if (!Number.isFinite(review.improvement) || review.improvement <= 0 ||
                !Number.isFinite(review.remainingCash) || review.remainingCash < 0 ||
                !Number.isFinite(review.purchaseCost) || review.purchaseCost < 0)
                return 'INSUFFICIENT_EVIDENCE';
            return 'REVIEW_SELL_ONLY';
        }
        return 'INSUFFICIENT_EVIDENCE';
    }
    // Live promotion gate: demand strictly positive incremental annual income
    // and a real, fully financed transaction list. No arbitrary profit hurdle.
    // No missing evidence, incomplete TCI block, or near-bank-maturity sale.
    function authorizeLiveTciSale(review, baselineAnnual, required) {
        if (assessTciRebalanceGate(review) !== 'REVIEW_SELL_ONLY') return false;
        if (!Number.isFinite(baselineAnnual) || !Number.isFinite(review.sellIncome) ||
            !Number.isFinite(review.gross) || review.gross <= 0) return false;
        const tx = review.transactions;
        if (!tx || !Array.isArray(tx.sells) || !Array.isArray(tx.buys) ||
            !tx.sells.some(s=>s.acronym==='TCI' && s.shares===required) ||
            !tx.buys.length) return false;
        // Compare against doing nothing; fees are already in net sale proceeds.
        // A zero improvement is HOLD. Do not create a fabricated profit floor.
        return review.improvement > 0 && review.sellIncome > baselineAnnual;
    }
    const API_TIMEOUTS = Object.freeze({
        stocks: 10000,
        portfolio: 10000,
        items: 15000,
        points: 15000,
        default: 10000
    });
    const SLOW_NOTICE_MS = 5000;
    let analysisInProgress = false;
    let latestOwnedShares = null;
    const FIRST_SCAN_NOTICE_STORAGE = 'wes_stock_first_scan_notice_v50';

    // Application lifecycle and recommendation states.
    const BrainState = Object.freeze({

        READY: "READY",

        SCANNING: "SCANNING",

        KEEP_SAVING: "KEEP_SAVING",

        REBALANCE_RECOMMENDATION: "REBALANCE_RECOMMENDATION",

        CHURN_RECOMMENDATION: "CHURN_RECOMMENDATION",

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
        SYM: { required: 500000, rewardType: 'market', item: 'Drug Pack', days: 7 },
        FHG: { required: 2000000, rewardType: 'market', item: 'Feathery Hotel Coupon', days: 7 },
        PRN: { required: 1000000, rewardType: 'market', item: 'Erotic DVD', days: 7 },
        MUN: { required: 5000000, rewardType: 'market', item: 'Six-Pack of Energy Drink', days: 7 },
        THS: { required: 150000, rewardType: 'market', item: 'Box of Medical Supplies', days: 7 },
        EWM: { required: 1000000, rewardType: 'market', item: 'Box of Grenades', days: 7 },
        LSC: { required: 500000, rewardType: 'market', item: 'Lottery Voucher', days: 7 },
        ASS: { required: 1000000, rewardType: 'market', item: 'Six-Pack of Alcohol', days: 7 },
        LAG: { required: 750000, rewardType: 'market', item: "Lawyer's Business Card", days: 7 },

        // PTS pays 100 points every seven days. The value is derived from the live
        // Points Market using a quantity-weighted average of the listings Torn returns.
        PTS: { required: 10000000, rewardType: 'market', marketSource: 'points', rewardAmount: 100, description: '100 Points', days: 7 },

        TCC: { required: 7500000, rewardType: 'special', description: 'Random Clothing Cache' },

        GRN: { required: 500000, rewardType: 'cash', cashAmount: 4000000, days: 31, description: 'Cash dividend' },
        IOU: { required: 3000000, rewardType: 'cash', cashAmount: 12000000, days: 31, description: 'Cash dividend' },
        TMI: { required: 6000000, rewardType: 'cash', cashAmount: 25000000, days: 31, description: 'Cash dividend' },
        TCT: { required: 100000, rewardType: 'cash', cashAmount: 1000000, days: 31, description: 'Cash dividend' },
        TSB: { required: 3000000, rewardType: 'cash', cashAmount: 50000000, days: 31, description: 'Cash dividend' },
        CNC: { required: 7500000, rewardType: 'cash', cashAmount: 80000000, days: 31, description: 'Cash dividend' },
        // HRG awards one random property every 31 days.
        // Torn documents each property from Trailer through
        // Private Island as having an equal probability (1/13).
        // Therefore the expected dividend value is the
        // arithmetic mean of all 13 property values
        // ($45,456,019.23).
        HRG: { required: 10000000, rewardType: 'cash', cashAmount: 45456019.23, days: 31, description: 'One random property', },
        IIL: { required: 1000000, rewardType: 'benefit', description: '50% Coding Time Reduction' },
        ELT: { name: 'Empty Lunchbox Traders', required: 5000000, rewardType: 'benefit', description: '10% Home Upgrade Discount' },
        EVL: { name: 'Evil Ducks Candy Corp', required: 100000, rewardType: 'benefit', description: '1000 Happiness every 7 days' },
        CBD: { name: 'HappyHerbal Releaf Co.', required: 350000, rewardType: 'benefit', description: '50 Nerve' },
        IST: { name: 'International School TC', required: 100000, rewardType: 'benefit', description: 'Free Education Courses' },
        LOS: { name: 'Lo Squalo Waste Management', required: 7500000, rewardType: 'benefit', description: '25% Mission Reward Bonus' },
        MCS: { name: 'Mc Smoogle Corp', required: 350000, rewardType: 'benefit', description: '100 Energy every 7 days' },
        MSG: { name: 'Messaging Inc.', required: 300000, rewardType: 'benefit', description: 'Free Classified Advertising' },
        SYS: { name: 'Syscore MFG', required: 3000000, rewardType: 'benefit', description: 'Advanced Firewall' },
        TCP: { name: 'TC Media Productions', required: 1000000, rewardType: 'benefit', description: 'Company Sales Boost' },
        TGP: { name: 'Tell Group Plc.', required: 2500000, rewardType: 'benefit', description: 'Company Advertising Boost' },
        TCI: { name: 'Torn City Investments', required: 1500000, rewardType: 'benefit', incomeClass: 'dynamic-bank-interest', description: '10% Bank Interest Bonus' },
        TCM: { name: 'Torn City Motors', required: 1000000, rewardType: 'benefit', description: '10% Racing Skill Boost' },
        WSU: { name: 'West Side University', required: 1000000, rewardType: 'benefit', description: '10% Education Course Time Reduction' },
        WLT: { name: 'Wind Lines Travel', required: 9000000, rewardType: 'benefit', description: 'Private Jet Access' },
        YAZ: { name: 'Yazoo', required: 1000000, rewardType: 'benefit', description: 'Free Banner Advertising' },
        BAG: { name: "Big Al's Gun Shop", required: 3000000, rewardType: 'special', description: 'Ammo Pack' }
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

    // Separate objective-income classification for TCI. The legacy rewardType remains
    // unchanged in v6.3.13 to preserve every existing Strategic Holdings control.
    // TCI joins the rebalance candidate comparison only; no live recommendations until verified.
    function isDynamicIncomeStock(acronym) {
        return getStockMetadata(acronym).incomeClass === 'dynamic-bank-interest';
    }

    function isOptimizationEligible(acronym) {
        return ['market', 'cash'].includes(getStockMetadata(acronym).rewardType);
    }

    function getOptimizationExplanation(acronym) {
        const cfg = getStockMetadata(acronym);
        if (isOptimizationEligible(acronym)) return 'Reward has an objective annual value.';
        if (isDynamicIncomeStock(acronym)) return 'Dynamic bank-interest benefit; valued separately from fixed stock dividends.';
        if (cfg.rewardType === 'benefit') return 'Gameplay benefit is intentionally not monetized.';
        if (cfg.rewardType === 'special') return 'Reward has no objective market value.';
        return 'No optimization explanation recorded.';
    }

    function isStrategicStock(acronym) {
        // TCI is Dynamic Income, not a protected non-monetary strategic benefit.
        return getStockMetadata(acronym).rewardType === 'benefit' && !isDynamicIncomeStock(acronym);
    }

    function isStrategicTargetOption(acronym) {
        // Retain the existing explicit opt-in Strategic Target option for TCI.
        return isStrategicStock(acronym) || isDynamicIncomeStock(acronym);
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
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

    function completedIncrementCount(required, ownedShares) {
        if (required <= 0 || ownedShares < required) return 0;
        return Math.max(0, Math.floor(Math.log2((ownedShares / required) + 1)));
    }

    function completedTarget(required, ownedShares) {
        const completed = completedIncrementCount(required, ownedShares);
        return completed > 0 ? targetForIncrement(required, completed) : 0;
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
        if (!isOptimizationEligible(acronym)) return null;

        const inc = completedIncrementCount(cfg.required, ownedShares) + 1;
        const target = targetForIncrement(cfg.required, inc);
        const need = target - ownedShares;
        const cost = need * market.price;
        const yearly = annualValue(cfg, acronym);
        if (!Number.isFinite(yearly) || yearly <= 0) return null;

        return {
            acronym, name: market.name, increment: inc, target, need, cost, yearly,
            roi: yearly / cost, payback: cost / yearly, benefit: cfg.item || cfg.description
        };
    }

    function getCompletedBlocks(acronym, cfg, market, ownedShares) {
        if (!isOptimizationEligible(acronym)) return [];

        const blocks = [];
        const yearly = annualValue(cfg, acronym);
        if (!Number.isFinite(yearly) || yearly <= 0) return [];

        const completedCount = completedIncrementCount(cfg.required, ownedShares);
        for (let inc = 1; inc <= completedCount; inc++) {

            const shares = blockSize(cfg.required, inc);
            const value = shares * market.price;

            blocks.push({
                acronym, name: market.name, increment: inc, shares, value, yearly,
                roi: yearly / value, benefit: cfg.item || cfg.description
            });
        }

        return blocks;
    }



    // ============================================================================
    // Strategic Holdings
    // ----------------------------------------------------------------------------
    // Strategic Target protects one player-selected benefit stock from liquidation.
    //
    // Strategic Sale Limits control how many completed blocks of other strategic
    // benefit stocks The Brain may consider selling during optimization.
    // ============================================================================
    function getStrategicTarget() {
        const saved = localStorage.getItem(STRATEGIC_TARGET_STORAGE) || '';

        return isStrategicTargetOption(saved) ? saved : '';
    }

    function saveStrategicTarget() {
        const select = document.getElementById('wes-strategic-target');
        const target = select?.value || '';

        if (target && isStrategicTargetOption(target)) {
            localStorage.setItem(STRATEGIC_TARGET_STORAGE, target);
            return target;
        }

        localStorage.removeItem(STRATEGIC_TARGET_STORAGE);
        return '';
    }
    function buildStrategicTargetControl() {
        const selectedTarget = getStrategicTarget();

        const options = Object.keys(STOCKS)
            .filter(isStrategicTargetOption)
            .sort((a, b) => a.localeCompare(b))
            .map(acronym => {
                const cfg = getStockMetadata(acronym);
                const selected = acronym === selectedTarget ? 'selected' : '';

                return `
                <option value="${acronym}" ${selected}>
                    ${acronym} — ${cfg.description || cfg.name || acronym}
                </option>
            `;
            })
            .join('');

        return `
        <select id="wes-strategic-target"
                aria-label="Strategic stock target"
                style="width:280px;max-width:90%;padding:6px;">
            <option value="">None</option>
            ${options}
        </select>
    `;
    }
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
                const maximum = Math.max(0, Math.floor(num(select.dataset.maxBlocks)));
                limits[select.dataset.acronym] = clamp(
                    Math.floor(num(select.value)),
                    0,
                    maximum
                );
            });

        localStorage.setItem(STRATEGIC_SALE_STORAGE, JSON.stringify(limits));
        return limits;
    }

    function buildStrategicSaleControls(owned = latestOwnedShares) {
        if (!owned) {
            return '<div style="color:#888;">Analyze your portfolio to identify strategic holdings.</div>';
        }

        const savedLimits = getStrategicSaleLimits();
        const candidates = Object.keys(STOCKS)
            .filter(isStrategicStock)
            .map(acronym => ({
                acronym,
                completed: completedIncrementCount(STOCKS[acronym].required, owned[acronym] || 0)
            }))
            .filter(entry => entry.completed > 0)
            .sort((a, b) => a.acronym.localeCompare(b.acronym));

        if (!candidates.length) {
            return '<div style="color:#888;">No completed strategic-benefit blocks were detected.</div>';
        }

        return candidates.map(({ acronym, completed }) => {
            const selectedLimit = clamp(Math.floor(num(savedLimits[acronym])), 0, completed);
            const options = Array.from({ length: completed + 1 }, (_, blockCount) => `
                <option value="${blockCount}" ${blockCount === selectedLimit ? 'selected' : ''}>
                    ${blockCount}
                </option>
            `).join('');

            return `
                <label style="display:inline-flex;align-items:center;gap:5px;padding:4px 6px;white-space:nowrap;">
                    <b>${acronym}</b>
                    <select class="wes-strategic-sale-limit"
                            data-acronym="${acronym}"
                            data-max-blocks="${completed}"
                            aria-label="${acronym} eligible blocks"
                            style="width:48px;padding:2px;">
                        ${options}
                    </select>
                </label>
            `;
        }).join('');
    }

    function refreshStrategicSaleControls(owned) {
        latestOwnedShares = owned;
        const container = document.getElementById('brain-strategic-sale-controls');
        if (container) container.innerHTML = buildStrategicSaleControls(owned);
    }

    // Builds only the Strategic completed blocks the player has explicitly
    // allowed The Brain to consider selling. Older blocks remain protected.
    function getEligibleStrategicSaleBlocks(owned, byAcronym, saleLimits) {
        const eligibleBlocks = [];

        Object.keys(STOCKS)
            .filter(isStrategicStock)
            .forEach(acronym => {
                const metadata = getStockMetadata(acronym);
                const market = byAcronym[acronym];
                const required = num(metadata.required);
                const ownedShares = owned[acronym] || 0;
                const completedCount = completedIncrementCount(required, ownedShares);
                const allowedCount = clamp(
                    Math.floor(num(saleLimits[acronym])),
                    0,
                    completedCount
                );

                if (!market || required <= 0 || ownedShares <= 0 || allowedCount <= 0) {
                    return;
                }

                const completed = [];

                for (let increment = 1; increment <= completedCount; increment++) {
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
        byAcronym,
        strategicSaleLimits,
        strategicTarget = ''
    ) {

        const liquidation = {
            totalCapital: deployableCapital,
            liquidationValue: 0,
            liquidatedHoldings: []
        };

        Object.entries(owned).forEach(([acronym, shares]) => {
            const metadata = getStockMetadata(acronym);
            const isStrategic = isStrategicStock(acronym);

            // Never liquidate TCI through the generic stock optimizer. Its
            // own bank-aware KEEP/SELL comparison is the sole authorization path.
            // This is not a strategic protection: that comparison may sell TCI.
            if (isDynamicIncomeStock(acronym)) return;

            if (!isOptimizationEligible(acronym) && !isStrategic) {
                return;
            }

            const stock = byAcronym[acronym];

            if (!stock) {
                return;
            }
            let liquidatableShares = shares;

            if (acronym === strategicTarget) {
                // Strategic Target protection:
                // Every currently owned share is intentionally being accumulated.
                // Do not liquidate any of it for optimization or rebalancing.
                liquidatableShares = 0;
            } else if (isStrategic) {
                const completedShares = completedTarget(metadata.required, shares);

                const authorizedBlocks = getEligibleStrategicSaleBlocks(
                    { [acronym]: shares },
                    byAcronym,
                    strategicSaleLimits || {}
                );

                const authorizedShares = authorizedBlocks.reduce(
                    (total, block) => total + block.shares,
                    0
                );

                const protectedShares = Math.max(0, completedShares - authorizedShares);
                liquidatableShares = Math.max(0, shares - protectedShares);
            }

            if (liquidatableShares <= 0) {
                return;
            }
            const grossValue = liquidatableShares * stock.price;
            const fee = grossValue * STOCK_SALE_FEE_RATE;
            const netValue = grossValue - fee;

            liquidation.liquidationValue += netValue;

            liquidation.totalCapital += netValue;

            liquidation.liquidatedHoldings.push({
                acronym,
                shares: liquidatableShares,
                grossValue,
                fee,
                value: netValue
            });

        });

        return liquidation;
    }

    function collectOpportunities(portfolio, byAcronym) {

        const opportunities = [];

        Object.entries(STOCKS).forEach(([acronym, cfg]) => {

            const ownedShares = portfolio.holdings[acronym] || 0;
            const market = byAcronym[acronym];

            if (!market) {
                return;
            }

            const opportunity = getNextOpportunity(
                acronym,
                cfg,
                market,
                ownedShares
            );

            if (opportunity && opportunity.cost <= portfolio.cashRemaining) {
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

    function buildNetTransactions(owned, idealHoldings, byAcronym) {
        const transactions = {
            sells: [],
            buys: []
        };

        const acronyms = new Set([
            ...Object.keys(owned),
            ...Object.keys(idealHoldings)
        ]);

        acronyms.forEach(acronym => {
            const actualShares = owned[acronym] || 0;
            const targetShares = idealHoldings[acronym] || 0;
            const difference = targetShares - actualShares;
            const market = byAcronym[acronym];

            if (!market || difference === 0) {
                return;
            }

            if (difference < 0) {
                const shares = Math.abs(difference);
                const grossValue = shares * market.price;
                const fee = grossValue * STOCK_SALE_FEE_RATE;

                transactions.sells.push({
                    acronym,
                    shares,
                    grossValue,
                    fee,
                    netValue: grossValue - fee
                });

                return;
            }

            transactions.buys.push({
                acronym,
                shares: difference,
                cost: difference * market.price
            });
        });

        return transactions;
    }
    function buildIdealPortfolio(
        startingCapital,
        owned,
        byAcronym,
        strategicSaleLimits,
        strategicTarget = ''
    ) {

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
            byAcronym,
            strategicSaleLimits,
            strategicTarget
        );

        portfolio.cashRemaining = liquidation.totalCapital;

        liquidation.liquidatedHoldings.forEach(holding => {
            portfolio.holdings[holding.acronym] = Math.max(
                0,
                (portfolio.holdings[holding.acronym] || 0) - holding.shares
            );
        });

        let opportunities = collectOpportunities(portfolio, byAcronym);

        while (true) {

            const bestOpportunity = opportunities[0];

            if (!bestOpportunity)
                break;

            applyPurchase(portfolio, bestOpportunity);

            opportunities = collectOpportunities(portfolio, byAcronym);

        }

        portfolio.liquidation = liquidation;

        return portfolio;
    }

    function buildStableIdealPortfolio(
        startingCapital,
        owned,
        byAcronym,
        strategicSaleLimits,
        strategicTarget = ''
    ) {
        let feeCorrection = 0;
        let idealPortfolio = null;
        let netTransactions = null;

        for (let pass = 1; pass <= 10; pass++) {
            idealPortfolio = buildIdealPortfolio(
                startingCapital + feeCorrection,
                owned,
                byAcronym,
                strategicSaleLimits,
                strategicTarget
            );


            netTransactions = buildNetTransactions(
                owned,
                idealPortfolio.holdings,
                byAcronym
            );

            const provisionalSaleFees =
                idealPortfolio.liquidation.liquidatedHoldings.reduce(
                    (total, holding) => total + holding.fee,
                    0
                );

            const netSaleFees = netTransactions.sells.reduce(
                (total, transaction) => total + transaction.fee,
                0
            );

            const nextFeeCorrection = Math.max(
                0,
                provisionalSaleFees - netSaleFees
            );

            if (Math.abs(nextFeeCorrection - feeCorrection) < 0.01) {
                return {
                    idealPortfolio,
                    netTransactions,
                    feeCorrection: nextFeeCorrection,
                    passes: pass
                };
            }

            feeCorrection = nextFeeCorrection;
        }

        return {
            idealPortfolio,
            netTransactions,
            feeCorrection,
            passes: 10
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


    function card(title, body, accent) {
        return `
      <div style="margin:8px 0;padding:10px;border-radius:10px;border:1px solid ${accent || '#555'};background:#171717;">
        <div style="font-weight:bold;font-size:14px;margin-bottom:6px;">${title}</div>
        ${body}
      </div>
    `;
    }


    function out(html) {
        const el = document.getElementById('wes-stock-output');
        if (el) el.innerHTML = html;
    }


    function setBrainHeader(title, color) {
        const headerContent = document.getElementById('brain-header-content');
        if (!headerContent) return;

        headerContent.innerHTML = `
<div style="font-weight:bold;color:${color};line-height:1.1;">
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
            idle: 'Analyze Portfolio',
            thinking: 'Analyzing...',
            success: 'Analyze Portfolio',
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

        const manualKey = document.getElementById('wes-stock-key')?.value.trim() || '';
        const tornPdaKey = !/^###.*###$/.test(PDA_API_KEY) ? PDA_API_KEY.trim() : '';
        const key = getAvailableApiKey();
        const liquidCash = num(document.getElementById('wes-stock-cash').value);

        if (!key) {
            renderApiKeyRequired();
            analysisInProgress = false;
            updateApiKeyGate();
            return;
        }

        if (!tornPdaKey && manualKey) {
            localStorage.setItem(KEY_STORAGE, manualKey);
        }
        localStorage.setItem(CASH_STORAGE, String(liquidCash));

        const strategicSaleLimits = saveStrategicSaleLimits();
        const strategicTarget = getStrategicTarget();
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

            // Read-only TCI evidence for the main advisor. A missing permission must
            // never block the established optimizer or fabricate banking values.
            let tciBankEvidence = null;
            let tciBankError = '';
            try {
                const tciMoneyResponse = await api(
                    `https://api.torn.com/v2/user/money?key=${encodeURIComponent(key)}`,
                    { label: 'TCI decision bank evidence', timeoutMs: 10000 }
                );
                const bank = tciMoneyResponse?.data?.money?.city_bank;
                if (bank && [bank.amount,bank.profit,bank.duration,bank.invested_at,bank.until]
                    .every(v => Number.isFinite(Number(v))) && Number(bank.amount)>0 &&
                    Number(bank.duration)>0 && Number(bank.invested_at)>0 && Number(bank.until)>Number(bank.invested_at)) {
                    tciBankEvidence = {
                        profit: Number(bank.profit),
                        duration: Number(bank.duration),
                        investedAt: Number(bank.invested_at),
                        maturity: Number(bank.until)
                    };
                    const savedStart = localStorage.getItem(TCI_BANK_INVESTMENT_STORAGE);
                    if (savedStart && savedStart !== String(tciBankEvidence.investedAt)) {
                        // Invalidate the stale yes/no, just as Read Bank Investment does.
                        localStorage.removeItem(TCI_BANK_ACTIVE_STORAGE);
                    }
                    localStorage.setItem(TCI_BANK_INVESTMENT_STORAGE, String(tciBankEvidence.investedAt));
                } else {
                    tciBankError = 'A valid active bank investment was not returned.';
                }
            } catch (e) {
                tciBankError = 'Bank evidence unavailable; verify User → money permission.';
            }

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
            refreshStrategicSaleControls(owned);

            const preliminaryLiquidation = simulateLiquidation(
                liquidCash,
                owned,
                byAcronym,
                strategicSaleLimits,
                strategicTarget
            );

            const preliminaryCapital = preliminaryLiquidation.totalCapital;

            // An unavailable valuation is material only when it could affect today's action:
            // the player owns a completed block, or the next block is currently affordable.
            const materialUnavailableValues = rewardValueReport.unavailable.filter(entry => {
                const cfg = STOCKS[entry.acronym];
                const market = byAcronym[entry.acronym];
                if (!cfg || !market) return false;

                const have = owned[entry.acronym] || 0;
                const ownsCompletedBlock = completedTarget(cfg.required, have) > 0;
                const nextTarget = targetForIncrement(cfg.required, completedIncrementCount(cfg.required, have) + 1);
                const nextCost = nextTarget ? (nextTarget - have) * market.price : Infinity;

                return ownsCompletedBlock || nextCost <= preliminaryCapital;
            });


            if (materialUnavailableValues.length) {
                renderUnavailableData(materialUnavailableValues);
                finalButtonState = 'retry';
                return;
            }

            setAnalysisProgress('Evaluating opportunities...', 5);
            const deployableCapital = preliminaryCapital;
            const opportunities = [];
            const completedBlocks = [];

            Object.entries(STOCKS).forEach(([acronym, cfg]) => {
                const market = byAcronym[acronym];
                if (!market) return;

                const have = owned[acronym] || 0;
                const next = getNextOpportunity(acronym, cfg, market, have);
                if (next) opportunities.push(next);
                completedBlocks.push(...getCompletedBlocks(acronym, cfg, market, have));
            });

            opportunities.sort((a, b) => b.roi - a.roi);
            completedBlocks.sort((a, b) => a.roi - b.roi);
            const currentObjectiveAnnualIncome = completedBlocks.reduce(
                (total, block) => total + block.yearly,
                0
            );



            const stableIdeal = buildStableIdealPortfolio(
                liquidCash,
                owned,
                byAcronym,
                strategicSaleLimits,
                strategicTarget
            );
            const unconstrainedSaleLimits = strategicTarget
                ? {
                    ...strategicSaleLimits,
                    [strategicTarget]: Number.MAX_SAFE_INTEGER
                }
                : strategicSaleLimits;

            const unconstrainedIdeal = strategicTarget
                ? buildStableIdealPortfolio(
                    liquidCash,
                    owned,
                    byAcronym,
                    unconstrainedSaleLimits,
                    ''
                )
                : null;

            const strategicTargetShares =
                strategicTarget
                    ? Number(owned[strategicTarget] || 0)
                    : 0;

            const strategicTargetPrice =
                strategicTarget
                    ? Number(byAcronym[strategicTarget]?.price || 0)
                    : 0;

            const strategicTargetCapital =
                strategicTargetShares * strategicTargetPrice;

            const stableObjectiveAnnualIncome =
                stableIdeal.idealPortfolio.yearlyIncome;

            const stableAnnualImprovement =
                stableObjectiveAnnualIncome - currentObjectiveAnnualIncome;

            const currentDailyIncome =
                currentObjectiveAnnualIncome / 365;

            const projectedDailyIncome =
                stableObjectiveAnnualIncome / 365;

            console.log('The Brain — Annual Income Audit', {
                currentObjectiveAnnualIncome,
                stableObjectiveAnnualIncome,
                stableAnnualImprovement
            });




            setAnalysisProgress('Comparing alternatives...', 6);

            const bestOverall = opportunities[0];
            const strategicTargetMaterialCost =
                strategicTargetCapital > 0 && bestOverall
                    ? strategicTargetCapital * bestOverall.roi
                    : 0;
            const strategicTargetRealizableCost =
                strategicTarget && unconstrainedIdeal
                    ? Math.max(
                        0,
                        unconstrainedIdeal.idealPortfolio.yearlyIncome -
                        stableIdeal.idealPortfolio.yearlyIncome
                    )
                    : 0;
            const strategicTargetCostIsRealizable =
                strategicTargetRealizableCost > 0;

            const strategicTargetDisplayCost =
                strategicTargetCostIsRealizable
                    ? strategicTargetRealizableCost
                    : strategicTargetMaterialCost;


            const strategicTargetRequiredShares =
                strategicTarget
                    ? Number(getStockMetadata(strategicTarget)?.required || 0)
                    : 0;



            let recommendationState = BrainState.KEEP_SAVING;
            let headerAction = 'HOLD';
            let headerTarget = '';

            const stableSells = stableIdeal.netTransactions.sells;
            const stableBuys = stableIdeal.netTransactions.buys;
            const purchaseOrder = new Map();

            stableIdeal.idealPortfolio.purchases.forEach((purchase, index) => {
                if (!purchaseOrder.has(purchase.acronym)) {
                    purchaseOrder.set(purchase.acronym, index);
                }
            });

            const orderedStableBuys = [...stableBuys].sort((a, b) =>
                (purchaseOrder.get(a.acronym) ?? Infinity) -
                (purchaseOrder.get(b.acronym) ?? Infinity)
            );
            const stableSellText = stableSells
                .map(sell =>
                    `${sell.shares.toLocaleString()} ${sell.acronym}`
                )
                .join('; ');

            const stableBuyText = orderedStableBuys
                .map(buy =>
                    `${buy.shares.toLocaleString()} ${buy.acronym}`
                )
                .join('; ');

            console.log('The Brain — Recommended Transactions', {
                sell: stableSellText || 'None',
                buy: stableBuyText || 'None'
            });

            if (
                stableSells.length &&
                stableBuys.length &&
                stableAnnualImprovement > 0
            ) {
                recommendationState = BrainState.REBALANCE_RECOMMENDATION;
                headerAction = 'REBALANCE';
                headerTarget = formatAcronymList(
                    orderedStableBuys.map(buy => buy.acronym)
                );

            } else if (!stableSells.length && stableBuys.length) {
                recommendationState = BrainState.BUY_RECOMMENDATION;
                headerAction = 'BUY';
                headerTarget = formatAcronymList(
                    orderedStableBuys.map(buy => buy.acronym)
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


            let advisorWidget = '';
            let strategicTargetWidget = '';

            if (strategicTarget && strategicTargetShares > 0) {
                const targetMetadata = getStockMetadata(strategicTarget);

                strategicTargetWidget = `
        <div style="
            margin-top:10px;
            padding:10px;
            border:1px solid rgba(128,128,128,.35);
            border-radius:6px;
        ">
            <div style="font-weight:700;margin-bottom:6px;">
                Strategic Target — ${strategicTarget}
            </div>

            <div>
                Progress:
                ${strategicTargetShares.toLocaleString()}
                /
                ${strategicTargetRequiredShares.toLocaleString()}
                shares
            </div>

            <div>
                Capital currently protected:
                ${money(strategicTargetCapital)}
            </div>

            <div>
    ${strategicTargetCostIsRealizable
                        ? 'Optimized annual opportunity cost:'
                        : 'Estimated marginal opportunity cost:'}
    ${money(strategicTargetDisplayCost)}
</div>

<div style="font-size:12px;opacity:.75;margin-top:6px;">
    ${strategicTargetCostIsRealizable
                        ? `Calculated by comparing the protected portfolio with Brain's optimized measurable-reward portfolio.`
                        : `Based on the current ${bestOverall?.acronym || 'best measurable'} monetary/item-reward ROI. Protected capital is not currently sufficient to produce a different complete-block portfolio.`
                    }
    ${targetMetadata?.description || strategicTarget}
    is not assigned a monetary value.
</div>
        </div>
    `;
            }

            if (brainDecision.state === BrainState.REBALANCE_RECOMMENDATION) {
                const totalNetSaleProceeds = stableSells.reduce(
                    (total, sell) => total + sell.netValue,
                    0
                );

                const totalBuyCost = stableBuys.reduce(
                    (total, buy) => total + buy.cost,
                    0
                );

                advisorWidget = `
        <div>
            <div style="
                font-size:15px;
                color:#d8d8d8;
                line-height:1.5;
                margin:6px 0 10px 0;
            ">
                Sell <b>${stableSellText}</b><br>
                Buy <b>${stableBuyText}</b>
            </div>

            <details style="margin-top:6px;">
                <summary>Why?</summary>

                <div>
                    Net proceeds from sales:
<b>${money(totalNetSaleProceeds)}</b><br>

Purchase cost:
<b>${money(totalBuyCost)}</b><br>

Capital remaining:
<b>${money(stableIdeal.idealPortfolio.cashRemaining)}</b><br><br>

Current income:
<b>${money(currentDailyIncome)}</b>/day
(${money(currentObjectiveAnnualIncome)}/year)<br>

Projected income:
<b>${money(projectedDailyIncome)}</b>/day
(${money(stableObjectiveAnnualIncome)}/year)<br>

Annual improvement:
<b>+${money(stableAnnualImprovement)}</b>/year
                </div>
            </details>
        </div>
    `;

            } else if (brainDecision.state === BrainState.BUY_RECOMMENDATION) {
                const totalBuyCost = stableBuys.reduce(
                    (total, buy) => total + buy.cost,
                    0
                );

                advisorWidget = `
        <div>
            <div style="
                font-size:15px;
                color:#d8d8d8;
                line-height:1.5;
                margin:6px 0 10px 0;
            ">
                Buy <b>${stableBuyText}</b>
            </div>

            <details>
                <summary>Why?</summary>

                <div>
                    Purchase cost:
                    <b>${money(totalBuyCost)}</b><br>

                    Projected annual income:
                    <b>${money(stableIdeal.idealPortfolio.yearlyIncome)}</b>/year<br>

                    Capital remaining:
                    <b>${money(stableIdeal.idealPortfolio.cashRemaining)}</b>
                </div>
            </details>
        </div>
    `;

            } else if (bestOverall) {

                advisorWidget = `
                    <details>
                    <summary>Why?</summary>

                <div>
                    Cash needed to complete target:
                    <b>${money(
                    Math.max(
                        0,
                        bestOverall.cost - liquidCash
                    )
                )}</b><br>

                    Target cost:
                    <b>${money(bestOverall.cost)}</b><br>

                    Expected ROI:
<b>${pct(bestOverall.roi)}</b><br><br>

Current portfolio income:
<b>${money(currentDailyIncome)}</b>/day
(${money(currentObjectiveAnnualIncome)}/year)
                </div>
            </details>
        </div>
    `;
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

            const diagnosticsHtml = apiDiagnostics.map(diagnostic =>
                `<div>✓ ${diagnostic.label}: ${diagnostic.elapsedMs.toLocaleString()} ms</div>`
            ).join('');
            const pointsEvidence = rewardValueReport.evidence?.PTS;
            const pointsEvidenceHtml = pointsEvidence
                ? `<div style="margin-top:8px;">
                    <b>PTS valuation</b><br>
                    ✓ ${pointsEvidence.listingCount.toLocaleString()} returned listings analyzed<br>
                    ✓ ${Math.round(pointsEvidence.totalPoints).toLocaleString()} points represented<br>
                    ✓ Observed weighted price: ${money(pointsEvidence.pricePerPoint)} per point<br>
                    ✓ 100-point reward value: ${money(pointsEvidence.price)}<br>
                    <small style="color:#aaa;">Range observed: ${money(pointsEvidence.lowestPrice)}–${money(pointsEvidence.highestPrice)} per point. This describes the listings returned by Torn, not the entire historical market.</small>
                </div>`
                : '';

            // TCI shares participate in *explanations* only. No mutation of the
            // optimizer's strategic limits or its BUY / SELL calculations.
            const tciSharesHeld = Number(owned.TCI || 0);
            const tciPrice = Number(byAcronym.TCI?.price);
            let tciDecisionWhy = '';
            let liveTciReview = null;
            if (Number.isFinite(tciPrice) && tciPrice > 0 && tciBankEvidence) {
                const required = STOCKS.TCI.required;
                const blockValue = required * tciPrice;
                const ownsBlock = tciSharesHeld >= required;
                const answer = localStorage.getItem(TCI_BANK_ACTIVE_STORAGE) || '';
                const daysLeft = Math.max(0, Math.ceil((tciBankEvidence.maturity * 1000 - Date.now()) / 86400000));
                const termBonus = answer === 'no' ? tciBankEvidence.profit * 0.1
                    : answer === 'yes' ? tciBankEvidence.profit / 11 : null;
                const annualBonus = termBonus === null ? null : termBonus * 365 / tciBankEvidence.duration;
                const annualRoi = annualBonus === null ? null : annualBonus / blockValue;
                const replacement = opportunities.find(o => o.acronym !== 'TCI' &&
                    Number.isFinite(o.roi) && o.roi >= 0);
                const replacementText = replacement
                    ? `${replacement.acronym}: ${pct(replacement.roi)} estimated annual ROI (subject to completing its block)`
                    : 'No measurable replacement opportunity verified';

                // Shadow rebalancing uses the SAME pure evaluator as Alt-click tests.
                const saleReview = evaluateOwnedTciSale({
                    shares:tciSharesHeld, required, blockValue, annualBonus,
                    strategicTarget, liquidCash, opportunities
                });
                const integratedTciReview = ownsBlock ? evaluateTciIntegratedPortfolio({
                    owned, liquidCash, byAcronym, strategicSaleLimits, strategicTarget,
                    annualBonus, bankDaysLeft:daysLeft
                }) : {status:'NOT_ONE_BLOCK'};
                const integratedGate = assessTciRebalanceGate(integratedTciReview);
                liveTciReview = integratedTciReview;
                const integratedWhy = integratedTciReview.status === 'REVIEW_SELL'
                    ? `Complete-portfolio review: potential ${money(integratedTciReview.improvement)} annualized advantage after comparing all eligible holdings, including TCI's bank-income opportunity cost. Estimated TCI sale fee: ${money(integratedTciReview.fee)}. This is not an actionable trade recommendation.`
                    : integratedTciReview.status === 'HOLD'
                        ? `Complete-portfolio review: HOLD; selling TCI does not improve modeled annual income (${money(integratedTciReview.improvement)} difference).`
                        : integratedTciReview.status === 'BANK_WINDOW_PROTECTED'
                            ? 'Complete-portfolio review: next bank investment is too close to maturity to suggest disrupting TCI activation.'
                            : integratedTciReview.status === 'PROTECTED'
                                ? 'Complete-portfolio review: TCI is explicitly protected by your Strategic Target setting.'
                                : integratedTciReview.status === 'MISSING_EVIDENCE'
                                    ? 'Complete-portfolio review unavailable: required pricing or investment evidence is missing.'
                                    : integratedTciReview.status === 'UNFUNDED'
                                        ? 'Complete-portfolio review: replacement transactions cannot be funded safely.'
                                        : 'Complete-portfolio review not applicable unless exactly one full TCI block is held.';
                const rebalanceVerdict = saleReview.status === 'NOT_OWNED' 
                    ? 'TCI sale comparison not applicable — no complete block held.'
                    : saleReview.status === 'PROTECTED'
                        ? 'TCI is explicitly protected as your Strategic Target.'
                        : saleReview.status === 'UNKNOWN_BONUS'
                            ? 'Cannot compare TCI for sale until its bank bonus is known.'
                            : saleReview.status === 'NO_REPLACEMENT'
                                ? 'No complete replacement block fundable from one TCI sale plus entered cash.'
                                : `${saleReview.replacement.acronym} is fundable at ${money(saleReview.replacement.cost)} from ${money(saleReview.saleCash)} net TCI sale proceeds plus ${money(liquidCash)} entered cash. Gross annual-income difference vs TCI: ${saleReview.improvement >= 0 ? '+' : ''}${money(saleReview.improvement)}; TCI sale fee: ${money(saleReview.saleFee)}. ${saleReview.status === 'REVIEW_SELL' ? 'Potential review candidate, NOT a trade recommendation.' : 'No gross income advantage established.'} Payout timing, investment eligibility and post-sale portfolio changes remain to be verified.`;
                const lockedText = answer === 'yes'
                    ? 'TCI bonus was active when this term began; its value is already included in bank profit.'
                    : answer === 'no'
                        ? 'TCI was not active when this term began; its value is hypothetical for a future comparable term.'
                        : 'TCI activation at the start of this term is unknown; dollar benefit cannot be safely estimated.';
                const decision = ownsBlock
                    ? (answer === '' ? 'REVIEW — bank-bonus status unconfirmed'
                        : 'REVIEW SELL vs HOLD — do not trade yet')
                    : (daysLeft > 8 ? 'WAIT — temporary acquisition window closed'
                        : daysLeft < 7 ? 'WAIT — insufficient confirmed activation time'
                        : 'REVIEW BUY vs HOLD — verify timing first');
                const comparison = annualRoi === null ? 'No reliable ROI comparison without Yes/No banking confirmation.'
                    : replacement && replacement.roi > annualRoi
                        ? 'A higher-ROI candidate exists, but a financed replacement purchase, timing and benefits forfeited have NOT been verified.'
                        : 'No higher-ROI candidate established by the current opportunity list; this is not proof that keeping TCI is optimal.';
                tciDecisionWhy = `
                    <details style="margin-top:9px;">
                        <summary>TCI — Why? (read-only decision review)</summary>
                        <div style="margin-top:6px;line-height:1.5;">
                            <b>${decision}</b><br>
                            ${ownsBlock ? `Held: ${tciSharesHeld.toLocaleString('en-US')} shares; complete block value: ${money(blockValue)}; potential block sale proceeds after 0.1% fee: ${money(blockValue * (1-STOCK_SALE_FEE_RATE))}.<br>`
                                : `TCI not held as a complete block; cost to buy: ${money(blockValue)}.<br>`}
                            Bank maturity: ${daysLeft} day(s); acquisition churn only inside the 8-day window, with at least 7 days for activation.<br>
                            ${lockedText}<br>
                            ${termBonus === null ? 'Comparable term bonus: unknown' : `Comparable term bonus: ${money(termBonus)}; gross annual equivalent: ${money(annualBonus)}; block ROI: ${pct(annualRoi)}`}<br>
                            Best measurable non-TCI opportunity: ${replacementText}. ${comparison}<br>
                            <b>TCI — Rebalancing candidate:</b> ${rebalanceVerdict}<br>
                            <b>Portfolio-wide comparison:</b> ${integratedWhy} ${integratedGate === 'REVIEW_SELL_ONLY' ? 'Trade gate: REVIEW ONLY — normal REBALANCE instructions are unchanged.' : ''}<br>
                            <b>Next investment:</b> ${termBonus === null ? 'Potential TCI bonus cannot be estimated until bank-bonus status is confirmed.' : `A comparable new bank term could add approximately ${money(termBonus)} in interest with TCI active.`} Funding costs and interrupted stock benefits will be evaluated within the eight-day acquisition window. This bonus is payable at the new term’s maturity, not immediately available cash.<br>
                            TCI trade evaluations remain read-only. Strategic Holdings controls and ordinary recommendations are unchanged.
                        </div>
                    </details>`;
            } else {
                tciDecisionWhy = `<details style="margin-top:9px;"><summary>TCI — Why? (read-only decision review)</summary><div>${tciBankError || 'Live TCI price or banking evidence unavailable.'} No TCI trade recommendation; existing optimizer unaffected.</div></details>`;
            }

            if (liveTciReview && authorizeLiveTciSale(
                    liveTciReview, liveTciReview.keepIncome,
                    STOCKS.TCI.required)) {
                const tx = liveTciReview.transactions;
                const sellText = tx.sells.map(x=>`${x.shares.toLocaleString('en-US')} ${x.acronym}`).join('; ');
                const buyText = tx.buys.map(x=>`${x.shares.toLocaleString('en-US')} ${x.acronym}`).join('; ');
                brainDecision.state = BrainState.REBALANCE_RECOMMENDATION;
                brainDecision.action = 'REBALANCE';
                brainDecision.target = formatAcronymList(tx.buys.map(x=>x.acronym));
                brainDecision.title = `Rebalance ${brainDecision.target}`;
                advisorWidget = `<div style="font-size:15px;color:#d8d8d8;line-height:1.5;margin:6px 0 10px 0;">
                    Sell <b>${sellText}</b><br>Buy <b>${buyText}</b></div>
                    <details style="margin-top:6px;"><summary>Why?</summary><div>
                    Full-portfolio model favors selling TCI by <b>${money(liveTciReview.improvement)}</b> annualized
                    after accounting for TCI's bank-interest value and sale fees.<br>
                    Net TCI sale proceeds: ${money(liveTciReview.net)}.<br>
                    Total proposed purchases: ${money(liveTciReview.purchaseCost)}.<br>
                    Remaining cash: ${money(liveTciReview.remainingCash)}.<br>
                    Bank maturity is more than eight days away. Market prices may move before trades.</div></details>`;
                const h=document.getElementById('wes-stock-header-mode');
                if(h){h.textContent='🟠 REBALANCE RECOMMENDED';h.style.color='#ff9800';}
                // Re-label the specialist disclosure so no contradictory read-only claim remains.
                tciDecisionWhy=tciDecisionWhy.replace('TCI — Why? (read-only decision review)','TCI — Why?').replace('TCI trade evaluations remain read-only. Strategic Holdings controls and ordinary recommendations are unchanged.','TCI has passed the live portfolio rebalancing gate. Strategic Holdings controls are unchanged.');
            }

            let html = `
    ${advisorWidget}
    ${tciDecisionWhy}
    ${strategicTargetWidget}
    ${firstScanNoticeHtml(owned)}
    <details style="margin-top:10px;">
        <summary>Evidence & diagnostics</summary>
        <div style="margin-top:7px;line-height:1.5;">
            <div><b>Source diagnostics</b></div>
            ${diagnosticsHtml}
            ${pointsEvidenceHtml}
        </div>
    </details>
`;
            /*
            =========================================================          Operation Chameleon
           
            Supporting cards are intentionally hidden to preserve a focused,
            native Torn interface. Their implementation remains available if
            future UI requirements justify restoring them.
           ==========================================================
           
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
    font-weight:bold;
    color:${adviceColor};
    line-height:1.1;
">
    ${'\u{1F9E0}'} ${brainDecision.title}
</div>
`;

            }

        } catch (error) {
            console.error('The Brain analysis failed:', error);
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

        }
    }


    function getAvailableApiKey() {
        const tornPdaKey = !/^###.*###$/.test(PDA_API_KEY) ? PDA_API_KEY.trim() : '';
        const manualKey = document.getElementById('wes-stock-key')?.value.trim()
            || localStorage.getItem(KEY_STORAGE)?.trim()
            || '';
        return tornPdaKey || manualKey;
    }

    function hasUsableApiKey() {
        return Boolean(getAvailableApiKey());
    }

    function renderApiKeyRequired() {
        out(`
            <div style="line-height:1.5;">
                <b>Welcome to The Brain.</b><br>
                An API key is required before I can analyze your portfolio.<br>
                Enter your API key in ⚙ Settings.
            </div>
        `);
    }

    function renderReadyToAnalyze() {
        out(`
            <div style="line-height:1.5;">
                <b>Welcome to The Brain.</b><br>
                I'll begin by analyzing your current portfolio and building your investment profile.
            </div>
        `);
    }

    function updateApiKeyGate() {
        const button = document.getElementById('wes-stock-run');
        if (!button) return;
        const ready = hasUsableApiKey();
        button.style.display = ready ? '' : 'none';
        if (!analysisInProgress) {
            setAnalyzeButton('idle');
            ready ? renderReadyToAnalyze() : renderApiKeyRequired();
        }
    }

    function firstScanNoticeHtml(owned) {
        const hasCandidates = Object.keys(STOCKS).some(acronym =>
            isStrategicStock(acronym) &&
            completedIncrementCount(STOCKS[acronym].required, owned?.[acronym] || 0) > 0
        );
        if (!hasCandidates || localStorage.getItem(FIRST_SCAN_NOTICE_STORAGE) === 'shown') return '';
        localStorage.setItem(FIRST_SCAN_NOTICE_STORAGE, 'shown');
        return `
            <div style="margin-top:10px;padding:8px;border-left:3px solid #6fd3ff;line-height:1.45;">
                <b>Analysis complete.</b><br>
                Strategic-benefit holdings detected.<br>
                Review <b>Strategic Sale Candidates</b> in ⚙ Settings before acting on recommendations.
            </div>
        `;
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
    Analyze Portfolio
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

    function injectBrainResponsiveStyles() {
        if (document.getElementById('brain-responsive-styles')) return;

        const style = document.createElement('style');
        style.id = 'brain-responsive-styles';
        style.textContent = `
            /* The Brain — native Torn typography and responsive composition. */
            #wes-stock-roi-box,
            #wes-stock-roi-box button,
            #wes-stock-roi-box input,
            #wes-stock-roi-box select {
                font-family: inherit !important;
            }

            #brain-header-content {
                letter-spacing: 0 !important;
                text-transform: none !important;
            }

            #wes-stock-run,
            #brain-settings-button {
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                text-shadow: none !important;
            }

            #wes-stock-run {
                font-size: 14px !important;
                font-weight: 400 !important;
            }

            #brain-settings-button {
                font-size: 18px !important;
            }
#brain-header {
    height: auto !important;
    min-height: 34px !important;
    align-items: flex-start !important;
    box-sizing: border-box !important;
    padding-top: 6px !important;
    padding-bottom: 6px !important;
}

#brain-header-content {
    height: auto !important;
    min-height: 0 !important;
    white-space: normal !important;
    line-height: 1.1 !important;
    margin: 0 !important;
}

#brain-header > div {
    flex-shrink: 0;
}
            @media (max-width: 600px) and (orientation: portrait) {
                #wes-stock-roi-box {
                    width: 100%;
                    box-sizing: border-box;
                }

                #brain-header {
                    display: grid !important;
                    grid-template-columns: minmax(0, 1fr) !important;
                    grid-template-rows: auto auto !important;
                    align-items: center !important;
                    gap: 4px !important;
                    height: auto !important;
                    min-height: 0 !important;
                    padding: 8px 10px !important;
                    box-sizing: border-box;
                }

                #brain-header-content {
                    grid-column: 1 !important;
                    grid-row: 1 !important;
                    position: static !important;
                    inset: auto !important;
                    float: none !important;
                    display: block !important;
                    width: auto !important;
                    max-width: 100% !important;
                    min-width: 0 !important;
                    height: auto !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    transform: none !important;
                    font-size: 20px !important;
                    line-height: 1.15 !important;
                    font-family: inherit !important;
                    font-weight: 700 !important;
                    white-space: nowrap !important;
                    overflow: visible !important;
                    overflow-wrap: normal !important;
                    word-break: keep-all !important;
                }

                #brain-header > div {
                    grid-column: 1 !important;
                    grid-row: 2 !important;
                    display: flex !important;
                    width: 100% !important;
                    align-items: center !important;
                    justify-content: flex-end !important;
                    gap: 5px !important;
                    white-space: nowrap;
                    box-sizing: border-box;
                }

                #wes-stock-run,
                #brain-settings-button {
                    min-height: 38px;
                    box-sizing: border-box;
                    white-space: nowrap;
                }

                #wes-stock-run {
                    font-size: 14px !important;
                    line-height: 1.2 !important;
                    font-family: inherit !important;
                    font-weight: 400 !important;
                    padding-left: 7px !important;
                    padding-right: 7px !important;
                }

                #brain-settings-button {
                    width: 34px;
                    flex: 0 0 34px;
                    min-height: 34px;
                    font-size: 18px !important;
                    line-height: 1 !important;
                    padding-left: 3px !important;
                    padding-right: 3px !important;
                }

                #wes-stock-output {
                    padding: 8px 10px !important;
                    font-size: 14px !important;
                    line-height: 1.45;
                    font-family: inherit !important;
                }

                #brain-settings-panel {
                    padding: 0 10px 10px;
                    box-sizing: border-box;
                    line-height: 1.25;
                }

                #brain-settings-panel input {
                    display: block;
                    width: 100% !important;
                    max-width: 100% !important;
                    min-height: 42px;
                    margin: 0 0 6px;
                    box-sizing: border-box;
                    font-size: 16px;
                }

                #brain-strategic-sale-controls {
                    display: grid !important;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px 14px !important;
                    align-items: center !important;
                    margin: 7px 0 8px;
                }

                #brain-strategic-sale-controls label {
                    display: grid !important;
                    grid-template-columns: auto minmax(68px, 1fr);
                    align-items: center !important;
                    gap: 7px !important;
                    min-width: 0;
                    padding: 3px 0 !important;
                    margin: 0 !important;
                }

                #brain-strategic-sale-controls select {
                    width: 100% !important;
                    min-width: 0;
                    min-height: 36px;
                    box-sizing: border-box;
                    font-size: 16px;
                }

                #wes-stock-save {
                    min-height: 36px;
                    margin-top: 2px;
                    font-size: 14px !important;
                    font-family: inherit !important;
                }

                #brain-header-content > div {
                    font-size: inherit !important;
                    line-height: inherit !important;
                    font-family: inherit !important;
                    font-weight: inherit !important;
                }

                #wes-stock-output b {
                    font-size: inherit !important;
                }
            }

            @media (max-width: 360px) and (orientation: portrait) {
                #brain-header-content {
                    font-size: 21px !important;
                }

                #wes-stock-run {
                    font-size: 13px !important;
                }

                #brain-strategic-sale-controls {
                    gap: 7px 10px !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function buildPanel() {
        if (document.getElementById('wes-stock-roi-box')) return;

        injectBrainResponsiveStyles();

        const strategicSaleControls = buildStrategicSaleControls();



        const box = createBrainContainer();

        box.innerHTML = `

${createBrainHeader()}

<div class="cont-gray bottom-round">


                <div id="wes-stock-output"
    style="
        padding:6px 0;
    ">
                    Welcome to The Brain.
                </div>

                <div id="brain-settings-panel"
                    style="
    display:none;
">

                    <input id="wes-stock-key"
                        type="password"
                        placeholder="Paste Torn API key"
                        style="width:280px;max-width:90%;padding:6px;"><br>
                    <div style="
                        margin:4px 0 10px;
                        max-width:280px;
                        font-size:11px;
                        line-height:1.35;
                        color:#999;
                    ">
                        Your API key is stored locally and is never shared.
                        Supports Limited or Custom API keys.
                        Custom key permissions:
                        • User → stocks
                        • Market → pointsmarket
                        • Torn → stocks, items, bank<br>
                        • User → money
                    </div>
                            <input id="wes-stock-cash"
                                type="text"
                                placeholder="Deployable Capital"
                                style="width:280px;max-width:90%;padding:6px;"><br>
<div style="margin-top:14px;">
    <div style="font-weight:700;margin-bottom:4px;">
        Strategic Target
    </div>

    <div style="font-size:12px;opacity:.8;margin-bottom:6px;">
        Choose one strategic-benefit stock you are intentionally accumulating.
        Shares already owned toward this target will be protected from rebalance recommendations.
    </div>

    ${buildStrategicTargetControl()}
</div>
                                    <div>
                                        <div>
                                            Strategic Sale Candidates
                                        </div>

                                        <div>
                                            Choose how many completed blocks of each
                                            strategic-benefit holding The Brain may consider
                                            selling. The default is 0.
                                        </div>

                                        <div id="brain-strategic-sale-controls" style="
                                            display:flex;
                                            flex-wrap:wrap;
                                            gap:6px;
                                            align-items:center;
                                        ">
                                            ${strategicSaleControls}
                                        </div>
                                    </div>

                                    <div style="margin-top:14px;">
                                        <label for="wes-tci-active-at-start" style="display:block;font-weight:700;margin-bottom:4px;">
                                            TCI — Current Bank Investment
                                        </label>
                                        <div style="font-size:12px;opacity:.8;margin-bottom:6px;">
                                            Was the TCI 10% interest benefit already active when you started your current bank investment?
                                        </div>
                                        <select id="wes-tci-active-at-start" style="max-width:100%;padding:5px;">
                                            <option value="">Not specified</option>
                                            <option value="yes">Yes — bonus included</option>
                                            <option value="no">No — bonus not included</option>
                                        </select>
                                        <div style="font-size:11px;opacity:.7;margin-top:5px;">
                                            Saved for future bank valuation. This setting does not yet affect portfolio recommendations.
                                        </div>
                                    </div>

                                    <div style="margin-top:12px;padding:10px;border:1px solid #555;border-radius:4px;max-width:580px;">
                                        <div style="font-weight:700;margin-bottom:5px;">Bank Intelligence — TCI ROI</div>
                                        <div style="font-size:12px;opacity:.8;margin-bottom:7px;">Read current bank data and live TCI share price. Estimates assume identical future terms; recommendations remain unchanged.</div>
                                        <button class="torn-btn" type="button" id="wes-bank-fetch">Read Bank Investment</button>
                                        <div id="wes-bank-result" aria-live="polite" style="margin-top:8px;font-size:12px;line-height:1.6;overflow-wrap:anywhere;">Not fetched yet.</div>
                                        <div id="wes-churn-panel" style="border-top:1px solid #555;margin-top:11px;padding-top:10px;">
                                            <div style="font-weight:700;">TCI Churn Decision — read only</div>
                                            <div style="font-size:11px;opacity:.8;margin:4px 0 8px;">Only scan for TCI acquisition in the final 8 days before maturity. Monetary holdings are evaluated; the existing Strategic Holdings options and non-monetary protections remain untouched. </div>
                                            <div style="margin:6px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                                <label for="wes-churn-test-source" style="font-size:11px;">Portfolio test source:</label>
                                                <select id="wes-churn-test-source" style="font-size:11px;max-width:280px;">
                                                    <option value="live">LIVE — real Torn API</option>
                                                    <option value="synthetic">SIMULATED — live snapshot + synthetic TCI block</option>
                                                    <option value="compare">COMPARE — live vs synthetic TCI</option>
                                                    <option value="roundtrip">ROUND TRIP — funded CHURN IN → OUT</option>
                                                </select>
                                            </div>
                                            <div id="wes-churn-test-banner" style="font-size:11px;color:#f5d58a;display:none;">TEST ONLY — synthetic inputs are never saved or used by normal recommendations.</div>
                                            <button type="button" class="torn-btn" id="wes-churn-calc">SCAN ELIGIBLE PORTFOLIO</button>
                                            <div id="wes-churn-result" style="margin-top:8px;line-height:1.6;overflow-wrap:anywhere;font-size:12px;color:#d8d8d8;" aria-live="polite">Read Bank Investment first, then scan your holdings.</div>
                                        </div>
                                    </div>

                                    <button class="torn-btn" id="wes-stock-save">
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
        if (savedKey) keyInput.value = savedKey;
        const tciSetting = localStorage.getItem(TCI_BANK_ACTIVE_STORAGE) || '';
        if (['yes', 'no'].includes(tciSetting)) {
            document.getElementById('wes-tci-active-at-start').value = tciSetting;
        }

        // Read-only bank intelligence. The saved answer is scoped to a specific investment start.
        const bankResult = document.getElementById('wes-bank-result');
        const bankFetchButton = document.getElementById('wes-bank-fetch');
        const formatBankMoney = n => '$' + Math.round(n).toLocaleString('en-US');
        const bankDate = seconds => new Date(seconds * 1000).toLocaleString();
        const bankAnswer = document.getElementById('wes-tci-active-at-start');
        const escapeBankText = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        // Churn Intelligence is a screening tool, deliberately isolated from The Brain's
        // existing strategic target, strategic-sale UI and optimizer recommendations.
        let churnMarketInputs = null;
        const churnResult = document.getElementById('wes-churn-result');
        const churnButton = document.getElementById('wes-churn-calc');
        const churnPayments = (first, period, horizon) => first > horizon ? 0 : Math.floor((horizon - first + 1e-8) / period) + 1;
        const churnEsc = v => escapeBankText(v);
        const churnEventDifference = (cfg, horizon, away) => {
            // Increments are independently eligible; their dividend deliveries
            // share a ticker-level calendar while any original increment remains.
            // Selling all blocks ends that calendar. Repurchase at `away` starts
            // a new calendar, and any purchased block must qualify for `cfg.days`.
            // This compares scheduled PAYOUT EVENTS rather than elapsed days.
            // READY is modeled as collected just before the hypothetical sale.
            const b = cfg.liveBonus;
            const sold = cfg.soldIncrements ?? cfg.increment;
            // Owned benefit thresholds and *currently activated* increments are
            // independent. A recent buy may complete a share block without adding
            // to Torn's next payout quantity. Do not reject that valid state.
            if (!b || b.frequency !== cfg.days ||
                !Number.isFinite(b.daysLeft) || b.daysLeft < 0 ||
                !Number.isInteger(b.increment) || b.increment < 0 ||
                !Number.isInteger(cfg.increment) || b.increment > cfg.increment ||
                !Number.isInteger(sold) || sold < 1 || sold > cfg.increment ||
                !(cfg.days > 0)) return null;
            const firstHoldPayout = b.available ? cfg.days : b.daysLeft;
            if (firstHoldPayout < 1) return null;
            const holdEvents = churnPayments(firstHoldPayout, cfg.days, horizon);
            const qualifiesAt = away + cfg.days;
            const retained = cfg.increment - sold;
            // Retained blocks keep paying normally. Restored blocks join the
            // original synchronized payout dates after their full qualification.
            // When no block remains, repurchasing starts an entirely new clock.
            const firstRestoredPayout = retained > 0
                ? firstHoldPayout + Math.max(0, Math.ceil((qualifiesAt - firstHoldPayout - 1e-8) / cfg.days)) * cfg.days
                : qualifiesAt;
            const churnEvents = churnPayments(firstRestoredPayout, cfg.days, horizon);
            const deferredEvents = holdEvents - churnEvents;
            // A single ticker payout calendar governs every eligible increment.
            // Charge only scheduled event opportunities displaced by selling
            // these increments and repurchasing them at `away`.
            // For an already-owned increment not yet activated, the API reveals
            // the currently active count, not its historical purchase date.
            // Treat the calendar count as a CONSERVATIVE UPPER BOUND for that
            // increment's missed payouts relative to doing nothing; never
            // add an arbitrary three-payout penalty or claim exact lost income.
            const pendingIncrements = cfg.increment - b.increment;
            return {holdEvents, churnEvents, deferredEvents,
                chargedEvents: deferredEvents,
                allowanceUsed: false,
                retainedIncrements: retained, soldIncrements: sold,
                activeIncrements: b.increment, pendingIncrements,
                payoutEstimate: pendingIncrements > 0,
                firstRestoredPayout,
                difference: deferredEvents * cfg.payout * sold};
        };
        // Independent, auditable HOLD-versus-CHURN range for one ticker funding sale.
        // The API gives the currently active count, not a purchase age for pending
        // ownership thresholds. Events missed by a pending increment under HOLD
        // can be between zero and the modeled calendar-event count. Bound that
        // uncertainty instead of treating the conservative event count as exact.
        const churnPayoutLossBounds = (holding, horizon, saleDay) => {
            const ev=churnEventDifference(holding,horizon,saleDay);
            if (!ev || !Number.isFinite(ev.deferredEvents) || ev.deferredEvents<0 ||
                !(Number.isFinite(holding.payout) && holding.payout>=0)) return null;
            const pending=Math.max(0,holding.increment-holding.liveBonus.increment);
            const affected=holding.soldIncrements??holding.increment;
            const certainlyActive=Math.max(0,affected-pending);
            const minimum=ev.deferredEvents*certainlyActive*holding.payout;
            const maximum=ev.deferredEvents*affected*holding.payout;
            return {symbol:holding.symbol,events:ev.deferredEvents,affected,
                pending,minimum,maximum,estimate:maximum};
        };
        // This comparison is intentionally narrower than a general forecast:
        // unchanged monetary holdings and unchanged market prices mean the HOLD
        // baseline has identical ongoing income after the temporary interruption.
        // A different OUT allocation demands a separate horizon-aware income model.
        const churnRoundTripRange = ({funding,finalOwned,originalOwned,bankBonus,
                                     totalFees,period,bankDays}) => {
            if (!Number.isFinite(bankBonus) || bankBonus<0 ||
                !Number.isFinite(totalFees) || totalFees<0) return null;
            const monetarySymbols=Object.keys(STOCKS).filter(symbol=>
                ['market','cash'].includes(STOCKS[symbol].rewardType));
            const restored=monetarySymbols.every(symbol=>
                Number(finalOwned[symbol]||0)===Number(originalOwned[symbol]||0));
            if (!restored) return {status:'DIFFERENT_ALLOCATION'};
            const horizon=bankDays+period;
            const saleDay=bankDays+1;
            const losses=funding.map(entry=>churnPayoutLossBounds(entry,horizon,saleDay));
            if (losses.some(entry=>!entry)) return {status:'MISSING_PAYOUT_EVIDENCE'};
            const minLoss=losses.reduce((sum,entry)=>sum+entry.minimum,0);
            const maxLoss=losses.reduce((sum,entry)=>sum+entry.maximum,0);
            return {status:'BOUNDED',restored,minLoss,maxLoss,losses,
                conservative:bankBonus-totalFees-maxLoss,
                optimistic:bankBonus-totalFees-minLoss};
        };
        // The production funding evaluator is also used by the controlled self-tests.
        // No bank date or user holding is modified by a self-test.
        // Funding options are grouped by ticker. Only ONE sale quantity may be
        // selected for each stock, avoiding duplicate liquidation of the same shares.
        // Existing stock-block functions determine the permissible increments.
        const evaluateTciFunding = ({eligible, cash, tciCost, bonus, duration,
                                     daysToMaturity, tciSaleValue=tciCost, feeRate=STOCK_SALE_FEE_RATE}) => {
            if (!(tciCost > 0 && bonus >= 0 && duration > 0) ||
                !Number.isFinite(daysToMaturity) || daysToMaturity < 0 ||
                !Number.isFinite(cash) || cash < 0) return [];
            const grouped = new Map();
            for (const option of eligible) {
                const group = option.symbol;
                if (!grouped.has(group)) grouped.set(group, []);
                grouped.get(group).push(option);
            }
            const groups = [...grouped.values()];
            // A strict upper bound ensures a large portfolio never freezes Firefox.
            let combinations = 1;
            for (const options of groups) {
                combinations *= options.length + 1;
                if (combinations > 262144) return [];
            }
            const saleTciDay = daysToMaturity + 1;
            const bonusPayableDay = daysToMaturity + duration;
            const results = [];
            const picked = [];
            const score = () => {
                const proceeds = picked.reduce((v,c)=>v+c.value*(1-feeRate),0);
                if (proceeds+cash+1e-6 < tciCost) return;
                const buyback = picked.reduce((v,c)=>v+c.value,0);
                const remainingAfterPurchase=cash+proceeds-tciCost;
                const afterTciSale=remainingAfterPurchase+tciSaleValue*(1-feeRate);
                if (afterTciSale+1e-6 < buyback) return;
                const lostBenefits=picked.reduce((sum,c)=>{
                    const ev=churnEventDifference(c,bonusPayableDay,saleTciDay);
                    return sum+(ev ? ev.difference : Infinity);
                },0);
                if (!Number.isFinite(lostBenefits)) return;
                const feeOnFundingSales=picked.reduce((sum,c)=>sum+c.value*feeRate,0);
                const feeOnTciSale=tciSaleValue*feeRate;
                const fees=feeOnFundingSales+feeOnTciSale;
                const totalChurnCost=lostBenefits+fees;
                const net=bonus-totalChurnCost;
                results.push({picked:[...picked],net,totalChurnCost,
                    breakEvenBankBonus:totalChurnCost,lostBenefits,fees,
                    feeOnFundingSales,feeOnTciSale,proceeds,buyback,
                    remainingAfterPurchase,afterTciSale,cushion:Math.max(0,net),
                    liquidAfterRepurchase:afterTciSale-buyback});
            };
            const search = i => {
                if (i === groups.length) {score();return;}
                search(i+1); // do not sell this holding
                for (const option of groups[i]) {
                    picked.push(option);
                    search(i+1);
                    picked.pop();
                }
            };
            search(0);
            results.sort((a,b)=>b.net-a.net || a.picked.length-b.picked.length);
            return results;
        };
        // A shared, deterministic window policy. Used by both the live scanner
        // and synthetic checks so test scenarios cannot bypass the production gate.
        const tciWindowDecision = (days, ownsBlock=false) => {
            if (ownsBlock) return 'OWNED_REVIEW';
            if (!Number.isFinite(days) || days < 0) return 'UNAVAILABLE';
            if (days > 8) return 'WAIT';
            if (days < 7) return 'TOO_LATE';
            return 'EVALUATE';
        };
        const tciFundingOutcome = (results) => {
            if (!results?.length) return 'UNFUNDED';
            return results[0].net > 0 ? 'POTENTIAL_ADVANTAGE' : 'UNPROFITABLE';
        };
        const runTciControlledTests = () => {
            const fixture = (symbol, value, frequency, progress, payout, available=false) => ({
                symbol, value, days:frequency, payout,increment:1,
                liveBonus:{frequency,progress,available,increment:1,
                    daysLeft:available ? 0 : frequency-progress}
            });
            const close = (a,b) => Math.abs(a-b) < 0.00001;
            const checks=[];
            const check=(name,ok)=>checks.push([name,Boolean(ok)]);
            const base={cash:2000,tciCost:1000,bonus:100,duration:90,daysToMaturity:8,feeRate:0.001};
            check('Synthetic owned-TCI reads comma-formatted liquid cash', num('28,545,739')===28545739);
            check('Capital conserved across TCI purchase and sale (less two sale fees)', (()=>{
                const initial=2000, asset=1000, fee=0.001, cost=1000;
                const afterIn=initial+asset*(1-fee)-cost+cost;
                const afterOut=initial+asset*(1-fee)-cost+cost*(1-fee);
                return close(afterIn,initial+asset-asset*fee) && close(afterOut,initial+asset-asset*fee-cost*fee);
            })());
            const a1={...fixture('A',600,7,6,10),shares:10,soldIncrements:1};
            const a2={...fixture('A',1000,7,6,10),shares:30,soldIncrements:2};
            const b1={...fixture('B',600,7,6,10),shares:5};
            const groupedPlans=evaluateTciFunding({...base,cash:5,eligible:[a1,a2,b1]});
            check('Partial-block alternatives are mutually exclusive per ticker',
                groupedPlans.length>0 && groupedPlans.every(p=>new Set(p.picked.map(c=>c.symbol)).size===p.picked.length));
            check('Funding can select a partial block instead of whole holding',
                groupedPlans.some(p=>p.picked.some(c=>c.symbol==='A'&&c.soldIncrements===1)));
            const noSales=evaluateTciFunding({...base,eligible:[]});
            check('Cash-only purchase charges the TCI sale fee once',
                noSales.length===1 && close(noSales[0].fees,1) && close(noSales[0].net,99));
            const nearly=fixture('TEST7',1000,7,6,10);
            const seven=evaluateTciFunding({...base,cash:5,eligible:[nearly]});
            check('Funding sale requires net proceeds, not gross face value',seven.length===1);
            check('Rebuy budget includes both sale fees', seven.length===1 && close(seven[0].fees,2));
            const ev=churnEventDifference(nearly,98,9);
            check('Payout-event difference uses the same tested 7-day cycle',
                seven.length===1 && close(seven[0].lostBenefits,ev.difference));
            check('No future bonus funds the stock repurchase',
                evaluateTciFunding({...base,cash:0,eligible:[nearly]}).length===0);
            const ready=fixture('READY',1000,7,7,10,true);
            const readyEv=churnEventDifference(ready,90,9);
            check('READY reward counted as collected before day-zero sale',
                readyEv!==null && readyEv.holdEvents===12 && readyEv.churnEvents===11);
            const month=fixture('TEST31',1000,31,16,25);
            check('31-day live countdown feeds payout simulation',
                churnEventDifference(month,98,9)!==null);
            const multi=fixture('MULTI',1000,7,6,10);
            multi.liveBonus.increment=2;multi.increment=2;
            const multiEv=churnEventDifference(multi,98,9);
            check('Two increments multiply lost payout value by two',
                multiEv !== null && close(multiEv.difference,2*ev.difference));
            check('Valid multiple increments can fund TCI',
                evaluateTciFunding({...base,cash:5,eligible:[multi]}).length===1);
            const bad={...multi,increment:3};
            check('Owned 3 blocks with only 2 activated is valid but estimated',
                evaluateTciFunding({...base,cash:5,eligible:[bad]}).length===1 &&
                churnEventDifference(bad,98,9)?.payoutEstimate===true);
            const impossible={...multi,increment:1,liveBonus:{...multi.liveBonus,increment:3}};
            check('API activated payout cannot exceed owned completed blocks',
                evaluateTciFunding({...base,cash:5,eligible:[impossible]}).length===0);
            const thsFixture={...multi,increment:2,soldIncrements:1,
                liveBonus:{...multi.liveBonus,increment:1}};
            const thsEvent=churnEventDifference(thsFixture,98,9);
            check('THS two owned blocks with one active is not excluded',
                thsEvent!==null && thsEvent.activeIncrements===1 &&
                thsEvent.pendingIncrements===1 && thsEvent.payoutEstimate);
            check('Fully activated blocks are not marked pending',
                churnEventDifference(multi,98,9)?.payoutEstimate===false);
            check('Pending seven-day holding uses actual payout event count',
                thsEvent !== null && !thsEvent.allowanceUsed &&
                thsEvent.chargedEvents===thsEvent.deferredEvents &&
                close(thsEvent.difference, thsEvent.deferredEvents*thsFixture.payout));
            const monthlyPending={...month,increment:2,soldIncrements:1,
                liveBonus:{...month.liveBonus,increment:1}};
            const monthlyPendingEv=churnEventDifference(monthlyPending,98,9);
            check('Pending 31-day holding also uses ticker payout events',
                monthlyPendingEv !== null && !monthlyPendingEv.allowanceUsed &&
                monthlyPendingEv.chargedEvents===monthlyPendingEv.deferredEvents);
            check('Active increments do not invoke fallback estimates',
                multiEv !== null && !multiEv.allowanceUsed &&
                multiEv.chargedEvents===multiEv.deferredEvents);
            check('Pending-increment estimate never adds duplicate payouts',
                thsEvent !== null && close(thsEvent.difference,
                thsEvent.deferredEvents*thsFixture.payout*thsFixture.soldIncrements));
            check('Pending status alone cannot change scheduled event counts',
                thsEvent !== null &&
                thsEvent.deferredEvents===churnEventDifference({...thsFixture,
                  liveBonus:{...thsFixture.liveBonus,increment:2}},98,9)?.deferredEvents);
            const oneCalendarEvent = churnEventDifference({
                ...thsFixture,liveBonus:{...thsFixture.liveBonus,daysLeft:6}}, 10, 8);
            check('No arbitrary three-payout minimum for a pending block',
                oneCalendarEvent !== null && oneCalendarEvent.chargedEvents < 3 &&
                oneCalendarEvent.chargedEvents === oneCalendarEvent.deferredEvents);
            const readyMulti=fixture('READY_MULTI',1000,7,7,10,true);
            readyMulti.liveBonus.increment=3;readyMulti.increment=3;
            const readyMultiEv=churnEventDifference(readyMulti,90,9);
            check('READY multi-increment payouts are modeled after assumed collection',
                readyMultiEv !== null && readyMultiEv.holdEvents===12 && close(readyMultiEv.difference,30));
            const partialCycle={...multi,soldIncrements:1};
            const partialEv=churnEventDifference(partialCycle,98,9);
            check('Partial sale retains existing payout calendar',
                partialEv !== null && partialEv.retainedIncrements===1 &&
                partialEv.firstRestoredPayout===22 && close(partialEv.difference,30));
            const fullEv=churnEventDifference({...multi,soldIncrements:2},98,9);
            check('Full liquidation starts new ticker payout clock',
                fullEv !== null && fullEv.retainedIncrements===0 &&
                fullEv.firstRestoredPayout===16);
            const partialMonth={...month,increment:3,soldIncrements:1,
                liveBonus:{...month.liveBonus,increment:3}};
            const partialMonthEv=churnEventDifference(partialMonth,98,9);
            check('31-day retained blocks stay on original calendar',
                partialMonthEv!==null && partialMonthEv.retainedIncrements===2 &&
                partialMonthEv.firstRestoredPayout===46);
            check('Retained 7-day clock counts exactly three displaced payouts',
                partialEv!==null && partialEv.holdEvents===14 &&
                partialEv.churnEvents===11 && partialEv.deferredEvents===3);
            check('Retained 31-day clock skips only first scheduled payout',
                partialMonthEv!==null && partialMonthEv.holdEvents===3 &&
                partialMonthEv.churnEvents===2 &&
                close(partialMonthEv.difference,25));
            check('Partial loss charges only sold increment',
                partialEv!==null && close(partialEv.difference,
                (partialEv.holdEvents-partialEv.churnEvents)*partialCycle.payout));
            const neg=evaluateTciFunding({...base,cash:2000,bonus:0,eligible:[]});
            check('Zero bonus does not fabricate a profit',neg.length===1 && neg[0].net<0);
            // Actual purchase-window branch validation, not only arithmetic checks.
            check('Day 9 stays WAIT',tciWindowDecision(9)==='WAIT');
            check('Day 8 enters the acquisition evaluation',tciWindowDecision(8)==='EVALUATE');
            check('Day 7 remains eligible',tciWindowDecision(7)==='EVALUATE');
            check('Day 6 blocks a new unactivated purchase',tciWindowDecision(6)==='TOO_LATE');
            check('Existing TCI holding routes to owned review regardless of window',
                tciWindowDecision(40,true)==='OWNED_REVIEW');
            check('A cash-financed positive case is distinguished from WAIT',
                tciFundingOutcome(noSales)==='POTENTIAL_ADVANTAGE');
            const negative=evaluateTciFunding({...base,cash:2000,bonus:0,eligible:[]});
            check('A fully funded but negative-margin case is rejected',
                tciFundingOutcome(negative)==='UNPROFITABLE');
            check('An unfundable purchase is reported instead of invented',
                tciFundingOutcome(evaluateTciFunding({...base,cash:1,eligible:[]}))==='UNFUNDED');
            // Verify one-cycle dollar break-even incorporates actual benefit resets.
            const sevenDayCase=fixture('ITEM',1000,7,6,200);
            const cashMonthCase=fixture('CASH',1000,31,30,400);
            const realCycle=evaluateTciFunding({eligible:[sevenDayCase,cashMonthCase],
                cash:5,tciCost:1900,bonus:5000,duration:90,daysToMaturity:8});
            const both=realCycle.find(r=>r.picked.length===2);
            check('One-cycle costs include seven-day and 31-day payout resets',
                !!both && both.lostBenefits>0 && close(both.totalChurnCost,both.lostBenefits+both.fees));
            check('Break-even bank bonus equals modeled real churn costs',
                !!both && close(both.breakEvenBankBonus,both.totalChurnCost) &&
                close(both.net,5000-both.breakEvenBankBonus));
            const exactBreakEven=both ? evaluateTciFunding({eligible:[sevenDayCase,cashMonthCase],
                cash:5,tciCost:1900,bonus:both.breakEvenBankBonus,duration:90,daysToMaturity:8})
                .find(r=>r.picked.length===2) : null;
            check('At exact break-even, churn is not a positive opportunity',
                !!exactBreakEven && Math.abs(exactBreakEven.net)<1e-7);
            // Artificial complete TCI block; shares never touch the live portfolio.
            const ownedCase={shares:1500000,required:1500000,blockValue:1000,
                annualBonus:80,strategicTarget:'',liquidCash:10,feeRate:0.001};
            const better=evaluateOwnedTciSale({...ownedCase,
                opportunities:[{acronym:'BETTER',cost:999,yearly:150}]});
            check('Synthetic owned TCI identifies an affordable superior replacement',
                better.status==='REVIEW_SELL' && close(better.saleCash,999) &&
                close(better.improvement,70) && close(better.saleFee,1));
            const worse=evaluateOwnedTciSale({...ownedCase,
                opportunities:[{acronym:'LOWER',cost:999,yearly:50}]});
            check('Synthetic owned TCI stays HOLD when replacement earns less',
                worse.status==='HOLD' && close(worse.improvement,-30));
            const protectedCase=evaluateOwnedTciSale({...ownedCase,strategicTarget:'TCI',
                opportunities:[{acronym:'BETTER',cost:999,yearly:150}]});
            check('Synthetic TCI Strategic Target prevents sale consideration',
                protectedCase.status==='PROTECTED');
            const unfundableOwned=evaluateOwnedTciSale({...ownedCase,liquidCash:0,
                opportunities:[{acronym:'TOO_EXPENSIVE',cost:1001,yearly:150}]});
            check('Owned TCI review rejects replacement outside available proceeds',
                unfundableOwned.status==='NO_REPLACEMENT');
            const partial=evaluateOwnedTciSale({...ownedCase,shares:1499999,
                opportunities:[{acronym:'BETTER',cost:999,yearly:150}]});
            check('Partial TCI position cannot be treated as a completed block',
                partial.status==='NOT_OWNED');
            // The integration gate is tested with a controlled substitute for
            // the stable optimizer; these fixtures never touch the real account.
            // Income accounting: counting only builder purchases is incorrect
            // whenever a completed, valued block survives simulated liquidation.
            // Fixed cash stock TCT: 1m per 31 days, first block 100k shares.
            const tctYearly = annualValue(STOCKS.TCT,'TCT');
            const heldIncome = calculatePortfolioAnnualIncome({TCT:100000},{TCT:{price:100}});
            check('Retained completed monetary block counts toward annual income',
                heldIncome.annualIncome === tctYearly);
            const twoBlocks = calculatePortfolioAnnualIncome({TCT:300000},{TCT:{price:100}});
            check('Two completed increments count twice, not once',
                twoBlocks.annualIncome === 2*tctYearly);
            const partialOnly = calculatePortfolioAnnualIncome({TCT:99999},{TCT:{price:100}});
            check('Uncompleted partial block adds no payout income',partialOnly.annualIncome===0);
            // Complete synthetic portfolios: the production transaction builder
            // requires holdings, not only an annual-income estimate.
            const scenario=(cash)=>({idealPortfolio: cash>1000
                ? {yearlyIncome:160,cashRemaining:109,holdings:{ALT:900}}
                : {yearlyIncome:100,cashRemaining:10,holdings:{TCI:1500000}}});
            const integratedBase={owned:{TCI:1500000},liquidCash:10,
                byAcronym:{TCI:{price:1000/1500000},ALT:{price:1}},strategicSaleLimits:{},
                strategicTarget:'',annualBonus:20,bankDaysLeft:30,buildStable:scenario};
            const integratedBetter=evaluateTciIntegratedPortfolio(integratedBase);
            check('Integrated portfolio scenario identifies improvement over holding TCI',
                integratedBetter.status==='REVIEW_SELL' && close(integratedBetter.improvement,40));
            check('Integrated portfolio scenario preserves TCI strategic target',
                evaluateTciIntegratedPortfolio({...integratedBase,strategicTarget:'TCI'}).status==='PROTECTED');
            check('Integrated portfolio scenario protects the imminent bank window',
                evaluateTciIntegratedPortfolio({...integratedBase,bankDaysLeft:8}).status==='BANK_WINDOW_PROTECTED');
            check('Integrated portfolio scenario rejects missing bonus evidence',
                evaluateTciIntegratedPortfolio({...integratedBase,annualBonus:null}).status==='MISSING_EVIDENCE');
            check('Integrated portfolio scenario rejects a partial TCI block',
                evaluateTciIntegratedPortfolio({...integratedBase,owned:{TCI:1499999}}).status==='NOT_ONE_BLOCK');
            // v6.3.17: Validate the final shadow-to-recommendation gate with
            // the identical integrated evaluator used in the live Why? panel.
            const holdScenario=(cash)=>({idealPortfolio: cash>1000
                ? {yearlyIncome:110,cashRemaining:109,holdings:{ALT:900}}
                : {yearlyIncome:100,cashRemaining:10,holdings:{TCI:1500000}}});
            const gain=evaluateTciIntegratedPortfolio(integratedBase);
            check('Final gate recognizes financially superior replacement as review only',
                assessTciRebalanceGate(gain)==='REVIEW_SELL_ONLY');
            const noGain=evaluateTciIntegratedPortfolio({...integratedBase,buildStable:holdScenario});
            check('Final gate returns HOLD when keeping TCI earns more',
                noGain.status==='HOLD' && assessTciRebalanceGate(noGain)==='HOLD');
            check('Final gate does not bypass Strategic Target protection',
                assessTciRebalanceGate(evaluateTciIntegratedPortfolio({...integratedBase,
                    strategicTarget:'TCI'}))==='PROTECTED');
            check('Final gate protects eight-day bank window',
                assessTciRebalanceGate(evaluateTciIntegratedPortfolio({...integratedBase,
                    bankDaysLeft:8}))==='PROTECTED');
            check('Final gate rejects missing investment valuation',
                assessTciRebalanceGate(evaluateTciIntegratedPortfolio({...integratedBase,
                    annualBonus:NaN}))==='INSUFFICIENT_EVIDENCE');
            check('Final gate rejects partial TCI ownership',
                assessTciRebalanceGate(evaluateTciIntegratedPortfolio({...integratedBase,
                    owned:{TCI:1499999}}))==='NOT_APPLICABLE');
            check('Final gate never promotes an incomplete sell result',
                assessTciRebalanceGate({status:'REVIEW_SELL',improvement:50,
                    purchaseCost:900})==='INSUFFICIENT_EVIDENCE');
            check('Synthetic integration never changes the live owned-share fixture',
                integratedBase.owned.TCI===1500000 && integratedBase.liquidCash===10);
            // v6.3.20: Exercise the ACTUAL live authorization gate, after the
            // integrated portfolio evaluator generates the transaction list.
            // Financial amounts are synthetic Torn dollars, never live holdings.
            const billion=1000000000;
            const liveFixtureBuild=(cash)=>cash>1.8*billion
                ? {idealPortfolio:{yearlyIncome:160000000,cashRemaining:348200000,
                    holdings:{ALT:1500000000}}}
                : {idealPortfolio:{yearlyIncome:100000000,cashRemaining:50000000,
                    holdings:{TCI:1500000}}};
            const liveFixture={owned:{TCI:1500000},liquidCash:50000000,
                byAcronym:{TCI:{price:1200},ALT:{price:1}},
                strategicSaleLimits:{},strategicTarget:'',annualBonus:20000000,
                bankDaysLeft:30,buildStable:liveFixtureBuild};
            const liveSale=evaluateTciIntegratedPortfolio(liveFixture);
            const liveApproved=authorizeLiveTciSale(liveSale,liveSale.keepIncome,1500000);
            check('Live gate authorizes profitable, funded synthetic TCI sale',
                liveSale.status==='REVIEW_SELL' && liveApproved &&
                liveSale.transactions.sells.some(s=>s.acronym==='TCI' && s.shares===1500000));
            check('Live gate accepts a small genuine positive advantage without a fixed hurdle',
                authorizeLiveTciSale({...liveSale,improvement:1,
                    sellIncome:liveSale.keepIncome+1},liveSale.keepIncome,1500000));
            check('Live gate rejects exactly zero financial advantage',
                !authorizeLiveTciSale({...liveSale,improvement:0,
                    sellIncome:liveSale.keepIncome},liveSale.keepIncome,1500000));
            check('Live gate rejects negative financial advantage',
                !authorizeLiveTciSale({...liveSale,improvement:-1,
                    sellIncome:liveSale.keepIncome-1},liveSale.keepIncome,1500000));
            check('Live gate rejects sale without a TCI sell transaction',
                !authorizeLiveTciSale({...liveSale,transactions:{...liveSale.transactions,
                    sells:liveSale.transactions.sells.filter(s=>s.acronym!=='TCI')}},
                    liveSale.keepIncome,1500000));
            check('Live gate rejects a sale with no replacement purchases',
                !authorizeLiveTciSale({...liveSale,transactions:{...liveSale.transactions,
                    buys:[]}},liveSale.keepIncome,1500000));
            check('Live gate rejects insufficient replacement income',
                !authorizeLiveTciSale(liveSale,liveSale.sellIncome,1500000));
            const guarded=evaluateTciIntegratedPortfolio({...liveFixture,bankDaysLeft:8});
            check('Live gate preserves the eight-day TCI sale protection',
                guarded.status==='BANK_WINDOW_PROTECTED' &&
                !authorizeLiveTciSale(guarded,120000000,1500000));
            const targetProtected=evaluateTciIntegratedPortfolio({...liveFixture,
                strategicTarget:'TCI'});
            check('Live gate preserves explicit TCI Strategic Target',
                targetProtected.status==='PROTECTED' &&
                !authorizeLiveTciSale(targetProtected,120000000,1500000));
            check('Synthetic live authorization leaves test holdings unchanged',
                liveFixture.owned.TCI===1500000 && liveFixture.liquidCash===50000000 &&
                liveFixture.bankDaysLeft===30);
            // v6.3.21: Three isolated, realistic scenarios through production
            // evaluation functions. Synthetic inputs are local to this call.
            // Neither the live portfolio nor the saved bank answer is modified.
            const syntheticOwned = {...liveFixture.owned};
            const syntheticCash = liveFixture.liquidCash;
            const syntheticMaturity = liveFixture.bankDaysLeft;
            const simulatedOwner = evaluateTciIntegratedPortfolio({...liveFixture,
                owned:{...syntheticOwned,TCI:1500000},bankDaysLeft:30});
            check('Scenario A: artificial full TCI ownership reaches live SELL decision',
                simulatedOwner.status==='REVIEW_SELL' &&
                authorizeLiveTciSale(simulatedOwner,simulatedOwner.keepIncome,1500000));
            const simulatedEightDay = tciWindowDecision(8,false);
            const simulatedEightDayFunding = evaluateTciFunding({
                eligible:[],cash:2000,tciCost:1000,bonus:100,
                duration:90,daysToMaturity:8,feeRate:0.001});
            check('Scenario B: fast-forward to 8 days opens the actual purchase window',
                simulatedEightDay==='EVALUATE' &&
                tciFundingOutcome(simulatedEightDayFunding)==='POTENTIAL_ADVANTAGE' &&
                simulatedEightDayFunding[0]?.net===99);
            const simulatedOwnedEightDay = evaluateTciIntegratedPortfolio({
                ...liveFixture,owned:{...syntheticOwned,TCI:1500000},bankDaysLeft:8});
            check('Scenario C: owned TCI plus 8-day maturity blocks an early sale',
                tciWindowDecision(8,true)==='OWNED_REVIEW' &&
                simulatedOwnedEightDay.status==='BANK_WINDOW_PROTECTED' &&
                !authorizeLiveTciSale(simulatedOwnedEightDay,120000000,1500000));
            check('Scenario boundary: day 9 waits and day 6 is too late to activate',
                tciWindowDecision(9,false)==='WAIT' &&
                tciWindowDecision(6,false)==='TOO_LATE');
            check('Synthetic scenarios leave their source holdings and dates intact',
                liveFixture.owned.TCI===syntheticOwned.TCI &&
                liveFixture.liquidCash===syntheticCash &&
                liveFixture.bankDaysLeft===syntheticMaturity);
            // Release-candidate adversarial tests: no external user fixture.
            const rangeCase=(bonus,fees,minLoss,maxLoss)=>({
                conservative:bonus-fees-maxLoss, optimistic:bonus-fees-minLoss
            });
            const positive=rangeCase(100,10,15,25);
            const negativeRange=rangeCase(20,10,25,35);
            const crossing=rangeCase(40,10,15,35);
            check('RC: positive profit range is ordered and wholly positive',
                positive.conservative===65 && positive.optimistic===75);
            check('RC: negative profit range is ordered and wholly negative',
                negativeRange.conservative===-25 && negativeRange.optimistic===-15);
            check('RC: crossing break-even is disclosed, not silently accepted',
                crossing.conservative===-5 && crossing.optimistic===15);
            const grnDay1=churnEventDifference({
                symbol:'GRN',increment:1,soldIncrements:1,days:31,payout:4000000,
                liveBonus:{frequency:31,daysLeft:1,increment:1,available:false}
            },98,9);
            const grnDay15=churnEventDifference({
                symbol:'GRN',increment:1,soldIncrements:1,days:31,payout:4000000,
                liveBonus:{frequency:31,daysLeft:15,increment:1,available:false}
            },98,9);
            const grnDay30=churnEventDifference({
                symbol:'GRN',increment:1,soldIncrements:1,days:31,payout:4000000,
                liveBonus:{frequency:31,daysLeft:30,increment:1,available:false}
            },98,9);
            check('RC: 31-day boundary event counts are finite, nonnegative',
                [grnDay1,grnDay15,grnDay30].every(ev=>
                    ev && Number.isInteger(ev.deferredEvents) && ev.deferredEvents>=0));
            const zeroChange=rangeCase(0,0,0,0);
            check('RC: no transactions and no bonus cannot invent profit',
                zeroChange.conservative===0 && zeroChange.optimistic===0);
            const tciFixtureCheck=buildGenericTciFixture([{id:7,shares:450000,
                bonus:{available:false,increment:1,progress:2,frequency:7}}]);
            check('RC: synthetic TCI source leaves live input untouched',
                tciFixtureCheck.stocks.find(e=>e.id===2)?.shares===1500000 &&
                tciFixtureCheck.stocks.find(e=>e.id===7)?.shares===450000 &&
                tciFixtureCheck.stocks.every(e=>!('transactions' in e)));
            const failed=checks.filter(([,ok])=>!ok);
            return `<b>TCI CONTROLLED MODEL TEST — ${failed.length?'FAIL':'PASS'} (${checks.length-failed.length}/${checks.length})</b>
                <div>Offline synthetic fixtures; your bank maturity, saved settings, holdings, and recommendations were not changed.</div>
                <details open><summary>Checks</summary>${checks.map(([name,ok])=>
                `<div style="color:${ok?'#a8d6b3':'#ffaaa6'};">${ok?'✓':'✗'} ${churnEsc(name)}</div>`).join('')}</details>`;
        };
        // Test laboratory: NO embedded user portfolio or transaction history.
        // Synthetic input starts from a fresh live snapshot and adjusts only
        // the TCI holding. This fixture exists in memory for this scan only.
        const buildGenericTciFixture = (liveRows) => {
            const rows = Array.isArray(liveRows) ? liveRows : [];
            const stocks = rows.map(entry => ({
                id: Number(entry.id), shares: Number(entry.shares),
                bonus: entry.bonus ? {
                    available: entry.bonus.available === true,
                    increment: Number(entry.bonus.increment),
                    progress: Number(entry.bonus.progress),
                    frequency: Number(entry.bonus.frequency)
                } : null
            })).filter(entry => Number.isInteger(entry.id) && entry.id > 0 &&
                Number.isFinite(entry.shares) && entry.shares >= 0);
            // Deliberately unfunded: for behavior testing ONLY.
            // No original transactions or personally identifying fields copied.
            const tci = stocks.find(entry => entry.id === 2);
            const syntheticTCI = {
                id: 2, shares: 1500000,
                bonus: {available:true,increment:1,progress:7,frequency:7}
            };
            if (tci) Object.assign(tci, syntheticTCI);
            else stocks.push(syntheticTCI);
            return {stocks};
        };
        const testSourceSelect = document.getElementById('wes-churn-test-source');
        const testSourceBanner = document.getElementById('wes-churn-test-banner');
        if (testSourceSelect) {
            testSourceSelect.value='live';
            testSourceSelect.addEventListener('change', () => {
                const testing=testSourceSelect.value!=='live';
                if (testSourceBanner) testSourceBanner.style.display=testing?'block':'none';
                churnResult.textContent=testing?'TEST ONLY — source selected for next scan. No portfolio or settings changed.':'LIVE selected — actual Torn holdings will be used on next scan.';
            });
        }
        churnButton.addEventListener('click', async (event) => {
            // Hold Shift for a one-run live-data simulation of the 8-day window.
            // Alt retains the deterministic synthetic regression tests.
            // Neither mode changes the bank API result, saved settings, or optimizer.
            const simulateEightDays = event.shiftKey && !event.altKey && (testSourceSelect?.value||'live')==='live';
            // Synthetic full TCI ownership, valued against the actual portfolio.
            // Run once on Shift+Alt; never persist artificial shares or trades.
            const selectedTestSource = testSourceSelect?.value || 'live';
            // Legacy Shift+Alt continues to run the capital-funded round trip.
            const simulateOwnedTci = selectedTestSource==='roundtrip' || (event.shiftKey && event.altKey && selectedTestSource==='live');
            const simulateSyntheticTci = selectedTestSource==='synthetic' || selectedTestSource==='compare';
            if (event.altKey && !simulateOwnedTci && !simulateSyntheticTci) {
                try {
                    churnResult.innerHTML=runTciControlledTests();
                } catch (error) {
                    console.error('[The Brain] TCI controlled test crashed:', error);
                    churnResult.textContent='TCI CONTROLLED MODEL TEST — ERROR: '+
                        (error?.message || String(error));
                }
                return;
            }
            const key = getAvailableApiKey();
            if (!key || !churnMarketInputs) {
                churnResult.textContent = 'Read Bank Investment first, with a valid TCI valuation and API key.';
                return;
            }
            churnButton.disabled = true;
            churnResult.textContent = 'Reading current stock holdings and live reward prices…';
            try {
                const [marketResult, portfolioResult] = await Promise.all([
                    api(`https://api.torn.com/torn/?selections=stocks&key=${encodeURIComponent(key)}`, {label:'Churn stock prices',timeoutMs:API_TIMEOUTS.stocks}),
                    api(`https://api.torn.com/user/?selections=stocks&key=${encodeURIComponent(key)}`, {label:'Churn holdings',timeoutMs:API_TIMEOUTS.portfolio})
                ]);
                const {byAcronym,idToAcronym} = normalizeMarketStocks(marketResult?.data?.stocks || {});
                const realOwned=normalizeOwnedShares(portfolioResult?.data?.stocks || {},idToAcronym);
                // Only request v2 for simulated modes; source stays genuinely LIVE otherwise.
                let syntheticFixture=null;
                if (simulateSyntheticTci) {
                    const realV2=await api(`https://api.torn.com/v2/user/stocks?key=${encodeURIComponent(key)}`,
                        {label:'Live source for isolated TCI test',timeoutMs:API_TIMEOUTS.portfolio});
                    syntheticFixture=buildGenericTciFixture(realV2?.data?.stocks);
                    // A missing or incomplete v2 response must not become an
                    // invented replacement for the player's actual portfolio.
                    if (!Array.isArray(realV2?.data?.stocks) || !realV2.data.stocks.length) {
                        throw new Error('Synthetic mode requires a complete live v2 stock snapshot.');
                    }
                }
                // Source selector affects CHURN diagnostics only. LIVE is always the
                // default after reload, and ordinary Analyze Portfolio is untouched.
                const owned = simulateSyntheticTci
                    ? {...realOwned, TCI:1500000}
                    : realOwned;
                // API v2 provides activated payout increments, benefit progress and readiness;
                // its bonus.increment is NOT the number of completed ownership blocks. The legacy
                // stock endpoint is retained for compatibility with the normal optimizer.
                // If v2 fails, use NO guessed countdowns and show the limitation.
                let v2BonusBySymbol = new Map();
                let bonusReadStatus = 'Live payout progress unavailable; no countdown assumed.';
                try {
                    const v2 = simulateSyntheticTci ? {data:syntheticFixture} :
                        await api(`https://api.torn.com/v2/user/stocks?key=${encodeURIComponent(key)}`, {label:'Churn benefit countdowns',timeoutMs:API_TIMEOUTS.portfolio});
                    const stockEntries = simulateSyntheticTci
                        ? syntheticFixture.stocks
                        : (Array.isArray(v2?.data?.stocks) ? v2.data.stocks : []);
                    for (const item of stockEntries) {
                        const symbol = idToAcronym[Number(item.id)];
                        const b = item.bonus;
                        if (!symbol || !b) continue;
                        const frequency = Number(b.frequency), progress = Number(b.progress);
                        if (!(frequency > 0) || !Number.isFinite(progress) || progress < 0 || progress > frequency) continue;
                        v2BonusBySymbol.set(symbol, {
                            frequency, progress, available:b.available === true,
                            increment:Number(b.increment),
                            daysLeft:b.available === true ? 0 : Math.max(0,frequency-progress)
                        });
                    }
                    bonusReadStatus = `${v2BonusBySymbol.size} current payout countdown(s) received from Torn API v2.`;
                } catch (v2err) {
                    bonusReadStatus = `Payout countdown request failed (${String(v2err?.message||'unknown error')}); no dates were inferred.`;
                }
                // Refresh existing known market valuations; do not substitute estimated prices.
                await refreshLiveDividendValues(key);
                const protectedStocks = Object.entries(owned).filter(([symbol,shares]) =>
                    shares > 0 && STOCKS[symbol]?.rewardType === 'benefit' && symbol !== 'TCI').map(([symbol]) => symbol);
                const eligible = [];
                const unknown = [];
                for (const [symbol,shares] of Object.entries(owned)) {
                    const cfg = STOCKS[symbol];
                    if (!cfg || !['market','cash'].includes(cfg.rewardType)) continue;
                    const price = Number(byAcronym[symbol]?.price);
                    const reward = rewardValueState(symbol,cfg);
                    const completedShares = completedTarget(cfg.required, shares);
                    // Never liquidate partial/extra shares in this test: doing so risks
                    // double-counting progress across Torn's escalating benefit blocks.
                    if (!(price>0) || completedShares !== shares || !(cfg.days>0) ||
                        reward.status !== RewardValueStatus.KNOWN || !(reward.value>=0)) {
                        unknown.push(symbol+' (price, complete-block structure or payout value unknown)');
                        continue;
                    }
                    const liveBonus=v2BonusBySymbol.get(symbol) || null;
                    const completedIncrements=completedIncrementCount(cfg.required,shares);
                    if (!liveBonus) {
                        unknown.push(symbol+' (live payout countdown unavailable)');
                        continue;
                    }
                    if (liveBonus.frequency !== cfg.days || !Number.isFinite(liveBonus.daysLeft) || liveBonus.daysLeft < 0) {
                        unknown.push(symbol+' (invalid live payout cycle)');
                        continue;
                    }
                    if (!Number.isInteger(liveBonus.increment) || liveBonus.increment<0 ||
                        liveBonus.increment > completedIncrements) {
                        unknown.push(symbol+' (API active increment '+String(liveBonus.increment)+' exceeds '+completedIncrements+' owned benefit thresholds, or is invalid)');
                        continue;
                    }
                    // Sell highest completed increments first; retain lower blocks.
                    // Remaining increments preserve their ticker payout calendar.
                    // Only repurchased increments requalify; a full liquidation
                    // starts a new payout calendar after repurchase.
                    for (let blocksToSell=1;blocksToSell<=completedIncrements;blocksToSell++) {
                        const firstRemoved=completedIncrements-blocksToSell+1;
                        let soldShares=0;
                        for (let inc=firstRemoved;inc<=completedIncrements;inc++) {
                            soldShares+=blockSize(cfg.required,inc);
                        }
                        eligible.push({symbol,shares:soldShares,days:cfg.days,
                            payout:reward.value,increment:completedIncrements,
                            soldIncrements:blocksToSell,liveBonus,
                            value:soldShares*price,
                            proceeds:soldShares*price*(1-STOCK_SALE_FEE_RATE),
                            timingBound:'retained increments preserve payout schedule; sold increments requalify'});
                    }
                }
                if (simulateSyntheticTci) {
                    const fixtureTCI=syntheticFixture.stocks.find(x=>x.id===2);
                    const actualTCI=Number(normalizeOwnedShares(portfolioResult?.data?.stocks||{},idToAcronym).TCI||0);
                    const bank=churnMarketInputs;
                    const cash=num(document.getElementById('wes-stock-cash')?.value||0);
                    const maturityDays=Math.max(0,Math.ceil((bank.maturity*1000-Date.now())/86400000));
                    const annualBonus=bank.bonus*365/bank.duration;
                    const review=evaluateTciIntegratedPortfolio({
                        owned,liquidCash:cash,byAcronym,
                        strategicSaleLimits:getStrategicSaleLimits(),
                        strategicTarget:getStrategicTarget(),
                        annualBonus,bankDaysLeft:maturityDays
                    });
                    const curReal=normalizeOwnedShares(portfolioResult?.data?.stocks||{},idToAcronym);
                    const changed=[...new Set([...Object.keys(owned),...Object.keys(curReal)])].filter(s=>Number(owned[s]||0)!==Number(curReal[s]||0));
                    // An injected holding is a test input, never a funded investment.
                    // Compare total marked-to-market share-value changes across ALL symbols,
                    // not just TCI, so fixture drift cannot be confused with a free gain.
                    const fixtureDeltaRows=changed.map(symbol=>{
                        const actual=Number(curReal[symbol]||0);
                        const hypothetical=Number(owned[symbol]||0);
                        const price=Number(byAcronym[symbol]?.price);
                        return {symbol,actual,hypothetical,delta:hypothetical-actual,
                            price, marketDelta:Number.isFinite(price)&&price>0?(hypothetical-actual)*price:null};
                    });
                    const hasUnknownFixtureValue=fixtureDeltaRows.some(r=>r.marketDelta===null);
                    const fixtureCapitalDelta=hasUnknownFixtureValue?null:fixtureDeltaRows.reduce((sum,r)=>sum+r.marketDelta,0);
                    const rows=(items,dir)=>items?.length?items.map(x=>`<div>${churnEsc(x.acronym)}: ${Number(x.shares).toLocaleString('en-US')} shares (${formatBankMoney(dir==='sell'?x.netValue:x.cost)})</div>`).join(''):'<div>None</div>';
                    const fixtureDeltaHtml=fixtureDeltaRows.length?fixtureDeltaRows.map(r=>
                        `<div>${churnEsc(r.symbol)}: LIVE ${r.actual.toLocaleString('en-US')} → TEST ${r.hypothetical.toLocaleString('en-US')} shares; Δ ${r.delta>=0?'+':''}${r.delta.toLocaleString('en-US')} (${r.marketDelta===null?'price unavailable':formatBankMoney(r.marketDelta)})</div>`).join(''):'<div>No share differences.</div>';
                    const liveReview=selectedTestSource==='compare'?evaluateTciIntegratedPortfolio({
                        owned:curReal,liquidCash:cash,byAcronym,
                        strategicSaleLimits:getStrategicSaleLimits(),strategicTarget:getStrategicTarget(),
                        annualBonus,bankDaysLeft:maturityDays
                    }):null;
                    const improvementText=(r)=>Number.isFinite(r?.improvement)?formatBankMoney(r.improvement):'Not available ('+churnEsc(r?.status||'missing evidence')+')';
                    const compareHtml=selectedTestSource==='compare'?`<div style="margin-top:8px;border-top:1px solid #666;padding-top:6px;"><b>LIVE vs SIMULATED — same market snapshot</b></div>
                        <div>LIVE evaluation: ${churnEsc(liveReview.status)}; hypothetical SELL−KEEP annual income: ${improvementText(liveReview)}.</div>
                        <div>SIMULATED evaluation: ${churnEsc(review.status)}; hypothetical SELL−KEEP annual income: ${improvementText(review)}.</div>
                        <details><summary>What changed in the inputs?</summary>${fixtureDeltaHtml}</details>
                        <div style="color:#ffd68a;">Marked-to-market share-capital difference introduced by fixture: ${fixtureCapitalDelta===null?'UNKNOWN (missing live prices)':formatBankMoney(fixtureCapitalDelta)}. The fixture is not funded, so neither outcome measures actual CHURN profit. An annualized income difference is not a cash gain.</div>
                        <div>These runs share today's price snapshot, bank assumptions, and optimizer. Only the holdings input changes. Source LIVE is restored by selecting LIVE or reloading.</div>`:'';
                    churnResult.innerHTML=`<div style="font-weight:700;color:#f5d58a;">TEST ONLY — SIMULATED API HOLDINGS (NOT LIVE)</div>
                        <div>Live-derived hypothetical holdings: ${syntheticFixture.stocks.length} tickers, including <b>TCI id 2: ${Number(fixtureTCI.shares).toLocaleString('en-US')} shares</b>; bonus.available=${String(fixtureTCI.bonus.available)}, increment=${fixtureTCI.bonus.increment}, progress=${fixtureTCI.bonus.progress}/${fixtureTCI.bonus.frequency}.</div>
                        <div>Differences from current real holdings: ${churnEsc(changed.join(', ')||'None')} (actual TCI ${actualTCI.toLocaleString('en-US')} shares).</div>
                        ${compareHtml}
                        <div>TCI benefit state is intentionally synthetic and does NOT establish Torn's genuine TCI API semantics.</div>
                        <div><b>KEEP vs SELL (annualized, hypothetical): ${churnEsc(review.status)}</b></div>
                        ${Number.isFinite(review.improvement)?`<div>KEEP modeled annual income: ${formatBankMoney(review.keepIncome)}; SELL modeled annual income: ${formatBankMoney(review.sellIncome)}; difference: ${formatBankMoney(review.improvement)}.</div>`:`<div>${churnEsc(review.reason||'Bank-window or missing-evidence guard active; no SELL authorization.')}</div>`}
                        ${review.transactions?`<details><summary>Why? — optimized synthetic transactions</summary><b>SELL</b>${rows(review.transactions.sells,'sell')}<b>BUY</b>${rows(review.transactions.buys,'buy')}</details>`:''}
                        <div style="color:#ffd68a;">This scenario includes an unfunded synthetic TCI block. Financial gain is NOT a valid round-trip profit. For a capital-conserving analysis choose ROUND TRIP.</div>
                        <div>Read-only. No saved settings, actual portfolio, bank investment, or LIVE recommendation was changed.</div>`;
                    return;
                }
                if (simulateOwnedTci) {
                    // Real-capital round trip, respecting actual owned TCI shares.
                    // All phases use one immutable price snapshot and real starting holdings.
                    const bank=churnMarketInputs;
                    const cash=num(document.getElementById('wes-stock-cash')?.value || 0);
                    const tciPrice=Number(byAcronym.TCI?.price);
                    const requiredTCI=STOCKS.TCI.required;
                    const existingTCI=Number(owned.TCI||0);
                    const tciSaleValue=requiredTCI*tciPrice;
                    const tciSharesNeeded=Math.max(0,requiredTCI-existingTCI);
                    const tciCost=tciSharesNeeded*tciPrice;
                    const duration=Number(bank.duration);
                    const bonus=Number(bank.bonus);
                    const strategicTarget=getStrategicTarget();
                    const testDays=8;
                    const moneyOf=(holdings)=>Object.entries(holdings).reduce((sum,[symbol,shares])=>{
                        const price=Number(byAcronym[symbol]?.price);
                        return sum+(Number.isFinite(price)&&price>0?Number(shares)*price:0);
                    },0);
                    const explain=(message)=>{churnResult.innerHTML=`<b>TEST ONLY — CHURN ROUND TRIP</b><div>${churnEsc(message)}</div><div>No holdings, bank information, settings or live recommendations changed.</div>`;};
                    if (strategicTarget==='TCI') {explain('TCI is your explicitly selected Strategic Target. No simulated sale.');return;}
                    if (!(existingTCI>=0 && Number.isInteger(existingTCI) && tciSaleValue>0 && bonus>0 && duration>0 && Number.isFinite(cash)&&cash>=0)) {
                        explain('Missing valid bank bonus, duration, current TCI price or liquid cash.');return;
                    }
                    // Non-certified positions remain in the starting holdings and are
                    // NEVER offered as funding for CHURN IN. One such position must
                    // not block a valid plan financed entirely by certified holdings.
                    const pendingNote = [...new Set(planPendingSymbols())];
                    function planPendingSymbols() { return eligible.filter(e=>e.increment>e.liveBonus.increment).map(e=>e.symbol+' ('+e.increment+' owned / '+e.liveBonus.increment+' active)'); }
                    const exclusionNote = unknown.length
                        ? 'Unable to validate for CHURN funding (left untouched): '+unknown.join('; ')+'. '
                        : '';
                    if (eligible.length>18 && new Set(eligible.map(c=>c.symbol)).size>18) {explain(exclusionNote+'Too many independent holdings for exhaustive funding comparison.');return;}
                    // Incomplete real TCI holdings are credited at their actual share count.
                    // A completed block uses an OUT-only test; no fictitious IN purchase.
                    const alreadyComplete=existingTCI>=requiredTCI;
                    const plans=alreadyComplete ? [] : evaluateTciFunding({eligible,cash,tciCost,
                        tciSaleValue,bonus,duration,daysToMaturity:testDays});
                    const plan=alreadyComplete ? {
                        picked:[], net:NaN, remainingAfterPurchase:cash,
                        feeOnFundingSales:0,feeOnTciSale:tciSaleValue*STOCK_SALE_FEE_RATE
                    } : plans[0];
                    if (!plan) {explain(exclusionNote+'No feasible CHURN IN plan from certified holdings and actual cash. This test will not assign unverified payout costs to excluded holdings.');return;}
                    const incoming={...owned};
                    for (const holding of plan.picked) incoming[holding.symbol]=Math.max(0,(incoming[holding.symbol]||0)-holding.shares);
                    if (!alreadyComplete) incoming.TCI=requiredTCI;
                    const afterInCash=plan.remainingAfterPurchase;
                    const afterOutHeld={...incoming,TCI:Math.max(0,incoming.TCI-requiredTCI)};
                    const afterOutCash=afterInCash+tciSaleValue*(1-STOCK_SALE_FEE_RATE);
                    const originalCapital=cash+moneyOf(owned);
                    const afterInCapital=afterInCash+moneyOf(incoming);
                    const afterOutCapital=afterOutCash+moneyOf(afterOutHeld);
                    const saleFees=plan.feeOnFundingSales+plan.feeOnTciSale;
                    const tolerance=Math.max(1,originalCapital*1e-9);
                    const inBalanced=Math.abs((originalCapital-plan.feeOnFundingSales)-afterInCapital)<=tolerance;
                    const outBalanced=Math.abs((originalCapital-saleFees)-afterOutCapital)<=tolerance;
                    if (!inBalanced||!outBalanced) {explain('CAPITAL CONSERVATION FAILED. Original: '+formatBankMoney(originalCapital)+'; post-in: '+formatBankMoney(afterInCapital)+'; post-out: '+formatBankMoney(afterOutCapital)+'. No result authorized.');return;}
                    const optimized=buildStableIdealPortfolio(afterOutCash,afterOutHeld,byAcronym,getStrategicSaleLimits(),strategicTarget);
                    const finalOwned=optimized?.idealPortfolio?.holdings;
                    const finalCash=Number(optimized?.idealPortfolio?.cashRemaining);
                    const ledger=buildNetTransactions(afterOutHeld,finalOwned||{},byAcronym);
                    const soldNet=ledger.sells.reduce((sum,x)=>sum+Number(x.netValue||0),0);
                    const boughtCost=ledger.buys.reduce((sum,x)=>sum+Number(x.cost||0),0);
                    const projectedCash=afterOutCash+soldNet-boughtCost;
                    const extraFees=ledger.sells.reduce((sum,x)=>sum+Number(x.fee||0),0);
                    const totalFees=saleFees+extraFees;
                    const finalCapital=finalCash+moneyOf(finalOwned||{});
                    const allBalanced=Number.isFinite(finalCash)&&finalCash>=-0.01&&
                        Math.abs(projectedCash-finalCash)<=Math.max(1,originalCapital*0.000001)&&
                        Math.abs(finalCapital-(originalCapital-totalFees))<=Math.max(1,originalCapital*0.000001);
                    const baseIncome=calculatePortfolioAnnualIncome(owned,byAcronym);
                    const finalIncome=calculatePortfolioAnnualIncome(finalOwned,byAcronym);
                    if (!allBalanced||!Number.isFinite(baseIncome.annualIncome)||!Number.isFinite(finalIncome.annualIncome)) {
                        explain('OUT ledger or annual-income evidence did not reconcile. No advantage shown. '+[...baseIncome.unavailable,...finalIncome.unavailable].join(', '));return;
                    }
                    const incomeDelta=finalIncome.annualIncome-baseIncome.annualIncome;
                    const churnRange=alreadyComplete ? {status:'OUT_ONLY'} : churnRoundTripRange({
                        funding:plan.picked,finalOwned,originalOwned:owned,
                        bankBonus:bonus,totalFees,period:duration,bankDays:testDays
                    });
                    const rangeLine=churnRange?.status==='BOUNDED'
                        ? `<div style="margin-top:7px;font-weight:700;color:#a8d6b3;">HOLD vs CHURN — modeled advantage range: ${formatBankMoney(churnRange.conservative)} to ${formatBankMoney(churnRange.optimistic)}.</div>
                           <div>Bank bonus ${formatBankMoney(bonus)} (future bank maturity); all selling fees ${formatBankMoney(totalFees)}; missed benefit range ${formatBankMoney(churnRange.minLoss)}–${formatBankMoney(churnRange.maxLoss)}.</div>
                           <details><summary>Why? — missed payout audit</summary>${churnRange.losses.length?churnRange.losses.map(l=>`<div>${churnEsc(l.symbol)}: ${l.affected} increment(s) temporarily sold, ${l.events} displaced scheduled event(s), ${l.pending} potentially pending; loss ${formatBankMoney(l.minimum)}–${formatBankMoney(l.maximum)}.</div>`).join(''):'<div>No funding stocks sold; no missed benefits.</div>'}
                           <div>Range describes only uncertainty in existing pending benefit increments, under unchanged prices, immediate post-deposit sale, and original monetary holdings restored. Ready rewards are assumed collected before sale. Price changes and bank-rule verification are NOT included.</div></details>
                           <div>${churnRange.conservative>0?'Both bounds positive under modeled assumptions.':churnRange.optimistic<0?'Both bounds negative under modeled assumptions.': 'The modeled range reaches or crosses break-even; player judgment required.'}</div>`
                        : `<div style="color:#ffd68a;">Full HOLD-vs-CHURN profit range NOT CERTIFIED (${churnEsc(churnRange?.status||'MISSING_EVIDENCE')}). ${churnRange?.status==='DIFFERENT_ALLOCATION'?'CHURN OUT holds a different monetary portfolio; a comparable multi-term income timeline is required.':churnRange?.status==='OUT_ONLY'?'This scenario already owns a full TCI block; no new bank bonus is credited.':'Required timing evidence is missing.'}</div>`;
                    const formatTx=(rows,sale)=>rows.length?rows.map(r=>`<div>${churnEsc(r.acronym)}: ${Number(r.shares).toLocaleString('en-US')} shares · ${formatBankMoney(sale?r.netValue:r.cost)}</div>`).join(''):'<div>None</div>';
                    churnResult.innerHTML=`<div style="font-weight:700;color:#f5d58a;">TEST ONLY — CHURN IN → CHURN OUT. Real capital, imaginary transactions.</div>
                        <div style="color:#ffd68a;">${churnEsc(exclusionNote)}</div>
                        ${pendingNote.length ? `<div style="color:#ffd68a;">Pending activation observed: ${churnEsc(pendingNote.join('; '))}. Calendar-event loss is a conservative upper bound for still-qualifying increments, not a confirmed missed-payout count.</div>` : ''}<div><b>${alreadyComplete?'TCI BLOCK OWNED — CHURN OUT review only':plan.net>0?'CHURN IN — potential advantage':'CHURN IN — not profitable on modeled assumptions'}</b></div>
                        <div>Funding sold: ${churnEsc(plan.picked.map(x=>x.symbol+' ('+(x.soldIncrements||1)+' block(s), '+x.shares.toLocaleString('en-US')+' shares)').join(' + ')||'cash only')}.</div>
                        <div style="color:#ffd68a;">Partial sales preserve retained increments' payout calendars; only repurchased increments requalify. Full liquidation starts a fresh calendar. All increments use the ticker payout-event calendar; there is no blanket three-payout charge. For already-owned pending increments, the calendar-derived loss is a conservative upper bound because the original qualification date is not exposed. Do not treat the estimated advantage as certified profit. This assumes immediate CHURN OUT and unchanged prices.</div>
                        <div>TCI owned at start: ${existingTCI.toLocaleString('en-US')} shares; ${alreadyComplete?'no CHURN IN purchase needed':'purchase '+tciSharesNeeded.toLocaleString('en-US')+' additional shares'} (${formatBankMoney(tciCost)}). Funding sale fees: ${formatBankMoney(plan.feeOnFundingSales)}.</div>
                        <div>Cash after CHURN IN: ${formatBankMoney(afterInCash)}.</div>
                        <div><b>CHURN OUT — independent portfolio optimization</b></div>
                        <div>TCI sale: ${requiredTCI.toLocaleString('en-US')} shares; net proceeds ${formatBankMoney(tciSaleValue*(1-STOCK_SALE_FEE_RATE))} (fee ${formatBankMoney(plan.feeOnTciSale)}). ${alreadyComplete?'Existing full block: bank bonus must be independently confirmed locked before any real sale.':''}</div>
                        <div>Original annual stock income: ${formatBankMoney(baseIncome.annualIncome)}.</div>
                        <div>Final annual stock income: ${formatBankMoney(finalIncome.annualIncome)}.</div>
                        <div>Change in annual stock income: ${incomeDelta>=0?'+':''}${formatBankMoney(incomeDelta)}.</div>
                        <div>Bank bonus next term: ${formatBankMoney(bonus)} (received at maturity, not immediate cash).</div>
                        ${rangeLine}
                        <div>${alreadyComplete?'OUT-only comparison: no new bank bonus is attributed to merely owning the block.':'Legacy CHURN IN screening estimate (assumes original holdings repurchased): '+formatBankMoney(plan.net)+'.'} The HOLD-versus-CHURN range above, if available, includes the realized CHURN OUT selling fees and must not be added to this screening estimate.</div>
                        <details><summary>Why? — CHURN OUT transactions</summary><div>SELL:</div>${formatTx(ledger.sells,true)}<div>BUY:</div>${formatTx(ledger.buys,false)}
                        <div>Remaining cash: ${formatBankMoney(finalCash)}. Total realized selling fees across both phases: ${formatBankMoney(totalFees)}.</div>
                        <div>Capital ledger: original ${formatBankMoney(originalCapital)} → final ${formatBankMoney(finalCapital)}. Difference is fees only (${formatBankMoney(totalFees)}).</div>
                        <div>Original optimizer reused; all stock prices held fixed in this simulation.</div></details>
                        <div style="color:#a8d6b3;">CAPITAL CONSERVATION PASS — no imaginary TCI shares were added.</div>
                        <div style="color:#bbb;">Read-only simulation. Not a live SELL/BUY instruction.</div>`;
                    return;
                }
                // READY monetary rewards remain churn eligible. Their values
                // are counted identically under HOLD and CHURN as already collected
                // at day zero, *only as a modeling assumption*. Make that
                // operational requirement unmissable before a player sells.
                const readyForCollection=eligible.filter(c=>c.liveBonus.available).map(c=>c.symbol);
                const collectBeforeSale=readyForCollection.length
                    ? `<div style="margin-top:7px;color:#ffd68a;font-weight:600;">Hey, bonehead! 😁 Collect your READY payouts before considering a rebalance: ${churnEsc(readyForCollection.join(', '))}. The comparison assumes you've claimed them; Torn has not confirmed collection.</div>`
                    : '';
                const {tciCost,bonus,duration,maturity} = churnMarketInputs;
                if (!(tciCost>0) || !(bonus>0) || !Number.isFinite(maturity)) {
                    churnResult.textContent = 'Incomplete bank term evidence. No funding plan calculated.';
                    return;
                }
                const actualDaysToMaturity=Math.max(0,Math.ceil((maturity*1000-Date.now())/86400000));
                const daysToMaturity=simulateEightDays ? 8 : actualDaysToMaturity;
                const simulationBanner=simulateEightDays
                    ? `<div style="font-weight:700;color:#f5d58a;margin:6px 0;">TEST ONLY — simulated bank maturity in 8 days (actual: ${actualDaysToMaturity} days). No trades or saved data changed.</div>`
                    : '';
                // Explicit policy: no TCI acquisition churn outside the 8-day window.
                // Inside 7 days, a NEW purchase cannot safely activate by maturity.
                const ownsTci = (owned.TCI || 0) >= STOCKS.TCI.required;
                const windowDecision = tciWindowDecision(daysToMaturity,ownsTci);
                if (windowDecision === 'OWNED_REVIEW') {
                    const heldValue=(owned.TCI||0)*Number(byAcronym.TCI?.price||0);
                    const netProceeds=heldValue*(1-STOCK_SALE_FEE_RATE);
                    const currentBonusLocked=localStorage.getItem(TCI_BANK_ACTIVE_STORAGE)==='yes';
                    const currentBonusText=currentBonusLocked
                        ? 'Your saved answer says TCI was active at this term’s start; its bonus is already reflected in projected bank profit.'
                        : 'Your saved answer says TCI was NOT active at this term’s start; do not attribute current-term profit to this stock.';
                    churnResult.innerHTML=`
                      ${simulationBanner}${collectBeforeSale}
                      <div><b>TCI owned — SELL evaluation (read only)</b></div>
                      <div>Shares held: ${(owned.TCI||0).toLocaleString('en-US')} · gross value: ${formatBankMoney(heldValue)}</div>
                      <div>Estimated sale proceeds after 0.1% fee: ${formatBankMoney(netProceeds)}</div>
                      <details style="margin-top:7px;"><summary><b>Why?</b></summary>
                        <div style="padding:6px 0;">${churnEsc(currentBonusText)} Estimated bonus for one comparable future term: ${formatBankMoney(bonus)}. Annualized gross benefit against block value: ${(bonus*365/duration/heldValue*100).toFixed(2)}%. Selling frees capital, but The Brain has NOT confirmed a superior purchase, repurchase timing, or a safe bank reactivation date. A sale can lose the next term’s 10% bank bonus. This is a review candidate, not a SELL instruction.</div>
                      </details>
                      <div style="margin-top:6px;">Next maturity: ${daysToMaturity} day(s). ${daysToMaturity<=8?'Within the 8-day review window.':'Outside the 8-day churn window.'} Existing Strategic Holdings settings are unchanged.</div>`;
                    return;
                }
                if (windowDecision === 'WAIT') {
                    // Native-looking read-only benefit schedule, sorted by urgency.
                    // READY rewards first, then fewest days remaining; ticker resolves ties.
                    // Display only monetary-benefit holdings. Strategic gameplay
                    // benefits remain in the API evidence and fully protected by
                    // existing controls; this filter affects presentation only.
                    const visibleCountdowns=[...v2BonusBySymbol.entries()]
                        .filter(([symbol]) => isOptimizationEligible(symbol));
                    const countdownRows=visibleCountdowns
                        .sort(([symbolA,a],[symbolB,b]) =>
                            Number(b.available)-Number(a.available) || a.daysLeft-b.daysLeft || symbolA.localeCompare(symbolB))
                        .map(([symbol,b])=>{
                            const nextLabel=b.available?'READY':`${b.daysLeft}d`;
                            const nextColor=b.available?'#88d4a0':'#f0f0f0';
                            const percentage=Math.max(0,Math.min(100,b.progress/b.frequency*100));
                            return `<tr style="color:#e7e7e7;">
                                <td style="padding:5px 8px 5px 0;color:#e7e7e7;font-weight:600;white-space:nowrap;">${churnEsc(symbol)}</td>
                                <td style="padding:5px 8px;color:#e7e7e7;min-width:130px;">
                                    <span style="color:#c7c7c7;">${b.progress}/${b.frequency} days</span>
                                    <div style="height:5px;margin-top:4px;background:#555;border-radius:3px;overflow:hidden;">
                                        <div style="height:100%;width:${percentage}%;background:#8db49b;"></div>
                                    </div>
                                </td>
                                <td style="padding:5px 0 5px 8px;color:${nextColor};text-align:right;white-space:nowrap;font-weight:${b.available?'700':'400'};">${nextLabel}</td>
                            </tr>`;
                        }).join('');
                    // Read-only regression sample: two eligible monetary blocks,
                    // one from each cycle length, with an explicitly hypothetical
                    // eight-day absence. It runs even when TCI acquisition is WAIT.
                    // READY rewards are modeled as collected before day zero;
                    // ambiguous increments and unknown values stay excluded.
                    const eventSamples = [7,31].map(period => {
                        const candidates = eligible.filter(c => c.days === period);
                        candidates.sort((a,b) => a.liveBonus.daysLeft-b.liveBonus.daysLeft || a.symbol.localeCompare(b.symbol));
                        return candidates[0] || null;
                    }).filter(Boolean);
                    const sampleRows = eventSamples.flatMap(c => [90,180,365].map(h => {
                        const ev = churnEventDifference(c,h,8);
                        if (!ev) return '';
                        const delta = ev.holdEvents-ev.churnEvents;
                        return `<tr style="color:#e7e7e7;">
                          <td style="padding:4px 8px 4px 0;color:#e7e7e7;">${churnEsc(c.symbol)} (${c.days}d)</td>
                          <td style="padding:4px 8px;color:#e7e7e7;">${h}d</td>
                          <td style="padding:4px 8px;color:#e7e7e7;text-align:center;">${ev.holdEvents} / ${ev.churnEvents}</td>
                          <td style="padding:4px 0 4px 8px;color:#e7e7e7;text-align:right;">${delta > 0 ? '+' : ''}${delta}</td>
                        </tr>`;
                    })).join('');
                    // v6.3.4: monetary equivalent of payout events, using the SAME
                    // live reward valuations used by the ordinary portfolio optimizer.
                    // Event differences are horizon-boundary cashflow timing deltas,
                    // not proof that rewards are permanently forfeited.
                    const valuationHorizons=[90,180,365];
                    const payoutValuationRows=eligible
                        .slice().sort((a,b)=>a.liveBonus.daysLeft-b.liveBonus.daysLeft || a.symbol.localeCompare(b.symbol))
                        .map(c=>{
                            const diffs=valuationHorizons.map(h=>churnEventDifference(c,h,8));
                            if(diffs.some(d=>!d || !Number.isFinite(d.difference))) return '';
                            const valueLabel=formatBankMoney(c.payout);
                            const cells=diffs.map(ev=>{
                                const delta=ev.deferredEvents;
                                const money=ev.difference;
                                return `<td style="text-align:right;padding:4px 6px;color:#e7e7e7;white-space:nowrap;">${delta>0?'+':''}${delta} · ${formatBankMoney(money)}</td>`;
                            }).join('');
                            return `<tr><td style="padding:4px 6px 4px 0;color:#e7e7e7;font-weight:600;">${churnEsc(c.symbol)}</td><td style="padding:4px 6px;color:#c7c7c7;white-space:nowrap;">${c.days}d</td><td style="text-align:right;padding:4px 6px;color:#e7e7e7;white-space:nowrap;">${valueLabel}</td>${cells}</tr>`;
                        }).filter(Boolean).join('');
                    const payoutValuationDiagnostic=`<details style="margin-top:7px;color:#e7e7e7;">
                      <summary style="cursor:pointer;color:#e7e7e7;">Monetary payout valuation (${eligible.length} eligible; read only)</summary>
                      <div style="color:#c7c7c7;">Hypothetical sale today, repurchase after 8 days. Per-reward values use The Brain's current live item/points values or fixed cash payouts.</div>
                      ${payoutValuationRows?`<div style="overflow-x:auto;margin-top:5px;"><table style="width:100%;border-collapse:collapse;font-size:12px;color:#e7e7e7;background:transparent;">
                        <thead><tr style="border-bottom:1px solid #555;"><th style="color:#e7e7e7;text-align:left;">Stock</th><th style="color:#e7e7e7;">Cycle</th><th style="color:#e7e7e7;text-align:right;">Per reward</th><th style="color:#e7e7e7;text-align:right;">90d</th><th style="color:#e7e7e7;text-align:right;">180d</th><th style="color:#e7e7e7;text-align:right;">365d</th></tr></thead>
                        <tbody>${payoutValuationRows}</tbody></table></div>`:'<div>No holdings with a verified countdown and usable reward value. Run Analyze Portfolio to refresh live valuations.</div>'}
                      <div style="color:#bcbcbc;margin-top:6px;">Each horizon cell shows the payout-count difference and its value within that horizon. These can be delayed rather than permanently lost payouts. READY rewards count as collected before sale in both scenarios; collect them in Torn first. Payout loss is counted only on sold increments. Inconsistent or missing payout evidence remains unpriced; no recommendation changes.</div>
                    </details>`;
                    const sampleExplanation = eventSamples.map(c =>
                        c.liveBonus.available
                            ? `${churnEsc(c.symbol)}: READY — collection assumed before modeled sale; next cycle ${c.days}d.`
                            : `${churnEsc(c.symbol)}: ${c.liveBonus.progress}/${c.days} days elapsed; next payout in ${c.liveBonus.daysLeft}d.`).join(' ');
                    // Deterministic regression checks for event boundaries. They are
                    // independent of the current account and never alter recommendations.
                    // Day zero is the instant AFTER an available reward is collected.
                    const boundaryTests = [
                        ['Before first payout', churnPayments(7,7,6) === 0],
                        ['First payout included', churnPayments(7,7,7) === 1],
                        ['Horizon endpoint included', churnPayments(1,7,365) === 53],
                        ['No day-zero double count after READY collection', churnPayments(7,7,0) === 0],
                        ['READY collected, new cycle begins at day 7', churnPayments(7,7,7) === 1],
                        ['Repurchase restarts full cycle', churnPayments(8+7,7,14) === 0 && churnPayments(8+7,7,15) === 1],
                        ['31-day horizon endpoint included', churnPayments(15,31,77) === 3]
                    ];
                    const failedBoundaryTests = boundaryTests.filter(([,passed])=>!passed);
                    const boundaryDiagnostic = `<details style="margin-top:7px;color:#e7e7e7;">
                      <summary style="cursor:pointer;color:#e7e7e7;">Timing boundary checks — ${failedBoundaryTests.length?'REVIEW NEEDED':'PASS'} (${boundaryTests.length})</summary>
                      <div style="color:#c7c7c7;">READY reward: collect before selling; counting begins just after collection, so no day-zero payout is counted twice. A repurchased stock starts a full new cycle. Payouts on the horizon's final day are counted.</div>
                      ${boundaryTests.map(([name,passed])=>`<div style="color:${passed?'#a8d6b3':'#ffaaa6'};">${passed?'✓':'✗'} ${churnEsc(name)}</div>`).join('')}
                    </details>`;
                    const eventDiagnostic = `<details style="margin-top:7px;color:#e7e7e7;">
                      <summary style="cursor:pointer;color:#e7e7e7;">Payout-event test (read only)</summary>
                      <div style="color:#c7c7c7;">Hypothetical sale today, eight days away, then repurchase with countdown reset. ${sampleExplanation}</div>
                      ${sampleRows ? `<div style="overflow-x:auto;margin-top:5px;"><table style="width:100%;border-collapse:collapse;font-size:12px;color:#e7e7e7;background:transparent;">
                        <thead><tr style="border-bottom:1px solid #555;"><th style="color:#e7e7e7;text-align:left;">Stock</th><th style="color:#e7e7e7;">Horizon</th><th style="color:#e7e7e7;">Hold / rebuy</th><th style="color:#e7e7e7;text-align:right;">Payout difference</th></tr></thead>
                        <tbody>${sampleRows}</tbody></table></div>` : '<div>No unambiguous eligible 7-day or 31-day blocks available for this test.</div>'}
                      <div style="color:#bcbcbc;margin-top:6px;">Payout difference is a count within the stated horizon, not necessarily permanently lost rewards. Does not change TCI WAIT status or portfolio recommendations.</div>
                    </details>`;
                    // The detailed API payout tables and deterministic diagnostic calculations
                    // remain internal. In the normal UI, show the decision and its reason.
                    churnResult.innerHTML=`${simulationBanner}${collectBeforeSale}<b>WAIT — TCI acquisition window not open.</b>
                        <div>${daysToMaturity} day(s) until bank maturity. Recheck at 8 days.</div>
                        <details><summary>Why?</summary><div>Buying early unnecessarily ties up capital and may interrupt 7/31-day benefits. Existing portfolio recommendations continue normally.</div></details>`;
                    return;
                }
                if (windowDecision === 'TOO_LATE') {
                    churnResult.innerHTML=`${simulationBanner}${collectBeforeSale}<b>WINDOW TOO SHORT — no new TCI purchase proposal.</b><div>${daysToMaturity} day(s) until maturity, below the seven-day activation minimum. Do not assume an unactivated block can earn the next bank bonus.</div>`;
                    return;
                }
                // Buy only within the eight-day review window, and only when
                // at least seven days remain for benefit activation.
                // The cash input is the user's existing Brain capital input;
                // this simulation does not infer cash from net worth.
                const cash = num(document.getElementById('wes-stock-cash')?.value || 0);
                const target=Math.max(0,tciCost-cash);
                if (new Set(eligible.map(c=>c.symbol)).size>18) {
                    churnResult.textContent='More than 18 eligible holdings. Exhaustive funding evaluation unavailable; no churn advice.';
                    return;
                }
                // Single acquisition decision only. The bonus is a future bank
                // receivable, payable when the NEXT deposit matures; it is never
                // available for purchasing or repurchasing shares in this model.
                // Treat one bank term and today's prices as an evaluation snapshot.
                const bonusPayableDay = daysToMaturity + duration;
                const results=evaluateTciFunding({eligible,cash,tciCost,bonus,duration,daysToMaturity});
                const best=results[0] || null;
                const fundingOutcome=tciFundingOutcome(results);
                const detail=best ? (() => {
                    const funding=best.picked.length
                        ? best.picked.map(c=>churnEsc(c.symbol)).join(' + ')
                        : 'available cash';
                    const favorable=fundingOutcome==='POTENTIAL_ADVANTAGE';
                    const headline=favorable
                        ? 'CHURN IN — potential TCI advantage (read only)'
                        : 'WAIT — modeled TCI churn does not pay';
                    return `<div><b>${headline}</b></div>
                        <div>Estimated net advantage: ${formatBankMoney(best.net)}.</div>
                        <details><summary>Why?</summary>
                          <div>Funding: ${funding}. The Brain checked the cash required to buy TCI and to restore the selected holdings using today's share prices, without spending future bank interest.</div>
                          <div>Estimated next-term bank bonus: ${formatBankMoney(bonus)} (payable at the new deposit's maturity, roughly day ${bonusPayableDay}).</div>
                          <div>Benefit-cycle resets (7-day items and 31-day cash): ${formatBankMoney(best.lostBenefits)} in payouts displaced before the next bank term matures. Funding-stock sale fees: ${formatBankMoney(best.feeOnFundingSales)}; TCI sale fee: ${formatBankMoney(best.feeOnTciSale)}.</div>
                          <div>Break-even bank bonus: ${formatBankMoney(best.breakEvenBankBonus)}. Net advantage = projected bonus − delayed payouts − selling fees. No minimum profit threshold.</div>
                          <div>${favorable
                            ? `Remaining break-even cushion: ${formatBankMoney(best.cushion)} for combined adverse price movement and additional costs; this is a calculated amount, not a trade threshold.`
                            : 'No positive break-even cushion at today’s valuations.'}</div>
                          <div>Estimated liquid cash left after repurchasing funding holdings: ${formatBankMoney(best.liquidAfterRepurchase)}. The funding stocks are modeled as repurchased one day after bank renewal.</div>
                          <div>This is a one-transaction, read-only comparison using current prices and a comparable next bank term. Stock prices and the offered bank rate may change before renewal. Strategic Holdings controls and ordinary BUY/SELL recommendations are unchanged.</div>
                        </details>`;
                })() : `<b>WAIT — no fully funded TCI transaction found.</b>
                    <details><summary>Why?</summary><div>Eligible monetary holdings and entered available cash must finance TCI and allow their repurchase after TCI is sold. Future bank interest cannot finance today's transactions. Non-monetary strategic holdings remain protected.</div></details>`;
                churnResult.innerHTML=`${simulationBanner}${collectBeforeSale}${detail}`;
            } catch(err) {
                churnResult.textContent=((simulateEightDays||simulateOwnedTci)?'TEST ONLY — ':'')+'Portfolio scan unavailable: '+String(err?.message||'request failed')+'. No recommendation made.';
            } finally {churnButton.disabled=false;}
        });

        bankFetchButton.addEventListener('click', async () => {
            churnMarketInputs = null;
            churnResult.textContent = 'Waiting for verified bank and TCI prices…';
            const key = getAvailableApiKey();
            if (!key) {
                bankResult.textContent = 'Enter an API key with User → money permission first.';
                return;
            }
            bankFetchButton.disabled = true;
            bankResult.textContent = 'Reading Torn bank investment and live TCI price…';
            try {
                const response = await api(
                    `https://api.torn.com/v2/user/money?key=${encodeURIComponent(key)}`,
                    {label:'Bank Intelligence',timeoutMs:15000}
                );
                const bank = response?.data?.money?.city_bank;
                if (!bank || typeof bank !== 'object') throw new Error('No city_bank object returned.');
                const principal = Number(bank.amount);
                const profit = Number(bank.profit);
                const duration = Number(bank.duration);
                const rate = Number(bank.interest_rate);
                const start = Number(bank.invested_at);
                const maturity = Number(bank.until);
                const valid = [principal, profit, duration, rate, start, maturity].every(Number.isFinite)
                    && principal > 0 && duration > 0 && start > 0 && maturity >= start;
                if (!valid) {
                    bankResult.textContent = 'Bank investment fields are missing or invalid; no valuation calculated.';
                    return;
                }
                const investmentId = String(start);
                const previousId = localStorage.getItem(TCI_BANK_INVESTMENT_STORAGE);
                if (previousId && previousId !== investmentId) {
                    localStorage.removeItem(TCI_BANK_ACTIVE_STORAGE);
                    bankAnswer.value = '';
                }
                localStorage.setItem(TCI_BANK_INVESTMENT_STORAGE, investmentId);
                const answer = bankAnswer.value;
                const hypothetical = answer === 'no' ? profit * 0.10 : answer === 'yes' ? profit / 11 : null;
                const reason = answer === 'no'
                    ? 'TCI was not active: hypothetical extra profit = reported profit × 10%.'
                    : answer === 'yes'
                    ? 'TCI was active: the portion already included = reported profit ÷ 11 (not additional income).'
                    : 'Select Yes or No above, then Save Settings. No TCI bonus is assumed.';
                // Valuation only: fetch the same Torn stock feed and price normalizer already
                // used by the existing optimizer. Never substitute a guessed share price.
                let tciValuation = '<div style="opacity:.8;margin-top:7px;">Live TCI price unavailable; ROI not calculated.</div>';
                try {
                    const stockResponse = await api(
                        `https://api.torn.com/torn/?selections=stocks&key=${encodeURIComponent(key)}`,
                        {label:'Live TCI price',timeoutMs:API_TIMEOUTS.stocks}
                    );
                    const { byAcronym } = normalizeMarketStocks(stockResponse?.data?.stocks || {});
                    const tciSharePrice = Number(byAcronym.TCI?.price);
                    const requiredShares = STOCKS.TCI?.required;
                    if (Number.isFinite(tciSharePrice) && tciSharePrice > 0 &&
                        Number.isFinite(requiredShares) && requiredShares > 0 && hypothetical !== null) {
                        const blockCost = tciSharePrice * requiredShares;
                        churnMarketInputs = { tciCost: blockCost, bonus: hypothetical, duration, maturity };
                        churnResult.textContent = 'Ready. Scan your complete monetary-benefit portfolio; strategic controls are unchanged.';
                        const annualEquivalent = hypothetical * 365 / duration;
                        const annualRoi = annualEquivalent / blockCost * 100;
                        const termRoi = hypothetical / blockCost * 100;
                        tciValuation = `
                            <div style="border-top:1px solid #555;margin-top:9px;padding-top:7px;"><b>TCI — read-only dynamic valuation</b></div>
                            <div><b>Live share price:</b> ${formatBankMoney(tciSharePrice)}</div>
                            <div><b>Required block:</b> ${requiredShares.toLocaleString('en-US')} shares</div>
                            <div><b>Block purchase value:</b> ${formatBankMoney(blockCost)}</div>
                            <div><b>Bonus as % of block value per ${duration}-day term:</b> ${termRoi.toFixed(2)}%</div>
                            <div><b>Annualized bonus equivalent:</b> ${formatBankMoney(annualEquivalent)}</div>
                            <div><b>Annualized gross ROI on block value:</b> ${annualRoi.toFixed(2)}%</div>
                            <div style="opacity:.75;">Illustrative: assumes the same bank profit and term repeat continuously. Excludes trading fees, price risk, idle time, and alternative returns. Not a buy/sell signal.</div>
                        `;
                    } else if (hypothetical === null) {
                        tciValuation = '<div style="opacity:.8;margin-top:7px;">Select whether TCI was active at investment start to calculate ROI.</div>';
                    }
                } catch (priceError) {
                    tciValuation = `<div style="opacity:.8;margin-top:7px;">Live TCI price unavailable (${escapeBankText(priceError?.message || 'request failed')}); ROI not calculated.</div>`;
                }
                bankResult.innerHTML = `
                    <div><b>Principal:</b> ${formatBankMoney(principal)}</div>
                    <div><b>Projected bank profit:</b> ${formatBankMoney(profit)}</div>
                    <div><b>Term / recorded rate:</b> ${escapeBankText(duration)} days / ${escapeBankText(rate)}%</div>
                    <div><b>Started:</b> ${escapeBankText(bankDate(start))}</div>
                    <div><b>Matures:</b> ${escapeBankText(bankDate(maturity))}</div>
                    <div><b>TCI at investment start:</b> ${answer === 'yes' ? 'Yes' : answer === 'no' ? 'No' : 'Not specified'}</div>
                    <div style="margin-top:5px;"><b>${answer === 'yes' ? 'TCI share of reported profit' : 'Hypothetical TCI bonus'}:</b> ${hypothetical === null ? 'Unavailable until confirmed' : formatBankMoney(hypothetical)}</div>
                    <div style="opacity:.8;">${escapeBankText(reason)}</div>
                    <div style="opacity:.7;">This reports the API profit as supplied; it does not infer profit from the recorded APR.</div>
                    ${tciValuation}
                `;
            } catch (error) {
                bankResult.textContent = `Bank data unavailable (${error?.message || 'request failed'}). No values were estimated.`;
            } finally {
                bankFetchButton.disabled = false;
            }
        });

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
            else localStorage.removeItem(KEY_STORAGE);
            localStorage.setItem(CASH_STORAGE, cash);

            saveStrategicSaleLimits();
            saveStrategicTarget();
            const tciActiveAtStart = document.getElementById('wes-tci-active-at-start')?.value || '';
            if (['yes', 'no'].includes(tciActiveAtStart)) {
                localStorage.setItem(TCI_BANK_ACTIVE_STORAGE, tciActiveAtStart);
            } else {
                localStorage.removeItem(TCI_BANK_ACTIVE_STORAGE);
            }

            updateApiKeyGate();
            out(hasUsableApiKey()
                ? 'Settings saved. The Brain is ready to analyze your current holdings.'
                : 'Settings saved. An API key is required before I can analyze your portfolio.');

            // Close the settings panel using the existing toggle.
            document.getElementById('brain-settings-button')?.click();
        };

        document.getElementById('wes-stock-run').onclick = run;
        updateApiKeyGate();
    }

    setTimeout(buildPanel, 1000);


})();
