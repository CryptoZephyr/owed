param(
    [Parameter(Mandatory = $true)][string]$Action,
    [string]$Id,
    [string]$Email,
    [string]$Amount = "1.00"
)
$ErrorActionPreference = 'Stop'
$base = 'https://api-m.sandbox.paypal.com'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { $envFile = 'C:\Users\HomePC\Desktop\Paypal\.env.txt' }
$stateFile = Join-Path $env:TEMP 'owed-sandbox-state.json'

function Get-Vars {
    $v = @{}
    Get-Content -LiteralPath $envFile | ForEach-Object {
        if ($_ -match '^\s*([^=:#]+?)\s*[=:]\s*(.*)$') { $v[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'") }
    }
    $v
}

function Get-Token {
    $v = Get-Vars
    $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($v['PAYPAL_CLIENT_ID']):$($v['PAYPAL_CLIENT_SECRET'])"))
    (Invoke-RestMethod -Method Post -Uri "$base/v1/oauth2/token" -Headers @{ Authorization = "Basic $basic" } -Body 'grant_type=client_credentials' -ContentType 'application/x-www-form-urlencoded').access_token
}

function Invoke-PayPal([string]$Method, [string]$Path, $Body) {
    $headers = @{
        Authorization       = "Bearer $(Get-Token)"
        'PayPal-Request-Id' = [guid]::NewGuid().ToString()
        Prefer              = 'return=representation'
    }
    $json = if ($null -eq $Body) { $null } elseif ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 20 }
    try {
        if ($Method -eq 'GET') { Invoke-RestMethod -Method Get -Uri "$base$Path" -Headers $headers }
        else { Invoke-RestMethod -Method $Method -Uri "$base$Path" -Headers $headers -ContentType 'application/json' -Body $json }
    }
    catch {
        Write-Output "HTTP ERROR: $($_.Exception.Message)"
        if ($_.ErrorDetails) { Write-Output $_.ErrorDetails.Message }
        exit 1
    }
}

function Save-State($obj) { $obj | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $stateFile }

switch ($Action) {
    'create-hold' {
        $label = if ($Id) { $Id } else { 'candidate' }
        $order = Invoke-PayPal 'POST' '/v2/checkout/orders' @{
            intent         = 'AUTHORIZE'
            purchase_units = @(
                @{ reference_id = $label; description = "Owed guarantee: $label"; amount = @{ currency_code = 'USD'; value = $(if ($PSBoundParameters.ContainsKey('Amount')) { $Amount } else { '25.00' }) } }
            )
            payment_source = @{ paypal = @{ experience_context = @{
                        brand_name          = 'Owed (sandbox test)'
                        shipping_preference = 'NO_SHIPPING'
                        user_action         = 'PAY_NOW'
                        return_url          = 'https://example.com/heard/return'
                        cancel_url          = 'https://example.com/heard/cancel'
                    } } }
        }
        $approve = ($order.links | Where-Object { $_.rel -in @('payer-action', 'approve') } | Select-Object -First 1).href
        "ORDER [$label]: $($order.id)  status=$($order.status)"
        "APPROVE AT: $approve"
    }
    'authorize' {
        $orderId = if ($Id) { $Id } else { (Get-Content $stateFile | ConvertFrom-Json).order_id }
        $res = Invoke-PayPal 'POST' "/v2/checkout/orders/$orderId/authorize" '{}'
        "ORDER: $($res.id) status=$($res.status) payer=$($res.payer.email_address) payer_country=$($res.payer.address.country_code)"
        $auths = @()
        foreach ($pu in $res.purchase_units) {
            foreach ($a in $pu.payments.authorizations) {
                "  [$($pu.reference_id)] authorization=$($a.id) status=$($a.status) amount=$($a.amount.value) $($a.amount.currency_code)"
                "      created=$($a.create_time)  expires=$($a.expiration_time)"
                $auths += @{ ref = $pu.reference_id; id = $a.id }
            }
        }
        Save-State @{ order_id = $orderId; payer_email = $res.payer.email_address; authorizations = $auths }
    }
    'show-auth' {
        $a = Invoke-PayPal 'GET' "/v2/payments/authorizations/$Id" $null
        "authorization=$($a.id) status=$($a.status) amount=$($a.amount.value) created=$($a.create_time) expires=$($a.expiration_time)"
    }
    'reauthorize' {
        $a = Invoke-PayPal 'POST' "/v2/payments/authorizations/$Id/reauthorize" '{}'
        "REAUTHORIZED: new authorization=$($a.id) status=$($a.status) expires=$($a.expiration_time)"
    }
    'void' {
        Invoke-PayPal 'POST' "/v2/payments/authorizations/$Id/void" '{}' | Out-Null
        $a = Invoke-PayPal 'GET' "/v2/payments/authorizations/$Id" $null
        "VOID: authorization=$($a.id) status=$($a.status)"
    }
    'capture' {
        $c = Invoke-PayPal 'POST' "/v2/payments/authorizations/$Id/capture" @{ amount = @{ currency_code = 'USD'; value = $Amount }; final_capture = $true }
        "CAPTURE: capture=$($c.id) status=$($c.status) amount=$($c.amount.value) $($c.amount.currency_code)"
        if ($c.seller_receivable_breakdown) { "  gross=$($c.seller_receivable_breakdown.gross_amount.value) paypal_fee=$($c.seller_receivable_breakdown.paypal_fee.value) net=$($c.seller_receivable_breakdown.net_amount.value)" }
    }
    'capture-partial' {
        $c = Invoke-PayPal 'POST' "/v2/payments/authorizations/$Id/capture" @{ amount = @{ currency_code = 'USD'; value = $Amount }; final_capture = $false }
        "PARTIAL CAPTURE: capture=$($c.id) status=$($c.status) amount=$($c.amount.value) final_capture=$($c.final_capture)"
        if ($c.seller_receivable_breakdown) { "  gross=$($c.seller_receivable_breakdown.gross_amount.value) paypal_fee=$($c.seller_receivable_breakdown.paypal_fee.value) net=$($c.seller_receivable_breakdown.net_amount.value)" }
        $a = Invoke-PayPal 'GET' "/v2/payments/authorizations/$Id" $null
        "  authorization now: status=$($a.status)"
    }
    'login-url' {
        $v = Get-Vars
        $scope = [uri]::EscapeDataString('openid profile email https://uri.paypal.com/services/paypalattributes')
        $redirect = [uri]::EscapeDataString('https://example.com/heard/login')
        $state = [guid]::NewGuid().ToString('N').Substring(0, 10)
        Save-State @{ login_state = $state }
        "LOGIN URL: https://www.sandbox.paypal.com/connect?flowEntry=static&client_id=$($v['PAYPAL_CLIENT_ID'])&response_type=code&scope=$scope&redirect_uri=$redirect&state=$state"
    }
    'login-exchange' {
        $v = Get-Vars
        $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($v['PAYPAL_CLIENT_ID']):$($v['PAYPAL_CLIENT_SECRET'])"))
        try {
            $tok = Invoke-RestMethod -Method Post -Uri "$base/v1/oauth2/token" -Headers @{ Authorization = "Basic $basic" } -Body "grant_type=authorization_code&code=$([uri]::EscapeDataString($Id))" -ContentType 'application/x-www-form-urlencoded'
            "USER TOKEN: OK (scopes: $($tok.scope))"
            $u = Invoke-RestMethod -Method Get -Uri "$base/v1/identity/openidconnect/userinfo?schema=openid" -Headers @{ Authorization = "Bearer $($tok.access_token)" }
            "name=$($u.name)"
            "emails=$(($u.emails | ForEach-Object { $_.value + $(if ($_.primary) { ' (primary)' } else { '' }) }) -join ', ')$($u.email)"
            "payer_id=$($u.payer_id)"
            "verified_account=$($u.verified_account)"
            "user_id=$($u.user_id)"
            $state = if (Test-Path $stateFile) { Get-Content $stateFile | ConvertFrom-Json } else { @{} }
            Save-State @{ login_state = $state.login_state; payer_id = $u.payer_id }
        }
        catch {
            Write-Output "HTTP ERROR: $($_.Exception.Message)"
            if ($_.ErrorDetails) { Write-Output $_.ErrorDetails.Message }
            exit 1
        }
    }
    'payout-paypalid' {
        $batchId = 'owed-test-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
        $p = Invoke-PayPal 'POST' '/v1/payments/payouts' @{
            sender_batch_header = @{ sender_batch_id = $batchId; email_subject = 'Acme did not get back to you'; email_message = 'Here is $' + $Amount + ' for your time. (Owed sandbox test)' }
            items               = @(@{ recipient_type = 'PAYPAL_ID'; receiver = $Id; amount = @{ value = $Amount; currency = 'USD' }; note = 'Owed guarantee payout to a verified PayPal account (sandbox test)'; sender_item_id = $batchId + '-1' })
        }
        "PAYOUT BATCH: $($p.batch_header.payout_batch_id) status=$($p.batch_header.batch_status)"
    }
    'payout' {
        $batchId = 'owed-test-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
        $p = Invoke-PayPal 'POST' '/v1/payments/payouts' @{
            sender_batch_header = @{ sender_batch_id = $batchId; email_subject = 'Acme did not get back to you'; email_message = 'Here is $' + $Amount + ' for your time. (Owed sandbox test)' }
            items               = @(@{ recipient_type = 'EMAIL'; receiver = $Email; amount = @{ value = $Amount; currency = 'USD' }; note = 'Owed guarantee payout (sandbox test)'; sender_item_id = $batchId + '-1' })
        }
        "PAYOUT BATCH: $($p.batch_header.payout_batch_id) status=$($p.batch_header.batch_status)"
    }
    'payout-status' {
        $b = Invoke-PayPal 'GET' "/v1/payments/payouts/$Id" $null
        "BATCH: $($b.batch_header.payout_batch_id) status=$($b.batch_header.batch_status) amount=$($b.batch_header.amount.value) fees=$($b.batch_header.fees.value)"
        foreach ($i in $b.items) {
            "  item=$($i.payout_item_id) status=$($i.transaction_status) receiver_type=$($i.payout_item.recipient_type) amount=$($i.payout_item.amount.value) fee=$($i.payout_item_fee.value) error=$($i.errors.name)"
        }
    }
    default { "Unknown action: $Action" }
}
