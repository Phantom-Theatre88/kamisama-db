#!/usr/bin/env python3
import argparse, csv
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import build_tier2_v4 as b


def collect_pages(start_url, start_page, end_page):
    links=[]; seen=set()
    for page in range(start_page, end_page+1):
        html=b.fetch(b.with_page(start_url,page))
        current=b.list_links(html)
        added=0
        for item in current:
            if item[1] not in seen:
                seen.add(item[1]); links.append(item); added+=1
        print(f"page {page}: +{added}, total={len(links)}", flush=True)
    return links


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source', choices=['modern','shikinai'], required=True)
    ap.add_argument('--start-page', type=int, required=True)
    ap.add_argument('--end-page', type=int, required=True)
    ap.add_argument('--output', required=True)
    args=ap.parse_args()

    url=b.MODERN_URL if args.source=='modern' else b.SHIKINAI_URL
    links=collect_pages(url,args.start_page,args.end_page)
    if args.source=='modern':
        with ThreadPoolExecutor(max_workers=6) as ex:
            parsed=list(ex.map(b.parse_modern,links))
        rows=[r for r in parsed if r]
    else:
        with ThreadPoolExecutor(max_workers=6) as ex:
            batches=list(ex.map(b.parse_shiki,links))
        rows=[r for batch in batches for r in batch]

    out=Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=b.HEADERS); w.writeheader(); w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {out}", flush=True)

if __name__=='__main__':
    main()
