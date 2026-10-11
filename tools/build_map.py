"""
TAPWAR 맵 데이터 정리 도구 (모든 맵 공통, 새 맵 추가 시에도 반드시 실행)

사용법:
    pip install "shapely>=2.1"
    python tools/build_map.py assets/새맵.json [assets/다른맵.json ...]

하는 일:
1. 한 지역이 여러 조각(예: 서울 = 25개 구)으로 되어 있으면 하나의 덩어리로 병합 (섬은 별도 유지)
2. 이웃 지역 사이의 틈·겹침을 제거해 빈틈 없는 커버리지로 만듦
   - 겹침: 먼저 처리한 지역 우선으로 잘라냄
   - 틈: 가장 길게 맞닿은 이웃 지역에 편입
3. 커버리지 단순화(coverage_simplify)로 이웃 지역이 **완전히 같은 경계선 꼭짓점**을 공유하게 만듦
   → 화면에서 구역 경계선이 어긋나지 않고 정확히 겹침
4. 지역 이름·구슬 출발 위치(lng/lat)를 지역의 시각적 중심(가장 안쪽 지점, polylabel)으로 설정
5. 인접 관계(links)를 실제로 맞닿은 경계 기준으로 다시 계산
   (기존 links 중 섬 연결처럼 맞닿지 않은 연결은 유지)

입력 JSON 형식: { "zones": [{ "id", "name", "lng", "lat", "polygons": [[[lng, lat], ...], ...] }],
                  "links": [[id1, id2], ...], "backdrop"(선택): [{ "name", "polygons", ... }] }
"""
import json
import sys

import shapely
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import polylabel, unary_union
from shapely.validation import make_valid

MERGE_EPS = 0.0008     # 같은 지역 조각 사이 틈 메우기 폭 (도 단위, 약 80m)
GAP_EPS = 0.0015       # 지역 사이 틈 판정용 폭 (약 150m)
SIMPLIFY_TOL = 0.0002  # 공유 경계 단순화 허용 오차 (약 20m)
MIN_AREA = 1e-8


