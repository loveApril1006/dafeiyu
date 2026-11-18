. (Join-Path $PSScriptRoot 'Port-Common.ps1')
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
function Initialize-BackendControl([string]$Root){
  $directory=Join-Path $Root 'runtime-control'
  [IO.Directory]::CreateDirectory($directory)|Out-Null
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  [IO.Directory]::SetAccessControl($directory,$acl)
}
function Get-BackendState([string]$Root,[string]$Service,[int]$Port){
  if($Service -eq 'qq' -and (Test-ExternalQQGateway $Root)){
    try{$raw=& (Get-SuiteNode $Root) (Join-Path $Root 'qq-gateway.mjs') status $Root 2>$null;return ($raw|ConvertFrom-Json)}catch{return [pscustomobject]@{external=$true;running=$false;ready=$false;managed=$false;foreign=$false;port='';url='';label='请自行安装并启动QQ框架'}}
  }
  $node=Get-SuiteNode $Root
  $entry=Join-Path $Root 'qq-bridge\start-qq-bridge.mjs'
  $listeners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  $owned=@();$foreign=$false
  foreach($listener in $listeners){
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
    $rightCommand=if($Service -eq 'qq'){$process.CommandLine -match '(?:\s|["\\/])index\.mjs(?:["\s]|$)'}else{$process.CommandLine -and $process.CommandLine.IndexOf($entry,[StringComparison]::OrdinalIgnoreCase) -ge 0}
    if((Test-SuiteNodePath $Root $process.ExecutablePath) -and $rightCommand){$owned+=,$process}else{$foreign=$true}
  }
  if(-not$listeners.Count){
    $owned=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
      (Test-SuiteNodePath $Root $_.ExecutablePath) -and $(if($Service -eq 'qq'){$_.CommandLine -match '(?:\s|["\\/])index\.mjs(?:["\s]|$)'}else{$_.CommandLine -and $_.CommandLine.IndexOf($entry,[StringComparison]::OrdinalIgnoreCase) -ge 0})
    })
  }
  $record=$null
  try{$record=Get-Content -LiteralPath (Join-Path $Root ('runtime-control\'+$Service+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
  $managed=$owned.Count -eq 1 -and $record -and [int]$record.pid -eq $owned[0].ProcessId -and $record.service -eq $Service
  $label=if($foreign){'端口被其他程序占用'}elseif($owned.Count -eq 0){'已关闭'}elseif(-not$listeners.Count){'正在启动 / 尚未就绪'}elseif($managed){'运行中'}else{'运行中（旧启动方式）'}
  if($Service -eq 'qq' -and $owned.Count -eq 1 -and $listeners.Count){
    try{
      $upstream=Get-Content -LiteralPath (Join-Path $Root 'runtime-control\qq-upstream-status.json') -Raw -Encoding UTF8 -ErrorAction Stop|ConvertFrom-Json
      $age=([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse([string]$upstream.at)).TotalSeconds
      if([int]$upstream.parentPid -eq $owned[0].ProcessId -and $age -ge 0 -and $age -lt 40){
        $states=@{'process-not-detected'='Windows有QQ，原生未识别';'process-inspect-failed'='Windows进程检查失败';'online'='QQ在线';'consent-required'='等待确认协议';'qq-login-required'='等待QQ扫码登录';'web-login-required'='等待后台登录';'connecting'='正在连接QQ';'select-process'='请在5099选择QQ';'qq-client-required'='请安装或打开QQ';'onebot-not-ready'='QQ在线，接口待就绪';'load-failed'='QQ加载失败';'load-timeout'='QQ加载超时';'pipe-timeout'='QQ组件连接超时';'gateway-auth'='QQ接口认证失败';'unavailable'='QQ上游未就绪'}
        if($states.ContainsKey([string]$upstream.state)){$label+=' · '+$states[[string]$upstream.state]}
      }
    }catch{}
  }
  $retiring=$Service -eq 'qq' -and -not$listeners.Count -and (Test-Path -LiteralPath (Join-Path $Root 'runtime-control\qq.stopped'))
  if($retiring){$label='已停止（旧进程退出中，可重新启动）'}
  [pscustomobject]@{running=($owned.Count -gt 0 -and -not$retiring);ready=($owned.Count -gt 0 -and $listeners.Count -gt 0);managed=[bool]$managed;foreign=$foreign;pid=$(if($owned.Count){$owned[0].ProcessId}else{0});label=$label;port=$Port}
}
function Send-BackendControl([string]$Root,[string]$Service,[int]$ExpectedPid){
  $record=Get-Content -LiteralPath (Join-Path $Root ('runtime-control\'+$Service+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
  if([int]$record.pid -ne $ExpectedPid -or $record.service -ne $Service -or $record.pipeName -notmatch '^xiaoge-[a-f0-9]{16}-(bridge|qq|engine)-[a-f0-9]{16}$'){throw '后台控制记录不匹配，请刷新状态后重试。'}
  $pipe=New-Object IO.Pipes.NamedPipeClientStream('.',([string]$record.pipeName),[IO.Pipes.PipeDirection]::InOut)
  try{
    $pipe.Connect(2000)
    $writer=New-Object IO.StreamWriter($pipe,([Text.UTF8Encoding]::new($false)),1024,$true)
    $reader=New-Object IO.StreamReader($pipe,([Text.UTF8Encoding]::new($false)),$false,1024,$true)
    $writer.AutoFlush=$true
    $writer.WriteLine((@{action='stop';token=[string]$record.token}|ConvertTo-Json -Compress))
    $read=$reader.ReadLineAsync()
    if(-not$read.Wait(5000)){throw '后台关闭请求超时，请刷新状态后重试。'}
    $reply=$read.Result|ConvertFrom-Json
    if(-not$reply.ok){throw ([string]$reply.error)}
  }finally{if($writer){$writer.Dispose()};if($reader){$reader.Dispose()};$pipe.Dispose()}
}

function Test-XiaogePetPreference([string]$Root){
  if(-not(Test-Path -LiteralPath (Join-Path $Root 'full-release.json'))){return $false}
  $metadata=Join-Path $Root 'xiaoge-install.json'
  if(Test-Path -LiteralPath $metadata){$installed=Get-Content -LiteralPath $metadata -Raw -Encoding UTF8|ConvertFrom-Json;if($installed.desktopPet -and $installed.desktopPet.enabled -eq $false){return $false}}
  $profileFile=Join-Path $Root 'engine-home\profiles\web\package.json'
  if(-not(Test-Path -LiteralPath $profileFile)){return $false}
  $profile=Get-Content -LiteralPath $profileFile -Raw -Encoding UTF8|ConvertFrom-Json
  return [bool](@($profile.dsh.profile.bundles) -contains 'dsh-pet')
}
