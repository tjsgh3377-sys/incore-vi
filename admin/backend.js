/* INCORE 관리자 — 저장 백엔드
 *
 * 같은 관리자 화면을 두 환경에서 쓴다.
 *
 *   로컬 (localhost)      serve.ps1 이 /api/* 를 제공한다. 파일을 바로 쓰므로 빠르고,
 *                         [GitHub에 반영] 버튼으로 따로 커밋·푸시한다.
 *   웹 (GitHub Pages)     백엔드가 없다. 브라우저가 GitHub API 로 저장소에
 *                         직접 커밋한다. 저장 = 발행.
 *
 * window.Backend 로 노출하는 인터페이스
 *   mode            "local" | "github"
 *   label           화면에 표시할 이름
 *   publishesOnSave 저장이 곧 공개 사이트 반영인가
 *   instantUpload   업로드가 저장 없이 즉시 반영되는가
 *   isLoggedIn()    -> bool
 *   login(cred, remember) -> Promise
 *   logout()
 *   load()          -> Promise<[vi, en|null]>
 *   save(vi, en, note)    -> Promise<{ sha, files }>
 *   upload(file, folder, name) -> Promise<{ ok, path, previewUrl }>
 */
(function () {
  "use strict";

  // 저장소를 옮기거나 이름을 바꾸면 이 값만 고치면 된다.
  var GH = { owner: "tjsgh3377-sys", repo: "incore-vi", branch: "main" };

  // 기본은 주소로 판단한다. LAN IP로 로컬 서버를 열어둔 경우처럼 판정이 어긋나면
  // 주소 끝에 ?backend=local 또는 ?backend=github 를 붙여 강제할 수 있다.
  var FORCED = (/[?&]backend=(local|github)/i.exec(location.search) || [])[1];
  var IS_LOCAL = FORCED
    ? (FORCED.toLowerCase() === "local")
    : /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);

  // ---------- 공통 유틸 ----------

  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    // 큰 파일에서 스택이 넘치지 않도록 나눠서 변환한다
    for (var i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }

  function fileToB64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
      fr.onerror = function () { reject(new Error("파일을 읽지 못했습니다.")); };
      fr.readAsDataURL(file);
    });
  }

  function json(obj) { return JSON.stringify(obj, null, 2); }

  // serve.ps1 의 커밋 메시지와 같은 형식으로 맞춘다
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  // ======================================================================
  // 로컬 백엔드 — serve.ps1
  // ======================================================================

  var LOCAL_KEY = "jstech_admin_token";

  var LocalBackend = {
    mode: "local",
    label: "로컬 서버",
    publishesOnSave: false,
    instantUpload: true,

    isLoggedIn: function () { return !!sessionStorage.getItem(LOCAL_KEY); },

    login: function (pw) {
      return fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!(r.ok && j.ok)) throw new Error("비밀번호가 올바르지 않습니다.");
          sessionStorage.setItem(LOCAL_KEY, pw);
        });
      }, function () {
        throw new Error("서버에 연결할 수 없습니다. serve.ps1 로 실행했는지 확인하세요.");
      });
    },

    logout: function () { sessionStorage.removeItem(LOCAL_KEY); },

    api: function (path, opts) {
      opts = opts || {};
      opts.headers = opts.headers || {};
      var t = sessionStorage.getItem(LOCAL_KEY);
      if (t) opts.headers["X-Admin-Token"] = t;
      return fetch(path, opts);
    },

    load: function () {
      var t = Date.now();
      var vi = fetch("/api/content?_=" + t).then(function (r) { return r.json(); });
      // 영문이 없거나 서버가 실패해도 베트남어 편집은 계속 가능해야 한다
      var en = fetch("/api/content?lang=en&_=" + t)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
      return Promise.all([vi, en]);
    },

    save: function (vi, en) {
      var self = this;
      function post(path, obj) {
        return self.api(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: json(obj)
        }).then(function (r) {
          return r.json().then(function (j) {
            if (!(r.ok && j.ok)) {
              if (j.error === "unauthorized") throw new Error("세션이 만료되었습니다. 다시 로그인하세요.");
              throw new Error("저장 실패: " + (j.error || ""));
            }
            return j;
          });
        });
      }
      return post("/api/save", vi).then(function () {
        if (!en) return { files: ["content.json"] };
        return post("/api/save-en", en).then(function () {
          return { files: ["content.json", "content_en.json"] };
        });
      });
    },

    upload: function (file, folder, name) {
      return this.api("/api/upload?folder=" + encodeURIComponent(folder) + "&name=" + encodeURIComponent(name), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error || "업로드 실패");
        return { ok: true, path: j.path, previewUrl: j.path + "?_=" + Date.now() };
      });
    }
  };

  // ======================================================================
  // GitHub 백엔드 — 브라우저가 직접 커밋
  // ======================================================================

  var GH_KEY = "incore_gh_token";

  function ghToken() {
    try { return localStorage.getItem(GH_KEY) || sessionStorage.getItem(GH_KEY); }
    catch (e) { return null; }
  }

  function ghMessage(status, body) {
    var detail = (body && body.message) ? body.message : "";
    if (status === 401) return "토큰이 올바르지 않거나 만료되었습니다. 다시 로그인하세요.";
    if (status === 403) {
      if (/rate limit/i.test(detail)) return "GitHub 요청 한도를 넘었습니다. 잠시 후 다시 시도하세요.";
      return "권한이 없습니다. 토큰에 이 저장소의 Contents 쓰기 권한이 있는지 확인하세요.";
    }
    if (status === 404) return "저장소를 찾을 수 없습니다. 토큰의 저장소 접근 범위를 확인하세요.";
    if (status === 409 || status === 422) {
      return "다른 곳에서 먼저 수정되었습니다. [되돌리기]로 최신 내용을 불러온 뒤 다시 저장하세요.";
    }
    return "GitHub 오류 (" + status + ") " + detail;
  }

  function gh(path, opts) {
    opts = opts || {};
    var headers = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    var t = ghToken();
    if (t) headers["Authorization"] = "Bearer " + t;
    if (opts.body) headers["Content-Type"] = "application/json";
    for (var k in (opts.headers || {})) headers[k] = opts.headers[k];

    return fetch("https://api.github.com" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body
    }).then(function (r) {
      return r.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) {}
        if (!r.ok) throw new Error(ghMessage(r.status, body));
        return body;
      });
    }, function () {
      throw new Error("GitHub에 연결할 수 없습니다. 인터넷 연결을 확인하세요.");
    });
  }

  function repoPath(suffix) {
    return "/repos/" + GH.owner + "/" + GH.repo + suffix;
  }

  var GitHubBackend = {
    mode: "github",
    label: "GitHub 직접 편집",
    publishesOnSave: true,
    instantUpload: false,

    // 불러온 시점의 커밋. 저장 직전에 달라졌으면 남의 수정을 덮어쓰게 되므로 막는다.
    baseSha: null,
    // 저장하기 전까지 메모리에만 들고 있는 업로드 파일 { "assets/x.png": "<base64>" }
    pending: {},
    // 불러온 원본 — 바뀐 파일만 커밋하기 위해 비교용으로 보관
    orig: { vi: null, en: null },

    isLoggedIn: function () { return !!ghToken(); },

    login: function (tokenValue, remember) {
      var t = String(tokenValue || "").trim();
      if (!t) return Promise.reject(new Error("토큰을 입력하세요."));
      try {
        sessionStorage.setItem(GH_KEY, t);
        if (remember) localStorage.setItem(GH_KEY, t);
      } catch (e) {}

      return gh(repoPath("")).then(function (repo) {
        if (!repo || !repo.permissions || !repo.permissions.push) {
          GitHubBackend.logout();
          throw new Error("이 토큰에는 쓰기 권한이 없습니다. Contents: Read and write 로 발급하세요.");
        }
      }).catch(function (e) {
        GitHubBackend.logout();
        throw e;
      });
    },

    logout: function () {
      try { localStorage.removeItem(GH_KEY); sessionStorage.removeItem(GH_KEY); } catch (e) {}
    },

    load: function () {
      var self = this;
      self.pending = {};
      return gh(repoPath("/git/ref/heads/" + GH.branch)).then(function (ref) {
        self.baseSha = ref.object.sha;
        function readFile(p) {
          return gh(repoPath("/contents/" + p + "?ref=" + self.baseSha))
            .then(function (f) { return b64ToUtf8(f.content); });
        }
        return Promise.all([
          readFile("content.json"),
          readFile("content_en.json").catch(function () { return null; })
        ]);
      }).then(function (texts) {
        var vi = JSON.parse(texts[0]);
        var en = texts[1] ? JSON.parse(texts[1]) : null;
        // 저장소 원본의 들여쓰기·끝 줄바꿈이 달라도 "수정됨"으로 오인하지 않도록
        // 내보낼 때와 같은 형식으로 정규화해 보관한다.
        self.orig.vi = json(vi);
        self.orig.en = en ? json(en) : null;
        return [vi, en];
      });
    },

    save: function (vi, en, note) {
      var self = this;
      var viText = json(vi);
      var enText = en ? json(en) : null;

      // 바뀐 것만 커밋한다
      var changes = [];
      if (viText !== self.orig.vi) changes.push({ path: "content.json", text: viText });
      if (enText !== null && enText !== self.orig.en) changes.push({ path: "content_en.json", text: enText });
      for (var p in self.pending) changes.push({ path: p, b64: self.pending[p] });

      if (!changes.length) return Promise.resolve({ nothing: true, files: [] });

      // 불러온 뒤 저장소가 움직였는지 먼저 확인 (남의 수정 덮어쓰기 방지)
      return gh(repoPath("/git/ref/heads/" + GH.branch)).then(function (ref) {
        if (self.baseSha && ref.object.sha !== self.baseSha) {
          throw new Error("불러온 뒤 저장소가 변경되었습니다. [되돌리기]로 최신 내용을 불러온 뒤 다시 저장하세요.");
        }
        self.baseSha = ref.object.sha;
        return gh(repoPath("/git/commits/" + self.baseSha));
      }).then(function (commit) {
        var baseTree = commit.tree.sha;
        // 파일마다 blob 을 만든 뒤 하나의 커밋으로 묶는다
        return Promise.all(changes.map(function (c) {
          return gh(repoPath("/git/blobs"), {
            method: "POST",
            body: JSON.stringify(
              c.b64 ? { content: c.b64, encoding: "base64" }
                    : { content: c.text, encoding: "utf-8" }
            )
          }).then(function (blob) {
            return { path: c.path, mode: "100644", type: "blob", sha: blob.sha };
          });
        })).then(function (tree) {
          return gh(repoPath("/git/trees"), {
            method: "POST",
            body: JSON.stringify({ base_tree: baseTree, tree: tree })
          });
        });
      }).then(function (tree) {
        var msg = "관리자 페이지에서 콘텐츠 수정 (" + stamp() + ")";
        var clean = String(note || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
        if (clean) msg = clean + "\n\n" + msg;
        return gh(repoPath("/git/commits"), {
          method: "POST",
          body: JSON.stringify({ message: msg, tree: tree.sha, parents: [self.baseSha] })
        });
      }).then(function (commit) {
        return gh(repoPath("/git/refs/heads/" + GH.branch), {
          method: "PATCH",
          body: JSON.stringify({ sha: commit.sha, force: false })
        }).then(function () { return commit; });
      }).then(function (commit) {
        self.baseSha = commit.sha;
        if (viText !== self.orig.vi) self.orig.vi = viText;
        if (enText !== null) self.orig.en = enText;
        self.pending = {};
        return {
          sha: commit.sha.slice(0, 7),
          files: changes.map(function (c) { return c.path; })
        };
      });
    },

    // 저장 확인창에 보여줄 "이번에 바뀐 파일" 목록
    changedFiles: function (vi, en) {
      var out = [];
      if (json(vi) !== this.orig.vi) out.push("content.json");
      if (en && json(en) !== this.orig.en) out.push("content_en.json");
      for (var p in this.pending) out.push(p);
      return out;
    },

    // 웹에서는 바로 올리지 않는다. 저장할 때 본문과 같은 커밋에 함께 담는다.
    upload: function (file, folder, name) {
      var self = this;
      var dir = (folder === "uploads") ? "uploads" : "assets";
      var path = dir + "/" + name;
      return fileToB64(file).then(function (b64) {
        self.pending[path] = b64;
        return { ok: true, path: path, previewUrl: URL.createObjectURL(file) };
      });
    },

    pendingCount: function () { return Object.keys(this.pending).length; }
  };

  window.Backend = IS_LOCAL ? LocalBackend : GitHubBackend;
  window.Backend.repoInfo = GH;
})();
