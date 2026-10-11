#!/bin/bash
# 일본 맵 10개 생성: bash tools/build_japan_maps.sh <muni.json> [python]
set -e
M=$1; PY=${2:-python3}
mk() { $PY tools/make_japan_map.py "$M" "$@"; }
mk subpref "홋카이도" assets/jp_hokkaido_zones.json --prefs 北海道
mk split "도호쿠" assets/jp_tohoku_zones.json --prefs 青森県,岩手県,宮城県,秋田県,山形県,福島県 --target 25
mk split "간토" assets/jp_kanto_zones.json --prefs 茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県 --target 25 --island-radius 0.6
mk split "주부" assets/jp_chubu_zones.json --prefs 新潟県,富山県,石川県,福井県,山梨県,長野県,岐阜県,静岡県,愛知県 --target 27
mk split "긴키" assets/jp_kinki_zones.json --prefs 三重県,滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県 --target 25
mk split "주고쿠" assets/jp_chugoku_zones.json --prefs 鳥取県,島根県,岡山県,広島県,山口県 --target 20 --island-radius 0.9
mk split "시코쿠" assets/jp_shikoku_zones.json --prefs 徳島県,香川県,愛媛県,高知県 --target 16
mk split "규슈·오키나와" assets/jp_kyushu_zones.json --prefs 福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,沖縄県 --target 25 --okinawa-shift 1.5,3.9
mk tokyo "도쿄" assets/jp_tokyo_zones.json --prefs 東京都 --target 29
mk pref "일본" assets/jp_japan_zones.json --okinawa-shift 1.5,3.7 --island-radius 1.0
for f in hokkaido tohoku kanto chubu kinki chugoku shikoku kyushu tokyo japan; do $PY tools/build_map.py assets/jp_${f}_zones.json; done
