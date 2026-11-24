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

`serve.ps1`과 `admin.html`은 로컬 전용이라 이 저장소에 포함되어 있지 않습니다.
정적 서버라면 무엇이든 됩니다.

```bash
python -m http.server 8753
```

브라우저에서 <http://localhost:8753/> 접속.

> `file://`로 직접 열면 동작하지 않습니다. `app.js`가 `content.json`을
> XHR로 읽기 때문에 반드시 HTTP로 띄워야 합니다.

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
