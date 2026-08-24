// Thisai Sports Intelligence — SPA (vanilla ES modules, no build step).
const S = { user: null, users: [], config: null, tab: null, scope: {} };

// ---- tiny helpers ----------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(S.user ? { 'x-thisai-user': S.user.user_id } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.status); }
  return res.json();
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 2600); }
function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
function fmt(x) { return x == null ? '—' : x; }
function tier(t) { return el('span', { class: 'pill ' + (t || 'low') }, t || 'n/a'); }
function scoreColor(v) { if (v == null) return 'var(--muted2)'; if (v >= 70) return 'var(--good)'; if (v >= 45) return 'var(--warn)'; return 'var(--bad)'; }

function modal(content) {
  const m = $('#modal'); const c = $('#modalCard'); c.innerHTML = '';
  c.append(content); m.classList.remove('hidden');
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
function closeModal() { $('#modal').classList.add('hidden'); }

// ---- capability visualisations --------------------------------------------
function radar(domainScores, domainsMeta) {
  const size = 260, cx = size / 2, cy = size / 2, R = 96;
  const ax = domainsMeta.filter((d) => domainScores[d.id] !== undefined);
  const n = ax.length;
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', '100%'); svg.style.maxWidth = size + 'px';
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  for (const rr of [0.25, 0.5, 0.75, 1]) {
    const pts = ax.map((_, i) => pt(i, R * rr).join(',')).join(' ');
    svg.append(mk('polygon', { points: pts, fill: 'none', stroke: '#2b3644', 'stroke-width': rr === 0.5 ? 1.4 : 0.7, 'stroke-dasharray': rr === 0.5 ? '4 3' : '0' }));
  }
  ax.forEach((d, i) => {
    const [x, y] = pt(i, R); svg.append(mk('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#2b3644', 'stroke-width': 0.7 }));
    const [lx, ly] = pt(i, R + 18);
    const t = mk('text', { x: lx, y: ly, fill: '#8fa0b3', 'font-size': 9.5, 'text-anchor': lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle', 'dominant-baseline': 'middle' });
    t.textContent = d.label; svg.append(t);
  });
  const poly = ax.map((d, i) => pt(i, R * ((domainScores[d.id] ?? 0) / 100)).join(',')).join(' ');
  svg.append(mk('polygon', { points: poly, fill: 'rgba(47,183,164,.22)', stroke: '#2fb7a4', 'stroke-width': 2 }));
  ax.forEach((d, i) => { const [x, y] = pt(i, R * ((domainScores[d.id] ?? 0) / 100)); svg.append(mk('circle', { cx: x, cy: y, r: 2.6, fill: '#2fb7a4' })); });
  return svg;
}
function domainBars(domainScores, conf, domainsMeta) {
  const wrap = el('div');
  for (const d of domainsMeta) {
    const v = domainScores[d.id];
    wrap.append(el('div', { class: 'domain-row' }, [
      el('span', { class: 'dl' }, d.label),
      el('div', { class: 'bar' }, [el('span', { style: `width:${v ?? 0}%;background:${scoreColor(v)}` })]),
      el('span', { class: 'dv mono', style: `color:${scoreColor(v)}` }, v == null ? '—' : v),
    ]));
  }
  return wrap;
}

// ---- bootstrap -------------------------------------------------------------
async function boot() {
  [S.config, S.users] = await Promise.all([api('/config'), api('/users')]);
  $('#versionInfo').textContent = `battery ${S.config.versions.battery} · profiles ${S.config.versions.sport_profiles} · model ${S.config.versions.model} · norms ${S.config.versions.norms}`;
  const sel = $('#userSelect');
  const ordered = [...S.users].sort((a, b) => a.role.localeCompare(b.role));
  for (const u of ordered) sel.append(el('option', { value: u.user_id }, `${u.name} · ${u.role}`));
  const saved = localStorage.getItem('thisai_user');
  S.user = S.users.find((u) => u.user_id === saved) || S.users.find((u) => u.role === 'pe_teacher') || S.users[0];
  sel.value = S.user.user_id;
  sel.onchange = () => { S.user = S.users.find((u) => u.user_id === sel.value); localStorage.setItem('thisai_user', S.user.user_id); S.scope = {}; S.tab = null; render(); };
  // Deep-linking: ?user=&tab=&district=&school=&passport= for shareable views.
  const qp = new URLSearchParams(location.search);
  if (qp.get('user') && S.users.find((u) => u.user_id === qp.get('user'))) { S.user = S.users.find((u) => u.user_id === qp.get('user')); sel.value = S.user.user_id; }
  if (qp.get('district')) S.scope.districtId = qp.get('district');
  if (qp.get('school')) S.scope.schoolId = qp.get('school');
  if (qp.get('tab')) S.tab = qp.get('tab');
  render();
  if (qp.get('passport')) openPassport(qp.get('passport'));
}

function tabsForRole(role) {
  switch (role) {
    case 'pe_teacher': case 'school_admin': return ['Teacher', 'Talent Pool'];
    case 'coach': return ['Coach'];
    case 'district_specialist': return ['District', 'Talent Pool'];
    case 'state_admin': return ['State', 'District', 'Teacher'];
    case 'sports_scientist': return ['Governance', 'State'];
    case 'platform_admin': return ['Governance', 'State', 'District'];
    case 'parent': case 'student': return ['My Report'];
    default: return ['Teacher'];
  }
}

function render() {
  const tabs = tabsForRole(S.user.role);
  if (!S.tab || !tabs.includes(S.tab)) S.tab = tabs[0];
  const tabsEl = $('#tabs'); tabsEl.innerHTML = '';
  for (const t of tabs) tabsEl.append(el('div', { class: 'tab' + (t === S.tab ? ' active' : ''), onclick: () => { S.tab = t; render(); } }, t));
  const v = $('#view'); v.innerHTML = '<div class="loading">Loading…</div>';
  const map = { Teacher: viewTeacher, 'Talent Pool': viewTalentPool, Coach: viewCoach, District: viewDistrict, State: viewState, Governance: viewGovernance, 'My Report': viewMyReport };
  (map[S.tab] || viewTeacher)(v).catch((e) => { v.innerHTML = ''; v.append(el('div', { class: 'banner warn' }, 'Error: ' + e.message)); });
}

// ---- helper: resolve a working school / district scope for the user --------
function homeSchool() { return S.scope.schoolId || S.user.school_id; }
function homeDistrict() { return S.scope.districtId || S.user.district_id; }

async function schoolPicker(onPick) {
  const schools = await api('/schools');
  const sel = el('select', { onchange: () => onPick(sel.value) });
  for (const sc of schools) sel.append(el('option', { value: sc.school_id }, `${sc.name} (${sc.type}/${sc.setting})`));
  if (homeSchool()) sel.value = homeSchool();
  return sel;
}
async function districtPicker(onPick) {
  const ds = await api('/districts');
  const sel = el('select', { onchange: () => onPick(sel.value) });
  for (const d of ds) sel.append(el('option', { value: d.district_id }, d.name));
  if (homeDistrict()) sel.value = homeDistrict();
  return sel;
}

// ---- TEACHER DASHBOARD -----------------------------------------------------
async function viewTeacher(root) {
  root.innerHTML = '';
  let schoolId = homeSchool();
  const picker = await schoolPicker((v) => { S.scope.schoolId = v; render(); });
  if (!schoolId) schoolId = picker.value;
  const d = await api('/dashboard/teacher?schoolId=' + schoolId);

  root.append(el('div', { class: 'section-title' }, [
    el('h2', {}, 'PE Teacher Dashboard'),
    el('div', { class: 'row' }, [picker, el('button', { class: 'btn', onclick: () => openSessionFlow(schoolId) }, '+ Run class assessment')]),
  ]));

  root.append(el('div', { class: 'grid cols-4' }, [
    statCard(d.coverage.coverage_pct + '%', 'Screening coverage', `${d.coverage.with_profile}/${d.coverage.total_students} students profiled`),
    statCard(d.coverage.consented, 'Consented', `of ${d.coverage.total_students} enrolled`),
    statCard(d.flagged_count, 'Flagged for follow-up', 'potential signals'),
    statCard(d.retest_queue.length, 'Retest queue', 'measurements needing review'),
  ]));

  const tbody = el('tbody');
  for (const s of d.students) {
    tbody.append(el('tr', { onclick: () => openPassport(s.student_id) }, [
      el('td', {}, s.name), el('td', { class: 'muted' }, s.cohort || '—'),
      el('td', {}, s.has_profile ? el('span', { class: 'pill good' }, 'profiled') : el('span', { class: 'pill' }, 'pending')),
      el('td', {}, s.top_sport || '—'),
      el('td', {}, s.priority_tier ? tier(s.priority_tier) : '—'),
      el('td', { class: 'mono' }, s.referral_priority ?? '—'),
      el('td', {}, s.consent_status === 'granted' ? el('span', { class: 'pill good' }, 'consent') : el('span', { class: 'pill bad' }, s.consent_status)),
    ]));
  }
  root.append(el('div', { class: 'card pad0', style: 'margin-top:16px' }, [
    el('div', { class: 'tbl-wrap' }, [el('table', {}, [
      el('thead', {}, el('tr', {}, ['Student', 'Cohort', 'Status', 'Top exploration', 'Priority', 'Score', 'Consent'].map((h) => el('th', {}, h)))),
      tbody,
    ])]),
  ]));

  if (d.retest_queue.length) {
    root.append(el('div', { class: 'banner warn', style: 'margin-top:16px' },
      `Measurement quality: ${d.retest_queue.length} readings flagged Needs Review (implausible values kept but down-weighted). Open a retest to correct them.`));
  }
}

function statCard(num, lbl, sub) {
  return el('div', { class: 'card stat' }, [el('div', { class: 'num' }, num), el('div', { class: 'lbl' }, lbl), sub ? el('div', { class: 'sub' }, sub) : null]);
}

// ---- ASSESSMENT SESSION FLOW ----------------------------------------------
async function openSessionFlow(schoolId) {
  const sessions = await api('/sessions?schoolId=' + schoolId);
  const wrap = el('div');
  wrap.append(el('h3', {}, 'Class Assessment Session'));
  wrap.append(el('p', { class: 'hint' }, 'Screen a whole cohort efficiently (US-01). Invalid values are rejected and implausible ones flagged before they reach the intelligence layer (US-02).'));

  const sel = el('select');
  for (const s of sessions) sel.append(el('option', { value: s.session_id }, `${s.session_id} · ${s.cycle || 'cycle'} · ${s.date} · ${s.status}`));
  sel.append(el('option', { value: '__new' }, '➕ New baseline session (today)'));

  const rosterHost = el('div', { style: 'margin-top:12px' });
  async function loadRoster(sid) {
    rosterHost.innerHTML = 'Loading roster…';
    if (sid === '__new') {
      const r = await api('/sessions', { method: 'POST', body: { school_id: schoolId, cycle: '2026-baseline', date: new Date().toISOString().slice(0, 10) } });
      toast('Session ' + r.session_id + ' created'); return openSessionFlow(schoolId);
    }
    const data = await api('/sessions/' + sid + '/roster');
    rosterHost.innerHTML = '';
    const tb = el('tbody');
    for (const st of data.students) {
      tb.append(el('tr', {}, [
        el('td', {}, st.name), el('td', { class: 'muted' }, st.cohort || '—'),
        el('td', {}, st.consent_status === 'granted' ? el('span', { class: 'pill good' }, 'consent') : el('span', { class: 'pill bad' }, st.consent_status)),
        el('td', { class: 'completion' }, st.measurements ? `${st.measurements} tests recorded` : 'not started'),
        el('td', {}, el('button', { class: 'btn small' + (st.consent_status !== 'granted' ? ' ghost' : ''), disabled: st.consent_status !== 'granted' ? '' : null, onclick: () => enterMeasurements(sid, st) }, 'Enter results')),
      ]));
    }
    rosterHost.append(el('div', { class: 'card pad0' }, [el('div', { class: 'tbl-wrap' }, [el('table', {}, [
      el('thead', {}, el('tr', {}, ['Student', 'Cohort', 'Consent', 'Progress', ''].map((h) => el('th', {}, h)))), tb])])]));
  }
  sel.onchange = () => loadRoster(sel.value);
  wrap.append(sel, rosterHost);
  wrap.append(el('div', { class: 'row', style: 'margin-top:14px;justify-content:flex-end' }, [el('button', { class: 'btn ghost', onclick: closeModal }, 'Close')]));
  modal(wrap);
  if (sessions.length) loadRoster(sel.value);
}

function enterMeasurements(sessionId, student) {
  const wrap = el('div');
  wrap.append(el('h3', {}, 'Record results — ' + student.name));
  wrap.append(el('p', { class: 'hint' }, 'Enter best/attempt values in the test unit. Leave blank to skip. Out-of-range values are validated on save.'));
  const inputs = {};
  const grid = el('div');
  for (const t of S.config.tests) {
    const row = el('div', { class: 'field enter-cell' });
    const inp = el('input', { type: 'number', step: 'any', placeholder: `${t.unit}`, style: 'width:110px' });
    inputs[t.id] = inp;
    row.append(el('label', {}, `${t.name} (${t.unit}) · ${t.direction === 'lower' ? 'lower better' : t.direction === 'higher' ? 'higher better' : 'context'} · valid ${t.min}–${t.max}`), inp);
    grid.append(row);
  }
  wrap.append(grid);
  wrap.append(el('div', { class: 'row', style: 'justify-content:flex-end;gap:8px' }, [
    el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancel'),
    el('button', { class: 'btn', onclick: save }, 'Save & validate'),
  ]));
  modal(wrap);

  async function save() {
    const results = [];
    for (const [id, inp] of Object.entries(inputs)) if (inp.value !== '') results.push({ test_id: id, attempts: [Number(inp.value)] });
    if (!results.length) return toast('Enter at least one value');
    const r = await api('/measurements', { method: 'POST', body: { sessionId, studentId: student.student_id, results } });
    const bad = r.recorded.filter((x) => x.validity !== 'valid');
    await api('/students/' + student.student_id + '/generate', { method: 'POST' });
    toast(`Saved ${r.recorded.length} results${bad.length ? `, ${bad.length} flagged` : ''}. Profile updated.`);
    closeModal();
    render();
  }
}

// ---- STUDENT SPORTS PASSPORT ----------------------------------------------
async function openPassport(studentId) { modal(el('div', { class: 'loading' }, 'Loading passport…')); const d = await api('/students/' + studentId + '/passport'); modal(passportEl(d)); }

function passportEl(d) {
  const wrap = el('div');
  const st = d.student;
  wrap.append(el('div', { class: 'row spread' }, [
    el('div', {}, [el('h3', { style: 'font-size:18px;text-transform:none;letter-spacing:0' }, st.name),
      el('div', { class: 'muted' }, `${st.school_name} · ${st.district_name} · ${st.cohort || ''} · ${st.sex || ''} · b.${st.birth_year || '—'}`)]),
    el('button', { class: 'btn ghost small', onclick: closeModal }, '✕'),
  ]));

  if (st.consent_status !== 'granted') wrap.append(el('div', { class: 'banner warn' }, 'Consent not granted — assessment & recommendations restricted (§17 minor-safe governance).'));

  // scores strip
  const sc = d.recommendation?.scores || {};
  wrap.append(el('div', { class: 'grid cols-4', style: 'margin:12px 0' }, [
    miniStat('Assessment validity', pct(sc.assessment_validity ?? d.profile.validityScore)),
    miniStat('Evidence completeness', pct(sc.evidence_completeness ?? d.profile.evidenceCompleteness)),
    miniStat('Opportunity context', sc.opportunity_context == null ? '—' : sc.opportunity_context + '/100'),
    miniStat('Referral priority', (d.recommendation?.referral_priority ?? '—'), d.recommendation?.priority_tier),
  ]));

  // capability profile
  wrap.append(el('div', { class: 'grid cols-2' }, [
    el('div', { class: 'card' }, [el('h3', {}, 'Capability Profile'),
      el('div', { class: 'row', style: 'justify-content:center' }, [radar(d.profile.domainScores, S.config.domains)]),
      el('p', { class: 'hint', style: 'text-align:center' }, 'Age/sex-normalised (0–100). Dashed ring = reference average (50).')]),
    el('div', { class: 'card' }, [el('h3', {}, 'Domain Scores'), domainBars(d.profile.domainScores, d.profile.domainConfidence, S.config.domains)]),
  ]));

  // recommendations
  const recWrap = el('div', { class: 'card', style: 'margin-top:16px' });
  recWrap.append(el('h3', {}, 'Sports to Explore (exploration set — not a final selection)'));
  if (d.recommendation?.exploration_set?.length) {
    for (const r of d.recommendation.exploration_set) recWrap.append(recoCard(r));
  } else recWrap.append(el('p', { class: 'muted' }, 'No recommendations yet — complete the baseline battery.'));
  wrap.append(recWrap);

  // opportunity note
  if (d.recommendation?.opportunity?.level === 'low') {
    wrap.append(el('div', { class: 'banner info', style: 'margin-top:12px' },
      '⚖️ Equity note: limited sport exposure / coaching access detected. A lower reading is treated as limited opportunity, not limited ability — an exploration session is recommended (§7.7).'));
  }

  // narrative
  if (d.narrative) wrap.append(el('div', { class: 'card', style: 'margin-top:16px' }, [el('h3', {}, 'Plain-language Report'),
    el('div', {}, d.narrative.lines.map((l) => el('p', { style: 'margin:.35rem 0' }, l)))]));

  // trajectory
  if (d.trajectory?.hasTrend) {
    const t = d.trajectory;
    const rows = Object.values(t.domains).map((dm) => el('div', { class: 'domain-row' }, [
      el('span', { class: 'dl' }, dm.label),
      el('div', { class: 'row', style: 'gap:6px' }, [el('span', { class: 'mono muted' }, dm.from), el('span', {}, '→'), el('span', { class: 'mono' }, dm.to)]),
      el('span', { class: 'pill ' + (dm.trend === 'rapid_improvement' ? 'hi' : dm.trend === 'improving' ? 'good' : dm.trend === 'regression' ? 'bad' : 'low') }, dm.trend.replace('_', ' ')),
    ]));
    wrap.append(el('div', { class: 'card', style: 'margin-top:16px' }, [el('h3', {}, `Longitudinal Trajectory · ${t.cycles} cycles`),
      el('div', { class: 'banner ' + (t.rapidImprover ? 'info' : 'warn') }, t.headline), ...rows]));
  }

  // measurements + provenance
  const mtb = el('tbody');
  for (const m of d.current_measurements) mtb.append(el('tr', {}, [
    el('td', {}, m.test_name), el('td', { class: 'mono' }, `${fmt(m.value)} ${m.unit || ''}`),
    el('td', {}, el('span', { class: 'pill ' + (m.validity === 'valid' ? 'good' : m.validity === 'needs_review' ? 'moderate' : 'bad') }, m.validity.replace('_', ' '))),
    el('td', { class: 'muted' }, (m.flags || []).join(', ') || '—'), el('td', { class: 'muted mono' }, m.session_date),
  ]));
  wrap.append(el('div', { class: 'card pad0', style: 'margin-top:16px' }, [el('div', { style: 'padding:12px 16px 0' }, el('h3', {}, 'Current Measurements & Provenance')),
    el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['Test', 'Value', 'Validity', 'Flags', 'Cycle'].map((h) => el('th', {}, h)))), mtb])])]));

  // provenance / actions
  if (d.recommendation_meta) wrap.append(el('p', { class: 'hint', style: 'margin-top:10px' },
    `Provenance: generated by ${d.recommendation_meta.model_version} on protocol ${d.recommendation_meta.protocol_version} at ${new Date(d.recommendation_meta.created_at).toLocaleString()} — input snapshot stored for audit (US-10, §20).`));

  // role actions
  const canObserve = ['coach', 'district_specialist', 'state_admin'].includes(S.user.role);
  const canRefer = ['district_specialist', 'state_admin', 'school_admin'].includes(S.user.role);
  const actions = el('div', { class: 'row', style: 'margin-top:14px' });
  if (canObserve) actions.append(el('button', { class: 'btn accent2', onclick: () => observationForm(st.student_id) }, '+ Specialist observation'));
  if (canRefer) actions.append(el('button', { class: 'btn', onclick: () => referralForm(st.student_id, d.recommendation) }, '+ Create referral'));
  actions.append(el('button', { class: 'btn ghost', onclick: () => reassess(st.student_id) }, '↻ Reassess (regenerate)'));
  wrap.append(actions);

  // existing observations/referrals
  if (d.observations.length || d.referrals.length) {
    const list = el('div', { class: 'card', style: 'margin-top:14px' });
    if (d.referrals.length) { list.append(el('h3', {}, 'Referrals')); for (const r of d.referrals) list.append(el('div', { class: 'row spread', style: 'padding:6px 0;border-bottom:1px solid var(--line)' }, [el('span', {}, `${r.source_level} → ${r.destination}`), el('span', {}, [tier(r.status), ' ', el('span', { class: 'muted mono' }, r.date?.slice(0, 10))])])); }
    if (d.observations.length) { list.append(el('h3', { style: 'margin-top:10px' }, 'Observations')); for (const o of d.observations) list.append(el('div', { style: 'padding:6px 0;border-bottom:1px solid var(--line)' }, [el('span', {}, `${o.observer_name || 'Specialist'}: ${o.recommendation || ''} `), el('span', { class: 'muted' }, o.notes || '')])); }
    wrap.append(list);
  }
  return wrap;
}

