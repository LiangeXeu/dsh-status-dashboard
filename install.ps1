# 把 dsh-status-dashboard 安装进指定 DSH profile（默认 relstate-desktop）。
# 版本取自本目录 package.json；只复制包、建 junction、改 profile 的 package.json。
param(
  [string]$DshHome = 'C:\DSH-NEXT-Lab',
  [string]$Profile = 'relstate-desktop'
)
$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$meta = Get-Content (Join-Path $source 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$version = $meta.version
$target = Join-Path $DshHome "plugins\dsh-status-dashboard\$version"
$profileDir = Join-Path $DshHome "profiles\$Profile"
if (-not (Test-Path $profileDir)) { throw "profile 不存在: $profileDir" }

Write-Host "复制插件 $version 到 $target"
New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem $target -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item "$source\package.json","$source\client.js","$source\cordis.patch.yml","$source\README.md","$source\LICENSE","$source\MARKET.md" -Destination $target -Force
Copy-Item "$source\lib" -Destination $target -Recurse -Force
Copy-Item "$source\assets" -Destination $target -Recurse -Force
Copy-Item "$source\docs" -Destination $target -Recurse -Force

$link = Join-Path $profileDir 'node_modules\dsh-status-dashboard'
if (Test-Path $link) { (Get-Item $link).Delete() }
cmd /c mklink /J "$link" "$target" | Out-Null

$pkgPath = Join-Path $profileDir 'package.json'
Copy-Item $pkgPath "$pkgPath.bak-status-dashboard" -Force
$env:STATUS_PKG_PATH = $pkgPath
$env:STATUS_VERSION = $version
node -e "const fs=require('fs'); const p=process.env.STATUS_PKG_PATH; const v=process.env.STATUS_VERSION; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.dependencies=pkg.dependencies||{}; pkg.dependencies['dsh-status-dashboard']='file:../../plugins/dsh-status-dashboard/'+v; const bundles=(pkg.dsh&&pkg.dsh.profile&&pkg.dsh.profile.bundles)||[]; if(!bundles.includes('dsh-status-dashboard')) bundles.push('dsh-status-dashboard'); pkg.dsh=pkg.dsh||{}; pkg.dsh.profile=pkg.dsh.profile||{}; pkg.dsh.profile.bundles=bundles; fs.writeFileSync(p, JSON.stringify(pkg,null,2)+'\n');"

Write-Host "已安装 $version。重启 DSH 后生效。"
