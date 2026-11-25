# Methodology: Company rating and segment profitability

How Profitability Lens turns a few lines of financial statements into an A–E profitability grade, a multi-year trend, what-if scenarios and a peer comparison, and how it analyses segment profitability.
The code is in [`src/rating/`](../src/rating/), [`src/segments/`](../src/segments/) and [`src/shared/`](../src/shared/); every rule below is covered by tests in [`tests/`](../tests/).

> **The benchmarks are rule-of-thumb values**, chosen as starting points for learning.
> They are not official statistics and have not yet been calibrated against published sector data.

## 1. Inputs

| Field | Croatian term | Required | Allowed values |
|---|---|---|---|
| Revenue | prihodi od prodaje | yes | > 0 |
| Other operating income | ostali poslovni prihodi | no | ≥ 0 |
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
EBITDA          = Revenue + Other operating income − COGS − Operating expenses   (COGS counts as 0 when blank)
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

Other operating income (rental income, grants, gains on selling equipment, own work capitalised; *ostali poslovni prihodi* in GFI-POD) is part of operating profit but not of revenue, so every margin stays a share of sales. Croatian *poslovni prihodi* is revenue plus other operating income.

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

### Published sector averages (reference only)

Next to each ratio the page marks (▾) the average of **listed European companies** in the industry, and the "How the rating works" table lists it. It is shown for comparison and **never changes a score or a grade**.

- **Source:** Aswath Damodaran (NYU Stern), industry averages for Europe, data as of January 2026: `marginEurope.xls` (gross margin, EBITDA/sales, pre-tax unadjusted operating margin, net margin), `roeEurope.xls` (ROE, unadjusted) and `EVAEurope.xls` (ROC), from [datacurrent.html](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html), downloaded 25 November 2026. The rows used are copied into `src/rating/sector.js`, rounded to two decimals of a percent.
- **Definitions:** each figure is an aggregate (sum of profits ÷ sum of revenues or capital) over listed companies. Damodaran's ROC is after-tax operating income ÷ (book equity + debt − cash), the same as ROIC here. ROA and ROCE are not published, so they have no mark.
- **Industries:** each industry here combines Damodaran industries, averaged with each row's number of firms as its weight:

  | Industry | Damodaran industries (Europe) |
  |---|---|
  | General | Total Market (without financials) |
  | Retail & wholesale | Retail (General), Retail (Grocery and Food), Retail (Distributors), Retail (Special Lines), Retail (Building Supply), Retail (Automotive), Food Wholesalers |
  | Manufacturing | Machinery, Electrical Equipment, Electronics (General), Building Materials, Food Processing, Chemical (Specialty), Packaging & Container, Furn/Home Furnishings, Auto Parts, Steel, Paper/Forest Products, Apparel, Household Products |
  | Software & SaaS | Software (System & Application), Software (Internet) |
  | Telecom & CPaaS / messaging | Telecom. Services, Telecom (Wireless) |
  | Professional services | Business & Consumer Services, Computer Services, Information Services, Advertising |
  | Tourism & hospitality | Hotel/Gaming, Restaurant/Dining |

- **A published EBITDA margin below the operating margin is not shown** (EBITDA is always at least EBIT); this applies to Software & SaaS in the January 2026 data.

**Why the averages do not set the thresholds.** Calibrating the thresholds on these averages was tried: with the average as "fair" the fictional examples fall about two grades (the bakery from B to D), and with the average as "good" about one. The averages describe larger, listed companies, not the small firms the tool is meant for, so they are shown as a reference while the thresholds stay rule-of-thumb (decided by Jan, 25 November 2026).

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
- **Figures sent from the segment module: cost of goods sold = delivery cost + platform cost.** The messaging case study's gross profit is revenue − delivery cost − platform cost, and platform cost (the provider's own per-message infrastructure and support) is a cost of delivering the service, i.e. cost of revenue. Counting it in COGS makes the gross margin in the Company rating equal the gross margin the dashboard shows (20.5 % for the full model year). The figures are the full model year for all markets and channels, whatever filters are set; operating expenses and the balance sheet are left for the user to add.

## 8. What the page shows

