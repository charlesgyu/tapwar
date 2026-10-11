#!/bin/bash
# 프랑스·독일·이탈리아·스페인·영국: 지방 맵 + 전국(지방 합침)
# bash tools/build_europe_nation_maps.sh <ne_10m_admin_1.geojson> <deu_adm3.geojson(geoBoundaries DEU ADM3)> [python]
set -e
A1=$1; DE=$2; PY=${3:-python3}
mk() { $PY tools/make_ne_map.py regions "$A1" "$@"; }
# 프랑스 (레지옹 → 데파르트망으로 나눔)
mk - "프랑스 북부" assets/fr_north_zones.json --units FRA --groups "Hauts-de-France|Normandie|Île-de-France|Grand Est" --target 20 --simplify 0.005
mk - "프랑스 서부" assets/fr_west_zones.json --units FRA --groups "Bretagne|Pays de la Loire|Centre-Val de Loire|Nouvelle-Aquitaine" --target 20 --simplify 0.005
mk - "프랑스 남부" assets/fr_south_zones.json --units FRA --groups "Occitanie|Provence-Alpes-Côte-d'Azur|Corse" --target 18 --island-radius 2.2 --simplify 0.005
mk - "프랑스 동부" assets/fr_east_zones.json --units FRA --groups "Auvergne-Rhône-Alpes|Bourgogne-Franche-Comté" --target 18 --simplify 0.005
# 독일 (주 → 크라이스로 나눔)
mk "$DE" "독일 북부" assets/de_north_zones.json --units DEU --group-field name --groups "Schleswig-Holstein|Hamburg|Niedersachsen|Bremen|Mecklenburg-Vorpommern" --target 20 --simplify 0.003
mk "$DE" "독일 동부" assets/de_east_zones.json --units DEU --group-field name --groups "Berlin|Brandenburg|Sachsen|Sachsen-Anhalt|Thüringen" --target 20 --simplify 0.003
mk "$DE" "독일 서부" assets/de_west_zones.json --units DEU --group-field name --groups "Nordrhein-Westfalen|Hessen|Rheinland-Pfalz|Saarland" --target 20 --simplify 0.003
mk "$DE" "독일 남부" assets/de_south_zones.json --units DEU --group-field name --groups "Bayern|Baden-Württemberg" --target 20 --simplify 0.003
# 이탈리아 (주 → 도로 나눔)
mk - "이탈리아 북서부" assets/it_northwest_zones.json --units ITA --groups "Valle d'Aosta|Piemonte|Lombardia|Liguria" --target 18 --simplify 0.005
mk - "이탈리아 북동부" assets/it_northeast_zones.json --units ITA --groups "Trentino-Alto Adige|Veneto|Friuli-Venezia Giulia|Emilia-Romagna" --target 18 --simplify 0.005
mk - "이탈리아 중부" assets/it_center_zones.json --units ITA --groups "Toscana|Umbria|Marche|Lazio" --target 18 --simplify 0.005
mk - "이탈리아 남부" assets/it_south_zones.json --units ITA --groups "Abruzzo|Molise|Campania|Apulia|Basilicata|Calabria" --target 20 --simplify 0.005
mk - "이탈리아 섬" assets/it_islands_zones.json --units ITA --groups "Sicily|Sardegna" --target 14 --island-radius 3 --simplify 0.005
# 스페인 (자치지방 → 주로 나눔)
mk - "스페인 북부" assets/es_north_zones.json --units ESP --groups "Galicia|Asturias|Cantabria|País Vasco|Foral de Navarra|La Rioja|Aragón" --target 18 --simplify 0.005
mk - "스페인 동부" assets/es_east_zones.json --units ESP --groups "Cataluña|Valenciana|Murcia|Islas Baleares" --target 14 --island-radius 2.5 --simplify 0.005
mk - "스페인 중부" assets/es_center_zones.json --units ESP --groups "Castilla y León|Madrid|Castilla-La Mancha" --target 18 --simplify 0.005
mk - "스페인 남부" assets/es_south_zones.json --units ESP --groups "Andalucía|Extremadura" --target 12 --simplify 0.005
# 영국 (지방 → 카운티·카운슬로 나눔)
mk - "잉글랜드 남부" assets/gb_south_zones.json --units GBR --groups "South East|South West|Greater London|East" --target 20 --simplify 0.003
mk - "잉글랜드 중북부" assets/gb_middle_zones.json --units GBR --groups "West Midlands|East Midlands|North West|North East|Yorkshire and the Humber" --target 20 --simplify 0.003
mk - "스코틀랜드" assets/gb_scotland_zones.json --units GBR --groups "Highlands and Islands|North Eastern|Eastern|South Western" --target 16 --max-lat 61 --simplify 0.003
mk - "웨일스·북아일랜드" assets/gb_walesni_zones.json --units GBR --groups "West Wales and the Valleys|East Wales|Northern Ireland" --target 14 --island-radius 1.5 --simplify 0.003
for f in fr_north fr_west fr_south fr_east de_north de_east de_west de_south it_northwest it_northeast it_center it_south it_islands es_north es_east es_center es_south gb_south gb_middle gb_scotland gb_walesni; do $PY tools/build_map.py assets/${f}_zones.json; done
# 전국 = 지방 맵 합침
$PY tools/merge_maps.py "프랑스 전국" assets/fr_france_zones.json assets/fr_{north,west,south,east}_zones.json
$PY tools/merge_maps.py "독일 전국" assets/de_germany_zones.json assets/de_{north,east,west,south}_zones.json
$PY tools/merge_maps.py "이탈리아 전국" assets/it_italy_zones.json assets/it_{northwest,northeast,center,south,islands}_zones.json
$PY tools/merge_maps.py "스페인 전국" assets/es_spain_zones.json assets/es_{north,east,center,south}_zones.json
$PY tools/merge_maps.py "영국 전국" assets/gb_uk_zones.json assets/gb_{south,middle,scotland,walesni}_zones.json
for f in fr_france de_germany it_italy es_spain gb_uk; do $PY tools/build_map.py assets/${f}_zones.json; done
