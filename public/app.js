// Thisai Sports Intelligence — SPA (vanilla ES modules, hash-routed pages).
const S = { user: null, users: [], config: null, scope: {} };

// palette (mirrors CSS tokens for canvas/SVG use)
const C = { brand: '#1b57a6', brand600: '#17498c', good: '#12875a', warn: '#b9791a', bad: '#c53b3b', line: '#e5eaf1', line2: '#eef2f7', muted: '#64768a', ink: '#17324c' };

// ---- tiny helpers ----------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
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
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 2800); }
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
function fmt(x) { return x == null ? '—' : x; }
function tier(t) { return el('span', { class: 'pill ' + (t || 'low') }, t ? t.replace(/_/g, ' ') : 'n/a'); }
function scoreColor(v) { if (v == null) return C.muted; if (v >= 70) return C.good; if (v >= 45) return C.warn; return C.bad; }

// ---- capability visualisations --------------------------------------------
function radar(domainScores, domainsMeta) {
  const size = 300, cx = size / 2, cy = size / 2, R = 108;
  const ax = domainsMeta.filter((d) => domainScores[d.id] !== undefined);
  const n = ax.length || 1;
  const NS = 'http://www.w3.org/2000/svg';
  const pt = (i, r) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', '100%'); svg.style.maxWidth = size + 'px';
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  for (const rr of [0.25, 0.5, 0.75, 1]) {
    const pts = ax.map((_, i) => pt(i, R * rr).join(',')).join(' ');
    svg.append(mk('polygon', { points: pts, fill: rr === 1 ? '#fff' : 'none', stroke: rr === 0.5 ? C.brand : C.line, 'stroke-width': rr === 0.5 ? 1.3 : 1, 'stroke-dasharray': rr === 0.5 ? '5 4' : '0' }));
  }
  ax.forEach((d, i) => {
    const [x, y] = pt(i, R); svg.append(mk('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: C.line2, 'stroke-width': 1 }));
    const [lx, ly] = pt(i, R + 20);
    const t = mk('text', { x: lx, y: ly, fill: C.muted, 'font-size': 10.5, 'font-weight': 600, 'text-anchor': lx < cx - 6 ? 'end' : lx > cx + 6 ? 'start' : 'middle', 'dominant-baseline': 'middle' });
    t.textContent = d.label; svg.append(t);
  });
  const poly = ax.map((d, i) => pt(i, R * ((domainScores[d.id] ?? 0) / 100)).join(',')).join(' ');
  svg.append(mk('polygon', { points: poly, fill: 'rgba(27,87,166,.16)', stroke: C.brand, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
  ax.forEach((d, i) => { const [x, y] = pt(i, R * ((domainScores[d.id] ?? 0) / 100)); svg.append(mk('circle', { cx: x, cy: y, r: 3, fill: '#fff', stroke: C.brand, 'stroke-width': 2 })); });
  return svg;
}
function domainBars(domainScores, domainsMeta) {
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
function statCard(num, lbl, sub, brand) { return el('div', { class: 'card stat' + (brand ? ' brand' : '') }, [el('div', { class: 'num' }, num), el('div', { class: 'lbl' }, lbl), sub ? el('div', { class: 'sub' }, sub) : null]); }
function heat(v) { const c = v >= 80 ? C.good : v >= 50 ? C.warn : C.bad; return el('span', { class: 'heat', style: `background:${c}18;color:${c}` }, v + '%'); }

// ---- bootstrap -------------------------------------------------------------
async function boot() {
  [S.config, S.users] = await Promise.all([api('/config'), api('/users')]);
  $('#versionInfo').textContent = `battery ${S.config.versions.battery} · profiles ${S.config.versions.sport_profiles} · model ${S.config.versions.model} · norms ${S.config.versions.norms}`;
  const sel = $('#userSelect');
  for (const u of [...S.users].sort((a, b) => a.role.localeCompare(b.role))) sel.append(el('option', { value: u.user_id }, `${u.name} · ${u.role.replace(/_/g, ' ')}`));
  const saved = localStorage.getItem('thisai_user');
  S.user = S.users.find((u) => u.user_id === saved) || S.users.find((u) => u.role === 'pe_teacher') || S.users[0];
  sel.value = S.user.user_id;
  sel.onchange = () => { S.user = S.users.find((u) => u.user_id === sel.value); localStorage.setItem('thisai_user', S.user.user_id); S.scope = {}; go(roleHome()); render(); };
  $('#brandHome').onclick = () => go(roleHome());
  window.addEventListener('hashchange', render);
  if (!location.hash) go(roleHome());
  render();
}

function roleHome() {
  return { pe_teacher: '#/teacher', school_admin: '#/teacher', district_specialist: '#/district', state_admin: '#/state', coach: '#/coach', sports_scientist: '#/governance', platform_admin: '#/governance', parent: '#/report', student: '#/report' }[S.user.role] || '#/teacher';
}
function navFor(role) {
  const T = (label, route) => ({ label, route });
  switch (role) {
    case 'pe_teacher': case 'school_admin': return [T('Dashboard', '#/teacher'), T('Run Assessment', '#/assess'), T('Talent Pool', '#/talent')];
    case 'district_specialist': return [T('District', '#/district'), T('Talent Pool', '#/talent')];
    case 'state_admin': return [T('State', '#/state'), T('District', '#/district'), T('Schools', '#/teacher')];
    case 'coach': return [T('Referred Athletes', '#/coach')];
    case 'sports_scientist': return [T('Governance', '#/governance'), T('State', '#/state')];
    case 'platform_admin': return [T('Governance', '#/governance'), T('State', '#/state'), T('District', '#/district')];
    case 'parent': case 'student': return [T('My Report', '#/report')];
    default: return [T('Dashboard', '#/teacher')];
  }
}

function renderNav(activeRoute) {
  const nav = $('#nav'); nav.innerHTML = '';
  for (const t of navFor(S.user.role)) {
    const active = activeRoute === t.route || (t.route !== '#/' && activeRoute.startsWith(t.route));
    nav.append(el('div', { class: 'tab' + (active ? ' active' : ''), onclick: () => go(t.route) }, t.label));
  }
}

// ---- router ----------------------------------------------------------------
function parseHash() { return (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean); }
async function render() {
  const seg = parseHash();
  const base = '#/' + (seg[0] || '');
  // nav highlight: assessment sub-pages highlight Run Assessment
  renderNav(seg[0] === 'assess' ? '#/assess' : seg[0] === 'student' ? '' : base);
  const v = $('#view'); v.innerHTML = '<div class="loading">Loading…</div>';
  const routes = {
    '': () => go(roleHome()),
    teacher: viewTeacher, talent: viewTalentPool, coach: viewCoach, district: viewDistrict,
    state: viewState, governance: viewGovernance, report: viewMyReport,
    student: () => viewPassport(v, decodeURIComponent(seg[1])),
    assess: () => seg[2] ? viewAssessEntry(v, seg[1], decodeURIComponent(seg[2])) : seg[1] ? viewAssessRoster(v, seg[1]) : viewAssessLanding(v),
  };
  const fn = routes[seg[0] ?? ''] || (() => go(roleHome()));
  try { await fn(v); window.scrollTo(0, 0); }
  catch (e) { v.innerHTML = ''; v.append(el('div', { class: 'banner warn' }, 'Error: ' + e.message)); }
}

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
function crumb(label, hash) { return el('div', { class: 'crumb', onclick: () => go(hash) }, ['← ', label]); }

// ---- TEACHER DASHBOARD -----------------------------------------------------
async function viewTeacher(root) {
  root.innerHTML = '';
  let schoolId = homeSchool();
  const picker = await schoolPicker((val) => { S.scope.schoolId = val; render(); });
  if (!schoolId) schoolId = picker.value;
  const d = await api('/dashboard/teacher?schoolId=' + schoolId);

  root.append(el('div', { class: 'section-title' }, [
    el('div', {}, [el('h2', {}, 'PE Teacher Dashboard'), el('div', { class: 'sub' }, 'Screen cohorts, validate measurements, act on flagged students')]),
    el('div', { class: 'row' }, [picker, el('button', { class: 'btn', onclick: () => go('#/assess') }, '+ Run class assessment')]),
  ]));
  root.append(el('div', { class: 'grid cols-4' }, [
    statCard(d.coverage.coverage_pct + '%', 'Screening coverage', `${d.coverage.with_profile}/${d.coverage.total_students} profiled`, true),
    statCard(d.coverage.consented, 'Consented', `of ${d.coverage.total_students} enrolled`),
    statCard(d.flagged_count, 'Flagged for follow-up', 'potential signals'),
    statCard(d.retest_queue.length, 'Retest queue', 'measurements needing review'),
  ]));

  const tbody = el('tbody');
  for (const s of d.students) tbody.append(el('tr', { class: 'click', onclick: () => go('#/student/' + s.student_id) }, [
    el('td', {}, el('b', {}, s.name)), el('td', { class: 'muted' }, s.cohort || '—'),
    el('td', {}, s.has_profile ? el('span', { class: 'pill good' }, 'profiled') : el('span', { class: 'pill low' }, 'pending')),
    el('td', {}, s.top_sport || '—'),
    el('td', {}, s.priority_tier ? tier(s.priority_tier) : '—'),
    el('td', { class: 'mono' }, s.referral_priority ?? '—'),
    el('td', {}, s.consent_status === 'granted' ? el('span', { class: 'pill good' }, 'consent') : el('span', { class: 'pill bad' }, s.consent_status)),
  ]));
  root.append(el('div', { class: 'card pad0', style: 'margin-top:16px' }, [el('div', { class: 'tbl-wrap' }, [el('table', {}, [
    el('thead', {}, el('tr', {}, ['Student', 'Cohort', 'Status', 'Top exploration', 'Priority', 'Score', 'Consent'].map((h) => el('th', {}, h)))), tbody])])]));
  if (d.retest_queue.length) root.append(el('div', { class: 'banner warn', style: 'margin-top:16px' }, `Measurement quality: ${d.retest_queue.length} readings flagged Needs Review (kept but down-weighted). Re-run the test from Run Assessment to correct them.`));
}

// ---- ASSESSMENT: landing (pick / create session) --------------------------
async function viewAssessLanding(root) {
  root.innerHTML = '';
  const schoolId = homeSchool() || 'SCH-1';
  const [picker, sessions] = await Promise.all([schoolPicker((v) => { S.scope.schoolId = v; render(); }), api('/sessions?schoolId=' + schoolId)]);
  root.append(el('div', { class: 'section-title' }, [
    el('div', {}, [el('h2', {}, 'Run Assessment'), el('div', { class: 'sub' }, 'Screen a whole cohort efficiently (US-01). Pick an existing session or start a new one.')]),
    picker,
  ]));
  root.append(el('div', { class: 'row', style: 'margin-bottom:16px' }, [
    el('button', { class: 'btn', onclick: async () => { const r = await api('/sessions', { method: 'POST', body: { school_id: schoolId, cycle: '2026-baseline', date: new Date().toISOString().slice(0, 10) } }); toast('Session ' + r.session_id + ' created'); go('#/assess/' + r.session_id); } }, '+ New baseline session (today)'),
  ]));
  if (!sessions.length) { root.append(el('div', { class: 'banner info' }, 'No sessions yet — create one to begin.')); return; }
  const grid = el('div', { class: 'grid cols-3' });
  for (const s of sessions) grid.append(el('div', { class: 'card', style: 'cursor:pointer', onclick: () => go('#/assess/' + s.session_id) }, [
    el('div', { class: 'row spread' }, [el('b', {}, s.cycle || 'cycle'), el('span', { class: 'pill ' + (s.status === 'closed' ? 'low' : 'brand') }, s.status)]),
    el('div', { class: 'muted', style: 'margin-top:6px;font-size:12.5px' }, `${s.session_id} · ${s.date}`),
    el('div', { style: 'margin-top:12px' }, el('span', { class: 'btn ghost small' }, 'Open roster →')),
  ]));
  root.append(grid);
}

// ---- ASSESSMENT: roster page ----------------------------------------------
async function viewAssessRoster(root, sessionId) {
  root.innerHTML = '';
  const data = await api('/sessions/' + sessionId + '/roster');
  root.append(crumb('All sessions', '#/assess'));
  root.append(el('div', { class: 'section-title' }, [
    el('div', {}, [el('h2', {}, 'Assessment Roster'), el('div', { class: 'sub' }, `${data.session.session_id} · ${data.session.cycle || 'cycle'} · ${data.session.date}`)]),
    el('span', { class: 'pill ' + (data.session.status === 'closed' ? 'low' : 'brand') }, data.session.status),
  ]));
  const total = S.config.tests.length;
  const done = data.students.filter((s) => s.measurements > 0).length;
  root.append(el('div', { class: 'grid cols-3', style: 'margin-bottom:18px' }, [
    statCard(data.students.length, 'Students in cohort'),
    statCard(done, 'Started', `of ${data.students.length}`, true),
    statCard(data.students.filter((s) => s.consent_status === 'granted').length, 'Consented'),
  ]));
  const list = el('div');
  for (const st of data.students) {
    const canEnter = st.consent_status === 'granted';
    list.append(el('div', { class: 'roster-card' }, [
      el('div', { class: 'row', style: 'gap:14px' }, [
        el('div', {}, [el('div', { class: 'who' }, st.name), el('div', { class: 'muted', style: 'font-size:12px' }, st.cohort || '—')]),
        canEnter ? null : el('span', { class: 'pill bad' }, 'consent ' + st.consent_status),
      ]),
      el('div', { class: 'row', style: 'gap:16px' }, [
        el('div', {}, [el('div', { class: 'progress-track' }, [el('span', { style: `width:${Math.round((st.measurements / total) * 100)}%` })]),
          el('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' }, st.measurements ? `${st.measurements}/${total} tests` : 'not started')]),
        el('button', { class: 'btn small' + (canEnter ? '' : ' subtle'), disabled: canEnter ? null : '', onclick: () => canEnter && go('#/assess/' + sessionId + '/' + st.student_id) }, st.measurements ? 'Edit / retest' : 'Enter results'),
      ]),
    ]));
  }
  root.append(list);
}

// ---- ASSESSMENT: full-page data entry -------------------------------------
function clientValidate(test, attempts) {
  const nums = attempts.filter((a) => a !== '' && a != null).map(Number).filter((x) => Number.isFinite(x));
  if (!nums.length) return { status: null, value: null };
  const impossible = nums.some((a) => a < test.hardMin || a > test.hardMax);
  const implausible = nums.some((a) => a < test.min || a > test.max);
  const value = test.direction === 'lower' ? Math.min(...nums) : Math.max(...nums);
  return { status: impossible ? 'invalid' : implausible ? 'review' : 'ok', value };
}

async function viewAssessEntry(root, sessionId, studentId) {
  root.innerHTML = '';
  // prefill existing values for this session, if any
  const passport = await api('/students/' + studentId + '/passport').catch(() => null);
  const student = passport?.student;
  const existing = {};
  if (passport) for (const m of passport.measurement_history) if (m.session_id === sessionId && existing[m.test_id] == null) existing[m.test_id] = m.attempts;

  root.append(crumb('Roster', '#/assess/' + sessionId));
  root.append(el('div', { class: 'section-title' }, [
    el('div', {}, [el('h2', {}, 'Record Results — ' + (student?.name || studentId)),
      el('div', { class: 'sub' }, `${student?.school_name || ''} · ${student?.cohort || ''} · session ${sessionId}`)]),
  ]));
  root.append(el('div', { class: 'banner info' }, 'Enter attempt values in each test\'s unit. Live checks flag out-of-range readings before you save — impossible values are rejected, implausible ones marked for review (US-02).'));

  const inputsByTest = {};
  const grid = el('div', { class: 'assess-grid' });
  for (const t of S.config.tests) {
    const nAtt = Math.min(t.attempts, 3);
    const status = el('div', { class: 'entry-status' });
    const attInputs = [];
    const attRow = el('div', { class: 'attempts' });
    const pre = existing[t.id] || [];
    for (let i = 0; i < nAtt; i++) {
      const inp = el('input', { type: 'number', step: 'any', placeholder: nAtt > 1 ? `try ${i + 1}` : t.unit, value: pre[i] != null ? pre[i] : null });
      inp.addEventListener('input', recompute);
      attInputs.push(inp); attRow.append(inp);
    }
    inputsByTest[t.id] = attInputs;
    function recompute() {
      const vals = attInputs.map((x) => x.value);
      const r = clientValidate(t, vals);
      status.className = 'entry-status' + (r.status ? ' ' + r.status : '');
      status.textContent = r.status == null ? '' : r.status === 'ok' ? `✓ best ${r.value} ${t.unit}` : r.status === 'review' ? `⚠ implausible — will be marked needs-review (best ${r.value})` : '✗ impossible value — will be rejected';
    }
    const card = el('div', { class: 'test-card' }, [
      el('div', { class: 'tname' }, t.name),
      el('div', { class: 'tmeta' }, `${t.unit} · ${t.direction === 'lower' ? 'lower is better' : t.direction === 'higher' ? 'higher is better' : 'context'} · best of ${t.attempts}`),
      attRow, status,
      el('div', { class: 'valrange' }, `valid range ${t.min}–${t.max} ${t.unit}`),
    ]);
    grid.append(card); recompute();
  }
  root.append(grid);

  const bar = el('div', { class: 'row', style: 'position:sticky;bottom:0;background:var(--bg);border-top:1px solid var(--line);padding:16px 0;margin-top:20px;justify-content:flex-end;gap:10px;z-index:5' }, [
    el('button', { class: 'btn ghost', onclick: () => go('#/assess/' + sessionId) }, 'Cancel'),
    el('button', { class: 'btn', onclick: () => save(true) }, 'Save & generate profile'),
  ]);
  root.append(bar);

  async function save(generate) {
    const results = [];
    for (const [id, inputs] of Object.entries(inputsByTest)) {
      const attempts = inputs.map((x) => x.value).filter((v) => v !== '');
      if (attempts.length) results.push({ test_id: id, attempts: attempts.map(Number) });
    }
    if (!results.length) return toast('Enter at least one value');
    const isRetest = Object.keys(existing).length > 0;
    const r = await api('/measurements', { method: 'POST', body: { sessionId, studentId, results, isRetest } });
    const bad = r.recorded.filter((x) => x.validity !== 'valid').length;
    if (generate) await api('/students/' + studentId + '/generate', { method: 'POST' });
    toast(`Saved ${r.recorded.length} results${bad ? `, ${bad} flagged` : ''}. Profile updated.`);
    go('#/student/' + studentId);
  }
}

// ---- STUDENT SPORTS PASSPORT (full page) ----------------------------------
async function viewPassport(root, studentId) {
  root.innerHTML = '';
  const d = await api('/students/' + studentId + '/passport');
  const st = d.student;
  const backHash = ['district_specialist', 'state_admin', 'platform_admin'].includes(S.user.role) ? '#/talent' : '#/teacher';
  root.append(crumb('Back', backHash));

  root.append(el('div', { class: 'section-title' }, [
    el('div', {}, [el('h2', { style: 'font-size:26px' }, st.name),
      el('div', { class: 'sub' }, `${st.school_name} · ${st.district_name} · ${st.cohort || ''} · ${st.sex || ''} · b.${st.birth_year || '—'}`)]),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn ghost', onclick: () => reassess(studentId) }, '↻ Reassess'),
      el('button', { class: 'btn subtle', onclick: () => go('#/assess') }, 'Add measurements'),
    ]),
  ]));

  if (st.consent_status !== 'granted') root.append(el('div', { class: 'banner warn' }, 'Consent not granted — assessment & recommendations are restricted (minor-safe governance, §17).'));

  const sc = d.recommendation?.scores || {};
  root.append(el('div', { class: 'grid cols-4' }, [
    miniStat('Assessment validity', pct(sc.assessment_validity ?? d.profile.validityScore)),
    miniStat('Evidence completeness', pct(sc.evidence_completeness ?? d.profile.evidenceCompleteness)),
    miniStat('Opportunity context', sc.opportunity_context == null ? '—' : sc.opportunity_context + '/100'),
    miniStat('Referral priority', d.recommendation?.referral_priority ?? '—', d.recommendation?.priority_tier),
  ]));

  root.append(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    el('div', { class: 'card' }, [el('h3', {}, 'Capability Profile'),
      el('div', { class: 'row', style: 'justify-content:center' }, [radar(d.profile.domainScores, S.config.domains)]),
      el('p', { class: 'hint', style: 'text-align:center;margin-top:8px' }, 'Age/sex-normalised (0–100). Dashed ring = reference average (50).')]),
    el('div', { class: 'card' }, [el('h3', {}, 'Domain Scores'), domainBars(d.profile.domainScores, S.config.domains)]),
  ]));

  const recWrap = el('div', { class: 'card', style: 'margin-top:16px' }, [el('h3', {}, 'Sports to Explore — exploration set, not a final selection')]);
  if (d.recommendation?.exploration_set?.length) d.recommendation.exploration_set.forEach((r, i) => recWrap.append(recoCard(r, i === 0)));
  else recWrap.append(el('p', { class: 'muted' }, 'No recommendations yet — complete the baseline battery.'));
  root.append(recWrap);

  if (d.recommendation?.opportunity?.level === 'low') root.append(el('div', { class: 'banner info', style: 'margin-top:14px' },
    '⚖️ Equity note: limited sport exposure / coaching access detected. A lower reading is treated as limited opportunity, not limited ability — an exploration session is recommended (§7.7).'));

  if (d.narrative) root.append(el('div', { class: 'card', style: 'margin-top:16px' }, [el('h3', {}, 'Plain-language Report'), el('div', {}, d.narrative.lines.map((l) => el('p', { style: 'margin:.4rem 0' }, l)))]));

  if (d.trajectory?.hasTrend) {
    const t = d.trajectory;
    const rows = Object.values(t.domains).map((dm) => el('div', { class: 'domain-row' }, [
      el('span', { class: 'dl' }, dm.label),
      el('div', { class: 'row', style: 'gap:6px' }, [el('span', { class: 'mono muted' }, dm.from), el('span', {}, '→'), el('span', { class: 'mono' }, dm.to)]),
      el('span', { class: 'pill ' + (dm.trend === 'rapid_improvement' ? 'hi' : dm.trend === 'improving' ? 'good' : dm.trend === 'regression' ? 'bad' : 'low') }, dm.trend.replace(/_/g, ' ')),
    ]));
    root.append(el('div', { class: 'card', style: 'margin-top:16px' }, [el('h3', {}, `Longitudinal Trajectory · ${t.cycles} cycles`), el('div', { class: 'banner ' + (t.rapidImprover ? 'info' : 'warn') }, t.headline), ...rows]));
  }

  // measurements + provenance
  const mtb = el('tbody');
  for (const m of d.current_measurements) mtb.append(el('tr', {}, [
    el('td', {}, m.test_name), el('td', { class: 'mono' }, `${fmt(m.value)} ${m.unit || ''}`),
    el('td', {}, el('span', { class: 'pill ' + (m.validity === 'valid' ? 'good' : m.validity === 'needs_review' ? 'moderate' : 'bad') }, m.validity.replace(/_/g, ' '))),
    el('td', { class: 'muted' }, (m.flags || []).join(', ') || '—'), el('td', { class: 'muted mono' }, m.session_date),
  ]));
  root.append(el('div', { class: 'card pad0', style: 'margin-top:16px' }, [el('div', { class: 'card-head' }, el('h3', {}, 'Current Measurements & Provenance')),
    el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['Test', 'Value', 'Validity', 'Flags', 'Cycle'].map((h) => el('th', {}, h)))), mtb])])]));
  if (d.recommendation_meta) root.append(el('p', { class: 'hint', style: 'margin-top:10px' }, `Provenance: generated by ${d.recommendation_meta.model_version} on protocol ${d.recommendation_meta.protocol_version} at ${new Date(d.recommendation_meta.created_at).toLocaleString()} — input snapshot stored for audit (US-10, §20).`));

  // inline specialist actions (no modal)
  const canObserve = ['coach', 'district_specialist', 'state_admin'].includes(S.user.role);
  const canRefer = ['district_specialist', 'state_admin', 'school_admin'].includes(S.user.role);
  if (canObserve || canRefer) {
    const panel = el('div', { class: 'card', style: 'margin-top:16px' }, [el('h3', {}, 'Specialist Actions')]);
    const forms = el('div', { class: 'grid cols-2' });
    if (canObserve) forms.append(observationForm(studentId));
    if (canRefer) forms.append(referralForm(studentId, d.recommendation));
    panel.append(forms); root.append(panel);
  }

  if (d.observations.length || d.referrals.length) {
    const list = el('div', { class: 'card', style: 'margin-top:16px' });
    if (d.referrals.length) { list.append(el('h3', {}, 'Referrals')); for (const r of d.referrals) list.append(el('div', { class: 'row spread', style: 'padding:8px 0;border-bottom:1px solid var(--line-2)' }, [el('span', {}, `${r.source_level} → ${r.destination.replace(/_/g, ' ')}`), el('span', { class: 'row', style: 'gap:8px' }, [tier(r.status), el('span', { class: 'muted mono' }, (r.date || '').slice(0, 10))])])); }
    if (d.observations.length) { list.append(el('h3', { style: 'margin-top:12px' }, 'Observations')); for (const o of d.observations) list.append(el('div', { style: 'padding:8px 0;border-bottom:1px solid var(--line-2)' }, [el('b', {}, (o.observer_name || 'Specialist') + ': '), el('span', {}, (o.recommendation || '').replace(/_/g, ' ') + ' '), el('span', { class: 'muted' }, o.notes || '')])); }
    root.append(list);
  }
}

