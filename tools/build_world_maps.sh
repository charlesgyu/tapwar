#!/bin/bash
# 대륙 맵: bash tools/build_world_maps.sh <ne_50m_admin_0.geojson> [python] [ne_10m_admin_1.geojson]  (유럽은 build_europe_maps.sh 의 '유럽 전체')
set -e
A0=$1; PY=${2:-python3}; A1=${3:-ne_10m_admin_1_states_provinces.geojson}
mk() { $PY tools/make_ne_map.py world "$A0" "$A1" "$@"; }
mk "아메리카" assets/w_america_zones.json --continent "North America|South America" --island-radius 4 --min-area 0.5 --max-lat 72 --simplify 0.08
mk "아프리카" assets/w_africa_zones.json --continent Africa --exclude LSO --island-radius 3 --min-area 0.3 --simplify 0.05
mk "아시아" assets/w_asia_zones.json --continent "Asia" --extra RUS --island-radius 6 --min-area 0.5 --max-lat 72 --simplify 0.1
mk "전세계" assets/w_world_zones.json --exclude LSO --island-radius 8 --min-area 1.5 --max-lat 72 --simplify 0.15
# 오세아니아: 나라가 적어 1급 행정구역(주)으로 나눔
$PY tools/make_ne_map.py europe "$A1" "$A0" "오세아니아" assets/w_oceania_zones.json --units AUS,NZL,PNG,SLB,VUT,FJI,NCL --target 22 --island-radius 20 --simplify 0.05 --min-lat -48
for f in america africa asia oceania world; do $PY tools/build_map.py assets/w_${f}_zones.json; done
