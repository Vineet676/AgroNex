"""Realistic supply chain scenarios for AgroNex comparative evaluation.

Each scenario represents a real-world perishable logistics situation where
shelf-life awareness, route scarcity reservation, and net-margin optimization
provide transparent, measurable value over simple nearest-route baselines.
"""
from __future__ import annotations

from typing import Any


REALISTIC_SCENARIOS: dict[str, dict[str, Any]] = {
    "standard_operations": {
        "id": "standard_operations",
        "name": "Standard Operations (Balanced Network)",
        "tagline": "Routine daily distribution with mixed shelf-life commodities",
        "description": (
            "Baseline dispatch uses simple nearest-destination heuristic without economic optimization. "
            "AgroNex balances perishability and net unit margins across retail and wholesale clusters."
        ),
        "disruption": {
            "demand_change_percent": 0.0,
            "travel_delay_hours": 0.0,
            "capacity_change_percent": 0.0,
        },
        "assumptions": [
            "Normal traffic and travel times on all distribution corridors",
            "Nominal customer demand across all 4 destination hubs",
            "100% vehicle fleet availability with no capacity bottlenecks",
        ],
    },
    "corridor_bottleneck": {
        "id": "corridor_bottleneck",
        "name": "Corridor Bottleneck & Fragile Produce",
        "tagline": "Scarce transport capacity tests route reservation for high-perishability batches",
        "description": (
            "Transport capacity is constrained (-35%) on major corridors. "
            "The baseline heuristic allocates first-available bulk batches to nearest hubs, "
            "exhausting route capacity and causing short-life spinach to spoil. "
            "AgroNex reserves scarce feasible routes for the most perishable batches."
        ),
        "disruption": {
            "demand_change_percent": 0.0,
            "travel_delay_hours": 0.5,
            "capacity_change_percent": -35.0,
        },
        "assumptions": [
            "Truck availability reduced by 35% due to regional vehicle maintenance",
            "Minor 30-minute terminal loading delay",
            "Short-life batches must be protected from route starvation",
        ],
    },
    "highway_transit_delay": {
        "id": "highway_transit_delay",
        "name": "Severe Transit Delay (Highway Disruption)",
        "tagline": "Unplanned road delays test delivery window and shelf-life feasibility",
        "description": (
            "A major highway delay adds +3.0 hours to all delivery corridors. "
            "Under the baseline, several dispatches exceed destination delivery windows or spoil in transit. "
            "AgroNex dynamically re-routes batches to reachable destinations with open receiving windows."
        ),
        "disruption": {
            "demand_change_percent": -10.0,
            "travel_delay_hours": 3.0,
            "capacity_change_percent": -15.0,
        },
        "assumptions": [
            "Highway congestion or weather adds 3.0 hours transit delay across corridors",
            "Destination delivery windows are strictly enforced",
            "Arrivals after window closing or batch expiry are rejected at destination",
        ],
    },
    "fleet_capacity_crunch": {
        "id": "fleet_capacity_crunch",
        "name": "Fleet Capacity Crunch (-45% Capacity)",
        "tagline": "Severe vehicle shortage forces high-margin payload prioritization",
        "description": (
            "A fleet shortage reduces available vehicle payload by 45%. "
            "The baseline fills trucks with low-margin produce at the nearest hubs. "
            "AgroNex maximizes net profit per kg of scarce transport capacity while minimizing spoilage."
        ),
        "disruption": {
            "demand_change_percent": 0.0,
            "travel_delay_hours": 0.0,
            "capacity_change_percent": -45.0,
        },
        "assumptions": [
            "45% vehicle capacity reduction due to fleet availability constraints",
            "Every kilogram of truck capacity is an economically scarce resource",
            "Priority must balance high product perishability with maximum net realization",
        ],
    },
    "premium_demand_surge": {
        "id": "premium_demand_surge",
        "name": "Premium Cluster Demand Surge (+40% Demand)",
        "tagline": "High demand in premium clusters tests optimal inventory routing",
        "description": (
            "Destination demand spikes +40% across urban clusters. "
            "AgroNex reallocates stock across destinations to capture maximum net realization "
            "after transport and handling costs."
        ),
        "disruption": {
            "demand_change_percent": 40.0,
            "travel_delay_hours": 0.0,
            "capacity_change_percent": 0.0,
        },
        "assumptions": [
            "40% demand surge across premium retail and wholesale destinations",
            "Transport routes operate at normal transit speeds and full capacity",
            "Optimizer prioritizes fulfillment to maximize net captured revenue",
        ],
    },
}


def list_scenarios() -> list[dict[str, Any]]:
    return list(REALISTIC_SCENARIOS.values())


def get_scenario(scenario_id: str) -> dict[str, Any]:
    if scenario_id not in REALISTIC_SCENARIOS:
        raise KeyError(f"Unknown scenario ID '{scenario_id}'. Available: {list(REALISTIC_SCENARIOS.keys())}")
    return REALISTIC_SCENARIOS[scenario_id]
