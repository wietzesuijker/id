# Record or identify?

Where we know little about a place's species, is the gap out in the field, or already photographed and waiting in the iNaturalist identification queue? This page answers that for each 25 km cell of British Columbia.

**Live:** https://wietzesuijker.github.io/id/

It joins two Blitz the Gap tools. [where-to-blitz](https://pollocklab.github.io/where-to-blitz/) says where to go and record. [what-to-id](https://pollocklab.github.io/what-to-id/) says what to identify. Both answer half of one question: where does an hour of volunteer time add the most to what we know?

## The two gaps

- **Recording gap**: the where-to-blitz Spatial Gap score of the cell, as a percentile across Canada.
- **Identification gap**: species that Needs ID records in the cell propose at species level, with no research-grade record of that species in the cell. These are *latent* species. The page shows them as a share of all species known in the cell.

The page is one feed of waiting photos, like what-to-id. It takes BC's third of cells with the largest recording gap, keeps those where latent species are a large share, and ranks them by latent species. For each place it fetches live one Needs ID photo per latent species, and each photo opens its iNaturalist record. A small map beside the feed shows the same cells: blue where photos wait, red where little or nothing waits and only a visit helps. Clicking a cell shows only that place; a red cell shows a link to plan a trip in where-to-blitz.

## Why it matters

Gap maps for biodiversity data, such as where-to-blitz or the ignorance scores of [Ruete 2015](https://doi.org/10.3897/BDJ.3.e5361), count research-grade or published records. They treat a place with no confirmed record as unvisited. But many such places have photographs that wait for a second identification. In those places a visit is not the cheapest way to fill the gap: an identifier at a desk can do it. Splitting the gap into a recording part and an identification part tells volunteers which of the two jobs a place needs. The split works for any region and any platform where records wait for community identification.

A latent species is a proposal. Some proposals are wrong, so the identification gap is an upper bound on what identifying would add.

## Build

```bash
uv run scripts/sweep.py      # about an hour: two or more iNaturalist requests per cell, one a second; resumes from data/sweep.jsonl
node --test tests/gaps.test.js
uv run --with pytest pytest -q
```

`scripts/sweep.py` reads the where-to-blitz cell scores and lattice, keeps the cells that touch BC (iNaturalist place 7085), and writes `data/cells.json`. `index.html` and `gaps.js` are the whole page, deployed to GitHub Pages on each push to `main`.
