from __future__ import annotations

import logging
from typing import Any, Callable
import pulp

logger = logging.getLogger("agronex.solver_milp")


def _round(val: float, decimals: int = 2) -> float:
    return round(float(val), decimals)


def solve_distribution_milp(
    active_batches: list[dict],
    destinations: list[dict],
    routes: list[dict],
    quarantined_waste_records: list[dict],
    immediate_spoilage_kg: float,
    horizon_hours: float = 24.0,
    default_disposal_fee: float = 5.0,
    default_cogs_ratio: float = 0.60,
    discount_calculator: Callable[[dict, float, str], dict | None] | None = None,
) -> dict | None:
    """Exact Mixed-Integer Linear Programming (MILP) solver for AgroNex produce distribution.

    Maximizes net economic profit across feasible batches, destinations, and routes
    using PuLP and the CBC solver. Enforces strict feasibility masking:
      (travel_time + handling_time) <= min(shelf_life, delivery_window).
    
    Returns None if infeasible, timed out, or if CBC fails to find an optimal solution.
    """
    try:
        dest_by_id = {d["destination_id"]: d for d in destinations}
        route_by_pair = {(r["origin_id"], r["destination_id"]): r for r in routes}
        batch_by_id = {b["batch_id"]: b for b in active_batches}

        # 1. Feasibility Hard Masking & Candidate Pairing
        feasible_pairs: list[tuple[str, str]] = []
        feasible_dests_by_batch: dict[str, list[str]] = {b["batch_id"]: [] for b in active_batches}
        arrival_by_pair: dict[tuple[str, str], float] = {}

        initial_demand_by_dest_comm: dict[tuple[str, str], float] = {
            (d["destination_id"], comm): float(qty)
            for d in destinations
            for comm, qty in d.get("demand_by_commodity", {}).items()
        }
        initial_demand_total = sum(initial_demand_by_dest_comm.values())

        initial_capacity_by_dest: dict[str, float] = {
            r["destination_id"]: float(r["capacity_kg"])
            for r in routes
        }
        initial_capacity_total = sum(initial_capacity_by_dest.values())
        initial_stock_total = sum(float(b["quantity_kg"]) for b in active_batches) + immediate_spoilage_kg

        for b in active_batches:
            b_id = b["batch_id"]
            origin = b["origin_id"]
            comm = b["commodity"]
            shelf_life = float(b["remaining_shelf_life_hours"])
            handling_time = float(b.get("handling_time_hours", 0.0))

            for d in destinations:
                d_id = d["destination_id"]
                route = route_by_pair.get((origin, d_id))
                if not route:
                    continue

                init_dem = initial_demand_by_dest_comm.get((d_id, comm), 0.0)
                if init_dem <= 1e-8:
                    continue

                arrival = float(route["travel_time_hours"]) + handling_time
                if arrival > shelf_life or arrival > float(d["delivery_window_hours"]):
                    continue

                feasible_pairs.append((b_id, d_id))
                feasible_dests_by_batch[b_id].append(d_id)
                arrival_by_pair[(b_id, d_id)] = arrival

        # Create PuLP optimization problem
        prob = pulp.LpProblem("AgroNex_Perishable_Distribution_MILP", pulp.LpMaximize)

        # 2. Decision Variables: x[b_id, d_id] >= 0
        x: dict[tuple[str, str], pulp.LpVariable] = {}
        for (b_id, d_id) in feasible_pairs:
            b = batch_by_id[b_id]
            comm = b["commodity"]
            dem = initial_demand_by_dest_comm.get((d_id, comm), 0.0)
            route = route_by_pair[(b["origin_id"], d_id)]
            cap = float(route["capacity_kg"])
            stock = float(b["quantity_kg"])
            ub = min(stock, dem, cap)
            var_name = f"dispatch_{b_id}_{d_id}".replace("-", "_")
            x[(b_id, d_id)] = pulp.LpVariable(var_name, lowBound=0.0, upBound=ub, cat=pulp.LpContinuous)

        # 3. Objective Function Formulation
        objective_terms = []

        # Revenue minus Transport minus Handling minus Procurement COGS
        for (b_id, d_id), var in x.items():
            b = batch_by_id[b_id]
            d = dest_by_id[d_id]
            r = route_by_pair[(b["origin_id"], d_id)]
            comm = b["commodity"]
            dest_price = float(d.get("price_by_commodity", {}).get(comm, b["selling_price_per_kg"]))
            unit_transport = float(r["transport_cost"]) / max(float(r["capacity_kg"]), 1.0)
            handling_cost = float(b.get("handling_cost_per_kg", 0.0))
            u_cost = float(
                b.get("unit_cost_per_kg")
                if b.get("unit_cost_per_kg") is not None
                else float(b.get("selling_price_per_kg", 0.0)) * default_cogs_ratio
            )
            net_margin = dest_price - unit_transport - handling_cost - u_cost
            arrival = arrival_by_pair[(b_id, d_id)]
            # Tiny tie-breaker (1e-6) preferring earlier arrival
            tie_breaker = 1e-6 * max(0.0, horizon_hours - arrival)
            objective_terms.append((net_margin + tie_breaker) * var)

        # Spoilage Penalties for unallocated active stock expiring within horizon_hours
        for b in active_batches:
            b_id = b["batch_id"]
            shelf_life = float(b.get("remaining_shelf_life_hours", 0.0))
            stock = float(b["quantity_kg"])
            if shelf_life <= horizon_hours:
                u_cost = float(
                    b.get("unit_cost_per_kg")
                    if b.get("unit_cost_per_kg") is not None
                    else float(b.get("selling_price_per_kg", 0.0)) * default_cogs_ratio
                )
                penalty_per_kg = u_cost + default_disposal_fee
                dests_for_b = feasible_dests_by_batch[b_id]
                if dests_for_b:
                    dispatched = pulp.lpSum(x[(b_id, d_id)] for d_id in dests_for_b)
                    objective_terms.append(-penalty_per_kg * (stock - dispatched))
                else:
                    objective_terms.append(-penalty_per_kg * stock)

        prob += pulp.lpSum(objective_terms)

        # 4. Hard Constraints

        # Constraint A: Batch Stock Conservation
        for b in active_batches:
            b_id = b["batch_id"]
            dests_for_b = feasible_dests_by_batch[b_id]
            if dests_for_b:
                prob += (
                    pulp.lpSum(x[(b_id, d_id)] for d_id in dests_for_b) <= float(b["quantity_kg"]),
                    f"StockConservation_{b_id}".replace("-", "_")
                )

        # Constraint B: Destination Demand Limits per Commodity
        for d in destinations:
            d_id = d["destination_id"]
            for comm, dem_qty in d.get("demand_by_commodity", {}).items():
                matching_vars = [
                    x[(b_id, d_id)]
                    for (b_id, dest_id) in x
                    if dest_id == d_id and batch_by_id[b_id]["commodity"] == comm
                ]
                if matching_vars:
                    prob += (
                        pulp.lpSum(matching_vars) <= float(dem_qty),
                        f"DemandLimit_{d_id}_{comm}".replace("-", "_")
                    )

        # Constraint C: Corridor / Route Capacity Limits
        for r in routes:
            origin = r["origin_id"]
            dest_id = r["destination_id"]
            cap = float(r["capacity_kg"])
            corridor_vars = [
                x[(b_id, d_id)]
                for (b_id, d_id) in x
                if d_id == dest_id and batch_by_id[b_id]["origin_id"] == origin
            ]
            if corridor_vars:
                prob += (
                    pulp.lpSum(corridor_vars) <= cap,
                    f"RouteCap_{origin}_{dest_id}".replace("-", "_")
                )

        # 5. Solve using CBC
        solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=10)
        prob.solve(solver)

        status_str = pulp.LpStatus.get(prob.status, "Unknown")
        if status_str != "Optimal":
            logger.warning(f"PuLP MILP solver ended with non-optimal status: {status_str}")
            return None

        # 6. Extract Allocations and Track Remaining Capacities/Demand
        allocations: list[dict[str, Any]] = []
        remaining_demand = dict(initial_demand_by_dest_comm)
        remaining_route_capacity = dict(initial_capacity_by_dest)
        dispatched_by_batch: dict[str, float] = {b["batch_id"]: 0.0 for b in active_batches}

        for (b_id, d_id), var in x.items():
            qty = float(var.varValue or 0.0)
            if qty > 1e-4:
                qty_round = _round(qty)
                b = batch_by_id[b_id]
                d = dest_by_id[d_id]
                r = route_by_pair[(b["origin_id"], d_id)]
                comm = b["commodity"]
                dest_price = float(d.get("price_by_commodity", {}).get(comm, b["selling_price_per_kg"]))
                unit_transport = float(r["transport_cost"]) / max(float(r["capacity_kg"]), 1.0)
                transport_cost = _round(unit_transport * qty)
                handling_cost = _round(float(b.get("handling_cost_per_kg", 0.0)) * qty)
                rev = _round(dest_price * qty)
                arrival = arrival_by_pair[(b_id, d_id)]
                shelf_life = float(b["remaining_shelf_life_hours"])

                allocations.append({
                    "batch_id": b_id,
                    "commodity": comm,
                    "origin_id": b["origin_id"],
                    "destination_id": d_id,
                    "destination_name": d["name"],
                    "quantity_kg": qty_round,
                    "arrival_time_hours": _round(arrival),
                    "selling_price_per_kg": _round(dest_price),
                    "expected_revenue": rev,
                    "transport_cost": transport_cost,
                    "handling_cost": handling_cost,
                    "net_revenue": _round(rev - transport_cost - handling_cost),
                    "discount_percent": 0.0,
                    "reason_codes": [
                        "SHELF_LIFE_FEASIBLE",
                        "DELIVERY_WINDOW_FEASIBLE",
                        "DEMAND_AVAILABLE",
                        "CAPACITY_AVAILABLE",
                        "MILP_OPTIMAL_ALLOCATION",
                    ],
                    "reason": (
                        f"MILP exact optimal dispatch: arrives in {arrival:g}h within {shelf_life:g}h shelf life. "
                        f"Delivers {qty_round:g} kg to {d['name']} maximizing global economic objective."
                    ),
                })

                dispatched_by_batch[b_id] += qty
                remaining_demand[(d_id, comm)] = max(0.0, remaining_demand.get((d_id, comm), 0.0) - qty)
                remaining_route_capacity[d_id] = max(0.0, remaining_route_capacity.get(d_id, 0.0) - qty)

        # 7. Unallocated Stock & Discount Engine Evaluation
        unallocated_stock: dict[str, float] = {}
        discount_recommendations: list[dict[str, Any]] = []
        unallocated_expired_kg = 0.0
        fresh_surplus_kg = 0.0

        for b in active_batches:
            b_id = b["batch_id"]
            stock = float(b["quantity_kg"])
            disp = dispatched_by_batch.get(b_id, 0.0)
            left = max(0.0, stock - disp)
            unallocated_stock[b_id] = _round(left)
            shelf_life = float(b["remaining_shelf_life_hours"])

            if left > 0.01:
                if shelf_life <= horizon_hours:
                    unallocated_expired_kg += left
                else:
                    fresh_surplus_kg += left

                if discount_calculator:
                    reason = "Destination capacity or demand exhausted in optimal allocation"
                    rec = discount_calculator(b, left, reason)
                    if rec:
                        discount_recommendations.append(rec)

        # Register quarantined batches in unallocated stock
        for q in quarantined_waste_records:
            unallocated_stock[q["batch_id"]] = _round(q["quantity_kg"])

        # 8. Compute Full Metrics
        delivered_kg = sum(a["quantity_kg"] for a in allocations)
        spoiled_kg = immediate_spoilage_kg + unallocated_expired_kg
        gross_revenue = sum(a["expected_revenue"] for a in allocations)
        transport_cost_total = sum(a["transport_cost"] for a in allocations)
        handling_cost_total = sum(a["handling_cost"] for a in allocations)
        net_revenue = gross_revenue - transport_cost_total - handling_cost_total

        procurement_cost_total = 0.0
        for a in allocations:
            b = batch_by_id[a["batch_id"]]
            u_cost = float(
                b.get("unit_cost_per_kg")
                if b.get("unit_cost_per_kg") is not None
                else float(b.get("selling_price_per_kg", 0.0)) * default_cogs_ratio
            )
            procurement_cost_total += u_cost * float(a["quantity_kg"])

        spoilage_penalty_total = 0.0
        for q in quarantined_waste_records:
            b = q  # contains batch metadata or lookup
            u_cost = float(
                b.get("unit_cost_per_kg")
                if b.get("unit_cost_per_kg") is not None
                else float(b.get("selling_price_per_kg", 0.0)) * default_cogs_ratio
            )
            spoilage_penalty_total += float(q["quantity_kg"]) * (u_cost + default_disposal_fee)

        for b in active_batches:
            b_id = b["batch_id"]
            left = unallocated_stock.get(b_id, 0.0)
            shelf_life = float(b["remaining_shelf_life_hours"])
            if left > 0.01 and shelf_life <= horizon_hours:
                u_cost = float(
                    b.get("unit_cost_per_kg")
                    if b.get("unit_cost_per_kg") is not None
                    else float(b.get("selling_price_per_kg", 0.0)) * default_cogs_ratio
                )
                spoilage_penalty_total += left * (u_cost + default_disposal_fee)

        net_profit = net_revenue - procurement_cost_total - spoilage_penalty_total
        potential_discount_revenue = sum(d["potential_discounted_revenue"] for d in discount_recommendations)

        unmet_demand_kg = sum(remaining_demand.values())
        unused_capacity_kg = sum(remaining_route_capacity.values())

        demand_fulfillment_percent = (
            _round(min(100.0, (delivered_kg / initial_demand_total) * 100))
            if initial_demand_total > 0
            else 0.0
        )
        spoilage_rate_percent = (
            _round(min(100.0, (spoiled_kg / initial_stock_total) * 100))
            if initial_stock_total > 0
            else 0.0
        )
        capacity_utilization_percent = (
            _round(min(100.0, ((initial_capacity_total - unused_capacity_kg) / initial_capacity_total) * 100))
            if initial_capacity_total > 0
            else 0.0
        )

        metrics = {
            "initial_stock_kg": _round(initial_stock_total),
            "stock_used_kg": _round(delivered_kg),
            "delivered_kg": _round(delivered_kg),
            "unallocated_kg": _round(initial_stock_total - delivered_kg),
            "expired_stock_kg": _round(spoiled_kg),
            "spoiled_kg": _round(spoiled_kg),
            "immediate_spoilage_kg": _round(immediate_spoilage_kg),
            "fresh_surplus_kg": _round(fresh_surplus_kg),
            "spoilage_rate_percent": spoilage_rate_percent,
            "initial_demand_kg": _round(initial_demand_total),
            "unmet_demand_kg": _round(unmet_demand_kg),
            "demand_fulfillment_percent": demand_fulfillment_percent,
            "initial_capacity_kg": _round(initial_capacity_total),
            "unused_capacity_kg": _round(unused_capacity_kg),
            "capacity_utilization_percent": capacity_utilization_percent,
            "gross_revenue": _round(gross_revenue),
            "transport_cost": _round(transport_cost_total),
            "handling_cost": _round(handling_cost_total),
            "procurement_cost": _round(procurement_cost_total),
            "spoilage_penalties": _round(spoilage_penalty_total),
            "discount_cost": 0.0,
            "net_revenue": _round(net_revenue),
            "net_profit": _round(net_profit),
            "potential_discount_revenue": _round(potential_discount_revenue),
            "constraint_violations": 0,
        }

        assumptions = [
            f"{horizon_hours:g}-hour planning horizon",
            "Exact Mixed-Integer Linear Programming (MILP) solved via PuLP/CBC",
            "Optimal economic profit subject to strict shelf life, vehicle capacity, and demand constraints",
            "Transport costs allocated proportionally by dispatched route weight",
        ]

        return {
            "strategy": "optimized_milp",
            "strategy_description": "Exact MILP Solver (PuLP/CBC): Globally optimizes net economic profit subject to all physical constraints.",
            "allocations": allocations,
            "unallocated_stock": unallocated_stock,
            "discount_recommendations": discount_recommendations,
            "quarantined_waste": quarantined_waste_records,
            "immediate_spoilage_kg": _round(immediate_spoilage_kg),
            "metrics": metrics,
            "remaining_demand": {
                f"{d_id}:{comm}": _round(qty)
                for (d_id, comm), qty in remaining_demand.items()
                if qty > 0.01
            },
            "unused_route_capacity": {
                d_id: _round(cap)
                for d_id, cap in remaining_route_capacity.items()
            },
            "planning_horizon_hours": horizon_hours,
            "assumptions": assumptions,
            "solver_used": "MILP_PULP",
        }

    except Exception as exc:
        logger.exception(f"Unexpected error in solve_distribution_milp: {exc}")
        return None
