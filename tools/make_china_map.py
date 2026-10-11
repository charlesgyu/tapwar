"""
중국 맵 생성 도구 (현급 경계 → 지방별 / 중국 전국 맵)

데이터: geoBoundaries CHN ADM1·ADM2 (PDDL 퍼블릭 도메인, 원자료 중국 국가측량지리정보국)
  https://github.com/wmgeolab/geoBoundaries  (releaseData/gbOpen/CHN)

맵 종류
  pref  : 성급 단위 (중국 전국, 31개)
  split : 성에서 시작해 가장 넓은 구역을 현 경계를 따라 둘로 나누기를 --target 개까지 반복 ("허베이 북부"처럼)

대만·홍콩·마카오는 넣지 않음. 본토에서 --island-radius(도)보다 먼 섬(남중국해 등)은 제외.

사용법:
    python tools/make_china_map.py adm1.geojson adm2.geojson split "화북" assets/cn_huabei_zones.json --provs 北京,天津,河北,山西,内蒙古 --target 25
    python tools/build_map.py assets/cn_huabei_zones.json
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_region_map import split_until  # noqa: E402

# geoBoundaries ADM1 이름 → (키, 한글)
PROV = {
    'Beijing Municipality': ('北京', '베이징'), 'Tianjin Municipality': ('天津', '톈진'), 'Hebei Province': ('河北', '허베이'),
    'Shanxi Province': ('山西', '산시'), 'Inner Mongolia Autonomous Region': ('内蒙古', '네이멍구'),
    'Liaoning Province': ('辽宁', '랴오닝'), 'Jilin Province': ('吉林', '지린'), 'Heilongjiang Province': ('黑龙江', '헤이룽장'),
    'Shanghai Municipality': ('上海', '상하이'), 'Jiangsu Province': ('江苏', '장쑤'), 'Zhejiang Province': ('浙江', '저장'),
    'Anhui Province': ('安徽', '안후이'), 'Fujian Province': ('福建', '푸젠'), 'Jiangxi Province': ('江西', '장시'),
    'Shandong Province': ('山东', '산둥'), 'Henan Province': ('河南', '허난'), 'Hubei Province': ('湖北', '후베이'),
    'Hunan Province': ('湖南', '후난'), 'Guangzhou Province': ('广东', '광둥'), 'Guangxi Zhuang Autonomous Region': ('广西', '광시'),
    'Hainan Province': ('海南', '하이난'), 'Chongqing Municipality': ('重庆', '충칭'), 'Sichuan Province': ('四川', '쓰촨'),
    'Guizhou Province': ('贵州', '구이저우'), 'Yunnan Province': ('云南', '윈난'), 'Tibet Autonomous Region': ('西藏', '시짱'),
    'Shaanxi Province': ('陕西', '샨시'), 'Gansu Province': ('甘肃', '간쑤'), 'Qinghai Province': ('青海', '칭하이'),
    'Ningxia Ningxia Hui Autonomous Region': ('宁夏', '닝샤'), 'Xinjiang Uyghur Autonomous Region': ('新疆', '신장'),
}
# 넣지 않는 곳
SKIP = {'Taiwan Province', 'Hong Kong Special Administrative Region', 'Macau Special Administrative Region'}


def rings_of(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    return [[[round(x, 4), round(y, 4)] for x, y in poly[0]] for poly in polys]


def main():
    from shapely.geometry import shape, Polygon
    from shapely.ops import unary_union
    from shapely.strtree import STRtree

    ap = argparse.ArgumentParser()
    ap.add_argument('adm1'); ap.add_argument('adm2')
    ap.add_argument('kind', choices=['pref', 'split'])
    ap.add_argument('title'); ap.add_argument('out')
    ap.add_argument('--provs', default='', help='쉼표로 구분한 성 키(北京 등). 비우면 전체')
    ap.add_argument('--target', type=int, default=25)
    ap.add_argument('--island-radius', type=float, default=1.0)
    ap.add_argument('--margin', type=float, default=0.2)
    a = ap.parse_args()

    want = set(p for p in a.provs.split(',') if p)
    provs = []
    for f in json.load(open(a.adm1, encoding='utf-8'))['features']:
        n = f['properties']['shapeName']
        if n in SKIP or n not in PROV:
            continue
        key, ko = PROV[n]
        if want and key not in want:
            continue
        provs.append((key, ko, shape(f['geometry']).buffer(0)))
    tree = STRtree([g for _, _, g in provs])

    groups = {}
    for f in json.load(open(a.adm2, encoding='utf-8'))['features']:
        g = shape(f['geometry']).buffer(0)
        if g.is_empty:
            continue
        pt = g.representative_point()
        hit = None
        for i in tree.query(pt):
            if provs[i][2].contains(pt):
                hit = provs[i]; break
        if not hit:
            continue
        key, ko, _ = hit
        rings = rings_of(f['geometry'])
        grp = groups.setdefault(key, {'id': key, 'name': ko, 'polygons': [], 'dongs': []})
        grp['polygons'].extend(rings)
        grp['dongs'].append({'id': f['properties']['shapeID'], 'name': f['properties']['shapeName'], 'polygons': rings})

    # 먼 섬 제외 (가장 큰 땅덩어리의 5% 이상인 땅에서 island-radius 보다 먼 섬)
    polys = [Polygon(r).buffer(0) for g in groups.values() for r in g['polygons'] if len(r) >= 4]
    land = unary_union([p.buffer(0.01) for p in polys])
    comps = list(land.geoms) if land.geom_type == 'MultiPolygon' else [land]
    big = max(c.area for c in comps)
    anchors = [c for c in comps if c.area >= big * 0.05]
    keep = unary_union([c for c in comps if min(c.distance(x) for x in anchors) <= a.island_radius])
    for g in groups.values():
        ok = lambda r: len(r) >= 4 and keep.intersects(Polygon(r).buffer(0).representative_point())
        g['polygons'] = [r for r in g['polygons'] if ok(r)]
        for d in g['dongs']:
            d['polygons'] = [r for r in d['polygons'] if ok(r)]
        g['dongs'] = [d for d in g['dongs'] if d['polygons']]
    groups = {k: g for k, g in groups.items() if g['polygons']}

    if a.kind == 'split' and len(groups) < a.target:
        groups = split_until(groups, a.target)

    zones = []
    for g in groups.values():
        xs = [x for r in g['polygons'] for x, _ in r]; ys = [y for r in g['polygons'] for _, y in r]
        zones.append({'id': str(g['id']), 'name': g['name'], 'lng': (min(xs) + max(xs)) / 2,
                      'lat': (min(ys) + max(ys)) / 2, 'maxOrbs': 50, 'polygons': g['polygons']})
    xs = [x for z in zones for r in z['polygons'] for x, _ in r]; ys = [y for z in zones for r in z['polygons'] for _, y in r]
    bounds = {'minLng': round(min(xs) - a.margin, 3), 'maxLng': round(max(xs) + a.margin, 3),
              'minLat': round(min(ys) - a.margin, 3), 'maxLat': round(max(ys) + a.margin, 3)}
    out = {'meta': {'name': a.title, 'bounds': bounds, 'level': a.kind,
                    'source': 'geoBoundaries CHN (PDDL), 중국 국가측량지리정보국 원자료'},
           'zones': zones, 'links': []}
    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{a.out}: {a.kind} {len(zones)}개 bounds={bounds}')


if __name__ == '__main__':
    main()
