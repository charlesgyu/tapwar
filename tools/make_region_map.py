"""
시·도 맵 생성 도구 (행정동 경계에서 시·군·구 또는 행정동 단위 맵 생성)

구역 단위 원칙 (--level)
  metro : 광역시. 구는 구 단위, 구가 없는 군은 읍·면·동 단위 (부산·대구·인천·울산)
  split : 도. 시·군에서 시작해 가장 넓은 시·군을 읍·면·동 경계를 따라 둘로 나누기를
          목표 개수(--target, 기본 25)가 될 때까지 반복. 나뉜 구역은 "익산시 북부"처럼 방향으로 이름 붙임
  dong  : 행정동 단위 (대전·세종·제주처럼 구·시가 너무 적은 곳)
  sgg   : 시·군·구 단위 (일반구는 시로 합침)

데이터: 통계청 SGIS 행정동 경계(공공누리 제1유형) / vuski/admdongkor (CC BY 4.0)

사용법:
    python tools/make_region_map.py HangJeongDong.geojson "부산광역시" "부산광역시 전선" assets/busan_zones.json [--level auto|sgg|dong]
    python tools/add_water.py assets/busan_zones.json
    python tools/build_map.py assets/busan_zones.json
    python tools/add_water.py --carve assets/busan_zones.json
"""
import argparse
import json
import re

MIN_SGG = 8  # 시·군·구가 이보다 적으면 행정동 단위


