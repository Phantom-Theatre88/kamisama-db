#!/usr/bin/env python3
import csv
import json
import math
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

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
    "id","name","yomi","former_shrine_rank","shikinaisha_type","ichinomiya_name",
    "province","county","prefecture","city","address","lat","lng","gmap_url",
    "main_god_ids","sub_god_ids","description","source_key","source_id","db_tier"
]

HEADERS_HTTP = {
    "User-Agent": "kamisama-db-research-builder/1.1 (+https://github.com/Phantom-Theatre88/kamisama-db)"
}


def fetch(url, retries=4):
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS_HTTP, timeout=30)
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


def with_page(url, page):
    p = urlparse(url)
    q = dict(parse_qsl(p.query, keep_blank_values=True))
    q["page"] = str(page)
    return urlunparse((p.scheme, p.netloc, p.path, p.params, urlencode(q), p.fragment))


def dms_to_decimal(text):
    if not text:
        return None, None
    lat = lon = None
    m = re.search(r"北緯\s*(\d+)\s*度\s*(\d+)\s*分\s*([\d.]+)\s*秒", text)
    if m:
        lat = int(m.group(1)) + int(m.group(2))/60 + float(m.group(3))/3600
    m = re.search(r"東経\s*(\d+)\s*度\s*(\d+)\s*分\s*([\d.]+)\s*秒", text)
    if m:
        lon = int(m.group(1)) + int(m.group(2))/60 + float(m.group(3))/3600
    if lat is None or lon is None:
        m = re.search(r"ll=([\d.]+)\s*,\s*([\d.]+)", text)
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
    seen_ids = set()
    links = []
    empty_pages = 0
    for page in range(1, max_pages + 1):
        html = fetch(with_page(start_url, page))
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
        if page_new == 0:
            empty_pages += 1
        else:
            empty_pages = 0
        print(f"list page {page}: +{page_new} (total {len(links)})")
        if empty_pages >= 1:
            break
        time.sleep(0.2)
    return links


def old_rank(note):
    m = re.search(r"旧(官幣大社|官幣中社|官幣小社|国幣大社|国幣中社|国幣小社|別格官幣社|府社|県社|郷社|村社)", note or "")
    return m.group(1) if m else ""


def existing_keys():
    names = set()
    coords = []
    if not MASTER.exists():
        return names, coords
    with MASTER.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            n = norm_name(r.get("name", ""))
            if n:
                names.add(n)
            try:
                coords.append((float(r["lat"]), float(r["lng"]), n))
            except Exception:
                pass
    return names, coords


def near_existing(lat, lng, coords, km=0.12):
    if lat is None or lng is None:
        return False
    for a, b, _ in coords:
        dy = (lat - a) * 111.0
        dx = (lng - b) * 111.0 * math.cos(math.radians(lat))
        if math.hypot(dx, dy) <= km:
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
        return {
            "id": f"T2M{data_id}", "name": name, "yomi": yomi,
            "former_shrine_rank": old_rank(note),
            "shikinaisha_type": "式内社" if "式内社" in note else "",
            "ichinomiya_name": "", "province": province, "county": "",
            "prefecture": pref, "city": "", "address": addr,
            "lat": f"{lat:.7f}", "lng": f"{lng:.7f}",
            "gmap_url": f"https://maps.google.com/?q={lat:.7f},{lng:.7f}",
            "main_god_ids": "", "sub_god_ids": "", "description": note,
            "source_key": "KOKUGAKUIN_MODERN", "source_id": data_id, "db_tier": "2"
        }
    except Exception as e:
        print(f"modern detail failed {data_id}: {e}")
        return None


def build_modern(existing_names, existing_coords):
    links = collect_detail_links(MODERN_START)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        parsed = list(ex.map(parse_modern, links))
    out = []
    for r in parsed:
        if not r:
            continue
        lat, lng = float(r["lat"]), float(r["lng"])
        nk = norm_name(r["name"])
        if nk in existing_names or near_existing(lat, lng, existing_coords):
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
            name = clean(re.sub(r"^\(論社\)", "", raw_name))
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
                "description": "延喜式内社データベースの現社候補" + ("（論社）" if "論社" in raw_name else ""),
                "source_key": "KOKUGAKUIN_SHIKINAI", "source_id": f"{data_id}:{idx}", "db_tier": "2"
            })
        return rows
    except Exception as e:
        print(f"shikinai detail failed {data_id}: {e}")
        return []


def build_shikinai(existing_names, existing_coords, modern_rows):
    links = collect_detail_links(SHIKINAI_START)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        batches = list(ex.map(parse_shikinai, links))
    out = []
    seen = {(norm_name(r["name"]), round(float(r["lat"]), 4), round(float(r["lng"]), 4)) for r in modern_rows}
    for batch in batches:
        for r in batch:
            lat, lng = float(r["lat"]), float(r["lng"])
            nk = norm_name(r["name"])
            key = (nk, round(lat, 4), round(lng, 4))
            if key in seen or nk in existing_names or near_existing(lat, lng, existing_coords):
                continue
            seen.add(key)
            out.append(r)
    return out, len(links)


def dedupe(rows):
    result = []
    seen = set()
    for r in rows:
        key = (norm_name(r["name"]), round(float(r["lat"]), 4), round(float(r["lng"]), 4))
        if key in seen:
            continue
        seen.add(key)
        result.append(r)
    return result


def main():
    existing_names, existing_coords = existing_keys()
    modern, modern_source_count = build_modern(existing_names, existing_coords)
    shikinai, shikinai_source_count = build_shikinai(existing_names, existing_coords, modern)
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
        "existing_master_records": len(existing_names),
        "modern_rows_added": len(modern),
        "shikinai_rows_added": len(shikinai),
        "tier2_generated_rows": len(rows),
        "worker_count": MAX_WORKERS,
        "note": "祭神K-IDは未確定のものを空欄保持。Tier2完成判定は検索・地図表示を優先。"
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
