"""
시·도 맵 생성 도구 (행정동 경계에서 시·군·구 또는 행정동 단위 맵 생성)

구역 단위 원칙: 기본은 시·군·구. 시·군·구가 너무 적어(8곳 미만) 게임이 성립하지 않으면 행정동.
일반구가 있는 시(예: 청주시 상당구·서원구…)는 시 하나로 합친다.

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hjd_geojson')
    ap.add_argument('sido', help='시·도 이름 (예: "부산광역시")')
    ap.add_argument('title')
    ap.add_argument('out')
    ap.add_argument('--level', default='auto', choices=['auto', 'sgg', 'dong'])
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
        if level == 'dong':
            key, name, zid = p['adm_cd2'], p['adm_nm'].split()[-1], p['adm_cd2']
        else:
            name = city_of(p['sggnm'])
            key, zid = name, p['sgg']
        g = groups.setdefault(key, {'id': zid, 'name': name, 'polygons': []})
        g['polygons'].extend(rings_of(f['geometry']))  # 같은 시·군·구의 동들은 build_map.py에서 하나로 병합

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
