export type Language = 'en' | 'hi';

export const COMMODITY_NAMES: Record<string, { en: string; hi: string }> = {
  Tomatoes: { en: 'Tomatoes', hi: 'टमाटर' },
  Tomato: { en: 'Tomato', hi: 'टमाटर' },
  Bananas: { en: 'Bananas', hi: 'केले' },
  Banana: { en: 'Banana', hi: 'केला' },
  Spinach: { en: 'Spinach', hi: 'पालक' },
  Palak: { en: 'Spinach', hi: 'पालक' },
  Mangoes: { en: 'Mangoes', hi: 'आम' },
  Mango: { en: 'Mango', hi: 'आम' },
  Apples: { en: 'Apples', hi: 'सेब' },
  Apple: { en: 'Apple', hi: 'सेब' },
  Potatoes: { en: 'Potatoes', hi: 'आलू' },
  Potato: { en: 'Potato', hi: 'आलू' },
  Onions: { en: 'Onions', hi: 'प्याज' },
  Onion: { en: 'Onion', hi: 'प्याज' },
  Carrots: { en: 'Carrots', hi: 'गाजर' },
  Carrot: { en: 'Carrot', hi: 'गाजर' },
  Milk: { en: 'Fresh Milk', hi: 'ताज़ा दूध' },
  Paneer: { en: 'Paneer', hi: 'पनीर' },
  Grapes: { en: 'Grapes', hi: 'अंगूर' },
  Strawberries: { en: 'Strawberries', hi: 'स्ट्रॉबेरी' },
  Strawberry: { en: 'Strawberry', hi: 'स्ट्रॉबेरी' },
  Papaya: { en: 'Papaya', hi: 'पपीता' },
  Papayas: { en: 'Papayas', hi: 'पपीता' },
  Cauliflower: { en: 'Cauliflower', hi: 'फूलगोभी' },
  Cabbage: { en: 'Cabbage', hi: 'पत्तागोभी' },
  Chilli: { en: 'Green Chilli', hi: 'हरी मिर्च' },
  'Green Chilli': { en: 'Green Chilli', hi: 'हरी मिर्च' },
};

export const LOCATION_NAMES: Record<string, { en: string; hi: string }> = {
  CENTRAL: { en: 'Central Warehouse Hub', hi: 'सेंट्रल वेयरहाउस हब' },
  NORTH: { en: 'North Agro Depot', hi: 'उत्तर कृषि डिपो' },
  SOUTH: { en: 'South Cold Chain Hub', hi: 'दक्षिण कोल्ड-चेन हब' },
  WEST: { en: 'West Regional Hub', hi: 'पश्चिम क्षेत्रीय हब' },
  EAST: { en: 'East Logistics Center', hi: 'पूर्व लॉजिस्टिक्स केंद्र' },
  'Chennai Central Market': { en: 'Chennai Central Market', hi: 'चेन्नई सेंट्रल मार्केट' },
  'Tambaram Fresh Hub': { en: 'Tambaram Fresh Hub', hi: 'ताम्बरम फ्रेश हब' },
  'OMR Retail Cluster': { en: 'OMR Retail Cluster', hi: 'ओएमआर रिटेल क्लस्टर' },
  'Koyambedu Wholesale': { en: 'Koyambedu Wholesale', hi: 'कोयम्बेडु थोक मंडी' },
  'Azadpur Mandi': { en: 'Azadpur Mandi', hi: 'आज़ादपुर मंडी (दिल्ली)' },
  'Vashi APMC': { en: 'Vashi APMC', hi: 'वाशी एपीएमसी (मुंबई)' },
  'Kalyani Hub': { en: 'Kalyani Hub', hi: 'कल्याणी हब (कोलकाता)' },
  'Yeshwanthpur Market': { en: 'Yeshwanthpur Market', hi: 'यशवंतपुर मार्केट (बेंगलुरु)' },
};

