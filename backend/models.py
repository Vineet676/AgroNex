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
