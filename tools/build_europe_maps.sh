#!/bin/bash
# 유럽 맵 8개: bash tools/build_europe_maps.sh <ne_10m_admin_1.geojson> <ne_50m_admin_0.geojson> [python]
set -e
A1=$1; A0=$2; PY=${3:-python3}
mk() { $PY tools/make_ne_map.py europe "$A1" "$A0" "$@"; }
mk "영국·아일랜드" assets/eu_britain_zones.json --units GBR,IRL --target 18 --max-lat 61
mk "발칸" assets/eu_balkan_zones.json --units HRV,BIH,SRB,MNE,MKD,ALB,KOS,SVN --target 20
mk "중부 유럽" assets/eu_central_zones.json --units POL,CZE,SVK,HUN,AUT --target 22
mk "동유럽" assets/eu_east_zones.json --units UKR,BLR,MDA,ROU,BGR --target 24
mk "북유럽" assets/eu_north_zones.json --units NOR,SWE,FIN,DNK,EST,LVA,LTU --target 24 --max-lat 71.5 --island-radius 2
mk "서유럽" assets/eu_west_zones.json --units FRA,BEL,NLD,LUX,CHE,DEU --target 25 --island-radius 2
mk "남유럽" assets/eu_south_zones.json --units ESP,PRT,ITA,GRC,MLT --target 25 --island-radius 2.5 --min-lat 34.5
mk "유럽 전체" assets/eu_europe_zones.json --units GBR,IRL,FRA,BEL,NLD,LUX,CHE,DEU,AUT,ITA,ESP,PRT,GRC,POL,CZE,SVK,HUN,SVN,HRV,BIH,SRB,MNE,MKD,ALB,KOS,ROU,BGR,MDA,UKR,BLR,LTU,LVA,EST,FIN,SWE,NOR,DNK,ISL --max-lat 71.5 --min-lat 34.5 --island-radius 4 --simplify 0.03
for f in britain balkan central east north west south europe; do $PY tools/build_map.py assets/eu_${f}_zones.json; done