function miniStat(lbl, val, pillTier) { return el('div', { class: 'card stat' }, [el('div', { class: 'num', style: 'font-size:24px' }, [val, pillTier ? ' ' : null, pillTier ? tier(pillTier) : null]), el('div', { class: 'lbl' }, lbl)]); }

function recoCard(r) {
  const c = el('div', { class: 'reco' });
  c.append(el('div', { class: 'top' }, [
    el('div', {}, [el('div', { class: 'sname' }, `${r.sport} — ${r.discipline}`),
      el('div', { class: 'muted', style: 'font-size:12px' }, `evidence: ${r.evidence_level} · stage: ${r.dev_stage} · next: ${r.next_action.replace('_', ' ')}`)]),
    el('div', { style: 'text-align:right' }, [el('div', { class: 'fitnum', style: `color:${scoreColor(r.fit_signal)}` }, r.fit_signal), el('span', { class: 'pill ' + r.confidence_band.toLowerCase() }, r.confidence_band + ' confidence')]),
  ]));
  const reasons = el('div', { class: 'reasons' });
  for (const rc of r.reasons) reasons.append(el('span', { class: 'chip' }, '✓ ' + rc));
  for (const me of r.missing_evidence) reasons.append(el('span', { class: 'chip miss' }, '⚠ ' + me));
  c.append(reasons);
  return c;
}