export const SCENARIO_TRANSLATIONS: Record<string, { name: { en: string; hi: string }; tagline: { en: string; hi: string }; desc: { en: string; hi: string } }> = {
  standard_operations: {
    name: {
      en: 'Standard Operations (Balanced Network)',
      hi: 'मानक परिचालन (संतुलित नेटवर्क)',
    },
    tagline: {
      en: 'Routine daily distribution with mixed shelf-life commodities',
      hi: 'मिश्रित शेल्फ़-लाइफ उपज के साथ दैनिक नियमित वितरण',
    },
    desc: {
      en: 'Baseline dispatch uses simple nearest-destination heuristic without economic optimization. AgroNex balances perishability and net unit margins across retail and wholesale clusters.',
      hi: 'बेसलाइन प्रेषण बिना आर्थिक अनुकूलन के निकटतम गंतव्य नियम का उपयोग करता है। एग्रोनेक्स खुदरा और थोक क्लस्टरों में शेल्फ़ लाइफ और शुद्ध मार्जिन को संतुलित करता है।',
    },
  },
  corridor_bottleneck: {
    name: {
      en: 'Corridor Bottleneck & Fragile Produce',
      hi: 'कॉरिडोर बाधा और संवेदनशील उपज',
    },
    tagline: {
      en: 'Scarce transport capacity tests route reservation for high-perishability batches',
      hi: 'सीमित परिवहन क्षमता में शीघ्र खराब होने वाले बैचों के लिए रूट आरक्षण',
    },
    desc: {
      en: 'Transport capacity is constrained (-35%) on major corridors. AgroNex reserves scarce feasible routes for the most perishable batches.',
      hi: 'प्रमुख कॉरिडोरों पर परिवहन क्षमता सीमित (-35%) है। एग्रोनेक्स सबसे संवेदनशील उपज के लिए दुर्लभ व्यवहार्य मार्गों को आरक्षित करता है।',
    },
  },
  highway_transit_delay: {
    name: {
      en: 'Severe Transit Delay (Highway Disruption)',
      hi: 'गंभीर पारगमन विलंब (राजमार्ग व्यवधान)',
    },
    tagline: {
      en: 'Unplanned road delays test delivery window and shelf-life feasibility',
      hi: 'सड़क जाम और देरी में डिलीवरी विंडो और शेल्फ़ लाइफ व्यवहार्यता की जांच',
    },
    desc: {
      en: 'A major highway delay adds +3.0 hours to all delivery corridors. AgroNex dynamically re-routes batches to reachable destinations with open receiving windows.',
      hi: 'राजमार्ग पर जाम से सभी कॉरिडोरों में +3.0 घंटे की देरी होती है। एग्रोनेक्स समय पर खुली डिलीवरी विंडो वाले गंतव्यों के लिए तुरंत रूट बदलता है।',
    },
  },
  fleet_capacity_crunch: {
    name: {
      en: 'Fleet Capacity Crunch (-45% Capacity)',
      hi: 'वाहन बेड़ा क्षमता संकट (-45% क्षमता)',
    },
    tagline: {
      en: 'Severe vehicle shortage forces high-margin payload prioritization',
      hi: 'वाहनों की भारी कमी में उच्च-मार्जिन उपज को प्राथमिकता',
    },
    desc: {
      en: 'A fleet shortage reduces available vehicle payload by 45%. AgroNex maximizes net profit per kg of scarce transport capacity while minimizing spoilage.',
      hi: 'उपलब्ध वाहन पेलोड क्षमता 45% कम हो जाती है। एग्रोनेक्स बर्बादी कम करते हुए सीमित क्षमता से प्रति किग्रा अधिकतम शुद्ध लाभ सुनिश्चित करता है।',
    },
  },
  premium_demand_surge: {
    name: {
      en: 'Premium Cluster Demand Surge (+40% Demand)',
      hi: 'प्रीमियम क्लस्टर मांग उछाल (+40% मांग)',
    },
    tagline: {
      en: 'High demand in premium clusters tests optimal inventory routing',
      hi: 'प्रीमियम बाजारों में उच्च मांग में इष्टतम इन्वेंट्री रूटिंग',
    },
    desc: {
      en: 'Destination demand spikes +40% across urban clusters. AgroNex reallocates stock across destinations to capture maximum net realization.',
      hi: 'शहरी क्लस्टरों में मांग 40% बढ़ जाती है। एग्रोनेक्स परिवहन व हैंडलिंग लागत काटकर अधिकतम शुद्ध मूल्य प्राप्ति के लिए उपज आवंटित करता है।',
    },
  },
};

