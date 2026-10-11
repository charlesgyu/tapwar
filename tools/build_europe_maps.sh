#!/bin/bash
# 대륙 카드의 '유럽' 맵(나라 단위): bash tools/build_europe_maps.sh <ne_10m_admin_1.geojson> <ne_50m_admin_0.geojson> [python]
set -e
A1=$1; A0=$2; PY=${3:-python3}
mk() { $PY tools/make_ne_map.py europe "$A1" "$A0" "$@"; }
mk "유럽 전체" assets/eu_europe_zones.json --units GBR,IRL,FRA,BEL,NLD,LUX,CHE,DEU,AUT,ITA,ESP,PRT,GRC,POL,CZE,SVK,HUN,SVN,HRV,BIH,SRB,MNE,MKD,ALB,KOS,ROU,BGR,MDA,UKR,BLR,LTU,LVA,EST,FIN,SWE,NOR,DNK,ISL --max-lat 71.5 --min-lat 34.5 --island-radius 4 --simplify 0.03
for f in europe; do $PY tools/build_map.py assets/eu_${f}_zones.json; done
