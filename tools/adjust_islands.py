"""
먼 섬 정리 도구: 지도 범위를 크게 넓혀 본토를 작게 만드는 먼 섬을
  - drop: 일정 경도/위도 바깥 조각 제거 (예: 인천 서해5도)
  - shift: 본토 가까이 옮겨 배치 (예: 경북 울릉도·독도, 지도 관례상 인셋 배치)
처리 후 meta.bounds 재계산. 그 다음 build_map.py → add_water.py --carve 실행.

사용법:
  python tools/adjust_islands.py assets/incheon_zones.json drop 옹진군 --min-lng 126.0
  python tools/adjust_islands.py assets/gyeongbuk_zones.json shift 울릉군 --dlng -1.0 --dlat -0.1
"""
import argparse
import json

ap = argparse.ArgumentParser()
ap.add_argument('path')
ap.add_argument('mode', choices=['drop', 'shift'])
ap.add_argument('zone')
ap.add_argument('--min-lng', type=float, default=-999)
ap.add_argument('--dlng', type=float, default=0)
ap.add_argument('--dlat', type=float, default=0)
ap.add_argument('--margin', type=float, default=0.03)
a = ap.parse_args()

d = json.load(open(a.path, encoding='utf-8'))
z = next(z for z in d['zones'] if z['name'] == a.zone)
if a.mode == 'drop':
    before = len(z['polygons'])
    z['polygons'] = [r for r in z['polygons'] if min(x for x, _ in r) >= a.min_lng]
    print(f'{a.zone}: 조각 {before} → {len(z["polygons"])}')
else:
    z['polygons'] = [[[round(x + a.dlng, 6), round(y + a.dlat, 6)] for x, y in r] for r in z['polygons']]
    z['lng'] += a.dlng
    z['lat'] += a.dlat
    d.setdefault('meta', {}).setdefault('notes', []).append(f'{a.zone}: 실제 위치에서 경도 {a.dlng:+}°, 위도 {a.dlat:+}° 옮겨 배치(인셋)')
    print(f'{a.zone}: 이동 완료')

xs = [x for zz in d['zones'] for r in zz['polygons'] for x, _ in r]
ys = [y for zz in d['zones'] for r in zz['polygons'] for _, y in r]
d['meta']['bounds'] = {'minLng': round(min(xs) - a.margin, 4), 'maxLng': round(max(xs) + a.margin, 4),
                       'minLat': round(min(ys) - a.margin, 4), 'maxLat': round(max(ys) + a.margin, 4)}
json.dump(d, open(a.path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('bounds', d['meta']['bounds'])
