# Cash-flow planning and funding gates

> **ILLUSTRATIVE SCENARIO — NOT A FORECAST, VALUATION OR FUNDING COMMITMENT.**
> Accountant review required. The [12-month CSV](../templates/business/12-month-cash-flow.csv)
> is a worked arithmetic example, not evidence of customers, cash, financing or demand.

**Owner:** [FOUNDER NAME] · **Review:** [REVIEW DATE]

## Assumptions and scope

Use the recurring **base** case from [unit economics](pricing-and-unit-economics.md):
₹1,499/farm/month, ₹579.98 direct cost/farm/month, ₹120,000 fixed monthly cost and
₹3,000 incremental acquisition spend per new paying farm. Fixed spend and acquisition
cost must be reconciled to avoid counting the same outreach/team cost twice.

- The example starts with **₹600,000 hypothetical available cash**, not confirmed
  founder/investor funds. Set actual unrestricted cash from a verified private record.
- Active farms are arbitrary scenario inputs: 0, 0, 1, 3, 5, 8, 12, 18, 25, 35, 50, 70.
  They are not funnel targets or expected sales. No churn is assumed solely to simplify
  the example; test delayed sales, nonpayment, churn and higher support in real copies.
- Each active farm pays a whole month immediately; receipts equal recurring fees only
  under this deliberately simplified same-month collection assumption. Proration,
  receivables, refunds and revenue recognition need a real accounting model.
- All modeled direct and fixed costs are paid that month. No new funding is received.
- `other_reviewed_cash_costs_inr = 0` means **excluded/not budgeted in this example**,
  not that hardware, labs, calibration, capex, insurance, taxes, shipping or debt are free.
  The recurring unit model also excludes these costs. Add every applicable cash outflow
  and prevent double counting before using the sheet for a spending decision.
- One-time pilot cash/costs are omitted, not counted as MRR. Model pilot timing separately
  if offered. Hardware/validation funds and grants are not assumed.

## Row formulas

```text
active_farms = previous_active_farms + new_farms - churned_farms
customer_receipts_inr = active_farms * monthly_price_inr
direct_cash_cost_inr = active_farms * direct_cost_per_farm_inr
acquisition_spend_inr = new_farms * cac_inr
net_cash_flow_inr = customer_receipts_inr + funding_received_inr
                   - direct_cash_cost_inr - fixed_cash_cost_inr
                   - acquisition_spend_inr - other_reviewed_cash_costs_inr
closing_cash_before_gap_inr = opening_cash_inr + net_cash_flow_inr
next_opening_cash_inr = closing_cash_before_gap_inr
cumulative_funding_gap_inr = max(0, -closing_cash_before_gap_inr)
```

The CSV contains static numbers, **not spreadsheet formulas**. Recalculate all derived
cells after changing assumptions. Negative cash is an **unfunded scenario deficit**,
not permission to overdraw or a real bank balance. The cumulative gap column is not a
monthly bill: do not sum it. If finance is actually received, insert its cash timing
and recalculate from that month; do not also treat the same gap as a receipt.

## What this illustration shows

| Illustration | Arithmetic result, not an operating promise |
| --- | --- |
| First negative closing position | Month 5: −₹6,728.82 |
| Month 12 recurring receipts | ₹104,930.00 at 70 hypothetical paying farms |
| Month 12 closing deficit before any added funding | −₹841,382.46 |
| Additional cash needed to stay nonnegative through this path | At least ₹841,382.46 beyond the assumed initial ₹600,000; excluded costs and a prudent reserve would increase this |

Positive per-farm contribution does not establish company cash break-even. Sales timing,
delivery load and fixed spend matter. Do not advertise a runway number based on an average
burn when month-by-month cash changes materially.

## Stage-gated funding/spending plan

1. **Discovery:** cap founder-approved spending; establish a repeated problem and a
   reachable buyer before commitments to hardware, leases or broad campaigns.
2. **Scoped pilot:** approve the delivery budget, cash/payment schedule, privacy and
   readiness gates; reserve effort for support, closeout and refunds if applicable.
3. **Continuation:** add spend only with documented collections, support capacity,
   retention evidence and a reviewed cash plan; a signed interest letter is not cash.
4. **Scientific validation:** separately cost sampling, qualified reference methods,
   hardware, handling, dataset rights, held-out evaluation and expert review. No model
   accuracy release is triggered by a fundraising or sales deadline.
5. **Fundraising:** use [pitch outline](investor-pitch-outline.md) and verified use of
   funds; replace [FUNDING ASK] / [RUNWAY MONTHS] with an evidence-backed plan. Confirm
   eligibility and current terms directly before applying for any grant/program.

Monthly finance review: compare actual collections/costs with plan, reconcile bank and
invoices privately, refresh scenarios and log the named spending decision. Keep account
numbers, payment credentials, payroll and investor identity records outside Git.
