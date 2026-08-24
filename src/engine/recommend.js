// Sport Exploration Recommendation Engine (§7.6) + Opportunity Index (§7.7) +
// interpretable Scoring Architecture (§9).
//
// Design commitments from the PRD:
//  - Output an EXPLORATION SET of 3-5 sports, never a single final label.
//  - Transparent rules + weighted model FIRST; ML only after longitudinal data.
//  - Every recommendation is explainable: reason codes + missing-evidence flags.
//  - Low OPPORTUNITY must not lower a student's capability; it lowers confidence
//    and raises follow-up priority (equity, §2/§7.7).
//  - No single opaque talent score; expose component signals (§9).
import { DOMAINS } from '../config/battery.js';
import { SPORTS } from '../config/sports.js';

export const MODEL_VERSION = 'reco-rules-v1.0';

const DOMAIN_LABEL = Object.fromEntries(DOMAINS.map((d) => [d.id, d.label]));

// ---- Opportunity & Exposure Index (§7.7) ------------------------------------
const PLAY_LEVEL_PTS = { never: 0, recreational: 25, school_team: 55, club: 80, academy: 100 };
const COMP_LEVEL_PTS = { none: 0, school: 30, block: 50, district: 70, state: 90, national: 100 };
const COACH_PTS = { none: 0, pe_teacher: 40, community_coach: 70, specialist_coach: 100 };
const FACILITY_PTS = { school: 30, public: 50, club: 80, academy: 100 };

export function computeOpportunity(exposures = []) {
  if (!exposures.length) {
    return { index: null, level: 'unknown', hasData: false, flags: ['no_sport_exposure_data'] };
  }
  const best = (arr, map) => Math.max(0, ...arr.map((e) => map[e] ?? 0).filter((v) => v != null));
  const play = best(exposures.map((e) => e.play_level), PLAY_LEVEL_PTS);
  const comp = best(exposures.map((e) => e.competition_level), COMP_LEVEL_PTS);
  const coach = best(exposures.map((e) => e.coaching_access), COACH_PTS);
  const facility = best(exposures.map((e) => e.facility_access), FACILITY_PTS);
  const index = Math.round(0.3 * play + 0.3 * comp + 0.25 * coach + 0.15 * facility);
  const level = index >= 70 ? 'high' : index >= 40 ? 'moderate' : 'low';
  const flags = [];
  if (level === 'low') flags.push('low_opportunity_context');
  return { index, level, hasData: true, flags, components: { play, comp, coach, facility } };
}

// ---- Sport Fit Signal for one sport (§9) ------------------------------------
function sportFit(profile, sport) {
  let wUsed = 0, wTotal = 0, contrib = 0;
  const missingDomains = [];
  for (const [domain, weight] of Object.entries(sport.weights)) {
    if (!weight) continue;
    wTotal += weight;
    const score = profile.domainScores[domain];
    if (score == null) {
      if (weight >= 0.6) missingDomains.push(domain);
      continue;
    }
    contrib += weight * score;
    wUsed += weight;
  }
  const fit = wUsed > 0 ? Math.round((contrib / wUsed) * 10) / 10 : null;
  const coverage = wTotal > 0 ? wUsed / wTotal : 0;
  return { fit, coverage, missingDomains };
}

const EVIDENCE_FACTOR = { High: 1.0, Medium: 0.9, Emerging: 0.8 };

function reasonCodes(profile, sport) {
  const reasons = [];
  const strong = [];
  for (const [domain, weight] of Object.entries(sport.weights)) {
    const score = profile.domainScores[domain];
    if (score != null && weight >= 0.6 && score >= 65) strong.push({ domain, score, weight });
  }
  strong.sort((a, b) => b.score * b.weight - a.score * a.weight);
  // Special interpretable combinations.
  const ds = profile.domainScores;
  if (ds.power != null && ds.speed != null && ds.power >= 65 && ds.speed >= 65 && (sport.weights.power >= 0.6 || sport.weights.speed >= 0.6)) {
    reasons.push('unusual power-to-speed combination');
  }
  for (const s of strong.slice(0, 3)) {
    const tag = `high ${DOMAIN_LABEL[s.domain].toLowerCase()} signal`;
    if (!reasons.includes(tag)) reasons.push(tag);
  }
  if (reasons.length === 0) {
    // Fall back to the best available relevant domain, framed as emerging.
    let best = null;
    for (const [domain, weight] of Object.entries(sport.weights)) {
      const score = profile.domainScores[domain];
      if (score == null) continue;
      if (!best || score * weight > best.score * best.weight) best = { domain, score, weight };
    }
    if (best) reasons.push(`emerging ${DOMAIN_LABEL[best.domain].toLowerCase()} signal`);
    else reasons.push('insufficient evidence — assess before interpreting');
  }
  return reasons.slice(0, 3);
}