async function reassess(id) { await api('/students/' + id + '/generate', { method: 'POST' }); toast('Recommendation regenerated (previous kept in history).'); openPassport(id); }

function observationForm(studentId) {
  const wrap = el('div'); wrap.append(el('h3', {}, 'Specialist Observation (US-06)'));
  const sport = el('select'); for (const s of S.config.sports) sport.append(el('option', { value: s.id }, `${s.sport} — ${s.discipline}`));
  const rec = el('select'); ['continue', 'explore', 'specialist_review', 'pathway_consideration'].forEach((o) => rec.append(el('option', { value: o }, o.replace('_', ' '))));
  const conf = el('select'); ['low', 'medium', 'high'].forEach((o) => conf.append(el('option', { value: o }, o)));
  const notes = el('textarea', { rows: 3, placeholder: 'Sport-specific technical / game observation…' });
  wrap.append(field('Sport', sport), field('Recommendation', rec), field('Confidence', conf), field('Notes', notes));
  wrap.append(actionsRow(async () => {
    await api('/observations', { method: 'POST', body: { student_id: studentId, sport_id: sport.value, recommendation: rec.value, confidence: conf.value, notes: notes.value } });
    toast('Observation added'); closeModal(); openPassport(studentId);
  }));
  modal(wrap);
}
function referralForm(studentId, reco) {
  const wrap = el('div'); wrap.append(el('h3', {}, 'Create Referral (§7.10)'));
  wrap.append(el('p', { class: 'hint' }, `Referral priority ${reco?.referral_priority ?? '—'} (${reco?.priority_tier ?? ''}). Referrals are private pathway routing — never a public ranking (§7.10, §19).`));
  const dest = el('select'); ['district_camp', 'sdat', 'sai', 'academy', 'federation', 'school_team'].forEach((o) => dest.append(el('option', { value: o }, o.replace('_', ' '))));
  const status = el('select'); ['potential_signal', 'proven_performance', 'shortlisted', 'confirmed_pathway'].forEach((o) => status.append(el('option', { value: o }, o.replace('_', ' '))));
  const reason = el('textarea', { rows: 2, placeholder: 'Reason / context' });
  wrap.append(field('Destination', dest), field('Status', status), field('Reason', reason));
  wrap.append(actionsRow(async () => {
    await api('/referrals', { method: 'POST', body: { student_id: studentId, destination: dest.value, status: status.value, reason: reason.value, source_level: 'school' } });
    toast('Referral created'); closeModal(); openPassport(studentId);
  }));
  modal(wrap);
}
function field(label, input) { return el('div', { class: 'field' }, [el('label', {}, label), input]); }
function actionsRow(onSave) { return el('div', { class: 'row', style: 'justify-content:flex-end;gap:8px;margin-top:6px' }, [el('button', { class: 'btn ghost', onclick: closeModal }, 'Cancel'), el('button', { class: 'btn', onclick: onSave }, 'Save')]); }

