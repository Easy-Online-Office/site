[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$SubscriptionId,

    [string]$TenantId,
    [string]$ResourceGroup = 'rg-easyfile-referrals-prod',
    [string]$Location = 'southafricanorth',
    [string]$FunctionAppName = 'easyfile-referrals-prod',
    [string]$StorageAccountName,
    [string]$ApplicationInsightsName,
    [string]$KeyVaultName,

    # For Entra cookie authentication, prefer a same-site API hostname such as api.easyfile.co.za.
    [string]$CustomDomain = 'api.easyfile.co.za',
    [string]$DnsZoneName = 'easyfile.co.za',
    [string]$DnsResourceGroup,
    [switch]$ConfigureAzureDns,

    [string[]]$AllowedOrigins = @(
        'https://www.easyfile.co.za',
        'https://easyfile.co.za'
    ),

    [string]$GitHubRepository = 'Easy-Online-Office/site',
    [string]$RepositoryPath = (Get-Location).Path,

    [ValidateSet('Disabled', 'PrepareEntra', 'ActivateEntra')]
    [string]$IdentityMode = 'PrepareEntra',
    [string]$EntraAppDisplayName = 'EasyFile Referral API Production',

    [switch]$DeployWithGitHubActions,
    [switch]$SkipCustomDomain,
    [switch]$SkipGitHubConfiguration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Warning $Message
}

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found. Install it and reopen PowerShell."
    }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowFailure,
        [switch]$Raw
    )

    $output = & $Command @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $rendered = $Arguments -join ' '
        throw "$Command $rendered failed with exit code $exitCode.`n$($output -join [Environment]::NewLine)"
    }

    if ($Raw) { return ($output -join [Environment]::NewLine) }
    return $output
}

function Invoke-Az {
    param([Parameter(Mandatory)][string[]]$Arguments, [switch]$AllowFailure, [switch]$Raw)
    $args = @('--only-show-errors') + $Arguments
    Invoke-Native -Command 'az' -Arguments $args -AllowFailure:$AllowFailure -Raw:$Raw
}

function Invoke-AzJson {
    param([Parameter(Mandatory)][string[]]$Arguments, [switch]$AllowFailure)
    $nativeArguments = @('--only-show-errors') + $Arguments + @('--output', 'json')
    $output = & az @nativeArguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = $output -join [Environment]::NewLine
    if ($exitCode -ne 0) {
        if ($AllowFailure) { return $null }
        throw "az $($Arguments -join ' ') failed with exit code $exitCode.`n$text"
    }
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    try { return $text | ConvertFrom-Json -Depth 100 }
    catch { throw "Azure CLI returned invalid JSON.`n$text" }
}

function Invoke-Gh {
    param([Parameter(Mandatory)][string[]]$Arguments, [switch]$AllowFailure, [switch]$Raw)
    Invoke-Native -Command 'gh' -Arguments $Arguments -AllowFailure:$AllowFailure -Raw:$Raw
}

