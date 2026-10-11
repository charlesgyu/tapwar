#!/bin/bash
# 전세계 맵 7개: bash tools/build_world_maps.sh <ne_50m_admin_0.geojson> [python]
set -e
A0=$1; PY=${2:-python3}
mk() { $PY tools/make_ne_map.py world "$A0" - "$@"; }
mk "아메리카" assets/w_america_zones.json --continent "North America|South America" --island-radius 4 --min-area 0.5 --max-lat 72 --simplify 0.08
mk "아프리카" assets/w_africa_zones.json --continent Africa --exclude LSO --island-radius 3 --min-area 0.3 --simplify 0.05
mk "아시아·오세아니아" assets/w_asia_zones.json --continent "Asia|Oceania" --extra RUS --island-radius 6 --min-area 0.5 --max-lat 72 --simplify 0.1
mk "전세계" assets/w_world_zones.json --exclude LSO --island-radius 8 --min-area 1.5 --max-lat 72 --simplify 0.15
for f in america africa asia world; do $PY tools/build_map.py assets/w_${f}_zones.json; done
