"""How closing ranks move from one year to the next, and how sure we can be.

The predictor's whole question is: given a seat's closing rank last year,
where will it close this year?  This module answers it empirically.

A "seat" is (institute, program, quota, seat_type, gender).  For each seat
that closed in two consecutive years we have one observation of drift,
``log(closing_this / closing_last)``.  Drift is not independent across
seats: when the exam is easier, or a batch of new seats opens, everything
moves together.  So it is modelled with three parts:

    drift = year shock + institute shock + seat noise

The year shock is common to every seat that year; the institute shock is
shared by the institute's seats; the noise is what is left.  Sampling the
next year means drawing one year shock, one shock per institute and one
noise per seat, which gives the *correlated* closing-rank vectors the list
simulator needs (P(any seat) is much lower when all your choices sink
together than when they wobble independently).

``backtest`` fits on years <= Y-1, predicts Y and scores calibration: among
seats we said were 70% likely at some rank, did ~70% actually admit it?
That table is the scorecard the site promises to publish.

Usage:
    uv run python josaa/model.py            # fit on everything, print the parameters
    uv run python josaa/model.py --backtest 2025
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
ORCR = HERE / "orcr.parquet"
PARAMS = HERE / "drift.json"

SEAT = ["institute", "program", "quota", "seat_type", "gender"]


def final_round(df: pd.DataFrame) -> pd.DataFrame:
    """One row per seat per year: the last round it appeared in.

    Later rounds only ever loosen a closing rank (seats freed by withdrawals
    go to lower-ranked candidates), so the final round is the number the
    predictor works from.  Rounds after 6 are CSAB special rounds when they
    appear; JoSAA's own last round is what "closing rank" means to students.
    """
    df = df[(df["closing"].notna()) & (~df["closing_prep"])].copy()
    df = df[df["round"] <= 6]
    # 2016-17 predate female-only supernumerary seats and carry no gender;
    # those seats are what became "Gender-Neutral" in 2018.
    df["gender"] = df["gender"].astype("string").fillna("NA").replace("NA", "Gender-Neutral")
    last = df.sort_values("round").groupby(["year"] + SEAT, observed=True).tail(1)
    return last.reset_index(drop=True)


def drifts(last: pd.DataFrame) -> pd.DataFrame:
    """Every seat that closed in years Y-1 and Y, with its log drift."""
    a = last[["year", "closing"] + SEAT].copy()
    b = a.copy()
    b["year"] = b["year"] - 1  # so that (Y-1) rows of `a` match year Y rows of `b`
    both = a.merge(b, on=["year"] + SEAT, suffixes=("_prev", "_next"))
    both["drift"] = np.log(both["closing_next"] / both["closing_prev"])
    both["year"] = both["year"] + 1  # the year the drift lands in
    return both[np.isfinite(both["drift"])]


def fit(d: pd.DataFrame) -> dict:
    """The three variance components, by moment matching.

    Year shock: the median drift of each year (median, because a few seats
    with tiny closing ranks swing wildly).  Institute shock: each institute's
    median residual within a year.  Noise: what is left, with its spread
    measured robustly (MAD -> sigma) because the residuals have fat tails.
    """
    d = d.copy()
    d["year_shock"] = d.groupby("year")["drift"].transform("median")
    d["r1"] = d["drift"] - d["year_shock"]
    d["inst_shock"] = d.groupby(["year", "institute"], observed=True)["r1"].transform("median")
    d["noise"] = d["r1"] - d["inst_shock"]

    year_shocks = d.groupby("year")["year_shock"].first()
    inst_shocks = d.groupby(["year", "institute"], observed=True)["inst_shock"].first()
    mad = lambda s: 1.4826 * np.median(np.abs(s - np.median(s)))

    # Seats with small closing ranks are jumpier in log terms (a 50-rank move
    # is nothing at 20,000 and everything at 200), so the noise scale is
    # allowed to depend on rank through a few bands.
    bands = [0, 500, 2000, 10000, 50000, np.inf]
    d["band"] = pd.cut(d["closing_prev"], bands, right=False, labels=False)
    noise_by_band = {int(k): float(mad(v["noise"])) for k, v in d.groupby("band")}

    return {
        "years": sorted(int(y) for y in year_shocks.index),
        "year_shock_sigma": float(year_shocks.std(ddof=1)),
        # The median, not the mean: 2020 (a 17% loosening, COVID-year seat
        # additions) would otherwise pull every forecast optimistic.
        "year_shock_mean": float(year_shocks.median()),
        "inst_shock_sigma": float(mad(inst_shocks)),
        "noise_sigma_by_band": noise_by_band,
        "bands": [b if np.isfinite(b) else None for b in bands],
        "n_pairs": int(len(d)),
        "year_shocks": {int(y): round(float(v), 4) for y, v in year_shocks.items()},
    }


def noise_sigma(params: dict, closing: np.ndarray) -> np.ndarray:
    edges = [np.inf if b is None else b for b in params["bands"]]
    band = np.clip(np.searchsorted(edges, closing, side="right") - 1, 0, len(edges) - 2)
    table = np.array([params["noise_sigma_by_band"][str(i)] if str(i) in params["noise_sigma_by_band"]
                      else params["noise_sigma_by_band"][i] for i in range(len(edges) - 1)])
    return table[band]


def simulate(params: dict, seats: pd.DataFrame, runs: int, rng: np.random.Generator) -> np.ndarray:
    """``runs`` x ``len(seats)`` closing ranks for next year, correlated."""
    inst_codes, inst_index = pd.factorize(seats["institute"])
    year = rng.normal(params["year_shock_mean"], params["year_shock_sigma"], size=(runs, 1))
    inst = rng.normal(0, params["inst_shock_sigma"], size=(runs, len(inst_index)))[:, inst_codes]
    base = seats["closing"].to_numpy(dtype=float)
    noise = rng.standard_t(df=4, size=(runs, len(seats))) * noise_sigma(params, base) / np.sqrt(2)  # t4 has var 2
    return base * np.exp(year + inst + noise)


def probability(params: dict, seats: pd.DataFrame, rank: int, runs: int = 4000, seed: int = 0) -> np.ndarray:
    """P(closing rank next year >= rank) for each seat."""
    sims = simulate(params, seats, runs, np.random.default_rng(seed))
    return (sims >= rank).mean(axis=0)


def backtest(last: pd.DataFrame, year: int) -> pd.DataFrame:
    """Fit on years < ``year``, predict ``year``, and score calibration.

    For each seat and a spread of hypothetical ranks around its previous
    closing rank, compare the predicted P(admit) with what happened.
    """
    train = drifts(last[last["year"] < year])
    params = fit(train)
    prev = last[last["year"] == year - 1]
    actual = last[last["year"] == year][SEAT + ["closing"]].rename(columns={"closing": "actual"})
    seats = prev.merge(actual, on=SEAT)
    rows = []
    for mult in (0.6, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0):
        ranks = (seats["closing"] * mult).round().astype(int).to_numpy()
        sims = simulate(params, seats, 2000, np.random.default_rng(1))
        p = (sims >= ranks[None, :]).mean(axis=0)
        hit = (seats["actual"].to_numpy() >= ranks)
        rows.append(pd.DataFrame({"p": p, "hit": hit}))
    scored = pd.concat(rows)
    scored["bucket"] = pd.cut(scored["p"], np.linspace(0, 1, 11), include_lowest=True)
    table = scored.groupby("bucket", observed=True).agg(predicted=("p", "mean"), actual=("hit", "mean"), n=("hit", "size"))
    brier = float(((scored["p"] - scored["hit"]) ** 2).mean())
    table.attrs["brier"] = brier
    table.attrs["params"] = params
    return table


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backtest", type=int, metavar="YEAR")
    args = ap.parse_args()
    last = final_round(pd.read_parquet(ORCR))
    if args.backtest:
        table = backtest(last, args.backtest)
        print(f"backtest {args.backtest}: Brier {table.attrs['brier']:.4f}  (0 = perfect, 0.25 = coin flip)")
        print(table.round(3).to_string())
        return
    params = fit(drifts(last))
    PARAMS.write_text(json.dumps(params, indent=2))
    print(json.dumps({k: v for k, v in params.items() if k != "year_shocks"}, indent=2))
    print("year shocks (median log drift):", params["year_shocks"])


if __name__ == "__main__":
    main()
