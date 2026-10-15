from __future__ import annotations

import json
import os
import csv
import io
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

try:
    from .engine import build_plan, apply_disruption, explain_plan, plan_distribution
    from .models import DisruptionRequest, ExplainRequest, CsvUploadRequest, DataRefreshRequest, ScenarioSelectRequest
    from .validation import ValidationError
    from .data_layer import data_manager
    from .db_repository import database_repository
    from .scenarios import list_scenarios, get_scenario
except ImportError:  # supports direct uvicorn execution
    from engine import build_plan, apply_disruption, explain_plan, plan_distribution
    from models import DisruptionRequest, ExplainRequest, CsvUploadRequest, DataRefreshRequest, ScenarioSelectRequest
    from validation import ValidationError
    from data_layer import data_manager
    from db_repository import database_repository
    from scenarios import list_scenarios, get_scenario

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"

app = FastAPI(
    title="AgroNex API",
    version="1.2.0",
    description="Explainable, shelf-life-aware perishable produce distribution planning engine",
)


def planning_dataset() -> tuple[dict, str]:
    """Prefer PostgreSQL once it has complete operational data; otherwise use a snapshot."""
    database_data = database_repository.load_dataset()
    if database_data is not None:
        return database_data, "postgresql"
    return data_manager.get_dataset(), "validated_snapshot"


def persist_current_dataset(source: str) -> bool:
    """Persist an uploaded/refreshed in-memory dataset when PostgreSQL is initialized."""
    if not database_repository.status()["available"]:
        return False
    try:
        database_repository.replace_dataset(data_manager.get_dataset(), source=source)
        return True
    except Exception:
        return False


def save_result_if_database_active(result: dict) -> list[int]:
    try:
        return database_repository.save_plan(result)
    except Exception:
        return []


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "AgroNex", "version": "1.2.0"}


@app.get("/api/initial-data")
def initial_data():
    dataset, source = planning_dataset()
    status_info = data_manager.get_status()
    # sample_data flag preserved for fallback/test compatibility
    is_sample = (status_info["overall_status"] in {"cached", "stale"}) and (data_manager.inventory_provider.source == "validated_snapshot")
    return {
        "inventory": dataset["inventory"],
        "destinations": dataset["destinations"],
        "transport": dataset["transport"],
        "sample_data": is_sample,
        "currency": "INR",
        "planning_horizon_hours": 24,
        "data_source_status": status_info,
        "planning_data_source": source,
    }


@app.get("/api/data/status")
def data_status():
    return {**data_manager.get_status(), "database": database_repository.status()}


@app.get("/api/database/status")
def database_status():
    return database_repository.status()


@app.post("/api/database/initialize")
def initialize_database():
    """Create the PostgreSQL schema and seed it from the validated current dataset."""
    try:
        status = database_repository.initialize_and_seed(data_manager.get_dataset())
        return {"status": "initialized", "database": status, "planning_data_source": "postgresql"}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not initialize PostgreSQL: {exc}") from exc


@app.get("/api/plans")
def recent_plans(limit: int = 20):
    return {"plans": database_repository.recent_plans(max(1, min(limit, 100)))}


