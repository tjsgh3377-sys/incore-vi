param([int]$Port = 8753)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "INCORE(VI) 사이트: http://localhost:$Port/"
Write-Host "관리자 페이지:    http://localhost:$Port/admin.html"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg';
  '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.svg'='image/svg+xml';
  '.ico'='image/x-icon'; '.woff'='font/woff'; '.woff2'='font/woff2';
  '.ttf'='font/ttf'; '.pdf'='application/pdf'; '.map'='application/json';
  '.mp4'='video/mp4'; '.webm'='video/webm'
}

# 관리자 페이지가 업로드할 수 있는 디렉터리
$uploadDirs = @{
  'images' = 'assets'
  'uploads' = 'uploads'
}
# 브라우저에 절대 노출하면 안 되는 파일
$blocked = @('admin.config.json', 'serve.ps1', 'chatbot.secret.json', 'chatbot.json')

function Get-Password {
  $cfgPath = Join-Path $root 'admin.config.json'
  if (Test-Path $cfgPath) {
    try { return (Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json).password } catch {}
  }
  # 공개 저장소에 포함되는 파일이므로 실제 비밀번호를 두지 않는다.
  # 운영 비밀번호는 git에 올라가지 않는 admin.config.json 에 설정한다.
  return 'change-me'
}

function Read-BodyBytes($req) {
  $ms = New-Object System.IO.MemoryStream
  $req.InputStream.CopyTo($ms)
  return $ms.ToArray()
}

function Send-Json($resp, $obj, $status = 200) {
  $resp.StatusCode = $status
  $resp.ContentType = 'application/json; charset=utf-8'
  $json = ($obj | ConvertTo-Json -Depth 20 -Compress)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $resp.ContentLength64 = $bytes.Length
  $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  $resp.OutputStream.Close()
}

function Send-Text($resp, $text, $status = 200, $type = 'text/plain; charset=utf-8') {
  $resp.StatusCode = $status
  $resp.ContentType = $type
  $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$text)
  $resp.ContentLength64 = $bytes.Length
  $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  $resp.OutputStream.Close()
}

function Sanitize-Name($name) {
  $name = [System.IO.Path]::GetFileName($name)
  return ($name -replace '[^A-Za-z0-9._-]', '_')
}

# ---------- 챗봇 ----------
$script:ChatbotPath = Join-Path $root 'chatbot.json'

function Limit-Text($s, $n) {
  if (-not $s) { return '' }
  $t = [string]$s
  if ($t.Length -gt $n) { return $t.Substring(0, $n) }
  return $t
}

