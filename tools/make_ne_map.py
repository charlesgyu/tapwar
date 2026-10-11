"""
미국·유럽·전세계 맵 생성 도구

데이터
  - Natural Earth (퍼블릭 도메인): ne_50m_admin_0_countries, ne_10m_admin_1_states_provinces (한글 이름 NAME_KO / name_ko 사용)
  - 미국 카운티: plotly/datasets geojson-counties-fips.json (미국 인구조사국 원자료, 퍼블릭 도메인)

모드
  us     : 미국 주(카운티를 합침). --units 주 FIPS 목록. --target 까지 카운티 경계로 나눔 ("텍사스 북부"처럼)
  europe : 나라(1급 행정구역을 합침). --units ISO A3 목록. --target 까지 1급 행정구역 경계로 나눔
  world  : 나라 단위 그대로. --continent 로 대륙 선택 (비우면 전세계), --units 로 나라 직접 지정 가능

공통: 가장 큰 땅덩어리(5% 이상)에서 --island-radius(도)보다 먼 섬 제외, --min-area(제곱도)보다 작은 나라 제외,
      --max-lat 보다 북쪽(스발바르 등) 제외, 날짜변경선을 넘는 러시아·피지 등은 경도 +360 으로 이어 붙임

사용법:
    python tools/make_ne_map.py us counties.json admin1.geojson "뉴잉글랜드" out.json --units 09,23,25,33,44,50 --target 18
    python tools/make_ne_map.py europe admin1.geojson admin0.geojson "서유럽" out.json --units FRA,BEL,NLD,LUX,CHE,DEU,AUT --target 25
    python tools/make_ne_map.py world admin0.geojson - "아프리카" out.json --continent Africa
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_region_map import split_until  # noqa: E402


# 나라별 맵을 큰 지방(레지옹·주) 단위로 묶을 때의 한글 이름 (Natural Earth admin-1 의 region 값)
REGION_KO = {
    # 프랑스
    'Hauts-de-France': '오드프랑스', 'Grand Est': '그랑테스트', "Provence-Alpes-Côte-d'Azur": '프로방스',
    'Auvergne-Rhône-Alpes': '오베르뉴론알프', 'Nouvelle-Aquitaine': '누벨아키텐', 'Occitanie': '옥시타니',
    'Bourgogne-Franche-Comté': '부르고뉴프랑슈콩테', 'Pays de la Loire': '페이드라루아르', 'Bretagne': '브르타뉴',
    'Normandie': '노르망디', 'Corse': '코르시카', 'Centre-Val de Loire': '상트르발드루아르', 'Île-de-France': '일드프랑스(파리)',
    # 이탈리아
    "Valle d'Aosta": '발레다오스타', 'Piemonte': '피에몬테', 'Lombardia': '롬바르디아', 'Trentino-Alto Adige': '트렌티노',
    'Liguria': '리구리아', 'Emilia-Romagna': '에밀리아로마냐', 'Marche': '마르케', 'Veneto': '베네토',
    'Friuli-Venezia Giulia': '프리울리', 'Abruzzo': '아브루초', 'Molise': '몰리세', 'Apulia': '풀리아',
    'Basilicata': '바실리카타', 'Calabria': '칼라브리아', 'Campania': '캄파니아', 'Lazio': '라치오(로마)',
    'Toscana': '토스카나', 'Sicily': '시칠리아', 'Sardegna': '사르데냐', 'Umbria': '움브리아',
    # 스페인
    'Foral de Navarra': '나바라', 'País Vasco': '바스크', 'Aragón': '아라곤', 'Cataluña': '카탈루냐',
    'Extremadura': '에스트레마두라', 'Andalucía': '안달루시아', 'Galicia': '갈리시아', 'Castilla y León': '카스티야이레온',
    'Valenciana': '발렌시아', 'Murcia': '무르시아', 'Asturias': '아스투리아스', 'Cantabria': '칸타브리아',
    'Islas Baleares': '발레아레스', 'La Rioja': '라리오하', 'Castilla-La Mancha': '카스티야라만차', 'Madrid': '마드리드',
    # 영국
    'Northern Ireland': '북아일랜드', 'West Wales and the Valleys': '웨일스 서부', 'East Wales': '웨일스 동부',
    'North West': '잉글랜드 북서부', 'West Midlands': '웨스트미들랜즈', 'South West': '잉글랜드 남서부',
    'East': '잉글랜드 동부', 'North East': '잉글랜드 북동부', 'Yorkshire and the Humber': '요크셔',
    'East Midlands': '이스트미들랜즈', 'South East': '잉글랜드 남동부', 'Greater London': '런던',
    'Highlands and Islands': '하일랜드', 'North Eastern': '스코틀랜드 북동부', 'Eastern': '스코틀랜드 동부',
    'South Western': '스코틀랜드 남서부',
}

# 공식 국호 대신 흔히 쓰는 한글 이름
COMMON_KO = {'CHN': '중국', 'PRK': '북한', 'KOR': '한국', 'TWN': '대만', 'USA': '미국', 'GBR': '영국',
             'COD': '콩고민주공화국', 'COG': '콩고', 'CAF': '중앙아프리카', 'ZAF': '남아공', 'DOM': '도미니카공화국'}


# 데이터상 실효 지배 기준으로 들어간 곳을 국제적으로 인정된 나라로 (크림·세바스토폴 → 우크라이나)
DEJURE = {'UA-43': 'UKR', 'UA-40': 'UKR'}
KO_FIX = {'키예프': '키이우', '세바스토폴': '세바스토폴', '크림 자치 공화국': '크림'}


def adm0_of(p):
    return DEJURE.get(p.get('iso_3166_2'), p['adm0_a3'])


def merge_enclaves(groups):
    """다른 구역에 완전히 둘러싸인 구역(베를린·키이우 등)은 둘러싼 구역과 합침: 이름 '베를린·브란덴부르크'"""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    geo = {k: unary_union([Polygon(r).buffer(0) for r in g['polygons']]) for k, g in groups.items()}
    shell = {k: unary_union([Polygon(p.exterior) for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g])]).buffer(1e-4)
             for k, g in geo.items()}
    for k in list(groups):
        for h in groups:
            if h != k and k in groups and shell[h].contains(geo[k]):
                groups[h]['polygons'] += groups[k]['polygons']
                groups[h]['dongs'] += groups[k]['dongs']
                groups[h]['name'] = groups[h]['name'] if groups[k]['name'] == groups[h]['name'] else f"{groups[k]['name']}·{groups[h]['name']}"
                del groups[k]
                break
    return groups


def merge_until(groups, target):
    """가장 작은 구역을 맞닿은 이웃 중 가장 작은 곳과 합치기를 target 개가 될 때까지 반복.
    합친 구역 이름은 가장 넓은 원래 구역의 이름"""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    zs = {}
    for k, g in groups.items():
        geom = unary_union([Polygon(r).buffer(0) for r in g['polygons']])
        zs[k] = {'id': k, 'name': g['name'], 'polygons': g['polygons'], 'dongs': g['dongs'], 'geom': geom,
                 'parts': [(geom.area, g['name'])]}
    while len(zs) > target:
        small = min(zs.values(), key=lambda z: z['geom'].area)
        nb = [z for z in zs.values() if z is not small and z['geom'].buffer(0.01).intersects(small['geom'])]
        if not nb:  # 섬처럼 이웃이 없으면 가장 가까운 곳
            nb = [min((z for z in zs.values() if z is not small), key=lambda z: z['geom'].distance(small['geom']))]
        t = min(nb, key=lambda z: z['geom'].area)
        t['polygons'] = t['polygons'] + small['polygons']
        t['dongs'] = t['dongs'] + small['dongs']
        t['geom'] = unary_union([t['geom'], small['geom']])
        t['parts'] += small['parts']
        t['name'] = max(t['parts'])[1]
        del zs[small['id']]
    return zs


def polys_of(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']


def main():
    from shapely.geometry import shape, Polygon, mapping
    from shapely.ops import unary_union

    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['us', 'europe', 'world', 'country'])
    ap.add_argument('src1'); ap.add_argument('src2')
    ap.add_argument('title'); ap.add_argument('out')
    ap.add_argument('--units', default='')
    ap.add_argument('--continent', default='')
    ap.add_argument('--exclude', default='', help='뺄 나라 A3')
    ap.add_argument('--extra', default='', help='대륙과 상관없이 넣을 나라 A3')
    ap.add_argument('--target', type=int, default=0)
    ap.add_argument('--by-region', action='store_true', help='country 모드: 1급 행정구역을 region(큰 지방) 단위로 묶음')
    ap.add_argument('--island-radius', type=float, default=1.5)
    ap.add_argument('--min-area', type=float, default=0.0)
    ap.add_argument('--max-lat', type=float, default=90)
    ap.add_argument('--min-lat', type=float, default=-60)
    ap.add_argument('--simplify', type=float, default=0.01)
    ap.add_argument('--margin', type=float, default=0.3)
    a = ap.parse_args()
    units = [u for u in a.units.split(',') if u]

    def clean(g):
        g = g.buffer(0)
        if a.simplify:
            g = g.simplify(a.simplify, preserve_topology=True).buffer(0)
        return g

    subs = []  # (그룹키, 한글이름, 하위단위 id, 하위단위 geom)
    if a.mode == 'us':
        ko = {}
        for f in json.load(open(a.src2, encoding='utf-8'))['features']:
            p = f['properties']
            if p.get('adm0_a3') == 'USA' and p.get('fips'):
                ko[p['fips'][2:]] = p['name_ko'] or p['name']
        for f in json.load(open(a.src1, encoding='utf-8'))['features']:
            fips = f['id']; st = fips[:2]
            if st == '11':
                st = '24'  # 워싱턴 D.C.는 메릴랜드에 합침
            if units and st not in units:
                continue
            subs.append((st, ko.get(st, st), fips, clean(shape(f['geometry']))))
    elif a.mode == 'country':
        # 한 나라: 1급 행정구역(한글 이름) 하나하나가 구역. 많으면 --target 까지 작은 것부터 이웃과 합침
        feats1 = json.load(open(a.src1, encoding='utf-8'))['features']
        for f in feats1:
            p = f['properties']
            if adm0_of(p) not in units:
                continue
            sid = p.get('iso_3166_2') or p['name']
            if a.by_region:
                reg = p.get('region')
                if reg not in REGION_KO:
                    continue  # 해외 영토·세우타 등 목록에 없는 지방은 제외
                subs.append((reg, REGION_KO[reg], sid, clean(shape(f['geometry']))))
            else:
                nm = p.get('name_ko') or p['name']
                subs.append((sid, KO_FIX.get(nm, nm), sid, clean(shape(f['geometry']))))
    elif a.mode == 'europe':
        ko = {f['properties']['ADM0_A3']: f['properties']['NAME_KO'] for f in json.load(open(a.src2, encoding='utf-8'))['features']}
        for f in json.load(open(a.src1, encoding='utf-8'))['features']:
            p = f['properties']; c = adm0_of(p)
            if units and c not in units:
                continue
            subs.append((c, ko.get(c, p.get('admin')), p.get('iso_3166_2') or p['name'], clean(shape(f['geometry']))))
    else:
        for f in json.load(open(a.src1, encoding='utf-8'))['features']:
            p = f['properties']; c = p['ADM0_A3']
            if c == 'ATA':
                continue
            if c in a.exclude.split(','):
                continue
            if a.continent and p['CONTINENT'] not in a.continent.split('|') and c not in a.extra.split(','):
                continue
            if units and c not in units:
                continue
            g = shape(f['geometry'])
            # 날짜변경선 넘는 나라: 서경 부분을 +360 으로 옮겨 이어 붙임
            if c in ('RUS', 'FJI'):
                parts = []
                for poly in polys_of(f['geometry']):
                    ring = poly[0]
                    if max(x for x, _ in ring) < -100:
                        ring = [[x + 360, y] for x, y in ring]
                    parts.append(Polygon(ring))
                g = unary_union([pp.buffer(0) for pp in parts])
            subs.append((c, COMMON_KO.get(c, p['NAME_KO']), c, g))

    if a.mode == 'world' and a.src2 != '-':
        crimea = unary_union([shape(f['geometry']).buffer(0) for f in json.load(open(a.src2, encoding='utf-8'))['features']
                              if f['properties'].get('iso_3166_2') in DEJURE])
        subs = [(k, n, i, (g.difference(crimea) if k == 'RUS' else g.union(crimea) if k == 'UKR' else g)) for k, n, i, g in subs]
    if a.mode == 'world':
        subs = [(k, n, i, clean(g)) for k, n, i, g in subs]

    # 위도 범위·먼 섬 제외 (조각 단위)
    pieces = []
    for key, name, sid, g in subs:
        for pg in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
            if pg.is_empty or pg.geom_type != 'Polygon':
                continue
            c = pg.representative_point()
            if a.min_lat <= c.y <= a.max_lat:
                pieces.append((key, name, sid, pg))
    land = unary_union([pg.buffer(0.02) for *_, pg in pieces])
    comps = list(land.geoms) if land.geom_type == 'MultiPolygon' else [land]
    # 가장 큰 땅덩어리에서 시작해 island-radius 이내로 이어지는 땅만 차례로 붙임 (먼 해외 영토 제외)
    comps.sort(key=lambda c: -c.area)
    kept, rest = [comps[0]], comps[1:]
    grew = True
    while grew:
        grew = False
        for c in rest[:]:
            if any(c.distance(k) <= a.island_radius for k in kept):
                kept.append(c); rest.remove(c); grew = True
    keep = unary_union(kept)

    groups = {}
    for key, name, sid, pg in pieces:
        if not keep.intersects(pg.representative_point()):
            continue
        ring = [[round(x, 4), round(y, 4)] for x, y in pg.exterior.coords]
        if len(ring) < 4:
            continue
        g = groups.setdefault(key, {'id': key, 'name': name, 'polygons': [], 'dongs': {}})
        g['polygons'].append(ring)
        g['dongs'].setdefault(sid, {'id': sid, 'name': sid, 'polygons': []})['polygons'].append(ring)
    for g in groups.values():
        g['dongs'] = list(g['dongs'].values())
    if a.min_area:
        groups = {k: g for k, g in groups.items()
                  if sum(Polygon(r).area for r in g['polygons']) >= a.min_area}

    if a.mode == 'country':
        groups = merge_enclaves(groups)
    if a.mode == 'country' and a.target and len(groups) > a.target:
        groups = merge_until(groups, a.target)
    elif a.target and len(groups) < a.target:
        groups = split_until(groups, a.target)

    zones = []
    for g in groups.values():
        xs = [x for r in g['polygons'] for x, _ in r]; ys = [y for r in g['polygons'] for _, y in r]
        zones.append({'id': str(g['id']), 'name': g['name'], 'lng': (min(xs) + max(xs)) / 2,
                      'lat': (min(ys) + max(ys)) / 2, 'maxOrbs': 50, 'polygons': g['polygons']})
    xs = [x for z in zones for r in z['polygons'] for x, _ in r]; ys = [y for z in zones for r in z['polygons'] for _, y in r]
    bounds = {'minLng': round(min(xs) - a.margin, 3), 'maxLng': round(max(xs) + a.margin, 3),
              'minLat': round(min(ys) - a.margin, 3), 'maxLat': round(max(ys) + a.margin, 3)}
    src = {'us': 'US Census 카운티 경계(plotly/datasets) · Natural Earth'}.get(a.mode, 'Natural Earth')
    out = {'meta': {'name': a.title, 'bounds': bounds, 'level': a.mode, 'source': src}, 'zones': zones, 'links': []}
    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{a.out}: {a.mode} {len(zones)}개 bounds={bounds}')


if __name__ == '__main__':
    main()