// ---- TALENT POOL -----------------------------------------------------------
async function viewTalentPool(root) {
  root.innerHTML = '';
  const isDistrict = ['district_specialist', 'state_admin', 'platform_admin'].includes(S.user.role);
  const scopeParam = isDistrict ? 'districtId=' + (homeDistrict() || '') : 'schoolId=' + (homeSchool() || '');
  root.append(el('div', { class: 'section-title' }, [el('h2', {}, 'Talent Pool & Referrals'), el('div', { class: 'muted' }, 'Ranked by referral priority — potential signal ≠ proven performance ≠ confirmed pathway (§7.10)')]));
  const pool = await api('/talent-pool?' + scopeParam);
  root.append(talentTable(pool));
}
function talentTable(pool) {
  const tb = el('tbody');
  for (const p of pool) {
    tb.append(el('tr', { onclick: () => openPassport(p.student_id) }, [
      el('td', {}, p.name), el('td', { class: 'muted' }, p.school_name),
      el('td', {}, el('span', { class: 'pill' + (p.low_access ? ' bad' : '') }, p.school_type)),
      el('td', {}, p.top_sport || '—'), el('td', {}, p.top_confidence ? el('span', { class: 'pill ' + p.top_confidence.toLowerCase() }, p.top_confidence) : '—'),
      el('td', {}, p.opportunity_level ? el('span', { class: 'pill ' + (p.opportunity_level === 'low' ? 'moderate' : 'low') }, p.opportunity_level) : '—'),
      el('td', {}, p.priority_tier ? tier(p.priority_tier) : '—'), el('td', { class: 'mono' }, p.referral_priority ?? '—'),
      el('td', {}, p.referral_status ? el('span', { class: 'pill hi' }, p.referral_status.replace('_', ' ')) : '—'),
    ]));
  }
  return el('div', { class: 'card pad0' }, [el('div', { class: 'tbl-wrap' }, [el('table', {}, [
    el('thead', {}, el('tr', {}, ['Student', 'School', 'Type', 'Top exploration', 'Confidence', 'Opportunity', 'Priority', 'Score', 'Referral'].map((h) => el('th', {}, h)))), tb])])]);
}

