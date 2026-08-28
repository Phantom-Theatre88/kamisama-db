#!/usr/bin/env python3
import csv, json, math, re, time, unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qsl, urlencode

import requests
from bs4 import BeautifulSoup

BASE = "https://jmapps.ne.jp/kokugakuin/"
MODERN_URL = BASE + "list.html?_f12_f=&_f12_t=&bunrui=28&f10=&f12=&f3=&f44=&f5=&f6=&f7=&f8=&f9=&hlvl=1&keywords=&kwd_and_or=and&list_count=100&list_type=LLA&title=&title_query=no"
SHIKINAI_URL = BASE + "list.html?_f10_f=&_f10_t=&_f12_f=&_f12_t=&_f2_f=&_f2_t=&_f9_f=&_f9_t=&bunrui=34&f10=&f116=&f12=&f134=&f151=&f155=&f158=&f159=&f170=&f172=&f174=&f2=&f250=&f255=&f258=&f259=&f261=&f262=&f270=&f281=&f290=&f299=&f3=&f30=&f300=&f301=&f302=&f31=&f38=&f43=&f44=&f45=&f46=&f47=&f48=&f5=&f50=&f56=&f6=&f73=&f9=&hlvl=1&keywords=&kwd_and_or=and&list_count=100&list_type=LLA&title=&title_query=no"
MASTER = Path("data/jinja_master.csv")
OUT = Path("data/jinja_tier2_generated.csv")
REPORT = Path("data/tier2_build_report.json")
HEADERS = ["id","name","yomi","former_shrine_rank","shikinaisha_type","ichinomiya_name","province","county","prefecture","city","address","lat","lng","gmap_url","main_god_ids","sub_god_ids","description","source_key","source_id","db_tier"]
UA = {"User-Agent":"kamisama-db-research-builder/4.0 (+https://github.com/Phantom-Theatre88/kamisama-db)"}

def fetch(url, retries=4):
    for i in range(retries):
        try:
            r=requests.get(url,headers=UA,timeout=35); r.raise_for_status(); r.encoding=r.apparent_encoding or "utf-8"; return r.text
        except Exception:
            if i==retries-1: raise
            time.sleep(1+i)

def clean(s): return re.sub(r"\s+"," ",(s or "").replace("\u3000"," ")).strip()
def norm(s):
    s=unicodedata.normalize("NFKC",clean(s)).replace("神","神").replace("國","国").replace("﨑","崎")
    return re.sub(r"[\s・･,，、()（）\[\]［］]","",s)

def with_page(url,page):
    p=urlsplit(url); q=dict(parse_qsl(p.query,keep_blank_values=True)); q.update(page=str(page),sort_field="f138",sort_type="asc",search_type="keyword",btn_list_type="yes")
    return urlunsplit((p.scheme,p.netloc,p.path,urlencode(q),p.fragment))

def list_links(html):
    soup=BeautifulSoup(html,"html.parser"); out=[]; seen=set()
    for a in soup.find_all("a",href=True):
        m=re.search(r"det\.html\?data_id=(\d+)",a["href"])
        if m and m[1] not in seen:
            seen.add(m[1]); out.append((urljoin(BASE,a["href"]),m[1]))
    return out

def collect(start_url):
    first=fetch(with_page(start_url,1)); text=clean(BeautifulSoup(first,"html.parser").get_text(" ",strip=True)); m=re.search(r"([0-9,]+)件ヒット",text); declared=int(m[1].replace(',','')) if m else 0
    pages=max(1,math.ceil(declared/100)); all_links=[]; seen=set()
    for page in range(1,pages+1):
        html=first if page==1 else fetch(with_page(start_url,page)); current=list_links(html); new=0
        for item in current:
            if item[1] not in seen: seen.add(item[1]); all_links.append(item); new+=1
        print(f"list page {page}/{pages}: +{new}, total={len(all_links)}, declared={declared}")
        if page>1 and new==0: raise RuntimeError(f"pagination did not advance at page {page}")
    if declared and len(all_links)<declared*.98: raise RuntimeError(f"list collection incomplete: {len(all_links)}/{declared}")
    return all_links,declared

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

def get_fields(html):
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

def rank(note):
    m=re.search(r"旧(官幣大社|官幣中社|官幣小社|国幣大社|国幣中社|国幣小社|別格官幣社|府社|県社|郷社|村社)",note or ""); return m[1] if m else ""

def existing():
    out=[]
    with MASTER.open(encoding="utf-8-sig",newline="") as f:
        for r in csv.DictReader(f):
            try: lat,lng=float(r.get("lat","")),float(r.get("lng",""))
            except: lat=lng=None
            out.append((norm(r.get("name","")),lat,lng))
    return out

def distance(a,b,c,d):
    dy=(a-c)*111; dx=(b-d)*111*math.cos(math.radians((a+c)/2)); return math.hypot(dx,dy)
def in_existing(name,lat,lng,base):
    nk=norm(name)
    return any(n==nk and a is not None and b is not None and distance(lat,lng,a,b)<=2 for n,a,b in base)
def same(a,b): return norm(a["name"])==norm(b["name"]) and distance(float(a["lat"]),float(a["lng"]),float(b["lat"]),float(b["lng"]))<=.5

