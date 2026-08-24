// Versioned Sport Profile configuration (Epic 3 §7.5).
// A sport profile is NOT a claim that a test predicts success. It is a
// structured, expert-configurable representation of the physical/movement
// characteristics worth EXPLORING for a sport. Weights are versioned and
// expert-approved coefficients over the capability domains. Editing these does
// not require code changes; each change should bump requirement_version and
// record approver + rationale (persisted in the sport_profile_version table).

// Weights are relative (0-1) across the capability domains from battery.js.
// evidence_level: High | Medium | Emerging — how well-validated the mapping is.
// dev_stage: foundation | exploration | pathway.

export const SPORT_PROFILE_VERSION = 'sportprofiles-v1.0';

export const SPORTS = [
  {
    id: 'athletics_sprints',
    sport: 'Athletics',
    discipline: 'Sprints (100m/200m)',
    dev_stage: 'exploration',
    evidence_level: 'High',
    min_evidence: 0.5,
    weights: { speed: 1.0, power: 0.9, agility: 0.5, strength: 0.4, coordination: 0.4, endurance: 0.1, flexibility: 0.2, balance: 0.2 },
    movement_domains: ['running', 'acceleration'],
  },
  {
    id: 'athletics_middle_distance',
    sport: 'Athletics',
    discipline: 'Middle Distance (800m/1500m)',
    dev_stage: 'exploration',
    evidence_level: 'High',
    min_evidence: 0.5,
    weights: { endurance: 1.0, speed: 0.5, power: 0.3, strength: 0.3, agility: 0.2, flexibility: 0.3, balance: 0.2, coordination: 0.3 },
    movement_domains: ['running'],
  },
  {
    id: 'athletics_jumps',
    sport: 'Athletics',
    discipline: 'Jumps (long/high/triple)',
    dev_stage: 'exploration',
    evidence_level: 'High',
    min_evidence: 0.5,
    weights: { power: 1.0, speed: 0.8, coordination: 0.6, agility: 0.5, strength: 0.4, flexibility: 0.5, balance: 0.5, endurance: 0.1 },
    movement_domains: ['running', 'jumping', 'landing'],
  },
  {
    id: 'athletics_throws',
    sport: 'Athletics',
    discipline: 'Throws (shot/discus/javelin)',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.4,
    weights: { strength: 1.0, power: 0.9, coordination: 0.6, speed: 0.4, flexibility: 0.4, balance: 0.4, agility: 0.3, endurance: 0.1 },
    movement_domains: ['throwing'],
  },
  {
    id: 'football',
    sport: 'Football',
    discipline: 'Outfield',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.5,
    weights: { endurance: 0.9, speed: 0.8, agility: 0.9, coordination: 0.7, power: 0.6, balance: 0.5, strength: 0.4, flexibility: 0.3 },
    movement_domains: ['running', 'change-of-direction', 'kicking'],
  },
  {
    id: 'hockey',
    sport: 'Hockey',
    discipline: 'Field',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.5,
    weights: { agility: 1.0, speed: 0.8, endurance: 0.8, coordination: 0.8, power: 0.5, balance: 0.5, strength: 0.4, flexibility: 0.4 },
    movement_domains: ['running', 'change-of-direction', 'stickwork'],
  },
  {
    id: 'basketball',
    sport: 'Basketball',
    discipline: 'Court',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.5,
    weights: { power: 0.9, agility: 0.9, speed: 0.7, coordination: 0.8, endurance: 0.6, balance: 0.6, strength: 0.5, flexibility: 0.3 },
    movement_domains: ['jumping', 'change-of-direction'],
  },
  {
    id: 'volleyball',
    sport: 'Volleyball',
    discipline: 'Court',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.4,
    weights: { power: 1.0, coordination: 0.8, agility: 0.7, balance: 0.6, speed: 0.5, strength: 0.5, flexibility: 0.4, endurance: 0.4 },
    movement_domains: ['jumping', 'landing'],
  },
  {
    id: 'kabaddi',
    sport: 'Kabaddi',
    discipline: 'Standard',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.4,
    weights: { strength: 0.9, agility: 0.9, power: 0.8, speed: 0.7, balance: 0.6, endurance: 0.6, coordination: 0.6, flexibility: 0.5 },
    movement_domains: ['grappling', 'change-of-direction'],
  },
  {
    id: 'badminton',
    sport: 'Badminton',
    discipline: 'Singles',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.4,
    weights: { agility: 1.0, coordination: 0.9, speed: 0.7, power: 0.6, balance: 0.6, endurance: 0.6, flexibility: 0.5, strength: 0.3 },
    movement_domains: ['change-of-direction', 'lunging', 'striking'],
  },
  {
    id: 'gymnastics',
    sport: 'Gymnastics',
    discipline: 'Artistic',
    dev_stage: 'exploration',
    evidence_level: 'Emerging',
    min_evidence: 0.4,
    weights: { balance: 1.0, flexibility: 0.9, coordination: 0.9, power: 0.7, strength: 0.7, agility: 0.6, speed: 0.3, endurance: 0.3 },
    movement_domains: ['landing', 'rotation', 'balance'],
  },
  {
    id: 'wrestling',
    sport: 'Wrestling',
    discipline: 'Freestyle',
    dev_stage: 'exploration',
    evidence_level: 'Medium',
    min_evidence: 0.4,
    weights: { strength: 1.0, power: 0.8, agility: 0.7, balance: 0.7, coordination: 0.6, endurance: 0.6, speed: 0.4, flexibility: 0.5 },
    movement_domains: ['grappling'],
  },
  {
    id: 'swimming',
    sport: 'Swimming',
    discipline: 'Freestyle (foundation)',
    dev_stage: 'foundation',
    evidence_level: 'Emerging',
    min_evidence: 0.4,
    weights: { endurance: 0.8, power: 0.7, coordination: 0.8, flexibility: 0.6, strength: 0.6, speed: 0.4, balance: 0.3, agility: 0.2 },
    movement_domains: ['aquatic'],
  },
  {
    id: 'boxing',
    sport: 'Boxing',
    discipline: 'Amateur',
    dev_stage: 'exploration',
    evidence_level: 'Emerging',
    min_evidence: 0.4,
    weights: { power: 0.9, speed: 0.8, agility: 0.7, coordination: 0.8, endurance: 0.7, strength: 0.6, balance: 0.6, flexibility: 0.3 },
    movement_domains: ['striking', 'footwork'],
  },
];

export const SPORT_BY_ID = Object.fromEntries(SPORTS.map((s) => [s.id, s]));