// ---- COACH -----------------------------------------------------------------
async function viewCoach(root) {
  root.innerHTML = '';
  root.append(el('h2', {}, 'Coach — Referred Athletes'));
  root.append(el('p', { class: 'muted' }, 'Review referred students, add sport-specific observations and track development (US-06, §7.9).'));
  const pool = await api('/talent-pool?districtId=' + (homeDistrict() || 'D-CHN'));
  root.append(talentTable(pool.filter((p) => p.referral_status)));
  if (!pool.some((p) => p.referral_status)) root.append(el('div', { class: 'banner info' }, 'No referred athletes in this district yet.'));
}

// ---- DISTRICT DASHBOARD ----------------------------------------------------
async function viewDistrict(root) {
  root.innerHTML = '';
  let districtId = homeDistrict();
  const picker = await districtPicker((v) => { S.scope.districtId = v; render(); });
  if (!districtId) districtId = picker.value;
  const d = await api('/dashboard/district?districtId=' + districtId);
  const funnel = d.funnel;

  root.append(el('div', { class: 'section-title' }, [el('h2', {}, 'District Sports Intelligence'), picker]));

  // funnel
  const steps = [['Screened', funnel.screened], ['Flagged', funnel.flagged], ['Exposed', funnel.exposed], ['Assessed', funnel.assessed], ['Referred', funnel.referred], ['Progressed', funnel.progressed]];
  root.append(el('div', { class: 'card' }, [el('h3', {}, 'Talent Funnel (pilot validation §17/§18)'),
    el('div', { class: 'grid cols-4', style: 'grid-template-columns:repeat(6,1fr)' }, steps.map(([l, v]) => el('div', { class: 'stat', style: 'text-align:center' }, [el('div', { class: 'num', style: 'font-size:26px' }, v), el('div', { class: 'lbl' }, l)])))]));

  // specialist workload + school coverage heatmap
  root.append(el('div', { class: 'grid cols-4', style: 'margin-top:16px' }, [
    statCard(d.specialist_workload, 'Specialist queue', 'high-priority, unreferred'),
    statCard(d.schools.length, 'Schools', 'in district'),
    statCard(d.talent_pool.filter((p) => p.priority_tier === 'high').length, 'High priority', 'students'),
    statCard(d.equity.reduce((s, e) => s + e.low_access, 0), 'Low-access students', 'equity focus'),
  ]));

  const stb = el('tbody');
  for (const sc of d.schools) stb.append(el('tr', {}, [
    el('td', {}, sc.name), el('td', {}, el('span', { class: 'pill' + (sc.low_access ? ' bad' : '') }, `${sc.type}/${sc.setting}`)),
    el('td', { class: 'mono' }, sc.students), el('td', {}, heat(sc.coverage_pct)), el('td', { class: 'mono' }, sc.high_priority),
  ]));
  root.append(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    el('div', { class: 'card pad0' }, [el('div', { style: 'padding:12px 16px 0' }, el('h3', {}, 'School Coverage Heatmap')),
      el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['School', 'Type', 'Students', 'Coverage', 'High-prio'].map((h) => el('th', {}, h)))), stb])])]),
    el('div', { class: 'card' }, [el('h3', {}, 'Equity — flag rate by school type'), equityBars(d.equity)]),
  ]));

  root.append(el('div', { class: 'section-title', style: 'margin-top:18px' }, [el('h3', { style: 'text-transform:none' }, 'Talent Pool')]));
  root.append(talentTable(d.talent_pool));
}
function heat(v) { const c = v >= 80 ? 'var(--good)' : v >= 50 ? 'var(--warn)' : 'var(--bad)'; return el('span', { class: 'heat', style: `background:${c}22;color:${c}` }, v + '%'); }
function equityBars(rows) {
  const wrap = el('div');
  for (const r of rows) wrap.append(el('div', { class: 'domain-row' }, [el('span', { class: 'dl' }, r.school_type), el('div', { class: 'bar' }, [el('span', { style: `width:${r.flag_rate}%` })]), el('span', { class: 'dv mono' }, r.flag_rate + '%')]));
  wrap.append(el('p', { class: 'hint' }, 'Monitor for access-related bias (§19). Divergent flag rates by school type warrant review, not automatic correction.'));
  return wrap;
}

