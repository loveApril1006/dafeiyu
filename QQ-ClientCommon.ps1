function Get-QQProcessSnapshot {
  param([object[]]$Processes)
  if(-not $PSBoundParameters.ContainsKey('Processes')){$Processes=@(Get-CimInstance Win32_Process -Filter "Name='QQ.exe'" -ErrorAction Stop)}
  $main=@();$unknown=@();$auxiliary=@()
  foreach($item in $Processes){
    $number=[int]$item.ProcessId
    if(-not $item.CommandLine){$unknown+=$number}
    elseif($item.CommandLine -match '(?:^|\s)--(?:type(?:=|\s)|crashpad-handler(?:\s|$))'){$auxiliary+=$number}
    else{$main+=$number}
  }
  [pscustomobject]@{mainPids=@($main);unknownPids=@($unknown);auxiliaryPids=@($auxiliary);count=$Processes.Count}
}
