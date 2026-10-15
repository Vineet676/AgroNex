"""Deterministic, explainable planning engine for AgroNex.

Implements:
1. Baseline strategy: First-available stock assigned to nearest feasible destination
   without economic or scarcity optimization.
2. Optimized strategy: Route-scarcity aware, net-margin maximizing distribution
   that reserves scarce corridors for the most perishable batches.
3. Urgency-tiered discount engine for unsold stock expiring within planning horizon.
4. Comprehensive multi-metric plan comparisons with explicit cost breakdowns.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from .validation import validate_planning_dataset, ValidationError

HORIZON_HOURS = 24.0


def _round(value: float) -> float:
    return round(float(value) + 1e-9, 2)


def calculate_discount_recommendation(
    batch: dict[str, Any],
    unsold_kg: float,
    unalloc_reason: str,
) -> dict[str, Any] | None:
    """Calculates an urgency-tiered discount recommendation for unsold stock.
    
    Rules:
    - Shelf life <= Handling buffer: Unviable for commercial discount; diverted to organic compost/biogas
    - Shelf life < 6h: 30% discount (Critical clearance)
    - 6h <= Shelf life <= 12h: 20% discount (High urgency)
    - 12h < Shelf life <= 24h: 10% discount (Moderate urgency)
    - Shelf life > 24h: No discount recommended (fresh surplus retained for next cycle)
    
    Clearly distinguished as a recommendation, NOT a confirmed sale.
    """
    if unsold_kg <= 0.01:
        return None

    shelf_life = float(batch.get("remaining_shelf_life_hours", 0.0))
    if shelf_life > HORIZON_HOURS:
        return None

    handling_buffer = float(batch.get("handling_time_hours", 1.0))
    base_price = float(batch.get("selling_price_per_kg", 0.0))

    # Physical feasibility gate against warehouse handling buffer
    if shelf_life <= handling_buffer:
        reason = (
            f"Normal allocation could not place {unsold_kg:g} kg: {unalloc_reason}. "
            f"Remaining shelf life ({shelf_life:g}h) is less than or equal to handling buffer ({handling_buffer:g}h). "
            f"Produce is unviable for commercial sale and cannot clear staging; diverted immediately to organic compost or biogas."
        )
        return {
            "batch_id": batch["batch_id"],
            "commodity": batch["commodity"],
            "quantity_kg": _round(unsold_kg),
            "remaining_shelf_life_hours": _round(shelf_life),
            "handling_time_hours": _round(handling_buffer),
            "original_price_per_kg": _round(base_price),
            "suggested_price_per_kg": 0.0,
            "discount_percent": 0.0,
            "urgency_tier": "Unviable (Shelf life <= Handling Buffer)",
            "potential_discounted_revenue": 0.0,
            "type": "compost_diversion",
            "is_confirmed_sale": False,
            "status": "UNVIABLE_FOR_DISCOUNT_COMPOST_ONLY",
            "action": "Immediate Organic Composting / Biogas Diversion",
            "reason": reason,
        }

    if shelf_life < 6.0:
        discount_percent = 30.0
        urgency_tier = "< 6h (Critical Clearance)"
        action_note = "Urgent markdown recommended to clear remaining stock before imminent spoilage."
    elif shelf_life <= 12.0:
        discount_percent = 20.0
        urgency_tier = "6-12h (High Urgency)"
        action_note = "Substantial markdown recommended for same-day local clearance."
    else:  # 12 to 24 hours
        discount_percent = 10.0
        urgency_tier = "12-24h (Moderate Urgency)"
        action_note = "Early promotional markdown recommended to accelerate secondary channel sales."

    suggested_price = _round(base_price * (1.0 - discount_percent / 100.0))
    potential_revenue = _round(suggested_price * unsold_kg)

    full_reason = f"Normal allocation could not place {unsold_kg:g} kg: {unalloc_reason}. With {shelf_life:g}h shelf life remaining [{urgency_tier}], {action_note}"

    return {
        "batch_id": batch["batch_id"],
        "commodity": batch["commodity"],
        "quantity_kg": _round(unsold_kg),
        "remaining_shelf_life_hours": _round(shelf_life),
        "original_price_per_kg": _round(base_price),
        "suggested_price_per_kg": suggested_price,
        "discount_percent": discount_percent,
        "urgency_tier": urgency_tier,
        "potential_discounted_revenue": potential_revenue,
        "type": "recommendation",
        "is_confirmed_sale": False,
        "status": "RECOMMENDED_NOT_REALIZED",
        "reason": full_reason,
    }


def plan_distribution(
    inventory: list[dict],
    destinations: list[dict],
    transport: list[dict],
    strategy: str = "optimized",
    horizon_hours: float = HORIZON_HOURS,
) -> dict[str, Any]:
    """Computes a transparent, constraint-satisfying produce distribution plan.
    
    Strategies:
    - 'baseline': Greedy first-available allocation to nearest feasible destination.
      No margin ranking, no scarcity preservation.
    - 'optimized': Route-scarcity reservation prioritizing vulnerable batches on scarce corridors,
      maximizing net margin after transport and handling.
    """
    if strategy not in {"baseline", "optimized"}:
        raise ValueError("strategy must be 'baseline' or 'optimized'")

    # Validate inputs thoroughly
    val_inventory, val_destinations, val_transport = validate_planning_dataset(
        inventory, destinations, transport
    )

    batches = deepcopy(val_inventory)
    dests = deepcopy(val_destinations)
    routes = deepcopy(val_transport)

    dest_by_id = {d["destination_id"]: d for d in dests}
    route_by_pair = {(r["origin_id"], r["destination_id"]): r for r in routes}

    # Tracking dynamic state
    demand = {
        (d["destination_id"], commodity): float(qty)
        for d in dests
        for commodity, qty in d.get("demand_by_commodity", {}).items()
    }
    initial_demand_by_dest_comm = deepcopy(demand)
    initial_demand_total = sum(demand.values())

    route_capacity = {
        r["destination_id"]: float(r["capacity_kg"])
        for r in routes
    }
    initial_route_capacity = deepcopy(route_capacity)
    initial_capacity_total = sum(initial_route_capacity.values())

    initial_stock_total = sum(float(b["quantity_kg"]) for b in batches)

    allocations: list[dict[str, Any]] = []
    unallocated: dict[str, float] = {}
    remaining_by_batch: dict[str, float] = {}
    discount_recommendations: list[dict[str, Any]] = []

    # 1. Quarantine partitioning: batches unable to clear handling buffer are immediate compost waste
    active_batches: list[dict[str, Any]] = []
    quarantined_waste_records: list[dict[str, Any]] = []
    immediate_spoilage_kg = 0.0

    for b in batches:
        shelf_life = float(b.get("remaining_shelf_life_hours", 0.0))
        handling_time = float(b.get("handling_time_hours", 0.0))
        if shelf_life <= handling_time:
            qty = float(b.get("quantity_kg", 0.0))
            immediate_spoilage_kg += qty
            quarantined_waste_records.append({
                "batch_id": b["batch_id"],
                "commodity": b["commodity"],
                "quantity_kg": qty,
                "status": "IMMEDIATE_COMPOST_WASTE",
                "remaining_shelf_life_hours": shelf_life,
                "handling_time_hours": handling_time,
                "action": "Divert immediately to organic compost or biogas digester",
                "reason": (
                    f"Remaining shelf life ({shelf_life:g}h) is less than or equal to mandatory "
                    f"warehouse handling buffer ({handling_time:g}h). Produce cannot clear staging."
                ),
            })
        else:
            active_batches.append(b)

    # Pre-calculate feasible route options for each active batch to measure Route Scarcity
    # A route is feasible if origin matches, arrival time <= batch shelf life and delivery window,
    # and initial destination demand for the commodity is > 0.
    batch_feasible_destinations: dict[str, list[dict]] = {}
    for batch in active_batches:
        b_id = batch["batch_id"]
        origin = batch["origin_id"]
        comm = batch["commodity"]
        shelf = float(batch["remaining_shelf_life_hours"])
        handling_time = float(batch.get("handling_time_hours", 0.0))

        feasible_dests = []
        for d in dests:
            d_id = d["destination_id"]
            route = route_by_pair.get((origin, d_id))
            if not route:
                continue
            init_dem = initial_demand_by_dest_comm.get((d_id, comm), 0.0)
            if init_dem <= 1e-8:
                continue
            arrival = float(route["travel_time_hours"]) + handling_time
            if arrival > shelf or arrival > float(d["delivery_window_hours"]):
                continue
            feasible_dests.append(d)
        batch_feasible_destinations[b_id] = feasible_dests

    # Count how many fragile/perishable batches depend on each destination corridor
    # to protect scarce corridors in the optimizer.
    corridor_scarcity: dict[str, float] = {d["destination_id"]: 0.0 for d in dests}
    for batch in active_batches:
        b_id = batch["batch_id"]
        shelf = float(batch["remaining_shelf_life_hours"])
        opts = batch_feasible_destinations[b_id]
        if not opts:
            continue
        # Fragile batches (shelf life <= horizon) with few options heavily weight corridor scarcity
        weight = (1.0 / max(1, len(opts))) * (1.0 if shelf <= horizon_hours else 0.25)
        for d in opts:
            corridor_scarcity[d["destination_id"]] += weight

    # Batch Ordering Strategy
    if strategy == "baseline":
        # Baseline order: Pure first-available order (as listed in inventory)
        # without sorting or optimization.
        ordered_batches = active_batches
    else:
        # Optimized order: Reserves scarce feasible routes for the most perishable batches.
        # Priority combines perishability urgency with route scarcity (fewer feasible routes = higher priority).
        def optimized_priority(b: dict) -> tuple[float, float, str]:
            shelf = float(b["remaining_shelf_life_hours"])
            opts_count = len(batch_feasible_destinations.get(b["batch_id"], []))
            # Scarcity factor: batches with 1 feasible route get massive priority over batches with 3+ options
            scarcity_factor = 1.0 / max(1, opts_count)
            # High priority score means processed earlier
            priority_score = (1.0 / max(0.5, shelf)) * (1.0 + 2.0 * scarcity_factor)
            return (-priority_score, shelf, b["batch_id"])

        ordered_batches = sorted(active_batches, key=optimized_priority)

    # Process each batch
    for batch in ordered_batches:
        b_id = batch["batch_id"]
        left = float(batch["quantity_kg"])
        commodity = batch["commodity"]
        origin = batch["origin_id"]
        shelf_life = float(batch["remaining_shelf_life_hours"])
        handling_time = float(batch.get("handling_time_hours", 0.0))
        handling_cost_per_kg = float(batch.get("handling_cost_per_kg", 0.0))
        base_price = float(batch["selling_price_per_kg"])

        candidates = []
        unalloc_reasons_encountered = []

        for route in routes:
            d_id = route["destination_id"]
            dest = dest_by_id.get(d_id)
            if not dest or route["origin_id"] != origin:
                continue

            available_demand = demand.get((d_id, commodity), 0.0)
            available_cap = route_capacity.get(d_id, 0.0)

            arrival = float(route["travel_time_hours"]) + handling_time
            if arrival > shelf_life:
                unalloc_reasons_encountered.append(f"Transit time to {dest['name']} ({arrival:g}h) exceeds remaining shelf life ({shelf_life:g}h)")
                continue
            if arrival > float(dest["delivery_window_hours"]):
                unalloc_reasons_encountered.append(f"Transit time to {dest['name']} ({arrival:g}h) exceeds destination delivery window ({dest['delivery_window_hours']:g}h)")
                continue
            if available_demand <= 1e-8:
                unalloc_reasons_encountered.append(f"Destination {dest['name']} demand for {commodity} is satisfied")
                continue
            if available_cap <= 1e-8:
                unalloc_reasons_encountered.append(f"Route capacity to {dest['name']} is fully utilized")
                continue

            dest_price = float(dest.get("price_by_commodity", {}).get(commodity, base_price))
            variable_transport = float(route["transport_cost"]) / max(float(route["capacity_kg"]), 1.0)
            net_unit_value = dest_price - variable_transport - handling_cost_per_kg

            if strategy == "baseline":
                # Baseline scoring: Purely nearest destination (shortest travel time)
                # Does NOT consider net revenue, transport cost, or route scarcity.
                score = -float(route["travel_time_hours"])
            else:
                # Optimized scoring:
                # 1. Economic net unit value (destination price - route transport - batch handling)
                # 2. Transit time efficiency (prefers earlier arrival to preserve consumer shelf life)
                # 3. Route preservation: If this batch has multiple alternative options,
                #    avoid consuming scarce corridors that other fragile batches critically need!
                opts_for_this_batch = len(batch_feasible_destinations.get(b_id, []))
                dest_scarcity_demand = corridor_scarcity.get(d_id, 0.0)
                # If batch has plenty of choices, penalize picking a corridor heavily needed by one-route batches
                preservation_penalty = 0.0
                if opts_for_this_batch > 1 and dest_scarcity_demand > 1.2:
                    preservation_penalty = 0.8 * (dest_scarcity_demand / opts_for_this_batch)

                score = net_unit_value - float(route["travel_time_hours"]) * 0.25 - preservation_penalty

            candidates.append({
                "score": score,
                "route": route,
                "dest": dest,
                "arrival": arrival,
                "dest_price": dest_price,
                "variable_transport": variable_transport,
                "net_unit_value": net_unit_value,
            })

        # Sort candidate destinations for this batch
        candidates.sort(key=lambda x: (x["score"], -x["arrival"]), reverse=True)

        for cand in candidates:
            if left <= 1e-8:
                break

            dest = cand["dest"]
            route = cand["route"]
            d_id = dest["destination_id"]
            arrival = cand["arrival"]
            dest_price = cand["dest_price"]

            avail_demand = demand.get((d_id, commodity), 0.0)
            avail_cap = route_capacity.get(d_id, 0.0)
            dispatch_qty = min(left, avail_demand, avail_cap)

            if dispatch_qty <= 1e-8:
                continue

            unit_transport_cost = float(route["transport_cost"]) / max(float(route["capacity_kg"]), 1.0)
            transport_cost = unit_transport_cost * dispatch_qty
            handling_cost = handling_cost_per_kg * dispatch_qty
            revenue = dest_price * dispatch_qty

            reason_codes = ["SHELF_LIFE_FEASIBLE", "DELIVERY_WINDOW_FEASIBLE", "DEMAND_AVAILABLE", "CAPACITY_AVAILABLE"]
            if strategy == "baseline":
                reason_codes.append("NEAREST_FEASIBLE_DESTINATION")
                allocation_reason = (
                    f"Baseline selected nearest feasible destination ({dest['name']}, {route['travel_time_hours']:g}h transit); "
                    f"allocated {dispatch_qty:g} kg within available capacity."
                )
            else:
                reason_codes.extend(["SCARCITY_RESERVED", "NET_MARGIN_OPTIMIZED"])
                allocation_reason = (
                    f"Arrives in {arrival:g}h within {shelf_life:g}h shelf life; net value ₹{cand['net_unit_value']:,.2f}/kg. "
                    f"Allocated {dispatch_qty:g} kg respecting corridor capacity and demand."
                )

            allocations.append({
                "batch_id": b_id,
                "commodity": commodity,
                "origin_id": origin,
                "destination_id": d_id,
                "destination_name": dest["name"],
                "quantity_kg": _round(dispatch_qty),
                "arrival_time_hours": _round(arrival),
                "selling_price_per_kg": _round(dest_price),
                "expected_revenue": _round(revenue),
                "transport_cost": _round(transport_cost),
                "handling_cost": _round(handling_cost),
                "net_revenue": _round(revenue - transport_cost - handling_cost),
                "discount_percent": 0.0,
                "reason_codes": reason_codes,
                "reason": allocation_reason,
            })

            left -= dispatch_qty
            demand[(d_id, commodity)] = max(0.0, demand.get((d_id, commodity), 0.0) - dispatch_qty)
            route_capacity[d_id] = max(0.0, route_capacity.get(d_id, 0.0) - dispatch_qty)

        left = max(0.0, left)
        remaining_by_batch[b_id] = left
        unallocated[b_id] = _round(left)

        # Discount engine: evaluate unsold stock
        if left > 0.01:
            primary_reason = unalloc_reasons_encountered[0] if unalloc_reasons_encountered else "Destination capacity or demand exhausted"
            rec = calculate_discount_recommendation(batch, left, primary_reason)
            if rec:
                discount_recommendations.append(rec)

    # Register quarantined batches in unallocated stock
    for q in quarantined_waste_records:
        unallocated[q["batch_id"]] = _round(q["quantity_kg"])

    # Compute comprehensive metrics
    delivered_kg = sum(a["quantity_kg"] for a in allocations)
    batch_map = {b["batch_id"]: b for b in batches}

    # Spoilage / Expired stock: unsold active stock with remaining shelf life <= planning horizon + immediate_spoilage_kg
    unallocated_expired_kg = sum(
        qty for b_id, qty in remaining_by_batch.items()
        if float(batch_map[b_id]["remaining_shelf_life_hours"]) <= horizon_hours
    )
    spoiled_kg = immediate_spoilage_kg + unallocated_expired_kg

    # Fresh surplus: unsold stock with shelf life > planning horizon
    fresh_surplus_kg = sum(
        qty for b_id, qty in remaining_by_batch.items()
        if float(batch_map[b_id]["remaining_shelf_life_hours"]) > horizon_hours
    )

    unmet_demand_kg = sum(demand.values())
    unused_capacity_kg = sum(route_capacity.values())

    gross_revenue = sum(a["expected_revenue"] for a in allocations)
    transport_cost_total = sum(a["transport_cost"] for a in allocations)
    handling_cost_total = sum(a["handling_cost"] for a in allocations)
    net_revenue = gross_revenue - transport_cost_total - handling_cost_total

    # Potential discount revenue if all recommendations are transacted
    potential_discount_revenue = sum(d["potential_discounted_revenue"] for d in discount_recommendations)

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

    strategy_desc = (
        "Baseline heuristic: First-available stock dispatched to nearest feasible destination with open capacity, without economic optimization."
        if strategy == "baseline"
        else "Optimized planner: Route-scarcity reservation protects fragile produce corridors; allocates for maximum net margin (price - transport - handling)."
    )

    metrics = {
        # Inventory & stock metrics
        "initial_stock_kg": _round(initial_stock_total),
        "stock_used_kg": _round(delivered_kg),
        "delivered_kg": _round(delivered_kg),
        "unallocated_kg": _round(initial_stock_total - delivered_kg),
        "expired_stock_kg": _round(spoiled_kg),
        "spoiled_kg": _round(spoiled_kg),
        "immediate_spoilage_kg": _round(immediate_spoilage_kg),
        "fresh_surplus_kg": _round(fresh_surplus_kg),
        "spoilage_rate_percent": spoilage_rate_percent,

        # Demand metrics
        "initial_demand_kg": _round(initial_demand_total),
        "unmet_demand_kg": _round(unmet_demand_kg),
        "demand_fulfillment_percent": demand_fulfillment_percent,

        # Transport & capacity metrics
        "initial_capacity_kg": _round(initial_capacity_total),
        "unused_capacity_kg": _round(unused_capacity_kg),
        "capacity_utilization_percent": capacity_utilization_percent,

        # Financial cost components
        "gross_revenue": _round(gross_revenue),
        "transport_cost": _round(transport_cost_total),
        "handling_cost": _round(handling_cost_total),
        "discount_cost": 0.0,
        "net_revenue": _round(net_revenue),
        "potential_discount_revenue": _round(potential_discount_revenue),

        # Reliability
        "constraint_violations": 0,
    }

    assumptions = [
        f"{horizon_hours:g}-hour planning horizon",
        "Transport costs allocated proportionally by dispatched route weight",
        "Only feasible deliveries arriving prior to shelf life and delivery window count as fulfilled",
        "Discount recommendations depend strictly on urgency tiers and are NOT counted as realized revenue until sold",
    ]

    return {
        "strategy": strategy,
        "strategy_description": strategy_desc,
        "allocations": allocations,
        "unallocated_stock": unallocated,
        "discount_recommendations": discount_recommendations,
        "quarantined_waste": quarantined_waste_records,
        "immediate_spoilage_kg": _round(immediate_spoilage_kg),
        "metrics": metrics,
        "remaining_demand": {
            f"{d_id}:{comm}": _round(qty)
            for (d_id, comm), qty in demand.items()
            if qty > 0.01
        },
        "unused_route_capacity": {
            d_id: _round(cap)
            for d_id, cap in route_capacity.items()
        },
        "planning_horizon_hours": horizon_hours,
        "assumptions": assumptions,
    }


def compare_plans(baseline: dict, optimized: dict) -> dict:
    """Computes transparent absolute and percentage comparisons between baseline and optimized plans."""
    b = baseline["metrics"]
    o = optimized["metrics"]

    def rel_change(old: float, new: float, lower_is_better: bool = False) -> float:
        if abs(old) < 1e-8:
            return 0.0
        diff = (old - new) if lower_is_better else (new - old)
        return _round((diff / abs(old)) * 100.0)

    spoilage_red_kg = _round(b["spoiled_kg"] - o["spoiled_kg"])
    spoilage_red_pct = rel_change(b["spoiled_kg"], o["spoiled_kg"], lower_is_better=True)

    delivered_change_kg = _round(o["delivered_kg"] - b["delivered_kg"])
    delivered_change_pct = rel_change(b["delivered_kg"], o["delivered_kg"])
    fulfillment_change_pp = _round(o["demand_fulfillment_percent"] - b["demand_fulfillment_percent"])

    net_revenue_change_amount = _round(o["net_revenue"] - b["net_revenue"])
    net_revenue_change_pct = rel_change(b["net_revenue"], o["net_revenue"])

    transport_cost_change_amount = _round(o["transport_cost"] - b["transport_cost"])
    transport_cost_change_pct = rel_change(b["transport_cost"], o["transport_cost"], lower_is_better=True)

    handling_cost_change_amount = _round(o["handling_cost"] - b["handling_cost"])
    handling_cost_change_pct = rel_change(b["handling_cost"], o["handling_cost"], lower_is_better=True)

    unmet_demand_red_kg = _round(b["unmet_demand_kg"] - o["unmet_demand_kg"])
    unused_capacity_red_kg = _round(b["unused_capacity_kg"] - o["unused_capacity_kg"])

    return {
        # Spoilage comparison
        "spoilage_reduction_kg": spoilage_red_kg,
        "spoilage_reduction_percent": spoilage_red_pct,

        # Demand fulfillment comparison
        "demand_fulfillment_change_kg": delivered_change_kg,
        "demand_fulfillment_change_percent": delivered_change_pct,
        "fulfillment_change_percentage_points": fulfillment_change_pp,
        "delivered_change_kg": delivered_change_kg,

        # Financial comparison
        "net_revenue_change_amount": net_revenue_change_amount,
        "net_revenue_change_percent": net_revenue_change_pct,

        # Cost components comparison
        "transport_cost_change_amount": transport_cost_change_amount,
        "transport_cost_change_percent": transport_cost_change_pct,
        "handling_cost_change_amount": handling_cost_change_amount,
        "handling_cost_change_percent": handling_cost_change_pct,

        # Resource efficiency
        "unmet_demand_reduction_kg": unmet_demand_red_kg,
        "unused_capacity_reduction_kg": unused_capacity_red_kg,
    }


def build_plan(
    inventory: list[dict],
    destinations: list[dict],
    transport: list[dict],
    horizon_hours: float = HORIZON_HOURS,
) -> dict:
    """Builds both baseline and optimized distribution plans and returns side-by-side comparison."""
    baseline = plan_distribution(inventory, destinations, transport, "baseline", horizon_hours)
    optimized = plan_distribution(inventory, destinations, transport, "optimized", horizon_hours)
    return {
        "baseline": baseline,
        "optimized": optimized,
        "improvement_summary": compare_plans(baseline, optimized),
        "quarantined_waste": optimized.get("quarantined_waste", []),
        "immediate_spoilage_kg": optimized.get("immediate_spoilage_kg", 0.0),
    }


def apply_disruption(
    destinations: list[dict],
    transport: list[dict],
    request: dict,
) -> tuple[list[dict], list[dict]]:
    """Applies realistic supply-chain disruptions to destination demand and transport corridors."""
    dests, routes = deepcopy(destinations), deepcopy(transport)
    demand_factor = max(0.0, 1.0 + float(request.get("demand_change_percent", 0.0)) / 100.0)
    capacity_factor = max(0.0, 1.0 + float(request.get("capacity_change_percent", 0.0)) / 100.0)
    delay = max(0.0, float(request.get("travel_delay_hours", 0.0)))

    for dest in dests:
        dest["demand_by_commodity"] = {
            k: _round(v * demand_factor)
            for k, v in dest.get("demand_by_commodity", {}).items()
        }
    for route in routes:
        route["travel_time_hours"] = _round(float(route["travel_time_hours"]) + delay)
        route["capacity_kg"] = _round(float(route["capacity_kg"]) * capacity_factor)

    return dests, routes


def explain_plan(plan: dict, question: str = "Explain the plan") -> dict:
    """Generates a clear, grounded explanation of allocations, constraints, and discount suggestions."""
    metrics = plan.get("metrics", {})
    allocations = plan.get("allocations", [])
    discounts = plan.get("discount_recommendations", [])
    quarantined = plan.get("quarantined_waste", [])
    strategy = plan.get("strategy", "optimized")

    if not allocations:
        summary = (
            "No feasible dispatches were found. Check remaining shelf life against transit times, "
            "delivery window deadlines, destination demand, and route capacities."
        )
    else:
        top = sorted(allocations, key=lambda a: a.get("quantity_kg", 0), reverse=True)[:3]
        examples = "; ".join(
            f"{a['quantity_kg']:g} kg of {a.get('commodity', 'produce')} to {a.get('destination_name', a.get('destination_id'))} (arrival {a['arrival_time_hours']:g}h)"
            for a in top
        )
        summary = (
            f"The {strategy} plan dispatches {metrics.get('delivered_kg', 0):g} kg across {len(allocations)} allocation(s). "
            f"Key allocations: {examples}. Modeled expired/spoiled stock is {metrics.get('spoiled_kg', 0):g} kg, "
            f"and net revenue is ₹{metrics.get('net_revenue', 0):,.2f} after transport (₹{metrics.get('transport_cost', 0):,.2f}) "
            f"and handling costs (₹{metrics.get('handling_cost', 0):,.2f}). Unmet demand is {metrics.get('unmet_demand_kg', 0):g} kg."
        )

    if quarantined:
        summary += (
            f" {len(quarantined)} batch(es) ({plan.get('immediate_spoilage_kg', 0):g} kg) were quarantined as immediate compost/waste "
            f"due to remaining shelf life being insufficient to clear warehouse handling."
        )

    if discounts:
        summary += (
            f" {len(discounts)} batch(es) have urgency-based discount recommendations because feasible normal channels "
            f"could not absorb perishable stock within the 24h horizon. Note: discount suggestions are recommendations "
            f"to avert spoilage, not realized revenue."
        )

    return {
        "answer": summary,
        "question": question,
        "source": "deterministic AgroNex planning engine",
        "mode": "built-in deterministic explanation",
        "disclaimer": "All metrics derive from verified network inputs and explicit operational constraints.",
    }
