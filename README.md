# INCORE — Trang web tiếng Việt

Phiên bản tiếng Việt của [incoremedi.com](https://incoremedi.com/eng/) — INCORE Co., Ltd.
(nhà sản xuất thiết bị y tế tại Daegu, Hàn Quốc).

## 구성

정적 사이트입니다. `app.js`가 `content.json`을 읽어 화면을 그립니다.

| 항목 | 설명 |
| --- | --- |
| `index.html` 외 8개 | 페이지 셸. `<body data-page="...">` 값으로 렌더링 분기 |
| `app.js` | 렌더러 (단일 언어: 베트남어) |
| `content.json` | 모든 텍스트·이미지 경로 데이터 |
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

## 내용 수정

`content.json`을 고치고 커밋하면 GitHub Pages에 자동 반영됩니다.
