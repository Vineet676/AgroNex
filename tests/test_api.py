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


def test_ai_status_endpoint():
    r = client.get('/api/ai/status')
    assert r.status_code == 200
    data = r.json()
    assert 'status' in data and 'provider' in data and 'active_model' in data


def test_quick_add_and_delete_batch():
    test_batch = {
        'batch_id': 'TEST-BATCH-999',
        'commodity': 'Dragonfruit',
        'quantity_kg': 350.0,
        'remaining_shelf_life_hours': 28.0,
        'selling_price_per_kg': 120.0,
        'unit_cost_per_kg': 70.0,
        'handling_time_hours': 1.0,
        'origin_id': 'CENTRAL',
    }
    # Quick add
    r_add = client.post('/api/inventory/quick-add', json=test_batch)
    assert r_add.status_code == 200
    added_inv = r_add.json()['inventory']
    assert any(b['batch_id'] == 'TEST-BATCH-999' for b in added_inv)

    # Delete
    r_del = client.delete('/api/inventory/TEST-BATCH-999')
    assert r_del.status_code == 200
    rem_inv = r_del.json()['inventory']
    assert not any(b['batch_id'] == 'TEST-BATCH-999' for b in rem_inv)