function miniStat(lbl, val, pillTier) { return el('div', { class: 'card stat' }, [el('div', { class: 'num', style: 'font-size:24px' }, [String(val), pillTier ? ' ' : null, pillTier ? tier(pillTier) : null]), el('div', { class: 'lbl' }, lbl)]); }
function recoCard(r, lead) {
  const c = el('div', { class: 'reco' + (lead ? ' lead' : '') });
  c.append(el('div', { class: 'top' }, [
    el('div', {}, [el('div', { class: 'sname' }, `${r.sport} — ${r.discipline}`), el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, `evidence: ${r.evidence_level} · stage: ${r.dev_stage} · next: ${r.next_action.replace(/_/g, ' ')}`)]),
    el('div', { style: 'text-align:right' }, [el('div', { class: 'fitnum', style: `color:${scoreColor(r.fit_signal)}` }, r.fit_signal), el('span', { class: 'pill ' + r.confidence_band.toLowerCase() }, r.confidence_band + ' confidence')]),
  ]));
  const reasons = el('div', { class: 'reasons' });
  for (const rc of r.reasons) reasons.append(el('span', { class: 'chip' }, '✓ ' + rc));
  for (const me of r.missing_evidence) reasons.append(el('span', { class: 'chip miss' }, '⚠ ' + me));
  c.append(reasons);
  return c;
}
async function reassess(id) { await api('/students/' + id + '/generate', { method: 'POST' }); toast('Recommendation regenerated (previous kept in history).'); render(); }

