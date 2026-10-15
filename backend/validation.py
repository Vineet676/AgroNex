"""Input validation module for AgroNex perishable produce distribution planner."""
from __future__ import annotations

from typing import Any


class ValidationError(ValueError):
    """Raised when planner input data fails validation."""
    def __init__(self, message: str, field: str | None = None, entity_id: str | None = None):
        super().__init__(message)
        self.message = message
        self.field = field
        self.entity_id = entity_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": self.message,
            "field": self.field,
            "entity_id": self.entity_id,
        }


def validate_inventory(inventory: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(inventory, list):
        raise ValidationError("Inventory must be a list of batch objects.", field="inventory")
    if len(inventory) == 0:
        raise ValidationError("Inventory cannot be empty. At least one batch is required.", field="inventory")

    seen_batch_ids: set[str] = set()
    validated_inventory: list[dict[str, Any]] = []

    for idx, batch in enumerate(inventory):
        if not isinstance(batch, dict):
            raise ValidationError(f"Batch at index {idx} must be a dictionary object.", field="inventory")

        batch_id = str(batch.get("batch_id", "")).strip()
        if not batch_id:
            raise ValidationError(f"Batch at index {idx} has missing or empty 'batch_id'.", field="batch_id")
        if batch_id in seen_batch_ids:
            raise ValidationError(f"Duplicate batch ID '{batch_id}' found in inventory.", field="batch_id", entity_id=batch_id)
        seen_batch_ids.add(batch_id)

        commodity = str(batch.get("commodity", "")).strip()
        if not commodity:
            raise ValidationError(f"Batch '{batch_id}' has missing or empty commodity name.", field="commodity", entity_id=batch_id)

        # Quantity validation
        try:
            qty = float(batch.get("quantity_kg", 0))
            if qty <= 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Batch '{batch_id}' has invalid quantity '{batch.get('quantity_kg')}': must be a positive number (> 0).",
                field="quantity_kg",
                entity_id=batch_id
            ) from exc

        # Shelf life validation
        try:
            shelf_life = float(batch.get("remaining_shelf_life_hours", 0))
            if shelf_life < 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Batch '{batch_id}' has invalid remaining shelf life '{batch.get('remaining_shelf_life_hours')}': Remaining shelf life must be non-negative (>= 0.0 hours).",
                field="remaining_shelf_life_hours",
                entity_id=batch_id
            ) from exc

        # Origin ID validation
        origin_id = str(batch.get("origin_id", "")).strip()
        if not origin_id:
            raise ValidationError(f"Batch '{batch_id}' has missing or empty 'origin_id'.", field="origin_id", entity_id=batch_id)

        # Selling price validation
        if "selling_price_per_kg" not in batch:
            raise ValidationError(f"Batch '{batch_id}' is missing required field 'selling_price_per_kg'.", field="selling_price_per_kg", entity_id=batch_id)
        try:
            price = float(batch.get("selling_price_per_kg", 0))
            if price < 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Batch '{batch_id}' has invalid selling price '{batch.get('selling_price_per_kg')}': must be non-negative (>= 0).",
                field="selling_price_per_kg",
                entity_id=batch_id
            ) from exc

        # Handling cost validation (optional, default 0)
        try:
            handling_cost = float(batch.get("handling_cost_per_kg", 0.0))
            if handling_cost < 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Batch '{batch_id}' has invalid handling cost '{batch.get('handling_cost_per_kg')}': must be non-negative (>= 0).",
                field="handling_cost_per_kg",
                entity_id=batch_id
            ) from exc

        # Handling time validation (optional, default 0)
        try:
            handling_time = float(batch.get("handling_time_hours", 0.0))
            if handling_time < 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Batch '{batch_id}' has invalid handling time '{batch.get('handling_time_hours')}': must be non-negative (>= 0).",
                field="handling_time_hours",
                entity_id=batch_id
            ) from exc

        item = dict(batch)
        item["batch_id"] = batch_id
        item["commodity"] = commodity
        item["quantity_kg"] = round(qty, 2)
        item["remaining_shelf_life_hours"] = round(shelf_life, 2)
        item["origin_id"] = origin_id
        item["selling_price_per_kg"] = round(price, 2)
        item["handling_cost_per_kg"] = round(handling_cost, 2)
        item["handling_time_hours"] = round(handling_time, 2)

        # Optional unit cost (COGS) validation
        if "unit_cost_per_kg" in batch and batch["unit_cost_per_kg"] is not None:
            try:
                unit_cost = float(batch["unit_cost_per_kg"])
                if unit_cost < 0:
                    raise ValueError()
                item["unit_cost_per_kg"] = round(unit_cost, 2)
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    f"Batch '{batch_id}' has invalid unit cost '{batch.get('unit_cost_per_kg')}': must be non-negative (>= 0).",
                    field="unit_cost_per_kg",
                    entity_id=batch_id,
                ) from exc

        # Optional spoilage threshold validation
        if "spoilage_threshold" in batch and batch["spoilage_threshold"] is not None:
            try:
                thresh = float(batch["spoilage_threshold"])
                if thresh < 0:
                    raise ValueError()
                item["spoilage_threshold"] = round(thresh, 2)
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    f"Batch '{batch_id}' has invalid spoilage threshold '{batch.get('spoilage_threshold')}': must be non-negative (>= 0).",
                    field="spoilage_threshold",
                    entity_id=batch_id,
                ) from exc

        # Optional harvest date string
        if "harvest_date" in batch and batch["harvest_date"] is not None:
            item["harvest_date"] = str(batch["harvest_date"]).strip()

        validated_inventory.append(item)

    return validated_inventory


