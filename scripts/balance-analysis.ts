import { decodeOutcome, POINTS, type SamplingDesign } from './balance-design';

const minimumEvidence = 200;
const minimumEffect = 0.03;
const ridge = 32;

interface LevelTotals {
  pairs: number;
  lineups: number;
  wins: number;
  draws: number;
  scoreSquares: number;
  weightedScore: number;
  weightSquares: number;
}

function addLevel(totals: LevelTotals, wins: number, draws: number, both: boolean): void {
  const weight = both ? 2 : 1;
  const score = both ? 1 : (wins + draws / 2) / 2;
  totals.pairs++;
  totals.lineups += weight;
  totals.wins += both ? 2 - draws : wins;
  totals.draws += draws * weight;
  totals.scoreSquares += score ** 2;
  totals.weightedScore += weight * score;
  totals.weightSquares += weight ** 2;
}

function fold(index: number): number {
  return (Math.imul(index + 1, 0x9e3779b9) >>> 29) & 1;
}

interface FitInput {
  matrix: Float64Array;
  target: Float64Array;
}

function addTrainingMatch(input: FitInput, a: number[], b: number[], score: number): void {
  const {matrix, target} = input;
  const size = target.length;
  const features = a.concat(b);
  for (let i = 0; i < features.length; i++) {
    const x = features[i];
    const sign = i < a.length ? 1 : -1;
    target[x] += sign * (score - 0.5);
    matrix[x * size + x]++;
    for (let j = 0; j < i; j++) {
      const y = features[j];
      const product = sign * (j < a.length ? 1 : -1);
      if (x === y) matrix[x * size + x] += 2 * product;
      else matrix[Math.max(x, y) * size + Math.min(x, y)] += product;
    }
  }
}

// Cholesky solve of (X'X + ridge*I)w = X'(score - .5). Only the
// lower triangle is needed and is replaced in place by the factor.
function fitAdditive({matrix, target}: FitInput): Float64Array {
  const size = target.length;
  for (let i = 0; i < size; i++) {
    const row = i * size;
    for (let j = 0; j <= i; j++) {
      const prior = j * size;
      let value = matrix[row + j];
      for (let k = 0; k < j; k++) value -= matrix[row + k] * matrix[prior + k];
      matrix[row + j] = i === j ? Math.sqrt(value + ridge) : value / matrix[prior + j];
    }
  }
  const weights = target.slice();
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < i; j++) weights[i] -= matrix[i * size + j] * weights[j];
    weights[i] /= matrix[i * size + i];
  }
  for (let i = size - 1; i >= 0; i--) {
    for (let j = i + 1; j < size; j++) weights[i] -= matrix[j * size + i] * weights[j];
    weights[i] /= matrix[i * size + i];
  }
  return weights;
}

interface PairTotals {
  count: Uint32Array;
  observed: Float64Array;
  residual: Float64Array;
  squares: Float64Array;
}

function pairTotals(size: number): PairTotals {
  return {count: new Uint32Array(size * size), observed: new Float64Array(size * size), residual: new Float64Array(size * size), squares: new Float64Array(size * size)};
}

function addPair(totals: PairTotals, slot: number, observed: number, residual: number): void {
  totals.count[slot]++;
  totals.observed[slot] += observed;
  totals.residual[slot] += residual;
  totals.squares[slot] += residual * residual;
}

function comparison(effect: number, count: number, standardError: number | null, cutoff: number) {
  const flagged = count >= minimumEvidence && Math.abs(effect) >= minimumEffect && standardError !== null && Math.abs(effect) > cutoff * standardError;
  return {
    lower95: standardError === null ? null : effect - 1.96 * standardError,
    upper95: standardError === null ? null : effect + 1.96 * standardError,
    provisional: count < minimumEvidence,
    flagged,
  };
}

function summarizePairs(totals: PairTotals, design: SamplingDesign) {
  const {skills} = design;
  return skills.flatMap(({id: first}, a) => {
    const rows = [];
    for (let b = a + 1; b < skills.length; b++) {
      const index = a * skills.length + b;
      const pairs = totals.count[index];
      if (!pairs) continue;
      const winScore = totals.observed[index] / pairs;
      const effect = totals.residual[index] / pairs;
      const standardError = pairs < 2 ? null : Math.sqrt(Math.max(0, totals.squares[index] / pairs - effect ** 2) / (pairs - 1));
      rows.push({first, second: skills[b].id, pairs, winScore, expectedScore: winScore - effect, effect, ...comparison(effect, pairs, standardError, 5.1)});
    }
    return rows;
  });
}

function extremes<T extends {pairs: number; effect: number; flagged: boolean}>(rows: T[]) {
  const enough = rows.filter(row => row.pairs >= minimumEvidence);
  const candidates = enough.length ? enough : rows.filter(row => row.pairs > 0);
  const sorted = [...candidates].sort((a, b) => b.effect - a.effect || b.pairs - a.pairs);
  return {
    adequatelySampled: enough.length,
    flagged: enough.filter(row => row.flagged).length,
    highest: sorted.slice(0, 10),
    lowest: sorted.slice(-10).reverse(),
  };
}

