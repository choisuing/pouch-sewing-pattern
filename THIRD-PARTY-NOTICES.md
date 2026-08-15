# 서드파티 고지

이 저장소의 코드는 MIT 라이선스다 (`LICENSE` 참고). 아래 자산들은 각자의
라이선스를 따르며, MIT가 이를 대체하지 않는다.

---

## Noto Sans KR — SIL Open Font License 1.1

`src/core/korean-font.ts`에 base64로 담긴 서브셋 폰트.

원본은 Google의 Noto Sans KR이며 Adobe의 Source Han Sans에서 파생했다.
폰트 바이너리 안에 원 저작권과 라이선스 문구가 그대로 보존되어 있다.

```
(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.
```

예약 글꼴 이름 `Source`를 피하려고 서브셋 이름은 `Noto Sans KR Subset`으로
바꿔 두었다. 만드는 방법은 `scripts/build-korean-font.py`에 있다.

전문:

```
Copyright (c) <dates>, <Copyright Holder> (<URL|email>),
with Reserved Font Name <Reserved Font Name>.
Copyright (c) <dates>, <additional Copyright Holder> (<URL|email>),
with Reserved Font Name <additional Reserved Font Name>.
Copyright (c) <dates>, <additional Copyright Holder> (<URL|email>).

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

---

## Twemoji — CC-BY 4.0

`index.html`에 인라인으로 넣은 섹션 아이콘 SVG 네 개.

Copyright 2020 Twitter, Inc and other contributors.
그래픽은 [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따른다.
출처: https://github.com/jdecked/twemoji

---

## 도안 계산법

계산법은 유튜브 "에셀피" 채널의
[사각파우치 도안 만들기, 도안계산법](https://youtu.be/7nud1soFF5Y)을 참고했다.
계산 방법 자체는 저작물이 아니지만 출처를 밝혀 둔다.

---

## npm 의존성

`pdf-lib`(MIT), `@pdf-lib/fontkit`(MIT)를 번들에 포함한다. 각 패키지의
라이선스 전문은 `node_modules/<패키지>/LICENSE`에 있다.
