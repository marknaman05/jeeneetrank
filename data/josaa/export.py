"""Write the predictor's data file for the site: ../../site-data/josaa.json.

One compact JSON the browser downloads once: every seat from the latest
season's final round with its closing rank, plus the drift parameters and
each institute's state (for the home-state quota) and type.  Strings are
dictionary-coded so the file stays small (~300 KB, ~60 KB gzipped).

Usage:
    uv run python josaa/export.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

from model import ORCR, PARAMS, SEAT, final_round

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "site-data" / "josaa.json"

# Institute -> (state, type).  Type: IIT, NIT, IIIT, GFTI.  The state is what
# the HS (home state) quota keys on; for NITs and most GFTIs that is the
# state the institute sits in.
STATES: dict[str, tuple[str, str]] = {
    "Assam University, Silchar": ("Assam", "GFTI"),
    "Atal Bihari Vajpayee Indian Institute of Information Technology & Management Gwalior": ("Madhya Pradesh", "IIIT"),
    "Birla Institute of Technology, Deoghar Off-Campus": ("Jharkhand", "GFTI"),
    "Birla Institute of Technology, Mesra, Ranchi": ("Jharkhand", "GFTI"),
    "Birla Institute of Technology, Patna Off-Campus": ("Bihar", "GFTI"),
    "CU Jharkhand": ("Jharkhand", "GFTI"),
    "Central University of Haryana": ("Haryana", "GFTI"),
    "Central University of Jammu": ("Jammu and Kashmir", "GFTI"),
    "Central University of Rajasthan, Rajasthan": ("Rajasthan", "GFTI"),
    "Central institute of Technology Kokrajar, Assam": ("Assam", "GFTI"),
    "Chhattisgarh Swami Vivekanada Technical University, Bhilai (CSVTU Bhilai)": ("Chhattisgarh", "GFTI"),
    "Dr. B R Ambedkar National Institute of Technology, Jalandhar": ("Punjab", "NIT"),
    "Gati Shakti Vishwavidyalaya, Vadodara": ("Gujarat", "GFTI"),
    "Ghani Khan Choudhary Institute of Engineering and Technology, Malda, West Bengal": ("West Bengal", "GFTI"),
    "Gurukula Kangri Vishwavidyalaya, Haridwar": ("Uttarakhand", "GFTI"),
    "INDIAN INSTITUTE OF INFORMATION TECHNOLOGY SENAPATI MANIPUR": ("Manipur", "IIIT"),
    "Indian Institute of Carpet Technology, Bhadohi": ("Uttar Pradesh", "GFTI"),
    "Indian Institute of Engineering Science and Technology, Shibpur": ("West Bengal", "GFTI"),
    "Indian Institute of Handloom Technology(IIHT), Varanasi": ("Uttar Pradesh", "GFTI"),
    "Indian Institute of Handloom Technology, Salem": ("Tamil Nadu", "GFTI"),
    "Indian Institute of Information Technology (IIIT) Nagpur": ("Maharashtra", "IIIT"),
    "Indian Institute of Information Technology (IIIT) Pune": ("Maharashtra", "IIIT"),
    "Indian Institute of Information Technology (IIIT) Ranchi": ("Jharkhand", "IIIT"),
    "Indian Institute of Information Technology (IIIT), Sri City, Chittoor": ("Andhra Pradesh", "IIIT"),
    "Indian Institute of Information Technology (IIIT)Kota, Rajasthan": ("Rajasthan", "IIIT"),
    "Indian Institute of Information Technology Bhagalpur": ("Bihar", "IIIT"),
    "Indian Institute of Information Technology Bhopal": ("Madhya Pradesh", "IIIT"),
    "Indian Institute of Information Technology Design & Manufacturing Kurnool, Andhra Pradesh": ("Andhra Pradesh", "IIIT"),
    "Indian Institute of Information Technology Guwahati": ("Assam", "IIIT"),
    "Indian Institute of Information Technology Lucknow": ("Uttar Pradesh", "IIIT"),
    "Indian Institute of Information Technology Surat": ("Gujarat", "IIIT"),
    "Indian Institute of Information Technology Tiruchirappalli": ("Tamil Nadu", "IIIT"),
    "Indian Institute of Information Technology(IIIT) Dharwad": ("Karnataka", "IIIT"),
    "Indian Institute of Information Technology(IIIT) Kalyani, West Bengal": ("West Bengal", "IIIT"),
    "Indian Institute of Information Technology(IIIT) Kilohrad, Sonepat, Haryana": ("Haryana", "IIIT"),
    "Indian Institute of Information Technology(IIIT) Kottayam": ("Kerala", "IIIT"),
    "Indian Institute of Information Technology(IIIT) Una, Himachal Pradesh": ("Himachal Pradesh", "IIIT"),
    "Indian Institute of Information Technology(IIIT), Vadodara, Gujrat": ("Gujarat", "IIIT"),
    "Indian Institute of Information Technology, Agartala": ("Tripura", "IIIT"),
    "Indian Institute of Information Technology, Allahabad": ("Uttar Pradesh", "IIIT"),
    "Indian Institute of Information Technology, Design & Manufacturing, Kancheepuram": ("Tamil Nadu", "IIIT"),
    "Indian Institute of Information Technology, Vadodara International Campus Diu (IIITVICD)": ("Daman and Diu", "IIIT"),
    "Indian Institute of Technology (BHU) Varanasi": ("Uttar Pradesh", "IIT"),
    "Indian Institute of Technology (ISM) Dhanbad": ("Jharkhand", "IIT"),
    "Indian Institute of Technology Bhilai": ("Chhattisgarh", "IIT"),
    "Indian Institute of Technology Bhubaneswar": ("Odisha", "IIT"),
    "Indian Institute of Technology Bombay": ("Maharashtra", "IIT"),
    "Indian Institute of Technology Delhi": ("Delhi", "IIT"),
    "Indian Institute of Technology Dharwad": ("Karnataka", "IIT"),
    "Indian Institute of Technology Gandhinagar": ("Gujarat", "IIT"),
    "Indian Institute of Technology Goa": ("Goa", "IIT"),
    "Indian Institute of Technology Guwahati": ("Assam", "IIT"),
    "Indian Institute of Technology Hyderabad": ("Telangana", "IIT"),
    "Indian Institute of Technology Indore": ("Madhya Pradesh", "IIT"),
    "Indian Institute of Technology Jammu": ("Jammu and Kashmir", "IIT"),
    "Indian Institute of Technology Jodhpur": ("Rajasthan", "IIT"),
    "Indian Institute of Technology Kanpur": ("Uttar Pradesh", "IIT"),
    "Indian Institute of Technology Kharagpur": ("West Bengal", "IIT"),
    "Indian Institute of Technology Madras": ("Tamil Nadu", "IIT"),
    "Indian Institute of Technology Mandi": ("Himachal Pradesh", "IIT"),
    "Indian Institute of Technology Palakkad": ("Kerala", "IIT"),
    "Indian Institute of Technology Patna": ("Bihar", "IIT"),
    "Indian Institute of Technology Roorkee": ("Uttarakhand", "IIT"),
    "Indian Institute of Technology Ropar": ("Punjab", "IIT"),
    "Indian Institute of Technology Tirupati": ("Andhra Pradesh", "IIT"),
    "Indian institute of information technology, Raichur, Karnataka": ("Karnataka", "IIIT"),
    "Institute of Chemical Technology, Mumbai: Indian Oil Odisha Campus, Bhubaneswar": ("Odisha", "GFTI"),
    "Institute of Engineering and Technology, Dr. H. S. Gour University. Sagar (A Central University)": ("Madhya Pradesh", "GFTI"),
    "Institute of Infrastructure, Technology, Research and Management-Ahmedabad": ("Gujarat", "GFTI"),
    "International Institute of Information Technology, Bhubaneswar": ("Odisha", "GFTI"),
    "International Institute of Information Technology, Naya Raipur": ("Chhattisgarh", "GFTI"),
    "Islamic University of Science and Technology Kashmir": ("Jammu and Kashmir", "GFTI"),
    "J.K. Institute of Applied Physics & Technology, Department of Electronics & Communication, University of Allahabad- Allahabad": ("Uttar Pradesh", "GFTI"),
    "Jawaharlal Nehru University, Delhi": ("Delhi", "GFTI"),
    "Malaviya National Institute of Technology Jaipur": ("Rajasthan", "NIT"),
    "Maulana Azad National Institute of Technology Bhopal": ("Madhya Pradesh", "NIT"),
    "Mizoram University, Aizawl": ("Mizoram", "GFTI"),
    "Motilal Nehru National Institute of Technology Allahabad": ("Uttar Pradesh", "NIT"),
    "National Institute of Advanced Manufacturing Technology, Ranchi": ("Jharkhand", "GFTI"),
    "National Institute of Electronics and Information Technology, Ajmer (Rajasthan)": ("Rajasthan", "GFTI"),
    "National Institute of Electronics and Information Technology, Aurangabad (Maharashtra)": ("Maharashtra", "GFTI"),
    "National Institute of Electronics and Information Technology, Gorakhpur (UP)": ("Uttar Pradesh", "GFTI"),
    "National Institute of Electronics and Information Technology, Patna (Bihar)": ("Bihar", "GFTI"),
    "National Institute of Electronics and Information Technology, Ropar (Punjab)": ("Punjab", "GFTI"),
    "National Institute of Food Technology Entrepreneurship and Management, Kundli": ("Haryana", "GFTI"),
    "National Institute of Food Technology Entrepreneurship and Management, Thanjavur": ("Tamil Nadu", "GFTI"),
    "National Institute of Technology Agartala": ("Tripura", "NIT"),
    "National Institute of Technology Arunachal Pradesh": ("Arunachal Pradesh", "NIT"),
    "National Institute of Technology Calicut": ("Kerala", "NIT"),
    "National Institute of Technology Delhi": ("Delhi", "NIT"),
    "National Institute of Technology Durgapur": ("West Bengal", "NIT"),
    "National Institute of Technology Goa": ("Goa", "NIT"),
    "National Institute of Technology Hamirpur": ("Himachal Pradesh", "NIT"),
    "National Institute of Technology Karnataka, Surathkal": ("Karnataka", "NIT"),
    "National Institute of Technology Meghalaya": ("Meghalaya", "NIT"),
    "National Institute of Technology Nagaland": ("Nagaland", "NIT"),
    "National Institute of Technology Patna": ("Bihar", "NIT"),
    "National Institute of Technology Puducherry": ("Puducherry", "NIT"),
    "National Institute of Technology Raipur": ("Chhattisgarh", "NIT"),
    "National Institute of Technology Sikkim": ("Sikkim", "NIT"),
    "National Institute of Technology, Andhra Pradesh": ("Andhra Pradesh", "NIT"),
    "National Institute of Technology, Jamshedpur": ("Jharkhand", "NIT"),
    "National Institute of Technology, Kurukshetra": ("Haryana", "NIT"),
    "National Institute of Technology, Manipur": ("Manipur", "NIT"),
    "National Institute of Technology, Mizoram": ("Mizoram", "NIT"),
    "National Institute of Technology, Rourkela": ("Odisha", "NIT"),
    "National Institute of Technology, Silchar": ("Assam", "NIT"),
    "National Institute of Technology, Srinagar": ("Jammu and Kashmir", "NIT"),
    "National Institute of Technology, Tiruchirappalli": ("Tamil Nadu", "NIT"),
    "National Institute of Technology, Uttarakhand": ("Uttarakhand", "NIT"),
    "National Institute of Technology, Warangal": ("Telangana", "NIT"),
    "North Eastern Regional Institute of Science and Technology, Nirjuli-791109 (Itanagar),Arunachal Pradesh": ("Arunachal Pradesh", "GFTI"),
    "North-Eastern Hill University, Shillong": ("Meghalaya", "GFTI"),
    "Pt. Dwarka Prasad Mishra Indian Institute of Information Technology, Design & Manufacture Jabalpur": ("Madhya Pradesh", "IIIT"),
    "Puducherry Technological University, Puducherry": ("Puducherry", "GFTI"),
    "Punjab Engineering College, Chandigarh": ("Chandigarh", "GFTI"),
    "Rajiv Gandhi National Aviation University, Fursatganj, Amethi (UP)": ("Uttar Pradesh", "GFTI"),
    "Sant Longowal Institute of Engineering and Technology": ("Punjab", "GFTI"),
    "Sardar Vallabhbhai National Institute of Technology, Surat": ("Gujarat", "NIT"),
    "School of Engineering, Tezpur University, Napaam, Tezpur": ("Assam", "GFTI"),
    "School of Planning & Architecture, Bhopal": ("Madhya Pradesh", "GFTI"),
    "School of Planning & Architecture, New Delhi": ("Delhi", "GFTI"),
    "School of Planning & Architecture: Vijayawada": ("Andhra Pradesh", "GFTI"),
    "School of Studies of Engineering and Technology, Guru Ghasidas Vishwavidyalaya, Bilaspur": ("Chhattisgarh", "GFTI"),
    "Shri G. S. Institute of Technology and Science Indore": ("Madhya Pradesh", "GFTI"),
    "Shri Mata Vaishno Devi University, Katra, Jammu & Kashmir": ("Jammu and Kashmir", "GFTI"),
    "University of Hyderabad": ("Telangana", "GFTI"),
    "Visvesvaraya National Institute of Technology, Nagpur": ("Maharashtra", "NIT"),
}

# What the site shows instead of the official mouthful.
SHORT = {
    "Indian Institute of Technology": "IIT",
    "National Institute of Technology": "NIT",
    "Indian Institute of Information Technology": "IIIT",
}


def short_name(name: str) -> str:
    n = name
    for long, short in SHORT.items():
        n = re.sub(re.escape(long), short, n, flags=re.IGNORECASE)
    n = re.sub(r"\((IIIT|ISM|BHU)\)", r"\1", n)          # "IIT (BHU) Varanasi" -> "IIT BHU Varanasi"
    n = re.sub(r"\bIIIT\s*IIIT\s*", "IIIT ", n)            # "IIIT (IIIT)Kota" -> "IIIT Kota"
    n = re.sub(r"\b(IIT|NIT|IIIT)\s*,\s*", r"\1 ", n)      # "NIT, Warangal" -> "NIT Warangal"
    n = re.sub(r"\s+", " ", n).strip(" ,")
    return n


def main() -> None:
    last = final_round(pd.read_parquet(ORCR))
    year = int(last["year"].max())
    seats = last[last["year"] == year].copy()
    params = json.loads(PARAMS.read_text())

    missing = sorted(set(seats["institute"]) - set(STATES))
    if missing:
        raise SystemExit("no state for:\n  " + "\n  ".join(missing))

    # A few older-year rounds have rows JoSAA's own site marks with a P
    # (preparatory); those are dropped in final_round already.
    seats = seats.sort_values(SEAT)
    inst_names = sorted(seats["institute"].unique())
    prog_names = sorted(seats["program"].unique())
    quota_names = sorted(seats["quota"].unique())
    cat_names = sorted(seats["seat_type"].unique())
    gender_names = sorted(seats["gender"].unique())
    idx = lambda names: {n: i for i, n in enumerate(names)}
    ii, pi, qi, ci, gi = map(idx, (inst_names, prog_names, quota_names, cat_names, gender_names))

    # Also ship each seat's closing rank from the year before, so the page
    # can show the two-year trend without carrying the whole history.
    prev = last[last["year"] == year - 1][SEAT + ["closing"]].rename(columns={"closing": "prev"})
    seats = seats.merge(prev, on=SEAT, how="left")

    rows = [
        [ii[r.institute], pi[r.program], qi[r.quota], ci[r.seat_type], gi[r.gender],
         int(r.closing), int(r.opening), (int(r.prev) if pd.notna(r.prev) else None)]
        for r in seats.itertuples()
    ]
    out = {
        "exam": "jee",
        "season": year,
        "generated_from": f"JoSAA {year} final round; drift fitted on {params['years'][0]}-{params['years'][-1]}",
        "institutes": [{"name": n, "short": short_name(n), "state": STATES[n][0], "type": STATES[n][1]} for n in inst_names],
        "programs": prog_names,
        "quotas": quota_names,
        "categories": cat_names,
        "genders": gender_names,
        "columns": ["institute", "program", "quota", "category", "gender", "closing", "opening", "prev_closing"],
        "seats": rows,
        "drift": {
            "year_shock_mean": params["year_shock_mean"],
            "year_shock_sigma": params["year_shock_sigma"],
            "inst_shock_sigma": params["inst_shock_sigma"],
            "bands": params["bands"],
            "noise_sigma_by_band": [params["noise_sigma_by_band"][str(i)] for i in range(len(params["bands"]) - 1)],
        },
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"{OUT}: {len(rows)} seats, {len(inst_names)} institutes, {OUT.stat().st_size/1e3:.0f} KB")


if __name__ == "__main__":
    main()
