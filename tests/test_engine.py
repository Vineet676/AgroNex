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
