"""
일본 맵 생성 도구 (시정촌 경계 → 지방별 / 도쿄 / 일본 전국 맵)

데이터: 국토교통성 국토수치정보 행정구역(N03) 가공본 — smartnews-smri/japan-topography (s0010)
  https://github.com/smartnews-smri/japan-topography

맵 종류 (--kind)
  pref   : 도도부현 단위 (일본 전국)
  split  : 도도부현에서 시작해 가장 넓은 구역을 시정촌 경계를 따라 둘로 나누기를 --target 개까지 반복
           (나뉜 곳은 "도치기 북부"처럼 방향 이름)
  subpref: 홋카이도 진흥국 단위
  tokyo  : 도쿄 23구 + 다마 지역(시정촌 경계로 나눔), 섬 제외

공통 처리
  - 맵의 가장 큰 땅덩어리에서 --island-radius(도)보다 먼 섬은 제외 (예: 아마미·오가사와라 등)
  - 북방 4도 시정촌, 독도(竹島) 주변은 항상 제외
  - 오키나와는 --okinawa-shift 로 규슈 남쪽으로 옮겨 붙임 (본섬 주변만)

사용법:
    python tools/make_japan_map.py muni.json split "도호쿠" assets/jp_tohoku_zones.json --prefs 青森県,岩手県,宮城県,秋田県,山形県,福島県 --target 25
    python tools/build_map.py assets/jp_tohoku_zones.json
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_region_map import split_until  # noqa: E402

PREF_KO = {
    '北海道': '홋카이도', '青森県': '아오모리', '岩手県': '이와테', '宮城県': '미야기', '秋田県': '아키타', '山形県': '야마가타',
    '福島県': '후쿠시마', '茨城県': '이바라키', '栃木県': '도치기', '群馬県': '군마', '埼玉県': '사이타마', '千葉県': '지바',
    '東京都': '도쿄', '神奈川県': '가나가와', '新潟県': '니가타', '富山県': '도야마', '石川県': '이시카와', '福井県': '후쿠이',
    '山梨県': '야마나시', '長野県': '나가노', '岐阜県': '기후', '静岡県': '시즈오카', '愛知県': '아이치', '三重県': '미에',
    '滋賀県': '시가', '京都府': '교토', '大阪府': '오사카', '兵庫県': '효고', '奈良県': '나라', '和歌山県': '와카야마',
    '鳥取県': '돗토리', '島根県': '시마네', '岡山県': '오카야마', '広島県': '히로시마', '山口県': '야마구치', '徳島県': '도쿠시마',
    '香川県': '가가와', '愛媛県': '에히메', '高知県': '고치', '福岡県': '후쿠오카', '佐賀県': '사가', '長崎県': '나가사키',
    '熊本県': '구마모토', '大分県': '오이타', '宮崎県': '미야자키', '鹿児島県': '가고시마', '沖縄県': '오키나와'
}
SUBPREF_KO = {
    '宗谷総合振興局': '소야', 'オホーツク総合振興局': '오호츠크', '根室振興局': '네무로', '釧路総合振興局': '구시로',
    '十勝総合振興局': '도카치', '日高振興局': '히다카', '胆振総合振興局': '이부리', '渡島総合振興局': '오시마',
    '檜山振興局': '히야마', '後志総合振興局': '시리베시', '石狩振興局': '이시카리', '空知総合振興局': '소라치',
    '上川総合振興局': '가미카와', '留萌振興局': '루모이'
}
WARD_KO = {
    '千代田区': '지요다구', '中央区': '주오구', '港区': '미나토구', '新宿区': '신주쿠구', '文京区': '분쿄구', '台東区': '다이토구',
    '墨田区': '스미다구', '江東区': '고토구', '品川区': '시나가와구', '目黒区': '메구로구', '大田区': '오타구', '世田谷区': '세타가야구',
    '渋谷区': '시부야구', '中野区': '나카노구', '杉並区': '스기나미구', '豊島区': '도시마구', '北区': '기타구', '荒川区': '아라카와구',
    '板橋区': '이타바시구', '練馬区': '네리마구', '足立区': '아다치구', '葛飾区': '가쓰시카구', '江戸川区': '에도가와구'
}
# 북방 4도(러시아 실효 지배): 해당 군 전체와 네무로시 소속 하보마이 군도는 표시하지 않음
EXCLUDE_COUNTY = {'色丹郡', '国後郡', '択捉郡', '紗那郡', '蘂取郡'}
HABOMAI_MIN_LNG = 145.83  # 네무로시 고리 중 이보다 동쪽(하보마이 군도) 제외
# 독도(竹島) 주변 좌표는 항상 제외
DOKDO = (131.87, 37.24)


def rings_of(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    return [[[round(x, 5), round(y, 5)] for x, y in poly[0]] for poly in polys]


def ring_center(r):
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2


def ring_area(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('muni_geojson')
    ap.add_argument('kind', choices=['pref', 'split', 'subpref', 'tokyo'])
    ap.add_argument('title')
    ap.add_argument('out')
    ap.add_argument('--prefs', default='', help='쉼표로 구분한 도도부현 (비우면 전체)')
    ap.add_argument('--target', type=int, default=25)
    ap.add_argument('--island-radius', type=float, default=1.3, help='본토에서 이 거리(도)보다 먼 섬 제외')
    ap.add_argument('--okinawa-shift', default='', help='오키나와 이동량 "dlng,dlat" (본섬 주변만 남김)')
    ap.add_argument('--margin', type=float, default=0.05)
    a = ap.parse_args()

    src = json.load(open(a.muni_geojson, encoding='utf-8'))
    prefs = [p for p in a.prefs.split(',') if p] or list(PREF_KO)
    feats = [f for f in src['features'] if f['properties']['N03_001'] in prefs and f['geometry']]

    # 시정촌 단위 (코드 기준으로 조각 합침)
    munis = {}
    for f in feats:
        p = f['properties']
        if p.get('N03_003') in EXCLUDE_COUNTY:
            continue
        # 도쿄의 이즈·오가사와라 섬(○○支庁), 소속 미정지는 제외
        if (p.get('N03_003') or '').endswith('支庁') or p.get('N03_004') == '所属未定地':
            continue
        code = p.get('N03_007') or f"{p['N03_001']}{p.get('N03_003')}{p.get('N03_004')}"
        m = munis.setdefault(code, {'id': code, 'pref': p['N03_001'], 'sub': p.get('N03_002') or '',
                                    'county': p.get('N03_003') or '', 'name': p.get('N03_004') or '', 'polygons': []})
        m['polygons'].extend(rings_of(f['geometry']))

    # 하보마이 군도 제거
    for m in munis.values():
        if m['name'] == '根室市':
            m['polygons'] = [r for r in m['polygons'] if ring_center(r)[0] < HABOMAI_MIN_LNG]

    # 독도 주변 제거
    for m in munis.values():
        m['polygons'] = [r for r in m['polygons'] if math.hypot(ring_center(r)[0] - DOKDO[0], ring_center(r)[1] - DOKDO[1]) > 0.3]

    # 오키나와: 본섬 주변만 남기고 이동
    if a.okinawa_shift:
        dx, dy = map(float, a.okinawa_shift.split(','))
        for m in munis.values():
            if m['pref'] != '沖縄県':
                continue
            keep = [r for r in m['polygons'] if 127.6 <= ring_center(r)[0] <= 128.4 and 26.0 <= ring_center(r)[1] <= 26.95]
            m['polygons'] = [[[round(x + dx, 5), round(y + dy, 5)] for x, y in r] for r in keep]

    # 먼 섬 제외: 시정촌 경계를 합쳐 땅덩어리(섬)로 나눈 뒤, 큰 땅덩어리(가장 큰 것의 5% 이상)에서
    # island-radius(도)보다 먼 섬은 버림. 옮긴 오키나와는 따로 둠
    from shapely.geometry import Polygon, Point
    from shapely.ops import unary_union
    from shapely.strtree import STRtree
    polys = [Polygon(r).buffer(0) for m in munis.values() if m['pref'] != '沖縄県' for r in m['polygons'] if len(r) >= 4]
    land = unary_union([p.buffer(0.003) for p in polys])
    comps = list(land.geoms) if land.geom_type == 'MultiPolygon' else [land]
    biggest = max(c.area for c in comps)
    anchors = [c for c in comps if c.area >= biggest * 0.05]
    keep = [c for c in comps if min(c.distance(a_) for a_ in anchors) <= a.island_radius]
    keep_union = unary_union(keep)
    for m in munis.values():
        if m['pref'] == '沖縄県' and a.okinawa_shift:
            continue
        m['polygons'] = [r for r in m['polygons'] if len(r) >= 4 and keep_union.intersects(Polygon(r).buffer(0).representative_point())]
    munis = {k: m for k, m in munis.items() if m['polygons']}

    # 구역 묶기
    groups = {}
    def add(key, name, zid, m):
        g = groups.setdefault(key, {'id': zid, 'name': name, 'polygons': [], 'dongs': []})
        g['polygons'].extend(m['polygons'])
        g['dongs'].append({'id': m['id'], 'name': m['name'], 'polygons': m['polygons']})

    for m in munis.values():
        if a.kind in ('pref', 'split'):
            add(m['pref'], PREF_KO[m['pref']], m['pref'], m)
        elif a.kind == 'subpref':
            add(m['sub'], SUBPREF_KO.get(m['sub'], m['sub']), m['sub'], m)
        elif a.kind == 'tokyo':
            if m['name'] in WARD_KO and not m['county']:
                add(m['name'], WARD_KO[m['name']], m['id'], m)
            else:
                add('多摩', '다마', 'tama', m)

    if a.kind in ('split', 'tokyo') and len(groups) < a.target:
        groups = split_until(groups, a.target)

    zones = []
    for g in groups.values():
        xs = [x for r in g['polygons'] for x, _ in r]
        ys = [y for r in g['polygons'] for _, y in r]
        zones.append({'id': str(g['id']), 'name': g['name'], 'lng': (min(xs) + max(xs)) / 2,
                      'lat': (min(ys) + max(ys)) / 2, 'maxOrbs': 50, 'polygons': g['polygons']})
    xs = [x for z in zones for r in z['polygons'] for x, _ in r]
    ys = [y for z in zones for r in z['polygons'] for _, y in r]
    bounds = {'minLng': round(min(xs) - a.margin, 4), 'maxLng': round(max(xs) + a.margin, 4),
              'minLat': round(min(ys) - a.margin, 4), 'maxLat': round(max(ys) + a.margin, 4)}
    out = {'meta': {'name': a.title, 'bounds': bounds, 'level': a.kind,
                    'source': '国土数値情報 行政区域データ(N03) / smartnews-smri/japan-topography'},
           'zones': zones, 'links': []}
    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{a.out}: {a.kind} {len(zones)}개 bounds={bounds}')


if __name__ == '__main__':
    main()