- **Show the math** (Learn mode): the ratio's formula, the formula with the user's numbers, the result, and how each building block (gross profit, NOPAT, average equity…) was worked out. Generated by `explainRatio` in `src/rating/report.js`, from the same statement the rating uses.
- **DuPont in plain language** (Learn mode): "each €1 of sales leaves €0.10 of net profit…", one sentence per factor and one for the product.
- **Benchmark track**: runs from the score's floor (poor − (fair − poor), score 0) to as far above "excellent" as "excellent" is above "good", split into the five bands, with a tick at each threshold. A value off the scale is pinned to the end and drawn as a diamond (`src/shared/track.js`).
- **Copy summary**: a plain-text version of the result for email or chat, including the rule-of-thumb caveat.

## 9. Several years

Up to five financial years, entered newest first on year tabs (`src/rating/years.js`).

- **Each year is rated on its own**, against the same industry thresholds. The latest year is the one the grade, ratios and flags describe.
- **The year before supplies the averages.** For every year except the oldest, the prior-year total assets and equity (used for average assets and equity in ROA, ROE and DuPont) are the year-end figures on the previous year's tab. Only the oldest year uses the prior-year fields. Adding an earlier year moves those fields into the new year's balance sheet; removing the oldest year moves them back.
- **Year-on-year changes** compare the latest year with the one before: ratios in percentage points (net margin 8 % → 10 % is +2 pp, not +25 %), amounts in % and interest cover in turns. A % change from a zero or negative base (for example from a loss) has no meaning and is shown as n/m.
- The trend sentence names the score change, the grade change, the ratio that improved most and the one that fell most (in pp) and revenue growth.
- Exported JSON (format version 2) holds every year as `years: [{year, inputs}]`, newest first; files of version 1 (one year) still import.

## 10. What if…

Four levers re-rate the latest year live (`src/rating/whatif.js`):

| Lever | Changes |
|---|---|
| Sales volume ±30 % | revenue and cost of goods sold, in proportion |
| Selling prices ±20 % | revenue only |
| Unit cost of goods ±20 % | cost of goods sold only (needs COGS) |
| Operating expenses ±30 % | operating expenses |

```
Revenue' = Revenue × (1 + volume) × (1 + price)
COGS'    = COGS × (1 + volume) × (1 + unit cost)
Opex'    = Opex × (1 + opex change)
Tax'     = Tax + effective tax rate × (EBT' − EBT), not below 0 when the year paid tax
```

Depreciation, other financial income, interest and the whole balance sheet stay as entered, so returns move only through profit. With every lever at zero the figures are exactly those entered. When the year has no taxable profit there is no effective rate to apply, so extra profit is not taxed; the page says so. Operating expenses are treated as fixed when volume moves, which shows operating leverage; with costs by nature (no COGS) the volume lever moves revenue only.

## 11. Peer comparison

Up to three peers next to the company on the form (`src/rating/compare.js`), taken from the fictional examples, from a JSON file saved with Export JSON (its latest year), or kept from the form ("Keep this company as a peer"). **Everyone is rated on the industry chosen in the form**, so bands and scores compare like for like; a peer from another industry therefore gets a different grade here than on its own benchmarks. A ★ marks the highest value in each row. Peers are kept in this browser's local storage only.

## 12. Paste from Excel

`src/rating/paste.js` reads statement lines pasted from a spreadsheet or CSV file (tab-, semicolon- or comma-separated; amounts in Croatian or English format):

