# Messaging profitability: analyst memo

**Author:** Jan Grgur Glivar
**Dashboard:** https://jangrgur-cmd.github.io/messaging-profitability/
**Data:** market prices and fees from public rate cards (checked 23–24 November 2026); customers are illustrative archetypes with estimated volumes. For demonstration only.

## Question

Where does a European business-messaging provider make and lose gross margin across Croatia, Germany, France, the UK and the US, and how exposed is that margin to the three things it does not control: operator termination prices, Meta's WhatsApp fees and the EUR/USD rate?

## Approach

- Built a one-year model of 36 customer archetypes (banks, retailers, couriers, telecom operators and others) sending 3.3 billion messages over SMS, WhatsApp, Viber and voice passcode calls.
- Priced it from public sources: Meta's WhatsApp rate card (effective 1 October 2026), a large CPaaS provider's public SMS and voice list prices, US carrier fees and the 2025 average ECB EUR/USD rate (1.13). Operator termination costs, discounts and volumes are not public; they are estimated and calibrated so the blended gross margin matches listed peers (LINK Mobility about 22%, Sinch 34% including software).
- Treated Meta's fee and US carrier fees as pass-through: charged to the customer at cost and never discounted, as providers do in practice.
- Analysed margin by route (country × channel) and customer, then ran three scenarios: a 15% rise in European SMS termination, 25% of marketing and utility SMS moving to WhatsApp, and a 10% stronger dollar.

**Baseline:** €112.2M revenue, €23.1M gross profit, a 20.5% gross margin. €20.6M (15.5%) of list revenue is given away in volume discounts.

## Findings

1. **WhatsApp brings revenue, not profit.** WhatsApp is 18% of revenue but 6% of gross profit: a 6.8% margin against 23.7% for SMS. Most of its price is Meta's fee, passed on at cost, so the provider keeps about €0.003 per WhatsApp message against about €0.008 per SMS. Moving 25% of marketing and utility SMS to WhatsApp changes revenue by only −€0.7M but cuts gross profit by €2.4M (−10%), and the margin falls from 20.5% to 18.6%. ([Shift to WhatsApp](https://jangrgur-cmd.github.io/messaging-profitability/#tab=scenarios&mu=25&mm=25))

2. **Operator termination costs decide the margin.** SMS earns 93% of gross profit, so the business is a bet on SMS termination prices. Every 1% rise in European SMS termination costs about €0.57M a year. A 15% rise in Croatia, Germany, France and the UK cuts gross profit by €8.6M (−37%) and the margin to 12.9%; SMS prices would have to rise by about 10% across all markets to absorb it. Germany SMS alone is €30M of revenue. ([Operator price increase](https://jangrgur-cmd.github.io/messaging-profitability/#tab=scenarios&sc=15&scc=SMS&sco=HR%2CDE%2CFR%2CGB))

3. **A third of the cost base is in dollars, while prices are in euros.** Meta bills from its USD rate card and US carriers bill in dollars: €29M, or 33% of delivery cost. A 10% stronger dollar cuts gross profit by €3.2M (−14%). WhatsApp is the most exposed because its pass-through price is fixed in euros: a fall of about 7% in EUR/USD wipes out WhatsApp's whole margin, and German WhatsApp swings from +€0.4M to −€0.6M. ([Strong dollar](https://jangrgur-cmd.github.io/messaging-profitability/#tab=scenarios&fx=-10))

**Also worth noting:**
- Only one route loses money in the baseline: US voice passcode calls (−6.2%), where the public price is so low that 30% enterprise discounts and the platform cost per call push it under water.
- Profit is moderately concentrated: the top 7 of 36 customers earn 43% of gross profit, and no customer loses money at gross-margin level. The largest customers have the thinnest margins (the US ride-hailing app at 14.5% with a 30% discount).
- Croatia earns the highest margin (31.3%), helped by Viber, a cheap local channel with a 31% margin.

## Recommendation

1. **Price WhatsApp on its own fee, not on total revenue.** Treat Meta's fee as a pass-through and manage WhatsApp on gross profit per message. When customers move from SMS to WhatsApp, protect the provider's fee (for example a higher per-message fee or a minimum monthly commitment) instead of following the lower total price.
2. **Remove the currency mismatch on WhatsApp.** Meta also publishes rate cards in euros; billing Meta in EUR, or adding a currency clause that re-prices pass-through fees when EUR/USD moves more than a set band, would close most of the exposure in finding 3.
3. **Write cost pass-through into enterprise contracts.** With termination at roughly 60% of the SMS price, a price-review clause tied to operator rate changes is worth more than a few points of discount negotiation.
4. **Re-price or put a floor under US voice passcode calls**, the only loss-making route; a minimum price per call would fix it.

Before acting, I would want the real wholesale termination rates for the largest routes and the actual discount terms of the top 10 customers; both are estimated here.

## Limitations

- **Customers are illustrative.** Archetypes and volumes are estimates (users × messages per user × share routed to us), not real company data; the size of each finding scales with them.
- **Termination costs are estimated** at 62% of public SMS list prices (60% for voice). Finding 2 depends on this: at a lower share, margins would be higher and less sensitive.
- **Simplified pricing:** one list price per country, channel and category; one discount per customer; UK costs in euros; no long-message segments, minimum commitments or rebates.
- **No cost-to-serve and no fraud modelling.** Support, account management and artificially inflated traffic (SMS pumping) would lower margins further, especially for small customers.

## What this means for operator partnerships

- **Termination prices are the biggest lever.** Each 1% on European SMS termination is about €0.57M of gross profit a year, more than most customer price changes. Volume commitments with the largest operators, starting with Germany (€30M SMS revenue), are where a partnerships team adds the most margin.
- **Know the walk-away point.** The dashboard's cost headroom shows how far each route's delivery cost can rise before it breaks even: about 30% for German, French and UK SMS, but under 5% for German WhatsApp. Those numbers are the floor in any negotiation.
- **Currency belongs in the contract.** Negotiating Meta billing in euros, or settling with US carriers through a euro-denominated partner, protects margin as much as a lower rate.
- **Local channels can beat SMS.** In Croatia, Viber delivers a 31% margin at a fraction of the SMS price; regional channels like this are worth developing with partners where customers already use them.
