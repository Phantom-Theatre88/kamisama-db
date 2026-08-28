#!/usr/bin/env python3
import csv
import json
import math
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://jmapps.ne.jp/kokugakuin/"
MODERN_START = BASE + "list.html?_f12_f=&_f12_t=&bunrui=28&f10=&f12=&f3=&f44=&f5=&f6=&f7=&f8=&f9=&hlvl=1&keywords=&kwd_and_or=and&list_count=100&list_type=LLA001&title=&title_query=yes"
SHIKINAI_START = BASE + "list.html?_f10_f=&_f10_t=&_f12_f=&_f12_t=&_f2_f=&_f2_t=&_f9_f=&_f9_t=&bunrui=34&f10=&f116=&f12=&f134=&f151=&f155=&f158=&f159=&f170=&f172=&f174=&f2=&f250=&f255=&f258=&f259=&f261=&f262=&f270=&f281=&f290=&f299=&f3=&f30=&f300=&f301=&f302=&f31=&f38=&f43=&f44=&f45=&f46=&f47=&f48=&f5=&f50=&f56=&f6=&f73=&f9=&hlvl=1&keywords=&kwd_and_or=and&list_count=100&list_type=LLA001&title=&title_query=yes"

OUT = Path("data/jinja_tier2_generated.csv")
REPORT = Path("data/tier2_build_report.json")
MASTER = Path("data/jinja_master.csv")
MAX_WORKERS = 6

HEADERS = [
    "id", "name", "yomi", "former_shrine_rank", "shikinaisha_type", "ichinomiya_name",
    "province", "county", "prefecture", "city", "address", "lat", "lng", "gmap_url",
    "main_god_ids", "sub_god_ids", "description", "source_key", "source_id", "db_tier"
]

HTTP_HEADERS = {
    "User-Agent": "kamisama-db-research-builder/1.2 (+https://github.com/Phantom-Theatre88/kamisama-db)"
}


def fetch(url, retries=4):
    for i in range(retries):
        try:
            r = requests.get(url, headers=HTTP_HEADERS, timeout=30)
            r.raise_for_status()
            r.encoding = r.apparent_encoding or "utf-8"
            return r.text
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1.2 * (i + 1))


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\u3000", " ")).strip()


def norm_name(s):
    s = unicodedata.normalize("NFKC", clean(s))
    s = s.replace("神", "神").replace("國", "国").replace("﨑", "崎")
    return re.sub(r"[\s・･,，、()（）\[\]［］]", "", s)


def distance_km(lat1, lng1, lat2, lng2):
    dy = (lat1 - lat2) * 111.0
    dx = (lng1 - lng2) * 111.0 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def dms_to_decimal(text):
    if not text:
        return None, None
    lat = lon = None
    m = re.search(r"北緯\s*(\d+)\s*度\s*(\d+)\s*分\s*([\d.]+)\s*秒", text)
    if m:
        lat = int(m.group(1)) + int(m.group(2)) / 60 + float(m.group(3)) / 3600
    m = re.search(r"東経\s*(\d+)\s*度\s*(\d+)\s*分\s*([\d.]+)\s*秒", text)
    if m:
        lon = int(m.group(1)) + int(m.group(2)) / 60 + float(m.group(3)) / 3600
    if lat is None or lon is None:
        m = re.search(r"(?:ll=|q=)([\d.]+)\s*,\s*([\d.]+)", text)
        if m:
            lat, lon = float(m.group(1)), float(m.group(2))
    return lat, lon


def get_fields(html):
    soup = BeautifulSoup(html, "html.parser")
    fields = {}
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if len(cells) >= 2:
            k = clean(cells[0].get_text(" ", strip=True))
            v = clean(cells[1].get_text(" ", strip=True))
            if k:
                fields[k] = v
    for dt in soup.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            fields[clean(dt.get_text(" ", strip=True))] = clean(dd.get_text(" ", strip=True))
    return fields, soup


