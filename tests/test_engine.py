import json
from pathlib import Path

from backend.data_loader import load_dataset
from backend.engine import apply_disruption, build_plan, plan_distribution

ROOT = Path(__file__).resolve().parents[1]


def dataset():
    return load_dataset(ROOT / "backend" / "data")


def test_sample_dataset_loads_and_ids_unique():
    data = dataset()
    assert len(data["inventory"]) >= 5
    ids = [b["batch_id"] for b in data["inventory"]]
    assert len(ids) == len(set(ids))
    assert len(data["destinations"]) >= 2
    assert len(data["transport"]) >= 2


def test_plan_never_exceeds_batch_stock_demand_or_route_capacity():
    data = dataset()
    result = plan_distribution(**data, strategy="optimized")
    batch_used = {}
    dest_used = {}
    for a in result["allocations"]:
        batch_used[a["batch_id"]] = batch_used.get(a["batch_id"], 0) + a["quantity_kg"]
        dest_used[a["destination_id"]] = dest_used.get(a["destination_id"], 0) + a["quantity_kg"]
    stock = {b["batch_id"]: b["quantity_kg"] for b in data["inventory"]}
    caps = {r["destination_id"]: r["capacity_kg"] for r in data["transport"]}
    assert all(q <= stock[k] + 0.02 for k, q in batch_used.items())
    assert all(q <= caps[k] + 0.02 for k, q in dest_used.items())
    assert result["metrics"]["constraint_violations"] == 0


def test_all_allocations_arrive_before_expiry_and_delivery_window():
    data = dataset()
    batch_map = {b["batch_id"]: b for b in data["inventory"]}
    dest_map = {d["destination_id"]: d for d in data["destinations"]}
    result = plan_distribution(**data, strategy="optimized")
    for a in result["allocations"]:
        batch = batch_map[a["batch_id"]]
        dest = dest_map[a["destination_id"]]
        assert a["arrival_time_hours"] <= batch["remaining_shelf_life_hours"]
        assert a["arrival_time_hours"] <= dest["delivery_window_hours"]


def test_metrics_are_finite_and_accounting_is_consistent():
    data = dataset()
    result = build_plan(**data)
    for plan in (result["baseline"], result["optimized"]):
        m = plan["metrics"]
        assert m["initial_stock_kg"] >= m["delivered_kg"]
        assert m["spoiled_kg"] <= m["unallocated_kg"] + 0.02
        assert m["net_revenue"] == round(m["gross_revenue"] - m["transport_cost"] - m["handling_cost"], 2)
        assert 0 <= m["demand_fulfillment_percent"] <= 100
        assert 0 <= m["spoilage_rate_percent"] <= 100
    assert "net_revenue_change_amount" in result["improvement_summary"]


def test_disruption_never_creates_negative_capacity_or_demand():
    data = dataset()
    destinations, routes = apply_disruption(data["destinations"], data["transport"], {
        "demand_change_percent": -100, "travel_delay_hours": 3, "capacity_change_percent": -100
    })
    assert all(q >= 0 for d in destinations for q in d["demand_by_commodity"].values())
    assert all(r["capacity_kg"] >= 0 for r in routes)
    result = build_plan(data["inventory"], destinations, routes)
    assert result["optimized"]["allocations"] == []


def test_bad_strategy_is_rejected():
    data = dataset()
    try:
        plan_distribution(**data, strategy="magic")
    except ValueError as exc:
        assert "strategy" in str(exc)
    else:
        raise AssertionError("invalid strategy should raise ValueError")


def test_zero_shelf_life_quarantine():
    # Construct a test payload with 3 batches:
    # - Batch A: quantity_kg: 50, remaining_shelf_life_hours: 0.0, handling_time_hours: 1.0
    # - Batch B: quantity_kg: 30, remaining_shelf_life_hours: 0.5, handling_time_hours: 1.0
    # - Batch C: quantity_kg: 100, remaining_shelf_life_hours: 24.0, handling_time_hours: 1.0
    inventory = [
        {"batch_id": "BATCH_A", "commodity": "Tomatoes", "quantity_kg": 50, "remaining_shelf_life_hours": 0.0, "selling_price_per_kg": 30, "origin_id": "CENTRAL", "handling_time_hours": 1.0},
        {"batch_id": "BATCH_B", "commodity": "Spinach", "quantity_kg": 30, "remaining_shelf_life_hours": 0.5, "selling_price_per_kg": 25, "origin_id": "CENTRAL", "handling_time_hours": 1.0},
        {"batch_id": "BATCH_C", "commodity": "Mangoes", "quantity_kg": 100, "remaining_shelf_life_hours": 24.0, "selling_price_per_kg": 50, "origin_id": "CENTRAL", "handling_time_hours": 1.0},
    ]
    destinations = [
        {"destination_id": "D1", "name": "Hub 1", "delivery_window_hours": 24, "demand_by_commodity": {"Tomatoes": 50, "Spinach": 30, "Mangoes": 100}, "price_by_commodity": {"Tomatoes": 35, "Spinach": 30, "Mangoes": 60}},
    ]
    transport = [
        {"origin_id": "CENTRAL", "destination_id": "D1", "travel_time_hours": 2, "transport_cost": 100, "capacity_kg": 500},
    ]

    plan = plan_distribution(inventory, destinations, transport, strategy="optimized")

    # Assert: The plan executes without raising an exception.
    assert plan is not None
    # Assert: Batches A and B are present in plan["quarantined_waste"] with status IMMEDIATE_COMPOST_WASTE.
    quarantined = plan["quarantined_waste"]
    quarantined_ids = {q["batch_id"] for q in quarantined}
    assert "BATCH_A" in quarantined_ids
    assert "BATCH_B" in quarantined_ids
    assert "BATCH_C" not in quarantined_ids
    assert all(q["status"] == "IMMEDIATE_COMPOST_WASTE" for q in quarantined)
    # Assert: plan["immediate_spoilage_kg"] == 80.0.
    assert plan["immediate_spoilage_kg"] == 80.0
    # Assert: Only Batch C is evaluated for delivery allocation.
    allocated_batch_ids = {a["batch_id"] for a in plan["allocations"]}
    assert "BATCH_A" not in allocated_batch_ids
    assert "BATCH_B" not in allocated_batch_ids
    assert "BATCH_C" in allocated_batch_ids
    # Assert: Total metrics["spoiled_kg"] accounts for at least 80.0 kg.
    assert plan["metrics"]["spoiled_kg"] >= 80.0