- **Labels** are matched after normalising them (lower case, no diacritics or numbering such as "IV." or "a)"), in English and in Croatian GFI-POD wording. Each field has tiers of labels; the most specific tier found wins, so *Prihodi od prodaje* beats the broader *Poslovni prihodi*, and an interest line beats *Financijski rashodi*. Totals that would double count their own lines (for example *Poslovni rashodi*) are not matched.
- **Lines that go into the same field are added up** where statements split a field: operating expenses by nature (materials, staff, other costs, value adjustments, provisions, other operating expenses), revenue inside and outside the group, bank loans short and long term. Other fields take one line.
- **Costs are taken as positive amounts**, whatever their sign in the paste.
- **Columns**: the first column holds the labels. A column of AOP or note numbers is left out (by its header, or, without one, because it holds only one- to three-digit numbers before the amounts). Up to five amount columns become years; their order comes from header years ("2025", "2024") or words ("Prethodna godina", "Tekuća godina"), otherwise the user chooses (default: the last column is the latest year, as in GFI-POD).
- Every line can be reassigned in the preview, which shows what goes into the form for each year before anything is filled in.
- **Suggested fields.** A line no label matches gets a field from key words (`suggestField`: *trošk-*, *rashod-*, *expense* → operating expenses; *kamat-* → interest, but *prihodi od kamata* → financial income; *novac*, *cash* → cash…). Totals, results and parts of a total are never guessed (*Poslovni rashodi* holds D&A too, *Upisani kapital* is only part of equity), nor are balance-sheet lines with no field of their own (payables, receivables, stock). A guess goes in only while its field is still empty, so a line that is part of a line already matched is not counted twice; otherwise it is shown as "looks like …, already filled".
- **Result lines check the sums.** Lines such as net profit (*dobit ili gubitak razdoblja*), profit before tax, EBIT (*dobit iz poslovanja*), EBITDA, gross profit and total equity and liabilities (*ukupna pasiva*) are not inputs; they are compared with what the engine calculates from the assigned lines (`checkPaste`), within 0.5 % of revenue for rounding. Where a label fits both a field and a result line, the longer label decides ("Total equity and liabilities" is a total, not equity).
- **Look-alike lines resolved by the totals.** Labels cannot tell whether *Troškovi marketinga* next to *Materijalni troškovi* is a cost of its own or a part of it. When the paste has result lines that the assigned lines do not add up to, the smallest set of such look-alike lines that makes every result line agree in every year is added (`resolveByResults`, at most 12 lines tried) and marked as a suggestion. Without a result line nothing is added and the preview says which lines were left out.
- **Years that can be rated.** Years are used newest first up to the first year the form would refuse (a required field missing); older years are left out and the preview says why. If the latest year cannot be rated, nothing is filled in.
- **The grade shows at once.** As soon as lines are pasted or a file is opened, the preview shows the grade of the latest year (with the industry chosen in the dialog), the checks, every line's field and the figures per year. One button fills the form and shows the full rating.

