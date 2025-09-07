param(
  [string]$ProjectDir = "C:\Users\b-kap\Desktop\bulldog-autopilot",
  [string]$ProdUrl    = "https://bulldog-autopilot.vercel.app",
  [string]$SupabaseUrl = "https://neydszeamsflpghtrhue.supabase.co",
  [string]$AnonKey    = "",
  [string]$ServiceKey = ""
)

$LogDir = Join-Path $ProjectDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("godmode-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
function Log($m){("[{0}] {1}" -f (Get-Date -Format "u"), $m) | Tee-Object -FilePath $LogFile -Append}

function Upsert-VercelEnv($name, $value) {
  try { vercel env rm $name production --yes | Out-Null } catch {}
  $value | vercel env add $name production | Out-Null
}

Push-Location $ProjectDir
try {
  Log "🚀 Bulldog God Mode starting"
  vercel whoami | Tee-Object -FilePath $LogFile -Append

  if (-not $AnonKey)    { $AnonKey    = $env:SUPABASE_ANON_KEY }
  if (-not $ServiceKey) { $ServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY }

  Log "⚡ Upserting env vars"
  Upsert-VercelEnv "NEXT_PUBLIC_SUPABASE_URL" $SupabaseUrl
  if ($AnonKey)    { Upsert-VercelEnv "NEXT_PUBLIC_SUPABASE_ANON_KEY" $AnonKey }
  if ($ServiceKey) { Upsert-VercelEnv "SUPABASE_SERVICE_ROLE_KEY" $ServiceKey }

  Log "⚡ Redeploying build (force, prod)"
  vercel deploy --prod --force | Tee-Object -FilePath $LogFile -Append

  $api = "$ProdUrl/api/violations/summary"
  Log "⏳ Checking API $api"
  for ($i=0; $i -lt 30; $i++){
    try { $r = Invoke-RestMethod -Uri $api -TimeoutSec 10; Log "✅ API responded: $($r | ConvertTo-Json -Compress)"; break } catch { Start-Sleep 5 }
  }

  $homeUrl = "$ProdUrl/?v=$(Get-Date -Format 'yyyyMMddHHmmss')"
  try {
    $h = Invoke-WebRequest -Uri $homeUrl -UseBasicParsing -TimeoutSec 10
    if ($h.StatusCode -eq 200){ Log "✅ UI responding: $homeUrl" }
  } catch { Log "⚠️ UI check failed: $_" }

  Log "🏁 God Mode complete"
} finally {
  Pop-Location
}
