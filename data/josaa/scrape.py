"""Pull JoSAA opening/closing ranks, every year and round, into one Parquet file.

Source: https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx
-- an ASP.NET WebForms page whose dropdowns cascade through postbacks
(year -> round -> institute type -> institute -> branch -> seat type).  Every
dropdown past "round" accepts ALL, so one Submit per (year, round) returns
the whole table: ~12k rows, ~14 MB of HTML.

Two things the server insists on that a browser does silently: a select with
no options must be left out of the POST entirely (posting it empty throws
the page to ErrMsg.aspx), and the host only speaks TLS 1.2 with a chain our
trust store does not verify.

Usage:
    uv run python josaa/scrape.py                 # every year, every round
    uv run python josaa/scrape.py --years 2025    # one year (refreshing the latest)

Writes josaa/raw/<year>-r<round>.html (kept, so re-parsing needs no refetch)
and josaa/orcr.parquet with one row per (year, round, institute, program,
quota, seat_type, gender).
"""

from __future__ import annotations

import argparse
import logging
import ssl
import sys
import time
from pathlib import Path

import httpx
import pandas as pd
from bs4 import BeautifulSoup

log = logging.getLogger("josaa")

URL = "https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx"
PREFIX = "ctl00$ContentPlaceHolder1$"
HERE = Path(__file__).parent
RAW = HERE / "raw"
OUT = HERE / "orcr.parquet"

COLUMNS = {
    "Institute": "institute",
    "Academic Program Name": "program",
    "Quota": "quota",
    "Seat Type": "seat_type",
    "Gender": "gender",
    "Opening Rank": "opening",
    "Closing Rank": "closing",
}


def client() -> httpx.Client:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.maximum_version = ssl.TLSVersion.TLSv1_2
    return httpx.Client(
        verify=ctx,
        timeout=httpx.Timeout(300, connect=60),
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
            "Referer": URL,
            "Origin": "https://josaa.admissions.nic.in",
        },
    )


def fields(html: str) -> tuple[BeautifulSoup, dict[str, str]]:
    """The form as a browser would submit it: hidden inputs, checked boxes,
    and the selected option of every select that has options."""
    soup = BeautifulSoup(html, "lxml")
    form: dict[str, str] = {}
    for inp in soup.select("form input[name]"):
        kind = inp.get("type", "text")
        if kind in ("submit", "button", "image"):
            continue
        if kind in ("checkbox", "radio") and not inp.has_attr("checked"):
            continue
        form[inp["name"]] = inp.get("value", "")
    for sel in soup.select("form select[name]"):
        chosen = sel.find("option", selected=True) or sel.find("option")
        if chosen is not None:
            form[sel["name"]] = chosen["value"]
    return soup, form


def options(soup: BeautifulSoup, name: str) -> list[str]:
    return [o["value"] for o in soup.select(f"#ctl00_ContentPlaceHolder1_{name} option") if o["value"] != "0"]


class Session:
    def __init__(self) -> None:
        self.http = client()
        self.soup, self.form = fields(self._get())

    def _get(self) -> str:
        r = self.http.get(URL)
        r.raise_for_status()
        return r.text

    def _post(self, form: dict[str, str]) -> str:
        r = self.http.post(URL, data=form)
        if r.status_code != 200:
            raise RuntimeError(f"postback refused: {r.status_code} -> {r.headers.get('location')}")
        return r.text

    def choose(self, name: str, value: str) -> None:
        """Change one dropdown and take the page the server sends back."""
        form = dict(self.form)
        form["__EVENTTARGET"] = PREFIX + name
        form[PREFIX + name] = value
        self.soup, self.form = fields(self._post(form))

    def submit(self) -> str:
        form = dict(self.form)
        form["__EVENTTARGET"] = ""
        form[PREFIX + "btnSubmit"] = "Submit"
        return self._post(form)

    def rounds(self, year: int) -> list[str]:
        self.choose("ddlYear", str(year))
        return options(self.soup, "ddlroundno")

    def fetch(self, year: int, round_: str) -> str:
        """The full table for one year and round, as HTML."""
        self.choose("ddlYear", str(year))
        self.choose("ddlroundno", round_)
        self.choose("ddlInstype", "ALL")
        self.choose("ddlInstitute", "ALL")
        self.choose("ddlBranch", "ALL")
        self.form[PREFIX + "ddlSeatType"] = "ALL"
        return self.submit()


