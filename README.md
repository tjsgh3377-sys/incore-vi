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

## 관리자 페이지 (로컬 전용)

`admin.html`은 `serve.ps1`이 제공하는 로컬 API(`/api/login`·`/api/content`·`/api/save`·
`/api/upload`)에 의존합니다. **GitHub Pages에는 백엔드가 없으므로 관리자는 로컬에서만 동작합니다.**

그래서 관리자 파일은 저장소에만 두고 공개 사이트에는 게시하지 않습니다
(`_config.yml` 의 `exclude` 목록). 반드시 아래 **localhost 주소**로 접속하세요 —
Pages 주소나 `file://` 로 열면 "서버에 연결할 수 없습니다" 오류가 납니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
```

| 주소 | 용도 |
| --- | --- |
| <http://localhost:8753/> | 사이트 |
| <http://localhost:8753/admin.html> | 관리자 |

### 비밀번호 설정

`admin.config.example.json`을 복사해 `admin.config.json`을 만들고 비밀번호를 바꿉니다.
**`admin.config.json`은 `.gitignore`에 등록되어 있어 저장소에 올라가지 않습니다.**

```bash
cp admin.config.example.json admin.config.json
```

설정 파일이 없으면 `change-me`가 기본값으로 쓰입니다. 공개 저장소이므로 실제 비밀번호를
코드에 적지 마세요.

### 편집 범위

좌측 8개 탭(홈·회사소개·제품소개·사업영역·기술력·인증/오시는 길·문의/CTA·커뮤니티)에서
텍스트·이미지를 수정하고 저장하면 `content.json`에 반영됩니다.
현재 관리자는 **베트남어(`content.json`)만 편집**하며, 영문은 `content_en.json`을 직접 수정합니다.
(서버에는 영문 조회 `/api/content?lang=en`·저장 `/api/save-en`이 이미 구현되어 있습니다.)

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
> 관리자 화면(`admin.html`)은 현재 `content.json`(베트남어)만 편집한다.

## 내용 수정

`content.json`을 고치고 커밋하면 GitHub Pages에 자동 반영됩니다.
