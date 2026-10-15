"""Comprehensive tests for AgroNex MVP & Real-Time Enhancements:
1. Input validation for prices, routes, capacities, shelf life, demand.
2. Baseline simplicity & optimized route-scarcity reservation.
3. Urgency-tiered discount engine (<6h: 30%, 6-12h: 20%, 12-24h: 10%).
4. Explicit reporting of stock used, unmet demand, unused capacity, spoilage, costs.
5. Realistic scenarios comparisons with absolute & percentage changes.
6. Real-time data layer with providers, CSV uploads, stale fallback on failure.
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.engine import plan_distribution, build_plan
from backend.validation import validate_planning_dataset, ValidationError
from backend.data_layer import data_manager
from backend.scenarios import list_scenarios, get_scenario

client = TestClient(app)


# ---------------------------------------------------------------------------
# Requirement 2: Planner & Input Validation Tests
# ---------------------------------------------------------------------------

def test_validation_rejects_missing_or_negative_shelf_life():
    inv = [{
        "batch_id": "B01", "commodity": "Tomatoes", "quantity_kg": 50,
        "remaining_shelf_life_hours": -2, "selling_price_per_kg": 30, "origin_id": "CENTRAL"
    }]
    dests = [{"destination_id": "D1", "name": "Hub 1", "delivery_window_hours": 12, "demand_by_commodity": {"Tomatoes": 50}, "price_by_commodity": {"Tomatoes": 35}}]
    trans = [{"origin_id": "CENTRAL", "destination_id": "D1", "travel_time_hours": 2, "transport_cost": 50, "capacity_kg": 100}]

    with pytest.raises(ValidationError) as exc:
        validate_planning_dataset(inv, dests, trans)
    assert "remaining shelf life" in str(exc.value)


def test_validation_rejects_missing_or_invalid_prices():
    inv = [{
        "batch_id": "B01", "commodity": "Tomatoes", "quantity_kg": 50,
        "remaining_shelf_life_hours": 10, "selling_price_per_kg": -10, "origin_id": "CENTRAL"
    }]
    dests = [{"destination_id": "D1", "name": "Hub 1", "delivery_window_hours": 12, "demand_by_commodity": {"Tomatoes": 50}, "price_by_commodity": {"Tomatoes": 35}}]
    trans = [{"origin_id": "CENTRAL", "destination_id": "D1", "travel_time_hours": 2, "transport_cost": 50, "capacity_kg": 100}]

    with pytest.raises(ValidationError) as exc:
        validate_planning_dataset(inv, dests, trans)
    assert "selling price" in str(exc.value)


def test_validation_rejects_invalid_routes_and_capacities():
    inv = [{
        "batch_id": "B01", "commodity": "Tomatoes", "quantity_kg": 50,
        "remaining_shelf_life_hours": 10, "selling_price_per_kg": 30, "origin_id": "CENTRAL"
    }]
    dests = [{"destination_id": "D1", "name": "Hub 1", "delivery_window_hours": 12, "demand_by_commodity": {"Tomatoes": 50}, "price_by_commodity": {"Tomatoes": 35}}]
    # Invalid negative travel time
    trans = [{"origin_id": "CENTRAL", "destination_id": "D1", "travel_time_hours": -1, "transport_cost": 50, "capacity_kg": 100}]

    with pytest.raises(ValidationError) as exc:
        validate_planning_dataset(inv, dests, trans)
    assert "travel time" in str(exc.value)

    # Route referencing unknown destination
    trans2 = [{"origin_id": "CENTRAL", "destination_id": "UNKNOWN_DEST", "travel_time_hours": 2, "transport_cost": 50, "capacity_kg": 100}]
    with pytest.raises(ValidationError) as exc:
        validate_planning_dataset(inv, dests, trans2)
    assert "unknown destination" in str(exc.value)


def test_validation_rejects_negative_demand():
    inv = [{
        "batch_id": "B01", "commodity": "Tomatoes", "quantity_kg": 50,
        "remaining_shelf_life_hours": 10, "selling_price_per_kg": 30, "origin_id": "CENTRAL"
    }]
    dests = [{"destination_id": "D1", "name": "Hub 1", "delivery_window_hours": 12, "demand_by_commodity": {"Tomatoes": -20}, "price_by_commodity": {"Tomatoes": 35}}]
    trans = [{"origin_id": "CENTRAL", "destination_id": "D1", "travel_time_hours": 2, "transport_cost": 50, "capacity_kg": 100}]

    with pytest.raises(ValidationError) as exc:
        validate_planning_dataset(inv, dests, trans)
    assert "demand" in str(exc.value)


def test_explicit_metric_reporting():
    dataset = data_manager.get_dataset()
    result = plan_distribution(dataset["inventory"], dataset["destinations"], dataset["transport"], "optimized")
    m = result["metrics"]

    # Explicitly reports stock used, unmet demand, unused capacity, expired/spoiled stock, and all cost components
    assert "stock_used_kg" in m
    assert "unmet_demand_kg" in m
    assert "unused_capacity_kg" in m
    assert "expired_stock_kg" in m
    assert "gross_revenue" in m
    assert "transport_cost" in m
    assert "handling_cost" in m
    assert "net_revenue" in m

    # Consistency checks
    assert m["stock_used_kg"] == m["delivered_kg"]
    assert m["expired_stock_kg"] == m["spoiled_kg"]
    assert m["initial_stock_kg"] == round(m["stock_used_kg"] + m["unallocated_kg"], 2)


def test_scarcity_reservation_protects_fragile_produce():
    """Batch A (spinach, 5h shelf life) can ONLY reach D1 (transit 2h, D2 is 7h transit).
    Batch B (carrots, 20h shelf life) can reach BOTH D1 and D2.
    D1 capacity is only 50kg.
    Optimized planner reserves scarce D1 for Batch A, rather than letting Batch B steal D1!
    """
    inventory = [
        # Batch B appears first in list
        {"batch_id": "B_DURABLE", "commodity": "Carrots", "quantity_kg": 50, "remaining_shelf_life_hours": 20, "selling_price_per_kg": 30, "origin_id": "CENTRAL"},
        {"batch_id": "B_FRAGILE", "commodity": "Spinach", "quantity_kg": 50, "remaining_shelf_life_hours": 5, "selling_price_per_kg": 40, "origin_id": "CENTRAL"},
    ]
    destinations = [
        {"destination_id": "D1", "name": "Near Hub", "delivery_window_hours": 15, "demand_by_commodity": {"Carrots": 50, "Spinach": 50}, "price_by_commodity": {"Carrots": 32, "Spinach": 45}},
        {"destination_id": "D2", "name": "Far Hub", "delivery_window_hours": 24, "demand_by_commodity": {"Carrots": 50, "Spinach": 50}, "price_by_commodity": {"Carrots": 33, "Spinach": 45}},
    ]
    transport = [
        {"origin_id": "CENTRAL", "destination_id": "D1", "travel_time_hours": 2, "transport_cost": 50, "capacity_kg": 50},
        {"origin_id": "CENTRAL", "destination_id": "D2", "travel_time_hours": 8, "transport_cost": 100, "capacity_kg": 50},
    ]

    opt_plan = plan_distribution(inventory, destinations, transport, "optimized")
    base_plan = plan_distribution(inventory, destinations, transport, "baseline")

    # In baseline (first-available / nearest), B_DURABLE grabs D1 because travel time is 2h,
    # leaving B_FRAGILE with only D2 (travel time 8h > 5h shelf life) -> B_FRAGILE spoils!
    base_spoiled = base_plan["metrics"]["spoiled_kg"]
    assert base_spoiled >= 50.0  # Spinach completely spoils in baseline

    # In optimized, B_FRAGILE gets D1 (its sole feasible corridor), and B_DURABLE goes to D2!
    opt_spoiled = opt_plan["metrics"]["spoiled_kg"]
    assert opt_spoiled == 0.0  # Spoilage completely prevented!


# ---------------------------------------------------------------------------
# Requirement 3: Urgency-Tiered Discount Engine Tests
# ---------------------------------------------------------------------------

def test_urgency_tiered_discount_rules():
    """Tests:
    - shelf life < 6h: 30% discount
    - 6-12h: 20% discount
    - 12-24h: 10% discount
    - > 24h: no discount
    - Only applied when normal allocation cannot sell the batch, with explicit reason.
    - Marked as recommendation, not confirmed sale.
    """
    inventory = [
        {"batch_id": "B_CRIT", "commodity": "ProduceA", "quantity_kg": 100, "remaining_shelf_life_hours": 4, "selling_price_per_kg": 100, "origin_id": "CENTRAL"},
        {"batch_id": "B_HIGH", "commodity": "ProduceB", "quantity_kg": 100, "remaining_shelf_life_hours": 9, "selling_price_per_kg": 100, "origin_id": "CENTRAL"},
        {"batch_id": "B_MOD", "commodity": "ProduceC", "quantity_kg": 100, "remaining_shelf_life_hours": 18, "selling_price_per_kg": 100, "origin_id": "CENTRAL"},
        {"batch_id": "B_FRESH", "commodity": "ProduceD", "quantity_kg": 100, "remaining_shelf_life_hours": 36, "selling_price_per_kg": 100, "origin_id": "CENTRAL"},
    ]
    # No destination demands these commodities -> none can be sold normally
    destinations = [
        {"destination_id": "D1", "name": "Hub 1", "delivery_window_hours": 24, "demand_by_commodity": {}, "price_by_commodity": {}},
    ]
    transport = [
        {"origin_id": "CENTRAL", "destination_id": "D1", "travel_time_hours": 2, "transport_cost": 50, "capacity_kg": 500},
    ]

    result = plan_distribution(inventory, destinations, transport, "optimized")
    recs = {r["batch_id"]: r for r in result["discount_recommendations"]}

    assert "B_CRIT" in recs
    assert recs["B_CRIT"]["discount_percent"] == 30.0
    assert recs["B_CRIT"]["suggested_price_per_kg"] == 70.0
    assert recs["B_CRIT"]["is_confirmed_sale"] is False
    assert recs["B_CRIT"]["status"] == "RECOMMENDED_NOT_REALIZED"
    assert "Urgent markdown" in recs["B_CRIT"]["reason"]

    assert "B_HIGH" in recs
    assert recs["B_HIGH"]["discount_percent"] == 20.0
    assert recs["B_HIGH"]["suggested_price_per_kg"] == 80.0

    assert "B_MOD" in recs
    assert recs["B_MOD"]["discount_percent"] == 10.0
    assert recs["B_MOD"]["suggested_price_per_kg"] == 90.0

    # Fresh batch (> 24h) does not get discount recommendation
    assert "B_FRESH" not in recs


# ---------------------------------------------------------------------------
# Requirement 4: Realistic Scenarios & Multi-Metric Comparisons
# ---------------------------------------------------------------------------

def test_realistic_scenarios_listing_and_execution():
    scenarios = list_scenarios()
    assert len(scenarios) >= 5
    ids = {s["id"] for s in scenarios}
    assert "corridor_bottleneck" in ids
    assert "highway_transit_delay" in ids
    assert "fleet_capacity_crunch" in ids

    # Test running a realistic scenario via endpoint
    r = client.post("/api/scenarios/run", json={"scenario_id": "corridor_bottleneck"})
    assert r.status_code == 200
    body = r.json()
    assert body["scenario_id"] == "corridor_bottleneck"
    assert "improvement_summary" in body
    summary = body["improvement_summary"]

    # Verify both absolute and percentage changes are reported
    assert "spoilage_reduction_kg" in summary
    assert "spoilage_reduction_percent" in summary
    assert "demand_fulfillment_change_kg" in summary
    assert "demand_fulfillment_change_percent" in summary
    assert "net_revenue_change_amount" in summary
    assert "net_revenue_change_percent" in summary
    assert "transport_cost_change_amount" in summary
    assert "handling_cost_change_amount" in summary


# ---------------------------------------------------------------------------
# Requirements 5 & 6: Real-Time Data Layer, Providers, CSV Upload, Stale Fallback
# ---------------------------------------------------------------------------

def test_data_status_and_timestamps():
    r = client.get("/api/data/status")
    assert r.status_code == 200
    data = r.json()
    assert "overall_status" in data
    assert "last_updated" in data
    assert "providers" in data
    assert "inventory" in data["providers"]
    assert "prices" in data["providers"]
    assert "routes" in data["providers"]


def test_csv_upload_and_template_download():
    # Test downloading CSV templates
    for entity in ("inventory", "destinations", "transport"):
        r = client.get(f"/api/data/template/{entity}")
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        assert len(r.text.strip().splitlines()) >= 2

    # Test uploading custom inventory CSV
    csv_sample = (
        "batch_id,commodity,quantity_kg,remaining_shelf_life_hours,selling_price_per_kg,origin_id,handling_cost_per_kg,handling_time_hours\n"
        "UP001,Organic Strawberries,120,8,120,CENTRAL,2,0.5\n"
        "UP002,Bell Peppers,95,30,65,CENTRAL,1,1\n"
    )
    r = client.post("/api/data/upload", json={"entity": "inventory", "csv_content": csv_sample})
    assert r.status_code == 200
    res = r.json()
    assert res["status"] == "success"
    assert res["data_source_status"]["providers"]["inventory"]["status"] == "uploaded"

    # Reset back to snapshot fallback
    reset_r = client.post("/api/data/reset")
    assert reset_r.status_code == 200


def test_stale_fallback_snapshot_on_failure():
    # Refresh routes with simulate_failure=True
    r = client.post("/api/data/refresh-routes", json={"simulate_failure": True})
    assert r.status_code == 200
    res = r.json()
    assert res["status"] == "stale"
    assert res["provider_status"]["fallback_active"] is True
    assert res["provider_status"]["status"] == "stale"
    # Ensure transport data is still valid snapshot data, not invented or empty
    assert len(res["transport"]) >= 2

    # Recover with normal refresh
    recover_r = client.post("/api/data/refresh-routes", json={"simulate_failure": False})
    assert recover_r.status_code == 200
    assert recover_r.json()["status"] == "refreshed"