export function analyzeBalance(design: SamplingDesign, outcomes: Uint8Array) {
  if (!outcomes.length) throw new Error('实验至少需要完成一对阵容后才能生成报告');
  const {skills} = design;
  const size = skills.length;
  const dimension = size * POINTS.length;
  const levelTotals = Array.from({length: dimension}, (): LevelTotals =>
    ({pairs: 0, lineups: 0, wins: 0, draws: 0, scoreSquares: 0, weightedScore: 0, weightSquares: 0}));
  const fitInputs = [0, 1].map((): FitInput => ({matrix: new Float64Array(dimension * dimension), target: new Float64Array(dimension)}));
  const rightFeatures = new Uint8Array(dimension);
  const leftFeatures = new Uint8Array(dimension);
  let draws = 0;
  let firstSideWins = 0;
  for (let index = 0; index < outcomes.length; index++) {
    const {a, b} = design.drawMatch(index);
    const [forward, reverse] = decodeOutcome(outcomes[index]);
    const matchDraws = Number(forward === 1) + Number(reverse === 1);
    const aWins = Number(forward === 2) + Number(reverse === 2);
    draws += matchDraws;
    firstSideWins += Number(forward === 2) + Number(reverse === 0);
    addTrainingMatch(fitInputs[fold(index)], a, b, (forward + reverse) / 4);
    for (const feature of b) rightFeatures[feature] = 1;
    for (const feature of a) {
      leftFeatures[feature] = 1;
      addLevel(levelTotals[feature], aWins, matchDraws, !!rightFeatures[feature]);
    }
    for (const feature of b) {
      if (!leftFeatures[feature]) addLevel(levelTotals[feature], 2 - aWins - matchDraws, matchDraws, false);
      rightFeatures[feature] = 0;
    }
    for (const feature of a) leftFeatures[feature] = 0;
  }
  const skillLevels = levelTotals.map((totals, feature) => {
    const {id, name, nameEn} = skills[Math.floor(feature / POINTS.length)];
    const {pairs, lineups, wins} = totals;
    const battles = lineups * 2;
    const winScore = battles ? (wins + totals.draws / 2) / battles : null;
    const effect = (winScore ?? 0.5) - 0.5;
    const scatter = totals.scoreSquares - (winScore ?? 0) * 2 * totals.weightedScore + (winScore ?? 0) ** 2 * totals.weightSquares;
    const standardError = pairs < 2 ? null : Math.sqrt(Math.max(0, scatter) * pairs / (pairs - 1)) / lineups;
    return {id, name, nameEn, points: POINTS[feature % POINTS.length], pairs, lineups, battles,
      wins, draws: totals.draws, losses: battles - wins - totals.draws, winRate: battles ? wins / battles : null, winScore, effect, ...comparison(effect, pairs, standardError, 4)};
  });
  const weights = fitInputs.map(fitAdditive);
  const teammates = pairTotals(size);
  const sameHero = pairTotals(size);
  const opposed = pairTotals(size);
  const heroA = new Int8Array(size).fill(-1);
  const heroB = new Int8Array(size).fill(-1);
  for (let index = 0; index < outcomes.length; index++) {
    const {a, b, duplicateModel} = design.drawMatch(index);
    const [forward, reverse] = decodeOutcome(outcomes[index]);
    const observed = (forward + reverse) / 4;
    const fit = weights[1 - fold(index)];
    let predicted = 0.5;
    for (const feature of a) predicted += fit[feature];
    for (const feature of b) predicted -= fit[feature];
    const residual = observed - Math.min(1, Math.max(0, predicted));
    for (const [team, own] of [[a, heroA], [b, heroB]] as const) {
      design.placeTeam(team, duplicateModel).forEach(({features}, heroIndex) => {
        for (const feature of features) own[Math.floor(feature / POINTS.length)] = heroIndex;
      });
    }
    const left = a.map(feature => Math.floor(feature / POINTS.length));
    const right = b.map(feature => Math.floor(feature / POINTS.length));
    for (const [ids, onHero, opposingHero, teamScore, effect] of [
      [left, heroA, heroB, observed, residual],
      [right, heroB, heroA, 1 - observed, -residual],
    ] as const) {
      for (let i = 0; i < ids.length; i++) {
        const x = ids[i];
        for (let j = 0; j < i; j++) {
          const y = ids[j];
          const slot = Math.min(x, y) * size + Math.max(x, y);
          if (opposingHero[x] < 0 || opposingHero[y] < 0) addPair(teammates, slot, teamScore, effect);
          if (onHero[x] === onHero[y] && (opposingHero[x] < 0 || opposingHero[x] !== opposingHero[y])) addPair(sameHero, slot, teamScore, effect);
        }
      }
    }
    for (const x of left) for (const y of right) {
      if (x === y || (heroA[y] >= 0 && heroB[x] >= 0)) continue;
      const slot = Math.min(x, y) * size + Math.max(x, y);
      addPair(opposed, slot, x < y ? observed : 1 - observed, x < y ? residual : -residual);
    }
    for (const skill of left) heroA[skill] = -1;
    for (const skill of right) heroB[skill] = -1;
  }
  const sameTeamPairs = summarizePairs(teammates, design);
  const sameHeroPairs = summarizePairs(sameHero, design);
  const opposedPairs = summarizePairs(opposed, design);
  return {
    overview: {
      pairs: outcomes.length,
      battles: outcomes.length * 2,
      draws,
      firstSideWins,
      threshold: { minimumEvidence, minimumEffect, skillCutoff: 4, pairCutoff: 5.1 },
      skillsByPoints: Object.fromEntries(POINTS.map(points => [points, extremes(skillLevels.filter(row => row.points === points))])),
      sameHero: extremes(sameHeroPairs),
      sameTeam: extremes(sameTeamPairs),
      opposed: extremes(opposedPairs),
    },
    skillLevels,
    sameHeroPairs,
    sameTeamPairs,
    opposedPairs,
  };
}
