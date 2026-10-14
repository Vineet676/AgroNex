"""Deterministic, explainable planning engine for AgroNex."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

HORIZON_HOURS = 24.0
DISCOUNT_PERCENT = 15.0


def _round(value: float) -> float:
    return round(float(value) + 1e-9, 2)


def plan_distribution(inventory: list[dict], destinations: list[dict], transport: list[dict], strategy: str = "optimized", horizon_hours: float = HORIZON_HOURS) -> dict[str, Any]:
    if strategy not in {"baseline", "optimized"}:
        raise ValueError("strategy must be 'baseline' or 'optimized'")
    batches = deepcopy(inventory)
    dests = deepcopy(destinations)
    routes = deepcopy(transport)
    demand = {(d["destination_id"], commodity): max(0.0, float(qty))
              for d in dests for commodity, qty in d.get("demand_by_commodity", {}).items()}
    route_capacity = {r["destination_id"]: max(0.0, float(r["capacity_kg"])) for r in routes}
    dest_by_id = {d["destination_id"]: d for d in dests}
    route_by_dest = {r["destination_id"]: r for r in routes}
    allocations: list[dict] = []
    unallocated: dict[str, float] = {}
    remaining_by_batch: dict[str, float] = {}
    discount_recommendations: list[dict] = []
    initial_stock = sum(float(b["quantity_kg"]) for b in batches)

    # The baseline dispatches earliest-expiring batches first, choosing the feasible
    # destination with the shortest travel time. The optimizer values price net of
    # variable handling cost and transport cost while still prioritizing urgency.
    ordered_batches = sorted(batches, key=lambda b: (
        float(b["remaining_shelf_life_hours"]), b["batch_id"]))
    for batch in ordered_batches:
        left = float(batch["quantity_kg"])
        commodity = batch["commodity"]
        candidates = []
        for route in routes:
            dest_id = route["destination_id"]
            dest = dest_by_id.get(dest_id)
            if not dest or route["origin_id"] != batch.get("origin_id"):
                continue
            available_demand = demand.get((dest_id, commodity), 0.0)
            if available_demand <= 1e-8 or route_capacity.get(dest_id, 0.0) <= 1e-8:
                continue
            arrival = float(route["travel_time_hours"]) + float(batch.get("handling_time_hours", 0))
            if arrival > float(batch["remaining_shelf_life_hours"]) or arrival > float(dest["delivery_window_hours"]):
                continue
            if strategy == "baseline":
                score = -float(route["travel_time_hours"])
            else:
                price = float(dest.get("price_by_commodity", {}).get(commodity, batch["selling_price_per_kg"]))
                variable_transport = float(route["transport_cost"]) / max(float(route["capacity_kg"]), 1.0)
                variable_handling = float(batch.get("handling_cost_per_kg", 0))
                net_unit = price - variable_transport - variable_handling
                urgency = max(0.0, 1.0 - float(batch["remaining_shelf_life_hours"]) / max(horizon_hours, 1.0))
                # Higher net unit value and shorter travel are rewarded; urgency is
                # represented by processing short-life batches first.
                score = net_unit - float(route["travel_time_hours"]) * 0.35
            candidates.append((score, route, dest, arrival))
        candidates.sort(key=lambda x: (x[0], x[1]["destination_id"]), reverse=True)
        for _, route, dest, arrival in candidates:
            if left <= 1e-8:
                break
            dest_id = dest["destination_id"]
            available = min(left, demand.get((dest_id, commodity), 0.0), route_capacity.get(dest_id, 0.0))
            if available <= 1e-8:
                continue
            price = float(dest.get("price_by_commodity", {}).get(commodity, batch["selling_price_per_kg"]))
            transport_cost = float(route["transport_cost"]) * available / max(float(route["capacity_kg"]), 1.0)
            handling_cost = float(batch.get("handling_cost_per_kg", 0)) * available
            reason_codes = ["SHELF_LIFE_FEASIBLE", "DEMAND_AVAILABLE", "CAPACITY_AVAILABLE"]
            if strategy == "optimized":
                reason_codes.append("NET_VALUE_RANKED")
            allocations.append({
                "batch_id": batch["batch_id"], "commodity": commodity,
                "destination_id": dest_id, "destination_name": dest["name"],
                "quantity_kg": _round(available), "arrival_time_hours": _round(arrival),
                "selling_price_per_kg": _round(price),
                "expected_revenue": _round(price * available),
                "transport_cost": _round(transport_cost), "handling_cost": _round(handling_cost),
                "discount_percent": 0.0, "reason_codes": reason_codes,
                "reason": (f"Arrives in {arrival:g}h within the {batch['remaining_shelf_life_hours']:g}h shelf-life allowance; "
                           f"{available:g} kg fits demand and route capacity.")
            })
            left -= available
            demand[(dest_id, commodity)] = max(0.0, demand.get((dest_id, commodity), 0.0) - available)
            route_capacity[dest_id] = max(0.0, route_capacity.get(dest_id, 0.0) - available)
        left = max(0.0, left)
        remaining_by_batch[batch["batch_id"]] = left
        unallocated[batch["batch_id"]] = _round(left)
        if left > 0.01 and float(batch["remaining_shelf_life_hours"]) <= horizon_hours:
            discount_recommendations.append({
                "batch_id": batch["batch_id"], "commodity": commodity,
                "quantity_kg": _round(left), "discount_percent": DISCOUNT_PERCENT,
                "reason": "Unsold stock has limited remaining shelf life after feasible destinations were considered.",
                "suggested_price_per_kg": _round(float(batch["selling_price_per_kg"]) * (1 - DISCOUNT_PERCENT / 100)),
            })

    delivered = sum(a["quantity_kg"] for a in allocations)
    initial_demand = sum(float(q) for d in destinations for q in d.get("demand_by_commodity", {}).values())
    # For the fixed 24-hour planning horizon, unsold stock whose shelf-life expires
    # within that horizon is modeled as spoilage; other leftovers remain inventory.
    batch_by_id = {b["batch_id"]: b for b in batches}
    spoiled = sum(qty for batch_id, qty in remaining_by_batch.items()
                  if float(batch_by_id[batch_id]["remaining_shelf_life_hours"]) <= horizon_hours
                  for qty in [qty_for(remaining_by_batch, batch_id)])
    gross_revenue = sum(a["expected_revenue"] for a in allocations)
    transport_cost_total = sum(a["transport_cost"] for a in allocations)
    handling_cost_total = sum(a["handling_cost"] for a in allocations)
    # Discounts are recommendations for unsold stock, not assumed realized sales.
    net_revenue = gross_revenue - transport_cost_total - handling_cost_total
    metrics = {
        "initial_stock_kg": _round(initial_stock), "delivered_kg": _round(delivered),
        "spoiled_kg": _round(spoiled), "unallocated_kg": _round(initial_stock - delivered),
        "demand_fulfillment_percent": _round(min(100.0, delivered / initial_demand * 100) if initial_demand else 0),
        "spoilage_rate_percent": _round(min(100.0, spoiled / initial_stock * 100) if initial_stock else 0),
        "gross_revenue": _round(gross_revenue), "transport_cost": _round(transport_cost_total),
        "handling_cost": _round(handling_cost_total), "discount_cost": 0.0,
        "net_revenue": _round(net_revenue), "constraint_violations": 0,
    }
    return {
        "strategy": strategy, "allocations": allocations, "unallocated_stock": unallocated,
        "discount_recommendations": discount_recommendations, "metrics": metrics,
        "remaining_demand": {f"{dest_id}:{commodity}": _round(qty) for (dest_id, commodity), qty in demand.items() if qty > 0.01},
        "planning_horizon_hours": horizon_hours,
        "assumptions": ["24-hour planning horizon", "Transport cost allocated proportionally by used route capacity",
                        "Only feasible deliveries count as fulfilled demand", "Discount suggestions are not counted as revenue until sold"],
    }


def qty_for(values: dict, key: str) -> float:
    return float(values.get(key, 0.0))


def compare_plans(baseline: dict, optimized: dict) -> dict:
    b = baseline["metrics"]
    o = optimized["metrics"]
    def relative_improvement(old: float, new: float, lower_is_better: bool = False) -> float:
        if old == 0:
            return 0.0
        return _round(((old - new) if lower_is_better else (new - old)) / abs(old) * 100)
    return {
        "spoilage_reduction_percent": relative_improvement(b["spoiled_kg"], o["spoiled_kg"], True),
        "fulfillment_change_percentage_points": _round(o["demand_fulfillment_percent"] - b["demand_fulfillment_percent"]),
        "net_revenue_change_percent": relative_improvement(b["net_revenue"], o["net_revenue"]),
        "net_revenue_change_amount": _round(o["net_revenue"] - b["net_revenue"]),
        "delivered_change_kg": _round(o["delivered_kg"] - b["delivered_kg"]),
    }


def build_plan(inventory: list[dict], destinations: list[dict], transport: list[dict], horizon_hours: float = HORIZON_HOURS) -> dict:
    baseline = plan_distribution(inventory, destinations, transport, "baseline", horizon_hours)
    optimized = plan_distribution(inventory, destinations, transport, "optimized", horizon_hours)
    return {"baseline": baseline, "optimized": optimized,
            "improvement_summary": compare_plans(baseline, optimized)}


def apply_disruption(destinations: list[dict], transport: list[dict], request: dict) -> tuple[list[dict], list[dict]]:
    dests, routes = deepcopy(destinations), deepcopy(transport)
    demand_factor = max(0.0, 1 + float(request.get("demand_change_percent", 0)) / 100)
    capacity_factor = max(0.0, 1 + float(request.get("capacity_change_percent", 0)) / 100)
    delay = max(0.0, float(request.get("travel_delay_hours", 0)))
    for dest in dests:
        dest["demand_by_commodity"] = {k: _round(v * demand_factor) for k, v in dest.get("demand_by_commodity", {}).items()}
    for route in routes:
        route["travel_time_hours"] = _round(float(route["travel_time_hours"]) + delay)
        route["capacity_kg"] = _round(float(route["capacity_kg"]) * capacity_factor)
    return dests, routes


def explain_plan(plan: dict, question: str = "Explain the plan") -> dict:
    metrics = plan.get("metrics", {})
    allocations = plan.get("allocations", [])
    discounts = plan.get("discount_recommendations", [])
    if not allocations:
        summary = "No feasible dispatches were found. Check remaining shelf life, delivery windows, destination demand, and route capacity."
    else:
        top = sorted(allocations, key=lambda a: a.get("quantity_kg", 0), reverse=True)[:3]
        examples = "; ".join(f"{a['quantity_kg']:g} kg of {a.get('commodity', 'produce')} to {a.get('destination_name', a.get('destination_id'))} (arrival {a['arrival_time_hours']:g}h)" for a in top)
        summary = (f"The plan dispatches {metrics.get('delivered_kg', 0):g} kg across {len(allocations)} allocation(s). "
                   f"Largest allocations: {examples}. Modeled spoilage is {metrics.get('spoiled_kg', 0):g} kg and net revenue is ₹{metrics.get('net_revenue', 0):,.2f} after transport and handling costs.")
    if discounts:
        summary += f" {len(discounts)} batch(es) have discount suggestions because feasible allocations leave short-life stock unsold. Suggested discounts are rule-based and should be reviewed against local demand."
    summary += " All figures are estimates from the sample dataset and the disclosed 24-hour planning assumptions."
    return {"answer": summary, "question": question, "source": "deterministic plan outputs", "mode": "built-in explanation", "disclaimer": "Not live distributor data or a guarantee of actual spoilage/revenue."}
