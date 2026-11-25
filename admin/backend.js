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

  // ---------- 비밀번호 잠금 ----------
  //
  // 정적 사이트라 비밀번호를 검사할 서버가 없다. 그래서 GitHub 토큰을 비밀번호로
  // 암호화해 저장소에 두고(admin/token.enc.json), 로그인 때 복호화해 쓴다.
  //
  // 주의: 이 암호문은 공개 저장소에 그대로 올라간다. 누구나 받아가 오프라인에서
  //       비밀번호를 대입해볼 수 있다. 그래서
  //         - PBKDF2 반복을 크게 잡아 1회 시도 비용을 ~1초로 올리고
  //         - 짧은 비밀번호는 설정 단계에서 막는다 (MIN_PASSWORD)
  //       그래도 마지막 방어선은 "긴 비밀번호"다.

  var LOCK_PATH = "admin/token.enc.json";
  var KDF_ITER = 2400000;     // 이 PC 기준 약 1초
  var MIN_PASSWORD = 12;
  var TOKEN_SLOT = 256;       // 암호문 길이로 토큰 종류가 드러나지 않도록 고정 길이

  function randomBytes(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  function bytesToB64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function deriveKey(password, salt, iterations) {
    var raw = new TextEncoder().encode(password);
    return crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
      });
  }

  function padToken(token) {
    var b = new TextEncoder().encode(token);
    if (b.length > TOKEN_SLOT - 2) throw new Error("토큰이 너무 깁니다.");
    var out = randomBytes(TOKEN_SLOT);
    out[0] = b.length >> 8;
    out[1] = b.length & 255;
    out.set(b, 2);
    return out;
  }

  function unpadToken(bytes) {
    var n = (bytes[0] << 8) | bytes[1];
    if (n < 1 || n > TOKEN_SLOT - 2) throw new Error("bad padding");
    return new TextDecoder().decode(bytes.subarray(2, 2 + n));
  }

  // 암호문은 Pages 보다 raw 쪽이 커밋 직후 바로 최신이라 먼저 시도한다
  function fetchLock() {
    var bust = "?_=" + Date.now();
    var raw = "https://raw.githubusercontent.com/" + GH.owner + "/" + GH.repo +
              "/" + GH.branch + "/" + LOCK_PATH + bust;
    function parse(r) {
      if (!r.ok) throw new Error("no lock");
      return r.json();
    }
    return fetch(raw, { cache: "no-store" }).then(parse)
      .catch(function () { return fetch("token.enc.json" + bust, { cache: "no-store" }).then(parse); })
      .catch(function () { return null; });
  }

  function ghToken() {
    try { return localStorage.getItem(GH_KEY) || sessionStorage.getItem(GH_KEY); }
    catch (e) { return null; }
  }

  function ghMessage(status, body) {
    var detail = (body && body.message) ? body.message : "";
    if (status === 401) {
      return "토큰이 올바르지 않거나 만료되었습니다.\n" +
             "사이트 비밀번호가 아니라 GitHub에서 발급한 토큰인지 확인하세요.";
    }
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
      // 로컬 관리자 비밀번호를 잘못 넣는 경우가 많아 형식을 먼저 걸러낸다.
      // (fine-grained = github_pat_… , classic = ghp_… )
      if (!/^(github_pat_|gh[pousr]_)/.test(t)) {
        return Promise.reject(new Error(
          "GitHub 토큰이 아닙니다. github_pat_… 또는 ghp_… 로 시작하는 값이어야 합니다.\n" +
          "로컬 관리자 비밀번호와는 다릅니다. 아래 안내로 토큰을 발급하세요."
        ));
      }
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

    // ---------- 비밀번호 로그인 ----------

    minPassword: MIN_PASSWORD,

    // 비밀번호가 설정돼 있는지 (로그인 화면이 어느 쪽을 먼저 보여줄지 결정)
    hasPassword: function () {
      return fetchLock().then(function (lock) { return !!(lock && lock.ct); });
    },

    loginWithPassword: function (password, remember) {
      if (!password) return Promise.reject(new Error("비밀번호를 입력하세요."));
      return fetchLock().then(function (lock) {
        if (!lock || !lock.ct) {
          throw new Error("비밀번호가 아직 설정되지 않았습니다.\nGitHub 토큰으로 로그인한 뒤 [비밀번호 설정]에서 만드세요.");
        }
        return deriveKey(password, b64ToBytes(lock.salt), lock.iterations || KDF_ITER)
          .then(function (key) {
            return crypto.subtle.decrypt(
              { name: "AES-GCM", iv: b64ToBytes(lock.iv) }, key, b64ToBytes(lock.ct)
            );
          })
          .then(function (buf) { return unpadToken(new Uint8Array(buf)); },
                function () { throw new Error("비밀번호가 올바르지 않습니다."); });
      }).then(function (token) {
        // 꺼낸 토큰이 아직 살아 있는지까지 확인한다
        return GitHubBackend.login(token, remember).catch(function (e) {
          if (/토큰/.test(e.message)) {
            throw new Error("비밀번호는 맞지만 저장된 토큰이 만료되었거나 권한을 잃었습니다.\n새 토큰으로 로그인한 뒤 비밀번호를 다시 설정하세요.");
          }
          throw e;
        });
      });
    },

    // 지금 로그인에 쓰고 있는 토큰을 비밀번호로 잠가 저장소에 올린다
    setPassword: function (password) {
      var self = this;
      var token = ghToken();
      if (!token) return Promise.reject(new Error("먼저 로그인하세요."));
      if (!password || password.length < MIN_PASSWORD) {
        return Promise.reject(new Error("비밀번호는 " + MIN_PASSWORD + "자 이상이어야 합니다."));
      }

      var salt = randomBytes(16);
      var iv = randomBytes(12);
      return deriveKey(password, salt, KDF_ITER).then(function (key) {
        return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, padToken(token));
      }).then(function (ct) {
        var payload = json({
          _: "GitHub 토큰을 비밀번호로 암호화한 파일입니다. 이 파일만으로는 토큰을 알 수 없습니다.",
          v: 1,
          kdf: "PBKDF2-SHA256",
          iterations: KDF_ITER,
          cipher: "AES-GCM-256",
          salt: bytesToB64(salt),
          iv: bytesToB64(iv),
          ct: bytesToB64(new Uint8Array(ct))
        });
        // 기존 파일이 있으면 교체해야 하므로 sha 를 먼저 구한다
        return gh(repoPath("/contents/" + LOCK_PATH + "?ref=" + GH.branch))
          .then(function (f) { return f.sha; }, function () { return null; })
          .then(function (sha) {
            var body = {
              message: "관리자 비밀번호 설정 (" + stamp() + ")",
              content: utf8ToB64(payload),
              branch: GH.branch
            };
            if (sha) body.sha = sha;
            return gh(repoPath("/contents/" + LOCK_PATH), { method: "PUT", body: JSON.stringify(body) });
          });
      }).then(function (res) {
        // 이 커밋으로 ref 가 움직였다. 갱신하지 않으면 다음 저장이 충돌로 막힌다.
        if (res && res.commit && res.commit.sha) self.baseSha = res.commit.sha;
        return true;
      });
    },

    // 사람이 외우지 않고 비밀번호 관리자에 넣을 용도의 강한 암호
    suggestPassword: function () {
      var abc = "abcdefghijkmnpqrstuvwxyz23456789";  // 헷갈리는 l,o,0,1 제외
      var bytes = randomBytes(16);
      var s = "";
      for (var i = 0; i < 16; i++) {
        if (i && i % 4 === 0) s += "-";
        s += abc.charAt(bytes[i] % abc.length);
      }
      return s;
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
