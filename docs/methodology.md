# Company rating: methodology

How Profitability Lens turns a few lines of financial statements into an A–E profitability grade.
The code is in [`src/rating/`](../src/rating/) and every rule below is covered by tests in [`tests/`](../tests/).

> **The benchmarks are rule-of-thumb values**, chosen as starting points for learning.
> They are not official statistics and have not yet been calibrated against published sector data.

## 1. Inputs

| Field | Croatian term | Required | Allowed values |
|---|---|---|---|
| Revenue | poslovni prihodi / prihodi od prodaje | yes | > 0 |
| Cost of goods sold | nabavna vrijednost prodane robe / troškovi prodanih proizvoda | no | ≥ 0 |
| Operating expenses (excl. D&A) | poslovni rashodi bez amortizacije | no | ≥ 0 |
| Depreciation & amortisation | amortizacija | no | ≥ 0 |
| Other financial income, net | ostali financijski prihodi umanjeni za financijske rashode (bez kamata) | no | any |
| Interest expense | rashodi s osnove kamata | no | ≥ 0 |
| Income tax | porez na dobit | no | any (negative = tax credit) |
| Total assets | ukupna aktiva | yes | > 0 |
| Total equity | kapital i rezerve | yes | any |
| Current liabilities | kratkoročne obveze | no | ≥ 0 |
| Interest-bearing debt | obveze po kreditima i zajmovima | no | ≥ 0 |
| Cash | novac u banci i blagajni | no | ≥ 0 |
| Total assets, prior year | ukupna aktiva, prethodna godina | no | > 0 |
| Total equity, prior year | kapital i rezerve, prethodna godina | no | any |

A blank optional amount counts as 0, except the three that a ratio depends on: cost of goods sold (gross margin), current liabilities (ROCE) and interest-bearing debt (ROIC). Those stay blank and the ratio is reported as *missing*.

Amounts can be typed in Croatian (`1.234.567,89`) or English (`1,234,567.89`) format, with spaces as thousands separators, brackets for negatives (`(12.500)`) and currency symbols. With a single separator, three digits after it mean thousands (`1.234` = 1 234), anything else means decimals (`1,5` = 1.5). Two exceptions follow from how thousands are written: a first group of `0` or of more than three digits is never a thousands group (`0,125` = 0.125, `1234.567` = 1 234.567), and once spaces separate thousands a lone `.` or `,` is the decimal separator (`1 234,567` = 1 234.567).

## 2. Derived statement

```
GrossProfit     = Revenue − COGS                                   (only when COGS is given)
EBITDA          = Revenue − COGS − Operating expenses              (COGS counts as 0 when blank)
EBIT            = EBITDA − D&A
EBT             = EBIT + Other financial income − Interest
NetIncome       = EBT − Tax
TaxRate         = Tax ÷ EBT when EBT > 0, clamped to 0–50 %; otherwise 0
NOPAT           = EBIT × (1 − TaxRate)
AvgAssets       = (Assets + Prior-year assets) ÷ 2, or year-end assets without a prior year
AvgEquity       = (Equity + Prior-year equity) ÷ 2, or year-end equity without a prior year
CapitalEmployed = Total assets − Current liabilities               (year end)
InvestedCapital = Debt + Equity − Cash                             (year end)
InterestCover   = EBIT ÷ Interest                                  (only when there is interest)
```

When COGS is blank, all costs are treated as operating expenses. Croatian statements classify costs by nature (materials, staff, depreciation…), so many users will not have a cost-of-goods-sold line.

## 3. Ratios and weights

| Ratio | Formula | Weight | Not available when |
|---|---|---|---|
| Gross margin | Gross profit ÷ Revenue | 10 | COGS blank |
| EBITDA margin | EBITDA ÷ Revenue | 10 | — |
| Operating margin | EBIT ÷ Revenue | 15 | — |
| Net margin | Net income ÷ Revenue | 15 | — |
| ROA | Net income ÷ Average total assets | 15 | — |
| ROE | Net income ÷ Average equity | 15 | year-end or average equity ≤ 0 |
| ROCE | EBIT ÷ Capital employed | 10 | current liabilities blank; capital employed ≤ 0 |
| ROIC | NOPAT ÷ Invested capital | 10 | debt blank; invested capital ≤ 0 |

A ratio is never faked. Each one is reported as **ok** (with its value), **missing** (naming the blank input it needs) or **not meaningful** (with the reason).