def page_title(soup):
    h=soup.find("h1")
    if h:
        t=clean(h.get_text(" ",strip=True))
        if t and t not in ("資料詳細","資料情報"): return t
    title=clean(soup.title.get_text(" ",strip=True)) if soup.title else ""
    title=re.sub(r"\s*[：:]\s*資料情報.*$","",title)
    title=re.sub(r"^\[ID:\d+\]\s*","",title)
    return title

def parse_modern(item):
    url,data_id=item
    try:
        f,soup=get_fields(fetch(url)); name=clean(f.get("団体名") or f.get("+神社名") or f.get("神社名") or page_title(soup)); yomi=clean(f.get("+神社名よみ") or f.get("神社名よみ")); pref=clean(f.get("都道府県名（上級行政区画）") or f.get("都道府県名、上級行政区画")); province=clean(f.get("旧国名")); addr=clean(f.get("住所")); note=clean(f.get("+備考") or f.get("備考"))
        if pref and addr and not addr.startswith(pref): addr=pref+addr
        lat,lng=dms(' '.join([f.get("緯度/経度 latitude/longitude",''),f.get("緯度経度",''),soup.get_text(' ',strip=True)]))
        if not name or lat is None or lng is None: return None
        return {"id":f"T2M{data_id}","name":name,"yomi":yomi,"former_shrine_rank":rank(note),"shikinaisha_type":"式内社" if "式内社" in note else "","ichinomiya_name":"","province":province,"county":"","prefecture":pref,"city":"","address":addr,"lat":f"{lat:.7f}","lng":f"{lng:.7f}","gmap_url":f"https://maps.google.com/?q={lat:.7f},{lng:.7f}","main_god_ids":"","sub_god_ids":"","description":"國學院大學「神道・神社史料集成（現代）」収録社。","source_key":"KOKUGAKUIN_MODERN","source_id":data_id,"db_tier":"2"}
    except Exception as e: print("modern fail",data_id,e); return None

def shiki_indices(f):
    idx=set()
    for k in f:
        m=re.search(r"現社名など（(\d+)）(?:緯度経度|リンク)?$",k)
        if m: idx.add(int(m[1]))
    return sorted(idx)

def parse_shiki(item):
    url,data_id=item
    try:
        f,soup=get_fields(fetch(url)); province=clean(f.get("国名") or f.get("旧国名")); county=clean(f.get("旧郡名")); st=clean(f.get("名神大社・大社・小社") or f.get("社格")) or "式内社"; default_name=page_title(soup); out=[]
        for idx in shiki_indices(f):
            raw=clean(f.get(f"+現社名など（{idx}）") or f.get(f"現社名など（{idx}）") or default_name)
            cand="論社" in raw; name=clean(re.sub(r"^[（(]\s*論社\s*[）)]\s*","",raw))
            coord=' '.join([f.get(f"+現社名など（{idx}）緯度経度",''),f.get(f"現社名など（{idx}）緯度経度",''),f.get(f"+現社名など（{idx}）リンク",''),f.get(f"現社名など（{idx}）リンク",'')])
            lat,lng=dms(coord)
            if not name or lat is None or lng is None: continue
            out.append({"id":f"T2S{data_id}_{idx}","name":name,"yomi":"","former_shrine_rank":"","shikinaisha_type":st,"ichinomiya_name":"","province":province,"county":county,"prefecture":"","city":"","address":"","lat":f"{lat:.7f}","lng":f"{lng:.7f}","gmap_url":f"https://maps.google.com/?q={lat:.7f},{lng:.7f}","main_god_ids":"","sub_god_ids":"","description":"延喜式内社データベースの現社候補"+("（論社）" if cand else ""),"source_key":"KOKUGAKUIN_SHIKINAI","source_id":f"{data_id}:{idx}","db_tier":"2"})
        return out
    except Exception as e: print("shiki fail",data_id,e); return []

def main():
    modern_links,modern_declared=collect(MODERN_URL); shiki_links,shiki_declared=collect(SHIKINAI_URL); base=existing()
    with ThreadPoolExecutor(max_workers=10) as ex: modern=list(ex.map(parse_modern,modern_links))
    modern=[r for r in modern if r and not in_existing(r["name"],float(r["lat"]),float(r["lng"]),base)]
    with ThreadPoolExecutor(max_workers=10) as ex: batches=list(ex.map(parse_shiki,shiki_links))
    shiki=[r for batch in batches for r in batch]
    rows=[]
    for r in modern+shiki:
        if in_existing(r["name"],float(r["lat"]),float(r["lng"]),base) or any(same(r,x) for x in rows): continue
        rows.append(r)
    rows.sort(key=lambda r:(r.get("prefecture",""),r.get("province",""),r["name"],r["id"]))
    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=HEADERS); w.writeheader(); w.writerows(rows)
    report={"modern_declared":modern_declared,"modern_links":len(modern_links),"shikinai_declared":shiki_declared,"shikinai_links":len(shiki_links),"curated_master":len(base),"modern_generated":len(modern),"shikinai_current_shrine_rows":len(shiki),"tier2_generated_rows":len(rows),"total_app_rows":len(base)+len(rows),"status":"complete" if len(rows)>=2000 else "insufficient","dedupe":"normalized name + coordinate proximity"}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps(report,ensure_ascii=False,indent=2))
    if len(rows)<2000: raise RuntimeError(f"Tier2 insufficient: {len(rows)}")
if __name__=='__main__': main()