def rings_of(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    return [[[round(x, 6), round(y, 6)] for x, y in poly[0]] for poly in polys]


def city_of(sggnm):
    # '수원시장안구' → '수원시' (일반구를 시로 합침)
    m = re.match(r'^(.+?시)(.+구)$', sggnm)
    return m.group(1) if m else sggnm


DIRS = {(0, 1): '북부', (0, -1): '남부', (1, 0): '동부', (-1, 0): '서부'}


def split_until(groups, target):
    """가장 넓은 구역을 읍·면·동 경계를 따라 둘로 나누기를 target 개가 될 때까지 반복"""
    import math
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    def geom(dongs):
        return unary_union([Polygon(r).buffer(0) for dn in dongs for r in dn['polygons']])

    zones = []
    for g in groups.values():
        zones.append({'id': g['id'], 'name': g['name'], 'base': g['name'], 'dongs': g['dongs']})
    for z in zones:
        z['geom'] = geom(z['dongs'])

    def area(g):
        c = math.cos(math.radians(g.centroid.y))
        return g.area * c

    while len(zones) < target:
        cands = [z for z in zones if len(z['dongs']) >= 2]
        if not cands:
            break
        z = max(cands, key=lambda z: area(z['geom']))
        dg = [(dn, Polygon([p for r in dn['polygons'][:1] for p in r]).buffer(0)) for dn in z['dongs']]
        dg = [(dn, geom([dn])) for dn, _ in dg]
        minx, miny, maxx, maxy = z['geom'].bounds
        kx = math.cos(math.radians((miny + maxy) / 2))
        vertical = (maxy - miny) >= (maxx - minx) * kx  # 세로로 길면 남북으로 나눔
        keyf = (lambda t: t[1].centroid.y) if vertical else (lambda t: t[1].centroid.x)
        dg.sort(key=keyf)
        total = sum(area(g) for _, g in dg)
        acc, cut = 0.0, 1
        for i, (_, g) in enumerate(dg):
            acc += area(g)
            if acc >= total / 2:
                cut = max(1, min(len(dg) - 1, i + 1 if acc - area(g) < total / 2 - (acc - total / 2) else i))
                break
        low, high = [d for d, _ in dg[:cut]], [d for d, _ in dg[cut:]]
        d_low, d_high = ((0, -1), (0, 1)) if vertical else ((-1, 0), (1, 0))
        zones.remove(z)
        for k, part in enumerate((low, high)):
            zones.append({'id': f"{z['id']}-{len(zones)}-{k}", 'base': z['base'], 'baseGeom': z.get('baseGeom', z['geom']),
                          'dongs': part, 'geom': geom(part)})

    # 이름: 나뉜 시·군은 원래 시·군 중심에서 본 방향(8방위)으로 "익산시 북부"처럼, 겹치면 번호
    labels = ['동부', '북동부', '북부', '북서부', '서부', '남서부', '남부', '남동부']
    by_base = {}
    for z in zones:
        by_base.setdefault(z['base'], []).append(z)
    for base, parts in by_base.items():
        if len(parts) == 1:
            parts[0]['name'] = base
            continue
        c0 = parts[0]['baseGeom'].centroid
        kx = math.cos(math.radians(c0.y))
        for z in parts:
            c = z['geom'].representative_point()
            dx, dy = (c.x - c0.x) * kx, c.y - c0.y
            ang = math.degrees(math.atan2(dy, dx)) % 360
            z['name'] = f"{base} {labels[int(((ang + 22.5) % 360) // 45)]}"
        seen = {}
        for z in parts:
            seen.setdefault(z['name'], []).append(z)
        for name, same in seen.items():
            if len(same) > 1:
                same.sort(key=lambda z: (-z['geom'].centroid.y, z['geom'].centroid.x))
                for n, z in enumerate(same, 1):
                    z['name'] = f'{name}{n}'

    out = {}
    for z in zones:
        out[z['id']] = {'id': z['id'], 'name': z['name'], 'dongs': z['dongs'],
                        'polygons': [r for dn in z['dongs'] for r in dn['polygons']]}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hjd_geojson')
    ap.add_argument('sido', help='시·도 이름 (예: "부산광역시")')
    ap.add_argument('title')
    ap.add_argument('out')
    ap.add_argument('--level', default='auto', choices=['auto', 'sgg', 'dong', 'metro', 'split'])
    ap.add_argument('--target', type=int, default=25, help='split 단계의 목표 구역 수')
    ap.add_argument('--margin', type=float, default=0.03)
    a = ap.parse_args()

    src = json.load(open(a.hjd_geojson, encoding='utf-8'))
    feats = [f for f in src['features'] if f['properties']['sidonm'] == a.sido]
    if not feats:
        raise SystemExit(f'"{a.sido}" 행정동이 없습니다.')

    cities = sorted({city_of(f['properties']['sggnm']) for f in feats})
    level = a.level
    if level == 'auto':
        level = 'dong' if len(cities) < MIN_SGG else 'sgg'

    groups = {}
    for f in feats:
        p = f['properties']
        dong_name = p['adm_nm'].split()[-1]
        if level == 'dong' or (level == 'metro' and not p['sggnm'].endswith('구')):
            key, name, zid = p['adm_cd2'], dong_name, p['adm_cd2']
        elif level == 'metro':
            key, name, zid = p['sggnm'], p['sggnm'], p['sgg']
        else:  # sgg, split
            name = city_of(p['sggnm'])
            key, zid = name, p['sgg']
        g = groups.setdefault(key, {'id': zid, 'name': name, 'polygons': [], 'dongs': []})
        g['polygons'].extend(rings_of(f['geometry']))  # 같은 구역의 동들은 build_map.py에서 하나로 병합
        g['dongs'].append({'id': p['adm_cd2'], 'name': dong_name, 'polygons': rings_of(f['geometry'])})

    if level == 'split':
        groups = split_until(groups, a.target)

    zones = []
    for g in groups.values():
        xs = [x for r in g['polygons'] for x, _ in r]
        ys = [y for r in g['polygons'] for _, y in r]
        zones.append({'id': g['id'], 'name': g['name'], 'lng': (min(xs) + max(xs)) / 2,
                      'lat': (min(ys) + max(ys)) / 2, 'maxOrbs': 50, 'polygons': g['polygons']})

    xs = [x for z in zones for r in z['polygons'] for x, _ in r]
    ys = [y for z in zones for r in z['polygons'] for _, y in r]
    bounds = {'minLng': round(min(xs) - a.margin, 4), 'maxLng': round(max(xs) + a.margin, 4),
              'minLat': round(min(ys) - a.margin, 4), 'maxLat': round(max(ys) + a.margin, 4)}
    out = {'meta': {'name': a.title, 'bounds': bounds, 'level': level,
                    'source': '통계청 SGIS 행정동 경계(공공누리 제1유형) / vuski/admdongkor (CC BY 4.0)'},
           'zones': zones, 'links': []}
    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{a.out}: {a.sido} {level} {len(zones)}개 bounds={bounds}')


if __name__ == '__main__':
    main()