def validate_destinations(destinations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(destinations, list):
        raise ValidationError("Destinations must be a list of destination objects.", field="destinations")
    if len(destinations) == 0:
        raise ValidationError("Destinations cannot be empty. At least one destination is required.", field="destinations")

    seen_dest_ids: set[str] = set()
    validated_destinations: list[dict[str, Any]] = []

    for idx, dest in enumerate(destinations):
        if not isinstance(dest, dict):
            raise ValidationError(f"Destination at index {idx} must be a dictionary object.", field="destinations")

        dest_id = str(dest.get("destination_id", "")).strip()
        if not dest_id:
            raise ValidationError(f"Destination at index {idx} has missing or empty 'destination_id'.", field="destination_id")
        if dest_id in seen_dest_ids:
            raise ValidationError(f"Duplicate destination ID '{dest_id}' found in destinations.", field="destination_id", entity_id=dest_id)
        seen_dest_ids.add(dest_id)

        name = str(dest.get("name", dest_id)).strip()

        # Delivery window validation
        try:
            window = float(dest.get("delivery_window_hours", 0))
            if window <= 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Destination '{dest_id}' has invalid delivery window '{dest.get('delivery_window_hours')}': must be a positive number (> 0).",
                field="delivery_window_hours",
                entity_id=dest_id
            ) from exc

        # Demand validation
        demand_raw = dest.get("demand_by_commodity", {})
        if not isinstance(demand_raw, dict):
            raise ValidationError(f"Destination '{dest_id}' has invalid 'demand_by_commodity': must be an object/dict.", field="demand_by_commodity", entity_id=dest_id)

        validated_demand: dict[str, float] = {}
        for commodity, qty in demand_raw.items():
            comm_name = str(commodity).strip()
            try:
                demand_val = float(qty)
                if demand_val < 0:
                    raise ValueError()
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    f"Destination '{dest_id}' has invalid demand for '{comm_name}': '{qty}' must be non-negative (>= 0).",
                    field="demand_by_commodity",
                    entity_id=dest_id
                ) from exc
            validated_demand[comm_name] = round(demand_val, 2)

        # Price validation
        price_raw = dest.get("price_by_commodity", {})
        if not isinstance(price_raw, dict):
            raise ValidationError(f"Destination '{dest_id}' has invalid 'price_by_commodity': must be an object/dict.", field="price_by_commodity", entity_id=dest_id)

        validated_prices: dict[str, float] = {}
        for commodity, pr in price_raw.items():
            comm_name = str(commodity).strip()
            try:
                price_val = float(pr)
                if price_val <= 0:
                    raise ValueError()
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    f"Destination '{dest_id}' has invalid price for '{comm_name}': '{pr}' must be a positive number (> 0).",
                    field="price_by_commodity",
                    entity_id=dest_id
                ) from exc
            validated_prices[comm_name] = round(price_val, 2)

        item = dict(dest)
        item["destination_id"] = dest_id
        item["name"] = name
        item["delivery_window_hours"] = round(window, 2)
        item["demand_by_commodity"] = validated_demand
        item["price_by_commodity"] = validated_prices
        validated_destinations.append(item)

    return validated_destinations


