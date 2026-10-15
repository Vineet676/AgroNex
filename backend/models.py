from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class DisruptionRequest(BaseModel):
    demand_change_percent: float = Field(default=0, ge=-100, le=500)
    travel_delay_hours: float = Field(default=0, ge=0, le=168)
    capacity_change_percent: float = Field(default=0, ge=-100, le=500)


class ExplainRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    plan: dict[str, Any] | None = None


class ScenarioSelectRequest(BaseModel):
    scenario_id: str = Field(min_length=1)


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


# Alias for compatibility
Batch = BatchInput


class DistributionPlanResponse(BaseModel):
    strategy: str
    strategy_description: str = ""
    allocations: list[dict[str, Any]] = Field(default_factory=list)
    unallocated_stock: dict[str, float] = Field(default_factory=dict)
    discount_recommendations: list[dict[str, Any]] = Field(default_factory=list)
    quarantined_waste: list[dict[str, Any]] = Field(default_factory=list)
    immediate_spoilage_kg: float = 0.0
    metrics: dict[str, Any] = Field(default_factory=dict)
    remaining_demand: dict[str, float] = Field(default_factory=dict)
    unused_route_capacity: dict[str, float] = Field(default_factory=dict)
    planning_horizon_hours: float = 24.0
    assumptions: list[str] = Field(default_factory=list)