def collect_detail_links(start_url, max_pages=300):
    """Follow the database's own next-page link rather than guessing page parameters."""
    url = start_url
    seen_pages = set()
    seen_ids = set()
    links = []
    page_no = 0

    while url and url not in seen_pages and page_no < max_pages:
        page_no += 1
        seen_pages.add(url)
        html = fetch(url)
        soup = BeautifulSoup(html, "html.parser")
        page_new = 0

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "det.html?data_id=" not in href:
                continue
            m = re.search(r"data_id=(\d+)", href)
            if not m or m.group(1) in seen_ids:
                continue
            seen_ids.add(m.group(1))
            links.append((urljoin(BASE, href), m.group(1)))
            page_new += 1

        print(f"list page {page_no}: +{page_new} (total {len(links)})")

        next_url = None
        for a in soup.find_all("a", href=True):
            label = clean(a.get_text(" ", strip=True))
            rel = " ".join(a.get("rel", [])) if a.get("rel") else ""
            if "次へ" in label or "次の" in label or "next" in rel.lower():
                candidate = urljoin(url, a["href"])
                if candidate not in seen_pages:
                    next_url = candidate
                    break

        if not next_url:
            break
        url = next_url
        time.sleep(0.2)

    return links


def old_rank(note):
    m = re.search(r"旧(官幣大社|官幣中社|官幣小社|国幣大社|国幣中社|国幣小社|別格官幣社|府社|県社|郷社|村社)", note or "")
    return m.group(1) if m else ""


def existing_records():
    rows = []
    if not MASTER.exists():
        return rows
    with MASTER.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            try:
                lat = float(r.get("lat", ""))
                lng = float(r.get("lng", ""))
            except Exception:
                lat = lng = None
            rows.append({
                "name_key": norm_name(r.get("name", "")),
                "lat": lat,
                "lng": lng,
            })
    return rows


def matches_existing(name, lat, lng, existing, max_km=2.0):
    """Same-name shrines are duplicates only when they are geographically the same shrine."""
    nk = norm_name(name)
    if not nk:
        return False
    for e in existing:
        if e["name_key"] != nk:
            continue
        if lat is None or lng is None or e["lat"] is None or e["lng"] is None:
            continue
        if distance_km(lat, lng, e["lat"], e["lng"]) <= max_km:
            return True
    return False


def parse_modern(item):
    url, data_id = item
    try:
        fields, soup = get_fields(fetch(url))
        name = clean(fields.get("+神社名") or fields.get("神社名") or fields.get("団体名"))
        if not name:
            h = soup.find("h1")
            name = clean(h.get_text(" ", strip=True)) if h else ""
        yomi = clean(fields.get("+神社名よみ") or fields.get("神社名よみ"))
        pref = clean(fields.get("都道府県名（上級行政区画）") or fields.get("都道府県名、上級行政区画"))
        addr = clean(fields.get("住所"))
        if pref and addr and not addr.startswith(pref):
            addr = pref + addr
        province = clean(fields.get("旧国名"))
        lat, lng = dms_to_decimal(fields.get("緯度/経度 latitude/longitude", ""))
        note = clean(fields.get("+備考") or fields.get("備考"))
        if not name or lat is None or lng is None:
            return None
        shiki = "式内社" if "式内社" in note else ""
        return {
            "id": f"T2M{data_id}", "name": name, "yomi": yomi,
            "former_shrine_rank": old_rank(note), "shikinaisha_type": shiki,
            "ichinomiya_name": "", "province": province, "county": "",
            "prefecture": pref, "city": "", "address": addr,
            "lat": f"{lat:.7f}", "lng": f"{lng:.7f}",
            "gmap_url": f"https://maps.google.com/?q={lat:.7f},{lng:.7f}",
            "main_god_ids": "", "sub_god_ids": "",
            "description": "國學院大學「神道・神社史料集成（現代）」収録社。",
            "source_key": "KOKUGAKUIN_MODERN", "source_id": data_id, "db_tier": "2"
        }
    except Exception as e:
        print(f"modern detail failed {data_id}: {e}")
        return None


