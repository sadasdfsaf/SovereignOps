$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
python (Join-Path $Root "scripts\smoke.py") --root $Root