export const DICTIONARY = {
  en: {
    brand_sub: 'FRESH SUPPLY. SMARTER ROUTES.',
    workspace_label: 'WORKSPACE',
    workspace_name: 'AgroNex Regional Supply',
    workspace_active: 'Active Operations Workspace',
    ws_current: 'Current workspace',
    ws_inv_desc: 'View stock and freshness',
    ws_plan_desc: 'Review dispatch plan',
    nav_overview: 'Overview',
    nav_inventory: 'Inventory',
    nav_plan: 'Distribution plan',
    nav_scenario: 'Scenario lab',
    nav_copilot: 'AI copilot',
    help_title: 'Constraint-grounded planning',
    help_desc: 'Every dispatch assigns produce while verifying shelf life, route capacity, and delivery windows.',
    ask_agronex: 'Ask AgroNex',
    ops_hub: 'Distribution Control Hub',
    profile_title: 'AgroNex Operations',
    menu_dash_overview: 'Dashboard overview',
    menu_dash_sub: 'Return to overview',
    menu_data_settings: 'Data settings',
    menu_data_sub: 'Import supply data',
    menu_about_ws: 'About this workspace',
    menu_about_sub: 'AgroNex operations demo',
    demo_toast: 'AgroNex demo workspace · local session',
    crumb_ws: 'Workspace',
    status_live: 'LIVE FEED',
    status_uploaded: 'UPLOADED DATA',
    status_stale: 'STALE / SNAPSHOT',
    status_cached: 'VALIDATED SNAPSHOT',
    status_modal_title: 'Data validation',
    btn_upload_data: 'Upload Data',
    btn_prices: 'Prices',
    btn_routes: 'Routes',
    btn_export_csv: 'Export CSV',
    btn_recalc_plan: 'Recalculate plan',
    btn_recalculate: 'Recalculate',
    btn_retry: 'Retry',
    loading_data: 'Loading AgroNex planning data…',
    backend_notification: 'Backend notification:',
    ops_alerts: 'Operations alerts',
    review_at_risk: 'Review at-risk inventory',
    eyebrow: 'PERISHABLE SUPPLY CHAIN INTELLIGENCE',
    title_overview: 'Overview',
    title_inventory: 'Inventory operations',
    title_plan: 'Distribution intelligence',
    title_scenario: 'Scenario simulator',
    title_copilot: 'AgroNex copilot',
    desc_overview: 'One clear view of freshness, demand, route capacities, and optimal dispatch.',
    desc_inventory: 'Know what is in stock, what is at risk, and what requires urgent clearance.',
    desc_plan: 'A feasibility-first plan that balances shelf life, demand, route capacity, and net margin.',
    desc_scenario: 'Stress-test the distribution network against disruptions before the real world does.',
    desc_copilot: 'Understand the numbers, constraints, and cost trade-offs behind every recommendation.',
    welcome_overview_title: 'Good decisions keep produce moving.',
    welcome_overview_desc: 'AgroNex compares a transparent baseline heuristic with a shelf-life-aware plan using the same network, transit times, and cost assumptions.',
    constraint_first_planning: 'Constraint-first planning',
    network_at_glance: 'Network at a glance',
    network_glance_sub: 'Active 24-hour planning window · INR financial cost model · Verified constraints',
    plan_ready: 'PLAN READY',
    kpi_available_inventory: 'Available inventory',
    kpi_planned_dispatch: 'Planned dispatch',
    kpi_at_risk_stock: 'At-risk expired stock',
    kpi_estimated_net_value: 'Estimated net value',
    demand_fulfillment: 'demand fulfillment',
    of_starting_stock: 'of starting stock',
    gross_prefix: 'Gross:',
    tracked_batches: 'tracked batches',
    chart_title: 'Plan impact comparison',
    chart_sub: 'Baseline (nearest feasible) vs. AgroNex (scarcity-aware optimizer)',
    legend_optimized: 'Optimized',
    legend_baseline: 'Baseline',
    chart_empty: 'Run the planner to compare outcomes.',
    chart_label_delivered: 'Delivered',
    chart_label_spoilage: 'Spoilage',
    chart_label_unmet_demand: 'Unmet Demand',
    chart_label_unused_capacity: 'Unused Capacity',
    net_value_change: 'Net value change',
    fulfillment_change: 'Fulfillment change',
    spoilage_reduction: 'Spoilage reduction',
    freshness_watch: 'Freshness watch',
    freshness_watch_sub: 'Short-life batches expiring within 24h window',
    remaining: 'remaining',
    view_all_inventory: 'View all inventory',
    recommended_dispatches: 'Recommended dispatches',
    recommended_dispatches_sub: 'Feasible allocations prioritized by route scarcity and net value',
    full_plan: 'Full plan',
    agronex_intel_badge: 'AGRONEX INTELLIGENCE',
    insight_title: 'Make every delivery count.',
    explore_reasoning: 'Explore the reasoning',
    inventory_batches_title: 'Inventory batches',
    search_placeholder: 'Search batch code, commodity, or origin…',
    filter_all: 'All batches',
    filter_at_risk: 'At risk (≤12h)',
    filter_fresh: 'Fresh (>24h)',
    th_batch_id: 'Batch ID',
    th_commodity: 'Commodity',
    th_quantity: 'Quantity',
    th_shelf_life: 'Remaining shelf life',
    th_selling_price: 'Selling price',
    th_origin: 'Origin',
    th_handling: 'Handling cost / time',
    th_freshness_status: 'Freshness status',
    tag_critical: 'Critical (<6h)',
    tag_at_risk: 'At Risk (<12h)',
    tag_healthy: 'Healthy',
    no_batches_match: 'No batches match your filters.',
    inventory_validation_note: 'All inventory inputs are validated for positive weights, positive shelf life, and non-negative pricing.',
    stock_used: 'Stock used',
    unmet_demand: 'Unmet demand',
    unused_capacity: 'Unused route capacity',
    expired_stock: 'Expired / spoiled stock',
    fresh_surplus: 'Fresh surplus',
    explainable_plan_title: 'Explainable allocation plan',
    explainable_plan_sub: 'Route-scarcity reservation prioritizes fragile produce; full arrival time and feasibility audit included',
    financial_breakdown_title: 'Financial cost breakdown',
    financial_breakdown_sub: 'Explicit accounting of gross revenue and logistics deductions',
    gross_sales_realization: 'Gross Sales Realization',
    gross_sales_sub: 'Sum of (delivered quantity × destination market price)',
    transport_freight_cost: 'Transport Freight Cost',
    transport_freight_sub: 'Allocated proportionally across dispatched corridor weights',
    handling_sorting_cost: 'Handling & Sorting Cost',
    handling_sorting_sub: 'Variable terminal handling cost per kilogram',
    net_operating_realization: 'Net Operating Realization',
    net_operating_sub: 'Gross revenue minus transport freight and handling',
    discount_engine_title: 'Urgency-tiered discount engine',
    discount_engine_sub: 'Clearance markdowns applied only when normal allocation cannot sell stock.',
    discount_engine_tiers: '<6h: 30% · 6–12h: 20% · 12–24h: 10% · Recommendations, not confirmed sales',
    recommended_only: 'RECOMMENDED ONLY',
    pot_rec: 'Pot. rec:',
    no_discount_batches: 'No unsold batches require discount clearance under current demand and capacity conditions.',
    verified_assumptions_title: 'Verified operational assumptions',
    baseline_heuristic_note: 'Baseline uses pure nearest-feasible greed without economic optimization. Optimized plan protects scarce transit corridors for short-life produce.',
    th_batch_produce: 'Batch / Produce',
    th_destination_hub: 'Destination Hub',
    th_dispatched_qty: 'Dispatched Quantity',
    th_transit_arrival: 'Transit Arrival',
    th_net_sales_value: 'Net Sales Value',
    th_feasibility_reason: 'Route Feasibility & Scarcity Reason',
    no_dispatches_found: 'No feasible dispatches found under current network constraints.',
    scenario_welcome_title: 'Plan for the unexpected with realistic scenario stress-tests.',
    scenario_welcome_desc: 'Evaluate network resilience under realistic logistics disruptions (bottlenecks, transit delays, capacity crunches, demand surges). Both baseline and optimized plans rerun on identical changed inputs with visible assumptions.',
    realistic_scenarios_title: 'Realistic operational scenarios',
    custom_controls_title: 'Custom disruption controls',
    custom_controls_sub: 'Directly adjust parameters to test sensitivity',
    slider_demand: 'Destination demand',
    slider_demand_note: 'Demand changes stress-test network capacity and revenue capture.',
    slider_delay: 'Transit corridor delay',
    slider_delay_note: 'Arrival time must strictly satisfy shelf life and receiving windows.',
    slider_capacity: 'Transport capacity',
    slider_capacity_note: 'Capacity shortages highlight the value of route scarcity reservation.',
    btn_reset: 'Reset',
    btn_run_sim: 'Run simulation',
    scenario_outcomes_title: 'Scenario outcomes & impact',
    custom_disruption_scenario: 'Custom disruption scenario',
    select_preset_note: 'Select a preset or adjust sliders and simulate',
    tag_simulated: 'SIMULATED',
    tag_not_run: 'NOT RUN',
    net_captured_value: 'Net captured value',
    vs_baseline: 'vs baseline',
    demand_fulfilled: 'Demand fulfilled',
    modeled_spoilage: 'Modeled spoilage',
    unused_fleet_capacity: 'Unused fleet capacity',
    cost_transport_freight: 'Transport freight cost',
    cost_handling: 'Handling cost',
    cost_unmet_demand: 'Unmet demand',
    scenario_assumptions_title: 'Scenario assumptions & conditions',
    awaiting_scenario_title: 'Awaiting scenario execution',
    awaiting_scenario_desc: 'Click any realistic scenario above or adjust the sliders to benchmark the optimizer against the baseline.',
    copilot_main_title: 'Ask AgroNex Copilot',
    copilot_main_sub: 'Deterministic, constraint-grounded explanations · zero hallucinations',
    tag_operational: 'OPERATIONAL',
    copilot_welcome_heading: 'Make every number transparent.',
    copilot_welcome_desc: 'Ask about batch allocations, route scarcity reservation, spoilage drivers, or urgency-based discount tiers. All answers are grounded in calculated mathematical plan results.',
    operational_audit_heading: 'OPERATIONAL AUDIT & REASONING',
    copilot_input_placeholder: 'Ask about allocations, bottlenecks, or constraints…',
    analyzing_plan: 'Analyzing verified plan outputs…',
    copilot_disclaimer: 'Deterministic explanation grounded in real operational constraints.',
    hard_constraints_title: 'Hard constraints enforced',
    hard_constraints_sub: 'Every dispatch satisfies these physical rules',
    human_support_title: 'Human-in-the-loop decision support',
    human_support_desc: 'Discount recommendations and route schedules assist dispatch managers. Validate final consignments against local handling and buyer acceptance before dispatch.',
    modal_upload_title: 'Upload Supply Network Data',
    modal_format_title: 'One file for the whole network',
    modal_format_desc: 'Upload a consolidated CSV containing batch, destination demand, selling price, travel time, transport cost, capacity, and handling-time columns. All three data groups are validated and updated together.',
    modal_dropzone_title: 'Choose a CSV file to upload',
    modal_dropzone_sub: 'Or paste CSV content directly into the editor below',
    modal_textarea_placeholder: 'Paste the consolidated AgroNex CSV here...',
    modal_download_template: 'Download consolidated CSV template',
    btn_cancel: 'Cancel',
    btn_validating: 'Validating…',
    btn_import_replan: 'Import & Replan',
    footer_tagline: 'Intelligent Perishable Produce Distribution System',
    footer_sub: 'Regional Supply Network · Grounded in deterministic constraints',
    toast_recalculated: 'Distribution plan recalculated with latest network data',
    toast_exported: 'Inventory CSV exported',
    toast_imported: 'Successfully imported consolidated supply network CSV',
    toast_custom_sim: 'Custom scenario simulation completed',
    toast_enter_csv: 'Please enter or select CSV content first',
    switch_lang_tooltip: 'Switch to Hindi / हिन्दी में बदलें',
    lang_current: 'English',
    lang_english: 'English',
    lang_hindi: 'हिन्दी',
    unit_kg: 'kg',
    unit_hours: 'h',
  },
  hi: {
    brand_sub: 'ताज़ा आपूर्ति. स्मार्ट मार्ग.',
    workspace_label: 'कार्यक्षेत्र',
    workspace_name: 'एग्रोनेक्स क्षेत्रीय आपूर्ति',
    workspace_active: 'सक्रिय परिचालन कार्यक्षेत्र',
    ws_current: 'वर्तमान कार्यक्षेत्र',
    ws_inv_desc: 'स्टॉक व ताज़गी देखें',
    ws_plan_desc: 'प्रेषण योजना की समीक्षा करें',
    nav_overview: 'अवलोकन',
    nav_inventory: 'इन्वेंट्री',
    nav_plan: 'वितरण योजना',
    nav_scenario: 'परिदृश्य लैब',
    nav_copilot: 'एआई कोपायलट',
    help_title: 'सीमा-आधारित योजना',
    help_desc: 'प्रत्येक प्रेषण शेल्फ़ लाइफ, मार्ग क्षमता और डिलीवरी विंडो की पुष्टि करते हुए उपज आवंटित करता है।',
    ask_agronex: 'एग्रोनेक्स से पूछें',
    ops_hub: 'वितरण नियंत्रण केंद्र',
    profile_title: 'एग्रोनेक्स ऑपरेशंस',
    menu_dash_overview: 'डैशबोर्ड अवलोकन',
    menu_dash_sub: 'अवलोकन पर वापस जाएं',
    menu_data_settings: 'डेटा सेटिंग्स',
    menu_data_sub: 'सप्लाई डेटा आयात करें',
    menu_about_ws: 'इस कार्यक्षेत्र के बारे में',
    menu_about_sub: 'एग्रोनेक्स ऑपरेशंस डेमो',
    demo_toast: 'एग्रोनेक्स डेमो कार्यक्षेत्र · स्थानीय सत्र',
    crumb_ws: 'कार्यक्षेत्र',
    status_live: 'लाइव फ़ीड',
    status_uploaded: 'अपलोड किया डेटा',
    status_stale: 'पुराना स्नैपशॉट',
    status_cached: 'सत्यापित स्नैपशॉट',
    status_modal_title: 'डेटा सत्यापन',
    btn_upload_data: 'डेटा अपलोड',
    btn_prices: 'मंडी भाव',
    btn_routes: 'मार्ग स्थिति',
    btn_export_csv: 'CSV निर्यात',
    btn_recalc_plan: 'योजना पुनः गणना',
    btn_recalculate: 'पुनः गणना करें',
    btn_retry: 'पुनः प्रयास करें',
    loading_data: 'एग्रोनेक्स योजना डेटा लोड हो रहा है…',
    backend_notification: 'बैकएंड सूचना:',
    ops_alerts: 'परिचालन अलर्ट',
    review_at_risk: 'जोखिम वाले स्टॉक की जांच करें',
    eyebrow: 'शीघ्र खराब होने वाली उपज आपूर्ति श्रृंखला बुद्धिमत्ता',
    title_overview: 'अवलोकन',
    title_inventory: 'इन्वेंट्री संचालन',
    title_plan: 'वितरण बुद्धिमत्ता',
    title_scenario: 'परिदृश्य सिम्युलेटर',
    title_copilot: 'एग्रोनेक्स कोपायलट',
    desc_overview: 'ताज़गी, मांग, मार्ग क्षमता और इष्टतम प्रेषण का एकल स्पष्ट दृश्य।',
    desc_inventory: 'जानें क्या स्टॉक में है, क्या जोखिम में है और किसे तत्काल क्लीयरेंस की आवश्यकता है।',
    desc_plan: 'शेल्फ़ लाइफ, मांग, वाहन क्षमता और शुद्ध मार्जिन को संतुलित करने वाली व्यावहारिक योजना।',
    desc_scenario: 'वास्तविक दुनिया में आने से पहले वितरण नेटवर्क पर व्यवधानों का तनाव-परीक्षण करें।',
    desc_copilot: 'प्रत्येक सिफारिश के पीछे की गणना, बाधाओं और लागत व्यापार-संतुलन को समझें।',
    welcome_overview_title: 'सही निर्णय उपज को ताज़ा और गतिशील बनाए रखते हैं।',
    welcome_overview_desc: 'एग्रोनेक्स एक ही नेटवर्क, पारगमन समय और लागत मान्यताओं का उपयोग करके आधार रेखा और शेल्फ़-लाइफ आधारित योजना की तुलना करता है।',
    constraint_first_planning: 'सीमा-प्राथमिक योजना',
    network_at_glance: 'नेटवर्क एक नज़र में',
    network_glance_sub: 'सक्रिय 24-घंटे योजना विंडो · INR वित्तीय लागत मॉडल · सत्यापित सीमाएं',
    plan_ready: 'योजना तैयार',
    kpi_available_inventory: 'उपलब्ध कुल स्टॉक',
    kpi_planned_dispatch: 'नियोजित प्रेषण',
    kpi_at_risk_stock: 'जोखिम में / समाप्त उपज',
    kpi_estimated_net_value: 'अनुमानित शुद्ध मूल्य',
    demand_fulfillment: 'मांग पूर्ति',
    of_starting_stock: 'प्रारंभिक स्टॉक का',
    gross_prefix: 'सकल:',
    tracked_batches: 'ट्रैक किए गए बैच',
    chart_title: 'योजना प्रभाव तुलना',
    chart_sub: 'बेसलाइन (निकटतम व्यवहार्य) बनाम एग्रोनेक्स (अनुकूलक)',
    legend_optimized: 'अनुकूलित',
    legend_baseline: 'बेसलाइन',
    chart_empty: 'परिणामों की तुलना के लिए प्लानर चलाएं।',
    chart_label_delivered: 'वितरित',
    chart_label_spoilage: 'खराबी',
    chart_label_unmet_demand: 'अधूरी मांग',
    chart_label_unused_capacity: 'अप्रयुक्त क्षमता',
    net_value_change: 'शुद्ध मूल्य परिवर्तन',
    fulfillment_change: 'पूर्ति परिवर्तन',
    spoilage_reduction: 'सड़न / खराबी में कमी',
    freshness_watch: 'ताज़गी निगरानी',
    freshness_watch_sub: '24 घंटे में समाप्त होने वाले कम-शेल्फ़ बैच',
    remaining: 'शेष',
    view_all_inventory: 'पूरी इन्वेंट्री देखें',
    recommended_dispatches: 'अनुशंसित प्रेषण',
    recommended_dispatches_sub: 'रूट उपलब्धता और शुद्ध मूल्य के आधार पर प्राथमिकता-प्राप्त आवंटन',
    full_plan: 'पूर्ण योजना',
    agronex_intel_badge: 'एग्रोनेक्स बुद्धिमत्ता',
    insight_title: 'हर डिलीवरी को मूल्यवान बनाएं।',
    explore_reasoning: 'तर्क और विवरण देखें',
    inventory_batches_title: 'इन्वेंट्री बैच विवरण',
    search_placeholder: 'बैच कोड, फसल या स्रोत खोजें…',
    filter_all: 'सभी बैच',
    filter_at_risk: 'जोखिम में (≤12 घंटे)',
    filter_fresh: 'ताज़ा (>24 घंटे)',
    th_batch_id: 'बैच आईडी',
    th_commodity: 'उपज / फसल',
    th_quantity: 'मात्रा',
    th_shelf_life: 'शेष शेल्फ़ लाइफ',
    th_selling_price: 'बिक्री भाव',
    th_origin: 'उत्पत्ति केंद्र',
    th_handling: 'हैंडलिंग लागत / समय',
    th_freshness_status: 'ताज़गी स्थिति',
    tag_critical: 'गंभीर (<6 घंटे)',
    tag_at_risk: 'जोखिम (<12 घंटे)',
    tag_healthy: 'उत्कृष्ट / ताज़ा',
    no_batches_match: 'फ़िल्टर से मेल खाता कोई बैच नहीं मिला।',
    inventory_validation_note: 'सभी इन्वेंट्री इनपुट सकारात्मक वजन, शेल्फ़ लाइफ और गैर-ऋणात्मक मूल्य निर्धारण के लिए सत्यापित हैं।',
    stock_used: 'उपयोग किया गया स्टॉक',
    unmet_demand: 'अधूरी मांग',
    unused_capacity: 'अप्रयुक्त मार्ग क्षमता',
    expired_stock: 'खराब / समाप्त उपज',
    fresh_surplus: 'ताज़ा अधिशेष',
    explainable_plan_title: 'स्पष्टीकरण-सहित आवंटन योजना',
    explainable_plan_sub: 'मार्ग-कमी आरक्षण नाजुक उपज को प्राथमिकता देता है; संपूर्ण आगमन समय और व्यवहार्यता ऑडिट शामिल है',
    financial_breakdown_title: 'वित्तीय लागत विवरण',
    financial_breakdown_sub: 'सकल राजस्व और लॉजिस्टिक्स कटौती का स्पष्ट विवरण',
    gross_sales_realization: 'सकल बिक्री प्राप्ति',
    gross_sales_sub: 'योग: (वितरित मात्रा × गंतव्य मंडी भाव)',
    transport_freight_cost: 'परिवहन भाड़ा लागत',
    transport_freight_sub: 'प्रेषित कॉरिडोर वजन के अनुसार आनुपातिक रूप से आवंटित',
    handling_sorting_cost: 'हैंडलिंग व छंटाई लागत',
    handling_sorting_sub: 'प्रति किलोग्राम परिवर्तनीय टर्मिनल हैंडलिंग लागत',
    net_operating_realization: 'शुद्ध परिचालन प्राप्ति',
    net_operating_sub: 'सकल राजस्व में से परिवहन भाड़ा और हैंडलिंग घटाकर',
    discount_engine_title: 'आपात-स्तरीय छूट इंजन',
    discount_engine_sub: 'क्लीयरेंस छूट तभी लागू होती है जब सामान्य आवंटन में स्टॉक नहीं बिक पाता।',
    discount_engine_tiers: '<6 घंटे: 30% · 6–12 घंटे: 20% · 12–24 घंटे: 10% · अनुशंसित सुझाव, अंतिम बिक्री नहीं',
    recommended_only: 'केवल अनुशंसित',
    pot_rec: 'संभावित वसूली:',
    no_discount_batches: 'वर्तमान मांग और क्षमता परिस्थितियों में किसी भी बैच को छूट क्लीयरेंस की आवश्यकता नहीं है।',
    verified_assumptions_title: 'सत्यापित परिचालन मान्यताएं',
    baseline_heuristic_note: 'बेसलाइन बिना आर्थिक अनुकूलन के निकटतम-व्यवहार्य आवंटन का उपयोग करती है। अनुकूलित योजना कम-शेल्फ़ उपज के लिए दुर्लभ पारगमन मार्गों की सुरक्षा करती है।',
    th_batch_produce: 'बैच / उपज',
    th_destination_hub: 'गंतव्य केंद्र / मंडी',
    th_dispatched_qty: 'प्रेषित मात्रा',
    th_transit_arrival: 'मार्ग आगमन',
    th_net_sales_value: 'शुद्ध बिक्री मूल्य',
    th_feasibility_reason: 'रूट व्यवहार्यता व कारण',
    no_dispatches_found: 'वर्तमान नेटवर्क बाधाओं के अंतर्गत कोई व्यवहार्य प्रेषण नहीं मिला।',
    scenario_welcome_title: 'अप्रत्याशित चुनौतियों के लिए व्यावहारिक परिदृश्यों से तनाव-परीक्षण करें।',
    scenario_welcome_desc: 'लॉजिस्टिक्स व्यवधानों (बाधाएं, ट्रांजिट देरी, वाहन कमी, मांग वृद्धि) के तहत नेटवर्क लचीलेपन का मूल्यांकन करें। दोनों योजनाएं समान बदले हुए इनपुट पर चलती हैं।',
    realistic_scenarios_title: 'व्यावहारिक परिचालन परिदृश्य',
    custom_controls_title: 'कस्टम व्यवधान नियंत्रण',
    custom_controls_sub: 'संवेदनशीलता जांचने के लिए सीधे पैरामीटर समायोजित करें',
    slider_demand: 'गंतव्य मांग',
    slider_demand_note: 'मांग में बदलाव नेटवर्क क्षमता और राजस्व प्राप्ति का तनाव-परीक्षण करते हैं।',
    slider_delay: 'ट्रांजिट कॉरिडोर देरी',
    slider_delay_note: 'आगमन समय को शेल्फ़ लाइफ और प्राप्ति समय-सीमा का कड़ाई से पालन करना चाहिए।',
    slider_capacity: 'वाहन परिवहन क्षमता',
    slider_capacity_note: 'क्षमता की कमी मार्ग-कमी आरक्षण के महत्व को दर्शाती है।',
    btn_reset: 'रीसेट',
    btn_run_sim: 'सिमुलेशन चलाएं',
    scenario_outcomes_title: 'परिदृश्य परिणाम और प्रभाव',
    custom_disruption_scenario: 'कस्टम व्यवधान परिदृश्य',
    select_preset_note: 'एक पूर्व-निर्धारित परिदृश्य चुनें या स्लाइडर समायोजित कर सिमुलेट करें',
    tag_simulated: 'सिमुलेटेड',
    tag_not_run: 'चलाया नहीं गया',
    net_captured_value: 'प्राप्त शुद्ध मूल्य',
    vs_baseline: 'बेसलाइन से तुलना',
    demand_fulfilled: 'मांग पूरी हुई',
    modeled_spoilage: 'मॉडल की गई खराबी',
    unused_fleet_capacity: 'अप्रयुक्त वाहन क्षमता',
    cost_transport_freight: 'परिवहन भाड़ा लागत',
    cost_handling: 'हैंडलिंग लागत',
    cost_unmet_demand: 'अधूरी मांग',
    scenario_assumptions_title: 'परिदृश्य मान्यताएं एवं स्थितियां',
    awaiting_scenario_title: 'परिदृश्य निष्पादन की प्रतीक्षा',
    awaiting_scenario_desc: 'ऊपर किसी भी परिदृश्य पर क्लिक करें या बेसलाइन के विरुद्ध अनुकूलक को बेंचमार्क करने के लिए स्लाइडर समायोजित करें।',
    copilot_main_title: 'एग्रोनेक्स कोपायलट से पूछें',
    copilot_main_sub: 'सत्यापित, परिचालन सीमाओं पर आधारित सटीक उत्तर · शून्य भ्रांति',
    tag_operational: 'सक्रिय',
    copilot_welcome_heading: 'हर आंकड़े को पारदर्शी और स्पष्ट समझें।',
    copilot_welcome_desc: 'बैच आवंटन, मार्ग-कमी आरक्षण, खराबी के कारणों या आपात-स्तरीय छूट के बारे में पूछें। सभी उत्तर गणितीय योजना परिणामों पर आधारित हैं।',
    operational_audit_heading: 'परिचालन ऑडिट एवं तर्क',
    copilot_input_placeholder: 'आवंटन, बाधाओं या सीमाओं के बारे में पूछें…',
    analyzing_plan: 'सत्यापित योजना परिणामों का विश्लेषण हो रहा है…',
    copilot_disclaimer: 'वास्तविक परिचालन सीमाओं पर आधारित सटीक विवरण।',
    hard_constraints_title: 'लागू की गई कड़ी भौतिक सीमाएं',
    hard_constraints_sub: 'प्रत्येक प्रेषण इन भौतिक नियमों को संतुष्ट करता है',
    human_support_title: 'मानव-निर्देशित निर्णय समर्थन',
    human_support_desc: 'छूट की सिफारिशें और रूट शेड्यूल डिस्पैच प्रबंधकों की सहायता करते हैं। प्रेषण से पहले स्थानीय हैंडलिंग और खरीदार स्वीकृति के विरुद्ध अंतिम कंसाइनमेंट को सत्यापित करें।',
    modal_upload_title: 'आपूर्ति नेटवर्क डेटा अपलोड करें',
    modal_format_title: 'संपूर्ण नेटवर्क के लिए एकल फ़ाइल',
    modal_format_desc: 'बैच, गंतव्य मांग, बिक्री भाव, यात्रा समय, परिवहन लागत, क्षमता और हैंडलिंग-समय कॉलम वाली समेकित CSV अपलोड करें। तीनों डेटा समूह एक साथ सत्यापित और अपडेट होते हैं।',
    modal_dropzone_title: 'अपलोड के लिए CSV फ़ाइल चुनें',
    modal_dropzone_sub: 'या सीधे नीचे संपादक में CSV सामग्री पेस्ट करें',
    modal_textarea_placeholder: 'यहाँ समेकित एग्रोनेक्स CSV पेस्ट करें...',
    modal_download_template: 'समेकित CSV टेम्पलेट डाउनलोड करें',
    btn_cancel: 'रद्द करें',
    btn_validating: 'सत्यापित हो रहा है…',
    btn_import_replan: 'आयात करें और योजना बनाएं',
    footer_tagline: 'बुद्धिमान शीघ्र खराब होने वाली कृषि उपज वितरण प्रणाली',
    footer_sub: 'क्षेत्रीय आपूर्ति नेटवर्क · भौतिक परिचालन सीमाओं पर आधारित',
    toast_recalculated: 'नवीनतम नेटवर्क डेटा के साथ वितरण योजना पुनः परिकलित की गई',
    toast_exported: 'इन्वेंट्री CSV निर्यात की गई',
    toast_imported: 'आपूर्ति नेटवर्क CSV सफलतापूर्वक आयात की गई',
    toast_custom_sim: 'कस्टम परिदृश्य सिमुलेशन पूर्ण हुआ',
    toast_enter_csv: 'कृपया पहले CSV सामग्री दर्ज करें या फ़ाइल चुनें',
    switch_lang_tooltip: 'Switch to English / अंग्रेज़ी में बदलें',
    lang_current: 'हिन्दी',
    lang_english: 'English',
    lang_hindi: 'हिन्दी',
    unit_kg: 'किग्रा',
    unit_hours: 'घंटे',
  },
};