function observationForm(studentId) {
  const wrap = el('div', { class: 'card', style: 'box-shadow:none' }, [el('h3', {}, 'Add Specialist Observation (US-06)')]);
  const sport = el('select'); for (const s of S.config.sports) sport.append(el('option', { value: s.id }, `${s.sport} — ${s.discipline}`));
  const rec = el('select'); ['continue', 'explore', 'specialist_review', 'pathway_consideration'].forEach((o) => rec.append(el('option', { value: o }, o.replace(/_/g, ' '))));
  const conf = el('select'); ['low', 'medium', 'high'].forEach((o) => conf.append(el('option', { value: o }, o)));
  const notes = el('textarea', { rows: 2, placeholder: 'Sport-specific technical / game observation…' });
  wrap.append(field('Sport', sport), field('Recommendation', rec), field('Confidence', conf), field('Notes', notes),
    el('button', { class: 'btn', onclick: async () => { await api('/observations', { method: 'POST', body: { student_id: studentId, sport_id: sport.value, recommendation: rec.value, confidence: conf.value, notes: notes.value } }); toast('Observation added'); render(); } }, 'Save observation'));
  return wrap;
}
function referralForm(studentId, reco) {
  const wrap = el('div', { class: 'card', style: 'box-shadow:none' }, [el('h3', {}, 'Create Referral (§7.10)')]);
  wrap.append(el('p', { class: 'hint', style: 'margin-bottom:10px' }, `Priority ${reco?.referral_priority ?? '—'} (${reco?.priority_tier ?? ''}). Private pathway routing — never a public ranking.`));
  const dest = el('select'); ['district_camp', 'sdat', 'sai', 'academy', 'federation', 'school_team'].forEach((o) => dest.append(el('option', { value: o }, o.replace(/_/g, ' '))));
  const status = el('select'); ['potential_signal', 'proven_performance', 'shortlisted', 'confirmed_pathway'].forEach((o) => status.append(el('option', { value: o }, o.replace(/_/g, ' '))));
  const reason = el('textarea', { rows: 2, placeholder: 'Reason / context' });
  wrap.append(field('Destination', dest), field('Status', status), field('Reason', reason),
    el('button', { class: 'btn', onclick: async () => { await api('/referrals', { method: 'POST', body: { student_id: studentId, destination: dest.value, status: status.value, reason: reason.value, source_level: 'school' } }); toast('Referral created'); render(); } }, 'Create referral'));
  return wrap;
}
function field(label, input) { return el('div', { class: 'field' }, [el('label', {}, label), input]); }

