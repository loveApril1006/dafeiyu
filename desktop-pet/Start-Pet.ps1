param([switch]$Hide,[switch]$NoBackends)
$ErrorActionPreference='Stop'
$suiteRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $suiteRoot 'Runtime-Common.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$root=$PSScriptRoot
$node=Get-SuiteNode $suiteRoot
if(-not(Test-Path -LiteralPath $node)){$node=(Get-Command node.exe -ErrorAction Stop).Source}
$petLog=Join-Path $root '..\logs\pet-start.log'
function Invoke-PetCommand([string]$File,[string[]]$Arguments){
  $savedPreference=$ErrorActionPreference
  try{
    $ErrorActionPreference='Continue'
    $lines=@(& $node $File @Arguments 2>&1)
    $code=$LASTEXITCODE
  }finally{$ErrorActionPreference=$savedPreference}
  $text=($lines|ForEach-Object {$_.ToString()}) -join [Environment]::NewLine
  $text=$text -replace '([?&]token=)[^\s&]+','$1[隐藏]'
  [IO.Directory]::CreateDirectory((Split-Path $petLog))|Out-Null
  [IO.File]::AppendAllText($petLog,('['+[DateTimeOffset]::Now.ToString('o')+'] '+[IO.Path]::GetFileName($File)+' (exit '+$code+')'+[Environment]::NewLine+$text+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
  if($text){Write-Output $text}
  if($code -ne 0){throw ('桌宠启动失败：'+$text.Trim()+[Environment]::NewLine+'详细日志：'+[IO.Path]::GetFullPath($petLog))}
}
try {
  $installedHome=[IO.Path]::GetFullPath((Join-Path $root '..\engine-home'))
  $fullRelease=Test-Path -LiteralPath (Join-Path $root '..\full-release.json')
  if($fullRelease){
    $env:DSH_HOME=$installedHome;$env:DSH_PROFILE='web'
    if(-not $Hide -and -not $NoBackends){
      & (Join-Path $root '..\Start-Stack.ps1')
      if($LASTEXITCODE -ne 0){throw '整套后台启动未完成。'}
      return
    }
  }
  if($Hide){
    Invoke-PetCommand (Join-Path $root 'activate.mjs') @('--stop')
    return
  }
  if(-not $NoBackends){
    & (Join-Path $root '..\GPT-SoVITS\Start-GPT-SoVITS.ps1')
    & (Join-Path $root '..\qq-bridge\companion\Start-Companion.ps1')
  }
  $dsh=Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
  if(-not $dsh -and -not $fullRelease){
    $settings=Get-Content -LiteralPath (Join-Path $root 'deployment.json') -Raw -Encoding UTF8|ConvertFrom-Json
    if(-not(Test-Path -LiteralPath $settings.dshExe)){throw '找不到 DSH，请先打开 DeepSeek Harness。'}
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Start-Process -FilePath $settings.dshExe -WindowStyle Hidden|Out-Null
    Start-Sleep -Seconds 5
  }
  Invoke-PetCommand (Join-Path $root 'activate.mjs') @()
  Invoke-PetCommand (Join-Path $root 'pet-client.mjs') @('show')
} catch {
  if(-not $NoBackends){Add-Type -AssemblyName PresentationFramework;[Windows.MessageBox]::Show($_.Exception.Message,'大肥鱼桌宠')|Out-Null}
  throw
}