export const COPILOT_SUGGESTIONS = [
  {
    en: 'Why was this fragile batch dispatched first?',
    hi: 'इस शीघ्र खराब होने वाले बैच को सबसे पहले क्यों भेजा गया?',
  },
  {
    en: 'How does route scarcity reservation reduce modeled spoilage?',
    hi: 'मार्ग-कमी आरक्षण से उपज की बर्बादी और खराबी कैसे घटती है?',
  },
  {
    en: 'Explain the baseline vs optimized plan comparison.',
    hi: 'बेसलाइन बनाम अनुकूलित योजना की तुलना और मुख्य अंतर समझाइए।',
  },
  {
    en: 'Which batches require urgency-tiered discount clearance?',
    hi: 'किन बैचों को आपात-स्तरीय छूट पर तत्काल क्लीयरेंस की आवश्यकता है?',
  },
];

export const CONSTRAINTS_LIST = [
  {
    nameEn: 'Remaining shelf life',
    nameHi: 'शेष शेल्फ़ लाइफ',
    descEn: 'Produce must arrive before expiration time allowance',
    descHi: 'उपज समाप्ति समय सीमा से पूर्व गंतव्य पर अवश्य पहुंचे',
  },
  {
    nameEn: 'Delivery receiving window',
    nameHi: 'डिलीवरी प्राप्ति विंडो',
    descEn: 'Transit + handling must not exceed destination window',
    descHi: 'यात्रा + हैंडलिंग समय गंतव्य की प्राप्ति विंडो से अधिक न हो',
  },
  {
    nameEn: 'Destination demand',
    nameHi: 'गंतव्य मांग सीमा',
    descEn: 'Dispatches capped strictly by destination requirement',
    descHi: 'प्रेषण गंतव्य की कुल मांग सीमा तक ही सीमित रहता है',
  },
  {
    nameEn: 'Vehicle route capacity',
    nameHi: 'वाहन मार्ग क्षमता',
    descEn: 'Allocations never exceed available transport payload',
    descHi: 'आवंटन कभी भी उपलब्ध वाहन पेलोड क्षमता से अधिक नहीं होता',
  },
  {
    nameEn: 'Economic net value',
    nameHi: 'आर्थिक शुद्ध लाभ',
    descEn: 'Optimizes destination price net of transport freight & handling',
    descHi: 'भाड़ा और हैंडलिंग काटकर अधिकतम मंडी भाव प्राप्त करता है',
  },
];