// ---- STATE DASHBOARD -------------------------------------------------------
async function viewState(root) {
  root.innerHTML = '';
  root.append(el('h2', {}, 'State Sports Intelligence — Tamil Nadu'));
  const [d, k] = await Promise.all([api('/dashboard/state'), api('/kpis')]);
  root.append(el('div', { class: 'card' }, [el('h3', {}, 'Product KPIs (§18)'),
    el('div', { class: 'grid cols-3' }, k.map((x) => el('div', { class: 'stat card', style: 'background:var(--panel2)' }, [el('div', { class: 'num', style: 'font-size:24px', style2: '' }, x.value + '%'), el('div', { class: 'lbl' }, x.kpi), el('div', { class: 'sub' }, x.detail)])))]));

  const tb = el('tbody');
  for (const r of d.districts) tb.append(el('tr', { onclick: () => { S.scope.districtId = r.district_id; S.tab = 'District'; render(); } }, [
    el('td', {}, r.name), el('td', { class: 'mono' }, r.students), el('td', {}, heat(r.coverage_pct)), el('td', { class: 'mono' }, r.high_priority), el('td', { class: 'mono' }, r.referrals),
  ]));
  root.append(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    el('div', { class: 'card pad0' }, [el('div', { style: 'padding:12px 16px 0' }, el('h3', {}, 'District Comparison')), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['District', 'Students', 'Coverage', 'High-prio', 'Referrals'].map((h) => el('th', {}, h)))), tb])])]),
    el('div', { class: 'card' }, [el('h3', {}, 'System Equity'), equityBars(d.equity)]),
  ]));
}

