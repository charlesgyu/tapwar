"""구역마다 합쳐진 원래 조각들을 하나로 녹여 꼭짓점 수를 줄임 (그리기 속도 개선)
python tools/dissolve_zones.py <zones.json> [--simplify 0.04] [--min-part 0.02]
- 같은 구역 안의 내부 경계 제거, 아주 작은 섬 조각(min-part 제곱도 미만)은 버림 (가장 큰 조각은 항상 유지)
- 다음에 build_map.py 로 이웃 연결을 다시 만들 것"""
import argparse, json
from shapely.geometry import Polygon
from shapely.ops import unary_union

ap = argparse.ArgumentParser()
ap.add_argument('path'); ap.add_argument('--simplify', type=float, default=0.04); ap.add_argument('--min-part', type=float, default=0.02)
a = ap.parse_args()
d = json.load(open(a.path, encoding='utf-8'))
before = sum(len(r) for z in d['zones'] for r in z['polygons'])
for z in d['zones']:
    g = unary_union([Polygon(r).buffer(0) for r in z['polygons'] if len(r) >= 4])
    g = g.buffer(0.005).buffer(-0.005).simplify(a.simplify, preserve_topology=True)
    parts = sorted(g.geoms if g.geom_type == 'MultiPolygon' else [g], key=lambda p: -p.area)
    parts = [p for i, p in enumerate(parts) if i == 0 or p.area >= a.min_part]
    z['polygons'] = [[[round(x, 4), round(y, 4)] for x, y in p.exterior.coords] for p in parts if not p.is_empty]
after = sum(len(r) for z in d['zones'] for r in z['polygons'])
json.dump(d, open(a.path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'{a.path}: 꼭짓점 {before} → {after}, 조각 {sum(len(z["polygons"]) for z in d["zones"])}')
