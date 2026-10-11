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


# 공식 국호 대신 흔히 쓰는 한글 이름
COMMON_KO = {'CHN': '중국', 'PRK': '북한', 'KOR': '한국', 'TWN': '대만', 'USA': '미국', 'GBR': '영국',
             'COD': '콩고민주공화국', 'COG': '콩고', 'CAF': '중앙아프리카', 'ZAF': '남아공', 'DOM': '도미니카공화국'}


def polys_of(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']


def main():
    from shapely.geometry import shape, Polygon, mapping
    from shapely.ops import unary_union

    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['us', 'europe', 'world'])
    ap.add_argument('src1'); ap.add_argument('src2')
    ap.add_argument('title'); ap.add_argument('out')
    ap.add_argument('--units', default='')
    ap.add_argument('--continent', default='')
    ap.add_argument('--exclude', default='', help='뺄 나라 A3')
    ap.add_argument('--extra', default='', help='대륙과 상관없이 넣을 나라 A3')
    ap.add_argument('--target', type=int, default=0)
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
    elif a.mode == 'europe':
        ko = {f['properties']['ADM0_A3']: f['properties']['NAME_KO'] for f in json.load(open(a.src2, encoding='utf-8'))['features']}
        for f in json.load(open(a.src1, encoding='utf-8'))['features']:
            p = f['properties']; c = p['adm0_a3']
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
            subs.append((c, COMMON_KO.get(c, p['NAME_KO']), c, clean(g)))

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

    if a.target and len(groups) < a.target:
        groups = split_until(groups, a.target)

    zones = []
    for g in groups.values():
        xs = [x for r in g['polygons'] for x, _ in r]; ys = [y for r in g['polygons'] for _, y in r]
        zones.append({'id': str(g['id']), 'name': g['name'], 'lng': (min(xs) + max(xs)) / 2,
                      'lat': (min(ys) + max(ys)) / 2, 'maxOrbs': 50, 'polygons': g['polygons']})
    xs = [x for z in zones for r in z['polygons'] for x, _ in r]; ys = [y for z in zones for r in z['polygons'] for _, y in r]
    bounds = {'minLng': round(min(xs) - a.margin, 3), 'maxLng': round(max(xs) + a.margin, 3),
              'minLat': round(min(ys) - a.margin, 3), 'maxLat': round(max(ys) + a.margin, 3)}
    src = {'us': 'US Census 카운티 경계(plotly/datasets) · Natural Earth', 'europe': 'Natural Earth', 'world': 'Natural Earth'}[a.mode]
    out = {'meta': {'name': a.title, 'bounds': bounds, 'level': a.mode, 'source': src}, 'zones': zones, 'links': []}
    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{a.out}: {a.mode} {len(zones)}개 bounds={bounds}')


if __name__ == '__main__':
    main()
