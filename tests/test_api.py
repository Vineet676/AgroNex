from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_health_endpoint():
    r = client.get('/api/health')
    assert r.status_code == 200 and r.json()['app'] == 'AgroNex'

def test_initial_data_endpoint():
    r = client.get('/api/initial-data')
    assert r.status_code == 200
    body = r.json()
    assert len(body['inventory']) >= 5 and body['sample_data'] is True

def test_optimize_endpoint_returns_both_plans():
    r = client.post('/api/optimize', json={})
    assert r.status_code == 200
    body = r.json()
    assert body['baseline']['strategy'] == 'baseline'
    assert body['optimized']['strategy'] == 'optimized'
    assert 'improvement_summary' in body

def test_simulate_endpoint():
    r = client.post('/api/simulate', json={'demand_change_percent':-10,'travel_delay_hours':1,'capacity_change_percent':-10})
    assert r.status_code == 200 and r.json()['scenario_label'] == 'Disruption scenario'

def test_explain_endpoint_falls_back_without_key(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    r = client.post('/api/explain', json={'question':'Explain the plan'})
    assert r.status_code == 200 and r.json()['answer'] and 'mode' in r.json()

def test_invalid_payload_returns_clear_validation_error():
    r = client.post('/api/optimize', json={'inventory': 'not-a-list'})
    assert r.status_code == 422

def test_react_build_is_served_when_present():
    from backend.main import FRONTEND_DIST
    if FRONTEND_DIST.exists():
        r = client.get('/')
        assert r.status_code == 200 and 'AgroNex' in r.text
