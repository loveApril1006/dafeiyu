param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$suiteRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
if(-not $OutputDirectory){$OutputDirectory=Join-Path $suiteRoot 'maintenance\dafeiyu-ui-20261029\build'}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(-not $OutputDirectory.StartsWith($suiteRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw '构建输出必须位于当前项目目录。'}
[IO.Directory]::CreateDirectory($OutputDirectory)|Out-Null
$assets=Join-Path $suiteRoot 'qq-bridge\assets\dafeiyu'
$compiler=Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output=Join-Path $OutputDirectory '大肥鱼.exe'
$arguments=@('/nologo','/target:winexe','/optimize+','/platform:anycpu',('/out:'+$output),('/win32icon:'+(Join-Path $assets 'app-icon.ico')),('/win32manifest:'+(Join-Path $PSScriptRoot 'app.manifest')),'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.Core.dll')
foreach($name in @('hero.png','footer.png','app-icon.png','app-icon.ico')){$arguments+=('/resource:'+(Join-Path $assets $name)+',Dafeiyu.'+$name)}
foreach($name in @('Installer.cs','InstallationDiscovery.cs','ReleaseVersion.cs','OceanTheme.cs','GatewayForm.cs')){$arguments+=(Join-Path $PSScriptRoot $name)}
& $compiler @arguments
if($LASTEXITCODE -ne 0){throw '界面编译失败。'}
Write-Output $output