// ---- TALENT POOL -----------------------------------------------------------
async function viewTalentPool(root) {
  root.innerHTML = '';
  const isDistrict = ['district_specialist', 'state_admin', 'platform_admin'].includes(S.user.role);
  const scopeParam = isDistrict ? 'districtId=' + (homeDistrict() || '') : 'schoolId=' + (homeSchool() || '');
  root.append(el('div', { class: 'section-title' }, [el('div', {}, [el('h2', {}, 'Talent Pool & Referrals'), el('div', { class: 'sub' }, 'Ranked by referral priority — potential signal ≠ proven performance ≠ confirmed pathway (§7.10)')])]));
  root.append(talentTable(await api('/talent-pool?' + scopeParam)));
}
function talentTable(pool) {
  const tb = el('tbody');
  for (const p of pool) tb.append(el('tr', { class: 'click', onclick: () => go('#/student/' + p.student_id) }, [
    el('td', {}, el('b', {}, p.name)), el('td', { class: 'muted' }, p.school_name),
    el('td', {}, el('span', { class: 'pill ' + (p.low_access ? 'bad' : 'low') }, p.school_type)),
    el('td', {}, p.top_sport || '—'), el('td', {}, p.top_confidence ? el('span', { class: 'pill ' + p.top_confidence.toLowerCase() }, p.top_confidence) : '—'),
    el('td', {}, p.opportunity_level ? el('span', { class: 'pill ' + (p.opportunity_level === 'low' ? 'moderate' : 'low') }, p.opportunity_level) : '—'),
    el('td', {}, p.priority_tier ? tier(p.priority_tier) : '—'), el('td', { class: 'mono' }, p.referral_priority ?? '—'),
    el('td', {}, p.referral_status ? el('span', { class: 'pill hi' }, p.referral_status.replace(/_/g, ' ')) : '—'),
  ]));
  return el('div', { class: 'card pad0' }, [el('div', { class: 'tbl-wrap' }, [el('table', {}, [
    el('thead', {}, el('tr', {}, ['Student', 'School', 'Type', 'Top exploration', 'Confidence', 'Opportunity', 'Priority', 'Score', 'Referral'].map((h) => el('th', {}, h)))), tb])])]);
}

