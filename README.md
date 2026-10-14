# AgroNex — Intelligent Perishable Produce Distribution

**AgroNex** is a full-stack decision-support MVP for PS 03: *FreshRoute — Intelligent Decision Support for Perishable Produce Distribution*. It recommends which batches to dispatch first, where stock can feasibly go, and which unsold short-life batches may warrant a discount. It compares a transparent baseline against a deterministic optimization heuristic.

> **Data honesty:** included inventory, demand, prices, routes, and all resulting metrics are synthetic demo data. Results are modeled estimates, not measured real-world gains or a validated production logistics plan.

## Included

- **React + TypeScript + Vite** frontend with responsive operations dashboard, inventory table/search/filter, distribution plan, scenario lab, and plan-grounded copilot.
- **FastAPI + Pydantic** backend with interactive API docs at `/docs`.
- **Explainable planner** accounting for commodity demand, batch stock, destination price, route travel time/cost, handling time/cost, route capacity, delivery windows, and estimated remaining shelf life.
- **Documented baseline** (earliest-expiry-first, feasible destinations ranked by shortest travel time) compared to a net-value-aware heuristic.
- **Discount watch** for unsold batches with limited remaining shelf life. Suggestions are not counted as sales revenue.
- **Scenario simulation** for demand changes, transport delays, and capacity changes; baseline and optimized results use the same changed inputs.
- **Optional AI explanations** via `OPENAI_API_KEY`. Without a key or if the call fails, a deterministic explanation is used. The API key stays on the backend.
- **Tests** for the planner's stock/capacity/demand/shelf-life constraints, accounting, scenarios, and API responses.
- **AgroNex logo asset** in `frontend/public/agronex-mark.png`.

## PS 03 compliance checklist

| Mandatory item | Where it is implemented |
|---|---|
| Inventory batches with commodity, quantity, remaining shelf life | `backend/data/inventory.json`, Inventory view |
| Allocation based on demand, prices, travel time/cost, capacity | `backend/engine.py` |
| Prioritize perishable stock and reject infeasible arrival | Planner orders short-life stock first and checks arrival + handling against shelf life and delivery window |
| Explainable discount recommendations | `discount_recommendations` from the engine, Distribution plan view |
| Baseline comparison: spoilage, fulfillment, net revenue | `/api/optimize`, Overview and Distribution plan |
| Reproducible inputs and documented assumptions | JSON datasets, README, tests |
| Optional disruption replanning | `/api/simulate`, Scenario lab |

## Run in VS Code on Windows

Requirements: **Python 3.10+** and **Node.js 20+** (npm included).

1. Extract the ZIP and open the **`AgroNex` folder** in VS Code.
2. Open **Terminal → New Terminal**. Create a Python virtual environment and install backend dependencies:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   ```

3. Start FastAPI in this terminal:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
   ```

4. Open a **second** VS Code terminal and install/build the React app:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

5. Open **http://127.0.0.1:5173**. Keep both terminals running while developing. FastAPI docs: **http://127.0.0.1:8000/docs**.

### Single-server preview (optional)

Build React from `frontend` with `npm run build`, then run FastAPI. The API serves `frontend/dist` at **http://127.0.0.1:8000** if the build folder exists.

## Run tests

From the project root after installing backend requirements:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## API

- `GET /api/health` — health/version
- `GET /api/initial-data` — synthetic batches, destinations, routes
- `POST /api/optimize` — baseline and optimized plans; optional payload can supply `inventory`, `destinations`, and `transport` arrays
- `POST /api/simulate` — scenario replan with `demand_change_percent`, `travel_delay_hours`, `capacity_change_percent`
- `POST /api/explain` — explanation grounded in a calculated plan
- `GET /docs` — interactive Swagger docs

## Model and evaluation notes

- Planning horizon defaults to 24 hours.
- Arrival is modeled as route travel time + batch handling time; it must not exceed either remaining shelf life or destination delivery window.
- Each destination's route capacity is shared across allocations during the planning horizon; stock and remaining demand are decremented after every allocation.
- Transport cost is allocated in proportion to quantity against the route's original capacity; handling cost is per kg.
- Net value = gross sales value − allocated transport cost − handling cost. Discount suggestions are not treated as sales, and no hypothetical discounted demand is assumed.
- Unallocated stock whose remaining shelf life is within the planning horizon is modeled as spoilage; other unallocated stock is not automatically called spoiled.
- The optimizer is a deterministic heuristic, not a proof of global optimality. Compare it against the included baseline on multiple scenarios and inspect all assumptions before claiming performance gains.
- Live price feeds, real distributor integrations, actual shelf-life sensing, and demand forecasting are not implemented and are not required for the one-day MVP.

## Repository hygiene

No secrets or API keys are committed. To use optional OpenAI explanations, set `OPENAI_API_KEY` in the **backend terminal environment** before starting the API. Optional model setting: `AGRONEX_AI_MODEL` (default `gpt-4o-mini`; legacy `FRESHROUTE_AI_MODEL` is also accepted). API usage may incur charges. If unset, the built-in explanation works without an external AI service.
