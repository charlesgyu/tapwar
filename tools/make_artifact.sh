#!/bin/sh
# index.html → 아티팩트용 html (문서 뼈대 태그 제거, 제목만 TAPWAR). 사용: tools/make_artifact.sh 출력경로
sed -e '/^<!DOCTYPE html>$/d' -e '/^<html lang="ko">$/d' -e 's#^<head>$##;s#^</head>$##;s#^<body>$##;s#^</body>$##;/^<\/html>$/d' \
    -e 's#<title>TAPWAR - Minimal Metro Edition</title>#<title>TAPWAR</title>#' "$(dirname "$0")/../index.html" > "$1"
