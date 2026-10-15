"""SQLAlchemy tables for operational data and saved planning results."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InventoryBatch(Base):
    __tablename__ = "inventory_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    commodity: Mapped[str] = mapped_column(String(120))
    quantity_kg: Mapped[float] = mapped_column(Float)
    remaining_shelf_life_hours: Mapped[float] = mapped_column(Float)
    selling_price_per_kg: Mapped[float] = mapped_column(Float)
    origin_id: Mapped[str] = mapped_column(String(64))
    handling_cost_per_kg: Mapped[float] = mapped_column(Float, default=0.0)
    handling_time_hours: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(32), default="seed")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def to_engine_dict(self) -> dict:
        return {"batch_id": self.batch_id, "commodity": self.commodity, "quantity_kg": self.quantity_kg,
                "remaining_shelf_life_hours": self.remaining_shelf_life_hours,
                "selling_price_per_kg": self.selling_price_per_kg, "origin_id": self.origin_id,
                "handling_cost_per_kg": self.handling_cost_per_kg, "handling_time_hours": self.handling_time_hours}


class Destination(Base):
    __tablename__ = "destinations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    destination_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    delivery_window_hours: Mapped[float] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(32), default="seed")
    demands: Mapped[list["DestinationDemand"]] = relationship(cascade="all, delete-orphan")
    prices: Mapped[list["DestinationPrice"]] = relationship(cascade="all, delete-orphan")

    def to_engine_dict(self) -> dict:
        return {"destination_id": self.destination_id, "name": self.name,
                "delivery_window_hours": self.delivery_window_hours,
                "demand_by_commodity": {row.commodity: row.demand_kg for row in self.demands},
                "price_by_commodity": {row.commodity: row.price_per_kg for row in self.prices}}


class DestinationDemand(Base):
    __tablename__ = "destination_demand"
    __table_args__ = (UniqueConstraint("destination_id", "commodity", name="uq_destination_demand"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.destination_id", ondelete="CASCADE"))
    commodity: Mapped[str] = mapped_column(String(120))
    demand_kg: Mapped[float] = mapped_column(Float)


class DestinationPrice(Base):
    __tablename__ = "destination_prices"
    __table_args__ = (UniqueConstraint("destination_id", "commodity", name="uq_destination_price"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.destination_id", ondelete="CASCADE"))
    commodity: Mapped[str] = mapped_column(String(120))
    price_per_kg: Mapped[float] = mapped_column(Float)


class TransportRoute(Base):
    __tablename__ = "transport_routes"
    __table_args__ = (UniqueConstraint("origin_id", "destination_id", name="uq_transport_route"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    origin_id: Mapped[str] = mapped_column(String(64))
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.destination_id", ondelete="CASCADE"))
    travel_time_hours: Mapped[float] = mapped_column(Float)
    transport_cost: Mapped[float] = mapped_column(Float)
    capacity_kg: Mapped[float] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(32), default="seed")

    def to_engine_dict(self) -> dict:
        return {"origin_id": self.origin_id, "destination_id": self.destination_id,
                "travel_time_hours": self.travel_time_hours, "transport_cost": self.transport_cost,
                "capacity_kg": self.capacity_kg}


class DistributionPlan(Base):
    __tablename__ = "distribution_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    strategy: Mapped[str] = mapped_column(String(24))
    metrics: Mapped[dict] = mapped_column(JSONB)
    improvement_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    full_result: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    allocations: Mapped[list["PlanAllocation"]] = relationship(cascade="all, delete-orphan")


class PlanAllocation(Base):
    __tablename__ = "plan_allocations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("distribution_plans.id", ondelete="CASCADE"))
    batch_id: Mapped[str] = mapped_column(String(64))
    commodity: Mapped[str] = mapped_column(String(120))
    destination_id: Mapped[str] = mapped_column(String(64))
    quantity_kg: Mapped[float] = mapped_column(Float)
    arrival_time_hours: Mapped[float] = mapped_column(Float)
    net_revenue: Mapped[float] = mapped_column(Float)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
