#!/bin/bash
# 전세계 맵: bash tools/build_world_maps.sh <ne_10m_admin_1.geojson> <ne_50m_admin_0.geojson> [python]
# 300개: 1급 행정구역을 작은 것부터 같은 나라 이웃과 합친 뒤, 구역 안 조각을 녹여 꼭짓점 줄임
set -e
A1=$1; A0=$2; PY=${3:-python3}
$PY tools/make_ne_map.py admin1 "$A1" "$A0" "전세계" assets/w_world_zones.json --exclude TWN,HKG,MAC,LSO --target 300 --island-radius 8 --max-lat 72 --simplify 0.06
$PY tools/dissolve_zones.py assets/w_world_zones.json
$PY tools/build_map.py assets/w_world_zones.json