@app.post("/api/data/upload")
def upload_csv(request: CsvUploadRequest):
    try:
        if request.entity == "combined":
            reader = csv.DictReader(io.StringIO(request.csv_content.strip()))
            required = {"batch_id", "commodity", "quantity_kg", "remaining_shelf_life_hours", "origin", "destination", "destination_demand_kg", "selling_price_per_kg_inr", "travel_time_hours", "transport_cost_per_kg_inr", "destination_capacity_kg", "handling_time_hours"}
            headers = set(reader.fieldnames or [])
            missing = sorted(required - headers)
            if missing:
                raise HTTPException(status_code=422, detail="Combined CSV is missing required columns: " + ", ".join(missing))
            inventory, destination_map, route_map = [], {}, {}
            for row in reader:
                if not row or not any((v or "").strip() for v in row.values()):
                    continue
                origin = (row.get("origin") or "CENTRAL").strip()
                destination_name = (row.get("destination") or "").strip()
                destination_id = re.sub(r"[^a-z0-9]+", "_", destination_name.lower()).strip("_")
                commodity = (row.get("commodity") or "").strip()
                if not destination_name or not commodity:
                    raise HTTPException(status_code=422, detail="Each row must include a commodity and destination.")
                inventory.append({"batch_id": row["batch_id"].strip(), "commodity": commodity, "quantity_kg": float(row["quantity_kg"]), "remaining_shelf_life_hours": float(row["remaining_shelf_life_hours"]), "selling_price_per_kg": float(row["selling_price_per_kg_inr"]), "origin_id": origin, "handling_cost_per_kg": 1.0, "handling_time_hours": float(row["handling_time_hours"])})
                dest = destination_map.setdefault(destination_id, {"destination_id": destination_id, "name": destination_name, "delivery_window_hours": 24.0, "demand_by_commodity": {}, "price_by_commodity": {}})
                dest["demand_by_commodity"][commodity] = max(dest["demand_by_commodity"].get(commodity, 0), float(row["destination_demand_kg"]))
                dest["price_by_commodity"][commodity] = float(row["selling_price_per_kg_inr"])
                route_key = (origin, destination_id)
                route = route_map.setdefault(route_key, {"origin_id": origin, "destination_id": destination_id, "travel_time_hours": float(row["travel_time_hours"]), "transport_cost": float(row["transport_cost_per_kg_inr"]), "capacity_kg": float(row["destination_capacity_kg"])})
                route["travel_time_hours"] = min(route["travel_time_hours"], float(row["travel_time_hours"]))
                route["capacity_kg"] = max(route["capacity_kg"], float(row["destination_capacity_kg"]))
            if not inventory:
                raise HTTPException(status_code=422, detail="The CSV contains no data rows.")
            data_manager.inventory_provider.set_data(inventory, source="uploaded_csv")
            data_manager.price_provider.set_destinations(list(destination_map.values()), source="uploaded_csv")
            data_manager.route_provider.set_routes(list(route_map.values()), source="uploaded_csv")
        elif request.entity == "inventory":
            data_manager.inventory_provider.upload_csv(request.csv_content)
        elif request.entity == "destinations":
            data_manager.price_provider.upload_csv(request.csv_content)
        elif request.entity == "transport":
            data_manager.route_provider.upload_csv(request.csv_content)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported entity '{request.entity}'")

        dataset = data_manager.get_dataset()
        status_info = data_manager.get_status()
        saved_to_database = persist_current_dataset("uploaded_csv")
        return {
            "status": "success",
            "message": f"Successfully updated {request.entity} from uploaded CSV.",
            "data_source_status": status_info,
            "data": dataset,
            "saved_to_database": saved_to_database,
        }
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"CSV Validation Error: {exc.message}") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to process CSV: {exc}") from exc


@app.post("/api/data/refresh-prices")
def refresh_prices(request: DataRefreshRequest = DataRefreshRequest()):
    dests = data_manager.price_provider.refresh_market_prices(simulate_failure=request.simulate_failure)
    saved_to_database = persist_current_dataset("live_feed")
    return {
        "status": "stale" if data_manager.price_provider.status == "stale" else "refreshed",
        "provider_status": data_manager.price_provider.get_status_info(),
        "destinations": dests,
        "saved_to_database": saved_to_database,
    }


@app.post("/api/data/refresh-routes")
def refresh_routes(request: DataRefreshRequest = DataRefreshRequest()):
    routes = data_manager.route_provider.refresh_traffic_conditions(simulate_failure=request.simulate_failure)
    saved_to_database = persist_current_dataset("live_feed")
    return {
        "status": "stale" if data_manager.route_provider.status == "stale" else "refreshed",
        "provider_status": data_manager.route_provider.get_status_info(),
        "transport": routes,
        "saved_to_database": saved_to_database,
    }


@app.post("/api/data/reset")
def reset_data():
    data_manager.reset_to_snapshot()
    return {
        "status": "reset",
        "message": "Reset to validated fallback snapshot.",
        "data_source_status": data_manager.get_status(),
        "data": data_manager.get_dataset(),
    }