export function getStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem('agronex_language');
    if (saved === 'hi' || saved === 'en') return saved;
  } catch {}
  return 'en';
}

export function setStoredLanguage(lang: Language): void {
  try {
    localStorage.setItem('agronex_language', lang);
  } catch {}
}

export function tCommodity(commodity: string, lang: Language): string {
  if (lang !== 'hi') return commodity;
  const match = COMMODITY_NAMES[commodity];
  if (match) return match.hi;
  // Case-insensitive fallback
  const found = Object.keys(COMMODITY_NAMES).find(k => k.toLowerCase() === commodity.toLowerCase());
  return found ? COMMODITY_NAMES[found].hi : commodity;
}

export function tLocation(loc: string, lang: Language): string {
  if (lang !== 'hi') return loc;
  const match = LOCATION_NAMES[loc];
  if (match) return match.hi;
  // Partial match
  const found = Object.keys(LOCATION_NAMES).find(k => loc.toLowerCase().includes(k.toLowerCase()));
  return found ? LOCATION_NAMES[found].hi : loc;
}

export function tScenarioName(id: string, defaultName: string, lang: Language): string {
  if (lang === 'hi' && SCENARIO_TRANSLATIONS[id]) {
    return SCENARIO_TRANSLATIONS[id].name.hi;
  }
  return defaultName;
}