// ---- COACH -----------------------------------------------------------------
async function viewCoach(root) {
  root.innerHTML = '';
  root.append(el('div', { class: 'section-title' }, [el('div', {}, [el('h2', {}, 'Referred Athletes'), el('div', { class: 'sub' }, 'Review referred students, add sport-specific observations, track development (US-06, §7.9)')])]));
  const pool = await api('/talent-pool?districtId=' + (homeDistrict() || 'D-CHN'));
  const referred = pool.filter((p) => p.referral_status);
  if (!referred.length) return root.append(el('div', { class: 'banner info' }, 'No referred athletes in this district yet.'));
  root.append(talentTable(referred));
}

// ---- DISTRICT DASHBOARD ----------------------------------------------------
async function viewDistrict(root) {
  root.innerHTML = '';
  let districtId = homeDistrict();
  const picker = await districtPicker((v) => { S.scope.districtId = v; render(); });
  if (!districtId) districtId = picker.value;
  const d = await api('/dashboard/district?districtId=' + districtId);
  const f = d.funnel;
  root.append(el('div', { class: 'section-title' }, [el('div', {}, [el('h2', {}, 'District Sports Intelligence'), el('div', { class: 'sub' }, 'Coverage, equity and the talent funnel')]), picker]));

  const steps = [['Screened', f.screened], ['Flagged', f.flagged], ['Exposed', f.exposed], ['Assessed', f.assessed], ['Referred', f.referred], ['Progressed', f.progressed]];
  root.append(el('div', { class: 'card' }, [el('h3', {}, 'Talent Funnel (pilot validation §17/§18)'),
    el('div', { class: 'grid', style: 'grid-template-columns:repeat(6,1fr)' }, steps.map(([l, v]) => el('div', { class: 'stat', style: 'text-align:center' }, [el('div', { class: 'num', style: 'font-size:28px;color:var(--brand)' }, v), el('div', { class: 'lbl' }, l)])))]));

  root.append(el('div', { class: 'grid cols-4', style: 'margin-top:16px' }, [
    statCard(d.specialist_workload, 'Specialist queue', 'high-priority, unreferred', true),
    statCard(d.schools.length, 'Schools', 'in district'),
    statCard(d.talent_pool.filter((p) => p.priority_tier === 'high').length, 'High priority', 'students'),
    statCard(d.equity.reduce((s, e) => s + e.low_access, 0), 'Low-access students', 'equity focus'),
  ]));

  const stb = el('tbody');
  for (const sc of d.schools) stb.append(el('tr', {}, [el('td', {}, el('b', {}, sc.name)), el('td', {}, el('span', { class: 'pill ' + (sc.low_access ? 'bad' : 'low') }, `${sc.type}/${sc.setting}`)), el('td', { class: 'mono' }, sc.students), el('td', {}, heat(sc.coverage_pct)), el('td', { class: 'mono' }, sc.high_priority)]));
  root.append(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    el('div', { class: 'card pad0' }, [el('div', { class: 'card-head' }, el('h3', {}, 'School Coverage Heatmap')), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['School', 'Type', 'Students', 'Coverage', 'High-prio'].map((h) => el('th', {}, h)))), stb])])]),
    el('div', { class: 'card' }, [el('h3', {}, 'Equity — flag rate by school type'), equityBars(d.equity)]),
  ]));
  root.append(el('div', { class: 'section-title', style: 'margin-top:20px' }, [el('h2', { style: 'font-size:18px' }, 'Talent Pool')]));
  root.append(talentTable(d.talent_pool));
}
function equityBars(rows) {
  const wrap = el('div');
  for (const r of rows) wrap.append(el('div', { class: 'domain-row' }, [el('span', { class: 'dl' }, r.school_type), el('div', { class: 'bar' }, [el('span', { style: `width:${r.flag_rate}%` })]), el('span', { class: 'dv mono' }, r.flag_rate + '%')]));
  wrap.append(el('p', { class: 'hint', style: 'margin-top:8px' }, 'Monitor for access-related bias (§19). Divergent flag rates warrant review, not automatic correction.'));
  return wrap;
}

