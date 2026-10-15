import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, Boxes,
  Check, ChevronDown, CircleHelp, Clock3, Download, FileUp, Languages, Leaf, MapPin,
  Menu, Package, Play, RefreshCw, Route, Search, Send, ShieldCheck, Sparkles,
  Sprout, TrendingUp, Truck, Upload, Warehouse, X
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Language,
  DICTIONARY,
  COPILOT_SUGGESTIONS,
  CONSTRAINTS_LIST,
  getStoredLanguage,
  setStoredLanguage,
  tCommodity,
  tLocation,
  tReason,
  tScenarioName,
  tScenarioTagline,
  tScenarioDesc,
  formatTimeAgo,
  formatMoney,
  formatNumber,
} from './i18n';

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

function App() {
  const [lang, setLang] = useState<Language>(getStoredLanguage);
  const t = DICTIONARY[lang];

  const changeLanguage = (newLang: Language) => {
    setLang(newLang);
    setStoredLanguage(newLang);
  };

  const [data, setData] = useState<Data | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [dataStatus, setDataStatus] = useState<DataSourceStatus | null>(null);
  const [page, setPage] = useState<'Overview' | 'Inventory' | 'Distribution plan' | 'Scenario lab' | 'AI copilot'>('Overview');
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
  const [uploadEntity] = useState<'inventory' | 'destinations' | 'transport' | 'combined'>('combined');
  const [uploadCsvText, setUploadCsvText] = useState('');
  const [uploading, setUploading] = useState(false);

  const money = (n: number) => formatMoney(n);
  const fmt = (n: number) => formatNumber(n);

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
  const m = metrics || ({} as any);

  const filtered = useMemo(() => inventory.filter(b => {
    const commHi = tCommodity(b.commodity, 'hi');
    const locHi = tLocation(b.origin_id, 'hi');
    const matchesQuery = `${b.batch_id} ${b.commodity} ${commHi} ${b.origin_id} ${locHi}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter =
      filter === 'All batches' ||
      filter === t.filter_all ||
      ((filter === 'At risk' || filter === 'At risk (≤12h)' || filter === t.filter_at_risk) && b.remaining_shelf_life_hours <= 12) ||
      ((filter === 'Fresh' || filter === 'Fresh (>24h)' || filter === t.filter_fresh) && b.remaining_shelf_life_hours > 24);
    return matchesQuery && matchesFilter;
  }), [inventory, query, filter, t]);

  const chartData = useMemo(() => {
    if (!plan) return [];
    const b = plan.baseline.metrics;
    const o = plan.optimized.metrics;
    return [
      { label: t.chart_label_delivered, baseline: b.delivered_kg, optimized: o.delivered_kg },
      { label: t.chart_label_spoilage, baseline: b.spoiled_kg, optimized: o.spoiled_kg },
      { label: t.chart_label_unmet_demand, baseline: b.unmet_demand_kg, optimized: o.unmet_demand_kg },
      { label: t.chart_label_unused_capacity, baseline: b.unused_capacity_kg, optimized: o.unused_capacity_kg },
    ];
  }, [plan, t]);

  const nav = [
    { key: 'Overview' as const, label: t.nav_overview, icon: BarChart3 },
    { key: 'Inventory' as const, label: t.nav_inventory, icon: Boxes },
    { key: 'Distribution plan' as const, label: t.nav_plan, icon: Route },
    { key: 'Scenario lab' as const, label: t.nav_scenario, icon: Activity },
    { key: 'AI copilot' as const, label: t.nav_copilot, icon: Sparkles },
  ];

  const runOptimize = async () => {
    try {
      const p = await request('/api/optimize', {});
      setPlan(p);
      notify(t.toast_recalculated);
    } catch (e: any) {
      notify(e.message);
    }
  };

  const handleRefreshPrices = async () => {
    try {
      const res = await request('/api/data/refresh-prices', { simulate_failure: false });
      notify(lang === 'hi' ? `मंडी भाव अपडेट किए गए (${res.status.toUpperCase()})` : `Market prices updated (${res.status.toUpperCase()})`);
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
      notify(lang === 'hi' ? `मार्ग एवं यातायात स्थिति अपडेट की गई (${res.status.toUpperCase()})` : `Route & traffic conditions updated (${res.status.toUpperCase()})`);
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
      notify(t.toast_enter_csv);
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
      notify(t.toast_imported);
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
      notify(t.toast_custom_sim);
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
      const displayName = tScenarioName(scenId, res.scenario_name, lang);
      notify(lang === 'hi' ? `परिदृश्य निष्पादित: ${displayName}` : `Executed scenario: ${displayName}`);
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
      const isUrgent = /(spoil|expire|go bad|freshness|which (vegetable|produce|batch)|at risk|खराब|समाप्त|जोखिम|ताज़गी|सब्जी|फसल|बैच)/i.test(lower);
      if (isUrgent && inventory.length) {
        const urgent = [...inventory].sort((a, b) => a.remaining_shelf_life_hours - b.remaining_shelf_life_hours)[0];
        const feasible = (data?.transport || []).some(
          r => r.origin_id === urgent.origin_id && (r.travel_time_hours + urgent.handling_time_hours) < urgent.remaining_shelf_life_hours
        );
        if (lang === 'hi') {
          const commName = tCommodity(urgent.commodity, 'hi');
          const originName = tLocation(urgent.origin_id, 'hi');
          setAnswer(
            `${commName} (${urgent.batch_id}) वर्तमान में सबसे संवेदनशील बैच है, जिसकी केवल ${fmt(urgent.remaining_shelf_life_hours)} घंटे की शेल्फ़ लाइफ शेष है और स्टॉक में ${fmt(urgent.quantity_kg)} किग्रा उपलब्ध है (स्रोत: ${originName})। ` +
            (feasible
              ? 'इसके स्रोत से कम से कम एक ऐसा मार्ग उपलब्ध है जो समय सीमा से पूर्व सुरक्षित डिलीवरी व हैंडलिंग सुनिश्चित करता है; वितरण योजना में गंतव्य मांग और वाहन क्षमता की पुष्टि करें।'
              : 'इसके स्रोत से ऐसा कोई सीधा मार्ग नहीं मिला जो शेल्फ़ लाइफ समाप्त होने से पहले डिलीवरी पूरी कर सके। वैकल्पिक मार्गों या स्थानीय रियायती क्लीयरेंस की जांच करें।') +
            ' यह मूल्यांकन वर्तमान इन्वेंट्री स्नैपशॉट पर आधारित है; यह प्राथमिकता रैंकिंग है, खराबी की निश्चित गारंटी नहीं।'
          );
        } else {
          setAnswer(
            `${urgent.commodity} (${urgent.batch_id}) is currently the most urgent batch, with ${fmt(urgent.remaining_shelf_life_hours)} hours of shelf life remaining and ${fmt(urgent.quantity_kg)} kg in stock. ` +
            (feasible
              ? 'At least one route from its origin appears to allow arrival and handling before expiry; confirm destination demand and capacity in the distribution plan.'
              : 'No route from its origin was found that clearly completes transit and handling before expiry. Check alternate routes or local clearance options.') +
            ' This assessment uses the current inventory snapshot; it is a risk ranking, not a guarantee of spoilage.'
          );
        }
      } else if (/(route scarcity|scarcity reservation|मार्ग-कमी|आरक्षण|सड़न|बर्बादी)/i.test(lower)) {
        if (lang === 'hi') {
          setAnswer(
            'मार्ग-कमी आरक्षण (Route Scarcity Reservation) एग्रोनेक्स का एक प्रमुख सुरक्षा तंत्र है। जब परिवहन क्षमता सीमित होती है, तो यह तकनीक तेज़ व सीधे ट्रांजिट कॉरिडोरों को सबसे कम शेल्फ़-लाइफ वाले संवेदनशील बैचों (जैसे पालक, स्ट्रॉबेरी) के लिए सुरक्षित रखती है, ताकि लंबी शेल्फ़-लाइफ वाली वस्तुएं (जैसे आलू, सेब) उन्हें ब्लॉक न करें। इससे सड़न और आर्थिक नुकसान में भारी कमी आती है।'
          );
        } else {
          setAnswer(
            'Route scarcity reservation prioritizes high-perishability batches on constrained transit corridors. By reserving fast corridors for fragile produce with short remaining shelf life, longer-shelf-life goods are prevented from exhausting available vehicle capacity, drastically cutting modeled spoilage.'
          );
        }
      } else if (/(baseline|comparison|तुलना|अंतर|बेसलाइन)/i.test(lower)) {
        if (lang === 'hi') {
          setAnswer(
            'बेसलाइन योजना एक साधारण निकटतम-व्यवहार्य नियम का उपयोग करती है, जो बिना वित्तीय मार्जिन या शेल्फ़-लाइफ की गंभीरता को समझे पहले उपलब्ध गंतव्य को माल भेज देती है। इसके विपरीत, एग्रोनेक्स अनुकूलक शेल्फ़ लाइफ, डिलीवरी विंडो, भाड़ा व हैंडलिंग लागत काटकर शुद्ध लाभ को अधिकतम करता है, जिससे न्यूनतम खराबी और अधिकतम राजस्व प्राप्त होता है।'
          );
        } else {
          setAnswer(
            'The baseline heuristic dispatches produce using nearest-feasible assignment without price optimization or perishability ranking. AgroNex optimizer explicitly models physical constraints (shelf life, delivery windows, truck capacity) and maximizes net captured margin after freight and handling costs.'
          );
        }
      } else if (/(discount|markdown|छूट|क्लीयरेंस)/i.test(lower)) {
        if (lang === 'hi') {
          setAnswer(
            'जब सामान्य आवंटन के बाद भी नाशवान उपज बच जाती है, तो एग्रोनेक्स आपात-आधारित छूट इंजन (<6 घंटे: 30%, 6-12 घंटे: 20%, 12-24 घंटे: 10%) लागू करता है। यह उपज को फेंकने या सड़ने से बचाकर आंशिक राजस्व वसूलने की सिफारिश करता है। ये सिफारिशें हैं, अंतिम पुष्टि बिक्री नहीं।'
          );
        } else {
          setAnswer(
            'The urgency-tiered discount engine suggests markdowns (<6h: 30%, 6-12h: 20%, 12-24h: 10%) exclusively for perishable batches that cannot be sold through normal feasible allocations within the 24-hour horizon. These recommendations help prevent total produce loss.'
          );
        }
      } else {
        const r = await request('/api/explain', { question: q, plan: plan?.optimized });
        const defaultFallback = lang === 'hi' ? 'प्लानर ने कोई स्पष्टीकरण नहीं लौटाया। डेटा रीफ्रेश करके पुनः प्रयास करें।' : 'The planner returned no explanation. Try refreshing the data and asking again.';
        const sourceNotice = lang === 'hi' ? 'स्रोत: सत्यापित नेटवर्क डेटा विश्लेषण।' : `Source: ${r.mode || 'AgroNex fallback'}. Analysis derived from available network data.`;
        setAnswer(`${r.answer || defaultFallback}\n\n${sourceNotice}`);
      }
    } catch (e: any) {
      setAnswer(
        lang === 'hi'
          ? `स्पष्टीकरण सेवा तक पहुंचने में असमर्थ (${e.message})। कृपया डेटा रीफ्रेश करें। आप इन्वेंट्री में सबसे कम शेल्फ़-लाइफ वाले बैच देख सकते हैं।`
          : `I couldn't reach the explanation service (${e.message}). Try refreshing the data. You can still review the shortest-shelf-life batches in Inventory.`
      );
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
    notify(t.toast_exported);
  };

  const overallStatus = dataStatus?.overall_status || 'cached';
  const statusLabel =
    overallStatus === 'live' ? t.status_live :
    overallStatus === 'uploaded' ? t.status_uploaded :
    overallStatus === 'stale' ? t.status_stale : t.status_cached;

  const pageTitle =
    page === 'Distribution plan' ? t.title_plan :
    page === 'Scenario lab' ? t.title_scenario :
    page === 'AI copilot' ? t.title_copilot :
    page === 'Inventory' ? t.title_inventory :
    t.title_overview;

  const pageDescription =
    page === 'Overview' ? t.desc_overview :
    page === 'Inventory' ? t.desc_inventory :
    page === 'Distribution plan' ? t.desc_plan :
    page === 'Scenario lab' ? t.desc_scenario :
    t.desc_copilot;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand">
          <img src="/agronex-mark.png" alt="AgroNex Logo" />
          <div>
            <strong>Agro<span>Nex</span></strong>
            <small>{t.brand_sub}</small>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <X size={17} />
          </button>
        </div>

        <div className="workspace-wrap">
          <button className="workspace" type="button" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen(v => !v)}>
            <div className="workspace-icon"><Sprout size={18} /></div>
            <div><b>{t.workspace_name}</b><small>{t.workspace_active}</small></div>
            <ChevronDown size={15} style={{ transform: workspaceOpen ? 'rotate(180deg)' : undefined, transition: 'transform .18s' }} />
          </button>
          {workspaceOpen && <div className="workspace-menu">
            <button type="button" onClick={() => { setPage('Overview'); setWorkspaceOpen(false); }}>{t.workspace_name} <small>{t.ws_current}</small></button>
            <button type="button" onClick={() => { setPage('Inventory'); setWorkspaceOpen(false); }}>{t.title_inventory} <small>{t.ws_inv_desc}</small></button>
            <button type="button" onClick={() => { setPage('Distribution plan'); setWorkspaceOpen(false); }}>{t.title_plan} <small>{t.ws_plan_desc}</small></button>
          </div>}
        </div>

        {/* Language Selection in Sidebar */}
        <div className="sidebar-lang-box">
          <div className="sidebar-lang-label">
            <Languages size={13} />
            <span>{lang === 'en' ? 'Language' : 'भाषा'}</span>
          </div>
          <div className="sidebar-lang-toggle">
            <button
              type="button"
              className={`sidebar-lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => changeLanguage('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`sidebar-lang-btn ${lang === 'hi' ? 'active' : ''}`}
              onClick={() => changeLanguage('hi')}
            >
              हिन्दी
            </button>
          </div>
        </div>

        <div className="nav-label">{t.workspace_label}</div>
        <nav>
          {nav.map(n => (
            <button
              key={n.key}
              className={`nav-link ${page === n.key ? 'selected' : ''}`}
              onClick={() => { setPage(n.key); setMobileNav(false); }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.key === 'Scenario lab' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <b>{t.help_title}</b>
            <p>{t.help_desc}</p>
            <button onClick={() => setPage('AI copilot')}>
              {t.ask_agronex} <ArrowRight size={14} />
            </button>
          </div>

          <div className="profile-wrap">
            <button className="profile" type="button" onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}>
              <div className="avatar">AN</div><div><b>{t.profile_title}</b><small>{t.ops_hub}</small></div><span className="online-dot" />
            </button>
            {profileOpen && <div className="workspace-menu profile-menu">
              <button type="button" onClick={() => { setPage('Overview'); setProfileOpen(false); }}>{t.menu_dash_overview}<small>{t.menu_dash_sub}</small></button>
              <button type="button" onClick={() => { setShowUploadModal(true); setProfileOpen(false); }}>{t.menu_data_settings}<small>{t.menu_data_sub}</small></button>
              <button type="button" onClick={() => { setProfileOpen(false); notify(t.demo_toast); }}>{t.menu_about_ws}<small>{t.menu_about_sub}</small></button>
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
            <button type="button" onClick={() => setPage('Overview')}>{t.crumb_ws}</button> <span>/</span> <b>{pageTitle}</b>
          </div>

          <div className="top-actions">
            {/* Live Data Provider Badge */}
            <button type="button" className={`live-pill status-${overallStatus}`} title="Show data validation details" onClick={() => setStatusOpen(v => !v)} aria-expanded={statusOpen}>
              <span /> {statusLabel}
            </button>
            {statusOpen && <div className="toolbar-popover status-popover"><b>{t.status_modal_title}</b><p>{dataStatus?.organization || 'AgroNex Regional Supply'}</p><p>Inventory: {dataStatus?.providers?.inventory?.status || 'snapshot'} · Prices: {dataStatus?.providers?.prices?.status || 'snapshot'} · Routes: {dataStatus?.providers?.routes?.status || 'snapshot'}</p><small>{lang === 'hi' ? 'अंतिम अपडेट' : 'Last update'}: {dataStatus?.last_updated || 'No timestamp available'}</small></div>}

            {/* Last Updated Timestamp */}
            <div className="last-updated-text" title={`${t.crumb_ws}: ${dataStatus?.last_updated || 'Active'}`}>
              <Clock3 size={13} /> {formatTimeAgo(dataStatus?.last_updated, lang)}
            </div>

            {/* Language Switcher */}
            <div className="lang-switcher" role="group" aria-label="Language selection">
              <span className="lang-icon" title={lang === 'en' ? 'Language: English' : 'भाषा: हिन्दी'}>
                <Languages size={14} />
              </span>
              <button
                type="button"
                className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguage('en')}
                title="Switch to English"
              >
                EN
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === 'hi' ? 'active' : ''}`}
                onClick={() => changeLanguage('hi')}
                title="हिन्दी में बदलें"
              >
                हिन्दी
              </button>
            </div>

            {/* Quick Action: Upload Data */}
            <button
              className="action-pill-btn"
              title={t.btn_upload_data}
              onClick={() => setShowUploadModal(true)}
            >
              <Upload size={14} /> {t.btn_upload_data}
            </button>

            {/* Quick Action: Refresh Market Prices */}
            <button
              className="action-pill-btn"
              title={t.btn_prices}
              onClick={handleRefreshPrices}
            >
              <TrendingUp size={14} /> {t.btn_prices}
            </button>

            {/* Quick Action: Refresh Routes */}
            <button
              className="action-pill-btn"
              title={t.btn_routes}
              onClick={handleRefreshRoutes}
            >
              <Truck size={14} /> {t.btn_routes}
            </button>

            {/* Master Reload */}
            <button className="icon-button" title={t.btn_recalc_plan} onClick={refresh}>
              <RefreshCw size={16} />
            </button>

            <button className="icon-button notification" title={t.ops_alerts} onClick={() => setNotificationsOpen(v => !v)} aria-expanded={notificationsOpen}>
              <Bell size={16} /><i />
            </button>
            {notificationsOpen && <div className="toolbar-popover notification-popover"><b>{t.ops_alerts}</b><p>{lang === 'hi' ? `${inventory.filter(b => b.remaining_shelf_life_hours <= 12).length} बैचों की शेल्फ़ लाइफ 12 घंटे या उससे कम बची है।` : `${inventory.filter(b => b.remaining_shelf_life_hours <= 12).length} batch(es) have 12 hours or less of shelf life.`}</p><button type="button" onClick={() => { setPage('Inventory'); setFilter('At risk'); setNotificationsOpen(false); }}>{t.review_at_risk}</button></div>}
            <button className="user-mini" type="button" title={t.profile_title} onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}>AN</button>
            {profileOpen && <div className="toolbar-popover account-popover"><b>{t.profile_title}</b><p>{t.workspace_name}</p><button type="button" onClick={() => { setPage('Overview'); setProfileOpen(false); }}>{t.menu_dash_overview}</button></div>}
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> {t.eyebrow}
              </div>
              <h1>{pageTitle}<span className="heading-period">.</span></h1>
              <p>{pageDescription}</p>
            </div>
            <div className="heading-actions">
              <button className="btn btn-light" onClick={() => setShowUploadModal(true)}>
                <Upload size={16} /> {t.btn_upload_data}
              </button>
              <button className="btn btn-light" onClick={exportCsv}>
                <Download size={16} /> {t.btn_export_csv}
              </button>
              <button className="btn btn-primary" onClick={runOptimize} disabled={loading}>
                <Sparkles size={16} /> {t.btn_recalc_plan}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <b>{t.backend_notification}</b>
              <span>{error}</span>
              <button onClick={refresh}>{t.btn_retry}</button>
            </div>
          )}

          {loading && !data ? (
            <div className="loading-card">
              <div className="spinner" /> {t.loading_data}
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
                      <b>{t.welcome_overview_title}</b>
                      <p>{t.welcome_overview_desc}</p>
                    </div>
                    <div className="strip-note">
                      <ShieldCheck size={16} /> {t.constraint_first_planning}
                    </div>
                  </div>

                  <div className="section-title">
                    <div>
                      <h2>{t.network_at_glance}</h2>
                      <p>{t.network_glance_sub}</p>
                    </div>
                    <span className="updated">
                      <span /> {t.plan_ready}
                    </span>
                  </div>

                  {/* 4 Primary KPIs */}
                  <div className="kpi-grid">
                    <Metric
                      icon={Package}
                      label={t.kpi_available_inventory}
                      value={`${fmt(m.initial_stock_kg)} ${t.unit_kg}`}
                      foot={lang === 'hi' ? `${inventory.length} ${t.tracked_batches}` : `${inventory.length} tracked batches`}
                      tone="green"
                    />
                    <Metric
                      icon={Truck}
                      label={t.kpi_planned_dispatch}
                      value={`${fmt(m.delivered_kg)} ${t.unit_kg}`}
                      foot={`${fmt(m.demand_fulfillment_percent)}% ${t.demand_fulfillment}`}
                      tone="blue"
                    />
                    <Metric
                      icon={Clock3}
                      label={t.kpi_at_risk_stock}
                      value={`${fmt(m.spoiled_kg)} ${t.unit_kg}`}
                      foot={lang === 'hi' ? `प्रारंभिक स्टॉक का ${fmt(m.spoilage_rate_percent)}%` : `${fmt(m.spoilage_rate_percent)}% of starting stock`}
                      tone="amber"
                    />
                    <Metric
                      icon={BarChart3}
                      label={t.kpi_estimated_net_value}
                      value={money(m.net_revenue)}
                      foot={`${t.gross_prefix} ${money(m.gross_revenue)}`}
                      tone="violet"
                    />
                  </div>

                  {/* Charts & Freshness Watch */}
                  <div className="dashboard-grid">
                    <section className="panel comparison-panel">
                      <div className="panel-heading">
                        <div>
                          <h3>{t.chart_title}</h3>
                          <p>{t.chart_sub}</p>
                        </div>
                        <span className="legend-label">
                          <i />{t.legend_optimized} <i className="legend-gray" />{t.legend_baseline}
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
                              <Area type="monotone" dataKey="optimized" name={lang === 'hi' ? 'एग्रोनेक्स योजना (किग्रा)' : 'AgroNex plan (kg)'} stroke="#287b50" strokeWidth={2.5} fill="url(#greenFill)" />
                              <Area type="monotone" dataKey="baseline" name={lang === 'hi' ? 'बेसलाइन योजना (किग्रा)' : 'Baseline (kg)'} stroke="#aab5ad" strokeWidth={2} strokeDasharray="5 4" fill="transparent" />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="empty-chart">{t.chart_empty}</div>
                        )}
                      </div>
                      <div className="comparison-foot">
                        <div>
                          <span>{t.net_value_change}</span>
                          <b className={Number(plan?.improvement_summary?.net_revenue_change_amount || 0) >= 0 ? 'positive' : 'negative'}>
                            {Number(plan?.improvement_summary?.net_revenue_change_amount || 0) >= 0 ? '+' : ''}
                            {money(plan?.improvement_summary?.net_revenue_change_amount || 0)}
                            <small style={{ display: 'inline', marginLeft: 4, fontWeight: 'normal', color: '#68826f' }}>
                              ({fmt(plan?.improvement_summary?.net_revenue_change_percent || 0)}%)
                            </small>
                          </b>
                        </div>
                        <div>
                          <span>{t.fulfillment_change}</span>
                          <b>
                            {Number(plan?.improvement_summary?.fulfillment_change_percentage_points || 0) >= 0 ? '+' : ''}
                            {fmt(plan?.improvement_summary?.fulfillment_change_percentage_points || 0)} pp
                            <small style={{ display: 'inline', marginLeft: 4, fontWeight: 'normal', color: '#68826f' }}>
                              ({fmt(plan?.improvement_summary?.demand_fulfillment_change_kg || 0)} {t.unit_kg})
                            </small>
                          </b>
                        </div>
                        <div>
                          <span>{t.spoilage_reduction}</span>
                          <b className={Number(plan?.improvement_summary?.spoilage_reduction_kg || 0) >= 0 ? 'positive' : 'negative'}>
                            {fmt(plan?.improvement_summary?.spoilage_reduction_kg || 0)} {t.unit_kg}
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
                          <h3>{t.freshness_watch}</h3>
                          <p>{t.freshness_watch_sub}</p>
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
                                <b>{tCommodity(b.commodity, lang)}</b>
                                <small>{b.batch_id} · {fmt(b.quantity_kg)} {t.unit_kg} · {tLocation(b.origin_id, lang)}</small>
                              </div>
                              <div className="risk-time">
                                <b className={b.remaining_shelf_life_hours <= 12 ? 'warning-text' : ''}>
                                  {fmt(b.remaining_shelf_life_hours)}{t.unit_hours}
                                </b>
                                <small>{t.remaining}</small>
                              </div>
                            </div>
                          ))}
                      </div>
                      <button className="text-link" onClick={() => setPage('Inventory')}>
                        {t.view_all_inventory} <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>

                  {/* Dispatches & AgroNex Insight */}
                  <div className="bottom-grid">
                    <section className="panel allocation-panel">
                      <div className="panel-heading">
                        <div>
                          <h3>{t.recommended_dispatches}</h3>
                          <p>{t.recommended_dispatches_sub}</p>
                        </div>
                        <button className="subtle-button" onClick={() => setPage('Distribution plan')}>
                          {t.full_plan} <ArrowRight size={14} />
                        </button>
                      </div>
                      <AllocationTable plan={plan?.optimized} lang={lang} t={t} />
                    </section>

                    <section className="insight-card">
                      <div className="insight-top">
                        <span className="insight-spark">
                          <Sparkles size={17} />
                        </span>
                        <span>{t.agronex_intel_badge}</span>
                      </div>
                      <h3>{t.insight_title}</h3>
                      <p>
                        {plan?.optimized.discount_recommendations?.length
                          ? (lang === 'hi'
                              ? `${plan.optimized.discount_recommendations.length} बैच सामान्य आवंटन के बाद भी बिना बिके रह गए हैं। उपज खराब होने से पहले आपात-आधारित छूट सुझावों (<6 घंटे: 30%, 6-12 घंटे: 20%, 12-24 घंटे: 10%) की समीक्षा करें।`
                              : `${plan.optimized.discount_recommendations.length} batch(es) remain unsold after feasible allocations. Review urgency-based markdown suggestions (<6h: 30%, 6-12h: 20%, 12-24h: 10%) before produce spoils.`)
                          : (lang === 'hi'
                              ? 'योजना ने उपज आवंटित करने से पहले शेल्फ़ लाइफ, गंतव्य मांग, प्राप्ति विंडो और रूट क्षमता की पुष्टि की है।'
                              : 'The plan has verified shelf life, destination demand, receiving windows, and route capacities before assigning produce.')}
                      </p>
                      <button onClick={() => setPage('AI copilot')}>
                        {t.explore_reasoning} <ArrowRight size={15} />
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
                      <h3>{t.inventory_batches_title}</h3>
                      <p>{inventory.length} {lang === 'hi' ? 'ट्रैक किए गए बैच · सत्यापित शेल्फ़ लाइफ एवं हैंडलिंग लागत' : 'tracked batches · verified shelf life & handling costs'}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-light" onClick={() => setShowUploadModal(true)}>
                        <Upload size={15} /> {t.btn_upload_data}
                      </button>
                      <button className="btn btn-light" onClick={exportCsv}>
                        <Download size={15} /> {t.btn_export_csv}
                      </button>
                    </div>
                  </div>

                  <div className="table-tools">
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t.search_placeholder}
                      />
                    </div>
                    <select value={filter} onChange={e => setFilter(e.target.value)}>
                      <option value="All batches">{t.filter_all}</option>
                      <option value="At risk (≤12h)">{t.filter_at_risk}</option>
                      <option value="Fresh (>24h)">{t.filter_fresh}</option>
                    </select>
                  </div>

                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.th_batch_id}</th>
                          <th>{t.th_commodity}</th>
                          <th>{t.th_quantity}</th>
                          <th>{t.th_shelf_life}</th>
                          <th>{t.th_selling_price}</th>
                          <th>{t.th_origin}</th>
                          <th>{t.th_handling}</th>
                          <th>{t.th_freshness_status}</th>
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
                                {tCommodity(b.commodity, lang)}
                              </div>
                            </td>
                            <td>{fmt(b.quantity_kg)} {t.unit_kg}</td>
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
                                <b>{fmt(b.remaining_shelf_life_hours)}{t.unit_hours}</b>
                              </div>
                            </td>
                            <td>{money(b.selling_price_per_kg)}/{t.unit_kg}</td>
                            <td>{tLocation(b.origin_id, lang)}</td>
                            <td>{money(b.handling_cost_per_kg)}/{t.unit_kg} ({b.handling_time_hours}{t.unit_hours})</td>
                            <td>
                              <span className={`status-tag ${b.remaining_shelf_life_hours <= 6 ? 'status-risk' : b.remaining_shelf_life_hours <= 12 ? 'status-watch' : 'status-ok'}`}>
                                {b.remaining_shelf_life_hours <= 6 ? t.tag_critical : b.remaining_shelf_life_hours <= 12 ? t.tag_at_risk : t.tag_healthy}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filtered.length && <div className="empty-chart">{t.no_batches_match}</div>}
                  </div>
                  <div className="table-note">
                    <ShieldCheck size={15} /> {t.inventory_validation_note}
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
                      label={t.stock_used}
                      value={`${fmt(m.stock_used_kg ?? m.delivered_kg)} ${t.unit_kg}`}
                      foot={lang === 'hi' ? `${fmt(m.demand_fulfillment_percent)}% मांग पूरी` : `${fmt(m.demand_fulfillment_percent)}% demand fulfilled`}
                      tone="green"
                    />
                    <Metric
                      icon={MapPin}
                      label={t.unmet_demand}
                      value={`${fmt(m.unmet_demand_kg)} ${t.unit_kg}`}
                      foot={lang === 'hi' ? `कुल मांग: ${fmt(m.initial_demand_kg)} ${t.unit_kg}` : `Total requested: ${fmt(m.initial_demand_kg)} kg`}
                      tone="amber"
                    />
                    <Metric
                      icon={Warehouse}
                      label={t.unused_capacity}
                      value={`${fmt(m.unused_capacity_kg)} ${t.unit_kg}`}
                      foot={lang === 'hi' ? `${fmt(m.capacity_utilization_percent)}% वाहन बेड़ा प्रयुक्त` : `${fmt(m.capacity_utilization_percent)}% fleet utilized`}
                      tone="blue"
                    />
                    <Metric
                      icon={Clock3}
                      label={t.expired_stock}
                      value={`${fmt(m.expired_stock_kg ?? m.spoiled_kg)} ${t.unit_kg}`}
                      foot={lang === 'hi' ? `ताज़ा अधिशेष: ${fmt(m.fresh_surplus_kg)} ${t.unit_kg}` : `Fresh surplus: ${fmt(m.fresh_surplus_kg)} kg`}
                      tone="violet"
                    />
                  </div>

                  {/* Allocation Table */}
                  <section className="panel allocation-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>{t.explainable_plan_title}</h3>
                        <p>{t.explainable_plan_sub}</p>
                      </div>
                      <button className="btn btn-primary" onClick={runOptimize}>
                        <RefreshCw size={15} /> {t.btn_recalculate}
                      </button>
                    </div>
                    <AllocationTable plan={plan?.optimized} detailed lang={lang} t={t} />
                  </section>

                  {/* Financial Breakdown & Discount Watch */}
                  <div className="two-panels">
                    {/* Financial Cost Components */}
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h3>{t.financial_breakdown_title}</h3>
                          <p>{t.financial_breakdown_sub}</p>
                        </div>
                      </div>
                      <div className="metric-compare">
                        <div>
                          <span>{t.gross_sales_realization}</span>
                          <b>{money(m.gross_revenue)}</b>
                          <small>{t.gross_sales_sub}</small>
                        </div>
                        <div>
                          <span>{t.transport_freight_cost}</span>
                          <b style={{ color: '#c2410c' }}>-{money(m.transport_cost)}</b>
                          <small>{t.transport_freight_sub}</small>
                        </div>
                        <div>
                          <span>{t.handling_sorting_cost}</span>
                          <b style={{ color: '#c2410c' }}>-{money(m.handling_cost)}</b>
                          <small>{t.handling_sorting_sub}</small>
                        </div>
                        <div style={{ background: '#f5faf3', borderRadius: 8, padding: '10px 12px' }}>
                          <span style={{ fontWeight: 700, color: '#1b4d2e' }}>{t.net_operating_realization}</span>
                          <b style={{ fontSize: 15, color: '#1b4d2e' }}>{money(m.net_revenue)}</b>
                          <small>{t.net_operating_sub}</small>
                        </div>
                      </div>
                    </section>

                    {/* Urgency-Tiered Discount Engine */}
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h3>{t.discount_engine_title}</h3>
                          <p>
                            {t.discount_engine_sub}
                            <br />
                            <small style={{ color: '#7e8f82' }}>{t.discount_engine_tiers}</small>
                          </p>
                        </div>
                      </div>

                      {(plan?.optimized.discount_recommendations || []).length ? (
                        plan!.optimized.discount_recommendations.map((d: DiscountRecommendation) => (
                          <div className="discount-row" key={d.batch_id} style={{ alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, paddingRight: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <b>{tCommodity(d.commodity, lang)} ({d.batch_id})</b>
                                <span className={`urgency-badge ${d.remaining_shelf_life_hours < 6 ? 'critical' : d.remaining_shelf_life_hours <= 12 ? 'high' : 'moderate'}`}>
                                  {d.urgency_tier} ({d.discount_percent}%)
                                </span>
                                <span className="recom-tag">{t.recommended_only}</span>
                              </div>
                              <small style={{ color: '#687b6d', lineHeight: 1.5 }}>{d.reason}</small>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ fontSize: 13, color: '#b45309', display: 'block' }}>
                                {money(d.suggested_price_per_kg)}/{t.unit_kg}
                              </strong>
                              <small style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                                {money(d.original_price_per_kg)}/{t.unit_kg}
                              </small>
                              <small style={{ display: 'block', color: '#059669', marginTop: 2 }}>
                                {t.pot_rec} {money(d.potential_discounted_revenue)}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-chart">
                          {t.no_discount_batches}
                        </div>
                      )}
                    </section>
                  </div>

                  {/* Planning Assumptions */}
                  <div className="assumption-box">
                    <ShieldCheck size={18} />
                    <div>
                      <b>{t.verified_assumptions_title}</b>
                      <p>
                        {plan?.optimized.assumptions?.join(' · ')}. {t.baseline_heuristic_note}
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
                      <b>{t.scenario_welcome_title}</b>
                      <p>{t.scenario_welcome_desc}</p>
                    </div>
                  </div>

                  {/* Preset Realistic Scenarios */}
                  <div style={{ marginBottom: 12 }}>
                    <h3 style={{ font: '800 13px Manrope', margin: '0 0 8px', color: '#213a29' }}>
                      {t.realistic_scenarios_title}
                    </h3>
                    <div className="scenario-selector-grid">
                      {scenariosList.map(sc => (
                        <div
                          key={sc.id}
                          className={`scenario-card ${selectedScenarioId === sc.id ? 'active' : ''}`}
                          onClick={() => runPresetScenario(sc.id)}
                        >
                          <div className="scenario-card-head">
                            <span className="scenario-tagline">{tScenarioTagline(sc.id, sc.tagline, lang)}</span>
                            {selectedScenarioId === sc.id && <Check size={14} color="#20643d" />}
                          </div>
                          <h4>{tScenarioName(sc.id, sc.name, lang)}</h4>
                          <p>{tScenarioDesc(sc.id, sc.description, lang)}</p>
                          <div style={{ fontSize: 9, color: '#5b7462', fontWeight: 600 }}>
                            {lang === 'hi' ? (
                              <>मांग: {sc.disruption.demand_change_percent > 0 ? `+${sc.disruption.demand_change_percent}` : sc.disruption.demand_change_percent}% · देरी: +{sc.disruption.travel_delay_hours}घंटे · क्षमता: {sc.disruption.capacity_change_percent > 0 ? `+${sc.disruption.capacity_change_percent}` : sc.disruption.capacity_change_percent}%</>
                            ) : (
                              <>Demand: {sc.disruption.demand_change_percent > 0 ? `+${sc.disruption.demand_change_percent}` : sc.disruption.demand_change_percent}% · Delay: +{sc.disruption.travel_delay_hours}h · Capacity: {sc.disruption.capacity_change_percent > 0 ? `+${sc.disruption.capacity_change_percent}` : sc.disruption.capacity_change_percent}%</>
                            )}
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
                          <h3>{t.custom_controls_title}</h3>
                          <p>{t.custom_controls_sub}</p>
                        </div>
                      </div>

                      <Slider
                        label={t.slider_demand}
                        value={demand}
                        min={-50}
                        max={100}
                        suffix="%"
                        onChange={setDemand}
                        note={t.slider_demand_note}
                      />
                      <Slider
                        label={t.slider_delay}
                        value={delay}
                        min={0}
                        max={12}
                        step={0.5}
                        suffix={lang === 'hi' ? ' घंटे' : ' h'}
                        onChange={setDelay}
                        note={t.slider_delay_note}
                      />
                      <Slider
                        label={t.slider_capacity}
                        value={capacity}
                        min={-75}
                        max={50}
                        suffix="%"
                        onChange={setCapacity}
                        note={t.slider_capacity_note}
                      />

                      <div className="scenario-actions">
                        <button
                          className="btn btn-light"
                          onClick={() => { setDemand(0); setDelay(0); setCapacity(0); setScenario(null); }}
                        >
                          {t.btn_reset}
                        </button>
                        <button className="btn btn-primary" onClick={runScenarioSimulation}>
                          <Play size={15} /> {t.btn_run_sim}
                        </button>
                      </div>
                    </section>

                    {/* Scenario Results */}
                    <section className="panel scenario-results">
                      <div className="panel-heading">
                        <div>
                          <h3>{t.scenario_outcomes_title}</h3>
                          <p>
                            {scenario
                              ? (scenario.scenario_id
                                  ? tScenarioName(scenario.scenario_id, scenario.scenario_name || '', lang)
                                  : (scenario.scenario_name || t.custom_disruption_scenario))
                              : t.select_preset_note}
                          </p>
                        </div>
                        <span className={`status-tag ${scenario ? 'status-ok' : 'status-watch'}`}>
                          {scenario ? t.tag_simulated : t.tag_not_run}
                        </span>
                      </div>

                      {scenario ? (
                        <>
                          <div className="scenario-kpis">
                            <div>
                              <span>{t.net_captured_value}</span>
                              <b>{money(scenario.optimized.metrics.net_revenue)}</b>
                              <small className={Number(scenario.improvement_summary.net_revenue_change_amount) >= 0 ? 'positive' : 'negative'}>
                                {Number(scenario.improvement_summary.net_revenue_change_amount) >= 0 ? '+' : ''}
                                {money(scenario.improvement_summary.net_revenue_change_amount)} {t.vs_baseline} ({fmt(scenario.improvement_summary.net_revenue_change_percent)}%)
                              </small>
                            </div>

                            <div>
                              <span>{t.demand_fulfilled}</span>
                              <b>{fmt(scenario.optimized.metrics.demand_fulfillment_percent)}%</b>
                              <small>
                                {fmt(scenario.optimized.metrics.delivered_kg)} {t.unit_kg} {lang === 'hi' ? `वितरित (${fmt(scenario.improvement_summary.demand_fulfillment_change_kg)} किग्रा बेसलाइन से अधिक)` : `delivered (${fmt(scenario.improvement_summary.demand_fulfillment_change_kg)} kg vs baseline)`}
                              </small>
                            </div>

                            <div>
                              <span>{t.modeled_spoilage}</span>
                              <b style={{ color: scenario.optimized.metrics.spoiled_kg > 0 ? '#b45309' : '#059669' }}>
                                {fmt(scenario.optimized.metrics.spoiled_kg)} {t.unit_kg}
                              </b>
                              <small className="positive">
                                {lang === 'hi'
                                  ? `खराबी में ${fmt(scenario.improvement_summary.spoilage_reduction_kg)} किग्रा (${fmt(scenario.improvement_summary.spoilage_reduction_percent)}%) की कमी`
                                  : `Spoilage reduced by ${fmt(scenario.improvement_summary.spoilage_reduction_kg)} kg (${fmt(scenario.improvement_summary.spoilage_reduction_percent)}%)`}
                              </small>
                            </div>

                            <div>
                              <span>{t.unused_fleet_capacity}</span>
                              <b>{fmt(scenario.optimized.metrics.unused_capacity_kg)} {t.unit_kg}</b>
                              <small>
                                {fmt(scenario.optimized.metrics.capacity_utilization_percent)}% {lang === 'hi' ? `वाहन उपयोग (${scenario.optimized.metrics.constraint_violations} उल्लंघन)` : `fleet utilization (${scenario.optimized.metrics.constraint_violations} violations)`}
                              </small>
                            </div>
                          </div>

                          {/* Cost Breakdown */}
                          <div className="cost-breakdown-grid">
                            <div className="cost-breakdown-item">
                              <span>{t.cost_transport_freight}</span>
                              <b>{money(scenario.optimized.metrics.transport_cost)}</b>
                            </div>
                            <div className="cost-breakdown-item">
                              <span>{t.cost_handling}</span>
                              <b>{money(scenario.optimized.metrics.handling_cost)}</b>
                            </div>
                            <div className="cost-breakdown-item">
                              <span>{t.cost_unmet_demand}</span>
                              <b>{fmt(scenario.optimized.metrics.unmet_demand_kg)} {t.unit_kg}</b>
                            </div>
                          </div>

                          {/* Assumptions */}
                          <div className="assumption-box" style={{ marginTop: 12 }}>
                            <Activity size={18} />
                            <div>
                              <b>{t.scenario_assumptions_title}</b>
                              <p>
                                {scenario.scenario_assumptions
                                  ? scenario.scenario_assumptions.join(' · ')
                                  : (lang === 'hi'
                                      ? `मांग ${demand > 0 ? '+' : ''}${demand}%, देरी +${delay}घंटे, क्षमता ${capacity > 0 ? '+' : ''}${capacity}%। सख्त शेल्फ़ लाइफ सीमाएं लागू।`
                                      : `Demand ${demand > 0 ? '+' : ''}${demand}%, delay +${delay}h, capacity ${capacity > 0 ? '+' : ''}${capacity}%. Strict shelf life limits applied.`)}
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="scenario-empty">
                          <Activity size={32} />
                          <b>{t.awaiting_scenario_title}</b>
                          <p>{t.awaiting_scenario_desc}</p>
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
                        <h3>{t.copilot_main_title}</h3>
                        <p>{t.copilot_main_sub}</p>
                      </div>
                      <span className="status-tag status-ok">{t.tag_operational}</span>
                    </div>

                    <div className="chat-welcome">
                      <div className="chat-spark">
                        <Sparkles size={20} />
                      </div>
                      <h2>{t.copilot_welcome_heading}</h2>
                      <p>{t.copilot_welcome_desc}</p>
                    </div>

                    <div className="suggested-questions">
                      {COPILOT_SUGGESTIONS.map(s => {
                        const qText = lang === 'hi' ? s.hi : s.en;
                        return (
                          <button key={s.en} onClick={() => ask(qText)}>
                            {qText}
                            <ArrowUpRight size={14} />
                          </button>
                        );
                      })}
                    </div>

                    {answer && (
                      <div className="answer-box">
                        <div className="answer-heading">
                          <Sparkles size={15} /> {t.operational_audit_heading}
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
                        placeholder={t.copilot_input_placeholder}
                      />
                      <button className="send-button" disabled={asking || !question.trim()}>
                        <Send size={16} />
                      </button>
                    </form>

                    <div className="copilot-disclaimer">
                      {asking ? t.analyzing_plan : t.copilot_disclaimer}
                    </div>
                  </section>

                  <section className="copilot-side">
                    <div className="panel">
                      <div className="panel-heading">
                        <div>
                          <h3>{t.hard_constraints_title}</h3>
                          <p>{t.hard_constraints_sub}</p>
                        </div>
                      </div>
                      {CONSTRAINTS_LIST.map(c => (
                        <div className="consider-row" key={c.nameEn}>
                          <span>
                            <Check size={14} />
                          </span>
                          <div>
                            <b>{lang === 'hi' ? c.nameHi : c.nameEn}</b>
                            <small>{lang === 'hi' ? c.descHi : c.descEn}</small>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="copilot-note">
                      <ShieldCheck size={19} />
                      <b>{t.human_support_title}</b>
                      <p>{t.human_support_desc}</p>
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
                <b>AgroNex</b> · {t.footer_tagline}
              </span>
            </div>
            <span>
              {t.footer_sub}
            </span>
          </footer>
        </div>
      </main>

      {/* Upload CSV Modal */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t.modal_upload_title}</h3>
              <button onClick={() => setShowUploadModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="upload-format-note">
                <b>{t.modal_format_title}</b>
                <p>{t.modal_format_desc}</p>
              </div>

              <label className="upload-dropzone">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <FileUp size={24} />
                <b>{t.modal_dropzone_title}</b>
                <p>{t.modal_dropzone_sub}</p>
              </label>

              <textarea
                className="csv-textarea"
                value={uploadCsvText}
                onChange={e => setUploadCsvText(e.target.value)}
                placeholder={t.modal_textarea_placeholder}
              />
            </div>

            <div className="modal-foot">
              <a href="/agronex-demo-template.csv" download>
                <Download size={13} /> {t.modal_download_template}
              </a>

              <div className="modal-actions">
                <button className="btn btn-light" onClick={() => setShowUploadModal(false)}>
                  {t.btn_cancel}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={submitCsvUpload}
                  disabled={uploading || !uploadCsvText.trim()}
                >
                  <Upload size={14} /> {uploading ? t.btn_validating : t.btn_import_replan}
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

function AllocationTable({
  plan,
  detailed = false,
  lang = 'en',
  t,
}: {
  plan?: Plan;
  detailed?: boolean;
  lang?: Language;
  t: typeof DICTIONARY['en'];
}) {
  const allocations = plan?.allocations || [];
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t.th_batch_produce}</th>
            <th>{t.th_destination_hub}</th>
            <th>{t.th_dispatched_qty}</th>
            <th>{t.th_transit_arrival}</th>
            <th>{t.th_net_sales_value}</th>
            {detailed && <th>{t.th_feasibility_reason}</th>}
          </tr>
        </thead>
        <tbody>
          {allocations.slice(0, detailed ? 100 : 5).map((a: any, i: number) => (
            <tr key={`${a.batch_id}-${a.destination_id}-${i}`}>
              <td>
                <b className="batch-code">{a.batch_id}</b>
                <span className="subcell">
                  {tCommodity(a.commodity, lang)} · {lang === 'hi' ? 'स्रोत: ' : 'from '}
                  {tLocation(a.origin_id, lang)}
                </span>
              </td>
              <td>
                <div className="destination-cell">
                  <MapPin size={14} />
                  <span>{tLocation(a.destination_name, lang)}</span>
                </div>
              </td>
              <td>
                <b>{formatNumber(a.quantity_kg)} {t.unit_kg}</b>
              </td>
              <td>
                <span className="arrival-pill">
                  <Clock3 size={12} />
                  {formatNumber(a.arrival_time_hours)}{t.unit_hours}
                </span>
              </td>
              <td>
                <b>{formatMoney(a.expected_revenue)}</b>
                <span className="subcell">
                  -{formatMoney((a.transport_cost || 0) + (a.handling_cost || 0))} {lang === 'hi' ? 'लागत' : 'costs'}
                </span>
              </td>
              {detailed && <td className="reason-cell">{tReason(a.reason, lang)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!allocations.length && (
        <div className="empty-chart">{t.no_dispatches_found}</div>
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
