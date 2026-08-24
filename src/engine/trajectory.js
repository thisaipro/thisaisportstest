// Longitudinal Growth & Trajectory (§7.8, §9 Development Trajectory).
// Works on a time-ordered list of capability profiles (one per session) to
// classify change per domain and produce a development-trajectory signal.
import { DOMAINS } from '../config/battery.js';

const DOMAIN_LABEL = Object.fromEntries(DOMAINS.map((d) => [d.id, d.label]));

// history: [{ date, domainScores, session_id }] oldest -> newest.
export function computeTrajectory(history) {
  if (!history || history.length < 2) {
    return { hasTrend: false, cycles: history?.length ?? 0, trajectoryBoost: 50, domains: {}, headline: history?.length === 1 ? 'Single assessment — trajectory needs a second cycle.' : 'No assessments yet.' };
  }
  const first = history[0];
  const last = history[history.length - 1];
  const domains = {};
  let deltaSum = 0, deltaCount = 0, rapid = 0, regress = 0;

  for (const d of DOMAINS) {
    const a = first.domainScores?.[d.id];
    const b = last.domainScores?.[d.id];
    if (a == null || b == null) continue;
    const delta = Math.round((b - a) * 10) / 10;
    // per-cycle series for min/max detection
    const series = history.map((h) => h.domainScores?.[d.id]).filter((v) => v != null);
    let trend = 'plateau';
    if (delta >= 12) { trend = 'improving'; }
    else if (delta <= -12) { trend = 'regression'; }
    if (delta >= 22) { trend = 'rapid_improvement'; rapid++; }
    if (trend === 'regression') regress++;
    domains[d.id] = { label: DOMAIN_LABEL[d.id], from: a, to: b, delta, trend, series };
    deltaSum += delta; deltaCount++;
  }

  const avgDelta = deltaCount ? deltaSum / deltaCount : 0;
  // Map average delta (-30..+30 typical) to a 0-100 trajectory boost around 50.
  const trajectoryBoost = Math.round(Math.max(0, Math.min(100, 50 + avgDelta * 1.5)));
  const rapidImprover = rapid > 0 && regress === 0;

  let headline;
  if (rapidImprover) headline = 'Rapid development detected — was lower-signal, improving quickly (prioritise reassessment).';
  else if (avgDelta >= 6) headline = 'Consistent improvement across domains.';
  else if (avgDelta <= -6) headline = 'Overall regression — review load, health context and measurement quality.';
  else headline = 'Stable trajectory — within normal variation between cycles.';

  return {
    hasTrend: true,
    cycles: history.length,
    avgDelta: Math.round(avgDelta * 10) / 10,
    trajectoryBoost,
    rapidImprover,
    domains,
    headline,
    span: { from: first.date, to: last.date },
  };
}
