# INCORE — Trang web tiếng Việt / English

Phiên bản tiếng Việt và tiếng Anh của [incoremedi.com](https://incoremedi.com/eng/) — INCORE Co., Ltd.
(nhà sản xuất thiết bị y tế tại Daegu, Hàn Quốc).

## 구성

정적 사이트입니다. `app.js`가 `content.json`을 읽어 화면을 그립니다.

| 항목 | 설명 |
| --- | --- |
| `index.html` 외 8개 | 페이지 셸. `<body data-page="...">` 값으로 렌더링 분기 |
| `app.js` | 렌더러 (베트남어·영문 2개 언어) |
| `content.json` | 베트남어 텍스트·이미지 경로 데이터 |
| `content_en.json` | 영문 텍스트 데이터 (`content.json`과 구조 동일) |
| `css/style.css` | 디자인 시스템 |
| `assets/` | 로고·히어로·제품·인증 이미지 |

## 로컬 실행

사이트만 볼 때는 정적 서버라면 무엇이든 됩니다.

```bash
python -m http.server 8753
```

브라우저에서 <http://localhost:8753/> 접속.

> `file://`로 직접 열면 동작하지 않습니다. `app.js`가 `content.json`을
> XHR로 읽기 때문에 반드시 HTTP로 띄워야 합니다.

## 관리자 페이지

관리자는 `/admin/` 한 곳입니다. 접속한 주소에 따라 저장 방식이 자동으로 바뀝니다.

| 접속 주소 | 모드 | 로그인 | 저장하면 |
| --- | --- | --- | --- |
| <http://localhost:8753/admin/> | 로컬 서버 | 비밀번호 | 파일에 바로 기록 (빠름). 발행은 [GitHub에 반영] 버튼으로 따로 |
| `(공개주소)/admin/` | GitHub 직접 편집 | GitHub 토큰 | 저장소에 바로 커밋 → 사이트 반영 |

판정은 주소로 합니다(localhost 여부). LAN IP로 로컬 서버를 열었을 때처럼 어긋나면
주소 끝에 `?backend=local` 또는 `?backend=github` 를 붙여 강제할 수 있습니다.

관련 파일은 `admin/index.html`(화면), `admin/admin.js`(입력 폼),
`admin/backend.js`(저장 방식 두 가지)입니다.

### 웹에서 쓰기 — 비밀번호 로그인

처음 한 번만 GitHub 토큰으로 들어간 뒤, 상단 **[비밀번호 설정]** 에서 비밀번호를 만들면
그 뒤로는 토큰 없이 비밀번호만으로 로그인합니다.

작동 방식 — 정적 사이트라 비밀번호를 검사할 서버가 없습니다. 그래서 **토큰을 비밀번호로
암호화해 `admin/token.enc.json` 에 커밋**해 두고, 로그인 때 비밀번호로 풀어 씁니다.

| 항목 | 값 |
| --- | --- |
| 키 유도 | PBKDF2-SHA256, 2,400,000회 (로그인 1회 ≈ 1초) |
| 암호 | AES-GCM-256, 매번 새 salt(16B)·IV(12B) |
| 평문 | 256바이트 고정 패딩 — 암호문 길이로 토큰 종류가 드러나지 않게 |

> **알고 쓰셔야 할 점.** 이 암호문은 공개 저장소에 그대로 올라갑니다.
> 누구나 내려받아 오프라인에서 비밀번호를 대입해볼 수 있습니다.
> 반복 횟수를 키워 1회 시도를 ~1초로 만들었지만, **마지막 방어선은 비밀번호 자체**입니다.
> 그래서 12자 미만이거나 추정 강도 50비트 미만인 비밀번호는 설정 단계에서 거부합니다
> (`incore2026` 류는 막힙니다). [강한 비밀번호 만들어 넣기] 버튼을 쓰거나
> 관련 없는 단어 4개 이상을 이어 쓰세요.
>
> 비밀번호가 새어나간 것 같으면 **GitHub에서 그 토큰을 폐기**하면 즉시 무력화됩니다.
> 새 토큰으로 로그인해 비밀번호를 다시 설정하면 됩니다.

비밀번호를 바꾸려면 로그인 후 [비밀번호 설정]을 다시 누르면 됩니다.
토큰이 만료되면 비밀번호는 맞아도 로그인이 막히므로, 새 토큰으로 들어가 다시 설정하세요.

### 웹에서 쓰기 — GitHub 토큰

공개 주소의 `/admin/`은 서버가 없으므로 **브라우저가 GitHub API로 직접 커밋**합니다.
비밀번호 대신 GitHub 토큰이 열쇠입니다.

1. <https://github.com/settings/personal-access-tokens/new> 에서 Fine-grained token 발급
2. Repository access → **이 저장소만** 선택
3. Permissions → Repository permissions → **Contents: Read and write**
4. 만료일을 정해두고, 만료되면 새로 발급해 다시 로그인

- 토큰은 입력한 브라우저에만 저장되고(기억하기 체크 시 `localStorage`) 다른 곳으로 보내지 않습니다.
  다만 `*.github.io` 는 계정 단위로 도메인이 같으므로, **같은 GitHub 계정의 다른 Pages 사이트에서도
  이 토큰을 읽을 수 있습니다.** 신뢰할 수 없는 코드를 같은 계정의 Pages 로 올리지 마세요.
  공용 PC에서는 [기억하기]를 체크하지 말고, 쓴 뒤 로그아웃하세요.
- 쓰기 권한이 없는 토큰은 로그인 단계에서 걸러집니다.
- 저장 = 커밋입니다. 바뀐 파일 목록을 확인창으로 보여준 뒤 커밋하며,
  본문·영문·이미지를 **하나의 커밋**으로 묶습니다.
- 불러온 뒤 저장소가 바뀌었으면(다른 곳에서 먼저 수정) 덮어쓰지 않고 막습니다.
  [되돌리기]로 최신 내용을 받은 뒤 다시 저장하세요.
- 저장소 주소가 바뀌면 `admin/backend.js` 맨 위의 `GH` 값만 고치면 됩니다.

> 공개 주소의 관리자 화면은 누구나 열 수 있지만, **쓰기 권한이 있는 토큰이 없으면
> 아무것도 저장할 수 없습니다.** 저장소가 공개라 내용 자체는 이미 공개 상태입니다.

### 로컬에서 쓰기 — serve.ps1

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
```

| 주소 | 용도 |
| --- | --- |
| <http://localhost:8753/> | 사이트 |
| <http://localhost:8753/admin/> | 관리자 |

#### 비밀번호 설정

`admin.config.example.json`을 복사해 `admin.config.json`을 만들고 비밀번호를 바꿉니다.
**`admin.config.json`은 `.gitignore`에 등록되어 있어 저장소에 올라가지 않습니다.**

```bash
cp admin.config.example.json admin.config.json
```

설정 파일이 없으면 `change-me`가 기본값으로 쓰입니다. 공개 저장소이므로 실제 비밀번호를
코드에 적지 마세요.

### 편집 범위 (두 모드 공통)

좌측 8개 탭(홈·회사소개·제품소개·사업영역·기술력·인증/오시는 길·문의/CTA·커뮤니티)에서
텍스트·이미지를 수정합니다. **베트남어(VI)와 영문(EN)을 나란히 편집**하며,
저장하면 `content.json`과 `content_en.json`이 한 번에 기록됩니다.

- 번역이 필요한 텍스트 → VI / EN 두 칸이 나란히 표시
- 이미지·아이콘처럼 언어 공통인 값 → 한 칸만 표시되고 양쪽에 함께 저장
- 항목 추가·삭제 → 두 언어의 배열 구조가 자동으로 동기화되어 길이가 어긋나지 않음

`content_en.json`을 불러오지 못하면 안내 문구가 뜨고 베트남어만 편집합니다.

### GitHub에 반영 (로컬 모드 전용)

저장바의 **[GitHub에 반영]** 버튼이 저장 → 커밋 → 푸시를 한 번에 처리합니다.

1. 먼저 `content.json` / `content_en.json`을 저장한다
2. 바뀐 파일 목록을 확인 창으로 보여준다 (공개 사이트에 그대로 올라가므로 반드시 확인)
3. 수락하면 커밋 후 `origin`의 현재 브랜치로 푸시한다
4. 커밋 해시를 표시한다. GitHub Pages 반영까지 1~2분 걸린다

- 커밋 대상은 `content.json`, `content_en.json`, `assets/` 뿐이다.
  `admin.config.json`·`serve.ps1` 등 다른 파일은 이 버튼으로 커밋되지 않는다.
- 메모 칸에 적은 내용은 커밋 메시지 첫 줄이 된다. 비워두면 `관리자 페이지에서 콘텐츠 수정 (날짜 시각)`.
- 바뀐 내용이 없으면 "반영할 변경이 없습니다"라고만 알리고 아무 것도 하지 않는다.
- git 자격증명이 만료되면 푸시 단계에서 실패 메시지가 뜬다.
  터미널에서 `git push`를 한 번 실행해 자격증명을 갱신하면 된다.

## 언어 전환

상단 우측 `VI | EN` 버튼으로 전환한다.

- 전환 규칙: `?lang=en|vi` 쿼리 → `localStorage.icLang` → 기본 `vi`
- 영문 상태에서는 내부 링크에 `?lang=en`이 자동으로 붙고, 선택한 언어는 브라우저에 기억된다
- 언어에 따라 `<html lang>`, `<title>`, `meta description`이 함께 바뀐다

| 언어 | 데이터 파일 | 주소 예시 |
| --- | --- | --- |
| 베트남어(기본) | `content.json` | `/index.html` 또는 `/index.html?lang=vi` |
| 영문 | `content_en.json` | `/index.html?lang=en` |

> 영문 텍스트를 고칠 때는 `content_en.json`을 수정한다. 두 파일은 키 구조가 완전히 같아야 하며,
> 한쪽에만 키를 추가하면 그 언어에서만 항목이 보인다.
> 관리자 화면(`/admin/`)에서 두 파일을 나란히 편집할 수 있다.

## 내용 수정

`content.json` / `content_en.json`을 고치고 커밋하면 GitHub Pages에 자동 반영됩니다.
관리자 페이지를 쓰면 [GitHub에 반영] 버튼이 커밋·푸시까지 대신 합니다.