// ---- STATE DASHBOARD -------------------------------------------------------
async function viewState(root) {
  root.innerHTML = '';
  root.append(el('div', { class: 'section-title' }, [el('div', {}, [el('h2', {}, 'State Sports Intelligence — Tamil Nadu'), el('div', { class: 'sub' }, 'System coverage, equity and pilot KPIs')])]));
  const [d, k] = await Promise.all([api('/dashboard/state'), api('/kpis')]);
  root.append(el('div', { class: 'card' }, [el('h3', {}, 'Product KPIs (§18)'), el('div', { class: 'grid cols-3' }, k.map((x) => el('div', { class: 'card stat', style: 'box-shadow:none;background:var(--panel-2)' }, [el('div', { class: 'num', style: 'font-size:26px;color:var(--brand)' }, x.value + '%'), el('div', { class: 'lbl' }, x.kpi), el('div', { class: 'sub' }, x.detail)])))]));
  const tb = el('tbody');
  for (const r of d.districts) tb.append(el('tr', { class: 'click', onclick: () => { S.scope.districtId = r.district_id; go('#/district'); } }, [el('td', {}, el('b', {}, r.name)), el('td', { class: 'mono' }, r.students), el('td', {}, heat(r.coverage_pct)), el('td', { class: 'mono' }, r.high_priority), el('td', { class: 'mono' }, r.referrals)]));
  root.append(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    el('div', { class: 'card pad0' }, [el('div', { class: 'card-head' }, el('h3', {}, 'District Comparison')), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['District', 'Students', 'Coverage', 'High-prio', 'Referrals'].map((h) => el('th', {}, h)))), tb])])]),
    el('div', { class: 'card' }, [el('h3', {}, 'System Equity'), equityBars(d.equity)]),
  ]));
}

