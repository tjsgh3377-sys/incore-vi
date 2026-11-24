/* 준성테크 사이트 렌더러 (멀티 페이지)
 * content.json을 읽어 공통 헤더/푸터 + 현재 페이지 섹션을 그린다.
 * 페이지 구분: <body data-page="home|about|business|products|technology|contact">
 * 관리자 페이지(admin.html)에서 content.json을 수정하면 새로고침 시 반영된다.
 * 스크롤 시 .reveal 요소가 IntersectionObserver로 페이드업된다.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function nl2br(s) { return esc(s).replace(/\n/g, "<br>"); }
  // 제품명 포인트 색상: it.mute(검정으로 남길 구간)를 제외한 나머지를 민트로 표시.
  // mute가 중간에 있으면 앞·뒤 두 구간이 모두 민트가 된다. mute="" 이면 전체 민트.
  function accentTitle(it) {
    var t = String(it.title == null ? "" : it.title);
    if (it.mute == null) return esc(t);
    var m = String(it.mute), ac = "prow__title-ac";
    if (m === "") return '<span class="' + ac + '">' + esc(t) + "</span>";
    var i = t.indexOf(m);
    if (i < 0) return '<span class="' + ac + '">' + esc(t) + "</span>";
    var pre = t.slice(0, i), post = t.slice(i + m.length);
    return (pre ? '<span class="' + ac + '">' + esc(pre) + "</span>" : "") +
      esc(m) +
      (post ? '<span class="' + ac + '">' + esc(post) + "</span>" : "");
  }
  // 순차 등장용 delay 인덱스
  function rev(i) { return ' class="reveal"' + (i ? ' style="--d:' + (i * 80) + 'ms"' : ""); }

  // ---------- 다국어(베트남어/영문) ----------
  // ?lang=en|vi 쿼리 → localStorage(icLang) → 기본 vi
  function getLang() {
    var m = /[?&]lang=(en|vi)/i.exec(window.location.search);
    var lang = m ? m[1].toLowerCase() : null;
    try {
      if (lang) localStorage.setItem("icLang", lang);
      else lang = localStorage.getItem("icLang");
    } catch (e) {}
    return lang === "en" ? "en" : "vi";
  }
  var LANG = getLang();
  // 하드코딩 UI 문구 사전
  var UI = {
    vi: {
      menuAria: "Menu", mapView: "Xem trên bản đồ",
      viewProducts: "Xem sản phẩm →", contactUs: "Liên hệ →",
      imgPreparing: "Hình ảnh đang cập nhật", noNews: "Chưa có tin tức nào.",
      formNeed: "Vui lòng nhập họ tên, email và nội dung liên hệ.",
      formAgree: "Vui lòng đồng ý với việc thu thập và sử dụng thông tin cá nhân.",
      mailSubject: "[Liên hệ từ website] ", mailName: "Họ tên: ", mailCompany: "Công ty: ",
      mailEmail: "Email: ", mailPhone: "Điện thoại: ", mailBody: "Nội dung:",
      loadFail: "Không tải được nội dung. Vui lòng chạy site qua serve.ps1."
    },
    en: {
      menuAria: "Menu", mapView: "View on Map",
      viewProducts: "View Products →", contactUs: "Contact Us →",
      imgPreparing: "Image coming soon", noNews: "No news posted yet.",
      formNeed: "Please enter your name, email and message.",
      formAgree: "Please agree to the collection and use of your personal information.",
      mailSubject: "[Website Inquiry] ", mailName: "Name: ", mailCompany: "Company: ",
      mailEmail: "Email: ", mailPhone: "Phone: ", mailBody: "Message:",
      loadFail: "Failed to load content. Please run the site through serve.ps1."
    }
  };
  var T = UI[LANG] || UI.vi;
  var TITLES = {
    vi: {
      home: "Công nghệ lõi đổi mới cho thiết bị y tế", about: "Giới thiệu công ty",
      cert: "Chứng nhận", location: "Địa chỉ", business: "Lĩnh vực kinh doanh",
      products: "Sản phẩm", technology: "Công nghệ & R&D", community: "Tin tức",
      contact: "Liên hệ"
    },
    en: {
      home: "Innovative Core Technologies of Medical Devices", about: "About INCORE",
      cert: "Certification", location: "Location", business: "Business Areas",
      products: "Products", technology: "Technology & R&D", community: "News",
      contact: "Contact"
    }
  };
  // 현재 페이지 파일명 (언어 전환 링크용)
  function currentPageFile() {
    var p = (window.location.pathname || "").split("/").pop();
    return p && p.indexOf(".html") !== -1 ? p : "index.html";
  }
  function langHref(lang) {
    return currentPageFile() + "?lang=" + lang + (window.location.hash || "");
  }
  // 영문일 때 내부 .html 링크에 ?lang=en 부여 (이미 쿼리가 있는 링크는 제외)
  function localizeLinks(html) {
    if (LANG !== "en") return html;
    return html.replace(/href="([^"?]+?\.html)(#[^"]*)?"/g, function (m, file, hash) {
      return 'href="' + file + "?lang=en" + (hash || "") + '"';
    });
  }

  // nav target -> 서브페이지 파일
  var HREF = {
    about: "about.html",
    cert: "cert.html",
    location: "location.html",
    business: "business.html",
    products: "products.html",
    technology: "technology.html",
    community: "community.html",
    cta: "contact.html"
  };
  // data-page -> 활성 표시할 nav target
  var PAGE_TARGET = {
    about: "about", cert: "cert", location: "location", business: "business",
    products: "products", technology: "technology", community: "community", contact: "cta"
  };
  // 회사소개 그룹(대카테고리) 하위 타깃
  var ABOUT_GROUP = ["about", "cert", "location"];

  function loadContent() {
    var file = LANG === "en" ? "content_en.json" : "content.json";
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", file + "?_=" + Date.now(), false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) return JSON.parse(xhr.responseText);
    } catch (e) {
      if (window.console) console.error(file + " 로드 실패", e);
    }
    return null;
  }

  function header(c, page) {
    var activeTarget = PAGE_TARGET[page] || "";
    function link(target, label, cls, cpath) {
      var href = HREF[target] || ("index.html#" + target);
      return '<a href="' + esc(href) + '"' + (cls ? ' class="' + cls + '"' : "") +
        (cpath ? ' data-cpath="' + esc(cpath) + '"' : "") + ">" + esc(label) + "</a>";
    }
    var menu = (c.nav || []).map(function (n, ni) {
      if (n.children && n.children.length) {
        var groupActive = ABOUT_GROUP.indexOf(activeTarget) !== -1;
        var subs = n.children.map(function (s, si) {
          return link(s.target, s.label, s.target === activeTarget ? "is-active" : "", "nav[" + ni + "].children[" + si + "]");
        }).join("");
        return '<div class="gnb__item gnb__item--sub">' +
          link(n.target, n.label, groupActive ? "is-active" : "", "nav[" + ni + "]") +
          '<div class="gnb__sub">' + subs + "</div>" +
        "</div>";
      }
      return link(n.target, n.label, n.target === activeTarget ? "is-active" : "", "nav[" + ni + "]");
    }).join("");
    return '' +
      '<header class="gnb"><div class="gnb__inner">' +
        '<a href="index.html" class="gnb__brand"><img class="gnb__logo" data-cpath="images" src="' + esc(c.images.logo) + '" alt="' + esc(c.company.nameKr) + '"></a>' +
        '<nav class="gnb__menu" id="gnbMenu">' + menu + "</nav>" +
        '<div class="gnb__right">' +
          '<span class="gnb__lang">' +
            '<a href="' + esc(langHref("vi")) + '"' + (LANG !== "en" ? ' class="is-active"' : "") + ">VI</a>" +
            '<span class="gnb__langsep">|</span>' +
            '<a href="' + esc(langHref("en")) + '"' + (LANG === "en" ? ' class="is-active"' : "") + ">EN</a>" +
          "</span>" +
          '<button class="gnb__burger" id="gnbBurger" aria-label="' + esc(T.menuAria) + '">☰</button>' +
        "</div>" +
      "</div></header>";
  }

  // 라이트 페이지 히어로 (영문 대제목 + 한글 부제)
  function banner(titleEn, subtitleKr) {
    return '' +
      '<section class="pagehero">' +
        '<div class="pagehero__bg"></div>' +
        '<div class="wrap pagehero__inner">' +
          '<h1 class="pagehero__title reveal">' + esc(titleEn) + "</h1>" +
          '<p class="pagehero__sub reveal" style="--d:120ms">' + esc(subtitleKr) + "</p>" +
        "</div>" +
      "</section>";
  }

  function hero(c) {
    var h = c.hero;
    var bg = c.images.heroVideo
      ? '<video class="hero__bg" autoplay muted loop playsinline preload="auto" poster="' + esc(c.images.hero) + '"><source src="' + esc(c.images.heroVideo) + '" type="video/mp4"></video>'
      : '<img class="hero__bg" src="' + esc(c.images.hero) + '" alt="">';
    return '' +
      '<section class="hero" id="top" data-cpath="hero">' +
        bg +
        '<div class="hero__inner"><div class="hero__content">' +
          '<div class="hero__badge reveal">' + '<span></span><p>' + esc(h.badge) + "</p></div>" +
          '<h1 class="hero__title reveal" style="--d:90ms">' + esc(h.titleLine1) + "<br>" + esc(h.titleLine2) + "</h1>" +
          '<p class="hero__subtitle reveal" style="--d:200ms">' + esc(h.subtitle) + "</p>" +
          '<p class="hero__desc reveal" style="--d:300ms">' + nl2br(h.description) + "</p>" +
          '<div class="hero__ctas reveal" style="--d:400ms">' +
            '<a href="products.html" class="btn btn--fill">' + esc(h.primaryCta) + "</a>" +
            '<a href="contact.html" class="btn btn--line">' + esc(h.secondaryCta) + "</a>" +
          "</div>" +
        "</div></div>" +
      "</section>";
  }

  function about(c) {
    var a = c.about;
    var paras = (a.paragraphs || []).map(function (p) { return "<p>" + nl2br(p) + "</p>"; }).join("");
    var strengths = (a.strengths || []).map(function (s, i) {
      return '' +
        '<div class="strength" data-cpath="about.strengths[' + i + ']"' + (i ? ' style="--d:' + (i * 80) + 'ms"' : "") + ">" +
          '<div class="strength__icon">' + esc(s.icon) + "</div>" +
          "<div><div class=\"strength__en\">" + esc(s.en) + "</div>" +
          '<div class="strength__kr">' + esc(s.kr) + "</div></div>" +
        "</div>";
    }).join("");
    return '' +
      '<section class="about" id="about" data-cpath="about"><div class="wrap"><div class="about__grid">' +
        '<div class="reveal reveal--left">' +
          '<div class="about__eyebrow">' + esc(a.eyebrow) + "</div>" +
          '<h2 class="about__title">' + esc(a.titleLine1) + '<br><span class="accent">' + esc(a.titleLine2) + "</span></h2>" +
        "</div>" +
        '<div class="about__text reveal reveal--left" style="--d:80ms">' + paras +
          '<div class="about__sign"><span class="label">' + esc(a.ceoLabel) + '</span><span class="name">' + esc(a.ceoName) + "</span></div>" +
        "</div>" +
        '<div class="about__strengths reveal reveal--right" style="--d:120ms">' + strengths + "</div>" +
      "</div></div></section>";
  }

  // 홈 화면용 제품 티저 (카테고리 카드 → products.html#id)
  function products(c, opts) {
    opts = opts || {};
    var p = c.products;
    var cats = p.categories || [];
    var cards = cats.map(function (cat, i) {
      var img = cat.image ? '<img class="card__img" src="' + esc(cat.image) + '" alt="" loading="lazy">' : "";
      return '' +
        '<a class="card reveal reveal--scale" href="products.html#' + esc(cat.id) + '"' + (i ? ' style="--d:' + (i % 3 * 80) + 'ms"' : "") + ">" +
          img +
          '<div class="card__no"><span class="num">' + (i + 1 < 10 ? "0" : "") + (i + 1) + '</span><span class="bar"></span></div>' +
          '<h3 class="card__en">' + esc(cat.tab) + "</h3>" +
          '<div class="card__kr">' + esc(cat.kr) + "</div>" +
          '<p class="card__desc">' + esc(cat.desc) + "</p>" +
        "</a>";
    }).join("");
    var head = opts.hideHead ? "" :
      '<div class="section__head reveal">' +
        '<div class="eyebrow">' + esc(p.eyebrow) + "</div>" +
        '<h2 class="section__title">' + esc(p.title) + "</h2>" +
        '<p class="section__sub">' + esc(p.subtitle) + "</p>" +
      "</div>";
    var more = opts.hideMore ? "" :
      '<div class="products__more reveal"><a href="products.html">' + esc(p.moreLabel) + "</a></div>";
    return '' +
      '<section class="section products" id="products"><div class="wrap">' +
        head +
        '<div class="cards">' + cards + "</div>" +
        more +
      "</div></section>";
  }

  // 제품소개 전용 페이지 (카테고리 탭 + 제품 리스트 + CTA)
  function productsPage(c) {
    var p = c.products;
    var cats = p.categories || [];
    var featLabel = p.featuresLabel || "FEATURES";

    var tabs = cats.map(function (cat, i) {
      return '<button type="button" class="ptab' + (i === 0 ? " is-active" : "") +
        '" data-cat="' + esc(cat.id) + '">' + esc(cat.tab) + "</button>";
    }).join("");

    var panels = cats.map(function (cat, ci) {
      var rows = (cat.items || []).map(function (it, i) {
        var groups = (it.features || []).map(function (g) {
          var lines = (g.lines || []).map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("");
          return '' +
            '<div class="prow__feat">' +
              '<span class="prow__tag">' + esc(g.tag) + "</span>" +
              '<ul class="prow__lines">' + lines + "</ul>" +
            "</div>";
        }).join("");
        var img = it.image ? '<img src="' + esc(it.image) + '" alt="">' : "";
        return '' +
          '<article class="prow reveal reveal--left" data-cpath="products.categories[' + ci + '].items[' + i + ']"' + (i ? ' style="--d:60ms"' : "") + ">" +
            '<div class="prow__media">' + img + "</div>" +
            '<div class="prow__body">' +
              '<div class="prow__no num">' + esc(it.no) + "</div>" +
              '<h3 class="prow__title">' + accentTitle(it) + "</h3>" +
              '<div class="prow__featlabel">' + esc(featLabel) + "</div>" +
              '<div class="prow__feats">' + groups + "</div>" +
            "</div>" +
          "</article>";
      }).join("");
      return '' +
        '<div class="ppanel' + (ci === 0 ? " is-active" : "") + '" id="cat-' + esc(cat.id) + '" data-cat="' + esc(cat.id) + '" data-cpath="products.categories[' + ci + ']">' +
          '<div class="ppanel__head reveal">' +
            '<h2 class="ppanel__title">' + esc(cat.title) + "</h2>" +
            '<p class="ppanel__desc">' + esc(cat.desc) + "</p>" +
          "</div>" +
          '<div class="prows">' + rows + "</div>" +
        "</div>";
    }).join("");

    var cta =
      '<section class="prodcta"><div class="wrap reveal">' +
        '<h2 class="prodcta__title">' + esc(p.ctaTitle || "") + "</h2>" +
        '<p class="prodcta__sub">' + esc(p.ctaDesc || "") + "</p>" +
        '<a href="contact.html" class="btn btn--white">' + esc(p.ctaBtn || "Liên hệ →") + "</a>" +
      "</div></section>";

    return banner(p.titleEn || "PRODUCTS", p.subtitle || "") +
      '<section class="section productspage"><div class="wrap">' +
        '<div class="ptabs">' + tabs + "</div>" +
        '<div class="ppanels">' + panels + "</div>" +
      "</div></section>" +
      cta;
  }

  function business(c, opts) {
    opts = opts || {};
    var b = c.business;
    var exLabel = b.exampleLabel || "Ứng dụng";
    var items = (b.items || []).map(function (it, i) {
      var tags = (it.tags || []).map(function (t) {
        return '<span class="bizcard__chip">' + esc(t) + "</span>";
      }).join("");
      var sub = it.sub ? '<div class="bizcard__sub">' + esc(it.sub) + "</div>" : "";
      var ex = (it.tags && it.tags.length) ?
        '<div class="bizcard__exlabel">' + esc(exLabel) + "</div>" +
        '<div class="bizcard__chips">' + tags + "</div>" : "";
      return '' +
        '<article class="bizcard reveal reveal--scale" data-cpath="business.items[' + i + ']"' + (i ? ' style="--d:' + (i % 2 * 90) + 'ms"' : "") + ">" +
          '<div class="bizcard__no num">' + esc(it.no) + "</div>" +
          '<h3 class="bizcard__title">' + esc(it.kr) + "</h3>" +
          sub +
          '<p class="bizcard__desc">' + esc(it.desc) + "</p>" +
          ex +
        "</article>";
    }).join("");
    var head = opts.hideHead ? "" :
      '<div class="section__head reveal">' +
        '<div class="eyebrow">' + esc(b.eyebrow) + "</div>" +
        '<h2 class="section__title">' + esc(b.title) + "</h2>" +
      "</div>";
    return '' +
      '<section class="section business" id="business" data-cpath="business"><div class="wrap">' +
        head +
        '<div class="bizgrid">' + items + "</div>" +
      "</div></section>";
  }

  // 홈 화면용 기술 티저
  function technology(c, opts) {
    opts = opts || {};
    var t = c.technology;
    var rows = (t.items || []).map(function (it, i) {
      return '' +
        '<div class="tech__row" data-cpath="technology.items[' + i + ']">' +
          '<div class="tech__rowno num">' + esc(it.no) + "</div>" +
          "<div><div class=\"tech__rowhead\">" +
            '<span class="tech__rowtitle">' + esc(it.title) + "</span>" +
            '<span class="tech__rowspec">' + esc(it.spec) + "</span>" +
          "</div>" +
          '<p class="tech__rowdesc">' + esc(it.desc) + "</p></div>" +
        "</div>";
    }).join("");
    var headBlock =
      "<div>" +
        '<div class="tech__eyebrow">' + esc(t.eyebrow) + "</div>" +
        '<h2 class="tech__title">' + esc(t.titleLine1) + "\n" + esc(t.titleLine2) + "</h2>" +
        '<p class="tech__desc">' + nl2br(t.description) + "</p>" +
      "</div>" +
      '<div class="tech__list">' + rows + "</div>";
    return '' +
      '<section class="tech" id="technology" data-cpath="technology">' +
        '<img class="tech__bg" src="' + esc(c.images.tech) + '" alt="">' +
        '<div class="tech__inner reveal">' + headBlock + "</div>" +
      "</section>";
  }

  // 기술력 전용 페이지 (3개 섹션: 좌측 번호/타이틀 + 우측 설명/하이라이트)
  function techPage(c) {
    var tp = c.techPage || {};
    var sections = (tp.sections || []).map(function (s, i) {
      var hl = (s.highlights || []).map(function (h) {
        return '<div class="techsec__hl">' + esc(h) + "</div>";
      }).join("");
      return '' +
        '<div class="techsec reveal" data-cpath="techPage.sections[' + i + ']"' + (i ? ' style="--d:60ms"' : "") + ">" +
          '<div class="techsec__left">' +
            '<div class="techsec__no num">' + esc(s.no) + "</div>" +
            '<div class="techsec__divider"></div>' +
            '<div class="techsec__kr">' + esc(s.titleKr) + "</div>" +
            '<div class="techsec__en">' + esc(s.titleEn) + "</div>" +
          "</div>" +
          '<div class="techsec__right">' +
            '<h3 class="techsec__heading">' + esc(s.heading) + "</h3>" +
            '<p class="techsec__desc">' + esc(s.desc) + "</p>" +
            '<div class="techsec__hls">' + hl + "</div>" +
          "</div>" +
        "</div>";
    }).join("");
    return banner(tp.titleEn || "TECHNOLOGY", tp.subtitle || "") +
      '<section class="section techpage"><div class="wrap">' +
        '<div class="techsecs">' + sections + "</div>" +
      "</div></section>";
  }

  // 회사소개 전용 페이지
  function aboutPage(c) {
    var a = c.about;
    // 인트로 히어로 + 핵심가치 다이어그램
    var paras = (a.paragraphs || []).slice(0, 2).map(function (p) { return "<p>" + nl2br(p) + "</p>"; }).join("");
    // 다이어그램 카드: 아이콘 + 영문 + 한글 부제 (strengths 데이터 사용)
    var nodes = (a.strengths || a.coreValues || []).map(function (s, i) {
      return '<div class="cvdiag__node cvdiag__node--' + (i + 1) + '" data-cpath="about.strengths[' + i + ']">' +
        '<span class="cvdiag__ico">' + esc(s.icon) + "</span>" +
        '<span class="cvdiag__txt"><b>' + esc(s.en) + "</b><i>" + esc(s.kr) + "</i></span>" +
      "</div>";
    }).join("");
    var intro =
      '<section class="abouthero" data-cpath="about"><div class="wrap abouthero__grid">' +
        '<div class="abouthero__text reveal reveal--left">' +
          '<div class="abouthero__eyebrow">' + esc(a.eyebrow) + "</div>" +
          '<h2 class="abouthero__title">' + esc(a.titleLine1) + '<br><span class="accent">' + esc(a.titleLine2) + "</span></h2>" +
          '<div class="abouthero__paras">' + paras + "</div>" +
          '<div class="abouthero__ctas">' +
            '<a href="products.html" class="btn btn--fill">' + esc(T.viewProducts) + "</a>" +
            '<a href="contact.html" class="btn btn--line">' + esc(T.contactUs) + "</a>" +
          "</div>" +
        "</div>" +
        '<div class="abouthero__diag reveal reveal--right" style="--d:120ms"><div class="cvdiag">' +
          '<svg class="cvdiag__svg" viewBox="0 0 580 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
            '<path class="cvdiag__arc" d="M156 4 C 30 150, 30 410, 210 556"/>' +
            '<line class="cvdiag__link" x1="266" y1="288" x2="316" y2="280"/>' +
            '<path class="cvdiag__link" d="M300 130 Q 356 158 372 196"/>' +
            '<path class="cvdiag__link" d="M306 452 Q 356 414 372 356"/>' +
          "</svg>" +
          '<div class="cvdiag__center">' +
            '<span class="cvdiag__tech">TECH</span>' +
            '<span class="cvdiag__brand">JUN SUNG</span>' +
            '<span class="cvdiag__cv">CORE VALUE</span>' +
          "</div>" +
          nodes +
        "</div></div>" +
      "</div></section>";

    // 핵심 가치 카드
    var cvCards = (a.coreValues || []).map(function (v, i) {
      return '<article class="cvcard reveal reveal--scale" data-cpath="about.coreValues[' + i + ']"' + (i ? ' style="--d:' + (i * 80) + 'ms"' : "") + ">" +
        '<div class="cvcard__icon">' + esc(v.icon) + "</div>" +
        '<div class="cvcard__en">' + esc(v.en) + "</div>" +
        '<div class="cvcard__kr">' + esc(v.kr) + "</div>" +
        '<p class="cvcard__desc">' + esc(v.desc) + "</p>" +
      "</article>";
    }).join("");
    var coreValue =
      '<section class="section corevalue"><div class="wrap">' +
        '<div class="section__head reveal">' +
          '<div class="eyebrow">' + esc(a.coreValueEyebrow || "CORE VALUE") + "</div>" +
          '<h2 class="section__title">' + esc(a.coreValueTitle || "Giá trị cốt lõi") + "</h2>" +
        "</div>" +
        '<div class="cvgrid">' + cvCards + "</div>" +
      "</div></section>";

    // 연혁
    var histRows = (a.history || []).map(function (h, i) {
      var ev = (h.events || []).map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("");
      return '<div class="histrow reveal reveal--left" data-cpath="about.history[' + i + ']"' + (i ? ' style="--d:' + (i * 70) + 'ms"' : "") + ">" +
        '<div class="histrow__year num">' + esc(h.year) + "</div>" +
        '<ul class="histrow__events">' + ev + "</ul>" +
      "</div>";
    }).join("");
    var history =
      '<section class="section history"><div class="wrap">' +
        '<div class="section__head reveal">' +
          '<div class="eyebrow">' + esc(a.historyEyebrow || "HISTORY") + "</div>" +
          '<h2 class="section__title">' + esc(a.historyTitle || "") + "</h2>" +
        "</div>" +
        '<div class="histlist">' + histRows + "</div>" +
      "</div></section>";

    // 핵심 부품
    var kpCards = (a.keyProducts || []).map(function (p, i) {
      var feats = (p.features || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("");
      return '<article class="kpcard reveal reveal--scale" data-cpath="about.keyProducts[' + i + ']"' + (i ? ' style="--d:' + (i * 90) + 'ms"' : "") + ">" +
        '<div class="kpcard__badge">' + esc(p.badge) + "</div>" +
        '<div class="kpcard__en">' + esc(p.en) + "</div>" +
        '<div class="kpcard__kr">' + esc(p.kr) + "</div>" +
        '<ul class="kpcard__feats">' + feats + "</ul>" +
      "</article>";
    }).join("");
    var keyProducts =
      '<section class="section keyproducts"><div class="wrap">' +
        '<div class="section__head reveal">' +
          '<div class="eyebrow">' + esc(a.keyProductsEyebrow || "PRODUCTS") + "</div>" +
          '<h2 class="section__title">' + esc(a.keyProductsTitle || "Sản phẩm chủ lực") + "</h2>" +
        "</div>" +
        '<div class="kpgrid">' + kpCards + "</div>" +
      "</div></section>";

    return intro + coreValue + history + keyProducts + aboutCta(c);
  }

  function certifications(c) {
    var ct = c.certifications;
    if (!ct) return "";
    var cards = (ct.items || []).map(function (it, i) {
      var no = it.no ? '<div class="certcard__no">' + esc(it.no) + "</div>" : "";
      var media = it.image
        ? '<div class="certcard__media"><img src="' + esc(it.image) + '" alt="' + esc(it.name) + " " + esc(it.no) + '" loading="lazy"></div>'
        : '<div class="certcard__badge">◈</div>';
      return '<article class="certcard reveal reveal--scale" data-cpath="certifications.items[' + i + ']"' + (i ? ' style="--d:' + (i % 4 * 70) + 'ms"' : "") + ">" +
        media +
        '<div class="certcard__name">' + esc(it.name) + "</div>" +
        no +
        '<p class="certcard__desc">' + esc(it.desc) + "</p>" +
      "</article>";
    }).join("");
    return '' +
      '<section class="section certs" data-cpath="certifications"><div class="wrap">' +
        '<div class="section__head reveal">' +
          '<div class="eyebrow">' + esc(ct.eyebrow) + "</div>" +
          '<h2 class="section__title">' + esc(ct.title) + "</h2>" +
        "</div>" +
        '<div class="certgrid">' + cards + "</div>" +
      "</div></section>";
  }

  function location(c) {
    var lo = c.location;
    if (!lo) return "";
    var co = c.company;
    var q = encodeURIComponent(co.address || lo.placeName || "");
    return '' +
      '<section class="section loc" data-cpath="location"><div class="wrap">' +
        '<div class="section__head reveal">' +
          '<div class="eyebrow">' + esc(lo.eyebrow) + "</div>" +
          '<h2 class="section__title">' + esc(lo.title) + "</h2>" +
        "</div>" +
        '<a class="loc__map reveal" href="https://www.google.com/maps/search/?api=1&query=' + q + '" target="_blank" rel="noopener">' +
          '<span class="loc__pin">◉</span>' +
          '<span class="loc__maptext">' + esc(T.mapView) + "</span>" +
        "</a>" +
        '<div class="loc__info reveal">' +
          '<div class="loc__name">' + esc(lo.placeName || co.nameKr) + "</div>" +
          '<div class="loc__addr">' + esc(co.address) + "</div>" +
          '<div class="loc__contact"><span>TEL ' + esc(co.tel) + "</span><span>FAX " + esc(co.fax) + "</span><span>" + esc(co.email1) + "</span></div>" +
        "</div>" +
      "</div></section>";
  }

  function aboutCta(c) {
    var a = c.about;
    return '' +
      '<section class="aboutcta"><div class="wrap reveal">' +
        '<h2 class="aboutcta__title" data-cpath="about.aboutCtaTitle">' + esc(a.aboutCtaTitle || "") + "</h2>" +
        '<p class="aboutcta__sub" data-cpath="about.aboutCtaSubtitle">' + esc(a.aboutCtaSubtitle || "") + "</p>" +
        '<div class="aboutcta__btns">' +
          '<a href="contact.html" class="btn btn--white">' + esc(T.contactUs) + "</a>" +
          '<a href="products.html" class="btn btn--ghost">' + esc(T.viewProducts) + "</a>" +
        "</div>" +
      "</div></section>";
  }

  function cta(c) {
    var t = c.cta;
    return '' +
      '<section class="cta" id="cta" data-cpath="cta"><div class="wrap reveal">' +
        '<div class="cta__eyebrow">' + esc(t.eyebrow) + "</div>" +
        '<h2 class="cta__title">' + esc(t.title) + "</h2>" +
        '<p class="cta__sub">' + esc(t.subtitle) + "</p>" +
        '<div class="cta__btns">' +
          '<a href="contact.html" class="btn btn--fill">' + esc(t.primaryCta) + "</a>" +
          '<a href="assets/catalog.pdf" class="btn btn--line" target="_blank" rel="noopener">' + esc(t.secondaryCta) + "</a>" +
        "</div>" +
        '<div class="cta__contact">' +
          "<span>TEL " + esc(t.tel) + "</span>" +
          '<span class="sep">|</span>' +
          "<span>" + esc(t.email) + "</span>" +
        "</div>" +
      "</div></section>";
  }

  // 문의하기 전용 페이지 (폼 + 다이렉트 컨택 카드)
  function contactPage(c) {
    var cp = c.contactPage || {};
    var f = cp.fields || {};
    var co = c.company;
    function field(key, type, full) {
      var fd = f[key] || {};
      var input = type === "textarea"
        ? '<textarea id="cf_' + key + '" rows="5" placeholder="' + esc(fd.placeholder) + '"></textarea>'
        : '<input id="cf_' + key + '" type="' + (type || "text") + '" placeholder="' + esc(fd.placeholder) + '">';
      return '<div class="cform__field' + (full ? " cform__field--full" : "") + '" data-cpath="contactPage.fields.' + key + '">' +
        '<label for="cf_' + key + '">' + esc(fd.label) + ' <i>*</i></label>' + input + "</div>";
    }
    var hours = (cp.hours || []).map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("");
    var form =
      '<div class="cform reveal">' +
        '<h2 class="cform__title">' + esc(cp.formTitle || "Gửi yêu cầu") + "</h2>" +
        '<div class="cform__row">' + field("name") + field("company") + "</div>" +
        '<div class="cform__row">' + field("email", "email") + field("phone", "tel") + "</div>" +
        field("message", "textarea", true) +
        '<label class="cform__agree"><input type="checkbox" id="cf_agree"><span>' + esc(cp.privacy) + '</span> <a href="#" class="cform__agreelink">' + esc(cp.privacyLink || "") + "</a></label>" +
        '<button type="button" class="cform__submit" id="cf_submit">' + esc(cp.submit || "Gửi liên hệ →") + "</button>" +
      "</div>";
    var direct =
      '<aside class="cdirect reveal" style="--d:120ms">' +
        '<div class="cdirect__title">' + esc(cp.directTitle || "DIRECT CONTACT") + "</div>" +
        '<a class="cdirect__item" href="tel:' + esc(co.tel) + '"><span class="cdirect__ico">✆</span><span><i>TEL</i><b>' + esc(co.tel) + "</b></span></a>" +
        '<a class="cdirect__item" href="mailto:' + esc(co.email1) + '"><span class="cdirect__ico">✉</span><span><i>EMAIL</i><b>' + esc(co.email1) + "</b></span></a>" +
        '<div class="cdirect__hours"><div class="cdirect__hourslabel">' + esc(cp.hoursLabel || "Giờ làm việc") + '</div><ul>' + hours + "</ul></div>" +
      "</aside>";
    return banner(cp.titleEn || "CONTACT US", cp.subtitle || "Liên hệ") +
      '<section class="section contactpage" data-cpath="contactPage"><div class="wrap contactpage__grid">' + form + direct + "</div></section>";
  }

  // 커뮤니티: 사진 + 년도 + 행사/전시회명 + 간단한 설명 카드 그리드
  function communityPage(c) {
    var cm = c.community || {};
    var items = cm.items || [];
    var cards = items.map(function (it, i) {
      var photo = it.photo
        ? '<img class="ccard__img" src="' + esc(it.photo) + '" alt="' + esc(it.title) + '" loading="lazy">'
        : '<div class="ccard__img ccard__img--empty"><span>' + esc(T.imgPreparing) + "</span></div>";
      return '<article class="ccard reveal" data-cpath="community.items[' + i + ']" style="--d:' + (i * 90) + 'ms">' +
          '<div class="ccard__thumb">' + photo +
            (it.year ? '<span class="ccard__year">' + esc(it.year) + "</span>" : "") +
          "</div>" +
          '<div class="ccard__body">' +
            '<h3 class="ccard__title">' + esc(it.title) + "</h3>" +
            (it.desc ? '<p class="ccard__desc">' + nl2br(it.desc) + "</p>" : "") +
          "</div>" +
        "</article>";
    }).join("");
    var grid = items.length
      ? '<div class="cgrid">' + cards + "</div>"
      : '<p class="cempty">' + esc(T.noNews) + "</p>";
    var intro = cm.intro
      ? '<p class="csection__intro reveal">' + esc(cm.intro) + "</p>"
      : "";
    return banner(cm.titleEn || "COMMUNITY", cm.subtitle || "Tin tức") +
      '<section class="section community" data-cpath="community"><div class="wrap">' + intro + grid + "</div></section>";
  }

  function footer(c) {
    var co = c.company;
    return '' +
      '<footer class="footer"><div class="wrap">' +
        '<div class="footer__grid">' +
          "<div>" +
            '<img class="footer__logo" data-cpath="images" src="' + esc(c.images.logo) + '" alt="' + esc(co.nameKr) + '">' +
            '<p class="footer__tagline" data-cpath="footer">' + esc(c.footer.tagline) + "</p>" +
          "</div>" +
          '<div class="footer__col" data-cpath="company"><h4>CONTACT</h4>' +
            "<p>TEL " + esc(co.tel) + "</p>" +
            "<p>FAX " + esc(co.fax) + "</p>" +
            "<p>E.MAIL " + esc(co.email1) + " / " + esc(co.email2) + "</p>" +
            "<p>ADDRESS " + esc(co.address) + "</p>" +
          "</div>" +
        "</div>" +
        '<div class="footer__copy">' + esc(co.copyright) + "</div>" +
      "</div></footer>";
  }

  function body(c, page) {
    switch (page) {
      case "about":
        return aboutPage(c);
      case "cert":
        return banner((c.certifications && c.certifications.titleEn) || "CERTIFICATION",
          (c.certifications && c.certifications.subtitle) || "Chứng nhận") +
          certifications(c);
      case "location":
        return banner((c.location && c.location.titleEn) || "LOCATION",
          (c.location && c.location.subtitle) || "Địa chỉ") +
          location(c);
      case "business":
        return banner("BUSINESS AREA", (c.business && c.business.subtitle) || "") +
          business(c, { hideHead: true });
      case "products":
        return productsPage(c);
      case "technology":
        return techPage(c);
      case "community":
        return communityPage(c);
      case "contact":
        return contactPage(c);
      default: // home
        return hero(c) + about(c) + products(c) + business(c) + technology(c) + cta(c);
    }
  }

  function setupReveal() {
    var els = [].slice.call(document.querySelectorAll(".reveal"));
    if (!els.length) return;

    function check() {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      for (var i = els.length - 1; i >= 0; i--) {
        var r = els[i].getBoundingClientRect();
        if (r.top < vh * 0.9 && r.bottom > 0) {
          els[i].classList.add("is-in");
          els.splice(i, 1);
        }
      }
      if (!els.length) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    }
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      (window.requestAnimationFrame || setTimeout)(function () { check(); ticking = false; });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // 최초 노출은 한 프레임 뒤에 실행 → 숨김 상태가 먼저 그려져 진입 애니메이션이 재생된다.
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(function () { raf(check); });
    // 안전장치: 어떤 이유로든 숨겨진 요소가 남으면 모두 노출
    setTimeout(function () {
      var rem = document.querySelectorAll(".reveal:not(.is-in)");
      for (var i = 0; i < rem.length; i++) rem[i].classList.add("is-in");
    }, 4000);
  }

  // 스크롤 진행 바 + 헤더 축소 효과
  function setupScrollFX() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var bar = document.createElement("div");
    bar.className = "scrollprog";
    document.body.appendChild(bar);
    var gnb = document.querySelector(".gnb");
    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var max = (doc.scrollHeight - doc.clientHeight) || 1;
      var y = window.pageYOffset || doc.scrollTop || 0;
      var p = Math.min(1, Math.max(0, y / max));
      bar.style.transform = "scaleX(" + p + ")";
      if (gnb) gnb.classList.toggle("is-scrolled", y > 10);
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      (window.requestAnimationFrame || setTimeout)(update);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  function setupContactForm(c) {
    var btn = document.getElementById("cf_submit");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
      var name = val("cf_name"), email = val("cf_email"), msg = val("cf_message");
      var agree = document.getElementById("cf_agree");
      if (!name || !email || !msg) { alert(T.formNeed); return; }
      if (agree && !agree.checked) { alert(T.formAgree); return; }
      var to = (c.company && c.company.email1) || "";
      var subject = T.mailSubject + name + " (" + val("cf_company") + ")";
      var bodyTxt = T.mailName + name + "\n" + T.mailCompany + val("cf_company") +
        "\n" + T.mailEmail + email + "\n" + T.mailPhone + val("cf_phone") +
        "\n\n" + T.mailBody + "\n" + msg;
      window.location.href = "mailto:" + to +
        "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyTxt);
    });
  }

  function setupProductTabs() {
    var tabs = [].slice.call(document.querySelectorAll(".ptab"));
    var panels = [].slice.call(document.querySelectorAll(".ppanel"));
    if (!tabs.length || !panels.length) return;

    function activate(id) {
      var found = false;
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-cat") === id;
        t.classList.toggle("is-active", on);
        if (on) found = true;
      });
      panels.forEach(function (pn) {
        var on = pn.getAttribute("data-cat") === id;
        pn.classList.toggle("is-active", on);
      });
      if (found) setupReveal();
      return found;
    }

    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        var id = t.getAttribute("data-cat");
        activate(id);
        if (history.replaceState) history.replaceState(null, "", "#" + id);
        else window.location.hash = id;
      });
    });

    var hash = (window.location.hash || "").replace(/^#/, "");
    if (hash) activate(hash);
  }

  // ---------- 유지보수 관리센터 딥링크 하이라이트 ----------
  // URL ?edit=<content경로> 를 받아 해당 영역으로 스크롤 + 네모박스 표시.
  // 경로 세그먼트 최장일치: 리프 필드는 그 필드가 속한 카드/섹션을 강조한다.
  function pathSegs(p) { return String(p || "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean); }
  function isPrefix(a, b) { if (a.length > b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function injectHlStyle() {
    if (document.getElementById("cedit-style")) return;
    var st = document.createElement("style");
    st.id = "cedit-style";
    st.textContent =
      ".cedit-hl{ position:relative; outline:3px solid #ff2d6f !important; outline-offset:5px;" +
      " border-radius:8px; box-shadow:0 0 0 6px rgba(255,45,111,.14); scroll-margin-top:110px;" +
      " animation:ceditPulse 1.15s ease-in-out 0s 4; z-index:1; }" +
      "@keyframes ceditPulse{ 0%,100%{ outline-color:#ff2d6f; box-shadow:0 0 0 6px rgba(255,45,111,.14);}" +
      " 50%{ outline-color:#ffab1a; box-shadow:0 0 0 12px rgba(255,45,111,.04);} }" +
      ".cedit-toast{ position:fixed; left:50%; top:16px; transform:translateX(-50%);" +
      " background:#111827; color:#fff; font-family:sans-serif; font-size:13px; font-weight:600;" +
      " padding:10px 16px; border-radius:999px; box-shadow:0 8px 30px rgba(0,0,0,.3); z-index:9999;" +
      " display:flex; align-items:center; gap:10px; max-width:90vw; }" +
      ".cedit-toast b{ color:#ff8fb4; font-weight:700; }" +
      ".cedit-toast button{ background:rgba(255,255,255,.15); color:#fff; border:0; border-radius:999px;" +
      " width:22px; height:22px; cursor:pointer; font-size:14px; line-height:1; }";
    document.head.appendChild(st);
  }
  function setupEditHighlight() {
    var m = /[?&]edit=([^&]+)/.exec(window.location.search || "");
    if (!m) return;
    var target = "";
    try { target = decodeURIComponent(m[1]); } catch (e) { target = m[1]; }
    var segs = pathSegs(target);
    if (!segs.length) return;
    var nodes = document.querySelectorAll("[data-cpath]");
    var best = null, bestLen = 0;
    for (var i = 0; i < nodes.length; i++) {
      var cs = pathSegs(nodes[i].getAttribute("data-cpath"));
      if (cs.length > bestLen && isPrefix(cs, segs)) { best = nodes[i]; bestLen = cs.length; }
    }
    injectHlStyle();
    // 상단 안내 토스트
    var toast = document.createElement("div");
    toast.className = "cedit-toast";
    toast.innerHTML = best
      ? '<span>🔧 <b>수정 요청 위치</b>로 이동했습니다</span>'
      : '<span>🔧 해당 위치를 찾지 못했습니다 (' + esc(target) + ')</span>';
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", function () { if (toast.parentNode) toast.parentNode.removeChild(toast); });
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 6000);
    if (!best) return;
    // 비활성 제품 탭 안이면 먼저 해당 탭을 켠다
    var panel = best.closest ? best.closest(".ppanel") : null;
    if (panel && !panel.classList.contains("is-active")) {
      var cat = panel.getAttribute("data-cat");
      var tab = document.querySelector('.ptab[data-cat="' + cat + '"]');
      if (tab) tab.click();
    }
    setTimeout(function () {
      try { best.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { best.scrollIntoView(); }
      best.classList.add("cedit-hl");
    }, 350);
  }

  function render(c, page) {
    var html = header(c, page) + body(c, page) + footer(c);
    document.getElementById("app").innerHTML = localizeLinks(html);
    try { document.documentElement.setAttribute("lang", LANG); } catch (e) {}

    var burger = document.getElementById("gnbBurger");
    var menu = document.getElementById("gnbMenu");
    if (burger && menu) {
      burger.addEventListener("click", function () { menu.classList.toggle("is-open"); });
      menu.addEventListener("click", function (e) {
        if (e.target.tagName === "A") menu.classList.remove("is-open");
      });
    }
    setupContactForm(c);
    setupProductTabs();
    setupReveal();
    setupScrollFX();
    setupEditHighlight();
  }

  // 현재 언어의 콘텐츠에서 페이지별 meta description을 만든다 (언어 전환 시 갱신)
  function pageDescription(c, page) {
    function first(v) { return Array.isArray(v) ? v[0] : v; }
    var map = {
      home: c.hero && c.hero.description,
      about: c.about && first(c.about.paragraphs),
      products: c.products && c.products.subtitle,
      business: c.business && c.business.subtitle,
      technology: c.technology && c.technology.description,
      cert: c.certifications && c.certifications.subtitle,
      location: c.location && c.location.subtitle,
      community: c.community && c.community.intro,
      contact: c.cta && c.cta.subtitle
    };
    return String(map[page] || map.home || "").replace(/\s+/g, " ").trim();
  }
  function setMetaDescription(text) {
    if (!text) return;
    var m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "description");
      document.head.appendChild(m);
    }
    m.setAttribute("content", text);
  }

  var page = document.body.getAttribute("data-page") || "home";
  var content = loadContent();
  if (content) {
    render(content, page);
    var brand = (content.company && content.company.nameKr) ? content.company.nameKr + " | " : "";
    var titles = TITLES[LANG] || TITLES.vi;
    document.title = brand + (titles[page] || titles.home);
    setMetaDescription(pageDescription(content, page));
  } else {
    document.getElementById("app").innerHTML =
      '<div style="padding:80px;text-align:center;font-family:sans-serif">' +
      esc(T.loadFail) + "</div>";
  }
})();
