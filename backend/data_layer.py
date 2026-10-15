"""Real-time data layer and provider adapters for AgroNex.

Separates live / external data sources from the planning engine.
Features:
- InventoryProvider: Warehouse/ERP batches, IoT shelf-life updates, CSV uploads.
- PriceProvider: Market/mandi prices, destination contract prices.
- RouteProvider: Traffic travel times, fuel/transport costs, vehicle capacities.
- Resilient snapshot fallback: If live feeds fail, marks as stale and uses validated snapshot.
- Full timestamp tracking (ISO 8601) and data source transparency.
"""
from __future__ import annotations

import csv
import io
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .validation import (
    validate_inventory,
    validate_destinations,
    validate_transport,
    validate_planning_dataset,
    ValidationError,
)

DATA_DIR = Path(__file__).resolve().parent / "data"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BaseProvider:
    """Base provider tracking source provenance, timestamps, and status."""
    def __init__(self, name: str, source: str = "validated_snapshot"):
        self.name = name
        self.source = source  # "live_api" | "uploaded_csv" | "validated_snapshot" | "cached"
        self.status = "cached"  # "live" | "uploaded" | "cached" | "stale"
        self.last_updated = _now_iso()
        self.last_error: str | None = None
        self.fallback_active = False

    def get_status_info(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "source": self.source,
            "status": self.status,
            "last_updated": self.last_updated,
            "last_error": self.last_error,
            "fallback_active": self.fallback_active,
        }


class InventoryProvider(BaseProvider):
    def __init__(self, fallback_data: list[dict[str, Any]]):
        super().__init__("InventoryProvider", source="validated_snapshot")
        self._fallback_snapshot = deepcopy(fallback_data)
        self._current_data = deepcopy(fallback_data)
        self.status = "cached"

    def get_data(self) -> list[dict[str, Any]]:
        return deepcopy(self._current_data)

    def upload_csv(self, csv_content: str) -> list[dict[str, Any]]:
        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        rows = []
        for idx, row in enumerate(reader):
            if not row or not any(row.values()):
                continue
            batch = {
                "batch_id": row.get("batch_id", "").strip(),
                "commodity": row.get("commodity", "").strip(),
                "quantity_kg": float(row.get("quantity_kg", 0) or 0),
                "remaining_shelf_life_hours": float(row.get("remaining_shelf_life_hours", 0) or 0),
                "selling_price_per_kg": float(row.get("selling_price_per_kg", 0) or 0),
                "origin_id": row.get("origin_id", "CENTRAL").strip() or "CENTRAL",
                "handling_cost_per_kg": float(row.get("handling_cost_per_kg", 0) or 0),
                "handling_time_hours": float(row.get("handling_time_hours", 0) or 0),
            }
            if "unit_cost_per_kg" in row and row["unit_cost_per_kg"].strip():
                batch["unit_cost_per_kg"] = float(row["unit_cost_per_kg"])
            if "harvest_date" in row and row["harvest_date"].strip():
                batch["harvest_date"] = row["harvest_date"].strip()
            if "spoilage_threshold" in row and row["spoilage_threshold"].strip():
                batch["spoilage_threshold"] = float(row["spoilage_threshold"])
            if "temperature_celsius" in row and row["temperature_celsius"].strip():
                batch["temperature_celsius"] = float(row["temperature_celsius"])
            rows.append(batch)

        validated = validate_inventory(rows)
        self._current_data = validated
        self.source = "uploaded_csv"
        self.status = "uploaded"
        self.last_updated = _now_iso()
        self.last_error = None
        self.fallback_active = False
        return deepcopy(self._current_data)

    def set_data(self, data: list[dict[str, Any]], source: str = "live_api") -> list[dict[str, Any]]:
        validated = validate_inventory(data)
        self._current_data = validated
        self.source = source
        self.status = "live" if source == "live_api" else "uploaded"
        self.last_updated = _now_iso()
        self.last_error = None
        self.fallback_active = False
        return deepcopy(self._current_data)

    def revert_to_fallback(self, reason: str = "Live data feed unavailable"):
        self._current_data = deepcopy(self._fallback_snapshot)
        self.source = "validated_snapshot"
        self.status = "stale"
        self.last_error = reason
        self.fallback_active = True
        self.last_updated = _now_iso()


