#!/usr/bin/env python3
import csv, json, math, unicodedata, re
from pathlib import Path

MASTER=Path('data/jinja_master.csv')
SHARDS=Path('tier2_shards')
OUT=Path('data/jinja_tier2_generated.csv')
REPORT=Path('data/tier2_build_report.json')
HEADERS=["id","name","yomi","former_shrine_rank","shikinaisha_type","ichinomiya_name","province","county","prefecture","city","address","lat","lng","gmap_url","main_god_ids","sub_god_ids","description","source_key","source_id","db_tier"]

def clean(s): return re.sub(r'\s+',' ',(s or '').replace('\u3000',' ')).strip()
def norm(s):
    s=unicodedata.normalize('NFKC',clean(s)).replace('神','神').replace('國','国').replace('﨑','崎')
    return re.sub(r'[\s・･,，、()（）\[\]［］]','',s)
def dist(a,b,c,d):
    dy=(a-c)*111; dx=(b-d)*111*math.cos(math.radians((a+c)/2)); return math.hypot(dx,dy)
def read_rows(p):
    with p.open(encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))

def main():
    base=read_rows(MASTER)
    existing=[]
    for r in base:
        try: lat,lng=float(r.get('lat','')),float(r.get('lng',''))
        except: lat=lng=None
        existing.append((norm(r.get('name','')),lat,lng))

    shard_files=sorted(SHARDS.rglob('*.csv'))
    rows=[]; source_counts={}
    for p in shard_files:
        rr=read_rows(p); source_counts[p.name]=len(rr); rows.extend(rr)

    merged=[]
    for r in rows:
        try: lat,lng=float(r['lat']),float(r['lng'])
        except: continue
        nk=norm(r.get('name',''))
        if any(n==nk and a is not None and b is not None and dist(lat,lng,a,b)<=2 for n,a,b in existing): continue
        duplicate=False
        for x in merged:
            if norm(x.get('name',''))==nk and dist(lat,lng,float(x['lat']),float(x['lng']))<=.5:
                duplicate=True; break
        if not duplicate: merged.append(r)

    merged.sort(key=lambda r:(r.get('prefecture',''),r.get('province',''),r.get('name',''),r.get('id','')))
    OUT.parent.mkdir(exist_ok=True)
    with OUT.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=HEADERS); w.writeheader(); w.writerows(merged)

    modern=sum(1 for r in merged if r.get('source_key')=='KOKUGAKUIN_MODERN')
    shiki=sum(1 for r in merged if r.get('source_key')=='KOKUGAKUIN_SHIKINAI')
    report={
        'shard_files':len(shard_files),
        'shard_rows_before_dedupe':len(rows),
        'modern_rows_after_dedupe':modern,
        'shikinai_rows_after_dedupe':shiki,
        'tier2_generated_rows':len(merged),
        'curated_master':len(base),
        'total_app_rows':len(base)+len(merged),
        'status':'complete' if len(merged)>=2000 else 'insufficient',
        'shards':source_counts,
        'dedupe':'normalized name + coordinate proximity'
    }
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2), flush=True)
    if len(merged)<2000: raise SystemExit(2)

if __name__=='__main__': main()
