#!/usr/bin/env python3
import csv, json, math, re, time, unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://jmapps.ne.jp/kokugakuin/"
MODERN_URL = BASE + "list.html?_f12_f=&_f12_t=&bunrui=28&f10=&f12=&f3=&f44=&f5=&f6=&f7=&f8=&f9=&hlvl=1&keywords=&kwd_and_or=and&list_count=5000&list_type=LLA001&title=&title_query=yes"
SHIKINAI_URL = BASE + "list.html?_f10_f=&_f10_t=&_f12_f=&_f12_t=&_f2_f=&_f2_t=&_f9_f=&_f9_t=&bunrui=34&f10=&f116=&f12=&f134=&f151=&f155=&f158=&f159=&f170=&f172=&f174=&f2=&f250=&f255=&f258=&f259=&f261=&f262=&f270=&f281=&f290=&f299=&f3=&f30=&f300=&f301=&f302=&f31=&f38=&f43=&f44=&f45=&f46=&f47=&f48=&f5=&f50=&f56=&f6=&f73=&f9=&hlvl=1&keywords=&kwd_and_or=and&list_count=5000&list_type=LLA001&title=&title_query=yes"
MASTER = Path("data/jinja_master.csv")
OUT = Path("data/jinja_tier2_generated.csv")
REPORT = Path("data/tier2_build_report.json")
HEADERS = ["id","name","yomi","former_shrine_rank","shikinaisha_type","ichinomiya_name","province","county","prefecture","city","address","lat","lng","gmap_url","main_god_ids","sub_god_ids","description","source_key","source_id","db_tier"]
UA = {"User-Agent":"kamisama-db-research-builder/2.0 (+https://github.com/Phantom-Theatre88/kamisama-db)"}


def get(url, retries=4):
    for i in range(retries):
        try:
            r = requests.get(url, headers=UA, timeout=40)
            r.raise_for_status(); r.encoding = r.apparent_encoding or "utf-8"
            return r.text
        except Exception:
            if i == retries-1: raise
            time.sleep(1+i)


def clean(s): return re.sub(r"\s+"," ",(s or "").replace("\u3000"," ")).strip()
def norm(s):
    s=unicodedata.normalize("NFKC",clean(s)).replace("神","神").replace("國","国").replace("﨑","崎")
    return re.sub(r"[\s・･,，、()（）\[\]［］]","",s)

def dms(text):
    text=text or ""; lat=lng=None
    m=re.search(r"北緯\s*(\d+)\s*度\s*(\d+)\s*分\s*([\d.]+)\s*秒",text)
    if m: lat=int(m[1])+int(m[2])/60+float(m[3])/3600
    m=re.search(r"東経\s*(\d+)\s*度\s*(\d+)\s*分\s*([\d.]+)\s*秒",text)
    if m: lng=int(m[1])+int(m[2])/60+float(m[3])/3600
    if lat is None or lng is None:
        m=re.search(r"(?:ll=|q=)([\d.]+)\s*,\s*([\d.]+)",text)
        if m: lat,lng=float(m[1]),float(m[2])
    return lat,lng

def fields(html):
    soup=BeautifulSoup(html,"html.parser"); out={}
    for tr in soup.find_all("tr"):
        c=tr.find_all(["th","td"])
        if len(c)>=2:
            k=clean(c[0].get_text(" ",strip=True)); v=clean(c[1].get_text(" ",strip=True))
            if k: out[k]=v
    for dt in soup.find_all("dt"):
        dd=dt.find_next_sibling("dd")
        if dd: out[clean(dt.get_text(" ",strip=True))]=clean(dd.get_text(" ",strip=True))
    return out,soup

def links(url):
    soup=BeautifulSoup(get(url),"html.parser"); out=[]; seen=set()
    hit_text=clean(soup.get_text(" ",strip=True))
    m=re.search(r"(\d+)件ヒット",hit_text); declared=int(m[1]) if m else None
    for a in soup.find_all("a",href=True):
        m=re.search(r"det\.html\?data_id=(\d+)",a["href"])
        if m and m[1] not in seen:
            seen.add(m[1]); out.append((urljoin(BASE,a["href"]),m[1]))
    print(f"declared={declared} links={len(out)}")
    return out,declared

def rank(note):
    m=re.search(r"旧(官幣大社|官幣中社|官幣小社|国幣大社|国幣中社|国幣小社|別格官幣社|府社|県社|郷社|村社)",note or "")
    return m[1] if m else ""

def existing():
    out=[]
    with MASTER.open(encoding="utf-8-sig",newline="") as f:
        for r in csv.DictReader(f):
            try: la,ln=float(r.get("lat","")),float(r.get("lng",""))
            except: la=ln=None
            out.append((norm(r.get("name","")),la,ln))
    return out

def dist(a,b,c,d):
    dy=(a-c)*111; dx=(b-d)*111*math.cos(math.radians((a+c)/2)); return math.hypot(dx,dy)

def is_existing(name,lat,lng,base):
    nk=norm(name)
    for n,la,ln in base:
        if n==nk and la is not None and lat is not None and dist(lat,lng,la,ln)<=2: return True
    return False