// ---- GOVERNANCE ------------------------------------------------------------
async function viewGovernance(root) {
  root.innerHTML = '';
  root.append(el('div', { class: 'section-title' }, [el('div', {}, [el('h2', {}, 'Governance — Audit, Models & Protocols'), el('div', { class: 'sub' }, 'Deterministic, auditable rules-first architecture (§8)')])]));
  root.append(el('div', { class: 'banner info' }, 'ML is intentionally OUT of MVP scope until validated longitudinal outcomes and an expert-approved label strategy exist (§8, §16, §21).'));
  const [audit, runs] = await Promise.all([api('/audit?limit=40'), api('/model-runs?limit=20')]);

  const doms = S.config.domains.map((d) => d.id);
  const spTb = el('tbody');
  for (const s of S.config.sports) spTb.append(el('tr', {}, [el('td', {}, `${s.sport} · ${s.discipline}`), ...doms.map((dm) => { const w = s.weights[dm] || 0; return el('td', { class: 'mono', style: `color:${w >= 0.8 ? C.good : w >= 0.5 ? C.warn : C.muted}` }, w ? w.toFixed(1) : '·'); }), el('td', {}, el('span', { class: 'pill ' + (s.evidence_level === 'High' ? 'good' : s.evidence_level === 'Medium' ? 'moderate' : 'low') }, s.evidence_level))]));
  root.append(el('div', { class: 'card pad0' }, [el('div', { class: 'card-head' }, el('h3', {}, 'Versioned Sport Profiles — ' + S.config.versions.sport_profiles)), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, [el('th', {}, 'Sport'), ...S.config.domains.map((d) => el('th', {}, d.label.slice(0, 4))), el('th', {}, 'Evidence')])), spTb])])]));

  const atb = el('tbody');
  for (const a of audit) atb.append(el('tr', {}, [el('td', { class: 'muted mono' }, new Date(a.timestamp).toLocaleString()), el('td', {}, a.actor || '—'), el('td', {}, el('span', { class: 'pill brand' }, a.action.replace(/_/g, ' '))), el('td', { class: 'muted' }, `${a.object_type || ''} ${a.object_id || ''}`)]));
  root.append(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    el('div', { class: 'card pad0' }, [el('div', { class: 'card-head' }, el('h3', {}, 'Audit Trail (§18)')), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['Time', 'Actor', 'Action', 'Object'].map((h) => el('th', {}, h)))), atb])])]),
    el('div', { class: 'card pad0' }, [el('div', { class: 'card-head' }, el('h3', {}, 'Model Runs (provenance)')), el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, el('tr', {}, ['Run', 'Student', 'Model', 'Time'].map((h) => el('th', {}, h)))), el('tbody', {}, runs.map((r) => el('tr', {}, [el('td', { class: 'mono' }, r.run_id), el('td', { class: 'mono' }, r.student_id), el('td', {}, r.model_version), el('td', { class: 'muted mono' }, new Date(r.timestamp).toLocaleTimeString())])))])])]),
  ]));
}

// ---- MY REPORT (parent/student) -------------------------------------------
async function viewMyReport(root) {
  const students = await api('/students?schoolId=' + (S.user.school_id || 'SCH-1'));
  if (!students[0]) { root.innerHTML = ''; return root.append(el('div', { class: 'muted' }, 'No student linked.')); }
  root.innerHTML = '';
  root.append(el('div', { class: 'banner info' }, 'Parent / Student view: plain-language report, recommended exploration and progress — no misleading rank (US-04).'));
  await viewPassportInto(root, students[0].student_id);
}
async function viewPassportInto(root, id) { const holder = el('div'); root.append(holder); await viewPassport(holder, id); }

boot();
