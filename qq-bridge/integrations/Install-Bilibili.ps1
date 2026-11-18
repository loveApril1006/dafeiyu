$ErrorActionPreference='Stop'
$runtime=Join-Path $PSScriptRoot 'bilibili-runtime'
$python=Join-Path $runtime 'Scripts\python.exe'
if(-not(Test-Path -LiteralPath $python)){
  & uv venv --python 3.11 $runtime
  if($LASTEXITCODE -ne 0){throw 'Python environment creation failed'}
}
& uv pip install --python $python -r (Join-Path $PSScriptRoot 'bili-pond-upstream\vendor\bilibili-mcp\requirements.txt')
if($LASTEXITCODE -ne 0){throw 'Bilibili dependency installation failed'}
Write-Output 'Bilibili runtime ready.'
