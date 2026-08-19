#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 choisuing
"""
PDF에 한글을 찍기 위한 서브셋 폰트를 만든다.

만들어진 결과는 src/core/korean-font.ts에 base64로 박힌다. 외부에서 받아오지
않으므로 앱은 네트워크 요청을 하지 않는다.

    python3 scripts/build-korean-font.py

PDF에 쓰는 한국어 문구를 바꾸면 이 스크립트를 다시 돌려야 한다. 새 글자가
서브셋에 없으면 그 자리가 빈칸으로 인쇄된다. tests/pdf.test.ts의
"서브셋 폰트 안에 있다" 테스트가 그런 경우를 먼저 잡는다.

필요:
    python3 -m pip install fonttools brotli
"""

import base64
import pathlib
import subprocess
import sys
import tempfile

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Noto Sans KR, SIL Open Font License 1.1
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"

# 본문용 400, 도안 하단 강조 문구용 700.
WEIGHTS = {"KOREAN_FONT_BASE64": 400, "KOREAN_BOLD_FONT_BASE64": 700}

# PDF에 등장하는 글자. src/core/pdf.ts의 KOREAN_FONT_CHARS와 같아야 한다.
# 칸 번호가 행마다 A, B, C... 로 올라가므로 알파벳 전체를 담는다.
CHARS = {
    "KOREAN_FONT_BASE64": " !*0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZcm각골사선세시없요우음인접지치퍼파하확",
    # 굵은 글씨는 도안 하단 한 줄에만 쓴다.
    "KOREAN_BOLD_FONT_BASE64": " '!로사세실요이제주즈출력해",
}

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "src" / "core" / "korean-font.ts"

HEADER = """/*
 * PDF에 한글을 찍기 위한 폰트. Noto Sans KR에서 이 앱이 실제로 쓰는 글자만
 * 추려낸 서브셋이다. 본문용(400)과 도안 하단 강조 문구용(700) 두 벌이다.
 *
 * 이 파일은 scripts/build-korean-font.py가 만든다. 직접 고치지 말 것.
 * PDF 문구를 바꿨다면 그 스크립트를 다시 돌린다.
 *
 * 아래 base64는 글꼴 데이터이며 이 저장소의 MIT 라이선스가 아니라
 * SIL Open Font License 1.1을 따른다. 원 저작권 문구는 글꼴 바이너리
 * 안에 그대로 보존되어 있다.
 *
 *   (c) 2014-2021 Adobe (http://www.adobe.com/),
 *   with Reserved Font Name 'Source'.
 *
 * 전문은 THIRD-PARTY-NOTICES.md 참고.
 */
/* SPDX-License-Identifier: OFL-1.1 */
"""


def build_subset(source: pathlib.Path, weight: int, chars: str, tmp: str) -> bytes:
    font = TTFont(source)
    # 가변 폰트라 그대로 두면 기본값(Thin)으로 그려진다. 원하는 굵기로 고정한다.
    instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True)

    options = Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # 저작권·라이선스 유지
    options.layout_closure = False
    subsetter = Subsetter(options=options)
    subsetter.populate(text=chars)
    subsetter.subset(font)

    # GPOS/GSUB를 남기면 fontkit이 CJK용 위치 조정을 적용해 자간이 벌어진다.
    # ("3cm"이 "3 cm"으로 보인다) 한글 완성형은 조판 기능 없이도 정상이다.
    for table in ("GPOS", "GSUB", "GDEF"):
        if table in font:
            del font[table]

    style = "Bold" if weight >= 700 else "Regular"
    for record in font["name"].names:
        if record.nameID == 1:
            record.string = "Noto Sans KR Subset"
        elif record.nameID == 2:
            record.string = style
        elif record.nameID == 4:
            record.string = f"Noto Sans KR Subset {style}"
        elif record.nameID == 6:
            record.string = f"NotoSansKRSubset-{style}"

    target = pathlib.Path(tmp) / f"subset-{weight}.ttf"
    font.save(target)
    data = target.read_bytes()

    cmap = TTFont(target).getBestCmap()
    missing = sorted({c for c in chars if c != " " and ord(c) not in cmap})
    if missing:
        raise SystemExit(f"굵기 {weight}에서 글자가 빠졌다: {missing}")
    return data


def to_export(name: str, data: bytes) -> str:
    encoded = base64.b64encode(data).decode("ascii")
    chunks = [encoded[i:i + 100] for i in range(0, len(encoded), 100)]
    body = "\n".join(f"  '{chunk}' +" for chunk in chunks[:-1])
    body += f"\n  '{chunks[-1]}';\n"
    return f"export const {name} =\n{body}"


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        source = pathlib.Path(tmp) / "NotoSansKR.ttf"
        print(f"내려받는 중: {FONT_URL}")
        subprocess.run(["curl", "-sL", "-o", str(source), FONT_URL], check=True)

        parts = []
        for name, weight in WEIGHTS.items():
            data = build_subset(source, weight, CHARS[name], tmp)
            parts.append(to_export(name, data))
            print(f"  굵기 {weight}: 글리프 {len(set(CHARS[name]))}자 · {len(data):,}바이트")

    OUTPUT.write_text(HEADER + "\n" + "\n".join(parts))
    print(f"기록: {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