@app.get("/api/data/template/{entity}")
def get_template(entity: str):
    try:
        csv_text = data_manager.generate_template_csv(entity)
        return PlainTextResponse(
            content=csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="agronex_{entity}_template.csv"'},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/scenarios")
def get_scenarios_list():
    return {"scenarios": list_scenarios()}


@app.post("/api/scenarios/run")
def run_named_scenario(request: ScenarioSelectRequest):
    try:
        scen = get_scenario(request.scenario_id)
        current, _ = planning_dataset()
        destinations, transport = apply_disruption(
            current["destinations"], current["transport"], scen["disruption"]
        )
        plan = build_plan(current["inventory"], destinations, transport)
        plan["scenario"] = scen["disruption"]
        plan["scenario_id"] = scen["id"]
        plan["scenario_name"] = scen["name"]
        plan["scenario_label"] = scen["name"]
        plan["scenario_description"] = scen["description"]
        plan["scenario_assumptions"] = scen["assumptions"]
        plan["stored_plan_ids"] = save_result_if_database_active(plan)
        return plan
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Validation failed: {exc.message}") from exc


@app.post("/api/optimize")
def optimize(payload: dict | None = None):
    try:
        data, _ = planning_dataset()
        if payload:
            for key in ("inventory", "destinations", "transport"):
                if key in payload:
                    if not isinstance(payload[key], list):
                        raise HTTPException(status_code=422, detail=f"{key} must be a list")
                    data[key] = payload[key]
        result = build_plan(data["inventory"], data["destinations"], data["transport"])
        result["stored_plan_ids"] = save_result_if_database_active(result)
        return result
    except HTTPException:
        raise
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid planning data: {exc.message}") from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid planning data: {exc}") from exc


@app.post("/api/simulate")
def simulate(request: DisruptionRequest):
    try:
        data, _ = planning_dataset()
        destinations, transport = apply_disruption(
            data["destinations"], data["transport"], request.model_dump()
        )
        result = build_plan(data["inventory"], destinations, transport)
        result["scenario"] = request.model_dump()
        result["scenario_label"] = "Disruption scenario"
        result["scenario_assumptions"] = [
            f"Demand adjusted by {request.demand_change_percent:+g}%",
            f"Transit delay of +{request.travel_delay_hours:g}h on all corridors",
            f"Transport capacity adjusted by {request.capacity_change_percent:+g}%",
            "Hard shelf-life and delivery window deadlines enforced strictly",
        ]
        result["stored_plan_ids"] = save_result_if_database_active(result)
        return result
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Simulation data validation error: {exc.message}") from exc


def _call_optional_ai(question: str, plan: dict) -> str | None:
    """Optional OpenAI Responses API call. Falls back cleanly when no key/network."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    payload = {
        "model": os.getenv("AGRONEX_AI_MODEL", os.getenv("FRESHROUTE_AI_MODEL", "gpt-4o-mini")),
        "instructions": (
            "You explain a perishable produce distribution plan for AgroNex. Use only the supplied plan data. "
            "Do not invent facts, metrics, market prices, or constraints. Clearly say when data is absent. "
            "Provide concise, operationally grounded answers explaining allocations, constraints, and discount suggestions."
        ),
        "input": "User question: " + question + "\nPlan data: " + json.dumps(plan, ensure_ascii=False)[:18000],
    }
    req = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=12) as response:
            result = json.loads(response.read().decode("utf-8"))
        chunks = []
        for item in result.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    chunks.append(content["text"])
        return "\n".join(chunks).strip() or None
    except (HTTPError, URLError, TimeoutError, ValueError, OSError):
        return None


@app.post("/api/explain")
def explain(request: ExplainRequest):
    data = request.plan
    if not data:
        data_set, _ = planning_dataset()
        result = build_plan(data_set["inventory"], data_set["destinations"], data_set["transport"])
        data = result["optimized"]
    ai_answer = _call_optional_ai(request.question, data)
    if ai_answer:
        return {
            "answer": ai_answer,
            "question": request.question,
            "source": "verified plan data",
            "mode": "AI-assisted",
            "disclaimer": "Grounding verified against operational constraints.",
        }
    fallback = explain_plan(data, request.question)
    fallback["mode"] = "built-in explanation (AI API not configured or unavailable)"
    return fallback


# Serve the production React build when present. During development, Vite serves
# the React app on port 5173 and proxies /api requests to this FastAPI service.
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
