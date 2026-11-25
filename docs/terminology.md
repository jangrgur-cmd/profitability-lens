# Financial terms: English and Croatian

Every financial term the interface uses, in both languages, for review. The texts themselves live in
[`src/shared/lang/en.js`](../src/shared/lang/en.js) and [`hr.js`](../src/shared/lang/hr.js); change a term there
and here together.

Croatian terms follow the annual financial statement forms (GFI-POD: *Bilanca*, *Račun dobiti i gubitka*) and
the vocabulary of Croatian textbooks on financial statement analysis (e.g. *rentabilnost imovine*,
*koeficijent obrtaja*). **⚠ = a choice where usage varies; please check.**

## Statements and inputs

| English | Croatian | Note |
|---|---|---|
| Income statement | Račun dobiti i gubitka | |
| Balance sheet | Bilanca | |
| Revenue | Prihodi od prodaje | GFI-POD also has *poslovni prihodi* (operating income, includes other operating income) |
| Cost of goods sold (COGS) | Trošak prodanih proizvoda i robe | ⚠ GFI-POD splits it into *nabavna vrijednost prodane robe* and *troškovi prodanih proizvoda*; "trošak prodanoga" used as a short form in sentences |
| Operating expenses (excl. D&A) | Poslovni rashodi (bez amortizacije) | |
| Depreciation & amortisation (D&A) | Amortizacija | |
| Other financial income, net | Ostali financijski prihodi, neto | |
| Interest expense | Rashodi od kamata | GFI-POD: *rashodi s osnove kamata* |
| Income tax | Porez na dobit | |
| Total assets | Ukupna aktiva | Also *ukupna imovina* (used in "prosječna ukupna imovina") |
| Total equity | Kapital i rezerve | Also *vlastiti kapital* (used in ROE) |
| Current liabilities | Kratkoročne obveze | |
| Interest-bearing debt | Kamatonosne obveze | |
| Cash | Novac i novčani ekvivalenti | |
| Prior year | Prethodna godina | |
| Liabilities | Obveze | |
| Retained earnings | Zadržana dobit | |
| Share capital | Temeljni kapital | |

## Derived figures

| English | Croatian | Note |
|---|---|---|
| Gross profit | Bruto dobit | ⚠ In Croatian practice *bruto dobit* is also used for profit before tax. Here it always means revenue − cost of sales. Alternatives: *bruto profit*, *bruto marža (iznos)* |
| EBITDA | EBITDA | Explained as *dobit prije kamata, poreza i amortizacije* |
| EBIT | EBIT | *Dobit iz poslovanja* / *operativna dobit* in sentences |
| Operating profit | Dobit iz poslovanja | |
| Profit before tax (EBT) | Dobit prije oporezivanja | (not shown as its own figure) |
| Net income | Neto dobit | Negative: *neto gubitak* |
| Net loss | Neto gubitak | |
| Operating loss | Operativni gubitak | |
| NOPAT | NOPAT | Net operating profit after tax: *neto operativna dobit nakon poreza* |
| Effective tax rate | Porezna stopa | |
| Average total assets | Prosječna ukupna imovina | |
| Average equity | Prosječni kapital | |
| Capital employed | Angažirani kapital | |
| Invested capital | Uloženi kapital | ⚠ Also *investirani kapital* |
| Interest cover | Pokriće kamata | Textbook form: *pokriće troškova kamata* |

## Ratios

| English | Croatian | Note |
|---|---|---|
| Gross margin | Bruto marža | |
| EBITDA margin | EBITDA marža | |
| Operating margin (EBIT) | Operativna marža (EBIT) | |
| Net margin | Neto marža | Textbook: *neto marža profita* |
| Return on assets (ROA) | Rentabilnost imovine (ROA) | Everyday usage: *povrat na imovinu* |
| Return on equity (ROE) | Rentabilnost vlastitog kapitala (ROE) | Everyday usage: *povrat na kapital* |
| Return on capital employed (ROCE) | Rentabilnost angažiranog kapitala (ROCE) | ⚠ Also *povrat na angažirani kapital* |
| Return on invested capital (ROIC) | Rentabilnost uloženog kapitala (ROIC) | ⚠ Also *povrat na uloženi kapital* |
| Margins (group) | Marže | |
| Returns (group) | Rentabilnost | |
| DuPont breakdown | DuPontova analiza | |
| Asset turnover | Koeficijent obrtaja imovine | |
| Equity multiplier | Multiplikator kapitala | |
| Leverage | Zaduženost | |
| Cost of capital | Trošak kapitala | |

## Rating

| English | Croatian | Note |
|---|---|---|
| Benchmarks | Referentne vrijednosti | |
| Rule-of-thumb thresholds | Okvirni pragovi | ⚠ Also *iskustveni pragovi* |
| Industry | Djelatnost | |
| Ratio | Pokazatelj | |
| Weight | Težina | |
| Coverage | Obuhvat | |
| Score | Rezultat | |
| Grade A / B / C / D / E | Ocjena A–E: Izvrsna / Vrlo dobra / Zadovoljavajuća / Slaba / Loša | Feminine, agreeing with *profitabilnost* |
| Bands: Excellent / Good / Fair / Weak / Poor | Izvrsno / Dobro / Zadovoljavajuće / Slabo / Loše | |
| Red flags | Upozorenja | |
| Severities: Critical / Serious / Warning / Info | Kritično / Ozbiljno / Upozorenje / Napomena | |
| Missing input | Nedostaje podatak | |
| Not meaningful (n/m) | Nema smisla (n/s) | |
| Not available (n/a) | Nije dostupno (n/d) | |

## Segment profitability (messaging case study)

| English | Croatian | Note |
|---|---|---|
| Segment profitability | Profitabilnost segmenata | |
| Delivery cost | Trošak isporuke | |
| Platform cost | Trošak platforme | |
| Pass-through fee | Prolazna naknada | Fee charged on at cost |
| Cost headroom | Rezerva troška | ⚠ Our own term for gross profit ÷ delivery cost |
| Route | Ruta | Country × channel |
| Whale curve | Krivulja kita (whale curve) | ⚠ No established Croatian term; the English name is kept in brackets |
| Margin bridge | Most marže | ⚠ Also *premosnica marže* or "waterfall" |
| Baseline | Polazno stanje | |
| Scenario | Scenarij | |
| Exchange rate | Tečaj | |
| Volume discount | Popust na količinu | |
| Percentage points (pp) | Postotni bodovi (p. b.) | |
| Contribution (to margin) | Doprinos | |
| Termination cost (SMS) | Trošak terminacije | |

## Number formats

| | English | Croatian |
|---|---|---|
| Thousands and decimals | 1,234,567.89 | 1.234.567,89 |
| Percentage | 22.1% | 22,1 % |
| Euro, full | €2,400,000 | 2.400.000 € |
| Euro, short | €1.2M · €45.3k · €1.2B | 1,2 mil. € · 45,3 tis. € · 1,2 mlrd. € |
| Percentage points | +1.2 pp | +1,2 p. b. |
| Multiple | 2.50× | 2,50× |
| Per message | 0.0336 €/msg | 0,0336 €/poruka |
| Missing value | n/a | n/d |
