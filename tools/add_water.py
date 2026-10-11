"""
맵에 큰 물(강·호수)을 넣는 도구. 외부 데이터 없이 tools/water_spec.json 에 우리가 정한 목록을 사용.

- 호수/하구: 기준점(또는 대략 그린 범위) 안에서 어느 구역에도 속하지 않는 빈 공간을 물로 채움
  → 지역 경계·해안선과 정확히 맞물림
- 강: tools/korea_rivers_ne10m.json(Natural Earth 10m 중심선)을 폭만큼 두껍게 그림

사용법:
    python tools/add_water.py assets/south_korea_exact_zones.json [...]
    python tools/build_map.py assets/south_korea_exact_zones.json [...]   # 물 건너 연결(waterLinks) 계산
"""
import json
import os
import sys

from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.validation import make_valid

HERE = os.path.dirname(__file__)
SPEC = json.load(open(os.path.join(HERE, 'water_spec.json'), encoding='utf-8'))
LINES = json.load(open(os.path.join(HERE, 'korea_rivers_ne10m.json'), encoding='utf-8'))


def polys(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for x in getattr(g, 'geoms', []) for p in polys(x)]


def rings(g, min_area=2e-6):
    return [[[round(x, 6), round(y, 6)] for x, y in list(p.exterior.coords)[:-1]]
            for p in polys(g) if p.area >= min_area]


def process(path):
    d = json.load(open(path, encoding='utf-8'))
    cfg = SPEC['maps'].get(os.path.basename(path), {})
    b = d.get('meta', {}).get('bounds')
    allp = [Polygon(r) for z in d['zones'] for r in z['polygons']]
    allp += [Polygon(r) for bd in d.get('backdrop', []) for r in bd['polygons']]
    land = unary_union([make_valid(p) for p in allp])
    minx, miny, maxx, maxy = land.bounds
    frame = box(minx, miny, maxx, maxy)

    # keepExisting: 맵에 원래 있던 물(예: 서울 한강 폴리곤)만 유지하고 새로 추가한 것은 매번 다시 계산
    water = [w for w in d.get('water', []) if not w.get('generated')] if cfg.get('keepExisting') else []
    for lake in SPEC['lakes']:
        if 'rough' in lake:
            area = Polygon(lake['rough'])
            target = None
        else:
            x, y = lake['point']
            r = lake['radius']
            area = box(x - r, y - r, x + r, y + r)
            target = Polygon([(x - 1e-4, y - 1e-4), (x + 1e-4, y - 1e-4), (x + 1e-4, y + 1e-4), (x - 1e-4, y + 1e-4)])
        if not area.intersects(frame):
            continue
        empty = area.intersection(frame).difference(land)
        parts = polys(empty)
        if target is not None:
            parts = [p for p in parts if p.intersects(target)] or []
            # 기준점이 빈 공간이 아니면(이 맵에선 다른 구역에 덮여 있음) 건너뜀
        parts = [p for p in parts if p.area > 1e-5]
        if parts:
            water.append({'name': lake['name'], 'polygons': rings(unary_union(parts)), 'generated': True})

    width = cfg.get('riverWidth', 0.005)
    for river in ([] if cfg.get('noRivers') else SPEC['rivers']):
        geoms = [LineString(l).buffer(width / 2, cap_style='round', join_style='round')
                 for key in river['lines'] for l in LINES.get(key, [])]
        g = unary_union(geoms).intersection(frame)
        if not g.is_empty:
            water.append({'name': river['name'], 'polygons': rings(g), 'generated': True})

    d['water'] = water
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{path}: 물 {len(water)}개 {[w["name"] for w in water]}')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        process(p)