def build_modern(existing):
    links = collect_detail_links(MODERN_START)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        parsed = list(ex.map(parse_modern, links))
    out = []
    for r in parsed:
        if not r:
            continue
        lat, lng = float(r["lat"]), float(r["lng"])
        if matches_existing(r["name"], lat, lng, existing):
            continue
        out.append(r)
    return out, len(links)


def numbered_fields(fields, prefix):
    pat = re.compile(rf"^\+?{re.escape(prefix)}（(\d+)）$")
    result = []
    for k, v in fields.items():
        m = pat.match(k)
        if m:
            result.append((int(m.group(1)), v))
    return sorted(result)


def parse_shikinai(item):
    url, data_id = item
    try:
        fields, _ = get_fields(fetch(url))
        province = clean(fields.get("国名") or fields.get("旧国名"))
        county = clean(fields.get("旧郡名"))
        shikitype = clean(fields.get("名神大社・大社・小社") or fields.get("社格"))
        rows = []
        for idx, raw_name in numbered_fields(fields, "現社名など"):
            is_candidate = "論社" in raw_name
            name = clean(re.sub(r"^[（(]\s*論社\s*[）)]\s*", "", raw_name))
            coord = fields.get(f"+現社名など（{idx}）緯度経度") or fields.get(f"現社名など（{idx}）緯度経度") or ""
            link = fields.get(f"+現社名など（{idx}）リンク") or fields.get(f"現社名など（{idx}）リンク") or ""
            lat, lng = dms_to_decimal(coord + " " + link)
            if not name or lat is None or lng is None:
                continue
            rows.append({
                "id": f"T2S{data_id}_{idx}", "name": name, "yomi": "",
                "former_shrine_rank": "", "shikinaisha_type": shikitype or "式内社",
                "ichinomiya_name": "", "province": province, "county": county,
                "prefecture": "", "city": "", "address": "",
                "lat": f"{lat:.7f}", "lng": f"{lng:.7f}",
                "gmap_url": f"https://maps.google.com/?q={lat:.7f},{lng:.7f}",
                "main_god_ids": "", "sub_god_ids": "",
                "description": "延喜式内社データベースの現社候補" + ("（論社）" if is_candidate else ""),
                "source_key": "KOKUGAKUIN_SHIKINAI", "source_id": f"{data_id}:{idx}", "db_tier": "2"
            })
        return rows
    except Exception as e:
        print(f"shikinai detail failed {data_id}: {e}")
        return []


def same_generated_shrine(a, b, max_km=0.5):
    if norm_name(a["name"]) != norm_name(b["name"]):
        return False
    return distance_km(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"])) <= max_km


def build_shikinai(existing, modern_rows):
    links = collect_detail_links(SHIKINAI_START)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        batches = list(ex.map(parse_shikinai, links))
    out = []
    generated = list(modern_rows)
    for batch in batches:
        for r in batch:
            lat, lng = float(r["lat"]), float(r["lng"])
            if matches_existing(r["name"], lat, lng, existing):
                continue
            if any(same_generated_shrine(r, g) for g in generated):
                continue
            generated.append(r)
            out.append(r)
    return out, len(links)


def dedupe(rows):
    result = []
    for r in rows:
        if any(same_generated_shrine(r, x) for x in result):
            continue
        result.append(r)
    return result


def main():
    existing = existing_records()
    modern, modern_source_count = build_modern(existing)
    shikinai, shikinai_source_count = build_shikinai(existing, modern)
    rows = dedupe(modern + shikinai)
    rows.sort(key=lambda r: (r.get("prefecture", ""), r.get("province", ""), r["name"], r["id"]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        w.writerows(rows)

    report = {
        "source": "國學院大學デジタルミュージアム",
        "modern_source_records_seen": modern_source_count,
        "shikinai_source_records_seen": shikinai_source_count,
        "existing_master_records": len(existing),
        "modern_rows_added": len(modern),
        "shikinai_rows_added": len(shikinai),
        "tier2_generated_rows": len(rows),
        "worker_count": MAX_WORKERS,
        "dedupe_rule": "same normalized shrine name + nearby coordinates",
        "note": "祭神K-ID未確認は空欄保持。論社は論社表記を保持。"
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
