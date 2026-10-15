from __future__ import annotations

import json
from pathlib import Path
import pytest

from backend.engine import build_plan, plan_distribution
from backend.solver_milp import solve_distribution_milp


def load_dataset():
    data_dir = Path(__file__).resolve().parent.parent / "backend" / "data"
    with open(data_dir / "inventory.json", encoding="utf-8") as f:
        inventory = json.load(f)
    with open(data_dir / "destinations.json", encoding="utf-8") as f:
        destinations = json.load(f)
    with open(data_dir / "transport.json", encoding="utf-8") as f:
        transport = json.load(f)
    return {"inventory": inventory, "destinations": destinations, "transport": transport}


def test_milp_solver_initializes_and_solves_optimally():
    data = load_dataset()
    res = build_plan(**data, solver_mode="milp")

    assert res["solver_mode"] == "milp"
    assert res["solver_used"] == "MILP_PULP"
    opt = res["optimized"]
    assert opt["solver_used"] == "MILP_PULP"
    assert opt["metrics"]["constraint_violations"] == 0
    assert opt["metrics"]["delivered_kg"] > 0
    assert opt["metrics"]["net_profit"] is not None


def test_milp_matches_or_exceeds_heuristic_profit():
    data = load_dataset()
    plan_heuristic = build_plan(**data, solver_mode="heuristic")
    plan_milp = build_plan(**data, solver_mode="milp")

    h_profit = plan_heuristic["optimized"]["metrics"]["net_profit"]
    m_profit = plan_milp["optimized"]["metrics"]["net_profit"]

    # MILP exact global solver must be >= heuristic profit (allow floating point precision margin)
    assert m_profit >= h_profit - 0.5, f"MILP profit ({m_profit}) should be >= Heuristic profit ({h_profit})"


def test_milp_strictly_obeys_all_physical_constraints():
    data = load_dataset()
    plan = build_plan(**data, solver_mode="milp")["optimized"]

    batch_map = {b["batch_id"]: b for b in data["inventory"]}
    dest_map = {d["destination_id"]: d for d in data["destinations"]}
    route_map = {(r["origin_id"], r["destination_id"]): r for r in data["transport"]}

    dispatched_by_batch = {}
    dispatched_by_dest_comm = {}
    dispatched_by_route = {}

    for a in plan["allocations"]:
        b = batch_map[a["batch_id"]]
        d = dest_map[a["destination_id"]]
        r = route_map[(b["origin_id"], d["destination_id"])]

        # Physical feasibility: arrival <= shelf life and delivery window
        arrival = a["arrival_time_hours"]
        assert arrival <= b["remaining_shelf_life_hours"] + 1e-6
        assert arrival <= d["delivery_window_hours"] + 1e-6

        # Accumulate
        b_id = a["batch_id"]
        dispatched_by_batch[b_id] = dispatched_by_batch.get(b_id, 0.0) + a["quantity_kg"]

        dest_comm = (a["destination_id"], a["commodity"])
        dispatched_by_dest_comm[dest_comm] = dispatched_by_dest_comm.get(dest_comm, 0.0) + a["quantity_kg"]

        route_key = (b["origin_id"], a["destination_id"])
        dispatched_by_route[route_key] = dispatched_by_route.get(route_key, 0.0) + a["quantity_kg"]

    # 1. Stock conservation
    for b_id, disp in dispatched_by_batch.items():
        assert disp <= batch_map[b_id]["quantity_kg"] + 1e-4

    # 2. Demand conservation
    for (d_id, comm), disp in dispatched_by_dest_comm.items():
        dem = dest_map[d_id]["demand_by_commodity"].get(comm, 0.0)
        assert disp <= dem + 1e-4

    # 3. Route capacity conservation
    for (orig, dest_id), disp in dispatched_by_route.items():
        cap = route_map[(orig, dest_id)]["capacity_kg"]
        assert disp <= cap + 1e-4


def test_milp_deterministic_fallback_when_milp_fails(monkeypatch):
    data = load_dataset()
    import backend.engine as eng

    # Simulate MILP returning None (e.g. CBC timeout or infeasible)
    monkeypatch.setattr(eng, "solve_distribution_milp", lambda *args, **kwargs: None)

    plan = eng.plan_distribution(**data, strategy="optimized", solver_mode="milp")
    assert plan["solver_used"] == "HEURISTIC_FALLBACK"
    assert len(plan["allocations"]) > 0
