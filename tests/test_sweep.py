import sweep


def test_percentiles_share_ties():
    assert sweep.percentiles([3, 1, 2, 2]) == [100.0, 0.0, 50.0, 50.0]
    assert sweep.percentiles([7]) == [50.0]


def test_cell_round_trip():
    row, col = sweep.cell_of(49.5, -123.1)
    lon, lat = sweep.INV.transform(sweep.X0 + (col + 0.5) * sweep.RES, sweep.Y1 - (row + 0.5) * sweep.RES)
    assert sweep.cell_of(lat, lon) == (row, col)
    lons = [p[0] for p in sweep.corners(row, col)]
    lats = [p[1] for p in sweep.corners(row, col)]
    assert min(lons) < -123.1 < max(lons) and min(lats) < 49.5 < max(lats)


def test_point_in_multipolygon_respects_holes():
    square = [[0, 0], [10, 0], [10, 10], [0, 10]]
    hole = [[4, 4], [6, 4], [6, 6], [4, 6]]
    polys = [[square, hole]]
    assert sweep.in_multipolygon(1, 1, polys)
    assert not sweep.in_multipolygon(5, 5, polys)
    assert not sweep.in_multipolygon(11, 5, polys)


def test_gap_summary_counts_species_only_in_needs_id():
    rg = {1: 5, 2: 1}
    ni = {2: 3, 3: 4, 4: 1}
    assert sweep.gap_summary(rg, ni) == {"rg_species": 2, "rg_obs": 6, "latent_species": 2, "latent_obs": 5}
    assert sweep.gap_summary({}, {}) == {"rg_species": 0, "rg_obs": 0, "latent_species": 0, "latent_obs": 0}
