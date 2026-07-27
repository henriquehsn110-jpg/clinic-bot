import json

def run_fx_stress_test():
    fx_rates = [5.00, 5.50, 6.00, 6.50, 7.00]
    # Meta USD rates
    meta_service_usd = 0.030
    meta_utility_usd = 0.035
    meta_marketing_usd = 0.0625
    gemini_per_conv_usd = 0.000330

    # Plans
    plans = {
        'Starter': {'price': 197.00, 'quota': 400, 'infra': 6.00},
        'Pro': {'price': 397.00, 'quota': 1200, 'infra': 10.00},
        'Enterprise': {'price': 697.00, 'quota': 2800, 'infra': 15.00}
    }

    results = []

    for fx in fx_rates:
        service_brl = meta_service_usd * fx
        utility_brl = meta_utility_usd * fx
        marketing_brl = meta_marketing_usd * fx
        weighted_meta_brl = 0.70 * ((service_brl + utility_brl) / 2) + 0.30 * marketing_brl
        gemini_brl = gemini_per_conv_usd * fx

        for plan_name, plan in plans.items():
            price = plan['price']
            quota = plan['quota']
            infra = plan['infra']

            # Modelo A: SaaS pays Meta for all quota conversations
            cogs_mod_a_full = (quota * weighted_meta_brl) + (quota * gemini_brl) + infra
            margin_mod_a_full = ((price - cogs_mod_a_full) / price) * 100

            # Modelo A (60% usage for Starter, 65% for Pro, 70% for Enterprise)
            usage_factor = 0.60 if plan_name == 'Starter' else (0.65 if plan_name == 'Pro' else 0.70)
            used_convs = quota * usage_factor
            cogs_mod_a_avg = (used_convs * weighted_meta_brl) + (used_convs * gemini_brl) + infra
            margin_mod_a_avg = ((price - cogs_mod_a_avg) / price) * 100

            # Modelo B: Meta gives 1000 free Service/Utility convs
            chargeable_convs_mod_b = max(0, quota - 1000)
            cogs_mod_b = (chargeable_convs_mod_b * weighted_meta_brl) + (quota * gemini_brl) + infra
            margin_mod_b = ((price - cogs_mod_b) / price) * 100

            # Modelo B Direct Repasse (Meta billed directly to clinic card for convs > 1000)
            cogs_mod_b_direct = (quota * gemini_brl) + infra
            margin_mod_b_direct = ((price - cogs_mod_b_direct) / price) * 100

            results.append({
                'fx': fx,
                'plan': plan_name,
                'price': price,
                'quota': quota,
                'weighted_meta_brl': round(weighted_meta_brl, 4),
                'gemini_brl': round(gemini_brl, 5),
                'cogs_mod_a_full': round(cogs_mod_a_full, 2),
                'margin_mod_a_full': round(margin_mod_a_full, 2),
                'cogs_mod_a_avg': round(cogs_mod_a_avg, 2),
                'margin_mod_a_avg': round(margin_mod_a_avg, 2),
                'cogs_mod_b': round(cogs_mod_b, 2),
                'margin_mod_b': round(margin_mod_b, 2),
                'cogs_mod_b_direct': round(cogs_mod_b_direct, 2),
                'margin_mod_b_direct': round(margin_mod_b_direct, 2),
                'pass_70_mod_b': margin_mod_b >= 70.0
            })

    return results

def run_marketing_traffic_stress_test():
    # What if clinic sends 100% Marketing conversations?
    fx = 5.50 # Base rate
    meta_mkt_usd = 0.0625
    mkt_brl = meta_mkt_usd * fx # R$ 0.34375
    gemini_brl = 0.000330 * fx # R$ 0.001815

    plans = {
        'Starter': {'price': 197.00, 'quota': 400, 'infra': 6.00, 'overage_rate': 0.35},
        'Pro': {'price': 397.00, 'quota': 1200, 'infra': 10.00, 'overage_rate': 0.30},
        'Enterprise': {'price': 697.00, 'quota': 2800, 'infra': 15.00, 'overage_rate': 0.25}
    }

    results = []

    # Test 100% marketing traffic within quota
    # Meta Free Tier does NOT apply to Marketing conversations! Meta charges ALL marketing conversations.
    for plan_name, plan in plans.items():
        price = plan['price']
        quota = plan['quota']
        infra = plan['infra']
        overage_rate = plan['overage_rate']

        meta_cost = quota * mkt_brl
        gemini_cost = quota * gemini_brl
        total_cogs = meta_cost + gemini_cost + infra
        profit = price - total_cogs
        margin = (profit / price) * 100

        # Overage test for 500 extra marketing conversations above quota
        extra_convs = 500
        overage_revenue = extra_convs * overage_rate
        overage_cogs = extra_convs * (mkt_brl + gemini_brl)
        overage_profit = overage_revenue - overage_cogs
        overage_margin = (overage_profit / overage_revenue) * 100 if overage_revenue > 0 else 0

        # Test FX = 6.50 with 100% Marketing
        mkt_brl_650 = meta_mkt_usd * 6.50 # R$ 0.40625
        total_cogs_650 = (quota * mkt_brl_650) + (quota * 0.000330 * 6.50) + infra
        profit_650 = price - total_cogs_650
        margin_650 = (profit_650 / price) * 100

        results.append({
            'plan': plan_name,
            'price': price,
            'quota': quota,
            'mkt_rate_brl_550': round(mkt_brl, 4),
            'meta_cost_quota': round(meta_cost, 2),
            'total_cogs_quota': round(total_cogs, 2),
            'profit_quota': round(profit, 2),
            'margin_quota_pct': round(margin, 2),
            'overage_rate': overage_rate,
            'overage_cogs_per_conv': round(mkt_brl + gemini_brl, 4),
            'overage_profit_500': round(overage_profit, 2),
            'overage_margin_pct': round(overage_margin, 2),
            'margin_650_fx_pct': round(margin_650, 2)
        })

    return results

