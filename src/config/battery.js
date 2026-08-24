// Baseline Assessment Battery (Epic 3 §7.2, §7.3)
// Configurable test definitions. Each test declares its objective, unit, valid
// ranges (plausible vs. impossible), attempt/scoring rule, assessor role,
// equipment and the capability DOMAIN it informs. Aligned in spirit with
// Khelo India / Fit India school-level protocols (§7.3) so testing is not
// duplicated. All norms/tests here are marked as an MVP protocol version and
// are meant to be replaced by expert-validated protocols before wider rollout.

// Capability domains that make up the interpretable Capability Profile (§9).
export const DOMAINS = [
  { id: 'speed', label: 'Speed' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'power', label: 'Explosive Power' },
  { id: 'strength', label: 'Strength' },
  { id: 'agility', label: 'Agility' },
  { id: 'flexibility', label: 'Flexibility' },
  { id: 'balance', label: 'Balance' },
  { id: 'coordination', label: 'Coordination' },
];

export const DOMAIN_IDS = DOMAINS.map((d) => d.id);

// direction: 'higher' = higher raw value is better; 'lower' = lower is better.
// hardMin/hardMax: physically impossible -> reject. min/max: plausible band ->
// values outside are flagged "implausible" (Needs Review) but preserved.
export const BATTERY_VERSION = 'battery-v1.0';

export const TESTS = [
  {
    id: 'height_cm',
    name: 'Standing Height',
    domain: 'anthropometry',
    unit: 'cm',
    direction: null,
    hardMin: 70, hardMax: 230, min: 90, max: 210,
    attempts: 1, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Stadiometer / wall scale',
    instructions: 'Barefoot, heels together, head in Frankfort plane.',
  },
  {
    id: 'weight_kg',
    name: 'Body Weight',
    domain: 'anthropometry',
    unit: 'kg',
    direction: null,
    hardMin: 10, hardMax: 200, min: 15, max: 150,
    attempts: 1, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Weighing scale',
    instructions: 'Light clothing, no shoes.',
  },
  {
    id: 'sprint_30m_s',
    name: '30m Sprint',
    domain: 'speed',
    unit: 's',
    direction: 'lower',
    hardMin: 2.5, hardMax: 20, min: 3.5, max: 12,
    attempts: 2, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Measured 30m track, stopwatch',
    instructions: 'Standing start; best of two attempts.',
  },
  {
    id: 'run_600m_s',
    name: '600m Run',
    domain: 'endurance',
    unit: 's',
    direction: 'lower',
    hardMin: 60, hardMax: 900, min: 90, max: 600,
    attempts: 1, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Marked track, stopwatch',
    instructions: 'Age-appropriate distance; record completion time.',
  },
  {
    id: 'standing_broad_jump_cm',
    name: 'Standing Broad Jump',
    domain: 'power',
    unit: 'cm',
    direction: 'higher',
    hardMin: 30, hardMax: 380, min: 60, max: 320,
    attempts: 3, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Measuring tape, non-slip surface',
    instructions: 'Two-foot take-off and landing; best of three.',
  },
  {
    id: 'vertical_jump_cm',
    name: 'Vertical Jump',
    domain: 'power',
    unit: 'cm',
    direction: 'higher',
    hardMin: 2, hardMax: 110, min: 5, max: 90,
    attempts: 3, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Wall + chalk / jump board',
    instructions: 'Reach height subtracted; best of three.',
  },
  {
    id: 'sit_and_reach_cm',
    name: 'Sit and Reach',
    domain: 'flexibility',
    unit: 'cm',
    direction: 'higher',
    hardMin: -30, hardMax: 50, min: -20, max: 40,
    attempts: 2, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Sit-and-reach box',
    instructions: 'Slow reach, hold 2s; best of two.',
  },
  {
    id: 'med_ball_throw_cm',
    name: 'Medicine Ball Throw',
    domain: 'strength',
    unit: 'cm',
    direction: 'higher',
    hardMin: 50, hardMax: 1200, min: 100, max: 900,
    attempts: 2, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Age-appropriate medicine ball, tape',
    instructions: 'Seated overhead throw; best of two.',
  },
  {
    id: 'plank_hold_s',
    name: 'Plank Hold',
    domain: 'strength',
    unit: 's',
    direction: 'higher',
    hardMin: 0, hardMax: 600, min: 0, max: 400,
    attempts: 1, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Mat, stopwatch',
    instructions: 'Hold to failure or protocol cap.',
  },
  {
    id: 'shuttle_run_10x4_s',
    name: '4x10m Shuttle Run',
    domain: 'agility',
    unit: 's',
    direction: 'lower',
    hardMin: 6, hardMax: 40, min: 8, max: 30,
    attempts: 2, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Cones 10m apart, stopwatch',
    instructions: 'Four 10m shuttles; best of two.',
  },
  {
    id: 'flamingo_balance_falls',
    name: 'Flamingo Balance (falls / 60s)',
    domain: 'balance',
    unit: 'count',
    direction: 'lower',
    hardMin: 0, hardMax: 60, min: 0, max: 30,
    attempts: 1, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Balance beam / marked line',
    instructions: 'Count losses of balance in 60 seconds (fewer is better).',
  },
  {
    id: 'movement_screen_score',
    name: 'Movement Screen (composite)',
    domain: 'coordination',
    unit: 'score',
    direction: 'higher',
    hardMin: 0, hardMax: 21, min: 0, max: 21,
    attempts: 1, bestRule: 'best',
    assessorRole: 'pe_teacher',
    equipment: 'Movement screen rubric',
    instructions: 'Seven-pattern movement screen; sum of subscores (0-21).',
  },
];

export const TEST_BY_ID = Object.fromEntries(TESTS.map((t) => [t.id, t]));

// Tests that feed the capability profile (exclude pure context measures).
export const SCORING_TESTS = TESTS.filter((t) => t.domain !== 'anthropometry');

// Age bands used for age/category normalisation (§3, §7.3).
export function ageBandFor(ageYears) {
  if (ageYears == null) return 'U15';
  if (ageYears <= 10) return 'U11';
  if (ageYears <= 12) return 'U13';
  if (ageYears <= 14) return 'U15';
  if (ageYears <= 16) return 'U17';
  return 'U19';
}

export const AGE_BANDS = ['U11', 'U13', 'U15', 'U17', 'U19'];