export function tScenarioTagline(id: string, defaultTag: string, lang: Language): string {
  if (lang === 'hi' && SCENARIO_TRANSLATIONS[id]) {
    return SCENARIO_TRANSLATIONS[id].tagline.hi;
  }
  return defaultTag;
}

export function tScenarioDesc(id: string, defaultDesc: string, lang: Language): string {
  if (lang === 'hi' && SCENARIO_TRANSLATIONS[id]) {
    return SCENARIO_TRANSLATIONS[id].desc.hi;
  }
  return defaultDesc;
}

export function tReason(reason: string, lang: Language): string {
  if (lang !== 'hi' || !reason) return reason;
  return reason
    .replace(/Direct origin dispatch/gi, 'सीधा स्रोत प्रेषण')
    .replace(/satisfying destination demand/gi, 'गंतव्य मांग को संतुष्ट करते हुए')
    .replace(/within shelf life/gi, 'शेल्फ़ लाइफ के भीतर')
    .replace(/route transit time/gi, 'मार्ग पारगमन समय')
    .replace(/hours/gi, 'घंटे')
    .replace(/hour/gi, 'घंटा')
    .replace(/reserved for fragile produce/gi, 'शीघ्र खराब होने वाली उपज के लिए आरक्षित')
    .replace(/highest net margin/gi, 'उच्चतम शुद्ध मार्जिन')
    .replace(/positive net margin/gi, 'सकारात्मक शुद्ध मार्जिन')
    .replace(/capacity limit/gi, 'क्षमता सीमा')
    .replace(/arrival time/gi, 'आगमन समय');
}

export function formatTimeAgo(isoString?: string, lang: Language = 'en'): string {
  if (!isoString) return lang === 'hi' ? 'अभी-अभी' : 'Just now';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return lang === 'hi' ? `${diffSec} से. पहले` : `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return lang === 'hi' ? `${diffMin} मि. पहले` : `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return lang === 'hi' ? `${diffHr} घंटे पहले` : `${diffHr}h ago`;
  } catch {
    return lang === 'hi' ? 'हाल ही में' : 'Recent';
  }
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 1,
  }).format(n || 0);
}