function New-RandomSecret {
    param([int]$Bytes = 48)
    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Convert-ToStorageAccountName {
    param([string]$Source)
    $normal = ($Source.ToLowerInvariant() -replace '[^a-z0-9]', '')
    if ($normal.Length -lt 3) { $normal = "easyfileref$normal" }
    if ($normal.Length -gt 18) { $normal = $normal.Substring(0, 18) }
    $suffix = -join ((48..57) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    return ($normal + $suffix).Substring(0, [Math]::Min(24, ($normal + $suffix).Length))
}

function Convert-ToKeyVaultName {
    param([string]$Source)
    $normal = ($Source.ToLowerInvariant() -replace '[^a-z0-9-]', '-').Trim('-')
    if ($normal.Length -gt 17) { $normal = $normal.Substring(0, 17).Trim('-') }
    $suffix = -join ((97..122) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
    return "$normal-$suffix"
}

function Get-RelativeDnsRecordName {
    param([string]$HostName, [string]$ZoneName)
    $suffix = ".$ZoneName"
    if (-not $HostName.EndsWith($suffix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "CustomDomain '$HostName' is not inside DNS zone '$ZoneName'."
    }
    return $HostName.Substring(0, $HostName.Length - $suffix.Length)
}

function Test-EntraClientCompatibility {
    param([string]$Root)

    $frontend = Join-Path $Root 'assets/js/easyfile-referrals.js'
    $backend = Join-Path $Root 'referral-api/src/functions/referrals.js'
    if (-not (Test-Path $frontend)) { throw "Frontend referral client not found: $frontend" }
    if (-not (Test-Path $backend)) { throw "Referral API source not found: $backend" }

    $frontText = Get-Content -Raw -LiteralPath $frontend
    $backText = Get-Content -Raw -LiteralPath $backend
    $problems = [System.Collections.Generic.List[string]]::new()

    if ($frontText -notmatch 'credentials\s*:\s*["'']include["'']') {
        $problems.Add('The browser referral API call does not use credentials: "include".')
    }
    if ($frontText -notmatch '/\.auth/login/aad') {
        $problems.Add('The browser referral client has no /.auth/login/aad sign-in flow.')
    }
    if ($frontText -notmatch '/\.auth/me') {
        $problems.Add('The browser referral client does not resolve the verified account from /.auth/me.')
    }
    if ($backText -notmatch 'Access-Control-Allow-Credentials') {
        $problems.Add('The API does not emit Access-Control-Allow-Credentials for approved origins.')
    }

    if ($problems.Count -gt 0) {
        $detail = $problems | ForEach-Object { " - $_" }
        throw "ActivateEntra was requested, but the checked-out application is not Entra browser-auth compatible:`n$($detail -join [Environment]::NewLine)`nRun with -IdentityMode PrepareEntra, implement the identity client flow, then rerun with -IdentityMode ActivateEntra."
    }
}

function Wait-DnsCname {
    param([string]$HostName, [string]$ExpectedTarget, [int]$Attempts = 30)
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $answer = Resolve-DnsName -Name $HostName -Type CNAME -ErrorAction Stop |
                Where-Object { $_.Type -eq 'CNAME' } |
                Select-Object -First 1
            if ($answer.NameHost.TrimEnd('.').Equals($ExpectedTarget.TrimEnd('.'), [StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
        } catch {}
        Start-Sleep -Seconds 10
    }
    return $false
}

function Set-GitHubSecretFromText {
    param([string]$Name, [string]$Value, [string]$Repository)
    $Value | & gh secret set $Name --repo $Repository --app actions
    if ($LASTEXITCODE -ne 0) { throw "Could not set GitHub Actions secret '$Name'." }
}

function Set-GitHubVariable {
    param([string]$Name, [string]$Value, [string]$Repository)
    Invoke-Gh -Arguments @('variable', 'set', $Name, '--repo', $Repository, '--body', $Value) | Out-Null
}

Assert-Command az
if (-not $SkipGitHubConfiguration) { Assert-Command gh }

Write-Step 'Authenticating and selecting Azure subscription'
Invoke-Az -Arguments @('account', 'show') | Out-Null
Invoke-Az -Arguments @('account', 'set', '--subscription', $SubscriptionId) | Out-Null
$account = Invoke-AzJson -Arguments @('account', 'show')
if ($TenantId -and $account.tenantId -ne $TenantId) {
    throw "Azure CLI is signed into tenant '$($account.tenantId)', not requested tenant '$TenantId'. Run: az login --tenant $TenantId"
}
$TenantId = [string]$account.tenantId
Write-Ok "Azure subscription selected: $SubscriptionId; tenant: $TenantId"

if (-not $SkipGitHubConfiguration) {
    Write-Step 'Validating GitHub CLI authentication'
    Invoke-Gh -Arguments @('auth', 'status') | Out-Null
    Write-Ok "GitHub CLI authenticated for $GitHubRepository"
}

Write-Step 'Registering required Azure resource providers'
foreach ($provider in @('Microsoft.Web', 'Microsoft.Storage', 'Microsoft.Insights', 'Microsoft.KeyVault', 'Microsoft.ManagedIdentity')) {
    Invoke-Az -Arguments @('provider', 'register', '--namespace', $provider, '--wait') | Out-Null
}
Write-Ok 'Azure providers registered'

if (-not $StorageAccountName) { $StorageAccountName = Convert-ToStorageAccountName -Source $FunctionAppName }
if (-not $ApplicationInsightsName) { $ApplicationInsightsName = "$FunctionAppName-ai" }
if (-not $KeyVaultName) { $KeyVaultName = Convert-ToKeyVaultName -Source "$FunctionAppName-kv" }
if (-not $DnsResourceGroup) { $DnsResourceGroup = $ResourceGroup }

Write-Step 'Creating or updating production resource group'
Invoke-Az -Arguments @('group', 'create', '--name', $ResourceGroup, '--location', $Location, '--tags', 'application=EasyFile', 'component=referral-api', 'environment=production') | Out-Null
Write-Ok "Resource group ready: $ResourceGroup"

Write-Step 'Creating secure Storage account'
$storageExists = Invoke-AzJson -Arguments @('storage', 'account', 'show', '--name', $StorageAccountName, '--resource-group', $ResourceGroup) -AllowFailure
if (-not $storageExists) {
    Invoke-Az -Arguments @(
        'storage', 'account', 'create',
        '--name', $StorageAccountName,
        '--resource-group', $ResourceGroup,
        '--location', $Location,
        '--sku', 'Standard_LRS',
        '--kind', 'StorageV2',
        '--min-tls-version', 'TLS1_2',
        '--allow-blob-public-access', 'false',
        '--https-only', 'true'
    ) | Out-Null
}
Write-Ok "Storage ready: $StorageAccountName"

Write-Step 'Creating Application Insights'
$insights = Invoke-AzJson -Arguments @('monitor', 'app-insights', 'component', 'show', '--app', $ApplicationInsightsName, '--resource-group', $ResourceGroup) -AllowFailure
if (-not $insights) {
    Invoke-Az -Arguments @(
        'monitor', 'app-insights', 'component', 'create',
        '--app', $ApplicationInsightsName,
        '--resource-group', $ResourceGroup,
        '--location', $Location,
        '--application-type', 'web'
    ) | Out-Null
}
Write-Ok "Application Insights ready: $ApplicationInsightsName"

Write-Step 'Creating Azure Functions Flex Consumption app'
$functionApp = Invoke-AzJson -Arguments @('functionapp', 'show', '--name', $FunctionAppName, '--resource-group', $ResourceGroup) -AllowFailure
if (-not $functionApp) {
    Invoke-Az -Arguments @(
        'functionapp', 'create',
        '--name', $FunctionAppName,
        '--resource-group', $ResourceGroup,
        '--storage-account', $StorageAccountName,
        '--flexconsumption-location', $Location,
        '--runtime', 'node',
        '--runtime-version', '22',
        '--functions-version', '4',
        '--app-insights', $ApplicationInsightsName,
        '--assign-identity', '[system]'
    ) | Out-Null
}

Invoke-Az -Arguments @('functionapp', 'update', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--https-only', 'true') | Out-Null
Invoke-Az -Arguments @('functionapp', 'config', 'set', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--min-tls-version', '1.2', '--ftps-state', 'Disabled', '--http20-enabled', 'true') -AllowFailure | Out-Null
$functionApp = Invoke-AzJson -Arguments @('functionapp', 'show', '--name', $FunctionAppName, '--resource-group', $ResourceGroup)
$defaultHost = [string]$functionApp.defaultHostName
Write-Ok "Function App ready: https://$defaultHost"

Write-Step 'Creating Key Vault and granting the Function App secret access'
$vault = Invoke-AzJson -Arguments @('keyvault', 'show', '--name', $KeyVaultName, '--resource-group', $ResourceGroup) -AllowFailure
if (-not $vault) {
    Invoke-Az -Arguments @(
        'keyvault', 'create',
        '--name', $KeyVaultName,
        '--resource-group', $ResourceGroup,
        '--location', $Location,
        '--enable-rbac-authorization', 'true',
        '--enable-purge-protection', 'true',
        '--retention-days', '90'
    ) | Out-Null
}
$identity = Invoke-AzJson -Arguments @('functionapp', 'identity', 'assign', '--name', $FunctionAppName, '--resource-group', $ResourceGroup)
$principalId = [string]$identity.principalId
$vault = Invoke-AzJson -Arguments @('keyvault', 'show', '--name', $KeyVaultName, '--resource-group', $ResourceGroup)
Invoke-Az -Arguments @(
    'role', 'assignment', 'create',
    '--assignee-object-id', $principalId,
    '--assignee-principal-type', 'ServicePrincipal',
    '--role', 'Key Vault Secrets User',
    '--scope', [string]$vault.id
) -AllowFailure | Out-Null
Write-Ok "Key Vault ready: $KeyVaultName"

Write-Step 'Generating and storing the HMAC identity secret'
$hmacSecretName = 'easyfile-email-hmac-secret'
$existingHmac = Invoke-AzJson -Arguments @('keyvault', 'secret', 'show', '--vault-name', $KeyVaultName, '--name', $hmacSecretName) -AllowFailure
if (-not $existingHmac) {
    $hmacSecret = New-RandomSecret -Bytes 48
    Invoke-Az -Arguments @('keyvault', 'secret', 'set', '--vault-name', $KeyVaultName, '--name', $hmacSecretName, '--value', $hmacSecret) | Out-Null
}
$hmacSecretUri = "https://$KeyVaultName.vault.azure.net/secrets/$hmacSecretName"
Write-Ok 'HMAC secret stored in Key Vault; secret value was not printed'

$requireVerifiedEmail = 'false'
$entraClientId = $null

if ($IdentityMode -in @('PrepareEntra', 'ActivateEntra')) {
    if ($IdentityMode -eq 'ActivateEntra') {
        Test-EntraClientCompatibility -Root $RepositoryPath
        if ($CustomDomain -notmatch '(^|\.)easyfile\.co\.za$') {
            throw "ActivateEntra requires a same-site EasyFile API domain, for example api.easyfile.co.za. Current value: $CustomDomain"
        }
    }

    Write-Step "Configuring Microsoft Entra App Service Authentication ($IdentityMode)"
    Invoke-Az -Arguments @('extension', 'add', '--name', 'authV2', '--upgrade') -AllowFailure | Out-Null

    $redirectUris = @("https://$defaultHost/.auth/login/aad/callback")
    if (-not $SkipCustomDomain -and $CustomDomain) { $redirectUris += "https://$CustomDomain/.auth/login/aad/callback" }

    $appList = Invoke-AzJson -Arguments @('ad', 'app', 'list', '--display-name', $EntraAppDisplayName)
    $entraApp = @($appList) | Select-Object -First 1
    if (-not $entraApp) {
        $createAppArguments = @(
            'ad', 'app', 'create',
            '--display-name', $EntraAppDisplayName,
            '--sign-in-audience', 'AzureADandPersonalMicrosoftAccount',
            '--web-redirect-uris'
        ) + $redirectUris
        $entraApp = Invoke-AzJson -Arguments $createAppArguments
    } else {
        Invoke-Az -Arguments (@('ad', 'app', 'update', '--id', [string]$entraApp.appId, '--web-redirect-uris') + $redirectUris) | Out-Null
    }
    $entraClientId = [string]$entraApp.appId
    Invoke-Az -Arguments @('ad', 'sp', 'create', '--id', $entraClientId) -AllowFailure | Out-Null

    $entraSecretName = 'easyfile-entra-client-secret'
    $existingEntraSecret = Invoke-AzJson -Arguments @('keyvault', 'secret', 'show', '--vault-name', $KeyVaultName, '--name', $entraSecretName) -AllowFailure
    if (-not $existingEntraSecret) {
        $credential = Invoke-AzJson -Arguments @(
            'ad', 'app', 'credential', 'reset',
            '--id', $entraClientId,
            '--append',
            '--display-name', 'easyfile-easyauth-production',
            '--years', '2'
        )
        Invoke-Az -Arguments @('keyvault', 'secret', 'set', '--vault-name', $KeyVaultName, '--name', $entraSecretName, '--value', [string]($credential.password)) | Out-Null
    }
    $entraSecretUri = "https://$KeyVaultName.vault.azure.net/secrets/$entraSecretName"

    Invoke-Az -Arguments @(
        'functionapp', 'config', 'appsettings', 'set',
        '--name', $FunctionAppName,
        '--resource-group', $ResourceGroup,
        '--settings', "EASYFILE_ENTRA_CLIENT_SECRET=@Microsoft.KeyVault(SecretUri=$entraSecretUri)"
    ) | Out-Null

    $tokenAudiences = @("api://$entraClientId", "https://$defaultHost")
    if (-not $SkipCustomDomain -and $CustomDomain) { $tokenAudiences += "https://$CustomDomain" }
    Invoke-Az -Arguments (@(
        'webapp', 'auth', 'microsoft', 'update',
        '--name', $FunctionAppName,
        '--resource-group', $ResourceGroup,
        '--client-id', $entraClientId,
        '--client-secret-setting-name', 'EASYFILE_ENTRA_CLIENT_SECRET',
        '--issuer', 'https://login.microsoftonline.com/common/v2.0',
        '--allowed-token-audiences'
    ) + $tokenAudiences + @('--yes')) | Out-Null

    $authArguments = @(
        'webapp', 'auth', 'update',
        '--name', $FunctionAppName,
        '--resource-group', $ResourceGroup,
        '--enabled', 'true',
        '--redirect-provider', 'AzureActiveDirectory',
        '--unauthenticated-client-action', 'AllowAnonymous',
        '--require-https', 'true',
        '--enable-token-store', 'true',
        '--proxy-convention', 'NoProxy'
    )
    for ($index = 0; $index -lt $AllowedOrigins.Count; $index++) {
        $authArguments += @('--set', "login.allowedExternalRedirectUrls[$index]=$($AllowedOrigins[$index].TrimEnd('/'))")
    }
    Invoke-Az -Arguments $authArguments | Out-Null

    if ($IdentityMode -eq 'ActivateEntra') { $requireVerifiedEmail = 'true' }
    Write-Ok "Entra provider configured; client ID: $entraClientId; verification active: $requireVerifiedEmail"
}

Write-Step 'Applying Function App production settings'
$originCsv = ($AllowedOrigins | ForEach-Object { $_.TrimEnd('/') } | Select-Object -Unique) -join ','
$appSettings = @(
    'FUNCTIONS_WORKER_RUNTIME=node',
    'EASYFILE_REFERRALS_TABLE=EasyFileReferrals',
    'EASYFILE_REFERRALS_REQUIRED=3',
    'EASYFILE_REQUIRE_IDEMPOTENCY=true',
    "EASYFILE_REQUIRE_EMAIL_VERIFICATION=$requireVerifiedEmail",
    'EASYFILE_MAX_BODY_BYTES=8192',
    "EASYFILE_ALLOWED_ORIGINS=$originCsv",
    "EASYFILE_EMAIL_HMAC_SECRET=@Microsoft.KeyVault(SecretUri=$hmacSecretUri)",
    'EASYFILE_ALLOW_WILDCARD_CORS=false',
    'NODE_ENV=production'
)
Invoke-Az -Arguments (@('functionapp', 'config', 'appsettings', 'set', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--settings') + $appSettings) | Out-Null
Write-Ok 'Production settings applied'

Write-Step 'Restricting platform CORS'
$currentCors = Invoke-AzJson -Arguments @('functionapp', 'cors', 'show', '--name', $FunctionAppName, '--resource-group', $ResourceGroup)
foreach ($origin in @($currentCors.allowedOrigins)) {
    if ($origin) {
        Invoke-Az -Arguments @('functionapp', 'cors', 'remove', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--allowed-origins', [string]$origin) -AllowFailure | Out-Null
    }
}
Invoke-Az -Arguments (@('functionapp', 'cors', 'add', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--allowed-origins') + $AllowedOrigins) | Out-Null
$credentialCors = if ($IdentityMode -eq 'ActivateEntra') { 'true' } else { 'false' }
Invoke-Az -Arguments @('functionapp', 'cors', 'credentials', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--enable', $credentialCors) | Out-Null
Write-Ok "CORS restricted to: $originCsv"

$healthHost = $defaultHost
$domainBound = $false
if (-not $SkipCustomDomain -and $CustomDomain) {
    Write-Step "Configuring custom API domain: $CustomDomain"
    $verificationId = Invoke-Az -Arguments @('webapp', 'show', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--query', 'customDomainVerificationId', '--output', 'tsv') -Raw
    $recordName = Get-RelativeDnsRecordName -HostName $CustomDomain -ZoneName $DnsZoneName

    if ($ConfigureAzureDns) {
        $zone = Invoke-AzJson -Arguments @('network', 'dns', 'zone', 'show', '--name', $DnsZoneName, '--resource-group', $DnsResourceGroup) -AllowFailure
        if (-not $zone) { throw "Azure DNS zone '$DnsZoneName' was not found in resource group '$DnsResourceGroup'." }

        Invoke-Az -Arguments @('network', 'dns', 'record-set', 'cname', 'set-record', '--resource-group', $DnsResourceGroup, '--zone-name', $DnsZoneName, '--record-set-name', $recordName, '--cname', $defaultHost) | Out-Null
        Invoke-Az -Arguments @('network', 'dns', 'record-set', 'txt', 'create', '--resource-group', $DnsResourceGroup, '--zone-name', $DnsZoneName, '--name', "asuid.$recordName", '--ttl', '300') | Out-Null
        Invoke-Az -Arguments @('network', 'dns', 'record-set', 'txt', 'add-record', '--resource-group', $DnsResourceGroup, '--zone-name', $DnsZoneName, '--record-set-name', "asuid.$recordName", '--value', $verificationId) -AllowFailure | Out-Null
        Write-Ok 'Azure DNS CNAME and domain-verification TXT records created'
    } else {
        Write-Warn "Create these DNS records at your DNS provider before rerunning or continuing:`nCNAME $recordName -> $defaultHost`nTXT asuid.$recordName -> $verificationId"
    }

    if (Wait-DnsCname -HostName $CustomDomain -ExpectedTarget $defaultHost -Attempts 3) {
        Invoke-Az -Arguments @('functionapp', 'config', 'hostname', 'add', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--hostname', $CustomDomain) | Out-Null
        $certificate = Invoke-AzJson -Arguments @('functionapp', 'config', 'ssl', 'create', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--hostname', $CustomDomain) -AllowFailure
        if ($certificate -and $certificate.thumbprint) {
            Invoke-Az -Arguments @('functionapp', 'config', 'ssl', 'bind', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--certificate-thumbprint', [string]$certificate.thumbprint, '--ssl-type', 'SNI') -AllowFailure | Out-Null
        }
        $healthHost = $CustomDomain
        $domainBound = $true
        Write-Ok "Custom domain bound: https://$CustomDomain"
    } else {
        Write-Warn "DNS has not propagated yet. The Function App remains reachable at https://$defaultHost. Rerun after DNS resolves to bind TLS."
    }
}

$healthUrl = "https://$healthHost/api/referrals/health"

if (-not $SkipGitHubConfiguration) {
    Write-Step 'Configuring GitHub Actions deployment settings'

    # Publish-profile deployment requires SCM basic publishing credentials.
    Invoke-Az -Arguments @(
        'resource', 'update',
        '--resource-group', $ResourceGroup,
        '--resource-type', 'Microsoft.Web/sites/basicPublishingCredentialsPolicies',
        '--name', "$FunctionAppName/scm",
        '--set', 'properties.allow=true'
    ) -AllowFailure | Out-Null
    Invoke-Az -Arguments @(
        'resource', 'update',
        '--resource-group', $ResourceGroup,
        '--resource-type', 'Microsoft.Web/sites/basicPublishingCredentialsPolicies',
        '--name', "$FunctionAppName/ftp",
        '--set', 'properties.allow=false'
    ) -AllowFailure | Out-Null

    $publishProfile = Invoke-Az -Arguments @('functionapp', 'deployment', 'list-publishing-profiles', '--name', $FunctionAppName, '--resource-group', $ResourceGroup, '--xml') -Raw
    if ([string]::IsNullOrWhiteSpace($publishProfile)) { throw 'Azure returned an empty Function App publish profile.' }

    Set-GitHubSecretFromText -Name 'AZURE_FUNCTIONAPP_PUBLISH_PROFILE' -Value $publishProfile -Repository $GitHubRepository
    Set-GitHubVariable -Name 'AZURE_FUNCTIONAPP_NAME' -Value $FunctionAppName -Repository $GitHubRepository
    Set-GitHubVariable -Name 'EASYFILE_REFERRAL_HEALTH_URL' -Value $healthUrl -Repository $GitHubRepository
    Write-Ok 'GitHub secret and repository variables configured'
}

if ($DeployWithGitHubActions) {
    if ($SkipGitHubConfiguration) { throw '-DeployWithGitHubActions cannot be combined with -SkipGitHubConfiguration.' }
    Write-Step 'Dispatching GitHub Actions deployment'
    Invoke-Gh -Arguments @('workflow', 'run', 'Deploy EasyFile Referral API', '--repo', $GitHubRepository, '--ref', 'main') | Out-Null
    Start-Sleep -Seconds 5
    $runJson = Invoke-Gh -Arguments @('run', 'list', '--repo', $GitHubRepository, '--workflow', 'Deploy EasyFile Referral API', '--limit', '1', '--json', 'databaseId,status,conclusion,url,createdAt') -Raw
    $run = @($runJson | ConvertFrom-Json) | Select-Object -First 1
    if (-not $run) { throw 'The GitHub Actions deployment run could not be located.' }
    Invoke-Gh -Arguments @('run', 'watch', [string]$run.databaseId, '--repo', $GitHubRepository, '--exit-status') | Out-Null
    Write-Ok "Deployment workflow succeeded: $($run.url)"
}

Write-Step 'Running production verification'
try {
    $dnsAddresses = Resolve-DnsName -Name $healthHost -ErrorAction Stop
    if (-not $dnsAddresses) { throw "No DNS response for $healthHost" }
    Write-Ok "DNS resolves: $healthHost"
} catch {
    Write-Warn "DNS verification failed for ${healthHost}: $($_.Exception.Message)"
}

$healthReady = $false
try {
    $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 20 -Headers @{ Accept = 'application/json' }
    $issues = @($health.issues)
    if ($health.status -eq 'ok' -and $issues.Count -eq 0) {
        $healthReady = $true
        Write-Ok "Referral API health is production-ready: $healthUrl"
    } else {
        Write-Warn "Referral API health is not ready. Status: $($health.status); issues: $($issues -join ', ')"
    }
} catch {
    Write-Warn "Health endpoint is not yet reachable/ready: $($_.Exception.Message)"
}

Write-Host "`n================ EasyFile production result ================" -ForegroundColor White
Write-Host "Function App:       $FunctionAppName"
Write-Host "Default endpoint:   https://$defaultHost"
Write-Host "Custom domain:      $(if ($domainBound) { 'https://' + $CustomDomain } else { 'not bound' })"
Write-Host "Health URL:         $healthUrl"
Write-Host "GitHub repository:  $GitHubRepository"
Write-Host "Identity mode:      $IdentityMode"
Write-Host "Verified email:     $requireVerifiedEmail"
Write-Host "Health ready:       $healthReady"
Write-Host "Key Vault:          $KeyVaultName"
Write-Host "Storage account:    $StorageAccountName"
Write-Host "=============================================================" -ForegroundColor White

if ($IdentityMode -ne 'ActivateEntra') {
    Write-Warn 'Email verification is intentionally not active. The health endpoint should remain degraded with email-verification-disabled until the browser authentication flow is implemented and the script is rerun with -IdentityMode ActivateEntra.'
}
if (-not $healthReady) {
    exit 2
}
