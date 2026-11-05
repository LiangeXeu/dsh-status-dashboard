# 回退到 0.2.1（宿主与前端一起回退），执行后重启 DSH 生效。
param(
  [string]$DshHome = 'C:\DSH-NEXT-Lab',
  [string]$Profile = 'relstate-desktop'
)
$ErrorActionPreference = 'Stop'
$version = '0.2.1'
$target = Join-Path $DshHome "plugins\dsh-status-dashboard\$version"
if (-not (Test-Path $target)) { throw "找不到 0.2.1：$target" }
$profileDir = Join-Path $DshHome "profiles\$Profile"
$link = Join-Path $profileDir 'node_modules\dsh-status-dashboard'
if (Test-Path $link) { (Get-Item $link).Delete() }
cmd /c mklink /J "$link" "$target" | Out-Null
$pkgPath = Join-Path $profileDir 'package.json'
$env:STATUS_PKG_PATH = $pkgPath
$env:STATUS_VERSION = $version
node -e "const fs=require('fs'); const p=process.env.STATUS_PKG_PATH; const v=process.env.STATUS_VERSION; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.dependencies['dsh-status-dashboard']='file:../../plugins/dsh-status-dashboard/'+v; fs.writeFileSync(p, JSON.stringify(pkg,null,2)+'\n');"
Write-Host "已回退到 $version。重启 DSH 后生效。"
