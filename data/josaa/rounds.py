"""How much a seat's closing rank loosens between a round and the final round.

Withdrawals free seats, so every later round admits deeper.  For each seat
and year (2018 on, when the round structure settled) and each round r before
the last, ``log(final closing / round-r closing)`` is one observation; the
per-round empirical distribution, kept as 101 quantiles, is what the site's
round advisor samples from.

A candidate allotted seat B in round r who floats keeps B and moves to a
higher choice A only if A's final closing rank reaches their rank.  Given
that A did *not* admit them in round r, P(upgrade) = P(final >= rank |
round-r closing < rank), which the browser evaluates by simulation.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from model import SEAT

FROM_YEAR = 2018


def loosening_quantiles(df: pd.DataFrame) -> dict[int, list[float]]:
    df = df[df["closing"].notna() & ~df["closing_prep"] & (df["round"] <= 6) & (df["year"] >= FROM_YEAR)].copy()
    df["gender"] = df["gender"].astype("string").fillna("NA").replace("NA", "Gender-Neutral")
    last = (df.sort_values("round").groupby(["year"] + SEAT, observed=True).tail(1)
            [["year"] + SEAT + ["closing", "round"]].rename(columns={"closing": "final", "round": "final_round"}))
    m = df.merge(last, on=["year"] + SEAT)
    m = m[m["round"] < m["final_round"]]
    m["loosen"] = np.log(m["final"] / m["closing"])
    grid = np.linspace(0, 1, 101)
    return {int(r): [round(float(x), 4) for x in np.quantile(g["loosen"], grid)] for r, g in m.groupby("round")}
