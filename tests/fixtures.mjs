// fixtures.mjs: test inputs shared by several test files.

/**
 * CLAUDE.md §4.5, checkable by hand. It must stay in the tests:
 * gross 40%, EBITDA 20%, EBIT 15%, net 9.6%, ROA 9.6%, ROE 24%, ROCE 15%, ROIC 15%;
 * DuPont 9.6% × 1.00 × 2.50 = 24%.
 */
export const HAND_CASE = Object.freeze({
  revenue: 1000, cogs: 600, opex: 200, da: 50, otherIncome: null, interest: 30, tax: 24,
  assets: 1200, equity: 500, currentLiabilities: 200, debt: 400, cash: 100,
  priorAssets: 800, priorEquity: 300,
});