function Get-ChatbotData {
  if (-not (Test-Path $script:ChatbotPath)) { return $null }
  try { return (Get-Content $script:ChatbotPath -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Save-ChatbotData($data) {
  $json = ($data | ConvertTo-Json -Depth 20)
  [System.IO.File]::WriteAllText($script:ChatbotPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-AnthropicKey {
  if ($env:ANTHROPIC_API_KEY) { return $env:ANTHROPIC_API_KEY }
  $sp = Join-Path $root 'chatbot.secret.json'
  if (Test-Path $sp) {
    try { return (Get-Content $sp -Raw -Encoding UTF8 | ConvertFrom-Json).anthropic_api_key } catch {}
  }
  return $null
}

# PowerShell 5.1의 Invoke-RestMethod는 응답을 UTF-8로 디코딩하지 않아 한글이 깨진다.
# 요청/응답 모두 바이트 단위로 직접 처리한다.
function Invoke-Anthropic($key, $payload) {
  $json = ($payload | ConvertTo-Json -Depth 12 -Compress)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $req = [System.Net.HttpWebRequest]::Create('https://api.anthropic.com/v1/messages')
  $req.Method = 'POST'
  $req.ContentType = 'application/json; charset=utf-8'
  $req.Headers.Add('x-api-key', $key)
  $req.Headers.Add('anthropic-version', '2023-06-01')
  $req.Timeout = 25000
  $req.ReadWriteTimeout = 25000
  $rs = $req.GetRequestStream()
  $rs.Write($bytes, 0, $bytes.Length)
  $rs.Close()
  $res = $req.GetResponse()
  $sr = New-Object System.IO.StreamReader($res.GetResponseStream(), [System.Text.Encoding]::UTF8)
  $text = $sr.ReadToEnd()
  $sr.Close(); $res.Close()
  return ($text | ConvertFrom-Json)
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    $method = $req.HttpMethod

    # ---------- API ----------
    if ($path.StartsWith('/api/')) {
      $token = $req.Headers['X-Admin-Token']
      $authed = ($token -and ($token -eq (Get-Password)))

      if ($path -eq '/api/login' -and $method -eq 'POST') {
        $body = [System.Text.Encoding]::UTF8.GetString((Read-BodyBytes $req))
        $pw = $null
        try { $pw = ($body | ConvertFrom-Json).password } catch {}
        if ($pw -eq (Get-Password)) { Send-Json $resp @{ ok = $true } }
        else { Send-Json $resp @{ ok = $false; error = 'invalid password' } 401 }
        continue
      }

      if ($path -eq '/api/content' -and $method -eq 'GET') {
        $lang = $req.QueryString['lang']
        $fname = if ($lang -eq 'en') { 'content_en.json' } else { 'content.json' }
        $cp = Join-Path $root $fname
        Send-Text $resp (Get-Content $cp -Raw -Encoding UTF8) 200 'application/json; charset=utf-8'
        continue
      }

      # 위젯이 읽는 공개 설정 (설정 + 활성 FAQ만, 리드는 절대 포함하지 않음)
      if ($path -eq '/api/chatbot/config' -and $method -eq 'GET') {
        $cb = Get-ChatbotData
        if (-not $cb) { Send-Json $resp @{ enabled = $false }; continue }
        $kb = @($cb.knowledge | Where-Object { $_.is_active } | ForEach-Object {
          @{ id = $_.id; category = $_.category; title = $_.title; keywords = $_.keywords; answer = $_.answer; priority = $_.priority }
        })
        Send-Json $resp @{ settings = $cb.settings; knowledge = $kb }
        continue
      }

      # AI 답변 생성 — 전달된 FAQ만 근거로 사용하도록 제약
      if ($path -eq '/api/chatbot' -and $method -eq 'POST') {
        $body = [System.Text.Encoding]::UTF8.GetString((Read-BodyBytes $req))
        $inp = $null
        try { $inp = $body | ConvertFrom-Json } catch { Send-Json $resp @{ ai = $false; error = 'invalid json' } 400; continue }

        $cb = Get-ChatbotData
        $key = Get-AnthropicKey
        if (-not $cb -or -not $cb.settings.ai_enabled -or -not $key) {
          Send-Json $resp @{ ai = $false; reason = 'ai disabled or no api key' }
          continue
        }

        $msg = [string]$inp.message
        if ([string]::IsNullOrWhiteSpace($msg)) { Send-Json $resp @{ ai = $false; error = 'empty message' } 400; continue }
        if ($msg.Length -gt 2000) { $msg = $msg.Substring(0, 2000) }

        $kbText = ''
        foreach ($k in @($inp.knowledge)) {
          if ($k) { $kbText += "[" + $k.category + "] " + $k.title + "`n" + $k.answer + "`n`n" }
        }
        if ([string]::IsNullOrWhiteSpace($kbText)) { $kbText = '(관련 자료 없음)' }

        $slotText = ''
        if ($inp.slots) {
          foreach ($p in $inp.slots.PSObject.Properties) {
            if ($p.Value) { $slotText += "- " + $p.Name + ": " + $p.Value + "`n" }
          }
        }
        if ([string]::IsNullOrWhiteSpace($slotText)) { $slotText = '(아직 파악된 정보 없음)' }

        $langName = if ($inp.lang -eq 'en') { 'English' } else { 'Korean' }

        $system = @"
당신은 ㈜준성테크(JUNSUNG TECH)의 온라인 기술상담 담당자입니다.
준성테크는 2006년 설립된 정밀 코팅 장치 제조사로, 2차전지·디스플레이·MLCC용 Slot Die와 Slit Nozzle을 맞춤 설계·제작합니다.

[반드시 지킬 규칙]
1. 아래 <참고자료>에 있는 내용만 근거로 답하세요. 자료에 없는 수치, 가격, 납기 일수, 사양, 인증명은 절대 만들어내지 마세요.
2. 자료로 답할 수 없는 질문이면 추측하지 말고 "담당자 확인이 필요하다"고 안내하세요.
3. 확정 견적과 정밀 사양은 담당자 검토가 필요하다는 점을 금액·납기 관련 답변에 덧붙이세요.
4. 3~5문장 또는 짧은 불릿으로 간결하게 답하세요. 인사말을 매번 반복하지 마세요.
5. 아직 모르는 정보가 있으면 답변 끝에 자연스러운 확인 질문 1개만 덧붙이세요.
6. 개인정보(주민번호, 계좌 등)를 요구하지 마세요.
7. 반드시 $langName 로 답하세요.

<참고자료>
$kbText
</참고자료>

<현재까지 파악된 고객 정보>
$slotText
</현재까지 파악된 고객 정보>
"@

        $messages = @()
        foreach ($h in @($inp.history)) {
          if ($h -and $h.role -and $h.body) {
            $r = if ($h.role -eq 'assistant') { 'assistant' } else { 'user' }
            $messages += @{ role = $r; content = [string]$h.body }
          }
        }
        $messages += @{ role = 'user'; content = $msg }

        $model = if ($cb.settings.model) { $cb.settings.model } else { 'claude-haiku-4-5-20251001' }
        try {
          $r = Invoke-Anthropic $key @{
            model      = $model
            max_tokens = 600
            system     = $system
            messages   = $messages
          }
          $answer = ''
          foreach ($blk in @($r.content)) { if ($blk.type -eq 'text') { $answer += $blk.text } }
          if ([string]::IsNullOrWhiteSpace($answer)) { Send-Json $resp @{ ai = $false; reason = 'empty answer' }; continue }
          Send-Json $resp @{ ai = $true; answer = $answer.Trim() }
        } catch {
          Write-Host ("[chatbot] AI 호출 실패: " + $_.Exception.Message) -ForegroundColor Yellow
          Send-Json $resp @{ ai = $false; reason = 'api error' }
        }
        continue
      }

      # 상담원 연결 요청 접수
      if ($path -eq '/api/chatbot/lead' -and $method -eq 'POST') {
        $body = [System.Text.Encoding]::UTF8.GetString((Read-BodyBytes $req))
        $inp = $null
        try { $inp = $body | ConvertFrom-Json } catch { Send-Json $resp @{ ok = $false; error = 'invalid json' } 400; continue }
        if ([string]::IsNullOrWhiteSpace($inp.name) -or [string]::IsNullOrWhiteSpace($inp.contact)) {
          Send-Json $resp @{ ok = $false; error = 'name and contact required' } 400; continue
        }
        $cb = Get-ChatbotData
        if (-not $cb) { Send-Json $resp @{ ok = $false; error = 'no chatbot data' } 500; continue }

        $lead = @{
          id         = ('lead-' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + (Get-Random -Maximum 9999))
          created_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
          name       = (Limit-Text $inp.name 40)
          contact    = (Limit-Text $inp.contact 60)
          email      = (Limit-Text $inp.email 80)
          company    = (Limit-Text $inp.company 60)
          message    = (Limit-Text $inp.message 1000)
          session_id = (Limit-Text $inp.session_id 64)
          slots      = $inp.slots
          transcript = @($inp.transcript | Select-Object -Last 20)
          status     = 'NEW'
        }
        $leads = @($cb.leads) + $lead
        $cb.leads = $leads
        Save-ChatbotData $cb
        Write-Host ("[chatbot] 새 상담 요청: " + $lead.name + " / " + $lead.contact) -ForegroundColor Green
        Send-Json $resp @{ ok = $true }
        continue
      }

      if (-not $authed) { Send-Json $resp @{ ok = $false; error = 'unauthorized' } 401; continue }

      # 관리자용 전체 데이터 (리드 포함)
      if ($path -eq '/api/chatbot/data' -and $method -eq 'GET') {
        Send-Text $resp (Get-Content $script:ChatbotPath -Raw -Encoding UTF8) 200 'application/json; charset=utf-8'
        continue
      }

      if ($path -eq '/api/chatbot/save' -and $method -eq 'POST') {
        $body = [System.Text.Encoding]::UTF8.GetString((Read-BodyBytes $req))
        $inp = $null
        try { $inp = $body | ConvertFrom-Json } catch { Send-Json $resp @{ ok = $false; error = 'invalid json' } 400; continue }
        if (-not $inp.settings -or -not $inp.knowledge) { Send-Json $resp @{ ok = $false; error = 'settings and knowledge required' } 400; continue }
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($script:ChatbotPath, $body, $utf8)
        Send-Json $resp @{ ok = $true }
        continue
      }

      if ($path -eq '/api/save' -and $method -eq 'POST') {
        $body = [System.Text.Encoding]::UTF8.GetString((Read-BodyBytes $req))
        try { $null = $body | ConvertFrom-Json } catch { Send-Json $resp @{ ok = $false; error = 'invalid json' } 400; continue }
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText((Join-Path $root 'content.json'), $body, $utf8)
        $distDir = Join-Path $root 'dist'
        if (Test-Path $distDir) {
          [System.IO.File]::WriteAllText((Join-Path $distDir 'content.json'), $body, $utf8)
          [System.IO.File]::WriteAllText((Join-Path $distDir 'content.js'), ("window.__CONTENT__ = " + $body + ";`r`nwindow.__CONTENT_KO__ = window.__CONTENT__;`r`n"), $utf8)
        }
        Send-Json $resp @{ ok = $true }
        continue
      }

      if ($path -eq '/api/save-en' -and $method -eq 'POST') {
        $body = [System.Text.Encoding]::UTF8.GetString((Read-BodyBytes $req))
        try { $null = $body | ConvertFrom-Json } catch { Send-Json $resp @{ ok = $false; error = 'invalid json' } 400; continue }
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText((Join-Path $root 'content_en.json'), $body, $utf8)
        $distDir = Join-Path $root 'dist'
        if (Test-Path $distDir) {
          [System.IO.File]::WriteAllText((Join-Path $distDir 'content_en.json'), $body, $utf8)
          [System.IO.File]::WriteAllText((Join-Path $distDir 'content_en.js'), ("window.__CONTENT_EN__ = " + $body + ";`r`n"), $utf8)
        }
        Send-Json $resp @{ ok = $true }
        continue
      }

      if ($path -eq '/api/upload' -and $method -eq 'POST') {
        $q = $req.QueryString
        $folderKey = $q['folder']
        $name = Sanitize-Name $q['name']
        if (-not $uploadDirs.ContainsKey($folderKey) -or [string]::IsNullOrEmpty($name)) {
          Send-Json $resp @{ ok = $false; error = 'bad folder or name' } 400; continue
        }
        $relDir = $uploadDirs[$folderKey]
        $absDir = Join-Path $root $relDir
        if (-not (Test-Path $absDir)) { New-Item -ItemType Directory -Path $absDir -Force | Out-Null }
        $bytes = Read-BodyBytes $req
        $absFile = Join-Path $absDir $name
        [System.IO.File]::WriteAllBytes($absFile, $bytes)
        $distDir = Join-Path $root 'dist'
        if (Test-Path $distDir) {
          $distAbsDir = Join-Path $distDir $relDir
          if (-not (Test-Path $distAbsDir)) { New-Item -ItemType Directory -Path $distAbsDir -Force | Out-Null }
          [System.IO.File]::WriteAllBytes((Join-Path $distAbsDir $name), $bytes)
        }
        $relPath = ($relDir.TrimEnd('/') + '/' + $name)
        Send-Json $resp @{ ok = $true; path = $relPath }
        continue
      }

      Send-Json $resp @{ ok = $false; error = 'not found' } 404
      continue
    }

    # ---------- Static files ----------
    $rel = $path.TrimStart('/')
    if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
    if ($blocked -contains $rel) { Send-Text $resp 'Forbidden' 403; continue }

    $file = Join-Path $root $rel
    if (Test-Path $file -PathType Container) { $file = Join-Path $file 'index.html' }
    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $resp.ContentType = $mime[$ext] }
      $resp.Headers['Cache-Control'] = 'no-store'
      $b = [System.IO.File]::ReadAllBytes($file)
      $resp.ContentLength64 = $b.Length
      $resp.OutputStream.Write($b, 0, $b.Length)
      $resp.OutputStream.Close()
    } else {
      Send-Text $resp '404 Not Found' 404
    }
  } catch {
    try { $resp.StatusCode = 500; $resp.OutputStream.Close() } catch {}
  }
}
