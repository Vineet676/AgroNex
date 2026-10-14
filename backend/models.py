from pydantic import BaseModel, Field


class DisruptionRequest(BaseModel):
    demand_change_percent: float = Field(default=0, ge=-100, le=500)
    travel_delay_hours: float = Field(default=0, ge=0, le=168)
    capacity_change_percent: float = Field(default=0, ge=-100, le=500)


class ExplainRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    plan: dict | None = None
