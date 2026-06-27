# Cost Analysis Report — Spoty on Microsoft Azure

Projected monthly cost of running Spoty in production on Azure, broken down by
compute, storage, streaming, data transfer, and monitoring, with cost-saving
strategies. Figures are **list-price estimates (East US, 2026)** for planning only;
use the [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)
for a binding quote. Currency: USD.

---

## 1. Sizing Assumptions

| Parameter | Assumption |
|-----------|-----------|
| Monthly active users | ~500,000 |
| Peak concurrent users | ~25,000 |
| Interaction events | ~50 M / day (~600/s avg, ~3k/s peak) |
| Audio catalog | ~5 TB in Blob |
| Audio egress | ~40 TB / month streamed to clients |
| Region | Single region (East US), HA within region |

---

## 2. Monthly Cost Breakdown (baseline, pay-as-you-go)

| Category | Azure service | Configuration | Est. $/mo |
|----------|---------------|---------------|----------:|
| **Compute** | AKS node pool | 4 × D4s_v5 (4 vCPU/16 GB) | 560 |
| Compute | AKS control plane | Free tier | 0 |
| **Streaming** | Event Hubs | Standard, 4 TUs | 90 |
| **Processing** | Azure Databricks / HDInsight | small Spark job cluster (autoscaled) | 350 |
| **Relational** | Azure DB for PostgreSQL | Flexible, GP D2ds_v5 + HA replica | 260 |
| **Cache** | Azure Cache for Redis | Standard C1 (1 GB) | 75 |
| **Object storage** | Blob Storage (Hot) | 5 TB | 100 |
| **Data transfer** | Blob/Internet egress | ~40 TB (first 100 GB free) | 3,300 |
| **Edge** | Application Gateway + WAF | 1 medium + capacity units | 250 |
| **Secrets** | Key Vault | standard ops | 5 |
| **Monitoring** | Azure Monitor + Managed Grafana | logs/metrics ingestion | 120 |
| **Registry** | Azure Container Registry | Standard | 20 |
| | | **Baseline total** | **≈ $5,180 / mo** |

> **Egress dominates.** Audio streaming bandwidth is by far the largest line item,
> and it is the main cost to bring down for a streaming platform.

---

## 3. Cost Drivers & Sensitivity

```
share of monthly cost (baseline)
Data egress      ████████████████████████████  64%
Compute (AKS)    ██████                         11%
Processing       ████                            7%
Postgres         ███                             5%
App Gateway      ███                             5%
Other            ████                            8%
```

- **Egress** scales with listening hours and bitrate, so reducing it has the largest effect.
- **Compute** scales with concurrent request load, which is why autoscaling matters.
- **Processing** scales with event volume; right-size the Spark cluster and let it autoscale.

---

## 4. Cost-Saving Strategies

| Strategy | Mechanism | Est. saving |
|----------|-----------|------------:|
| **CDN in front of Blob** | Azure Front Door/CDN caches audio at edge; cheaper egress + offload origin | up to **40–60%** of egress |
| **Reserved Instances / Savings Plans** | 1–3 yr commitment on steady AKS nodes & Postgres | **30–60%** on compute/DB |
| **Spot node pool** for Spark/batch | Interruptible VMs for non-critical processing | up to **80%** on those nodes |
| **Autoscaling (HPA + cluster autoscaler)** | Scale to actual demand; scale to min off-peak | 20–40% on compute |
| **Storage tiering / lifecycle** | Move cold/rarely-played audio to Cool/Archive tiers | 40–70% on that data |
| **Adaptive bitrate / codec** | Lower bitrate for mobile/free tier | proportional egress cut |
| **Right-sizing** | Match SKUs to observed Grafana utilization; avoid over-provisioning | 10–25% |
| **Dev/test shutdown** | Stop non-prod clusters nightly | ~65% of non-prod |

### Illustrative optimized estimate
| | Baseline | Optimized |
|--|---------:|----------:|
| Egress (CDN + ABR) | 3,300 | 1,500 |
| Compute (RI + autoscale) | 560 | 300 |
| Processing (spot + autoscale) | 350 | 120 |
| Postgres (reserved) | 260 | 160 |
| Other | 710 | 650 |
| **Total** | **≈ $5,180** | **≈ $2,730 (~47% lower)** |

---

## 5. Scaling Economics

- **Cost per MAU (baseline):** ≈ $5,180 / 500k ≈ **$0.0104 / user / month**.
- Marginal cost is dominated by **egress per listening hour**, so unit economics
  improve mainly through CDN caching and bitrate strategy, not server scaling.
- Reserved capacity suits the **predictable baseline**; autoscaling + spot absorb
  **variable peaks** cost-effectively.

---

## 6. Recommendations

The biggest win by far is putting a CDN in front of Blob storage, since egress is ~64%
of the bill and most of that traffic is cacheable audio. After that, the steady part of
the platform (the AKS baseline and Postgres) is a good fit for reserved instances or a
savings plan, while the bursty Spark/batch work can run on a cheaper spot node pool with
autoscaling. Older, rarely-played tracks can move to Cool/Archive storage tiers.

Beyond those, it's worth right-sizing SKUs against the actual utilization shown in
Grafana/Azure Monitor rather than guessing, and keeping an eye on cost per MAU as the
main efficiency number to track over time.
