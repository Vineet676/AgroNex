"""Database-backed source of truth for planning inputs and saved results."""
from __future__ import annotations

from sqlalchemy import desc, select, text

from .database import Base, SessionLocal, database_configured, engine
from .db_models import (Destination, DestinationDemand, DestinationPrice, DistributionPlan,
                        InventoryBatch, PlanAllocation, TransportRoute)
from .validation import validate_planning_dataset


class DatabaseRepository:
    def status(self) -> dict:
        if not database_configured():
            return {"configured": False, "available": False,
                    "message": "Set DATABASE_URL to enable PostgreSQL storage."}
        try:
            assert engine is not None
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return {"configured": True, "available": True, "message": "PostgreSQL is connected."}
        except Exception as exc:
            return {"configured": True, "available": False, "message": f"PostgreSQL unavailable: {exc.__class__.__name__}"}

    def initialize_and_seed(self, dataset: dict) -> dict:
        if not database_configured():
            raise RuntimeError("PostgreSQL is not configured. Set DATABASE_URL and restart the API.")
        assert engine is not None
        Base.metadata.create_all(engine)
        self.replace_dataset(dataset, source="seed")
        return self.status()

    def load_dataset(self) -> dict | None:
        if not self.status()["available"] or SessionLocal is None:
            return None
        try:
            with SessionLocal() as session:
                inventory = session.scalars(select(InventoryBatch).where(InventoryBatch.is_active.is_(True))).all()
                destinations = session.scalars(select(Destination).where(Destination.is_active.is_(True))).unique().all()
                routes = session.scalars(select(TransportRoute).where(TransportRoute.is_active.is_(True))).all()
                if not inventory or not destinations or not routes:
                    return None
                return {"inventory": [item.to_engine_dict() for item in inventory],
                        "destinations": [item.to_engine_dict() for item in destinations],
                        "transport": [item.to_engine_dict() for item in routes]}
        except Exception:
            return None

    def replace_dataset(self, dataset: dict, source: str = "uploaded_csv") -> None:
        inventory, destinations, transport = validate_planning_dataset(
            dataset["inventory"], dataset["destinations"], dataset["transport"]
        )
        if SessionLocal is None:
            raise RuntimeError("PostgreSQL is not configured.")
        with SessionLocal.begin() as session:
            session.query(TransportRoute).delete()
            session.query(DestinationDemand).delete()
            session.query(DestinationPrice).delete()
            session.query(Destination).delete()
            session.query(InventoryBatch).delete()
            for item in inventory:
                session.add(InventoryBatch(**item, source=source))
            for item in destinations:
                session.add(Destination(destination_id=item["destination_id"], name=item["name"],
                                        delivery_window_hours=item["delivery_window_hours"], source=source))
                for commodity, quantity in item["demand_by_commodity"].items():
                    session.add(DestinationDemand(destination_id=item["destination_id"], commodity=commodity, demand_kg=quantity))
                for commodity, price in item["price_by_commodity"].items():
                    session.add(DestinationPrice(destination_id=item["destination_id"], commodity=commodity, price_per_kg=price))
            for item in transport:
                session.add(TransportRoute(**item, source=source))

    def save_plan(self, result: dict) -> list[int]:
        if not self.status()["available"] or SessionLocal is None:
            return []
        plan_ids: list[int] = []
        with SessionLocal.begin() as session:
            for strategy in ("baseline", "optimized"):
                plan = result[strategy]
                stored = DistributionPlan(strategy=strategy, metrics=plan["metrics"],
                                          improvement_summary=result.get("improvement_summary"), full_result=plan)
                session.add(stored)
                session.flush()
                for allocation in plan["allocations"]:
                    session.add(PlanAllocation(plan_id=stored.id, batch_id=allocation["batch_id"],
                                               commodity=allocation["commodity"], destination_id=allocation["destination_id"],
                                               quantity_kg=allocation["quantity_kg"], arrival_time_hours=allocation["arrival_time_hours"],
                                               net_revenue=allocation.get("net_revenue", allocation["expected_revenue"] - allocation["transport_cost"] - allocation["handling_cost"]),
                                               reason=allocation.get("reason")))
                plan_ids.append(stored.id)
        return plan_ids

    def recent_plans(self, limit: int = 20) -> list[dict]:
        if not self.status()["available"] or SessionLocal is None:
            return []
        with SessionLocal() as session:
            rows = session.scalars(select(DistributionPlan).order_by(desc(DistributionPlan.created_at)).limit(limit)).all()
            return [{"id": row.id, "strategy": row.strategy, "metrics": row.metrics,
                     "created_at": row.created_at.isoformat()} for row in rows]


database_repository = DatabaseRepository()