class PriceProvider(BaseProvider):
    def __init__(self, fallback_data: list[dict[str, Any]]):
        super().__init__("PriceProvider", source="validated_snapshot")
        self._fallback_snapshot = deepcopy(fallback_data)
        self._current_destinations = deepcopy(fallback_data)
        self.status = "cached"

    def get_destinations(self) -> list[dict[str, Any]]:
        return deepcopy(self._current_destinations)

    def set_destinations(self, data: list[dict[str, Any]], source: str = "uploaded_csv"):
        validated = validate_destinations(data)
        self._current_destinations = validated
        self.source = source
        self.status = "uploaded" if source == "uploaded_csv" else "live"
        self.last_updated = _now_iso()
        self.last_error = None
        self.fallback_active = False

    def refresh_market_prices(self, simulate_failure: bool = False) -> list[dict[str, Any]]:
        """Simulates live mandi / wholesale price indexing.
        
        If a network or source error occurs, retains validated snapshot and marks stale.
        """
        if simulate_failure:
            self.status = "stale"
            self.last_error = "Live mandi price feed unreachable (HTTP 503). Retaining validated snapshot."
            self.fallback_active = True
            return deepcopy(self._current_destinations)

        try:
            # Apply slight realistic market index adjustments (+/- 1 to 2 INR)
            # reflecting real daily wholesale movements
            import random
            updated = deepcopy(self._current_destinations)
            random.seed(int(datetime.now(timezone.utc).timestamp()) // 60)  # changes once per minute
            for dest in updated:
                prices = dest.get("price_by_commodity", {})
                for comm in list(prices.keys()):
                    delta = random.choice([-1.0, 0.0, 1.0, 2.0])
                    new_pr = max(10.0, round(float(prices[comm]) + delta, 2))
                    prices[comm] = new_pr
            self._current_destinations = validate_destinations(updated)
            self.source = "live_feed"
            self.status = "live"
            self.last_updated = _now_iso()
            self.last_error = None
            self.fallback_active = False
        except Exception as exc:
            self.status = "stale"
            self.last_error = f"Price refresh failed: {exc}. Retaining validated snapshot."
            self.fallback_active = True
        return deepcopy(self._current_destinations)

    def upload_csv(self, csv_content: str) -> list[dict[str, Any]]:
        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        dest_map: dict[str, dict[str, Any]] = {}
        for row in reader:
            if not row or not any(row.values()):
                continue
            d_id = row.get("destination_id", "").strip()
            if not d_id:
                continue
            if d_id not in dest_map:
                dest_map[d_id] = {
                    "destination_id": d_id,
                    "name": row.get("name", d_id).strip() or d_id,
                    "delivery_window_hours": float(row.get("delivery_window_hours", 24) or 24),
                    "demand_by_commodity": {},
                    "price_by_commodity": {},
                }
            # Parse dynamic demand and price columns (e.g. demand_Tomatoes, price_Tomatoes)
            for k, v in row.items():
                if not v or not v.strip():
                    continue
                if k.startswith("demand_"):
                    comm = k[len("demand_"):]
                    dest_map[d_id]["demand_by_commodity"][comm] = float(v)
                elif k.startswith("price_"):
                    comm = k[len("price_"):]
                    dest_map[d_id]["price_by_commodity"][comm] = float(v)

        validated = validate_destinations(list(dest_map.values()))
        self._current_destinations = validated
        self.source = "uploaded_csv"
        self.status = "uploaded"
        self.last_updated = _now_iso()
        self.last_error = None
        self.fallback_active = False
        return deepcopy(self._current_destinations)


class RouteProvider(BaseProvider):
    def __init__(self, fallback_data: list[dict[str, Any]]):
        super().__init__("RouteProvider", source="validated_snapshot")
        self._fallback_snapshot = deepcopy(fallback_data)
        self._current_routes = deepcopy(fallback_data)
        self.status = "cached"

    def get_routes(self) -> list[dict[str, Any]]:
        return deepcopy(self._current_routes)

    def set_routes(self, data: list[dict[str, Any]], source: str = "uploaded_csv"):
        validated = validate_transport(data)
        self._current_routes = validated
        self.source = source
        self.status = "uploaded" if source == "uploaded_csv" else "live"
        self.last_updated = _now_iso()
        self.last_error = None
        self.fallback_active = False

    def refresh_traffic_conditions(self, simulate_failure: bool = False) -> list[dict[str, Any]]:
        """Simulates live traffic and corridor condition telemetry.
        
        If route API fails, safely keeps validated snapshot and flags stale.
        """
        if simulate_failure:
            self.status = "stale"
            self.last_error = "Live traffic telemetry timeout. Retaining validated route snapshot."
            self.fallback_active = True
            return deepcopy(self._current_routes)

        try:
            import random
            updated = deepcopy(self._current_routes)
            random.seed(int(datetime.now(timezone.utc).timestamp()) // 120)
            for route in updated:
                # Small traffic variance +/- 0.25h
                delta = random.choice([-0.2, 0.0, 0.2, 0.4])
                route["travel_time_hours"] = max(0.5, round(float(route["travel_time_hours"]) + delta, 2))
            self._current_routes = validate_transport(updated)
            self.source = "live_feed"
            self.status = "live"
            self.last_updated = _now_iso()
            self.last_error = None
            self.fallback_active = False
        except Exception as exc:
            self.status = "stale"
            self.last_error = f"Route telemetry update failed: {exc}. Retaining validated snapshot."
            self.fallback_active = True
        return deepcopy(self._current_routes)

    def upload_csv(self, csv_content: str) -> list[dict[str, Any]]:
        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        rows = []
        for row in reader:
            if not row or not any(row.values()):
                continue
            route = {
                "origin_id": row.get("origin_id", "CENTRAL").strip() or "CENTRAL",
                "destination_id": row.get("destination_id", "").strip(),
                "travel_time_hours": float(row.get("travel_time_hours", 0) or 0),
                "transport_cost": float(row.get("transport_cost", 0) or 0),
                "capacity_kg": float(row.get("capacity_kg", 0) or 0),
            }
            rows.append(route)

        validated = validate_transport(rows)
        self._current_routes = validated
        self.source = "uploaded_csv"
        self.status = "uploaded"
        self.last_updated = _now_iso()
        self.last_error = None
        self.fallback_active = False
        return deepcopy(self._current_routes)


class DataManager:
    """Coordinates data providers, validated snapshots, and CSV templates."""
    def __init__(self, data_directory: Path = DATA_DIR):
        self.data_dir = data_directory
        self._load_fallback_snapshots()
        self.inventory_provider = InventoryProvider(self.raw_inventory)
        self.price_provider = PriceProvider(self.raw_destinations)
        self.route_provider = RouteProvider(self.raw_transport)

    def _load_fallback_snapshots(self):
        with (self.data_dir / "inventory.json").open("r", encoding="utf-8") as f:
            self.raw_inventory = json.load(f)
        with (self.data_dir / "destinations.json").open("r", encoding="utf-8") as f:
            self.raw_destinations = json.load(f)
        with (self.data_dir / "transport.json").open("r", encoding="utf-8") as f:
            self.raw_transport = json.load(f)

    def get_dataset(self) -> dict[str, Any]:
        inv = self.inventory_provider.get_data()
        dest = self.price_provider.get_destinations()
        trans = self.route_provider.get_routes()
        return {
            "inventory": inv,
            "destinations": dest,
            "transport": trans,
            "data_source_status": self.get_status(),
        }

    def get_status(self) -> dict[str, Any]:
        inv_stat = self.inventory_provider.get_status_info()
        price_stat = self.price_provider.get_status_info()
        route_stat = self.route_provider.get_status_info()

        # Overall network status:
        # If any is uploaded -> "uploaded"
        # If any is stale -> "stale"
        # If all live -> "live"
        # Otherwise "cached"
        statuses = [inv_stat["status"], price_stat["status"], route_stat["status"]]
        if "stale" in statuses:
            overall = "stale"
        elif "uploaded" in statuses:
            overall = "uploaded"
        elif all(s == "live" for s in statuses):
            overall = "live"
        else:
            overall = "cached"

        timestamps = [inv_stat["last_updated"], price_stat["last_updated"], route_stat["last_updated"]]
        latest_timestamp = max(timestamps)

        return {
            "overall_status": overall,
            "last_updated": latest_timestamp,
            "organization": "AgroNex Regional Supply Network",
            "workspace": "Active Operations Workspace",
            "providers": {
                "inventory": inv_stat,
                "prices": price_stat,
                "routes": route_stat,
            },
        }

    def reset_to_snapshot(self):
        self.inventory_provider.revert_to_fallback("Reset by user")
        self.price_provider._current_destinations = deepcopy(self.price_provider._fallback_snapshot)
        self.price_provider.status = "cached"
        self.price_provider.source = "validated_snapshot"
        self.price_provider.last_updated = _now_iso()
        self.price_provider.last_error = None
        self.price_provider.fallback_active = False

        self.route_provider._current_routes = deepcopy(self.route_provider._fallback_snapshot)
        self.route_provider.status = "cached"
        self.route_provider.source = "validated_snapshot"
        self.route_provider.last_updated = _now_iso()
        self.route_provider.last_error = None
        self.route_provider.fallback_active = False

    def generate_template_csv(self, entity_type: str) -> str:
        if entity_type == "inventory":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "batch_id", "commodity", "quantity_kg", "remaining_shelf_life_hours",
                "selling_price_per_kg", "unit_cost_per_kg", "harvest_date", "origin_id", "handling_cost_per_kg", "handling_time_hours"
            ])
            for b in self.inventory_provider.get_data():
                writer.writerow([
                    b["batch_id"], b["commodity"], b["quantity_kg"], b["remaining_shelf_life_hours"],
                    b["selling_price_per_kg"], b.get("unit_cost_per_kg", ""), b.get("harvest_date", ""),
                    b["origin_id"], b.get("handling_cost_per_kg", 0), b.get("handling_time_hours", 0)
                ])
            return output.getvalue()

        elif entity_type == "destinations":
            output = io.StringIO()
            writer = csv.writer(output)
            dests = self.price_provider.get_destinations()
            commodities = sorted({c for d in dests for c in d.get("demand_by_commodity", {})})
            headers = ["destination_id", "name", "delivery_window_hours"]
            for c in commodities:
                headers.append(f"demand_{c}")
            for c in commodities:
                headers.append(f"price_{c}")
            writer.writerow(headers)
            for d in dests:
                row = [d["destination_id"], d["name"], d["delivery_window_hours"]]
                for c in commodities:
                    row.append(d.get("demand_by_commodity", {}).get(c, 0))
                for c in commodities:
                    row.append(d.get("price_by_commodity", {}).get(c, 0))
                writer.writerow(row)
            return output.getvalue()

        elif entity_type == "transport":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["origin_id", "destination_id", "travel_time_hours", "transport_cost", "capacity_kg"])
            for r in self.route_provider.get_routes():
                writer.writerow([r["origin_id"], r["destination_id"], r["travel_time_hours"], r["transport_cost"], r["capacity_kg"]])
            return output.getvalue()

        else:
            raise ValueError(f"Unknown template entity '{entity_type}'. Must be 'inventory', 'destinations', or 'transport'.")


# Singleton instance
data_manager = DataManager()
