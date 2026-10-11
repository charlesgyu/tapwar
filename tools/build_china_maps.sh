#!/bin/bash
# 중국 맵 8개 생성: bash tools/build_china_maps.sh <adm1.geojson> <adm2.geojson> [python]
set -e
A1=$1; A2=$2; PY=${3:-python3}
mk() { $PY tools/make_china_map.py "$A1" "$A2" "$@"; }
mk split "둥베이" assets/cn_dongbei_zones.json --provs 辽宁,吉林,黑龙江 --target 20
mk split "화중" assets/cn_huazhong_zones.json --provs 河南,湖北,湖南 --target 22
mk split "화난" assets/cn_huanan_zones.json --provs 广东,广西,海南 --target 22
mk split "화북" assets/cn_huabei_zones.json --provs 北京,天津,河北,山西,内蒙古 --target 25
mk split "화둥" assets/cn_huadong_zones.json --provs 上海,江苏,浙江,安徽,福建,江西,山东 --target 27
mk split "시난" assets/cn_xinan_zones.json --provs 重庆,四川,贵州,云南,西藏 --target 25
mk split "시베이" assets/cn_xibei_zones.json --provs 陕西,甘肃,青海,宁夏,新疆 --target 25
mk split "중국 전국" assets/cn_china_zones.json --target 160
for f in dongbei huazhong huanan huabei huadong xinan xibei china; do $PY tools/build_map.py assets/cn_${f}_zones.json; done
