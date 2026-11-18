function Get-SuiteNode([string]$Root){
  foreach($relative in @('runtime\node.exe','SnowLuma\node.exe')){$file=Join-Path $Root $relative;if(Test-Path -LiteralPath $file -PathType Leaf){return [IO.Path]::GetFullPath($file)}}
  throw '缺少独立Node运行环境，请使用完整安装包修复。'
}
function Test-ExternalQQGateway([string]$Root){
  $officialFile=Join-Path $Root 'qq-bridge\state\qq-official\config.json'
  if(Test-Path -LiteralPath $officialFile){$official=Get-Content -LiteralPath $officialFile -Raw -Encoding UTF8|ConvertFrom-Json;if($official.enabled){return $true}}
  return Test-Path -LiteralPath (Join-Path $Root 'external-qq-gateway.json') -PathType Leaf
}
function Test-SuiteNodePath([string]$Root,[string]$Executable){
  return $Executable -and ($Executable -in @((Join-Path $Root 'runtime\node.exe'),(Join-Path $Root 'SnowLuma\node.exe')))
}
function Test-SuiteInstallation([string]$Root){
  return (Test-Path -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -PathType Leaf) -and (Test-Path -LiteralPath (Join-Path $Root 'Start-Stack.ps1') -PathType Leaf)
}
function Get-SuiteInstallOptions([string]$Root){
  foreach($name in @('dafeiyu-install.json','xiaoge-install.json')){
    $file=Join-Path $Root $name
    if(Test-Path -LiteralPath $file -PathType Leaf){return Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json}
  }
  if(-not(Test-SuiteInstallation $Root)){throw '大肥鱼安装文件不完整，请修复安装。'}
  $config=Get-Content -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  return [pscustomobject]@{qqEnabled=[bool]$config.snowluma}
}
