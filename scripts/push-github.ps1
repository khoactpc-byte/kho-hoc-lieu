$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-CheckedGit {
  param([string[]]$Arguments)
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Lenh Git that bai. Chua xac nhan up thanh cong."
  }
}

# Ignore rules do not protect files already tracked or staged by Git.
$privatePaths = @(':(top,glob)apps-script/**', ':(top,glob)**/*.gs')

Write-Host ""
Write-Host "=== KHO HOC LIEU - UP LEN GITHUB ===" -ForegroundColor Cyan
Write-Host "Thu muc: $repoRoot"
Write-Host ""

try {
  $null = Invoke-CheckedGit -Arguments @('rev-parse', '--is-inside-work-tree')
  $branch = (Invoke-CheckedGit -Arguments @('branch', '--show-current')).Trim()
  if (-not $branch) { throw "Chua xac dinh duoc nhanh Git hien tai." }
  $remoteRef = "refs/remotes/origin/$branch"
  $null = Invoke-CheckedGit -Arguments @('rev-parse', '--verify', $remoteRef)
  $changes = @(Invoke-CheckedGit -Arguments @('status', '--short'))
  $pending = [int](Invoke-CheckedGit -Arguments @('rev-list', '--count', "$remoteRef..HEAD"))
  if (-not $changes.Count -and -not $pending) {
    Write-Host "Khong co thay doi nao de up." -ForegroundColor Green
    exit 0
  }

  Write-Host "Cac thay doi hien tai:" -ForegroundColor Yellow
  $changes | ForEach-Object { Write-Host "  $_" }
  Write-Host "Apps Script (apps-script/ va *.gs) chi giu trong may, khong up noi dung."
  Write-Host "Ma da tung up truoc day van con trong lich su Git."
  if ($pending) { Write-Host "Co $pending commit chua day len GitHub." }
  Write-Host ""
  $confirm = Read-Host "Go Y roi Enter de tiep tuc up len GitHub"
  if ($confirm -notin @("Y", "y")) {
    Write-Host "Da huy. Chua thay doi gi tren GitHub." -ForegroundColor Yellow
    exit 0
  }

  # Check remote changes first; never force-push or merge over local work.
  Invoke-CheckedGit -Arguments @('fetch', 'origin')
  & git merge-base --is-ancestor $remoteRef HEAD
  if ($LASTEXITCODE -ne 0) { throw "GitHub co thay doi moi. Can doi chieu ma truoc khi up; file nay khong tu ghi de." }

  $defaultMessage = "Update app $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  $message = Read-Host "Nhap noi dung commit, hoac Enter de dung: $defaultMessage"
  if ([string]::IsNullOrWhiteSpace($message)) { $message = $defaultMessage }

  # Remove protected paths after staging, including files previously added with -f.
  # --cached leaves every local file intact.
  Invoke-CheckedGit -Arguments @('add', '-A')
  Invoke-CheckedGit -Arguments (@('rm', '--cached', '-r', '--ignore-unmatch', '--') + $privatePaths)
  $stagedPrivate = @(Invoke-CheckedGit -Arguments (@('diff', '--cached', '--name-only', '--diff-filter=AMRC', '--') + $privatePaths))
  if ($stagedPrivate.Count) { throw "Van co ma Apps Script trong noi dung commit. Da dung, chua up." }

  & git diff --cached --quiet
  $diffExit = $LASTEXITCODE
  if ($diffExit -eq 1) {
    Invoke-CheckedGit -Arguments @('commit', '-m', $message)
  } elseif ($diffExit -ne 0) { throw "Chua kiem tra duoc cac file chuan bi commit." }

  # A previous unpushed commit can contain private code even after its deletion.
  $privateHistory = @(Invoke-CheckedGit -Arguments (@('log', "$remoteRef..HEAD", '--format=', '--name-only', '--diff-filter=AMRC', '--') + $privatePaths))
  if ($privateHistory.Count) { throw "Commit chua day co noi dung Apps Script. Da dung de tranh lo ma; can doi chieu commit truoc khi up." }

  Write-Host "Dang day len GitHub nhanh $branch..." -ForegroundColor Cyan
  Invoke-CheckedGit -Arguments @('push', 'origin', $branch)
  Write-Host "Xong. Da up len GitHub, Netlify se tu deploy neu dang bat auto deploy." -ForegroundColor Green
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
