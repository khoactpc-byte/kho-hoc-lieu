$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host ""
Write-Host "=== KHO HOC LIEU - UP LEN GITHUB ===" -ForegroundColor Cyan
Write-Host "Thu muc: $repoRoot"
Write-Host ""

try {
  git rev-parse --is-inside-work-tree *> $null
} catch {
  Write-Host "Thu muc nay khong phai Git repo." -ForegroundColor Red
  exit 1
}

$branch = (git branch --show-current).Trim()
if (-not $branch) {
  Write-Host "Chua xac dinh duoc nhanh Git hien tai." -ForegroundColor Red
  exit 1
}

$changes = git status --short
if (-not $changes) {
  Write-Host "Khong co thay doi nao de up." -ForegroundColor Green
  exit 0
}

Write-Host "Cac file se duoc dua len:" -ForegroundColor Yellow
$changes | ForEach-Object { Write-Host "  $_" }
Write-Host ""

$confirm = Read-Host "Go Y roi Enter de tiep tuc up len GitHub"
if ($confirm -notin @("Y", "y")) {
  Write-Host "Da huy. Chua thay doi gi tren GitHub." -ForegroundColor Yellow
  exit 0
}

$defaultMessage = "Update app $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$message = Read-Host "Nhap noi dung commit, hoac Enter de dung: $defaultMessage"
if ([string]::IsNullOrWhiteSpace($message)) {
  $message = $defaultMessage
}

Write-Host ""
Write-Host "Dang dua file vao commit..." -ForegroundColor Cyan
git add -A

Write-Host "Dang tao commit..." -ForegroundColor Cyan
git commit -m $message

Write-Host "Dang day len GitHub nhanh $branch..." -ForegroundColor Cyan
git push origin $branch

Write-Host ""
Write-Host "Xong. Da up len GitHub, Netlify se tu deploy neu dang bat auto deploy." -ForegroundColor Green
