param(
  [string]$ProtectedFile = (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) '.backup-local/github-backup-credentials.dpapi'),
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ProtectedFile)) {
  throw 'A copia local protegida da chave nao foi encontrada.'
}

$protected = [IO.File]::ReadAllBytes($ProtectedFile)
$plaintext = [Security.Cryptography.ProtectedData]::Unprotect(
  $protected,
  $null,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
try {
  $credentials = [Text.Encoding]::UTF8.GetString($plaintext) | ConvertFrom-Json
  if ($credentials.key -notmatch '^[0-9a-f]{64}$') {
    throw 'Formato invalido da chave de recuperacao.'
  }
  if ($ValidateOnly) {
    Write-Output 'Copia local protegida e chave AES-256 validas.'
  } else {
    Set-Clipboard -Value $credentials.key
    Write-Output 'Chave AES-256 copiada. Salve-a em um gerenciador de senhas fora deste computador e depois limpe a area de transferencia.'
  }
} finally {
  [Array]::Clear($plaintext, 0, $plaintext.Length)
}