// ---- GOVERNANCE ------------------------------------------------------------
async function viewGovernance(root) {
  root.innerHTML = '';
  root.append(el('h2', {}, 'Governance — Audit, Models & Protocols'));
  root.append(el('div', { class: 'banner info' }, 'Deterministic, auditable rules-first architecture (§8). ML is intentionally OUT of MVP scope until validated longitudinal outcomes exist.'));
  const [audit, runs] = await Promise.all([api('/audit?limit=40'), api('/model-runs?limit=20')]);

  // sport profile weights
  const sp = el('div', { class: 'card' }); sp.append(el('h3', {}, 'Versioned Sport Profiles — ' + S.config.versions.sport_profiles));
  const doms = S.config.domains.map((d) => d.id);
  const th = el('tr', {}, [el('th', {}, 'Sport'), ...S.config.domains.map((d) => el('th', {}, d.label.slice(0, 4))), el('th', {}, 'Evidence')]);
  const tb = el('tbody');
  for (const s of S.config.sports) tb.append(el('tr', {}, [el('td', {}, `${s.sport} · ${s.discipline}`), ...doms.map((dm) => { const w = s.weights[dm] || 0; return el('td', { class: 'mono', style: `color:${w >= 0.8 ? 'var(--good)' : w >= 0.5 ? 'var(--warn)' : 'var(--muted2)'}` }, w ? w.toFixed(1) : '·'); }), el('td', {}, el('span', { class: 'pill ' + (s.evidence_level === 'High' ? 'good' : s.evidence_level === 'Medium' ? 'moderate' : 'low') }, s.evidence_level))]));
  sp.append(el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, th), tb])]));
  root.append(sp);

  const atb = el('tbody');
  for (const a of audit) atb.append(el('tr', {}, [el('td', { class: 'muted mono' }, new Date(a.timestamp).toLocaleString()), el('td', {}, a.actor || '—'), el('td', {}, el('span', { class: 'pill' }, a.action)), el('td', { class: 'muted' }, `${a.object_type || ''} ${a.object_id || ''}`)]));
  root.append(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    el('div', { class: 'card pad0' }, [el('div', { style: 'padding:12px 16px 0' }, el('h3', {}, 'Audit Trail (§18)')), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['Time', 'Actor', 'Action', 'Object'].map((h) => el('th', {}, h)))), atb])])]),
    el('div', { class: 'card pad0' }, [el('div', { style: 'padding:12px 16px 0' }, el('h3', {}, 'Model Runs (provenance)')), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['Run', 'Student', 'Model', 'Time'].map((h) => el('th', {}, h)))), el('tbody', {}, runs.map((r) => el('tr', {}, [el('td', { class: 'mono' }, r.run_id), el('td', { class: 'mono' }, r.student_id), el('td', {}, r.model_version), el('td', { class: 'muted mono' }, new Date(r.timestamp).toLocaleTimeString())])))])])]),
  ]));
}

// ---- MY REPORT (parent/student) -------------------------------------------
async function viewMyReport(root) {
  root.innerHTML = '';
  // pick a student in the user's school as a stand-in child (MVP has no parent-child link table).
  const students = await api('/students?schoolId=' + (S.user.school_id || 'SCH-1'));
  const withProfile = students[0];
  root.append(el('div', { class: 'banner info' }, 'Parent/Student view: plain-language report, recommended exploration and progress — no misleading rank (US-04).'));
  if (!withProfile) return root.append(el('p', { class: 'muted' }, 'No student linked.'));
  const d = await api('/students/' + withProfile.student_id + '/passport');
  root.append(passportEl(d));
}

boot();
