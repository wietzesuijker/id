# /// script
# requires-python = ">=3.11"
# dependencies = ["pyproj>=3.6"]
# ///
"""Build data/cells.json: per BC 25 km cell, the recording gap and the identification gap.

Recording gap: where-to-blitz's Spatial Gap score (`discover`) as a national percentile.
Identification gap: species proposed at species rank in Needs ID records with no research-grade
record in the cell ("latent" species), from the iNaturalist API, BC place only.

    uv run scripts/sweep.py            # resumes from data/sweep.jsonl
"""

import json
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pyproj import Transformer

WTB = "https://pollocklab.github.io/where-to-blitz/cluster_results/ca/"
API = "https://api.inaturalist.org/v1/"
BC_PLACE = 7085
# where-to-blitz lattice (cluster_results/ca/index.json)
LAEA = "+proj=laea +lat_0=45 +lon_0=-100 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs"
X0, Y1, RES = -2150000, 4300000, 25000
ROOT = Path(__file__).resolve().parent.parent
FWD = Transformer.from_crs("EPSG:4326", LAEA, always_xy=True)
INV = Transformer.from_crs(LAEA, "EPSG:4326", always_xy=True)


_pace = threading.Lock()
_next = [0.0]


def get(url):
    """GET JSON, at most one request a second across threads, as iNaturalist asks."""
    for attempt in range(5):
        with _pace:
            wait = _next[0] - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            _next[0] = time.monotonic() + 1.0
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "id-sweep (github.com/wietzesuijker/id)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except (OSError, ValueError) as e:
            if attempt == 4:
                raise
            print(f"retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))


def percentiles(values):
    """Percentile in [0, 100] with ties sharing their average rank, as where-to-blitz does."""
    order = sorted(range(len(values)), key=values.__getitem__)
    pct = [0.0] * len(values)
    i, n = 0, len(values)
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        p = 100 * ((i + j) / 2) / (n - 1) if n > 1 else 50.0
        for k in range(i, j + 1):
            pct[order[k]] = p
        i = j + 1
    return pct


def cell_of(lat, lon):
    x, y = FWD.transform(lon, lat)
    return int((Y1 - y) // RES), int((x - X0) // RES)


def corners(row, col):
    """Cell polygon as lon/lat, counter-clockwise from the north-west corner."""
    xs, ys = X0 + col * RES, Y1 - row * RES
    pts = [(xs, ys), (xs, ys - RES), (xs + RES, ys - RES), (xs + RES, ys)]
    return [[round(v, 4) for v in INV.transform(x, y)] for x, y in pts]


def in_ring(lon, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def in_multipolygon(lon, lat, polys):
    return any(in_ring(lon, lat, p[0]) and not any(in_ring(lon, lat, h) for h in p[1:]) for p in polys)


def species(bbox, grade):
    """{taxon_id: obs count} for species-rank taxa in the box, BC only."""
    out, page = {}, 1
    while True:
        q = {**bbox, "place_id": BC_PLACE, "verifiable": "true", "quality_grade": grade,
             "hrank": "species", "lrank": "species", "per_page": 500, "page": page}
        d = get(API + "observations/species_counts?" + urllib.parse.urlencode(q))
        out.update({r["taxon"]["id"]: r["count"] for r in d["results"]})
        if page * 500 >= d["total_results"]:
            return out
        page += 1


def gap_summary(rg, ni):
    latent = set(ni) - set(rg)
    return {"rg_species": len(rg), "rg_obs": sum(rg.values()),
            "latent_species": len(latent), "latent_obs": sum(ni[t] for t in latent)}


def bc_cells():
    rows = get(WTB + "webapp_data_All_biodiversity.json")["All biodiversity"]
    us = set(get(WTB + "us_cells.json")["us_cells"])
    rows = [r for r in rows if f"{r[0]:.3f},{r[1]:.3f}" not in us]
    pct = percentiles([r[2] for r in rows])
    polys = get(API + f"places/{BC_PLACE}")["results"][0]["geometry_geojson"]["coordinates"]
    cells = []
    for r, p in zip(rows, pct):
        if not (47 < r[0] < 61 and -140 < r[1] < -113):
            continue
        rc = cell_of(r[0], r[1])
        poly = corners(*rc)
        if any(in_multipolygon(lon, lat, polys) for lon, lat in poly + [[r[1], r[0]]]):
            cells.append({"key": f"{r[0]:.3f},{r[1]:.3f}", "lat": r[0], "lon": r[1], "gap_pct": round(p, 1),
                          "discover": r[2], "poly": poly})
    return cells


def main():
    cells = bc_cells()
    print(f"{len(cells)} BC cells", file=sys.stderr)
    cache = ROOT / "data" / "sweep.jsonl"
    cache.parent.mkdir(exist_ok=True)
    done = {}
    if cache.exists():
        done = {d["key"]: d for d in map(json.loads, cache.read_text().splitlines())}
    todo = [c for c in cells if c["key"] not in done]
    lock = threading.Lock()

    def run(c):
        lons, lats = [p[0] for p in c["poly"]], [p[1] for p in c["poly"]]
        bbox = {"swlat": min(lats), "swlng": min(lons), "nelat": max(lats), "nelng": max(lons)}
        row = {"key": c["key"], **gap_summary(species(bbox, "research"), species(bbox, "needs_id"))}
        with lock:
            done[c["key"]] = row
            f.write(json.dumps(row) + "\n")
            f.flush()
            print(f"{len(done)}/{len(cells)} {row}", file=sys.stderr)

    with cache.open("a") as f, ThreadPoolExecutor(3) as pool:
        list(pool.map(run, todo))
    out = [{**c, **{k: v for k, v in done[c["key"]].items() if k != "key"}} for c in cells]
    (ROOT / "data" / "cells.json").write_text(json.dumps(
        {"made": time.strftime("%Y-%m-%d"), "place_id": BC_PLACE, "res_m": RES, "cells": out}, separators=(",", ":")))


if __name__ == "__main__":
    main()
