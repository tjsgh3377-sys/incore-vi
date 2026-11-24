(function () {
  "use strict";

  var TOKEN_KEY = "jstech_admin_token";
  var content = null;    // 베트남어 content.json
  var contentEn = null;  // 영문 content_en.json (불러오기 실패 시 null → 영문 칸 숨김)

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function token() { return sessionStorage.getItem(TOKEN_KEY); }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (token()) opts.headers["X-Admin-Token"] = token();
    return fetch(path, opts);
  }

  // ---------- login ----------
  function doLogin() {
    var pw = $("#pw").value;
    $("#loginErr").textContent = "";
    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) { sessionStorage.setItem(TOKEN_KEY, pw); showApp(); }
        else { $("#loginErr").textContent = "비밀번호가 올바르지 않습니다."; }
      }).catch(function () { $("#loginErr").textContent = "서버에 연결할 수 없습니다. serve.ps1 로 실행했는지 확인하세요."; });
  }

  function logout() { sessionStorage.removeItem(TOKEN_KEY); location.reload(); }

  function showApp() {
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    loadContent();
  }

  function loadContent() {
    var t = Date.now();
    var vi = fetch("/api/content?_=" + t).then(function (r) { return r.json(); });
    // 영문은 없거나 서버가 실패해도 베트남어 편집은 계속 가능해야 한다
    var en = fetch("/api/content?lang=en&_=" + t)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });

    Promise.all([vi, en]).then(function (res) {
      content = res[0];
      contentEn = res[1];
      buildForm();
    }).catch(function () {
      $("#form").innerHTML = "<div class='card'>content.json을 불러오지 못했습니다.</div>";
    });
  }

  // contentEn 이 있으면 영문 칸이 함께 렌더된다 (없으면 베트남어 단일 편집)
  function enObjOf(koRef, enParent, key) {
    if (!enParent) return null;
    if (!enParent[key]) enParent[key] = {};
    return enParent[key];
  }
  function enArrOf(enParent, key) {
    if (!enParent) return null;
    if (!enParent[key]) enParent[key] = [];
    return enParent[key];
  }

  // ---------- fields ----------
  function imageField(label, getter, setter, folder) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var row = el("div", { "class": "img-field" });
    var img = el("img", { "class": "thumb", src: getter() + "?_=" + Date.now() });
    var btn = el("span", { "class": "file-btn" });
    var b = el("button", { "class": "ghost", type: "button", style: "border-radius:8px;padding:9px 14px;cursor:pointer;" }, "이미지 변경");
    var input = el("input", { type: "file", accept: "image/*" });
    btn.appendChild(b); btn.appendChild(input);
    var status = el("span", { "class": "hint" }, "");

    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      status.textContent = "업로드 중...";
      var name = (Date.now()) + "_" + file.name;
      api("/api/upload?folder=" + folder + "&name=" + encodeURIComponent(name), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.ok) {
          setter(j.path);
          img.src = j.path + "?_=" + Date.now();
          status.textContent = "변경됨 (저장하기를 눌러 반영)";
        } else { status.textContent = "업로드 실패: " + (j.error || ""); }
      }).catch(function () { status.textContent = "업로드 실패"; });
    });

    row.appendChild(img); row.appendChild(btn); row.appendChild(status);
    wrap.appendChild(row);
    return wrap;
  }

  // 일반 파일 업로드(카탈로그 PDF 등). opts = { folder, accept, fixedName, onUploaded(path) }
  // fixedName 지정 시 항상 같은 파일명으로 덮어써 별도 저장 없이 즉시 반영된다.
  function fileField(label, getCurrent, opts) {
    opts = opts || {};
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var row = el("div", { "class": "img-field" });
    var cur = el("a", { href: getCurrent() + "?_=" + Date.now(), target: "_blank", style: "font-size:13px;color:var(--mint-dark);" }, "현재 파일 보기 ↗");
    var btn = el("span", { "class": "file-btn" });
    var b = el("button", { "class": "ghost", type: "button", style: "border-radius:8px;padding:9px 14px;cursor:pointer;" }, "파일 선택");
    var input = el("input", { type: "file" });
    if (opts.accept) input.setAttribute("accept", opts.accept);
    btn.appendChild(b); btn.appendChild(input);
    var status = el("span", { "class": "hint" }, "");

    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      status.textContent = "업로드 중...";
      var name = opts.fixedName || (Date.now() + "_" + file.name);
      api("/api/upload?folder=" + (opts.folder || "images") + "&name=" + encodeURIComponent(name), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.ok) {
          if (opts.onUploaded) opts.onUploaded(j.path);
          cur.href = j.path + "?_=" + Date.now();
          status.textContent = opts.fixedName ? "교체 완료 — 사이트에 즉시 반영됩니다." : "변경됨 (저장하기를 눌러 반영)";
        } else { status.textContent = "업로드 실패: " + (j.error || ""); }
      }).catch(function () { status.textContent = "업로드 실패"; });
    });

    row.appendChild(cur); row.appendChild(btn); row.appendChild(status);
    wrap.appendChild(row);
    return wrap;
  }

  function textField(label, value, oninput, isArea) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var inp = isArea ? el("textarea") : el("input", { type: "text" });
    inp.value = value || "";
    inp.addEventListener("input", function () { oninput(inp.value); });
    wrap.appendChild(inp);
    return wrap;
  }

  // 단락 배열 <-> 빈 줄로 구분된 텍스트
  function paragraphsField(label, getArr, setArr) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var ta = el("textarea", { style: "min-height:160px;" });
    ta.value = (getArr() || []).join("\n\n");
    ta.addEventListener("input", function () {
      var parts = ta.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
      setArr(parts);
    });
    wrap.appendChild(ta);
    wrap.appendChild(el("div", { "class": "hint" }, "단락은 빈 줄(Enter 두 번)로 구분합니다."));
    return wrap;
  }

  // ---------- 국문/영문 동시 편집 필드 ----------
  // 번역이 필요한 텍스트: 국문/영문 두 칸을 나란히 표시
  function dualText(label, koObj, enObj, key, isArea) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var cols = el("div", { "class": "dual-cols" });
    function mk(obj, tag) {
      var c = el("div");
      c.appendChild(el("div", { "class": "lang-tag" }, tag));
      var inp = isArea ? el("textarea") : el("input", { type: "text" });
      inp.value = (obj && obj[key] != null) ? obj[key] : "";
      inp.addEventListener("input", function () { if (obj) obj[key] = inp.value; });
      c.appendChild(inp);
      return c;
    }
    cols.appendChild(mk(koObj, "베트남어 (VI)"));
    if (enObj) cols.appendChild(mk(enObj, "영문 (EN)"));
    wrap.appendChild(cols);
    return wrap;
  }

  // 언어 공통(중립) 값: 한 칸만 표시하고 국문·영문에 동시 기록
  function mirrorText(label, koObj, enObj, key) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var inp = el("input", { type: "text" });
    inp.value = (koObj && koObj[key] != null) ? koObj[key] : "";
    inp.addEventListener("input", function () {
      if (koObj) koObj[key] = inp.value;
      if (enObj) enObj[key] = inp.value;
    });
    wrap.appendChild(inp);
    return wrap;
  }

  // 이미지 경로는 언어 공통 → 국문/영문 동시 기록
  function dualImage(label, koObj, enObj, key, folder) {
    return imageField(label, function () { return koObj[key]; }, function (p) {
      koObj[key] = p; if (enObj) enObj[key] = p;
    }, folder);
  }

  // 단락(빈 줄 구분) 국문/영문 나란히
  function dualParagraphs(label, koObj, enObj, key) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var cols = el("div", { "class": "dual-cols" });
    function mk(obj, tag) {
      var c = el("div");
      c.appendChild(el("div", { "class": "lang-tag" }, tag));
      var ta = el("textarea", { style: "min-height:160px;" });
      ta.value = ((obj && obj[key]) || []).join("\n\n");
      ta.addEventListener("input", function () {
        if (!obj) return;
        obj[key] = ta.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
      });
      c.appendChild(ta);
      return c;
    }
    cols.appendChild(mk(koObj, "베트남어 (VI)"));
    if (enObj) cols.appendChild(mk(enObj, "영문 (EN)"));
    wrap.appendChild(cols);
    wrap.appendChild(el("div", { "class": "hint" }, "단락은 빈 줄(Enter 두 번)로 구분합니다."));
    return wrap;
  }

  // 줄 배열(줄바꿈 구분) 국문/영문 나란히
  function dualLines(label, koObj, enObj, key) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var cols = el("div", { "class": "dual-cols" });
    function mk(obj, tag) {
      var c = el("div");
      c.appendChild(el("div", { "class": "lang-tag" }, tag));
      var ta = el("textarea");
      ta.value = ((obj && obj[key]) || []).join("\n");
      ta.addEventListener("input", function () {
        if (!obj) return;
        obj[key] = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
      });
      c.appendChild(ta);
      return c;
    }
    cols.appendChild(mk(koObj, "베트남어 (VI)"));
    if (enObj) cols.appendChild(mk(enObj, "영문 (EN)"));
    wrap.appendChild(cols);
    return wrap;
  }

  // 쉼표 구분 태그 국문/영문 나란히
  function dualCsv(label, koObj, enObj, key) {
    var wrap = el("div");
    wrap.appendChild(el("label", null, esc(label)));
    var cols = el("div", { "class": "dual-cols" });
    function mk(obj, tag) {
      var c = el("div");
      c.appendChild(el("div", { "class": "lang-tag" }, tag));
      var inp = el("input", { type: "text" });
      inp.value = ((obj && obj[key]) || []).join(", ");
      inp.addEventListener("input", function () {
        if (!obj) return;
        obj[key] = inp.value.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
      });
      c.appendChild(inp);
      return c;
    }
    cols.appendChild(mk(koObj, "베트남어 (VI)"));
    if (enObj) cols.appendChild(mk(enObj, "영문 (EN)"));
    wrap.appendChild(cols);
    return wrap;
  }

  // 국문/영문 배열을 구조 동기화하며 반복 편집(추가·삭제 시 양쪽 동시 반영)
  function dualRepeat(title, koArr, enArr, makeNew, renderItem) {
    var card = el("div", { "class": "card" });
    card.appendChild(el("h2", null, esc(title)));
    var list = el("div");
    card.appendChild(list);

    function sync() {
      if (!enArr) return;
      while (enArr.length < koArr.length) enArr.push(makeNew());
      while (enArr.length > koArr.length) enArr.pop();
    }
    function redraw() {
      sync();
      list.innerHTML = "";
      koArr.forEach(function (koItem, idx) {
        var enItem = enArr ? enArr[idx] : null;
        var ri = el("div", { "class": "repeat-item" });
        var rm = el("button", { "class": "rm", type: "button" }, "삭제");
        rm.addEventListener("click", function () { koArr.splice(idx, 1); if (enArr) enArr.splice(idx, 1); redraw(); });
        ri.appendChild(rm);
        ri.appendChild(el("div", { "class": "hint", style: "margin-bottom:6px;" }, "#" + (idx + 1)));
        renderItem(koItem, enItem, ri);
        list.appendChild(ri);
      });
    }
    redraw();

    var add = el("button", { "class": "ghost", type: "button", style: "border-radius:8px;padding:9px 16px;cursor:pointer;" }, "+ 항목 추가");
    add.addEventListener("click", function () { koArr.push(makeNew()); if (enArr) enArr.push(makeNew()); redraw(); });
    card.appendChild(add);
    return card;
  }

  function repeatCard(title, arr, makeNew, renderItem) {
    var card = el("div", { "class": "card" });
    card.appendChild(el("h2", null, esc(title)));
    var list = el("div");
    card.appendChild(list);

    function redraw() {
      list.innerHTML = "";
      arr.forEach(function (item, idx) {
        var ri = el("div", { "class": "repeat-item" });
        var rm = el("button", { "class": "rm", type: "button" }, "삭제");
        rm.addEventListener("click", function () { arr.splice(idx, 1); redraw(); });
        ri.appendChild(rm);
        ri.appendChild(el("div", { "class": "hint", style: "margin-bottom:6px;" }, "#" + (idx + 1)));
        renderItem(item, ri);
        list.appendChild(ri);
      });
    }
    redraw();

    var add = el("button", { "class": "ghost", type: "button", style: "border-radius:8px;padding:9px 16px;cursor:pointer;" }, "+ 항목 추가");
    add.addEventListener("click", function () { arr.push(makeNew()); redraw(); });
    card.appendChild(add);
    return card;
  }

  // ---------- section (좌측 탭) ----------
  var navItems = [];
  function activateSection(id) {
    var secs = document.querySelectorAll("#form .sec");
    for (var i = 0; i < secs.length; i++) secs[i].classList.toggle("active", secs[i].id === "sec-" + id);
    var links = document.querySelectorAll("#sidenav a");
    for (var j = 0; j < links.length; j++) links[j].classList.toggle("active", links[j].getAttribute("data-target") === id);
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  // ---------- build form ----------
  function buildForm() {
    var form = $("#form");
    form.innerHTML = "";
    navItems = [];

    var host = form;  // 현재 카드가 붙는 대상 (섹션별로 전환)
    function beginSection(id, icon, label) {
      var sec = el("section", { id: "sec-" + id, "class": "sec" });
      form.append(sec);
      navItems.push({ id: id, icon: icon, label: label });
      host = sec;
      return sec;
    }

    host.appendChild(el("div", { "class": "infobar" },
      contentEn
        ? ("이 화면은 <b>베트남어(VI)와 영문(EN)</b>을 나란히 편집합니다. 입력한 내용이 그대로 사이트에 노출됩니다. " +
           "저장하면 <b>content.json 과 content_en.json</b>이 한 번에 반영됩니다. " +
           "이미지·아이콘처럼 언어 공통인 값은 한 칸만 표시되며 양쪽에 함께 저장됩니다.")
        : ("<b>영문 데이터(content_en.json)를 불러오지 못해 베트남어만 편집합니다.</b> " +
           "파일이 있는지 확인한 뒤 새로고침하세요.")));

    // ===== 홈 · 기본정보 =====
    beginSection("brand", "🏠", "홈 · 기본정보");

    // 로고 · 이미지 (공통)
    var imgKo = content.images, imgEn = enObjOf(imgKo, contentEn, "images");
    var media = el("div", { "class": "card" });
    media.appendChild(el("h2", null, "로고 · 배경 이미지 (국문/영문 공통)"));
    media.appendChild(dualImage("로고 (Logo)", imgKo, imgEn, "logo", "images"));
    media.appendChild(dualImage("메인 배너 이미지 (Hero)", imgKo, imgEn, "hero", "images"));
    media.appendChild(dualImage("기술력 섹션 배경 (Technology)", imgKo, imgEn, "tech", "images"));
    host.appendChild(media);

    // 기업정보
    var co = content.company, coEn = enObjOf(co, contentEn, "company");
    var company = el("div", { "class": "card" });
    company.appendChild(el("h2", null, "기업 정보"));
    company.appendChild(dualText("회사명(국문 표기)", co, coEn, "nameKr"));
    company.appendChild(mirrorText("회사명(영문)", co, coEn, "nameEn"));
    company.appendChild(dualText("대표이사", co, coEn, "ceo"));
    company.appendChild(mirrorText("설립연도", co, coEn, "since"));
    var cg = el("div", { "class": "grid2" });
    cg.appendChild(mirrorText("전화 (TEL)", co, coEn, "tel"));
    cg.appendChild(mirrorText("팩스 (FAX)", co, coEn, "fax"));
    cg.appendChild(mirrorText("이메일 1", co, coEn, "email1"));
    cg.appendChild(mirrorText("이메일 2", co, coEn, "email2"));
    company.appendChild(cg);
    company.appendChild(dualText("주소", co, coEn, "address"));
    company.appendChild(mirrorText("저작권 문구 (Copyright)", co, coEn, "copyright"));
    host.appendChild(company);

    // Hero
    var h = content.hero, hEn = enObjOf(h, contentEn, "hero");
    var hero = el("div", { "class": "card" });
    hero.appendChild(el("h2", null, "메인 (Hero)"));
    hero.appendChild(mirrorText("배지 (예: SINCE 2006)", h, hEn, "badge"));
    hero.appendChild(dualText("타이틀 1줄", h, hEn, "titleLine1"));
    hero.appendChild(dualText("타이틀 2줄", h, hEn, "titleLine2"));
    hero.appendChild(dualText("서브타이틀", h, hEn, "subtitle"));
    hero.appendChild(dualText("설명", h, hEn, "description", true));
    hero.appendChild(dualText("버튼1 텍스트", h, hEn, "primaryCta"));
    hero.appendChild(dualText("버튼2 텍스트", h, hEn, "secondaryCta"));
    host.appendChild(hero);

    // 메인페이지 - 카탈로그 다운로드 파일 (언어 공통)
    var catCard = el("div", { "class": "card" });
    catCard.appendChild(el("h2", null, "메인페이지 · 카탈로그 다운로드 파일 (국문/영문 공통)"));
    catCard.appendChild(fileField("카탈로그 PDF (다운로드 버튼에 연결)", function () { return "assets/catalog.pdf"; }, {
      folder: "images", accept: ".pdf,application/pdf", fixedName: "catalog.pdf"
    }));
    catCard.appendChild(el("div", { "class": "hint" }, "PDF 파일을 선택하면 기존 카탈로그를 즉시 교체합니다. (파일명은 catalog.pdf 로 고정 — 저장하기 불필요)"));
    host.appendChild(catCard);

    // 푸터
    var f = content.footer, fEn = enObjOf(f, contentEn, "footer");
    var footer = el("div", { "class": "card" });
    footer.appendChild(el("h2", null, "푸터 (Footer)"));
    footer.appendChild(dualText("소개 문구 (하단 회사 설명)", f, fEn, "tagline", true));
    host.appendChild(footer);

    // ===== 회사소개 =====
    beginSection("about", "🏢", "회사소개");

    // About
    var a = content.about, aEn = enObjOf(a, contentEn, "about");
    var about = el("div", { "class": "card" });
    about.appendChild(el("h2", null, "회사소개 (About)"));
    about.appendChild(mirrorText("상단 라벨 (Eyebrow)", a, aEn, "eyebrow"));
    about.appendChild(dualText("제목 1줄", a, aEn, "titleLine1"));
    about.appendChild(dualText("제목 2줄 (강조)", a, aEn, "titleLine2"));
    about.appendChild(dualParagraphs("본문 단락", a, aEn, "paragraphs"));
    about.appendChild(dualText("서명 라벨", a, aEn, "ceoLabel"));
    about.appendChild(dualText("서명 이름", a, aEn, "ceoName"));
    host.appendChild(about);

    host.appendChild(dualRepeat("핵심 강점 (Strengths)", a.strengths || (a.strengths = []), enArrOf(aEn, "strengths"), function () {
      return { icon: "◆", en: "", kr: "" };
    }, function (item, itemEn, card) {
      card.appendChild(mirrorText("아이콘 문자 (예: ◈ ◆ ◯)", item, itemEn, "icon"));
      card.appendChild(mirrorText("영문 라벨", item, itemEn, "en"));
      card.appendChild(dualText("설명", item, itemEn, "kr"));
    }));

    // About - 섹션 헤더 + 하단 CTA
    var aex = el("div", { "class": "card" });
    aex.appendChild(el("h2", null, "회사소개 페이지 - 섹션 헤더"));
    aex.appendChild(mirrorText("핵심가치 라벨", a, aEn, "coreValueEyebrow"));
    aex.appendChild(dualText("핵심가치 제목", a, aEn, "coreValueTitle"));
    aex.appendChild(mirrorText("연혁 라벨", a, aEn, "historyEyebrow"));
    aex.appendChild(dualText("연혁 제목", a, aEn, "historyTitle"));
    aex.appendChild(mirrorText("핵심부품 라벨", a, aEn, "keyProductsEyebrow"));
    aex.appendChild(dualText("핵심부품 제목", a, aEn, "keyProductsTitle"));
    aex.appendChild(dualText("하단 CTA 제목", a, aEn, "aboutCtaTitle"));
    aex.appendChild(dualText("하단 CTA 부제", a, aEn, "aboutCtaSubtitle"));
    host.appendChild(aex);

    host.appendChild(dualRepeat("핵심 가치 카드 (Core Values)", a.coreValues || (a.coreValues = []), enArrOf(aEn, "coreValues"), function () {
      return { icon: "◆", en: "", kr: "", desc: "" };
    }, function (item, itemEn, card) {
      card.appendChild(mirrorText("아이콘 문자", item, itemEn, "icon"));
      card.appendChild(mirrorText("영문 라벨", item, itemEn, "en"));
      card.appendChild(dualText("국문/영문 제목", item, itemEn, "kr"));
      card.appendChild(dualText("설명", item, itemEn, "desc", true));
    }));

    host.appendChild(dualRepeat("연혁 (History)", a.history || (a.history = []), enArrOf(aEn, "history"), function () {
      return { year: "", events: [] };
    }, function (item, itemEn, card) {
      card.appendChild(dualText("연도 (예: 2023–현재 / 2023–Present)", item, itemEn, "year"));
      card.appendChild(dualLines("내용 (줄바꿈으로 여러 줄)", item, itemEn, "events"));
    }));

    host.appendChild(dualRepeat("핵심 부품 (Key Products)", a.keyProducts || (a.keyProducts = []), enArrOf(aEn, "keyProducts"), function () {
      return { badge: "", en: "", kr: "", features: [] };
    }, function (item, itemEn, card) {
      card.appendChild(mirrorText("배지 (예: SD)", item, itemEn, "badge"));
      card.appendChild(mirrorText("영문 라벨", item, itemEn, "en"));
      card.appendChild(dualText("제목", item, itemEn, "kr"));
      card.appendChild(dualLines("특징 (줄바꿈으로 여러 줄)", item, itemEn, "features"));
    }));

    // ===== 제품소개 =====
    beginSection("products", "📦", "제품소개");

    // Products
    var p = content.products, pEn = enObjOf(p, contentEn, "products");
    if (!p.categories) p.categories = [];
    var prod = el("div", { "class": "card" });
    prod.appendChild(el("h2", null, "제품소개 (Products) - 헤더"));
    prod.appendChild(mirrorText("상단 라벨", p, pEn, "eyebrow"));
    prod.appendChild(mirrorText("영문 대제목 (배너)", p, pEn, "titleEn"));
    prod.appendChild(dualText("제목 (홈 티저)", p, pEn, "title"));
    prod.appendChild(dualText("서브타이틀 (배너 부제)", p, pEn, "subtitle"));
    prod.appendChild(dualText("더보기 버튼 텍스트", p, pEn, "moreLabel"));
    prod.appendChild(mirrorText("특징 라벨 (예: FEATURES)", p, pEn, "featuresLabel"));
    prod.appendChild(dualText("하단 CTA 제목", p, pEn, "ctaTitle"));
    prod.appendChild(dualText("하단 CTA 설명", p, pEn, "ctaDesc", true));
    prod.appendChild(dualText("하단 CTA 버튼", p, pEn, "ctaBtn"));
    host.appendChild(prod);

    host.appendChild(dualRepeat("제품 카테고리 (Categories) — 탭", p.categories, enArrOf(pEn, "categories"), function () {
      return { id: "cat" + (p.categories.length + 1), tab: "", kr: "", title: "", desc: "", items: [] };
    }, function (cat, catEn, card) {
      var g = el("div", { "class": "grid2" });
      g.appendChild(mirrorText("ID (영문, 탭 앵커)", cat, catEn, "id"));
      g.appendChild(mirrorText("탭 이름 (영문)", cat, catEn, "tab"));
      card.appendChild(g);
      card.appendChild(dualText("국문 라벨 (홈 카드)", cat, catEn, "kr"));
      card.appendChild(mirrorText("제목 (영문)", cat, catEn, "title"));
      card.appendChild(dualText("카테고리 설명", cat, catEn, "desc", true));

      if (!cat.items) cat.items = [];
      card.appendChild(dualRepeat("제품 항목 (Items)", cat.items, enArrOf(catEn, "items"), function () {
        return { no: "", title: "", image: "assets/product.png", features: [] };
      }, function (item, itemEn, ic) {
        ic.appendChild(mirrorText("번호 (예: 01)", item, itemEn, "no"));
        ic.appendChild(mirrorText("제품명 (고유명사)", item, itemEn, "title"));
        ic.appendChild(dualImage("제품 이미지", item, itemEn, "image", "images"));
        if (!item.features) item.features = [];
        ic.appendChild(dualRepeat("특징 그룹 (Features)", item.features, enArrOf(itemEn, "features"), function () {
          return { tag: "", lines: [] };
        }, function (feat, featEn, fc) {
          fc.appendChild(dualText("태그 (예: 정밀 / Precision)", feat, featEn, "tag"));
          fc.appendChild(dualLines("내용 (줄바꿈으로 여러 줄)", feat, featEn, "lines"));
        }));
      }));
    }));

    // ===== 사업영역 =====
    beginSection("business", "🏭", "사업영역");

    // Business
    var b = content.business, bEn = enObjOf(b, contentEn, "business");
    var biz = el("div", { "class": "card" });
    biz.appendChild(el("h2", null, "사업영역 (Business) - 헤더"));
    biz.appendChild(mirrorText("상단 라벨", b, bEn, "eyebrow"));
    biz.appendChild(dualText("제목", b, bEn, "title"));
    biz.appendChild(dualText("적용 예시 라벨", b, bEn, "exampleLabel"));
    host.appendChild(biz);

    host.appendChild(dualRepeat("사업영역 항목 (Business Items)", b.items || (b.items = []), enArrOf(bEn, "items"), function () {
      return { no: "", kr: "", sub: "", desc: "", tags: [] };
    }, function (item, itemEn, card) {
      card.appendChild(mirrorText("번호 (예: 01)", item, itemEn, "no"));
      card.appendChild(dualText("국문/영문 명칭", item, itemEn, "kr"));
      card.appendChild(dualText("부제목", item, itemEn, "sub"));
      card.appendChild(dualText("설명", item, itemEn, "desc", true));
      card.appendChild(dualCsv("적용 예시 태그 (쉼표로 구분)", item, itemEn, "tags"));
    }));

    // ===== 기술력 =====
    beginSection("tech", "⚙️", "기술력");

    // Technology
    var t = content.technology, tEn = enObjOf(t, contentEn, "technology");
    var tech = el("div", { "class": "card" });
    tech.appendChild(el("h2", null, "기술력 (Technology) - 헤더"));
    tech.appendChild(mirrorText("상단 라벨", t, tEn, "eyebrow"));
    tech.appendChild(dualText("제목 1줄", t, tEn, "titleLine1"));
    tech.appendChild(dualText("제목 2줄", t, tEn, "titleLine2"));
    tech.appendChild(dualText("설명", t, tEn, "description", true));
    host.appendChild(tech);

    host.appendChild(dualRepeat("기술 항목 (Technology Items)", t.items || (t.items = []), enArrOf(tEn, "items"), function () {
      return { no: "", title: "", spec: "", desc: "" };
    }, function (item, itemEn, card) {
      card.appendChild(mirrorText("번호 (예: 01)", item, itemEn, "no"));
      card.appendChild(dualText("제목", item, itemEn, "title"));
      card.appendChild(dualText("스펙 (예: · Rmax 0.15㎛)", item, itemEn, "spec"));
      card.appendChild(dualText("설명", item, itemEn, "desc", true));
    }));

    // 기술력 페이지 (서브페이지)
    var tp = content.techPage || (content.techPage = { titleEn: "TECHNOLOGY", subtitle: "", sections: [] });
    var tpEn = enObjOf(tp, contentEn, "techPage");
    var tpc = el("div", { "class": "card" });
    tpc.appendChild(el("h2", null, "기술력 페이지 (서브페이지) - 헤더"));
    tpc.appendChild(mirrorText("영문 제목", tp, tpEn, "titleEn"));
    tpc.appendChild(dualText("부제", tp, tpEn, "subtitle"));
    host.appendChild(tpc);

    host.appendChild(dualRepeat("기술력 섹션 (Tech Sections)", tp.sections || (tp.sections = []), enArrOf(tpEn, "sections"), function () {
      return { no: "", titleKr: "", titleEn: "", heading: "", desc: "", highlights: [] };
    }, function (item, itemEn, card) {
      card.appendChild(mirrorText("번호 (예: 01)", item, itemEn, "no"));
      card.appendChild(dualText("타이틀", item, itemEn, "titleKr"));
      card.appendChild(mirrorText("영문 타이틀", item, itemEn, "titleEn"));
      card.appendChild(dualText("헤딩 (강조 문장)", item, itemEn, "heading"));
      card.appendChild(dualText("설명", item, itemEn, "desc", true));
      card.appendChild(dualLines("하이라이트 (줄바꿈으로 여러 줄)", item, itemEn, "highlights"));
    }));

    // ===== 인증 · 오시는 길 =====
    beginSection("certloc", "🏅", "인증 · 오시는 길");

    // 인증 · 특허
    var cf = content.certifications || (content.certifications = { eyebrow: "CERTIFICATION & PATENT", title: "", items: [] });
    var cfEn = enObjOf(cf, contentEn, "certifications");
    var cfc = el("div", { "class": "card" });
    cfc.appendChild(el("h2", null, "인증 · 특허 (Certification) - 헤더"));
    cfc.appendChild(mirrorText("상단 라벨", cf, cfEn, "eyebrow"));
    cfc.appendChild(dualText("제목", cf, cfEn, "title"));
    host.appendChild(cfc);

    host.appendChild(dualRepeat("인증 · 특허 항목", cf.items || (cf.items = []), enArrOf(cfEn, "items"), function () {
      return { name: "", no: "", desc: "" };
    }, function (item, itemEn, card) {
      card.appendChild(dualText("명칭 (예: 특허증)", item, itemEn, "name"));
      card.appendChild(mirrorText("번호 (선택)", item, itemEn, "no"));
      card.appendChild(dualText("설명", item, itemEn, "desc"));
    }));

    // 오시는 길
    var lo = content.location || (content.location = { eyebrow: "LOCATION", title: "오시는 길", placeName: "" });
    var loEn = enObjOf(lo, contentEn, "location");
    var loc = el("div", { "class": "card" });
    loc.appendChild(el("h2", null, "오시는 길 (Location)"));
    loc.appendChild(mirrorText("상단 라벨", lo, loEn, "eyebrow"));
    loc.appendChild(dualText("제목", lo, loEn, "title"));
    loc.appendChild(dualText("장소명", lo, loEn, "placeName"));
    loc.appendChild(el("div", { "class": "hint" }, "주소·전화는 상단 '기업 정보' 값을 사용합니다."));
    host.appendChild(loc);

    // ===== 문의 · CTA =====
    beginSection("contact", "✉️", "문의 · CTA");

    // 문의하기 페이지
    var cp = content.contactPage || (content.contactPage = { hours: [] });
    var cpEn = enObjOf(cp, contentEn, "contactPage");
    var cpc = el("div", { "class": "card" });
    cpc.appendChild(el("h2", null, "문의하기 페이지 (Contact)"));
    cpc.appendChild(mirrorText("영문 제목", cp, cpEn, "titleEn"));
    cpc.appendChild(dualText("부제", cp, cpEn, "subtitle"));
    cpc.appendChild(dualText("폼 제목", cp, cpEn, "formTitle"));
    cpc.appendChild(dualText("제출 버튼 텍스트", cp, cpEn, "submit"));
    cpc.appendChild(dualText("개인정보 동의 문구", cp, cpEn, "privacy"));
    cpc.appendChild(dualText("약관 링크 텍스트", cp, cpEn, "privacyLink"));
    cpc.appendChild(dualText("Direct 카드 제목", cp, cpEn, "directTitle"));
    cpc.appendChild(dualText("운영시간 라벨", cp, cpEn, "hoursLabel"));
    cpc.appendChild(dualLines("운영시간 (줄바꿈으로 여러 줄)", cp, cpEn, "hours"));
    host.appendChild(cpc);

    // CTA
    var ct = content.cta, ctEn = enObjOf(ct, contentEn, "cta");
    var cta = el("div", { "class": "card" });
    cta.appendChild(el("h2", null, "문의 유도 (CTA)"));
    cta.appendChild(mirrorText("상단 라벨", ct, ctEn, "eyebrow"));
    cta.appendChild(dualText("제목", ct, ctEn, "title"));
    cta.appendChild(dualText("서브타이틀", ct, ctEn, "subtitle"));
    cta.appendChild(dualText("버튼1 텍스트", ct, ctEn, "primaryCta"));
    cta.appendChild(dualText("버튼2 텍스트", ct, ctEn, "secondaryCta"));
    var ctg = el("div", { "class": "grid2" });
    ctg.appendChild(mirrorText("전화", ct, ctEn, "tel"));
    ctg.appendChild(mirrorText("이메일", ct, ctEn, "email"));
    cta.appendChild(ctg);
    host.appendChild(cta);

    // ===== 커뮤니티 =====
    beginSection("community", "📰", "커뮤니티");

    // 커뮤니티
    var cm = content.community || (content.community = { titleEn: "COMMUNITY", subtitle: "", intro: "", items: [] });
    var cmEn = enObjOf(cm, contentEn, "community");
    var cmCard = el("div", { "class": "card" });
    cmCard.appendChild(el("h2", null, "커뮤니티 (Community) - 헤더"));
    cmCard.appendChild(mirrorText("영문 제목 (예: COMMUNITY)", cm, cmEn, "titleEn"));
    cmCard.appendChild(dualText("부제", cm, cmEn, "subtitle"));
    cmCard.appendChild(dualText("소개 문구", cm, cmEn, "intro", true));
    host.appendChild(cmCard);

    host.appendChild(dualRepeat("커뮤니티 게시물 (뉴스 · 회사소식 · 전시회)", cm.items || (cm.items = []), enArrOf(cmEn, "items"), function () {
      return { year: "", title: "", photo: "", desc: "" };
    }, function (item, itemEn, card) {
      card.appendChild(mirrorText("연도 (예: 2025)", item, itemEn, "year"));
      card.appendChild(dualText("제목 (행사·전시회명)", item, itemEn, "title"));
      card.appendChild(dualImage("사진", item, itemEn, "photo", "images"));
      card.appendChild(dualText("설명", item, itemEn, "desc", true));
    }));

    // ===== 좌측 탭(사이드바) 생성 =====
    var nav = $("#sidenav");
    nav.innerHTML = "";
    nav.appendChild(el("div", { "class": "navtitle" }, "항목별 관리"));
    navItems.forEach(function (it) {
      var a = el("a", { "data-target": it.id, href: "javascript:void(0)" },
        "<span class='ic'>" + it.icon + "</span><span>" + esc(it.label) + "</span>");
      a.addEventListener("click", function () { activateSection(it.id); });
      nav.appendChild(a);
    });
    if (navItems.length) activateSection(navItems[0].id);
  }

  // ---------- save ----------
  function postJson(path, obj) {
    return api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj, null, 2)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }

  function save() {
    var msg = $("#saveMsg");
    msg.className = "msg"; msg.textContent = "저장 중...";
    $("#saveBtn").disabled = true;

    function failText(res) {
      if (res.j && res.j.error === "unauthorized") return "세션이 만료되었습니다. 다시 로그인하세요.";
      return "저장 실패: " + ((res.j && res.j.error) || "");
    }

    // 베트남어 → 영문 순으로 저장. 영문이 없으면 베트남어만 저장한다.
    postJson("/api/save", content)
      .then(function (res) {
        if (!(res.ok && res.j.ok)) throw new Error(failText(res));
        if (!contentEn) return null;
        return postJson("/api/save-en", contentEn).then(function (resEn) {
          if (!(resEn.ok && resEn.j.ok)) throw new Error("영문 " + failText(resEn));
          return resEn;
        });
      })
      .then(function (resEn) {
        $("#saveBtn").disabled = false;
        msg.className = "msg ok";
        msg.textContent = resEn
          ? "저장되었습니다. (content.json + content_en.json)"
          : "베트남어만 저장되었습니다. (영문 데이터 없음)";
      })
      .catch(function (e) {
        $("#saveBtn").disabled = false;
        msg.className = "msg err";
        msg.textContent = (e && e.message) ? e.message : "저장 실패 (서버 연결 오류)";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("#loginBtn").addEventListener("click", doLogin);
    $("#pw").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("#logoutBtn").addEventListener("click", logout);
    $("#saveBtn").addEventListener("click", save);
    $("#reloadBtn").addEventListener("click", function () { $("#saveMsg").textContent = ""; loadContent(); });
    if (token()) showApp();
  });
})();
