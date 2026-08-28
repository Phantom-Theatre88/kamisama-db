import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

URL='https://jmapps.ne.jp/kokugakuin/list.html?_f12_f=&_f12_t=&bunrui=28&f10=&f12=&f3=&f44=&f5=&f6=&f7=&f8=&f9=&hlvl=1&keywords=&kwd_and_or=and&list_count=100&list_type=LLA001&title=&title_query=yes'
r=requests.get(URL,timeout=40,headers={'User-Agent':'Mozilla/5.0'}); r.raise_for_status(); r.encoding=r.apparent_encoding
s=BeautifulSoup(r.text,'html.parser')
print('FORMS')
for f in s.find_all('form'):
    print('FORM',f.get('id'),f.get('name'),f.get('method'),f.get('action'))
    for x in f.find_all(['input','select']):
        n=x.get('name')
        if n: print('FIELD',n,x.get('value'),x.get('type'))
print('SCRIPTS')
for sc in s.find_all('script'):
    src=sc.get('src')
    if src: print('SRC',urljoin(URL,src))
    txt=sc.string or sc.get_text('\n')
    if 'sw_page' in txt or 'page' in txt.lower(): print(txt[:12000])
print('PAGE_LINKS')
for a in s.find_all('a',href=True):
    if 'sw_page' in a['href']: print(a.get_text(' ',strip=True),a['href'])
