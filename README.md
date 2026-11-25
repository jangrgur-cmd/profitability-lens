# Profitability Lens

**A free, open-source profitability analysis dashboard that runs entirely in your browser.**

Work in progress. Two connected modules:

1. **Company rating** (the start page): enter a few lines from an income statement and balance sheet, or paste them from Excel (English or Croatian GFI-POD labels), and get an A–E profitability grade, eight profitability ratios with benchmark bands and explanations, a DuPont breakdown of ROE and automatic red flags. Add up to four earlier years for a trend with year-on-year changes and sparklines, move what-if levers (volume, prices, unit costs, overheads) to see the grade respond live, and compare with up to three peers. Load one of three fictional examples, export or import your figures as JSON, copy a text summary or print the result to PDF.
2. **Segment profitability** ([segments.html](segments.html)): where a business makes and loses money, by customer, product, channel or region. Type or paste a table of revenue and costs to get each segment's contribution margin, a ranked profit chart, the whale curve and the share of profit earned by the top 20%. The [Messaging Profitability Dashboard](modules/messaging/) is a worked case study of a business-messaging (CPaaS) provider.

The modules are connected: "Send to Company rating" on either segment page carries full-year revenue and cost of sales into the rating, and the rating links back to the segments behind the gross margin.

**Learn mode** (switch in the header) turns both modules into a teaching tool: the math behind every ratio with your own numbers, what each ratio tells you and how to improve it, field help with the matching term in the other language, a plain-language DuPont breakdown, how segment margins add up to the company margin, and what each scenario step changes. Light and dark mode follow your system, or pick one in the header.

**Glossary & practice** ([learn.html](learn.html)): guess the A–E grade of five fictional companies and see how the rating gets there, look up 54 terms in English and Croatian with their formulas, and print the one-page [formula cheat sheet](cheatsheet.html) (or save it as PDF or text).

**English and Croatian** (EN/HR switch in the header): the interface, the explanations and the number formats (1,234.56 or 1.234,56) follow the language, which starts from your browser's setting. Croatian uses standard accounting terminology; the term list is in [docs/terminology.md](docs/terminology.md).

No accounts, no backend, no API keys: your data never leaves the browser (the form is kept only in this browser's local storage). Example companies and simulated data are fictional, and the benchmarks are rule-of-thumb thresholds, not official statistics.

## Run locally

From the project folder, start any static web server and open the address it prints:

```
npx serve .
```

Run the tests with `node --test`.

How the rating is calculated: [docs/methodology.md](docs/methodology.md).

## Licence

[MIT](LICENSE)
