// Basic AI narrative report (§8 "Profile summarization" / "Natural-language
// report"). MVP is DETERMINISTIC and TEMPLATE-BASED (no ML) and every claim
// must CITE SOURCE DATA (§8 guardrail). No medical/diagnostic/predictive claims
// (§19). Plain-language, parent-friendly, Tamil label support handled in UI.
import { DOMAINS } from '../config/battery.js';

const DOMAIN_LABEL = Object.fromEntries(DOMAINS.map((d) => [d.id, d.label]));

const ACTION_TEXT = {
  specialist_review: 'a specialist review at the district level',
  reassessment: 'a follow-up reassessment to complete the picture',
  exposure_session: 'a structured try-out session in this sport',
  continue_current: 'continuing current activity and reassessing later',
};

function band(v) {
  if (v == null) return 'not yet measured';
  if (v >= 75) return 'a clear strength';
  if (v >= 60) return 'above the reference average';
  if (v >= 40) return 'around the reference average';
  if (v >= 25) return 'below the reference average';
  return 'an area to develop';
}

// profile: capability profile; reco: generateRecommendation output;
// trajectory: computeTrajectory output; student: { name }
export function buildNarrative({ student, profile, reco, trajectory }) {
  const name = student?.name || 'This student';
  const strengths = DOMAINS
    .map((d) => ({ id: d.id, label: d.label, score: profile.domainScores[d.id] }))
    .filter((d) => d.score != null)
    .sort((a, b) => b.score - a.score);

  const lines = [];
  lines.push(
    `${name}'s baseline sports profile is built from ${profile.testsPresent.length} of ` +
    `${profile.testsPresent.length + profile.testsMissing.length} recommended tests ` +
    `(evidence completeness ${Math.round(profile.evidenceCompleteness * 100)}%, ` +
    `measurement validity ${Math.round(profile.validityScore * 100)}%).`
  );

  if (strengths.length) {
    const top = strengths.slice(0, 2);
    lines.push(
      `Strongest measured areas: ${top.map((t) => `${t.label} (${t.score}/100, ${band(t.score)})`).join(' and ')}. ` +
      `These come directly from the recorded assessment values and are age/sex-normalised.`
    );
  }

  if (reco?.exploration_set?.length) {
    const top = reco.exploration_set[0];
    lines.push(
      `Sports worth EXPLORING (not a final selection): ` +
      reco.exploration_set.map((s) => `${s.sport} — ${s.discipline}`).join('; ') + '. '
    );
    lines.push(
      `The strongest match is ${top.sport} (${top.discipline}) because of ${top.reasons.join(', ')}. ` +
      `Suggested next step: ${ACTION_TEXT[top.next_action] || top.next_action}.`
    );
  } else {
    lines.push('Not enough valid measurements yet to suggest sports to explore — please complete the baseline battery.');
  }

  if (reco?.opportunity?.level === 'low') {
    lines.push(
      'Note on fairness: this student currently has limited sport exposure and coaching access. ' +
      'A lower result here is treated as limited opportunity, not limited ability — an exploration session is recommended before drawing conclusions.'
    );
  }

  if (trajectory?.hasTrend) {
    lines.push(`Progress over ${trajectory.cycles} assessment cycles: ${trajectory.headline}`);
  }

  lines.push(
    'This report describes physical and movement assessment signals only. It is decision support for exploration, ' +
    'not a prediction of future success, and it makes no medical, psychological or injury-risk claims.'
  );

  return { text: lines.join(' \n'), lines, generated_at: new Date().toISOString() };
}
