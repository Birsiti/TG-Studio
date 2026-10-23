# изменено 2026-10-23 04:00
# Геокодирование точек: структурный запрос (город + улица + дом) к Nominatim, проверка «не дальше 120 км от склада»
# Запуск на iMac или маке:
#   sqlite3 -separator "	" ~/tg-studio-data/cake.db "select id,route,customer,address from points where active=1" > points.tsv
#   python3 db/geocode_points.py   → geo2.json; перенести в js/geo-points.js, промахи поправить руками
import csv, json, math, re, subprocess, sys, time, urllib.parse
SKLAD = (53.89817, 27.50728)
def get(params):
    u = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(dict(params, format="json", limit=1, countrycodes="by"))
    out = subprocess.check_output(["curl", "-s", "-m15", "-A", "TG-Studio-cake/1.0 (birsiti@gmail.com)", u]); time.sleep(1.1)
    d = json.loads(out or b"[]")
    return (round(float(d[0]["lat"]), 5), round(float(d[0]["lon"]), 5)) if d else None
def km(a, b):
    return 6371 * 2 * math.asin(math.sqrt(math.sin(math.radians(b[0]-a[0])/2)**2 + math.cos(math.radians(a[0]))*math.cos(math.radians(b[0]))*math.sin(math.radians(b[1]-a[1])/2)**2))
STREET = r"(ул\.|улица|пр-т|проспект|тр-т|тракт|пер\.|переулок)\s*"
def parse(a):
    a = re.sub(r"\s*\(.*?\)", "", a)
    city = re.search(r"(?:г\.|д\.|а\.?г\.|а/г|пос\.|аг\.)\s*([А-ЯЁ][а-яё\-]+(?:\s[А-ЯЁ][а-яё\-]+)?)", a)
    st = re.search(STREET + r"([^,]+?)\s*,\s*(?:д\.\s*)?(\d+[А-Яа-яA-Za-z]?)", a)
    kind = {"ул.":"улица","улица":"улица","пр-т":"проспект","проспект":"проспект","тр-т":"тракт","тракт":"тракт","пер.":"переулок","переулок":"переулок"}
    street = f"{st.group(3)} {kind[st.group(1).strip()]} {st.group(2).strip()}" if st else None
    return (city.group(1) if city else None), street
res = {}
for pid, route, cust, addr in csv.reader(open("points.tsv"), delimiter="\t"):
    city, street = parse(addr)
    hit, how = None, ""
    tries = []
    if city and street: tries.append(({"city": city, "street": street}, "точно"))
    if city: tries.append(({"q": f"{city}, Беларусь"}, "по населённому пункту"))
    for params, h in tries:
        r = get(params)
        if r and (km(SKLAD, r) < 120 or route == "Бобруйск"):
            hit, how = r, h; break
    res[pid] = {"lat": hit[0], "lon": hit[1], "q": how} if hit else None
    print(route, "|", addr[:50], "|", city, "|", street, "->", res[pid], file=sys.stderr)
json.dump(res, open("geo2.json", "w"), ensure_ascii=False)