def parse_modern(item):
    url,data_id=item
    try:
        f,s=fields(get(url))
        name=clean(f.get("団体名") or f.get("+神社名") or f.get("神社名"))
        yomi=clean(f.get("+神社名よみ") or f.get("神社名よみ"))
        pref=clean(f.get("都道府県名（上級行政区画）") or f.get("都道府県名、上級行政区画"))
        province=clean(f.get("旧国名")); addr=clean(f.get("住所"))
        if pref and addr and not addr.startswith(pref): addr=pref+addr
        lat,lng=dms(f.get("緯度/経度 latitude/longitude","") + " " + f.get("緯度経度",""))
        note=clean(f.get("+備考") or f.get("備考"))
        if not name or lat is None or lng is None: return None
        return {"id":f"T2M{data_id}","name":name,"yomi":yomi,"former_shrine_rank":rank(note),"shikinaisha_type":"式内社" if "式内社" in note else "","ichinomiya_name":"","province":province,"county":"","prefecture":pref,"city":"","address":addr,"lat":f"{lat:.7f}","lng":f"{lng:.7f}","gmap_url":f"https://maps.google.com/?q={lat:.7f},{lng:.7f}","main_god_ids":"","sub_god_ids":"","description":"國學院大學「神道・神社史料集成（現代）」収録社。","source_key":"KOKUGAKUIN_MODERN","source_id":data_id,"db_tier":"2"}
    except Exception as e:
        print("modern fail",data_id,e); return None

def numbered(f,prefix):
    out=[]; pat=re.compile(rf"^\+?{re.escape(prefix)}（(\d+)）$")
    for k,v in f.items():
        m=pat.match(k)
        if m: out.append((int(m[1]),v))
    return sorted(out)

def parse_shiki(item):
    url,data_id=item
    try:
        f,_=fields(get(url)); province=clean(f.get("国名") or f.get("旧国名")); county=clean(f.get("旧郡名")); st=clean(f.get("名神大社・大社・小社") or f.get("社格")) or "式内社"; out=[]
        for idx,raw in numbered(f,"現社名など"):
            cand="論社" in raw; name=clean(re.sub(r"^[（(]\s*論社\s*[）)]\s*","",raw))
            coord=(f.get(f"+現社名など（{idx}）緯度経度") or f.get(f"現社名など（{idx}）緯度経度") or "")+" "+(f.get(f"+現社名など（{idx}）リンク") or f.get(f"現社名など（{idx}）リンク") or "")
            lat,lng=dms(coord)
            if not name or lat is None or lng is None: continue
            out.append({"id":f"T2S{data_id}_{idx}","name":name,"yomi":"","former_shrine_rank":"","shikinaisha_type":st,"ichinomiya_name":"","province":province,"county":county,"prefecture":"","city":"","address":"","lat":f"{lat:.7f}","lng":f"{lng:.7f}","gmap_url":f"https://maps.google.com/?q={lat:.7f},{lng:.7f}","main_god_ids":"","sub_god_ids":"","description":"延喜式内社データベースの現社候補"+("（論社）" if cand else ""),"source_key":"KOKUGAKUIN_SHIKINAI","source_id":f"{data_id}:{idx}","db_tier":"2"})
        return out
    except Exception as e:
        print("shiki fail",data_id,e); return []

def same(a,b): return norm(a["name"])==norm(b["name"]) and dist(float(a["lat"]),float(a["lng"]),float(b["lat"]),float(b["lng"]))<=0.5

def main():
    ml,mdecl=links(MODERN_URL); sl,sdecl=links(SHIKINAI_URL)
    if len(ml)<1200 or len(sl)<2500:
        raise RuntimeError(f"single-page expansion rejected: modern {len(ml)}/{mdecl}, shikinai {len(sl)}/{sdecl}")
    base=existing()
    with ThreadPoolExecutor(max_workers=8) as ex: modern=list(ex.map(parse_modern,ml))
    modern=[r for r in modern if r and not is_existing(r["name"],float(r["lat"]),float(r["lng"]),base)]
    with ThreadPoolExecutor(max_workers=8) as ex: batches=list(ex.map(parse_shiki,sl))
    rows=[]
    for r in modern:
        if not any(same(r,x) for x in rows): rows.append(r)
    for batch in batches:
        for r in batch:
            if is_existing(r["name"],float(r["lat"]),float(r["lng"]),base): continue
            if any(same(r,x) for x in rows): continue
            rows.append(r)
    rows.sort(key=lambda r:(r.get("prefecture",""),r.get("province",""),r["name"],r["id"]))
    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=HEADERS); w.writeheader(); w.writerows(rows)
    report={"modern_declared":mdecl,"modern_links":len(ml),"shikinai_declared":sdecl,"shikinai_links":len(sl),"curated_master":len(base),"tier2_generated_rows":len(rows),"total_app_rows":len(base)+len(rows),"dedupe":"same normalized name + nearby coordinates","status":"complete" if len(rows)>=2000 else "insufficient"}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if len(rows)<2000: raise RuntimeError("Tier 2 generated fewer than 2000 rows")

if __name__=="__main__": main()
