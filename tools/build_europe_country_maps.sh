#!/bin/bash
# 유럽 나라별 맵: bash tools/build_europe_country_maps.sh <ne_10m_admin_1.geojson> [python]
set -e
A1=$1; PY=${2:-python3}
mk() { $PY tools/make_ne_map.py country "$A1" - "$@"; }
mk "독일" assets/eu_c_deu_zones.json --units DEU --simplify 0.005
mk "폴란드" assets/eu_c_pol_zones.json --units POL --simplify 0.005
mk "포르투갈" assets/eu_c_prt_zones.json --units PRT --min-lat 36.5 --island-radius 1 --simplify 0.005
mk "스웨덴" assets/eu_c_swe_zones.json --units SWE --simplify 0.01
mk "노르웨이" assets/eu_c_nor_zones.json --units NOR --max-lat 71.5 --simplify 0.01
mk "우크라이나" assets/eu_c_ukr_zones.json --units UKR --simplify 0.01
mk "헝가리" assets/eu_c_hun_zones.json --units HUN --target 20 --simplify 0.005
mk "루마니아" assets/eu_c_rou_zones.json --units ROU --target 24 --simplify 0.005
mk "스페인" assets/eu_c_esp_zones.json --units ESP --by-region --min-lat 35.5 --island-radius 1.5 --simplify 0.005
mk "이탈리아" assets/eu_c_ita_zones.json --units ITA --by-region --island-radius 1.5 --simplify 0.005
mk "프랑스" assets/eu_c_fra_zones.json --units FRA --by-region --island-radius 2.2 --simplify 0.005
mk "영국" assets/eu_c_gbr_zones.json --units GBR --by-region --max-lat 61 --simplify 0.005
for f in deu pol prt swe nor ukr hun rou esp ita fra gbr; do $PY tools/build_map.py assets/eu_c_${f}_zones.json; done