def parse(html: str, year: int, round_: int) -> pd.DataFrame:
    soup = BeautifulSoup(html, "lxml")
    table = soup.select_one("#ctl00_ContentPlaceHolder1_GridView1")
    if table is None:
        raise ValueError("no GridView1 in the page")
    rows = table.select("tr")
    header = [th.get_text(" ", strip=True) for th in rows[0].select("th,td")]
    if header != list(COLUMNS):
        raise ValueError(f"unexpected columns: {header}")
    records = [[td.get_text(" ", strip=True) for td in tr.select("td")] for tr in rows[1:]]
    df = pd.DataFrame(records, columns=list(COLUMNS.values()))
    df.insert(0, "round", round_)
    df.insert(0, "year", year)
    # Preparatory-course ranks are marked with a P ("1234P"); keep the number
    # and remember the flag, since those are not comparable with the rest.
    # 2016 also has ranks as "650.1" and "1.02614e+006" and the odd blank:
    # read as float, floor, and let blanks be missing.
    for col in ("opening", "closing"):
        df[col + "_prep"] = df[col].str.endswith("P")
        numbers = pd.to_numeric(df[col].str.rstrip("P"), errors="coerce")
        df[col] = numbers.round().astype("Int64")
    df["institute"] = df["institute"].str.replace(r"\s+", " ", regex=True).str.strip()
    df["program"] = df["program"].str.replace(r"\s+", " ", regex=True).str.strip()
    return df


def scrape(years: list[int], refetch: bool) -> None:
    RAW.mkdir(exist_ok=True)
    session = Session()
    for year in years:
        rounds = session.rounds(year)
        log.info("%d: rounds %s", year, ", ".join(rounds))
        for round_ in rounds:
            path = RAW / f"{year}-r{round_}.html"
            if path.exists() and not refetch:
                continue
            for attempt in range(1, 4):
                try:
                    t0 = time.time()
                    html = session.fetch(year, round_)
                    path.write_text(html)
                    parse(html, year, int(round_))  # fail loudly now, with the HTML on disk
                    log.info("%d round %s: %.1f MB in %.0fs", year, round_, len(html) / 1e6, time.time() - t0)
                    break
                except Exception as exc:  # network hiccup or a session the server dropped
                    log.warning("%d round %s attempt %d failed: %s", year, round_, attempt, exc)
                    time.sleep(10 * attempt)
                    session = Session()
            else:
                log.error("%d round %s: giving up", year, round_)
            time.sleep(2)  # be polite; the query is heavy on their side


def build() -> pd.DataFrame:
    frames = []
    for path in sorted(RAW.glob("*-r*.html")):
        year, round_ = path.stem.split("-r")
        frames.append(parse(path.read_text(), int(year), int(round_)))
    df = pd.concat(frames, ignore_index=True)
    df = df.astype({"year": "int16", "round": "int8", "institute": "category", "program": "category",
                    "quota": "category", "seat_type": "category", "gender": "category"})
    df.to_parquet(OUT, index=False)
    return df


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stderr)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--years", type=int, nargs="*", default=list(range(2016, 2026)))
    ap.add_argument("--refetch", action="store_true", help="fetch again even if the raw HTML is on disk")
    ap.add_argument("--parse-only", action="store_true", help="rebuild the parquet from raw/ without fetching")
    args = ap.parse_args()
    if not args.parse_only:
        scrape(args.years, args.refetch)
    df = build()
    log.info("%s: %d rows, %d institutes, %d programs, years %d-%d",
             OUT.name, len(df), df["institute"].nunique(), df["program"].nunique(), df["year"].min(), df["year"].max())
    print(df.groupby(["year", "round"]).size().unstack(fill_value=0).to_string())


if __name__ == "__main__":
    main()