def validate_transport(transport: list[dict[str, Any]], valid_dest_ids: set[str] | None = None) -> list[dict[str, Any]]:
    if not isinstance(transport, list):
        raise ValidationError("Transport routes must be a list of route objects.", field="transport")
    if len(transport) == 0:
        raise ValidationError("Transport routes cannot be empty. At least one route is required.", field="transport")

    seen_pairs: set[tuple[str, str]] = set()
    validated_transport: list[dict[str, Any]] = []

    for idx, route in enumerate(transport):
        if not isinstance(route, dict):
            raise ValidationError(f"Route at index {idx} must be a dictionary object.", field="transport")

        origin_id = str(route.get("origin_id", "")).strip()
        if not origin_id:
            raise ValidationError(f"Route at index {idx} has missing or empty 'origin_id'.", field="origin_id")

        destination_id = str(route.get("destination_id", "")).strip()
        if not destination_id:
            raise ValidationError(f"Route at index {idx} has missing or empty 'destination_id'.", field="destination_id")

        if valid_dest_ids is not None and destination_id not in valid_dest_ids:
            raise ValidationError(
                f"Route references unknown destination ID '{destination_id}' not found in destinations.",
                field="destination_id",
                entity_id=destination_id
            )

        pair = (origin_id, destination_id)
        if pair in seen_pairs:
            raise ValidationError(f"Duplicate route found for origin '{origin_id}' to destination '{destination_id}'.", field="transport")
        seen_pairs.add(pair)

        # Travel time validation
        try:
            travel_time = float(route.get("travel_time_hours", 0))
            if travel_time <= 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Route '{origin_id}->{destination_id}' has invalid travel time '{route.get('travel_time_hours')}': must be a positive number (> 0).",
                field="travel_time_hours"
            ) from exc

        # Transport cost validation
        try:
            cost = float(route.get("transport_cost", 0))
            if cost < 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Route '{origin_id}->{destination_id}' has invalid transport cost '{route.get('transport_cost')}': must be non-negative (>= 0).",
                field="transport_cost"
            ) from exc

        # Capacity validation (can be 0 if route is disrupted/closed)
        try:
            capacity = float(route.get("capacity_kg", 0))
            if capacity < 0:
                raise ValueError()
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Route '{origin_id}->{destination_id}' has invalid route capacity '{route.get('capacity_kg')}': must be non-negative (>= 0).",
                field="capacity_kg"
            ) from exc

        item = dict(route)
        item["origin_id"] = origin_id
        item["destination_id"] = destination_id
        item["travel_time_hours"] = round(travel_time, 2)
        item["transport_cost"] = round(cost, 2)
        item["capacity_kg"] = round(capacity, 2)
        validated_transport.append(item)

    return validated_transport


def validate_planning_dataset(
    inventory: list[dict[str, Any]],
    destinations: list[dict[str, Any]],
    transport: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Validates entire dataset and cross-references."""
    val_inv = validate_inventory(inventory)
    val_dest = validate_destinations(destinations)
    dest_ids = {d["destination_id"] for d in val_dest}
    val_trans = validate_transport(transport, valid_dest_ids=dest_ids)

    # Check for commodities that have demand but no price, or missing batch price
    for dest in val_dest:
        dest_demands = dest.get("demand_by_commodity", {})
        dest_prices = dest.get("price_by_commodity", {})
        for commodity, qty in dest_demands.items():
            if qty > 0 and commodity not in dest_prices:
                # If price is missing for demanded commodity, check if batches have selling price
                matching_batches = [b for b in val_inv if b["commodity"] == commodity]
                if not matching_batches:
                    raise ValidationError(
                        f"Destination '{dest['destination_id']}' demands '{commodity}' but has no price defined and no inventory batch exists for it.",
                        field="price_by_commodity",
                        entity_id=dest["destination_id"]
                    )

    return val_inv, val_dest, val_trans
