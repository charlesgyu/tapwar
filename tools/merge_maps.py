"""
지방 맵들을 그대로 합쳐 전국 맵 만들기 (지방 맵의 구역·이름을 그대로 사용)

사용법:
    python tools/merge_maps.py "중국 전국" assets/cn_china_zones.json assets/cn_dongbei_zones.json assets/cn_huabei_zones.json ...
    python tools/build_map.py assets/cn_china_zones.json
"""
import json
import sys


def main():
    title, out, srcs = sys.argv[1], sys.argv[2], sys.argv[3:]
    zones = []
    for i, path in enumerate(srcs):
        d = json.load(open(path, encoding='utf-8'))
        for z in d['zones']:
            z = dict(z)
            z['id'] = f"{i}-{z['id']}"  # 지방마다 id 가 겹치지 않게
            zones.append(z)
    xs = [x for z in zones for r in z['polygons'] for x, _ in r]
    ys = [y for z in zones for r in z['polygons'] for _, y in r]
    m = (max(xs) - min(xs)) * 0.01
    bounds = {'minLng': round(min(xs) - m, 3), 'maxLng': round(max(xs) + m, 3),
              'minLat': round(min(ys) - m, 3), 'maxLat': round(max(ys) + m, 3)}
    out_d = {'meta': {'name': title, 'bounds': bounds, 'level': 'merged',
                      'source': json.load(open(srcs[0], encoding='utf-8'))['meta'].get('source', '')},
             'zones': zones, 'links': []}
    json.dump(out_d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{out}: 지방 {len(srcs)}개 합침 → {len(zones)}개')


if __name__ == '__main__':
    main()
