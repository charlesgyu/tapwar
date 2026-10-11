#!/bin/bash
# 미국 맵 10개: bash tools/build_us_maps.sh <counties.json> <ne_10m_admin_1.geojson> [python]
set -e
C=$1; A1=$2; PY=${3:-python3}
mk() { $PY tools/make_ne_map.py us "$C" "$A1" "$@"; }
mk "뉴잉글랜드" assets/us_newengland_zones.json --units 09,23,25,33,44,50 --target 16 --simplify 0.005
mk "중부 대서양" assets/us_midatlantic_zones.json --units 34,36,42 --target 18 --simplify 0.005
mk "오대호" assets/us_greatlakes_zones.json --units 17,18,26,39,55 --target 22
mk "중서부 평원" assets/us_plains_zones.json --units 19,20,27,29,31,38,46 --target 24
mk "남동부 해안" assets/us_southatlantic_zones.json --units 10,12,13,24,37,45,51,54 --target 25
mk "남부 내륙" assets/us_southcentral_zones.json --units 01,21,28,47 --target 20
mk "남서부" assets/us_southwest_zones.json --units 05,22,40,48 --target 24
mk "로키 산맥" assets/us_mountain_zones.json --units 04,08,16,30,32,35,49,56 --target 25
mk "태평양 연안" assets/us_pacific_zones.json --units 06,41,53 --target 20
$PY tools/merge_maps.py "미국 본토" assets/us_usa_zones.json assets/us_{newengland,midatlantic,greatlakes,plains,southatlantic,southcentral,southwest,mountain,pacific}_zones.json
for f in newengland midatlantic greatlakes plains southatlantic southcentral southwest mountain pacific usa; do $PY tools/build_map.py assets/us_${f}_zones.json; done