function confidenceBand(profile, sport, coverage, opportunity) {
  const evidenceFactor = EVIDENCE_FACTOR[sport.evidence_level] ?? 0.8;
  let base = ((coverage + profile.evidenceCompleteness + profile.validityScore) / 3) * evidenceFactor;
  // Low opportunity lowers confidence in a LOW reading, not the score itself.
  if (opportunity && opportunity.level === 'low') base *= 0.9;
  base = Math.round(base * 100) / 100;
  let band = 'Exploratory';
  if (profile.evidenceCompleteness >= sport.min_evidence) {
    if (base >= 0.6) band = 'High';
    else if (base >= 0.4) band = 'Moderate';
  }
  return { band, modelConfidence: base };
}

function missingEvidence(profile, sport, fitInfo, opportunity) {
  const flags = [];
  for (const d of fitInfo.missingDomains) flags.push(`no data for ${DOMAIN_LABEL[d].toLowerCase()}`);
  if (profile.evidenceCompleteness < 1) flags.push('incomplete assessment battery');
  if (!opportunity || !opportunity.hasData) flags.push('no sport exposure data');
  // MVP does not capture biological maturation (§8, §19) -> always caution.
  flags.push('maturity data unavailable');
  return flags;
}

function nextAction(band, profile, opportunity) {
  if (band === 'High') {
    return profile.evidenceCompleteness >= 0.8 ? 'specialist_review' : 'reassessment';
  }
  if (band === 'Moderate') return 'exposure_session';
  if (opportunity && opportunity.level === 'low') return 'exposure_session';
  return 'continue_current';
}

// ---- Main entry -------------------------------------------------------------
// profile: output of buildCapabilityProfile; exposures: exposure rows;
// options: { trajectoryBoost?: 0-100, topN?: number }
export function generateRecommendation(profile, exposures = [], options = {}) {
  const opportunity = computeOpportunity(exposures);
  const topN = options.topN ?? 5;

  const ranked = SPORTS.map((sport) => {
    const fitInfo = sportFit(profile, sport);
    if (fitInfo.fit == null) return null;
    const { band, modelConfidence } = confidenceBand(profile, sport, fitInfo.coverage, opportunity);
    return {
      sport_id: sport.id,
      sport: sport.sport,
      discipline: sport.discipline,
      evidence_level: sport.evidence_level,
      dev_stage: sport.dev_stage,
      fit_signal: fitInfo.fit,
      coverage: Math.round(fitInfo.coverage * 100) / 100,
      confidence_band: band,
      model_confidence: modelConfidence,
      reasons: reasonCodes(profile, sport),
      missing_evidence: missingEvidence(profile, sport, fitInfo, opportunity),
      next_action: nextAction(band, profile, opportunity),
    };
  }).filter(Boolean);

  // Rank by fit signal, tie-break by model confidence. Keep 3-5 (§7.6).
  ranked.sort((a, b) => b.fit_signal - a.fit_signal || b.model_confidence - a.model_confidence);
  const explorationSet = ranked.slice(0, Math.max(3, Math.min(topN, ranked.length)));

  const topFit = explorationSet.length ? explorationSet[0].fit_signal : 0;

  // Referral Priority (§9): operational priority for specialist follow-up.
  // Equity: low opportunity + a real signal RAISES priority; never lowers score.
  const oppScore = opportunity.index ?? 50;
  const trajectoryBoost = options.trajectoryBoost ?? 50;
  const equityWeight = topFit >= 55 ? 1 : 0.3;
  const priorityRaw =
    0.6 * topFit +
    0.25 * (100 - oppScore) * equityWeight +
    0.15 * trajectoryBoost;
  const referralPriority = Math.round(Math.max(0, Math.min(100, priorityRaw)));
  const priorityTier = referralPriority >= 70 ? 'high' : referralPriority >= 45 ? 'medium' : 'low';

  return {
    model_version: MODEL_VERSION,
    exploration_set: explorationSet,
    all_ranked: ranked,
    opportunity,
    scores: {
      assessment_validity: profile.validityScore,
      evidence_completeness: profile.evidenceCompleteness,
      top_sport_fit: topFit,
      opportunity_context: opportunity.index,
      referral_priority: referralPriority,
    },
    referral_priority: referralPriority,
    priority_tier: priorityTier,
    capability_profile: profile.domainScores,
    generated_at: new Date().toISOString(),
  };
}
