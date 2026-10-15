import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, Boxes,
  Check, ChevronDown, CircleHelp, Clock3, Download, FileUp, Info, Leaf, MapPin,
  Menu, Package, Play, RefreshCw, Route, Search, Send, ShieldCheck, Sparkles,
  Sprout, TrendingUp, Truck, Upload, Warehouse, X
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Batch = {
  batch_id: string;
  commodity: string;
  quantity_kg: number;
  remaining_shelf_life_hours: number;
  selling_price_per_kg: number;
  origin_id: string;
  handling_time_hours: number;
  handling_cost_per_kg: number;
  temperature_celsius?: number;
};

type Destination = {
  destination_id: string;
  name: string;
  demand_by_commodity: Record<string, number>;
  price_by_commodity: Record<string, number>;
  delivery_window_hours: number;
};

type RouteData = {
  origin_id: string;
  destination_id: string;
  travel_time_hours: number;
  transport_cost: number;
  capacity_kg: number;
};

type DiscountRecommendation = {
  batch_id: string;
  commodity: string;
  quantity_kg: number;
  remaining_shelf_life_hours: number;
  original_price_per_kg: number;
  suggested_price_per_kg: number;
  discount_percent: number;
  urgency_tier: string;
  potential_discounted_revenue: number;
  type: string;
  is_confirmed_sale: boolean;
  status: string;
  reason: string;
};

type PlanMetrics = {
  initial_stock_kg: number;
  stock_used_kg: number;
  delivered_kg: number;
  unallocated_kg: number;
  expired_stock_kg: number;
  spoiled_kg: number;
  fresh_surplus_kg: number;
  initial_demand_kg: number;
  unmet_demand_kg: number;
  initial_capacity_kg: number;
  unused_capacity_kg: number;
  demand_fulfillment_percent: number;
  spoilage_rate_percent: number;
  capacity_utilization_percent: number;
  gross_revenue: number;
  transport_cost: number;
  handling_cost: number;
  net_revenue: number;
  potential_discount_revenue: number;
  constraint_violations: number;
};

type Plan = {
  strategy: string;
  strategy_description?: string;
  allocations: any[];
  discount_recommendations: DiscountRecommendation[];
  metrics: PlanMetrics;
  assumptions: string[];
};

type ImprovementSummary = {
  spoilage_reduction_kg: number;
  spoilage_reduction_percent: number;
  demand_fulfillment_change_kg: number;
  demand_fulfillment_change_percent: number;
  fulfillment_change_percentage_points: number;
  delivered_change_kg: number;
  net_revenue_change_amount: number;
  net_revenue_change_percent: number;
  transport_cost_change_amount: number;
  transport_cost_change_percent: number;
  handling_cost_change_amount: number;
  handling_cost_change_percent: number;
  unmet_demand_reduction_kg: number;
  unused_capacity_reduction_kg: number;
};

type PlanResponse = {
  baseline: Plan;
  optimized: Plan;
  improvement_summary: ImprovementSummary;
  scenario?: any;
  scenario_id?: string;
  scenario_name?: string;
  scenario_description?: string;
  scenario_assumptions?: string[];
};

type DataSourceStatus = {
  overall_status: 'live' | 'uploaded' | 'cached' | 'stale';
  last_updated: string;
  organization: string;
  workspace: string;
  providers: {
    inventory: { name: string; status: string; source: string; last_updated: string };
    prices: { name: string; status: string; source: string; last_updated: string };
    routes: { name: string; status: string; source: string; last_updated: string };
  };
};

type ScenarioItem = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  disruption: { demand_change_percent: number; travel_delay_hours: number; capacity_change_percent: number };
  assumptions: string[];
};

type Data = {
  inventory: Batch[];
  destinations: Destination[];
  transport: RouteData[];
  data_source_status?: DataSourceStatus;
  currency: string;
};

const API = (import.meta as any).env?.VITE_API_BASE_URL || '';
const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n || 0);

function formatTimeAgo(isoString?: string) {
  if (!isoString) return 'Just now';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  } catch {
    return 'Recent';
  }
}

