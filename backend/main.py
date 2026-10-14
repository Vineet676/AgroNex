from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

try:
    from .engine import build_plan, apply_disruption, explain_plan
    from .models import DisruptionRequest, ExplainRequest
except ImportError:  # supports `uvicorn main:app` from the backend directory
    from engine import build_plan, apply_disruption, explain_plan
    from models import DisruptionRequest, ExplainRequest

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR.parent / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"


def load_json(filename: str):
    with (DATA_DIR / filename).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sample_data() -> dict:
    return {"inventory": load_json("inventory.json"),
            "destinations": load_json("destinations.json"),
            "transport": load_json("transport.json")}

app = FastAPI(title="AgroNex API", version="1.1.0", description="Explainable, shelf-life-aware perishable produce distribution planning demo")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "AgroNex", "version": "1.1.0"}


@app.get("/api/initial-data")
def initial_data():
    data = sample_data()
    return {**data, "sample_data": True, "currency": "INR", "planning_horizon_hours": 24}


@app.post("/api/optimize")
def optimize(payload: dict | None = None):
    try:
        data = sample_data()
        if payload:
            for key in ("inventory", "destinations", "transport"):
                if key in payload:
                    if not isinstance(payload[key], list):
                        raise HTTPException(status_code=422, detail=f"{key} must be a list")
                    data[key] = payload[key]
        return build_plan(data["inventory"], data["destinations"], data["transport"])
    except HTTPException:
        raise
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid planning data: {exc}") from exc


@app.post("/api/simulate")
def simulate(request: DisruptionRequest):
    data = sample_data()
    destinations, transport = apply_disruption(data["destinations"], data["transport"], request.model_dump())
    result = build_plan(data["inventory"], destinations, transport)
    result["scenario"] = request.model_dump()
    result["scenario_label"] = "Disruption scenario"
    return result


def _call_optional_ai(question: str, plan: dict) -> str | None:
    """Optional OpenAI Responses API call. Falls back cleanly when no key/network."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    import urllib.request
    payload = {
        "model": os.getenv("AGRONEX_AI_MODEL", os.getenv("FRESHROUTE_AI_MODEL", "gpt-4o-mini")),
        "instructions": (
            "You explain a produce distribution plan for a hackathon demo. Use only the supplied plan data. "
            "Do not invent facts, metrics, market prices, or constraints. Clearly say when data is absent. "
            "This is an estimate using synthetic sample data, not financial or operational advice. Keep it concise."
        ),
        "input": "User question: " + question + "\nPlan data: " + json.dumps(plan, ensure_ascii=False)[:18000],
    }
    req = Request("https://api.openai.com/v1/responses", data=json.dumps(payload).encode("utf-8"),
                  headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
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
        result = build_plan(**sample_data())
        data = result["optimized"]
    ai_answer = _call_optional_ai(request.question, data)
    if ai_answer:
        return {"answer": ai_answer, "question": request.question, "source": "provided plan data",
                "mode": "AI-assisted", "disclaimer": "Uses sample/simulated inputs; verify assumptions before real use."}
    fallback = explain_plan(data, request.question)
    fallback["mode"] = "built-in explanation (AI API not configured or unavailable)"
    return fallback


# Serve the production React build when present. During development, Vite serves
# the React app on port 5173 and proxies /api requests to this FastAPI service.
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
