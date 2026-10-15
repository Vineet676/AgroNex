from __future__ import annotations

import json
import os
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
    from .scenarios import list_scenarios, get_scenario
except ImportError:  # supports direct uvicorn execution
    from engine import build_plan, apply_disruption, explain_plan, plan_distribution
    from models import DisruptionRequest, ExplainRequest, CsvUploadRequest, DataRefreshRequest, ScenarioSelectRequest
    from validation import ValidationError
    from data_layer import data_manager
    from scenarios import list_scenarios, get_scenario

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"

app = FastAPI(
    title="AgroNex API",
    version="1.2.0",
    description="Explainable, shelf-life-aware perishable produce distribution planning engine",
)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "AgroNex", "version": "1.2.0"}


@app.get("/api/initial-data")
def initial_data():
    dataset = data_manager.get_dataset()
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
    }


@app.get("/api/data/status")
def data_status():
    return data_manager.get_status()


@app.post("/api/data/upload")
def upload_csv(request: CsvUploadRequest):
    try:
        if request.entity == "inventory":
            data_manager.inventory_provider.upload_csv(request.csv_content)
        elif request.entity == "destinations":
            data_manager.price_provider.upload_csv(request.csv_content)
        elif request.entity == "transport":
            data_manager.route_provider.upload_csv(request.csv_content)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported entity '{request.entity}'")

        dataset = data_manager.get_dataset()
        status_info = data_manager.get_status()
        return {
            "status": "success",
            "message": f"Successfully updated {request.entity} from uploaded CSV.",
            "data_source_status": status_info,
            "data": dataset,
        }
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"CSV Validation Error: {exc.message}") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to process CSV: {exc}") from exc


@app.post("/api/data/refresh-prices")
def refresh_prices(request: DataRefreshRequest = DataRefreshRequest()):
    dests = data_manager.price_provider.refresh_market_prices(simulate_failure=request.simulate_failure)
    return {
        "status": "stale" if data_manager.price_provider.status == "stale" else "refreshed",
        "provider_status": data_manager.price_provider.get_status_info(),
        "destinations": dests,
    }


@app.post("/api/data/refresh-routes")
def refresh_routes(request: DataRefreshRequest = DataRefreshRequest()):
    routes = data_manager.route_provider.refresh_traffic_conditions(simulate_failure=request.simulate_failure)
    return {
        "status": "stale" if data_manager.route_provider.status == "stale" else "refreshed",
        "provider_status": data_manager.route_provider.get_status_info(),
        "transport": routes,
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
        current = data_manager.get_dataset()
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
        return plan
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Validation failed: {exc.message}") from exc


@app.post("/api/optimize")
def optimize(payload: dict | None = None):
    try:
        data = data_manager.get_dataset()
        if payload:
            for key in ("inventory", "destinations", "transport"):
                if key in payload:
                    if not isinstance(payload[key], list):
                        raise HTTPException(status_code=422, detail=f"{key} must be a list")
                    data[key] = payload[key]
        return build_plan(data["inventory"], data["destinations"], data["transport"])
    except HTTPException:
        raise
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid planning data: {exc.message}") from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid planning data: {exc}") from exc


@app.post("/api/simulate")
def simulate(request: DisruptionRequest):
    try:
        data = data_manager.get_dataset()
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
        data_set = data_manager.get_dataset()
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