**Opening a file.** Both paste dialogs also open an Excel workbook (.xlsx) or a CSV/TSV/text file, chosen with "Open a file…" or dropped anywhere on the page; on the Company rating a dropped .json export is imported as before. The file is read in the browser (`src/shared/xlsx.js` and `zip.js`, no library: the browser's own DecompressionStream unpacks the workbook). An .xlsx is read as the cell values Excel saved, formulas included as their results; the first sheet with an amount in it is used (numbers that look like years do not count, so an untouched template opens its example). The cells then go through the same paste import and preview. Old binary .xls files cannot be read; the page asks for .xlsx or CSV.

**Templates.** "Download template (.xlsx)" gives a workbook made in the browser: a sheet to fill in with the field names the import recognises (a column per year, newest first; or the segment table's header row), a filled-in fictional example and a sheet of instructions, in the interface language. A test checks that every template line is matched to its own field in both languages.

<a id="segment-profitability"></a>

## 13. Segment profitability (any table)

The Segment profitability page (`segments.html`, engine in `src/segments/segments.js`) analyses any table of segments: customers, products, channels or regions.

```
Contribution margin (CM) = Revenue − Variable costs
CM ratio                 = CM ÷ Revenue
Segment profit           = CM − Direct fixed costs        (0 when blank)
```

- **Variable costs** move with the segment's sales (goods, materials, commissions). **Direct fixed costs** are fixed costs that would go away without the segment (a dedicated sales rep, a delivery route, a shop's rent). **Company-wide overheads are not shared out**: any allocation key would be arbitrary and could make a segment that covers its own costs look loss-making.
- Segments are **ranked by segment profit**. The **top 20 %** are the round(n × 20 %) most profitable segments, at least one, and their share is their profit ÷ total profit (not meaningful when total profit is zero or negative).
- The **whale curve** plots the cumulative share of segments (most profitable first) against the cumulative share of total profit. With loss-making segments it rises above 100 % and falls back to 100 % at the end; the peak is what the profitable segments earn on their own. It is the same function as the messaging case study's customer curve (`profitCurve` in `src/shared/concentration.js`).
- In Learn mode, each segment's share of revenue × its margin gives its contribution in percentage points; the contributions add up to the company margin (`marginContributions` in `src/shared/margin.js`, shared with the messaging case study).
- **Send to Company rating** passes total revenue as revenue and total variable costs as cost of goods sold, with the General industry. Variable costs are an approximation of cost of sales: fixed production costs, if any, are left in operating expenses.
- A pasted table is read by column name (English or Croatian) when it has a header row, otherwise in the order name, revenue, variable costs, direct fixed costs.

## 14. Learning materials

The Glossary & practice page (`learn.html`, code in `src/learn/`) and the formula cheat sheet (`cheatsheet.html`) teach the method above. None of them holds a number or a formula of its own:

- **Guess the grade**: five fictional companies, chosen so that they earn the grades A to E once each, shown in a different order. The grade is never stored: each case is rated by `rate()` when the page loads, so the answer always matches the Company rating, and "Open this case in Company rating" (`index.html#case=<id>`) loads the same figures there. A test fails if a change to the benchmarks moves a case to another grade, or if a case stops showing what its lesson says (for example, that the supermarket's ROA is Excellent). Guesses are kept in this browser's local storage only.

  | Case | Industry | Grade | What it teaches |
  |---|---|---|---|
  | Software company | Software & SaaS | B | A 12 % net margin is only "strong" against software benchmarks; the same figures earn an A on General benchmarks |
  | Supermarket chain | Retail & wholesale | A | A net margin under 4 % can still be excellent when assets turn over twice a year |
  | Seaside bistro | Tourism & hospitality | E | A good gross margin does not survive fixed costs, depreciation and interest |
  | Metalworks | Manufacturing | C | Costs by nature (no COGS, 7 of 8 ratios) and an ROE lifted by an equity multiplier of about 4 |
  | Messaging reseller | Telecom & CPaaS / messaging | D | Thin wholesale margins and interest cover below 1.5× |

- **Fix the company** (`src/learn/challenges.js`): five challenges on the same fictional cases. Each sets a goal grade, the What if… levers (§10) the student may move, and sometimes a lever fixed by the story (the price war fixes prices at −3 %). The grade is worked out live with `applyWhatIf` and `rate()`; "Show one solution" is the smallest single allowed lever move that reaches the goal (§15). Tests check that every challenge starts below its goal and can be solved with its own levers, and the numbers each lesson states.
- **Glossary**: 55 terms in five sections. A term the engines already name (ratios, form fields, derived figures, DuPont factors) uses the engine's own language key, so the glossary cannot name it differently; a ratio's formula is its definition's formula. The other-language name is the same key read in the other language. Search ignores case and accents and matches both languages.
- **Cheat sheet**: built by `cheatSheet()` from `RATIOS` (names, formulas, weights), `SCORE_ANCHORS` (the score at each threshold), `GRADES`, `FLAG_LIMITS` and the General industry's thresholds; only the wording of the statement lines is text in the language files (`learn.formulas`, shared with the glossary). It prints on one A4 page (print stylesheet in `src/learn/learn.css`), so "Save as PDF" in the print dialog gives the PDF, and "Download as text" saves the same content as a .txt file made in the browser.

## 15. Path to the next grade

The block "How to reach grade X" (`src/rating/path.js`) shows, for the latest year, what would move the grade. It uses the same figures and engine as the rating; nothing in it is estimated separately.

- **One change at a time.** For each What if… lever (§10), the smallest move in whole percent, within the lever's range, whose full re-rating reaches the next grade. Both directions are tried and the smaller move wins (a rise before a fall at the same size). A lever moves several ratios together, as a real change would, so this is the practical guide. When no lever reaches the next grade on its own, the page says so instead of showing a move outside the range. "Try it" sets that lever in What if….
- **Where the points are lost.** Each available ratio earns *score × weight share* points, where the share is its weight divided by the weight of the available ratios, so the points add up to the overall score before rounding. *Missed* is (100 − score) × share. *Per +1 pp* is the points one more percentage point of that ratio alone would add, with every other ratio unchanged: it shows where the score is most sensitive, and is 0 below the score's floor or above "excellent".

No single ratio can usually close a gap on its own (the largest weight is 15 % of the total, so one ratio can add at most 15 points), which is why the block shows the levers rather than a target value per ratio.

The grade comes from the rounded score, so a lever counts as reaching the next grade when the rounded score reaches the grade's minimum.