**DuPont breakdown.** ROE = Net margin × Asset turnover × Equity multiplier, where asset turnover = Revenue ÷ Average assets and equity multiplier = Average assets ÷ Average equity. When ROE is not meaningful, net margin and asset turnover are still shown.

## 4. Scoring and grade

1. **Ratio score (0–100).** Each industry has four thresholds per ratio, in percent: *poor*, *fair*, *good*, *excellent*. The score runs in straight lines between these points:

   | Ratio value | Score |
   |---|---|
   | floor = poor − (fair − poor), or below | 0 |
   | poor | 20 |
   | fair | 50 |
   | good | 75 |
   | excellent, or above | 100 |

2. **Band.** At or above *excellent*: Excellent; at or above *good*: Good; at or above *fair*: Fair; at or above *poor*: Weak; below *poor*: Poor. The UI always shows the band as an icon and label, never as colour alone.
3. **Overall score.** The weighted average of the available ratios' scores. The weights of missing and not-meaningful ratios are left out and the rest are renormalised, so a missing ratio neither helps nor hurts. The result is rounded to a whole number, and the coverage is shown ("7 of 8 ratios").
4. **Grade** (from the rounded score): **A** ≥ 80 Excellent, **B** ≥ 65 Strong, **C** ≥ 50 Adequate, **D** ≥ 35 Weak, **E** < 35 Poor.

### Worked example

Revenue 1000, COGS 600, operating expenses 200, D&A 50, interest 30, tax 24; total assets 1200 (prior year 800), equity 500 (prior year 300), current liabilities 200, debt 400, cash 100. On the *General* scale:

| Ratio | Value | General thresholds | Score | Weight |
|---|---|---|---|---|
| Gross margin | 40.0 % | 15 / 25 / 35 / 50 | 83.3 | 10 |
| EBITDA margin | 20.0 % | 3 / 8 / 12 / 20 | 100 | 10 |
| Operating margin | 15.0 % | 1 / 5 / 8 / 15 | 100 | 15 |
| Net margin | 9.6 % | 0 / 3 / 6 / 10 | 97.5 | 15 |
| ROA | 9.6 % | 0 / 3 / 6 / 10 | 97.5 | 15 |
| ROE | 24.0 % | 0 / 8 / 12 / 20 | 100 | 15 |
| ROCE | 15.0 % | 2 / 8 / 12 / 20 | 84.4 | 10 |
| ROIC | 15.0 % | 2 / 6 / 10 / 15 | 100 | 10 |

Weighted average 96.0 → **96/100, grade A**. DuPont: 9.6 % × 1.00 × 2.50 = 24 %.

## 5. Industries

General, Retail & wholesale, Manufacturing, Software & SaaS, Telecom & CPaaS / messaging, Professional services, Tourism & hospitality. All thresholds are in [`src/rating/benchmarks.js`](../src/rating/benchmarks.js). They are **rule-of-thumb values**; the roadmap is to calibrate them against published sector data (for example Damodaran's industry margin and return datasets), recording the source and year of each value.

## 6. Red flags

| Flag | Severity | Rule |
|---|---|---|
| Net loss | critical | net income < 0 |
| Equity is zero or negative | critical | year-end equity ≤ 0 |
| Operating loss despite a positive gross margin | serious | gross profit > 0 and EBIT < 0 (needs COGS) |
| Low interest cover | serious | interest > 0 and EBIT ÷ interest < 1.5× |
| ROE inflated by leverage | warning | equity multiplier > 3 |
| Depreciation takes over half of EBITDA | warning | EBITDA > 0 and D&A > 50 % of EBITDA |
| Rating based on few ratios | warning | available ratios carry < 60 % of the weight |
| No prior-year figures | info | prior-year assets or equity blank |

## 7. Definition choices

Where textbooks differ, the choice made here (also in [`DECISIONS.md`](../DECISIONS.md)):

- **ROE is not meaningful when equity is zero or negative, at year end or on average.** A return on negative capital has no meaning, and an average that is still positive while year-end equity is negative would hide the problem.
- **ROCE and ROIC use year-end capital**, while ROA and ROE use averages when a prior year is given. This follows the formulas in the project brief; averaging all four is a possible later refinement.
- **A tax credit does not raise NOPAT.** The effective tax rate is clamped to 0–50 %, so with a tax credit NOPAT equals EBIT, and a one-off tax charge above 50 % of EBT is capped.
- **Blank cash counts as 0** in invested capital, which gives the more cautious (lower) ROIC.