function App() {
  const [data, setData] = useState<Data | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [dataStatus, setDataStatus] = useState<DataSourceStatus | null>(null);
  const [page, setPage] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All batches');
  const [demand, setDemand] = useState(0);
  const [delay, setDelay] = useState(0);
  const [capacity, setCapacity] = useState(0);
  const [scenario, setScenario] = useState<PlanResponse | null>(null);
  const [scenariosList, setScenariosList] = useState<ScenarioItem[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('corridor_bottleneck');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadEntity, setUploadEntity] = useState<'inventory' | 'destinations' | 'transport' | 'combined'>('combined');
  const [uploadCsvText, setUploadCsvText] = useState('');
  const [uploading, setUploading] = useState(false);

  const notify = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(''), 3000);
  };

  const request = async (path: string, body?: unknown) => {
    const res = await fetch(`${API}${path}`, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : undefined);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [d, p, scens] = await Promise.all([
        request('/api/initial-data'),
        request('/api/optimize', {}),
        request('/api/scenarios').catch(() => ({ scenarios: [] })),
      ]);
      setData(d);
      setDataStatus(d.data_source_status || null);
      setPlan(p);
      setScenariosList(scens.scenarios || []);
    } catch (e: any) {
      setError(`${e.message}. Ensure the FastAPI server is running.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const inventory = data?.inventory || [];
  const metrics = plan?.optimized.metrics;
  const base = plan?.baseline.metrics;
  const m = metrics || ({} as any);

  const filtered = useMemo(() => inventory.filter(b =>
    `${b.batch_id} ${b.commodity} ${b.origin_id}`.toLowerCase().includes(query.toLowerCase()) &&
    (filter === 'All batches' || ((filter === 'At risk' || filter === 'At risk (≤12h)') && b.remaining_shelf_life_hours <= 12) || ((filter === 'Fresh' || filter === 'Fresh (>24h)') && b.remaining_shelf_life_hours > 24))
  ), [inventory, query, filter]);

  const chartData = useMemo(() => {
    if (!plan) return [];
    const b = plan.baseline.metrics;
    const o = plan.optimized.metrics;
    return [
      { label: 'Delivered', baseline: b.delivered_kg, optimized: o.delivered_kg },
      { label: 'Spoilage', baseline: b.spoiled_kg, optimized: o.spoiled_kg },
      { label: 'Unmet Demand', baseline: b.unmet_demand_kg, optimized: o.unmet_demand_kg },
      { label: 'Unused Capacity', baseline: b.unused_capacity_kg, optimized: o.unused_capacity_kg },
    ];
  }, [plan]);

  const nav = [
    { label: 'Overview', icon: BarChart3 },
    { label: 'Inventory', icon: Boxes },
    { label: 'Distribution plan', icon: Route },
    { label: 'Scenario lab', icon: Activity },
    { label: 'AI copilot', icon: Sparkles },
  ];

  const runOptimize = async () => {
    try {
      const p = await request('/api/optimize', {});
      setPlan(p);
      notify('Distribution plan recalculated with latest network data');
    } catch (e: any) {
      notify(e.message);
    }
  };

  const handleRefreshPrices = async () => {
    try {
      const res = await request('/api/data/refresh-prices', { simulate_failure: false });
      notify(`Market prices updated (${res.status.toUpperCase()})`);
      const statusRes = await request('/api/data/status');
      setDataStatus(statusRes);
      runOptimize();
    } catch (e: any) {
      notify(`Price refresh error: ${e.message}`);
    }
  };

  const handleRefreshRoutes = async () => {
    try {
      const res = await request('/api/data/refresh-routes', { simulate_failure: false });
      notify(`Route & traffic conditions updated (${res.status.toUpperCase()})`);
      const statusRes = await request('/api/data/status');
      setDataStatus(statusRes);
      runOptimize();
    } catch (e: any) {
      notify(`Route refresh error: ${e.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setUploadCsvText(String(ev.target?.result || ''));
    };
    reader.readAsText(file);
  };

  const submitCsvUpload = async () => {
    if (!uploadCsvText.trim()) {
      notify('Please enter or select CSV content first');
      return;
    }
    setUploading(true);
    try {
      const res = await request('/api/data/upload', {
        entity: uploadEntity,
        csv_content: uploadCsvText,
      });
      setData(res.data);
      setDataStatus(res.data_source_status);
      setShowUploadModal(false);
      setUploadCsvText('');
      notify(`Successfully imported consolidated supply network CSV`);
      runOptimize();
    } catch (e: any) {
      notify(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const runScenarioSimulation = async () => {
    try {
      const res = await request('/api/simulate', {
        demand_change_percent: demand,
        travel_delay_hours: delay,
        capacity_change_percent: capacity,
      });
      setScenario(res);
      notify('Custom scenario simulation completed');
    } catch (e: any) {
      notify(e.message);
    }
  };

  const runPresetScenario = async (scenId: string) => {
    setSelectedScenarioId(scenId);
    try {
      const res = await request('/api/scenarios/run', { scenario_id: scenId });
      setScenario(res);
      if (res.scenario) {
        setDemand(res.scenario.demand_change_percent || 0);
        setDelay(res.scenario.travel_delay_hours || 0);
        setCapacity(res.scenario.capacity_change_percent || 0);
      }
      notify(`Executed scenario: ${res.scenario_name}`);
    } catch (e: any) {
      notify(e.message);
    }
  };

  const ask = async (q = question) => {
    if (!q.trim()) return;
    setAsking(true);
    setAnswer('');
    try {
      const lower = q.toLowerCase();
      if (/(spoil|expire|go bad|freshness|which (vegetable|produce|batch)|at risk)/i.test(lower) && inventory.length) {
        const urgent = [...inventory].sort((a, b) => a.remaining_shelf_life_hours - b.remaining_shelf_life_hours)[0];
        const feasible = (data?.transport || []).some(r => r.origin_id === urgent.origin_id && (r.travel_time_hours + urgent.handling_time_hours) < urgent.remaining_shelf_life_hours);
        setAnswer(`${urgent.commodity} (${urgent.batch_id}) is currently the most urgent batch, with ${fmt(urgent.remaining_shelf_life_hours)} hours of shelf life remaining and ${fmt(urgent.quantity_kg)} kg in stock. ${feasible ? 'At least one route from its origin appears to allow arrival and handling before expiry; confirm destination demand and capacity in the distribution plan.' : 'No route from its origin was found that clearly completes transit and handling before expiry. Check alternate routes or local clearance options.'} This assessment uses the current inventory snapshot; it is a risk ranking, not a guarantee of spoilage.`);
      } else {
        const r = await request('/api/explain', { question: q, plan: plan?.optimized });
        setAnswer(`${r.answer || 'The planner returned no explanation. Try refreshing the data and asking again.'}\n\nSource: ${r.mode || 'AgroNex fallback'}. Analysis derived from available network data.`);
      }
    } catch (e: any) {
      setAnswer(`I couldn't reach the explanation service (${e.message}). Try refreshing the data. You can still review the shortest-shelf-life batches in Inventory.`);
    } finally {
      setAsking(false);
      setQuestion('');
    }
  };

  const exportCsv = () => {
    const head = ['batch_id', 'commodity', 'quantity_kg', 'remaining_shelf_life_hours', 'selling_price_per_kg', 'origin_id', 'handling_cost_per_kg', 'handling_time_hours'];
    const rows = [head, ...inventory.map(b => head.map(k => (b as any)[k] ?? ''))];
    const csvContent = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv' }));
    a.download = 'agronex-inventory.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    notify('Inventory CSV exported');
  };

  const overallStatus = dataStatus?.overall_status || 'cached';
  const statusLabel =
    overallStatus === 'live' ? 'LIVE FEED' :
    overallStatus === 'uploaded' ? 'UPLOADED DATA' :
    overallStatus === 'stale' ? 'STALE / SNAPSHOT' : 'VALIDATED SNAPSHOT';

  const pageTitle =
    page === 'Distribution plan' ? 'Distribution intelligence' :
    page === 'Scenario lab' ? 'Scenario simulator' :
    page === 'AI copilot' ? 'AgroNex copilot' : page;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand">
          <img src="/agronex-mark.png" alt="AgroNex Logo" />
          <div>
            <strong>Agro<span>Nex</span></strong>
            <small>FRESH SUPPLY. SMARTER ROUTES.</small>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <X size={17} />
          </button>
        </div>

        <div className="workspace-wrap">
          <button className="workspace" type="button" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen(v => !v)}>
            <div className="workspace-icon"><Sprout size={18} /></div>
            <div><b>AgroNex Regional Supply</b><small>Active Operations Workspace</small></div>
            <ChevronDown size={15} style={{ transform: workspaceOpen ? 'rotate(180deg)' : undefined, transition: 'transform .18s' }} />
          </button>
          {workspaceOpen && <div className="workspace-menu">
            <button type="button" onClick={() => { setPage('Overview'); setWorkspaceOpen(false); }}>Regional Supply <small>Current workspace</small></button>
            <button type="button" onClick={() => { setPage('Inventory'); setWorkspaceOpen(false); }}>Inventory operations <small>View stock and freshness</small></button>
            <button type="button" onClick={() => { setPage('Distribution plan'); setWorkspaceOpen(false); }}>Distribution planning <small>Review dispatch plan</small></button>
          </div>}
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(n => (
            <button
              key={n.label}
              className={`nav-link ${page === n.label ? 'selected' : ''}`}
              onClick={() => { setPage(n.label); setMobileNav(false); }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.label === 'Scenario lab' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <b>Constraint-grounded planning</b>
            <p>Every dispatch assigns produce while verifying shelf life, route capacity, and delivery windows.</p>
            <button onClick={() => setPage('AI copilot')}>
              Ask AgroNex <ArrowRight size={14} />
            </button>
          </div>

          <div className="profile-wrap">
            <button className="profile" type="button" onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}>
              <div className="avatar">AN</div><div><b>AgroNex Operations</b><small>Distribution Control Hub</small></div><span className="online-dot" />
            </button>
            {profileOpen && <div className="workspace-menu profile-menu">
              <button type="button" onClick={() => { setPage('Overview'); setProfileOpen(false); }}>Dashboard overview<small>Return to overview</small></button>
              <button type="button" onClick={() => { setShowUploadModal(true); setProfileOpen(false); }}>Data settings<small>Import supply data</small></button>
              <button type="button" onClick={() => { setProfileOpen(false); notify('AgroNex demo workspace · local session'); }}>About this workspace<small>AgroNex operations demo</small></button>
            </div>}
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMobileNav(true)}>
            <Menu />
          </button>
          <div className="crumb">
            <button type="button" onClick={() => setPage('Overview')}>Workspace</button> <span>/</span> <b>{page}</b>
          </div>

          <div className="top-actions">
            {/* Live Data Provider Badge */}
            <button type="button" className={`live-pill status-${overallStatus}`} title="Show data validation details" onClick={() => setStatusOpen(v => !v)} aria-expanded={statusOpen}>
              <span /> {statusLabel}
            </button>
            {statusOpen && <div className="toolbar-popover status-popover"><b>Data validation</b><p>{dataStatus?.organization || 'AgroNex Regional Supply'}</p><p>Inventory: {dataStatus?.providers?.inventory?.status || 'snapshot'} · Prices: {dataStatus?.providers?.prices?.status || 'snapshot'} · Routes: {dataStatus?.providers?.routes?.status || 'snapshot'}</p><small>Last update: {dataStatus?.last_updated || 'No timestamp available'}</small></div>}

            {/* Last Updated Timestamp */}
            <div className="last-updated-text" title={`Last synced: ${dataStatus?.last_updated || 'Active'}`}>
              <Clock3 size={13} /> {formatTimeAgo(dataStatus?.last_updated)}
            </div>

            {/* Quick Action: Upload Data */}
            <button
              className="action-pill-btn"
              title="Upload CSV data"
              onClick={() => setShowUploadModal(true)}
            >
              <Upload size={14} /> Upload Data
            </button>

            {/* Quick Action: Refresh Market Prices */}
            <button
              className="action-pill-btn"
              title="Refresh live mandi / wholesale prices"
              onClick={handleRefreshPrices}
            >
              <TrendingUp size={14} /> Prices
            </button>

            {/* Quick Action: Refresh Routes */}
            <button
              className="action-pill-btn"
              title="Refresh traffic & corridor transit times"
              onClick={handleRefreshRoutes}
            >
              <Truck size={14} /> Routes
            </button>

            {/* Master Reload */}
            <button className="icon-button" title="Full data & plan reload" onClick={refresh}>
              <RefreshCw size={16} />
            </button>

            <button className="icon-button notification" title="Notifications" onClick={() => setNotificationsOpen(v => !v)} aria-expanded={notificationsOpen}>
              <Bell size={16} /><i />
            </button>
            {notificationsOpen && <div className="toolbar-popover notification-popover"><b>Operations alerts</b><p>{inventory.filter(b => b.remaining_shelf_life_hours <= 12).length} batch(es) have 12 hours or less of shelf life.</p><button type="button" onClick={() => { setPage('Inventory'); setFilter('At risk'); setNotificationsOpen(false); }}>Review at-risk inventory</button></div>}
            <button className="user-mini" type="button" title="Workspace profile" onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}>AN</button>
            {profileOpen && <div className="toolbar-popover account-popover"><b>AgroNex Operations</b><p>Regional supply demo workspace</p><button type="button" onClick={() => { setPage('Overview'); setProfileOpen(false); }}>Go to overview</button></div>}
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> PERISHABLE SUPPLY CHAIN INTELLIGENCE
              </div>
              <h1>{pageTitle}<span className="heading-period">.</span></h1>
              <p>
                {page === 'Overview' ? 'One clear view of freshness, demand, route capacities, and optimal dispatch.' :
                 page === 'Inventory' ? 'Know what is in stock, what is at risk, and what requires urgent clearance.' :
                 page === 'Distribution plan' ? 'A feasibility-first plan that balances shelf life, demand, route capacity, and net margin.' :
                 page === 'Scenario lab' ? 'Stress-test the distribution network against disruptions before the real world does.' :
                 'Understand the numbers, constraints, and cost trade-offs behind every recommendation.'}
              </p>
            </div>
            <div className="heading-actions">
              <button className="btn btn-light" onClick={() => setShowUploadModal(true)}>
                <Upload size={16} /> Upload Data
              </button>
              <button className="btn btn-light" onClick={exportCsv}>
                <Download size={16} /> Export CSV
              </button>
              <button className="btn btn-primary" onClick={runOptimize} disabled={loading}>
                <Sparkles size={16} /> Recalculate plan
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <b>Backend notification:</b>
              <span>{error}</span>
              <button onClick={refresh}>Retry</button>
            </div>
          )}

          {loading && !data ? (
            <div className="loading-card">
              <div className="spinner" /> Loading AgroNex planning data…
            </div>
          ) : (
            <>
              {/* PAGE 1: OVERVIEW */}
              {page === 'Overview' && (
                <>
                  <div className="welcome-strip">
                    <div className="welcome-mark">
                      <Leaf size={23} />
                    </div>
                    <div>
                      <b>Good decisions keep produce moving.</b>
                      <p>
                        AgroNex compares a transparent baseline heuristic with a shelf-life-aware plan
                        using the same network, transit times, and cost assumptions.
                      </p>
                    </div>
                    <div className="strip-note">
                      <ShieldCheck size={16} /> Constraint-first planning
                    </div>
                  </div>

                  <div className="section-title">
                    <div>
                      <h2>Network at a glance</h2>
                      <p>Active 24-hour planning window · INR financial cost model · Verified constraints</p>
                    </div>
                    <span className="updated">
                      <span /> PLAN READY
                    </span>
                  </div>

                  {/* 4 Primary KPIs */}
                  <div className="kpi-grid">
                    <Metric
                      icon={Package}
                      label="Available inventory"
                      value={`${fmt(m.initial_stock_kg)} kg`}
                      foot={`${inventory.length} tracked batches`}
                      tone="green"
                    />
                    <Metric
                      icon={Truck}
                      label="Planned dispatch"
                      value={`${fmt(m.delivered_kg)} kg`}
                      foot={`${fmt(m.demand_fulfillment_percent)}% demand fulfillment`}
                      tone="blue"
                    />
                    <Metric
                      icon={Clock3}
                      label="At-risk expired stock"
                      value={`${fmt(m.spoiled_kg)} kg`}
                      foot={`${fmt(m.spoilage_rate_percent)}% of starting stock`}
                      tone="amber"
                    />
                    <Metric
                      icon={BarChart3}
                      label="Estimated net value"
                      value={money(m.net_revenue)}
                      foot={`Gross: ${money(m.gross_revenue)}`}
                      tone="violet"
                    />
                  </div>

                  {/* Charts & Freshness Watch */}
                  <div className="dashboard-grid">
                    <section className="panel comparison-panel">
                      <div className="panel-heading">
                        <div>
                          <h3>Plan impact comparison</h3>
                          <p>Baseline (nearest feasible) vs. AgroNex (scarcity-aware optimizer)</p>
                        </div>
                        <span className="legend-label">
                          <i />Optimized <i className="legend-gray" />Baseline
                        </span>
                      </div>
                      <div className="chart-wrap">
                        {chartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                              <defs>
                                <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#2c8b5b" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#2c8b5b" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eee8" />
                              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#829087', fontSize: 11 }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#829087', fontSize: 11 }} />
                              <Tooltip contentStyle={{ border: '1px solid #e2e9e1', borderRadius: 12, fontSize: 12 }} />
                              <Area type="monotone" dataKey="optimized" name="AgroNex plan (kg)" stroke="#287b50" strokeWidth={2.5} fill="url(#greenFill)" />
                              <Area type="monotone" dataKey="baseline" name="Baseline (kg)" stroke="#aab5ad" strokeWidth={2} strokeDasharray="5 4" fill="transparent" />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="empty-chart">Run the planner to compare outcomes.</div>
                        )}
                      </div>
                      <div className="comparison-foot">
                        <div>
                          <span>Net value change</span>
                          <b className={Number(plan?.improvement_summary?.net_revenue_change_amount || 0) >= 0 ? 'positive' : 'negative'}>
                            {Number(plan?.improvement_summary?.net_revenue_change_amount || 0) >= 0 ? '+' : ''}
                            {money(plan?.improvement_summary?.net_revenue_change_amount || 0)}
                            <small style={{ display: 'inline', marginLeft: 4, fontWeight: 'normal', color: '#68826f' }}>
                              ({fmt(plan?.improvement_summary?.net_revenue_change_percent || 0)}%)
                            </small>
                          </b>
                        </div>
                        <div>
                          <span>Fulfillment change</span>
                          <b>
                            {Number(plan?.improvement_summary?.fulfillment_change_percentage_points || 0) >= 0 ? '+' : ''}
                            {fmt(plan?.improvement_summary?.fulfillment_change_percentage_points || 0)} pp
                            <small style={{ display: 'inline', marginLeft: 4, fontWeight: 'normal', color: '#68826f' }}>
                              ({fmt(plan?.improvement_summary?.demand_fulfillment_change_kg || 0)} kg)
                            </small>
                          </b>
                        </div>
                        <div>
                          <span>Spoilage reduction</span>
                          <b className={Number(plan?.improvement_summary?.spoilage_reduction_kg || 0) >= 0 ? 'positive' : 'negative'}>
                            {fmt(plan?.improvement_summary?.spoilage_reduction_kg || 0)} kg
                            <small style={{ display: 'inline', marginLeft: 4, fontWeight: 'normal', color: '#68826f' }}>
                              ({fmt(plan?.improvement_summary?.spoilage_reduction_percent || 0)}%)
                            </small>
                          </b>
                        </div>
                      </div>
                    </section>

                    <section className="panel risk-panel">
                      <div className="panel-heading">
                        <div>
                          <h3>Freshness watch</h3>
                          <p>Short-life batches expiring within 24h window</p>
                        </div>
                        <span className="round-icon amber">
                          <Clock3 size={17} />
                        </span>
                      </div>
                      <div className="risk-list">
                        {[...inventory]
                          .sort((a, b) => a.remaining_shelf_life_hours - b.remaining_shelf_life_hours)
                          .slice(0, 4)
                          .map(b => (
                            <div className="risk-row" key={b.batch_id}>
                              <div className={`produce-icon ${b.remaining_shelf_life_hours <= 12 ? 'risk' : 'fresh'}`}>
                                <Leaf size={17} />
                              </div>
                              <div className="risk-name">
                                <b>{b.commodity}</b>
                                <small>{b.batch_id} · {fmt(b.quantity_kg)} kg · {b.origin_id}</small>
                              </div>
                              <div className="risk-time">
                                <b className={b.remaining_shelf_life_hours <= 12 ? 'warning-text' : ''}>
                                  {fmt(b.remaining_shelf_life_hours)}h
                                </b>
                                <small>remaining</small>
                              </div>
                            </div>
                          ))}
                      </div>
                      <button className="text-link" onClick={() => setPage('Inventory')}>
                        View all inventory <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>

                  {/* Dispatches & AgroNex Insight */}
                  <div className="bottom-grid">
                    <section className="panel allocation-panel">
                      <div className="panel-heading">
                        <div>
                          <h3>Recommended dispatches</h3>
                          <p>Feasible allocations prioritized by route scarcity and net value</p>
                        </div>
                        <button className="subtle-button" onClick={() => setPage('Distribution plan')}>
                          Full plan <ArrowRight size={14} />
                        </button>
                      </div>
                      <AllocationTable plan={plan?.optimized} />
                    </section>

                    <section className="insight-card">
                      <div className="insight-top">
                        <span className="insight-spark">
                          <Sparkles size={17} />
                        </span>
                        <span>AGRONEX INTELLIGENCE</span>
                      </div>
                      <h3>Make every delivery count.</h3>
                      <p>
                        {plan?.optimized.discount_recommendations?.length
                          ? `${plan.optimized.discount_recommendations.length} batch(es) remain unsold after feasible allocations. Review urgency-based markdown suggestions (<6h: 30%, 6-12h: 20%, 12-24h: 10%) before produce spoils.`
                          : 'The plan has verified shelf life, destination demand, receiving windows, and route capacities before assigning produce.'}
                      </p>
                      <button onClick={() => setPage('AI copilot')}>
                        Explore the reasoning <ArrowRight size={15} />
                      </button>
                      <div className="insight-art">
                        <div /><div /><div />
                        <Leaf size={55} />
                      </div>
                    </section>
                  </div>
                </>
              )}

              {/* PAGE 2: INVENTORY */}
              {page === 'Inventory' && (
                <section className="panel inventory-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Inventory batches</h3>
                      <p>{inventory.length} tracked batches · verified shelf life & handling costs</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-light" onClick={() => setShowUploadModal(true)}>
                        <Upload size={15} /> Upload CSV
                      </button>
                      <button className="btn btn-light" onClick={exportCsv}>
                        <Download size={15} /> Export CSV
                      </button>
                    </div>
                  </div>

                  <div className="table-tools">
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search batch code, commodity, or origin…"
                      />
                    </div>
                    <select value={filter} onChange={e => setFilter(e.target.value)}>
                      <option value="All batches">All batches</option>
                      <option value="At risk (≤12h)">At risk (≤12h)</option>
                      <option value="Fresh (>24h)">Fresh (&gt;24h)</option>
                    </select>
                  </div>

                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Batch ID</th>
                          <th>Commodity</th>
                          <th>Quantity</th>
                          <th>Remaining shelf life</th>
                          <th>Selling price</th>
                          <th>Origin</th>
                          <th>Handling cost / time</th>
                          <th>Freshness status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(b => (
                          <tr key={b.batch_id}>
                            <td>
                              <b className="batch-code">{b.batch_id}</b>
                            </td>
                            <td>
                              <div className="commodity-cell">
                                <span className="mini-leaf">
                                  <Leaf size={14} />
                                </span>
                                {b.commodity}
                              </div>
                            </td>
                            <td>{fmt(b.quantity_kg)} kg</td>
                            <td>
                              <div className="shelf-cell">
                                <div className="shelf-track">
                                  <i
                                    style={{
                                      width: `${Math.min(100, (b.remaining_shelf_life_hours / 48) * 100)}%`,
                                      background: b.remaining_shelf_life_hours <= 6 ? '#dc2626' : b.remaining_shelf_life_hours <= 12 ? '#d97706' : '#22c55e',
                                    }}
                                  />
                                </div>
                                <b>{fmt(b.remaining_shelf_life_hours)}h</b>
                              </div>
                            </td>
                            <td>{money(b.selling_price_per_kg)}/kg</td>
                            <td>{b.origin_id}</td>
                            <td>{money(b.handling_cost_per_kg)}/kg ({b.handling_time_hours}h)</td>
                            <td>
                              <span className={`status-tag ${b.remaining_shelf_life_hours <= 6 ? 'status-risk' : b.remaining_shelf_life_hours <= 12 ? 'status-watch' : 'status-ok'}`}>
                                {b.remaining_shelf_life_hours <= 6 ? 'Critical (<6h)' : b.remaining_shelf_life_hours <= 12 ? 'At Risk (<12h)' : 'Healthy'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filtered.length && <div className="empty-chart">No batches match your filters.</div>}
                  </div>
                  <div className="table-note">
                    <ShieldCheck size={15} /> All inventory inputs are validated for positive weights, positive shelf life, and non-negative pricing.
                  </div>
                </section>
              )}

              {/* PAGE 3: DISTRIBUTION PLAN */}
              {page === 'Distribution plan' && (
                <>
                  {/* Detailed 4-Metric Grid */}
                  <div className="plan-summary-grid">
                    <Metric
                      icon={Truck}
                      label="Stock used"
                      value={`${fmt(m.stock_used_kg ?? m.delivered_kg)} kg`}
                      foot={`${fmt(m.demand_fulfillment_percent)}% demand fulfilled`}
                      tone="green"
                    />
                    <Metric
                      icon={MapPin}
                      label="Unmet demand"
                      value={`${fmt(m.unmet_demand_kg)} kg`}
                      foot={`Total requested: ${fmt(m.initial_demand_kg)} kg`}
                      tone="amber"
                    />
                    <Metric
                      icon={Warehouse}
                      label="Unused route capacity"
                      value={`${fmt(m.unused_capacity_kg)} kg`}
                      foot={`${fmt(m.capacity_utilization_percent)}% fleet utilized`}
                      tone="blue"
                    />
                    <Metric
                      icon={Clock3}
                      label="Expired / spoiled stock"
                      value={`${fmt(m.expired_stock_kg ?? m.spoiled_kg)} kg`}
                      foot={`Fresh surplus: ${fmt(m.fresh_surplus_kg)} kg`}
                      tone="violet"
                    />
                  </div>

                  {/* Allocation Table */}
                  <section className="panel allocation-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Explainable allocation plan</h3>
                        <p>Route-scarcity reservation prioritizes fragile produce; full arrival time and feasibility audit included</p>
                      </div>
                      <button className="btn btn-primary" onClick={runOptimize}>
                        <RefreshCw size={15} /> Recalculate
                      </button>
                    </div>
                    <AllocationTable plan={plan?.optimized} detailed />
                  </section>

                  {/* Financial Breakdown & Discount Watch */}
                  <div className="two-panels">
                    {/* Financial Cost Components */}
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h3>Financial cost breakdown</h3>
                          <p>Explicit accounting of gross revenue and logistics deductions</p>
                        </div>
                      </div>
                      <div className="metric-compare">
                        <div>
                          <span>Gross Sales Realization</span>
                          <b>{money(m.gross_revenue)}</b>
                          <small>Sum of (delivered quantity &times; destination market price)</small>
                        </div>
                        <div>
                          <span>Transport Freight Cost</span>
                          <b style={{ color: '#c2410c' }}>-{money(m.transport_cost)}</b>
                          <small>Allocated proportionally across dispatched corridor weights</small>
                        </div>
                        <div>
                          <span>Handling & Sorting Cost</span>
                          <b style={{ color: '#c2410c' }}>-{money(m.handling_cost)}</b>
                          <small>Variable terminal handling cost per kilogram</small>
                        </div>
                        <div style={{ background: '#f5faf3', borderRadius: 8, padding: '10px 12px' }}>
                          <span style={{ fontWeight: 700, color: '#1b4d2e' }}>Net Operating Realization</span>
                          <b style={{ fontSize: 15, color: '#1b4d2e' }}>{money(m.net_revenue)}</b>
                          <small>Gross revenue minus transport freight and handling</small>
                        </div>
                      </div>
                    </section>

                    {/* Urgency-Tiered Discount Engine */}
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h3>Urgency-tiered discount engine</h3>
                          <p>
                            Clearance markdowns applied <em>only</em> when normal allocation cannot sell stock.
                            <br />
                            <small style={{ color: '#7e8f82' }}>&lt;6h: 30% · 6–12h: 20% · 12–24h: 10% · Recommendations, not confirmed sales</small>
                          </p>
                        </div>
                      </div>

                      {(plan?.optimized.discount_recommendations || []).length ? (
                        plan!.optimized.discount_recommendations.map((d: DiscountRecommendation) => (
                          <div className="discount-row" key={d.batch_id} style={{ alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, paddingRight: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <b>{d.commodity} ({d.batch_id})</b>
                                <span className={`urgency-badge ${d.remaining_shelf_life_hours < 6 ? 'critical' : d.remaining_shelf_life_hours <= 12 ? 'high' : 'moderate'}`}>
                                  {d.urgency_tier} ({d.discount_percent}%)
                                </span>
                                <span className="recom-tag">RECOMMENDED ONLY</span>
                              </div>
                              <small style={{ color: '#687b6d', lineHeight: 1.5 }}>{d.reason}</small>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ fontSize: 13, color: '#b45309', display: 'block' }}>
                                {money(d.suggested_price_per_kg)}/kg
                              </strong>
                              <small style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                                {money(d.original_price_per_kg)}/kg
                              </small>
                              <small style={{ display: 'block', color: '#059669', marginTop: 2 }}>
                                Pot. rec: {money(d.potential_discounted_revenue)}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-chart">
                          No unsold batches require discount clearance under current demand and capacity conditions.
                        </div>
                      )}
                    </section>
                  </div>

                  {/* Planning Assumptions */}
                  <div className="assumption-box">
                    <ShieldCheck size={18} />
                    <div>
                      <b>Verified operational assumptions</b>
                      <p>
                        {plan?.optimized.assumptions?.join(' · ')}. Baseline uses pure nearest-feasible greed without economic optimization.
                        Optimized plan protects scarce transit corridors for short-life produce.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* PAGE 4: SCENARIO LAB */}
              {page === 'Scenario lab' && (
                <>
                  <div className="welcome-strip">
                    <div className="welcome-mark">
                      <Activity size={22} />
                    </div>
                    <div>
                      <b>Plan for the unexpected with realistic scenario stress-tests.</b>
                      <p>
                        Evaluate network resilience under realistic logistics disruptions (bottlenecks, transit delays, capacity crunches, demand surges).
                        Both baseline and optimized plans rerun on identical changed inputs with visible assumptions.
                      </p>
                    </div>
                  </div>

                  {/* Preset Realistic Scenarios */}
                  <div style={{ marginBottom: 12 }}>
                    <h3 style={{ font: '800 13px Manrope', margin: '0 0 8px', color: '#213a29' }}>
                      Realistic operational scenarios
                    </h3>
                    <div className="scenario-selector-grid">
                      {scenariosList.map(sc => (
                        <div
                          key={sc.id}
                          className={`scenario-card ${selectedScenarioId === sc.id ? 'active' : ''}`}
                          onClick={() => runPresetScenario(sc.id)}
                        >
                          <div className="scenario-card-head">
                            <span className="scenario-tagline">{sc.tagline}</span>
                            {selectedScenarioId === sc.id && <Check size={14} color="#20643d" />}
                          </div>
                          <h4>{sc.name}</h4>
                          <p>{sc.description}</p>
                          <div style={{ fontSize: 9, color: '#5b7462', fontWeight: 600 }}>
                            Demand: {sc.disruption.demand_change_percent > 0 ? `+${sc.disruption.demand_change_percent}` : sc.disruption.demand_change_percent}% · Delay: +{sc.disruption.travel_delay_hours}h · Capacity: {sc.disruption.capacity_change_percent > 0 ? `+${sc.disruption.capacity_change_percent}` : sc.disruption.capacity_change_percent}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="scenario-layout">
                    {/* Disruption Controls */}
                    <section className="panel scenario-controls">
                      <div className="panel-heading">
                        <div>
                          <h3>Custom disruption controls</h3>
                          <p>Directly adjust parameters to test sensitivity</p>
                        </div>
                      </div>

                      <Slider
                        label="Destination demand"
                        value={demand}
                        min={-50}
                        max={100}
                        suffix="%"
                        onChange={setDemand}
                        note="Demand changes stress-test network capacity and revenue capture."
                      />
                      <Slider
                        label="Transit corridor delay"
                        value={delay}
                        min={0}
                        max={12}
                        step={0.5}
                        suffix=" h"
                        onChange={setDelay}
                        note="Arrival time must strictly satisfy shelf life and receiving windows."
                      />
                      <Slider
                        label="Transport capacity"
                        value={capacity}
                        min={-75}
                        max={50}
                        suffix="%"
                        onChange={setCapacity}
                        note="Capacity shortages highlight the value of route scarcity reservation."
                      />

                      <div className="scenario-actions">
                        <button
                          className="btn btn-light"
                          onClick={() => { setDemand(0); setDelay(0); setCapacity(0); setScenario(null); }}
                        >
                          Reset
                        </button>
                        <button className="btn btn-primary" onClick={runScenarioSimulation}>
                          <Play size={15} /> Run simulation
                        </button>
                      </div>
                    </section>

                    {/* Scenario Results */}
                    <section className="panel scenario-results">
                      <div className="panel-heading">
                        <div>
                          <h3>Scenario outcomes & impact</h3>
                          <p>{scenario ? (scenario.scenario_name || 'Custom disruption scenario') : 'Select a preset or adjust sliders and simulate'}</p>
                        </div>
                        <span className={`status-tag ${scenario ? 'status-ok' : 'status-watch'}`}>
                          {scenario ? 'SIMULATED' : 'NOT RUN'}
                        </span>
                      </div>

                      {scenario ? (
                        <>
                          <div className="scenario-kpis">
                            <div>
                              <span>Net captured value</span>
                              <b>{money(scenario.optimized.metrics.net_revenue)}</b>
                              <small className={Number(scenario.improvement_summary.net_revenue_change_amount) >= 0 ? 'positive' : 'negative'}>
                                {Number(scenario.improvement_summary.net_revenue_change_amount) >= 0 ? '+' : ''}
                                {money(scenario.improvement_summary.net_revenue_change_amount)} vs baseline ({fmt(scenario.improvement_summary.net_revenue_change_percent)}%)
                              </small>
                            </div>

                            <div>
                              <span>Demand fulfilled</span>
                              <b>{fmt(scenario.optimized.metrics.demand_fulfillment_percent)}%</b>
                              <small>
                                {fmt(scenario.optimized.metrics.delivered_kg)} kg delivered ({fmt(scenario.improvement_summary.demand_fulfillment_change_kg)} kg vs baseline)
                              </small>
                            </div>

                            <div>
                              <span>Modeled spoilage</span>
                              <b style={{ color: scenario.optimized.metrics.spoiled_kg > 0 ? '#b45309' : '#059669' }}>
                                {fmt(scenario.optimized.metrics.spoiled_kg)} kg
                              </b>
                              <small className="positive">
                                Spoilage reduced by {fmt(scenario.improvement_summary.spoilage_reduction_kg)} kg ({fmt(scenario.improvement_summary.spoilage_reduction_percent)}%)
                              </small>
                            </div>

                            <div>
                              <span>Unused fleet capacity</span>
                              <b>{fmt(scenario.optimized.metrics.unused_capacity_kg)} kg</b>
                              <small>
                                {fmt(scenario.optimized.metrics.capacity_utilization_percent)}% fleet utilization ({scenario.optimized.metrics.constraint_violations} violations)
                              </small>
                            </div>
                          </div>

                          {/* Cost Breakdown */}
                          <div className="cost-breakdown-grid">
                            <div className="cost-breakdown-item">
                              <span>Transport freight cost</span>
                              <b>{money(scenario.optimized.metrics.transport_cost)}</b>
                            </div>
                            <div className="cost-breakdown-item">
                              <span>Handling cost</span>
                              <b>{money(scenario.optimized.metrics.handling_cost)}</b>
                            </div>
                            <div className="cost-breakdown-item">
                              <span>Unmet demand</span>
                              <b>{fmt(scenario.optimized.metrics.unmet_demand_kg)} kg</b>
                            </div>
                          </div>

                          {/* Assumptions */}
                          <div className="assumption-box" style={{ marginTop: 12 }}>
                            <Activity size={18} />
                            <div>
                              <b>Scenario assumptions & conditions</b>
                              <p>
                                {scenario.scenario_assumptions ? scenario.scenario_assumptions.join(' · ') : `Demand ${demand > 0 ? '+' : ''}${demand}%, delay +${delay}h, capacity ${capacity > 0 ? '+' : ''}${capacity}%. Strict shelf life limits applied.`}
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="scenario-empty">
                          <Activity size={32} />
                          <b>Awaiting scenario execution</b>
                          <p>Click any realistic scenario above or adjust the sliders to benchmark the optimizer against the baseline.</p>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}

              {/* PAGE 5: AI COPILOT */}
              {page === 'AI copilot' && (
                <div className="copilot-layout">
                  <section className="panel copilot-main">
                    <div className="copilot-header">
                      <div className="copilot-logo">
                        <img src="/agronex-mark.png" alt="AgroNex Logo" />
                      </div>
                      <div>
                        <h3>Ask AgroNex Copilot</h3>
                        <p>Deterministic, constraint-grounded explanations · zero hallucinations</p>
                      </div>
                      <span className="status-tag status-ok">OPERATIONAL</span>
                    </div>

                    <div className="chat-welcome">
                      <div className="chat-spark">
                        <Sparkles size={20} />
                      </div>
                      <h2>Make every number transparent.</h2>
                      <p>
                        Ask about batch allocations, route scarcity reservation, spoilage drivers, or urgency-based discount tiers.
                        All answers are grounded in calculated mathematical plan results.
                      </p>
                    </div>

                    <div className="suggested-questions">
                      {[
                        'Why was this fragile batch dispatched first?',
                        'How does route scarcity reservation reduce modeled spoilage?',
                        'Explain the baseline vs optimized plan comparison.',
                        'Which batches require urgency-tiered discount clearance?',
                      ].map(q => (
                        <button key={q} onClick={() => ask(q)}>
                          {q}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>

                    {answer && (
                      <div className="answer-box">
                        <div className="answer-heading">
                          <Sparkles size={15} /> OPERATIONAL AUDIT & REASONING
                        </div>
                        <p>{answer}</p>
                      </div>
                    )}

                    <form
                      className="chat-input"
                      onSubmit={e => {
                        e.preventDefault();
                        ask();
                      }}
                    >
                      <input
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="Ask about allocations, bottlenecks, or constraints…"
                      />
                      <button className="send-button" disabled={asking || !question.trim()}>
                        <Send size={16} />
                      </button>
                    </form>

                    <div className="copilot-disclaimer">
                      {asking ? 'Analyzing verified plan outputs…' : 'Deterministic explanation grounded in real operational constraints.'}
                    </div>
                  </section>

                  <section className="copilot-side">
                    <div className="panel">
                      <div className="panel-heading">
                        <div>
                          <h3>Hard constraints enforced</h3>
                          <p>Every dispatch satisfies these physical rules</p>
                        </div>
                      </div>
                      {[
                        ['Remaining shelf life', 'Produce must arrive before expiration time allowance'],
                        ['Delivery receiving window', 'Transit + handling must not exceed destination window'],
                        ['Destination demand', 'Dispatches capped strictly by destination requirement'],
                        ['Vehicle route capacity', 'Allocations never exceed available transport payload'],
                        ['Economic net value', 'Optimizes destination price net of transport freight & handling'],
                      ].map(([a, b]) => (
                        <div className="consider-row" key={a}>
                          <span>
                            <Check size={14} />
                          </span>
                          <div>
                            <b>{a}</b>
                            <small>{b}</small>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="copilot-note">
                      <ShieldCheck size={19} />
                      <b>Human-in-the-loop decision support</b>
                      <p>
                        Discount recommendations and route schedules assist dispatch managers. Validate final consignments against local handling and buyer acceptance before dispatch.
                      </p>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}

          <footer>
            <div>
              <img src="/agronex-mark.png" alt="AgroNex Mark" />
              <span>
                <b>AgroNex</b> · Intelligent Perishable Produce Distribution System
              </span>
            </div>
            <span>
              Regional Supply Network <i /> Grounded in deterministic constraints
            </span>
          </footer>
        </div>
      </main>

      {/* Upload CSV Modal */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload Supply Network Data</h3>
              <button onClick={() => setShowUploadModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="upload-format-note"><b>One file for the whole network</b><p>Upload a consolidated CSV containing batch, destination demand, selling price, travel time, transport cost, capacity, and handling-time columns. All three data groups are validated and updated together.</p></div>

              <label className="upload-dropzone">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <FileUp size={24} />
                <b>Choose a CSV file to upload</b>
                <p>Or paste CSV content directly into the editor below</p>
              </label>

              <textarea
                className="csv-textarea"
                value={uploadCsvText}
                onChange={e => setUploadCsvText(e.target.value)}
                placeholder={'Paste the consolidated AgroNex CSV here...'}
              />
            </div>

            <div className="modal-foot">
              <a href="/agronex-demo-template.csv" download>
                <Download size={13} /> Download consolidated CSV template
              </a>

              <div className="modal-actions">
                <button className="btn btn-light" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={submitCsvUpload}
                  disabled={uploading || !uploadCsvText.trim()}
                >
                  <Upload size={14} /> {uploading ? 'Validating…' : 'Import & Replan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  foot: string;
  tone: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-foot">{foot}</span>
    </div>
  );
}

function AllocationTable({ plan, detailed = false }: { plan?: Plan; detailed?: boolean }) {
  const allocations = plan?.allocations || [];
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Batch / Produce</th>
            <th>Destination Hub</th>
            <th>Dispatched Quantity</th>
            <th>Transit Arrival</th>
            <th>Net Sales Value</th>
            {detailed && <th>Route Feasibility & Scarcity Reason</th>}
          </tr>
        </thead>
        <tbody>
          {allocations.slice(0, detailed ? 100 : 5).map((a: any, i: number) => (
            <tr key={`${a.batch_id}-${a.destination_id}-${i}`}>
              <td>
                <b className="batch-code">{a.batch_id}</b>
                <span className="subcell">{a.commodity} · from {a.origin_id}</span>
              </td>
              <td>
                <div className="destination-cell">
                  <MapPin size={14} />
                  <span>{a.destination_name}</span>
                </div>
              </td>
              <td>
                <b>{fmt(a.quantity_kg)} kg</b>
              </td>
              <td>
                <span className="arrival-pill">
                  <Clock3 size={12} />
                  {fmt(a.arrival_time_hours)}h
                </span>
              </td>
              <td>
                <b>{money(a.expected_revenue)}</b>
                <span className="subcell">
                  -{money((a.transport_cost || 0) + (a.handling_cost || 0))} costs
                </span>
              </td>
              {detailed && <td className="reason-cell">{a.reason}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!allocations.length && (
        <div className="empty-chart">No feasible dispatches found under current network constraints.</div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  note,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (n: number) => void;
  note: string;
}) {
  return (
    <div className="slider-control">
      <div className="slider-heading">
        <label>{label}</label>
        <b>
          {value > 0 ? '+' : ''}
          {value}
          {suffix}
        </b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <div className="slider-limits">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
      <p>{note}</p>
    </div>
  );
}

export default App;
