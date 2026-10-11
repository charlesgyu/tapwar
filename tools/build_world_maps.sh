#!/bin/bash
# 대륙 맵: bash tools/build_world_maps.sh <ne_10m_admin_1.geojson> <ne_50m_admin_0.geojson> <aus_adm2.geojson> <png_adm2.geojson> [python]
# 각 대륙 250개, 전세계 500개: 1급 행정구역을 작은 것부터 같은 나라 이웃과 합침
# 호주·파푸아뉴기니는 1급 행정구역이 너무 커서 geoBoundaries ADM2(CC BY 4.0 / CC BY 3.0 IGO)로 나눔
set -e
A1=$1; A0=$2; AUS=$3; PNG=$4; PY=${5:-python3}
X=TWN,HKG,MAC,LSO
mk() { $PY tools/make_ne_map.py admin1 "$A1" "$A0" "$@"; }
mk "아메리카" assets/w_america_zones.json --continent "North America|South America" --exclude $X --target 250 --island-radius 4 --max-lat 72 --simplify 0.04
mk "아프리카" assets/w_africa_zones.json --continent Africa --exclude $X --target 250 --island-radius 3 --simplify 0.03
mk "아시아" assets/w_asia_zones.json --continent Asia --extra RUS --exclude $X --target 250 --island-radius 6 --max-lat 72 --simplify 0.05
mk "유럽" assets/w_europe_zones.json --units GBR,IRL,FRA,BEL,NLD,LUX,CHE,DEU,AUT,ITA,ESP,PRT,GRC,POL,CZE,SVK,HUN,SVN,HRV,BIH,SRB,MNE,MKD,ALB,KOS,ROU,BGR,MDA,UKR,BLR,LTU,LVA,EST,FIN,SWE,NOR,DNK,ISL --target 250 --max-lat 71.5 --min-lat 34.5 --island-radius 4 --simplify 0.02
mk "오세아니아" assets/w_oceania_zones.json --units AUS,NZL,PNG,SLB,VUT,FJI,NCL --fine AUS=$AUS,PNG=$PNG --target 250 --island-radius 20 --min-lat -48 --simplify 0.03
mk "전세계" assets/w_world_zones.json --exclude $X --target 500 --island-radius 8 --max-lat 72 --simplify 0.06
$PY tools/dissolve_zones.py assets/w_world_zones.json  # 전세계: 구역 안 조각을 녹여 꼭짓점 줄임
for f in america africa asia europe oceania world; do $PY tools/build_map.py assets/w_${f}_zones.json; done
