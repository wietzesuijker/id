// Pure logic for the page: classify cells by recording gap and identification gap. Node tests load it too.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gaps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Joshua Stevens' 3x3 bivariate scheme: index = idf_tertile * 3 + rec_tertile.
  const BIVAR = ['#e8e8e8', '#e4acac', '#c85a5a', '#b0d5df', '#ad9ea5', '#985356', '#64acbe', '#627f8c', '#574249'];
  const NONE = '#9a9a9a';
  const RAMP_REC = ['#f4e4e4', '#e4acac', '#c85a5a', '#7a2f2f'];
  const RAMP_IDF = ['#e4f1f4', '#b0d5df', '#64acbe', '#2c6576'];

  // Share of the species known in a cell that only Needs ID records name; null when the cell has no species records.
  const share = c => (c.rg_species + c.latent_species ? c.latent_species / (c.rg_species + c.latent_species) : null);

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
  }

  // Tertile cut points across BC cells, so each axis splits the province into thirds.
  function cuts(cells) {
    const rec = cells.map(c => c.gap_pct).sort((a, b) => a - b);
    const idf = cells.map(share).filter(s => s !== null).sort((a, b) => a - b);
    return {rec: [quantile(rec, 1 / 3), quantile(rec, 2 / 3)], idf: [quantile(idf, 1 / 3), quantile(idf, 2 / 3)]};
  }

  const tier = (v, [a, b]) => (v > b ? 2 : v > a ? 1 : 0);

  function cls(c, k) {
    const s = share(c);
    return s === null ? -1 : tier(s, k.idf) * 3 + tier(c.gap_pct, k.rec);
  }

  function ramp(stops, t) {
    const x = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2), f = x - i;
    const a = stops[i].match(/\w\w/g).map(h => parseInt(h, 16)), b = stops[i + 1].match(/\w\w/g).map(h => parseInt(h, 16));
    return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * f).toString(16).padStart(2, '0')).join('');
  }

  function colour(c, mode, k) {
    if (mode === 'record') return ramp(RAMP_REC, c.gap_pct / 100);
    const s = share(c);
    if (s === null) return NONE;
    if (mode === 'identify') return ramp(RAMP_IDF, s / Math.max(k.idf[1] * 1.5, 1e-9));
    return BIVAR[cls(c, k)];
  }

  function geojson(cells, mode, k) {
    return {type: 'FeatureCollection', features: cells.map((c, i) => ({type: 'Feature',
      properties: {i, colour: colour(c, mode, k)}, geometry: {type: 'Polygon', coordinates: [[...c.poly, c.poly[0]]]}}))};
  }

  const median = xs => quantile([...xs].sort((a, b) => a - b), 0.5);

  function summary(cells, k) {
    const top = cells.filter(c => tier(c.gap_pct, k.rec) === 2);
    const withRg = top.filter(c => c.rg_species > 0);
    return {
      n: cells.length,
      top: top.length,
      topWithLatentPct: top.length ? Math.round(100 * top.filter(c => c.latent_species > 0).length / top.length) : 0,
      medianGainPct: withRg.length ? Math.round(100 * median(withRg.map(c => c.latent_species / c.rg_species))) : 0,
      // Pooled over cells: species-in-cell records that identifying would add, against those confirmed now.
      topGainPct: Math.round(100 * top.reduce((s, c) => s + c.latent_species, 0) / Math.max(1, top.reduce((s, c) => s + c.rg_species, 0))),
      latentObs: cells.reduce((s, c) => s + c.latent_obs, 0),
    };
  }

  // Cells in the top recording-gap third, most proposed-only species first.
  function identifyFirst(cells, k, n) {
    return cells.filter(c => job(c, k) === 'identify')
      .sort((a, b) => b.latent_species - a.latent_species).slice(0, n);
  }

  // Cells in the top recording-gap third where little or nothing waits for an ID: only a visit helps, largest gap first.
  function recordFirst(cells, k, n) {
    return cells.filter(c => tier(c.gap_pct, k.rec) === 2 && (share(c) === null || tier(share(c), k.idf) === 0))
      .sort((a, b) => b.gap_pct - a.gap_pct).slice(0, n);
  }

  // Two jobs for the map: 'identify' (top recording-gap third, species waiting), 'record' (recordFirst), else null.
  function job(c, k) {
    if (tier(c.gap_pct, k.rec) !== 2) return null;
    if (c.latent_species > 0 && tier(share(c), k.idf) > 0) return 'identify';
    return share(c) === null || tier(share(c), k.idf) === 0 ? 'record' : null;
  }

  function verdict(c, k) {
    const s = share(c);
    if (s === null) return 'No species records here yet. Only a visit can fill this gap.';
    const r = tier(c.gap_pct, k.rec), i = tier(s, k.idf);
    if (i === 2 && r === 2) return 'Both gaps are large. Identify the waiting records first, then a visit can target what is still missing.';
    if (i === 2) return 'Much of what is unknown here is already photographed. Identifying is the fastest way to fill it.';
    if (r === 2) return i === 0 ? 'Few records wait for an ID. New observations are what this cell needs.'
      : 'New observations add the most here, and some records also wait for an ID.';
    if (i === 1) return 'Recorded about as well as the rest of BC, with some records waiting for an ID.';
    return 'Well recorded compared with the rest of BC.';
  }

  return {BIVAR, NONE, RAMP_REC, RAMP_IDF, share, cuts, cls, colour, geojson, summary, identifyFirst, recordFirst, job, verdict};
});
