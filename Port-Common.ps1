. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
function Get-XiaogePorts([string]$Root){
  $ports=@{web=5099;bridge=3100;http=3000;ws=3001}
  try{$cfg=Get-Content -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json;if($cfg.consolePort){$ports.bridge=[int]$cfg.consolePort};if($cfg.snowluma.httpUrl){$ports.http=([uri]$cfg.snowluma.httpUrl).Port};if($cfg.snowluma.wsUrl){$ports.ws=([uri]$cfg.snowluma.wsUrl).Port}}catch{}
  try{$runtime=Get-Content -LiteralPath (Join-Path $Root 'SnowLuma\config\runtime.json') -Raw -Encoding UTF8|ConvertFrom-Json;if($runtime.webuiPort){$ports.web=[int]$runtime.webuiPort}}catch{}
  return $ports
}
function Save-XiaogeJson([string]$Path,$Value){
  [IO.File]::WriteAllText(($Path+'.ports-tmp'),($Value|ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
  if(Test-Path -LiteralPath $Path){[IO.File]::SetAccessControl(($Path+'.ports-tmp'),[IO.File]::GetAccessControl($Path))}
  Move-Item -LiteralPath ($Path+'.ports-tmp') -Destination $Path -Force
}
function Enter-XiaogeServiceLock([string]$Root,[string]$Service){
  $hash=[Security.Cryptography.SHA256]::Create();try{$key=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(([IO.Path]::GetFullPath($Root)).ToLowerInvariant()))).Replace('-','').Substring(0,20)}finally{$hash.Dispose()}
  $lock=New-Object Threading.Mutex($false,('Local\XiaogeStart-'+$Service+'-'+$key));$held=$false
  try{try{$held=$lock.WaitOne(15000)}catch [Threading.AbandonedMutexException]{$held=$true};if(-not $held){throw '本安装已有启动操作正在进行，请等待后再刷新。'};return $lock}catch{$lock.Dispose();throw}
}
function Initialize-XiaogePorts([string]$Root){
  $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  if(Test-ExternalQQGateway $Root){
    $ports=Get-XiaogePorts $Root;$port=[int]$ports.bridge;$original=$port
    while($true){
      $listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue);$foreign=$false
      foreach($listener in $listeners){$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess);if(-not(Test-SuiteNodePath $Root $process.ExecutablePath) -or -not $process.CommandLine -or $process.CommandLine.IndexOf((Join-Path $Root 'qq-bridge\start-qq-bridge.mjs'),[StringComparison]::OrdinalIgnoreCase) -lt 0){$foreign=$true}}
      if(-not $foreign){break};$port++;if($port -gt [Math]::Min(65535,$original+2000)){throw '未找到可用桥接控制台端口'}
    }
    if($port -ne $original){$file=Join-Path $Root 'qq-bridge\config.json';$cfg=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;$cfg|Add-Member -NotePropertyName consolePort -NotePropertyValue $port -Force;Save-XiaogeJson $file $cfg;Write-Output ('STATUS|8|控制台端口改用'+$port+'；外部QQ框架的地址和端口未修改')}
    return
  }
  $hash=[Security.Cryptography.SHA256]::Create();try{$key=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant()))).Replace('-','').Substring(0,20)}finally{$hash.Dispose()}
  $mutex=New-Object Threading.Mutex($false,('Local\XiaogePorts-'+$key));$locked=$false
  try{
    try{$locked=$mutex.WaitOne(15000)}catch [Threading.AbandonedMutexException]{$locked=$true}
    if(-not $locked){throw '另一项启动操作正在分配端口，请稍后重试。'}
    $ports=Get-XiaogePorts $Root;$old=@{};foreach($name in $ports.Keys){$old[$name]=$ports[$name]}
    $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
    $owners=@{};$reserved=@{};$conflicts=New-Object 'System.Collections.Generic.List[object]'
    $node=Get-SuiteNode $Root
    foreach($name in @('web','http','ws','bridge')){
      $port=[int]$ports[$name];$foreign=@()
      foreach($listener in @($listeners|Where-Object LocalPort -eq $port)){
        $number=[int]$listener.OwningProcess
        if(-not $owners.ContainsKey($number)){$owners[$number]=Get-CimInstance Win32_Process -Filter ('ProcessId='+$number) -ErrorAction SilentlyContinue}
        $owner=$owners[$number]
        $commandOK=if($name -eq 'bridge'){$owner.CommandLine -and $owner.CommandLine.IndexOf((Join-Path $Root 'qq-bridge\start-qq-bridge.mjs'),[StringComparison]::OrdinalIgnoreCase) -ge 0}else{$owner.CommandLine -match '(?:\s|["\\/])index\.mjs(?:["\s]|$)'}
        if(-not $owner -or -not(Test-SuiteNodePath $Root $owner.ExecutablePath) -or -not $commandOK){$foreign+=,$listener}
      }
      if($foreign.Count -or $reserved.ContainsKey($port)){
        $candidate=$port
        do{
          $candidate++;if($candidate -gt [Math]::Min(65535,$port+2000)){throw ('找不到可用端口，起始端口 '+$port)}
          $available=-not($listeners|Where-Object LocalPort -eq $candidate) -and -not $reserved.ContainsKey($candidate)
          if($available){$probe=$null;try{$probe=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$candidate);$probe.Start()}catch{$available=$false}finally{if($probe){$probe.Stop()}}}
        }while(-not $available)
        $ports[$name]=$candidate
        $conflicts.Add([pscustomobject]@{service=$name;oldPort=$port;newPort=$candidate;pids=@($foreign|Select-Object -ExpandProperty OwningProcess -Unique)})
      }
      $reserved[[int]$ports[$name]]=$true
    }
    if($conflicts.Count){
      foreach($service in @('bridge','qq')){
        $networkChanged=$ports.http -ne $old.http -or $ports.ws -ne $old.ws
        if($service -eq 'bridge' -and -not $networkChanged -and $ports.bridge -eq $old.bridge){continue}
        if($service -eq 'qq' -and -not $networkChanged -and $ports.web -eq $old.web){continue}
        $port=if($service -eq 'bridge'){$old.bridge}else{$old.web};$state=Get-BackendState $Root $service $port
        if($state.running -and -not $state.foreign){
          if(-not $state.managed){throw ('检测到端口冲突；本安装的'+$service+'仍由旧方式运行，请先从原窗口退出该后台，再重试。其他程序未操作。')}
          Send-BackendControl $Root $service $state.pid
          for($i=0;$i -lt 40;$i++){if(-not(Get-CimInstance Win32_Process -Filter ('ProcessId='+$state.pid) -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 250}
          if(Get-CimInstance Win32_Process -Filter ('ProcessId='+$state.pid) -ErrorAction SilentlyContinue){throw '本安装后台仍在退出，未修改端口，请稍后重试。'}
        }
      }
      $backup=Join-Path $Root ('runtime-control\port-backups\'+(Get-Date -Format yyyyMMdd-HHmmss)+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6));[IO.Directory]::CreateDirectory($backup)|Out-Null
      $bridgeFile=Join-Path $Root 'qq-bridge\config.json';$cfg=Get-Content -LiteralPath $bridgeFile -Raw -Encoding UTF8|ConvertFrom-Json
      Copy-Item -LiteralPath $bridgeFile -Destination (Join-Path $backup 'bridge.json')
      $cfg|Add-Member -NotePropertyName consolePort -NotePropertyValue $ports.bridge -Force
      $cfg.snowluma|Add-Member -NotePropertyName httpUrl -NotePropertyValue ('http://127.0.0.1:'+$ports.http) -Force
      $cfg.snowluma|Add-Member -NotePropertyName wsUrl -NotePropertyValue ('ws://127.0.0.1:'+$ports.ws) -Force
      $cfg.snowluma|Add-Member -NotePropertyName followDiscoveredEndpoint -NotePropertyValue $false -Force
      Save-XiaogeJson $bridgeFile $cfg
      $runtimeFile=Join-Path $Root 'SnowLuma\config\runtime.json'
      $runtime=if(Test-Path -LiteralPath $runtimeFile){Get-Content -LiteralPath $runtimeFile -Raw -Encoding UTF8|ConvertFrom-Json}else{[pscustomobject]@{}}
      if(Test-Path -LiteralPath $runtimeFile){Copy-Item -LiteralPath $runtimeFile -Destination (Join-Path $backup 'runtime.json')}
      $runtime|Add-Member -NotePropertyName webuiPort -NotePropertyValue $ports.web -Force;Save-XiaogeJson $runtimeFile $runtime
      foreach($file in @(Get-ChildItem -LiteralPath (Join-Path $Root 'SnowLuma\config') -File|Where-Object {$_.Name -match '^onebot(?:_\d+)?\.json$'})){
        $config=Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8|ConvertFrom-Json;Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $backup $file.Name)
        foreach($pair in @(@('httpServers','http'),@('wsServers','ws'))){
          $kind=$pair[0];$name=$pair[1]
          foreach($adapter in @($config.networks.$kind)){
            if($adapter -and (($adapter.name -eq ('local-'+$name)) -or ([int]$adapter.port -eq [int]$old[$name] -and $adapter.host -in @('127.0.0.1','localhost','::1')))){$adapter|Add-Member -NotePropertyName port -NotePropertyValue $ports[$name] -Force}
          }
        }
        Save-XiaogeJson $file.FullName $config
      }
      foreach($conflict in $conflicts){Write-Output ('STATUS|8|'+$conflict.service+'端口'+$conflict.oldPort+'已占用，已为本安装改用'+$conflict.newPort+'；原进程未关闭')}
    }
    [IO.Directory]::CreateDirectory((Join-Path $Root 'runtime-control'))|Out-Null
    Save-XiaogeJson (Join-Path $Root 'local-ports.json') ([pscustomobject]@{web=$ports.web;bridge=$ports.bridge;http=$ports.http;ws=$ports.ws;conflicts=@($conflicts.ToArray());at=[DateTimeOffset]::UtcNow.ToString('o')})
    $note=Join-Path $Root '后台登录信息.txt'
    if(Test-Path -LiteralPath $note){$text=[IO.File]::ReadAllText($note);$text=$text.Replace(('http://127.0.0.1:'+$old.bridge+'/'),('http://127.0.0.1:'+$ports.bridge+'/')).Replace(('http://127.0.0.1:'+$old.web+'/'),('http://127.0.0.1:'+$ports.web+'/'));[IO.File]::WriteAllText($note,$text,[Text.UTF8Encoding]::new($false))}
  }finally{if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