def polygons_only(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if hasattr(g, 'geoms'):
        out = []
        for p in g.geoms:
            out.extend(polygons_only(p))
        return out
    return []


def to_multi(g):
    parts = [p for p in polygons_only(g) if p.area > MIN_AREA]
    return MultiPolygon(parts) if parts else MultiPolygon()


def merge_parts(rings):
    parts = [make_valid(Polygon(r)) for r in rings if len(r) >= 3]
    u = unary_union([p.buffer(MERGE_EPS, join_style='mitre') for p in parts]).buffer(-MERGE_EPS, join_style='mitre')
    # 구멍 제거(외곽선만 사용)
    return to_multi(unary_union([Polygon(p.exterior) for p in polygons_only(u)]))


def build_coverage(geoms):
    # 1) 겹침 제거
    clean = []
    acc = Polygon()
    for g in geoms:
        d = to_multi(make_valid(g.difference(acc)))
        clean.append(d)
        acc = unary_union([acc, d])
    # 2) 틈 메우기: 전체를 살짝 부풀렸다 줄여 틈만 추출 후 가장 길게 맞닿은 지역에 편입
    land = acc.buffer(GAP_EPS, join_style='mitre').buffer(-GAP_EPS, join_style='mitre')
    gaps = polygons_only(make_valid(land.difference(acc)))
    for gap in gaps:
        if gap.area <= MIN_AREA:
            continue
        ring = gap.boundary.buffer(1e-6)
        best, best_len = None, 0.0
        for i, g in enumerate(clean):
            l = g.boundary.intersection(ring).length
            if l > best_len:
                best, best_len = i, l
        if best is not None:
            clean[best] = to_multi(make_valid(unary_union([clean[best], gap])))
    # 3) 모든 경계선을 교차점에서 쪼갠(노딩) 뒤 면을 재구성해, 이웃끼리 같은 꼭짓점을 공유하게 함
    from shapely.ops import polygonize
    lines = unary_union([g.boundary for g in clean])
    faces = list(polygonize(lines))
    tree = shapely.STRtree(clean)
    buckets = [[] for _ in clean]
    for f in faces:
        rp = f.representative_point()
        owner = None
        for j in tree.query(rp):
            if clean[j].contains(rp):
                owner = j
                break
        if owner is None:
            continue  # 커버리지 바깥(바다·구멍)
        buckets[owner].append(f)
    clean = [to_multi(unary_union(b)) if b else clean[i] for i, b in enumerate(buckets)]
    # 4) 공유 경계가 동일한 꼭짓점을 갖도록 커버리지 단순화
    simplified = shapely.coverage_simplify(clean, SIMPLIFY_TOL, simplify_boundary=False)
    return [to_multi(make_valid(g)) for g in simplified]


def rings_of(mp):
    out = []
    for p in sorted(mp.geoms, key=lambda p: -p.area):
        coords = list(p.exterior.coords)[:-1]
        if len(coords) >= 3:
            out.append([[round(x, 6), round(y, 6)] for x, y in coords])
    return out


def label_point(mp):
    main = max(mp.geoms, key=lambda p: p.area)
    pt = polylabel(main, tolerance=0.0005)
    return round(pt.x, 6), round(pt.y, 6)


def process(path):
    d = json.load(open(path, encoding='utf-8'))
    zones = d['zones']
    backdrop = d.get('backdrop', [])
    # 배경 지역(플레이 불가)도 함께 커버리지로 만들어 플레이 지역과 경계가 맞물리게 함
    all_geoms = build_coverage([merge_parts(z['polygons']) for z in zones] +
                               [merge_parts(b['polygons']) for b in backdrop])
    geoms = all_geoms[:len(zones)]
    for b, g in zip(backdrop, all_geoms[len(zones):]):
        b['polygons'] = rings_of(g)
        b['lng'], b['lat'] = label_point(g)

    # 다른 지역 외곽선 안에 완전히 들어간 조각(구멍 속 비지)은 외곽선만 쓰는 렌더링에서 가려지므로 제거
    exteriors = [[Polygon(p.exterior) for p in g.geoms] for g in geoms]
    for i, g in enumerate(geoms):
        keep_parts = []
        for p in g.geoms:
            inside_other = any(e.contains(p) for j, ex in enumerate(exteriors) if j != i for e in ex)
            if not inside_other:
                keep_parts.append(p)
        if keep_parts and len(keep_parts) != len(g.geoms):
            print(f'  {zones[i]["name"]}: 다른 지역 안에 갇힌 조각 {len(g.geoms) - len(keep_parts)}개 제거')
            geoms[i] = MultiPolygon(keep_parts)

    for z, g in zip(zones, geoms):
        z['polygons'] = rings_of(g)
        z['lng'], z['lat'] = label_point(g)

    # 인접 관계: 실제로 경계를 공유하는 지역끼리 + 기존의 비접촉 연결(섬 등) 유지
    ids = [z['id'] for z in zones]
    touching = set()
    tree = shapely.STRtree(geoms)
    for i, g in enumerate(geoms):
        for j in tree.query(g.buffer(1e-6)):
            if j <= i:
                continue
            if g.boundary.intersection(geoms[j].buffer(1e-6)).length > 1e-4:
                touching.add((ids[i], ids[j]))
    old = {tuple(l) for l in d.get('links', [])}
    keep = set()
    for a, b in old:
        ia, ib = ids.index(a), ids.index(b)
        if geoms[ia].distance(geoms[ib]) > 1e-4:
            keep.add((a, b))  # 섬 연결 등 맞닿지 않은 기존 연결
    # 게임 인접 관계 안정성을 위해 기존 연결은 모두 유지하고, 새로 맞닿은 연결만 추가
    d['links'] = sorted([list(l) for l in touching | old])

    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{path}: zones={len(zones)} links {len(old)}→{len(d["links"])} '
          f'(added {len(touching - old)}, removed {len(old - touching - keep)}) '
          f'coverage_valid={bool(shapely.coverage_is_valid(all_geoms))}')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        process(p)
