from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class DisruptionRequest(BaseModel):
    demand_change_percent: float = Field(default=0, ge=-100, le=500)
    travel_delay_hours: float = Field(default=0, ge=0, le=168)
    capacity_change_percent: float = Field(default=0, ge=-100, le=500)
    solver_mode: str = Field(default="heuristic", description="Optimization solver mode: 'heuristic' or 'milp'")


class ExplainRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    plan: dict[str, Any] | None = None


class ScenarioSelectRequest(BaseModel):
    scenario_id: str = Field(min_length=1)
    solver_mode: str = Field(default="heuristic", description="Optimization solver mode: 'heuristic' or 'milp'")


class CsvUploadRequest(BaseModel):
    entity: Literal["inventory", "destinations", "transport"]
    csv_content: str = Field(min_length=5)


class DataRefreshRequest(BaseModel):
    simulate_failure: bool = Field(default=False)


class BatchInput(BaseModel):
    batch_id: str = Field(min_length=1)
    commodity: str = Field(min_length=1)
    quantity_kg: float = Field(gt=0)
    remaining_shelf_life_hours: float = Field(ge=0.0)
    selling_price_per_kg: float = Field(ge=0.0)
    origin_id: str = Field(default="CENTRAL")
    handling_time_hours: float = Field(default=0.0, ge=0.0)
    handling_cost_per_kg: float = Field(default=0.0, ge=0.0)
    unit_cost_per_kg: float | None = Field(default=None, ge=0.0, description="Farmer procurement or acquisition cost per kg")
    harvest_date: str | None = Field(default=None, description="ISO timestamp or date of harvest")
    spoilage_threshold: float | None = Field(default=0.0, ge=0.0, description="Minimum quality score or hours before total loss")


# Alias for compatibility
Batch = BatchInput


class PlanMetrics(BaseModel):
    initial_stock_kg: float
    stock_used_kg: float
    delivered_kg: float
    unallocated_kg: float
    expired_stock_kg: float
    spoiled_kg: float
    immediate_spoilage_kg: float = 0.0
    fresh_surplus_kg: float
    spoilage_rate_percent: float
    initial_demand_kg: float
    unmet_demand_kg: float
    demand_fulfillment_percent: float
    initial_capacity_kg: float
    unused_capacity_kg: float
    capacity_utilization_percent: float
    gross_revenue: float
    transport_cost: float
    handling_cost: float
    procurement_cost: float = 0.0
    spoilage_penalties: float = 0.0
    discount_cost: float = 0.0
    net_revenue: float
    net_profit: float = 0.0
    potential_discount_revenue: float = 0.0
    constraint_violations: int = 0


class DistributionPlanResponse(BaseModel):
    strategy: str
    strategy_description: str = ""
    allocations: list[dict[str, Any]] = Field(default_factory=list)
    unallocated_stock: dict[str, float] = Field(default_factory=dict)
    discount_recommendations: list[dict[str, Any]] = Field(default_factory=list)
    quarantined_waste: list[dict[str, Any]] = Field(default_factory=list)
    immediate_spoilage_kg: float = 0.0
    metrics: PlanMetrics | dict[str, Any] = Field(default_factory=dict)
    remaining_demand: dict[str, float] = Field(default_factory=dict)
    unused_route_capacity: dict[str, float] = Field(default_factory=dict)
    planning_horizon_hours: float = 24.0
    assumptions: list[str] = Field(default_factory=list)
    solver_used: str = "HEURISTIC"


class OptimizeRequest(BaseModel):
    inventory: list[dict[str, Any]] | None = None
    destinations: list[dict[str, Any]] | None = None
    transport: list[dict[str, Any]] | None = None
    solver_mode: str = Field(default="heuristic", description="Optimization solver mode: 'heuristic' or 'milp'")


