// Offline smoke test of the intelligence pipeline (no server needed).
// Exercises validation -> capability profile -> recommendation -> trajectory
// against fixed inputs and asserts the core PRD guarantees. Run: npm run smoke
import { validateMeasurement, sessionValidity } from '../src/engine/validate.js';
import { buildCapabilityProfile } from '../src/engine/capability.js';
import { generateRecommendation } from '../src/engine/recommend.js';
import { computeTrajectory } from '../src/engine/trajectory.js';
import { buildNarrative } from '../src/engine/narrative.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } }

console.log('\nMeasurement validation');
ok('rejects impossible value', validateMeasurement('vertical_jump_cm', [999]).validity === 'invalid');
ok('flags implausible value as needs_review', validateMeasurement('sprint_30m_s', [12.5]).validity === 'needs_review');
ok('accepts valid value', validateMeasurement('sprint_30m_s', [5.1]).validity === 'valid');
ok('best-of for lower-is-better = min', validateMeasurement('sprint_30m_s', [5.4, 5.1]).value === 5.1);
ok('best-of for higher-is-better = max', validateMeasurement('standing_broad_jump_cm', [180, 195]).value === 195);
ok('session validity score computed', sessionValidity([{ validity: 'valid' }, { validity: 'needs_review' }]).score === 0.75);

console.log('\nCapability profile + recommendation');
const student = { birth_year: 2012, sex: 'M' };
const measurements = [
  { test_id: 'sprint_30m_s', value: 4.4, validity: 'valid' },     // very fast
  { test_id: 'standing_broad_jump_cm', value: 250, validity: 'valid' }, // powerful
  { test_id: 'vertical_jump_cm', value: 55, validity: 'valid' },
  { test_id: 'run_600m_s', value: 175, validity: 'valid' },
  { test_id: 'shuttle_run_10x4_s', value: 10.5, validity: 'valid' },
  { test_id: 'sit_and_reach_cm', value: 8, validity: 'valid' },
  { test_id: 'med_ball_throw_cm', value: 500, validity: 'valid' },
  { test_id: 'plank_hold_s', value: 90, validity: 'valid' },
  { test_id: 'flamingo_balance_falls', value: 3, validity: 'valid' },
  { test_id: 'movement_screen_score', value: 16, validity: 'valid' },
];
const profile = buildCapabilityProfile(measurements, student, new Date('2026-02-10'));
ok('speed domain scores high for fast sprinter', profile.domainScores.speed > 70);
ok('power domain scores high', profile.domainScores.power > 65);
ok('evidence completeness = 1 with full battery', profile.evidenceCompleteness === 1);

const reco = generateRecommendation(profile, [{ play_level: 'never', competition_level: 'none', coaching_access: 'none', facility_access: 'school' }]);
ok('produces 3-5 exploration sports', reco.exploration_set.length >= 3 && reco.exploration_set.length <= 5);
ok('every reco has reason codes', reco.exploration_set.every((s) => s.reasons.length > 0));
ok('every reco has confidence band', reco.exploration_set.every((s) => ['High', 'Moderate', 'Exploratory'].includes(s.confidence_band)));
ok('every reco flags maturity data unavailable', reco.exploration_set.every((s) => s.missing_evidence.includes('maturity data unavailable')));
ok('sprint athletics ranks in exploration set for fast+powerful profile', reco.exploration_set.some((s) => s.sport_id === 'athletics_sprints'));
ok('low opportunity flagged', reco.opportunity.level === 'low');
ok('low opportunity raises referral priority (equity)', reco.referral_priority >= 60);
ok('model + versions recorded', !!reco.model_version && reco.scores.evidence_completeness === 1);

console.log('\nLongitudinal trajectory');
const history = [
  { date: '2026-02-10', domainScores: { speed: 50, power: 45, endurance: 40 } },
  { date: '2026-08-15', domainScores: { speed: 78, power: 70, endurance: 62 } },
];
const traj = computeTrajectory(history);
ok('detects improvement over 2 cycles', traj.hasTrend && traj.avgDelta > 10);
ok('flags rapid improver', traj.rapidImprover === true);

console.log('\nNarrative');
const narr = buildNarrative({ student: { name: 'Test Kid' }, profile, reco, trajectory: traj });
ok('narrative cites evidence completeness', /evidence completeness/i.test(narr.text));
ok('narrative disclaims prediction', /not a prediction/i.test(narr.text));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
