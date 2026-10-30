$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

function Test-ListeningPort([int]$Port) {
    $listeners = netstat -ano -p tcp | Select-String -Pattern (":$Port\s+.*LISTENING\s+\d+\s*$")
    return [bool]$listeners
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required. Install Node.js 20 or newer, then run npm start again.'
}

$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required (found $nodeMajor)."
}

foreach ($workspace in @('', 'backend', 'frontend')) {
    $workspacePath = if ($workspace) { Join-Path $projectRoot $workspace } else { $projectRoot }
    $manifest = Join-Path $workspacePath 'package.json'
    $modules = Join-Path $workspacePath 'node_modules'

    if (-not (Test-Path $manifest)) {
        throw "Missing package manifest: $manifest"
    }

    if (-not (Test-Path $modules)) {
        Write-Host "Installing dependencies in $([System.IO.Path]::GetRelativePath($projectRoot, $workspacePath))..."
        Push-Location $workspacePath
        try {
            & npm.cmd ci
            if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
        }
        finally {
            Pop-Location
        }
    }
}

$backendEnv = Join-Path $projectRoot 'backend/.env'
if (-not (Test-Path $backendEnv)) {
    Write-Host 'Creating a local development backend/.env with unique development keys.'
    $envContent = Get-Content (Join-Path $projectRoot 'backend/.env.example') -Raw
    $envContent = $envContent.Replace('mongodb+srv://<username>:<password>@<cluster-host>/medibridge?retryWrites=true&w=majority', 'mongodb://127.0.0.1:27017/medibridge_dev')
    $envContent = $envContent.Replace('AI_PROVIDER=gemini', 'AI_PROVIDER=mock')
    foreach ($secretName in @('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'PHI_ENCRYPTION_KEY', 'ACTION_TOKEN_SECRET', 'PRESCRIPTION_SIGNING_KEY')) {
        $secret = (& node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))").Trim()
        if ($LASTEXITCODE -ne 0 -or $secret.Length -ne 64) { throw "Could not generate a development key for $secretName." }
        $envContent = [regex]::Replace($envContent, "(?m)^$secretName=.*$", "$secretName=$secret")
    }
    Set-Content -Path $backendEnv -Value $envContent -NoNewline
}

$frontendEnv = Join-Path $projectRoot 'frontend/.env'
if (-not (Test-Path $frontendEnv)) {
    Copy-Item (Join-Path $projectRoot 'frontend/.env.example') $frontendEnv
}

$mongoUriLine = Get-Content $backendEnv | Where-Object { $_ -match '^\s*MONGODB_URI=' } | Select-Object -First 1
$mongoUri = if ($mongoUriLine) { ($mongoUriLine -split '=', 2)[1].Trim().Trim('"', "'") } else { '' }
if (-not $mongoUri -or $mongoUri -match '<(username|password|cluster-host)>') {
    throw 'backend/.env has no usable MONGODB_URI. Set it to your MongoDB Atlas URI or a running local MongoDB URI.'
}

if ($mongoUri -match '^mongodb://(127\.0\.0\.1|localhost):(?<port>\d+)') {
    $mongoPort = [int]$Matches.port
    $mongoReady = Test-NetConnection 127.0.0.1 -Port $mongoPort -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $mongoReady) {
        $mongoService = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
        if ($mongoService -and $mongoService.Status -ne 'Running') {
            try { Start-Service -Name MongoDB -ErrorAction Stop } catch { Write-Host 'MongoDB service could not start; trying the installed MongoDB executable.' }
            if (-not $mongoReady) {
                Start-Sleep -Seconds 2
                $mongoReady = Test-NetConnection 127.0.0.1 -Port $mongoPort -InformationLevel Quiet -WarningAction SilentlyContinue
            }
        }
        if (-not $mongoReady) {
            $mongoExe = Get-Command mongod.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
            if (-not $mongoExe) {
                $mongoExe = Get-ChildItem (Join-Path $env:ProgramFiles 'MongoDB/Server/*/bin/mongod.exe') -ErrorAction SilentlyContinue |
                    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
            }
            if (-not $mongoExe) {
                throw "No MongoDB server is listening on 127.0.0.1:$mongoPort and mongod.exe was not found. Start/install MongoDB or configure a reachable Atlas URI."
            }

            $mongoDataDir = Join-Path $projectRoot 'backend/.local-db/data'
            $mongoLogDir = Join-Path $projectRoot 'backend/.local-db/logs'
            New-Item -ItemType Directory -Force -Path $mongoDataDir, $mongoLogDir | Out-Null
            $mongoArguments = "--dbpath `"$mongoDataDir`" --port $mongoPort --bind_ip 127.0.0.1 --quiet"
            Start-Process -FilePath $mongoExe -ArgumentList $mongoArguments -WindowStyle Hidden `
                -RedirectStandardOutput (Join-Path $mongoLogDir 'mongod.out.log') `
                -RedirectStandardError (Join-Path $mongoLogDir 'mongod.err.log') | Out-Null

            $mongoDeadline = (Get-Date).AddSeconds(15)
            do {
                Start-Sleep -Milliseconds 500
                $mongoReady = Test-NetConnection 127.0.0.1 -Port $mongoPort -InformationLevel Quiet -WarningAction SilentlyContinue
            } until ($mongoReady -or (Get-Date) -ge $mongoDeadline)
            if (-not $mongoReady) {
                throw "MongoDB did not start on 127.0.0.1:$mongoPort. Check backend/.local-db/logs/mongod.err.log."
            }
        }
    }
}

$env:MONGODB_URI = $mongoUri
$env:PORT = '5500'
while (Test-ListeningPort ([int]$env:PORT)) {
    $env:PORT = [string]([int]$env:PORT + 1)
}
$env:VITE_PORT = '5300'
while (Test-ListeningPort ([int]$env:VITE_PORT)) {
    $env:VITE_PORT = [string]([int]$env:VITE_PORT + 1)
}
$env:FRONTEND_URL = "http://localhost:$($env:VITE_PORT)"
$env:VITE_API_URL = "http://localhost:$($env:PORT)/api/v1"
if ($env:OS -eq 'Windows_NT') {
    $shimPath = (Join-Path $projectRoot 'scripts/windows-node-userinfo-shim.cjs') -replace '\\', '/'
    $env:NODE_OPTIONS = (("$($env:NODE_OPTIONS) --require=$shimPath").Trim())
}

Write-Host "Starting MediBridge API on :$($env:PORT) and website on :$($env:VITE_PORT). Keep this terminal open; press Ctrl+C to stop both."
& npm.cmd run dev
exit $LASTEXITCODE
