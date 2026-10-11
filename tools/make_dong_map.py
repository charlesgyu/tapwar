"""
행정동 단위 맵 생성 도구

행정구가 너무 적어 게임이 성립하지 않는 시(예: 수원시 = 4개 구)는 행정동 단위로 맵을 만든다.
생성 후 tools/build_map.py 를 반드시 실행해 경계 정합·이름 중앙 배치·인접 관계를 처리한다.

데이터 출처: 통계청 SGIS 행정동 경계(공공누리 제1유형) 가공본
            vuski/admdongkor (CC BY 4.0) https://github.com/vuski/admdongkor
            → 앱/게임 화면에 출처 표시 필요

사용법:
    curl -L -o HangJeongDong.geojson \
      https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson
    python tools/make_dong_map.py HangJeongDong.geojson "경기도 수원시" "수원시 44개 행정동 전선" assets/suwon_exact_zones.json \
        --backdrop-from assets/south_korea_exact_zones.json
    python tools/build_map.py assets/suwon_exact_zones.json
"""
import argparse
import json


def outer_rings(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    return [[[round(x, 6), round(y, 6)] for x, y in poly[0]] for poly in polys]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hjd_geojson')
    ap.add_argument('prefix', help='행정동 전체 이름 접두사, 예: "경기도 수원시"')
    ap.add_argument('title')
    ap.add_argument('out')
    ap.add_argument('--backdrop-from', help='주변 시·군을 배경으로 넣을 기존 맵 JSON (예: 전국 맵)')
    ap.add_argument('--margin', type=float, default=0.03, help='지도 범위 여백(도)')
    a = ap.parse_args()

    src = json.load(open(a.hjd_geojson, encoding='utf-8'))
    feats = [f for f in src['features'] if f['properties']['adm_nm'].startswith(a.prefix)]
    if not feats:
        raise SystemExit(f'"{a.prefix}" 로 시작하는 행정동이 없습니다.')

    zones = []
    for f in feats:
        p = f['properties']
        rings = outer_rings(f['geometry'])
        xs = [x for r in rings for x, _ in r]
        ys = [y for r in rings for _, y in r]
        zones.append({
            'id': p['adm_cd2'],
            'name': p['adm_nm'].split()[-1],
            'gu': p.get('sggnm', ''),
            'lng': (min(xs) + max(xs)) / 2,   # build_map.py 가 구역 중앙으로 다시 계산
            'lat': (min(ys) + max(ys)) / 2,
            'maxOrbs': 50,
            'polygons': rings,
        })

    xs = [x for z in zones for r in z['polygons'] for x, _ in r]
    ys = [y for z in zones for r in z['polygons'] for _, y in r]
    bounds = {
        'minLng': round(min(xs) - a.margin, 4), 'maxLng': round(max(xs) + a.margin, 4),
        'minLat': round(min(ys) - a.margin, 4), 'maxLat': round(max(ys) + a.margin, 4),
    }
    out = {
        'meta': {
            'name': a.title,
            'bounds': bounds,
            'source': '통계청 SGIS 행정동 경계(공공누리 제1유형) / vuski/admdongkor (CC BY 4.0)',
        },
        'zones': zones,
        'links': [],  # build_map.py 가 실제 맞닿은 경계로 계산
    }

    if a.backdrop_from:
        # 지도 범위에 걸치는 주변 시·군을 플레이 불가 배경으로 추가 (같은 시는 제외)
        city = a.prefix.split()[-1].replace('시', '').replace('군', '')
        other = json.load(open(a.backdrop_from, encoding='utf-8'))
        bd = []
        for z in other['zones']:
            if z['name'] == city:
                continue
            zx = [x for r in z['polygons'] for x, _ in r]
            zy = [y for r in z['polygons'] for _, y in r]
            if max(zx) < bounds['minLng'] or min(zx) > bounds['maxLng'] or max(zy) < bounds['minLat'] or min(zy) > bounds['maxLat']:
                continue
            bd.append({'name': z['name'], 'lng': z['lng'], 'lat': z['lat'], 'polygons': z['polygons']})
        out['backdrop'] = bd

    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{a.out}: 행정동 {len(zones)}개, 배경 {len(out.get("backdrop", []))}개, bounds={bounds}')


if __name__ == '__main__':
    main()
