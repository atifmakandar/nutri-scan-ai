# Pricing and unit economics

> **DRAFT — legal/accounting review required.** Every numeric price, cost, volume and target in this document/CSV is an **illustrative INR hypothesis**, not an approved quote, supplier price, accounting policy or forecast.

**Owner:** [FOUNDER NAME], [LEGAL ENTITY] · **Review:** [REVIEW DATE]

## Unit, scope and assumptions

- Unit = **one farm account per month**; not one animal, sample, scan, cooperative or sensor. A recurring offer is a proposed commercial package, not an in-app billing feature.
- Pilot hypothesis = six weeks, one farm, up to two operators and ten managed batches, with four onboarding hours and two follow-up/support hours. No scientific accuracy acceptance.
- Recurring hypothesis = existing supported software workflow plus 0.75 direct support hours/farm/month at ₹400/hour fully loaded. Extra visits/effort require written scope.
- Price/variable costs exclude GST and other applicable taxes. [TAX TREATMENT] must resolve registration, invoice wording, input credits, withholding and recognition before sale; no tax rate is assumed.
- Collections/payment processing assumption = 2% of revenue. Assume full collection only for this model; add refunds, bad debt and settlement timing when known.
- Lab fees, hardware/BOM, shipping, sensor calibration/replacement, insurance and field validation are **excluded from both price and cost** and must be separately quoted/funded. Never call this an all-inclusive testing package.
- No annual prepayment, subsidies, grant receipts, device margin or referral commission is assumed. No automatic renewal or automatic lab booking.
- Non-labor variable costs: ₹150 hosting/storage + ₹100 routine operations/farm/month. Validate usage and capacity; these are not vendor quotes.

Customer-ready terms use [PILOT PRICE], [MONTHLY PRICE] and [PAYMENT TERMS]; do not copy model numbers into an offer without review.

## Six-week pilot example

| Illustrative line item | INR |
| --- | ---: |
| Total pilot fee | 9,000 |
| Onboarding: 4 h × ₹400 | 1,600 |
| Follow-up/support: 2 h × ₹400 | 800 |
| Local travel allowance | 800 |
| Hosting/storage allowance for full pilot | 300 |
| Materials/operations allowance | 300 |
| Processing: 2% × ₹9,000 | 180 |
| Total direct variable delivery cost | 3,980 |
| Contribution before CAC and fixed overhead | 5,020 |
| Contribution margin | 55.78% |

With illustrative acquisition cost (CAC) ₹3,000 per acquired paying farm, pilot contribution after CAC is ₹2,020 before fixed overhead. A pilot fee is one-time, **not MRR**. Additional physical samples and lab comparisons are a separate study, not hidden inside this allowance.

## Recurring formulas

```text
P = monthly price per farm (INR)
h = direct support hours per farm/month
w = loaded support cost per hour = 400 INR (illustrative)
C = h*w + hosting 150 + operations 100 + 0.02*P
CM = P - C                         # monthly contribution, INR/farm
CM% = 100*CM/P
F = fixed monthly operating cost = 120000 INR (illustrative)
Operating result at N paying farms = N*CM - F
Break-even farms = ceil(F/CM)       # only when CM > 0
CAC = acquisition spend / new paying farms acquired in the same cohort
CAC payback months = CAC/CM         # contribution-based, before churn
MRR = sum of contracted monthly recurring fees for active paying farms
```

If CM ≤ 0, no finite volume break-even exists under these assumptions. Distinguish MRR, invoices issued and cash collected. CAC payback here ignores pilot contribution and assumes unchanged support and zero churn during payback; do not subtract the same pilot contribution twice. Include founder sales time, travel and channel fees in measured CAC.

## Scenarios

Same assumptions as the [pricing CSV](../templates/business/pricing-scenarios.csv); ₹3,000 CAC and ₹120,000 fixed costs throughout. Stress changes support only.

| Illustrative scenario | P INR | Support h | Variable cost INR | CM INR | CM% | Break-even farms | CAC payback months |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Low-price hypothesis | 999 | 0.75 | 569.98 | 429.02 | 42.94% | 280 | 6.99 |
| Base hypothesis | 1,499 | 0.75 | 579.98 | 919.02 | 61.31% | 131 | 3.26 |
| Higher-price hypothesis | 2,499 | 0.75 | 599.98 | 1,899.02 | 75.99% | 64 | 1.58 |
| Base with support stress | 1,499 | 1.50 | 879.98 | 619.02 | 41.30% | 194 | 4.85 |

At base assumptions, 50 paying farms imply ₹74,950 MRR and **−₹74,049/month** after modeled fixed cost; 150 imply ₹224,850 MRR and **₹17,853/month**. These are arithmetic scenarios, not demand/capacity forecasts. At 150 farms, direct support alone is 112.5 h/month; sales, onboarding and travel require additional capacity.

## Fixed cost and cash break-even

Illustrative F = ₹80,000 shared team/admin/product time + ₹10,000 baseline tools/cloud + ₹10,000 accounting/admin services + ₹20,000 fixed outreach/travel. The ₹400/hour delivery labor and per-farm hosting above are **incremental**, excluded from these fixed allocations; reconcile payroll, cloud and travel to prevent double counting in a real budget.

The volume break-even above is a steady-state operating contribution calculation, not cash break-even or profit after tax. A working cash model must include:

```text
Closing cash = opening cash + customer cash receipts + funding cash received
               - direct cash costs - fixed cash costs - acquisition cash spend
               - capex - validation cash spend - tax/remittances - debt payments
Runway months = unrestricted opening cash / monthly net cash burn
```

Use runway only while burn is positive and relatively stable; model month-by-month otherwise. Upfront pilot cash may be deferred revenue depending on reviewed policy. Refunds/receivables and any purchased devices can delay cash break-even even when CM is positive.

## What to measure before fixing prices

1. Ask buyer and payer about actual current spend and who can approve [PILOT PRICE]; test a written offer, not only stated interest.
2. Log support/onboarding/travel minutes and hosting usage by farm; replace every allowance with evidence.
3. Compare conversion, realized price, collections, retention and delivery load by cohort. No LTV claim until retention is observable; a churn-based extrapolation is not observed LTV.
4. Have an accountant review taxes, gross-versus-net pass-through treatment, cost allocations and cash timing; have counsel review exclusions, support limits and [PAYMENT TERMS].

Commercial positioning follows the [business plan](business-plan.md) and [claims matrix](README.md#claims-matrix).
