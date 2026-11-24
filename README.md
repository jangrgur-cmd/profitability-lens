# Profitability Lens

**A free, open-source profitability analysis dashboard that runs entirely in your browser.**

Work in progress. Two connected modules:

1. **Company rating** *(coming in Phase 2)*: enter a few lines from an income statement and balance sheet and get an A–E profitability grade, eight profitability ratios with benchmark bands and explanations, a DuPont breakdown of ROE and automatic red flags.
2. **Segment profitability**: where a business makes and loses money, by customer, product, channel or route. It starts from the [Messaging Profitability Dashboard](modules/messaging/), a case study of a business-messaging (CPaaS) provider.

No accounts, no backend, no API keys: your data never leaves the browser. Example companies and simulated data are fictional.

## Run locally

From the project folder, start any static web server and open the address it prints:

```
npx serve .
```

Run the tests with `node --test`.

## Licence

[MIT](LICENSE)
