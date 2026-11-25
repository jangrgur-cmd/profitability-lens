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
| Other operating income | Ostali poslovni prihodi | GFI-POD line; *prihodi na temelju upotrebe vlastitih proizvoda* (own work capitalised) is matched to it too |
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

## Company rating: several years, what if, peers, paste

| English | Croatian | Note |
|---|---|---|
| Financial year | Financijska godina | |
| Trend | Kretanje | |
| Year-on-year change | Promjena u odnosu na prethodnu godinu | |
| Score (points) | Bodovi | |
| What if | Što ako | |
| Sales volume | Količina prodaje | |
| Selling prices | Prodajne cijene | |
| Unit cost of goods | Jedinični trošak robe | |
| Operating leverage | Operativna poluga | |
| Effective tax rate | Efektivna porezna stopa | |
| Peer comparison | Usporedba s konkurentima | ⚠ Also *usporedba s usporedivim tvrtkama* |
| AOP code | AOP oznaka | Line code on GFI-POD forms |
| Costs by nature | Troškovi po prirodnim vrstama | |
| Materials costs | Materijalni troškovi | GFI-POD line, matched to operating expenses |
| Staff costs | Troškovi osoblja | GFI-POD line, matched to operating expenses |
| Financial expenses | Financijski rashodi | Matched to interest expense only when no interest line is pasted |

## Segment profitability (any table)

| English | Croatian | Note |
|---|---|---|
| Segment | Segment | |
| Customer · Product · Channel · Region | Kupac · Proizvod · Kanal · Regija | |
| Variable costs | Varijabilni troškovi | |
| Direct fixed costs | Izravni fiksni troškovi | Fixed costs that would go away without the segment |
| Contribution margin | Marža pokrića | ⚠ Also *kontribucijska marža* or *doprinos pokrića* |
| Contribution margin ratio | Stopa marže pokrića | |
| Segment profit | Rezultat segmenta | |
| Cost to serve | Trošak usluživanja | |
| Top 20 % share | Udio najboljih 20 % | |
| Loss-making segment | Segment s gubitkom | |
| Overheads | Opći režijski troškovi | Not allocated to segments |

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

## Learning materials

| English | Croatian | Note |
|---|---|---|
| Glossary & practice | Pojmovnik i vježbe | Navigation label (not *Učenje*, which is the Learn mode switch) |
| Glossary | Pojmovnik | |
| Guess the grade | Pogodi ocjenu | |
| Practice case | Slučaj za vježbu | |
| Formula cheat sheet | Podsjetnik s formulama | |
| Profit before tax (EBT) | Dobit prije oporezivanja (EBT) | |
| Costs by nature | Troškovi po prirodnim vrstama | |
| Average balance | Prosječno stanje | |
| Benchmark | Referentna vrijednost | Singular of *referentne vrijednosti* |
| Leverage | Zaduženost (financijska poluga) | Glossary entry; elsewhere *zaduženost* alone |
| Percentage point (pp) | Postotni bod (p. b.) | |
| Overheads | Opći režijski troškovi | |
| Pass-through fee | Prolazna naknada | |