def run_roi_stress_test():
    # Pricing matrix prices: Starter R$197, Pro R$397, Enterprise R$697
    # ROI doc prices: Starter R$197, Pro R$297, Enterprise R$397
    tickets = [100.0, 150.0, 200.0, 250.0, 500.0]
    plans_matrix = [
        ('Starter', 197.00),
        ('Pro', 397.00),
        ('Enterprise', 697.00)
    ]
    plans_roi_doc = [
        ('Starter', 197.00),
        ('Pro', 297.00),
        ('Enterprise', 397.00)
    ]

    results = []

    for ticket in tickets:
        for p_name, p_price in plans_matrix:
            creq = p_price / ticket
            creq_rounded = int(creq) if creq.is_integer() else int(creq) + 1
            # Recov income with creq_rounded
            recov_rev = creq_rounded * ticket
            net_profit = recov_rev - p_price
            roi_pct = (net_profit / p_price) * 100

            # Small clinic simulation: 100 appointments, 20% no-show = 20 no-shows, 65% efficiency = 13 recovered
            vol = 100
            no_show_rate = 0.20
            eff = 0.65
            recovered = round(vol * no_show_rate * eff) # 13
            recov_rev_sim = recovered * ticket
            net_sim = recov_rev_sim - p_price
            roi_sim_pct = (net_sim / p_price) * 100

            # Micro clinic simulation: 50 appointments, 20% no-show = 10 no-shows, 65% eff = 6.5 -> 6 recovered
            recovered_micro = round(50 * no_show_rate * eff) # 6
            recov_rev_micro = recovered_micro * ticket
            net_micro = recov_rev_micro - p_price
            roi_micro_pct = (net_micro / p_price) * 100

            results.append({
                'ticket': ticket,
                'plan': p_name,
                'price': p_price,
                'creq_exact': round(creq, 2),
                'creq_ceil': creq_rounded,
                'passes_2_consult_rule': creq_rounded <= 2,
                'sim_100_recovered': recovered,
                'sim_100_recov_rev': recov_rev_sim,
                'sim_100_net_profit': net_sim,
                'sim_100_roi_pct': round(roi_sim_pct, 1),
                'sim_50_recovered': recovered_micro,
                'sim_50_recov_rev': recov_rev_micro,
                'sim_50_net_profit': net_micro,
                'sim_50_roi_pct': round(roi_micro_pct, 1)
            })

    return results

if __name__ == '__main__':
    print("=== FX STRESS TEST ===")
    fx_res = run_fx_stress_test()
    for r in fx_res:
        if r['fx'] in [5.50, 6.50]:
            print(f"FX {r['fx']} | {r['plan']} (R${r['price']}): Mod B Margin={r['margin_mod_b']}% (COGS=R${r['cogs_mod_b']}), Mod B Direct Margin={r['margin_mod_b_direct']}%, Mod A Full Margin={r['margin_mod_a_full']}%")

    print("\n=== MARKETING TRAFFIC STRESS TEST ===")
    mkt_res = run_marketing_traffic_stress_test()
    for r in mkt_res:
        print(f"Plan {r['plan']} (R${r['price']}): Quota COGS 100% Mkt = R${r['total_cogs_quota']} | Margin = {r['margin_quota_pct']}% | Profit = R${r['profit_quota']} | Overage Margin = {r['overage_margin_pct']}% | FX 6.50 Margin = {r['margin_650_fx_pct']}%")

    print("\n=== ROI STRESS TEST ===")
    roi_res = run_roi_stress_test()
    for r in roi_res:
        if r['ticket'] in [100.0, 500.0]:
            print(f"Ticket R${r['ticket']} | Plan {r['plan']} (R${r['price']}): Creq={r['creq_exact']} (Ceil {r['creq_ceil']}) | Passes 2-Consult Rule: {r['passes_2_consult_rule']} | Sim 100 Vol Net: R${r['sim_100_net_profit']} (ROI {r['sim_100_roi_pct']}%) | Sim 50 Vol Net: R${r['sim_50_net_profit']} (ROI {r['sim_50_roi_pct']}%)")
