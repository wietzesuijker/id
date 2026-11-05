const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../gaps.js');

const cell = (gap_pct, rg_species, latent_species, latent_obs = latent_species) =>
  ({key: `${gap_pct},${rg_species}`, lat: 50, lon: -120, gap_pct, rg_species, latent_species, latent_obs, poly: [[0, 0], [0, 1], [1, 1], [1, 0]]});

const cells = [cell(10, 100, 5), cell(20, 80, 10), cell(50, 40, 20), cell(60, 30, 30), cell(90, 10, 40), cell(95, 0, 0), cell(99, 2, 8)];

test('share is null only for cells with no species records', () => {
  assert.equal(G.share(cell(95, 0, 0)), null);
  assert.equal(G.share(cell(1, 0, 3)), 1);
  assert.equal(G.share(cell(1, 3, 1)), 0.25);
});

test('cells without records are grey and get no class', () => {
  const k = G.cuts(cells);
  assert.equal(G.cls(cell(95, 0, 0), k), -1);
  assert.equal(G.colour(cell(95, 0, 0), 'verdict', k), G.NONE);
});

test('bivariate class puts high gap, high share top right', () => {
  const k = G.cuts(cells);
  assert.equal(G.cls(cell(99, 2, 8), k), 8);
  assert.equal(G.cls(cell(10, 100, 5), k), 0);
});

test('summary counts top-third cells holding latent species', () => {
  const k = G.cuts(cells);
  const s = G.summary(cells, k);
  assert.equal(s.n, 7);
  assert.ok(s.top >= 2);
  assert.equal(s.latentObs, 113);
  assert.ok(s.topWithLatentPct > 0 && s.topWithLatentPct <= 100);
  const top = cells.filter(c => c.gap_pct > k.rec[1]);
  assert.equal(s.topGainPct, Math.round(100 * top.reduce((a, c) => a + c.latent_species, 0) / top.reduce((a, c) => a + c.rg_species, 0)));
});

test('identifyFirst ranks top-gap cells by latent species and skips empty ones', () => {
  const k = G.cuts(cells);
  const top = G.identifyFirst(cells, k, 5);
  assert.ok(top.every(c => c.latent_species > 0 && c.gap_pct > k.rec[1]));
  assert.deepEqual(top.map(c => c.latent_species), [...top.map(c => c.latent_species)].sort((a, b) => b - a));
});

test('empty input does not throw', () => {
  const k = G.cuts([]);
  assert.deepEqual(G.summary([], k), {n: 0, top: 0, topWithLatentPct: 0, medianGainPct: 0, topGainPct: 0, latentObs: 0});
});

test('ramp colours are valid hex across the range', () => {
  const k = G.cuts(cells);
  for (const c of cells) for (const m of ['record', 'identify', 'verdict']) assert.match(G.colour(c, m, k), /^#[0-9a-f]{6}$/);
});

test('verdict follows both tiers', () => {
  const k = {rec: [33, 66], idf: [0.2, 0.4]};
  assert.match(G.verdict(cell(90, 0, 0), k), /No species records/);
  assert.match(G.verdict(cell(90, 10, 40), k), /Both gaps/);
  assert.match(G.verdict(cell(10, 10, 40), k), /already photographed/);
  assert.match(G.verdict(cell(90, 100, 5), k), /Few records wait/);
  assert.match(G.verdict(cell(90, 70, 30), k), /some records also wait/);
  assert.match(G.verdict(cell(50, 70, 30), k), /about as well/);
  assert.match(G.verdict(cell(10, 100, 5), k), /Well recorded/);
});

test('job splits top-gap cells into identify and record, and the lists agree with it', () => {
  const k = G.cuts(cells);
  assert.equal(G.job(cell(99, 2, 8), k), 'identify');
  assert.equal(G.job(cell(95, 0, 0), k), 'record');
  assert.equal(G.job(cell(10, 100, 5), k), null);
  assert.deepEqual(G.recordFirst(cells, k, 5).map(c => c.key), cells.filter(c => G.job(c, k) === 'record').map(c => c.key));
  assert.ok(G.identifyFirst(cells, k, 5).every(c => G.job(c, k) === 'identify'));
});

test('area encodes a ring the way what-to-id decodes it', () => {
  assert.equal(G.area([[0, 0], [0.0001, 0]]), 'AACA');
  assert.equal(G.area([[-0.0001, 0.0016]]), 'BgB');
});
