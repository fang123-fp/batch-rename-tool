param(
  [int]$Port = 8123
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootFull = [System.IO.Path]::GetFullPath($root)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)

function Get-ContentType([string]$extension) {
  switch ($extension.ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.css' { return 'text/css; charset=utf-8' }
    '.js' { return 'application/javascript; charset=utf-8' }
    '.mjs' { return 'application/javascript; charset=utf-8' }
    '.json' { return 'application/json; charset=utf-8' }
    '.txt' { return 'text/plain; charset=utf-8' }
    '.md' { return 'text/markdown; charset=utf-8' }
    '.svg' { return 'image/svg+xml' }
    default { return 'application/octet-stream' }
  }
}

function Write-Response($stream, [int]$statusCode, [string]$statusText, [byte[]]$body, [string]$contentType) {
  $header = "HTTP/1.1 $statusCode $statusText`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($body.Length -gt 0) {
    $stream.Write($body, 0, $body.Length)
  }
}

function Get-LocalUrls([int]$PortNumber) {
  $urls = New-Object System.Collections.Generic.List[string]
  $urls.Add("http://localhost:$PortNumber")
  [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not $_.IPAddressToString.StartsWith('127.') } |
    ForEach-Object { $urls.Add("http://$($_.IPAddressToString):$PortNumber") }
  return $urls | Select-Object -Unique
}

$listener.Start()
Write-Host ""
Write-Host "Batch rename tool is available on:"
Get-LocalUrls -PortNumber $Port | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "Keep this window open. Press Ctrl+C to stop the server."

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        $client.Close()
        continue
      }

      while ($true) {
        $headerLine = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($headerLine)) {
          break
        }
      }

      $parts = $requestLine.Split(' ')
      $urlPath = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
      $relativePath = [System.Uri]::UnescapeDataString($urlPath.Split('?')[0])
      if ($relativePath -eq '/') {
        $relativePath = '/index.html'
      }

      $relativePath = $relativePath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $targetPath = [System.IO.Path]::GetFullPath((Join-Path $rootFull $relativePath))

      if (-not $targetPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
        Write-Response $stream 403 'Forbidden' $body 'text/plain; charset=utf-8'
        $client.Close()
        continue
      }

      if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        Write-Response $stream 404 'Not Found' $body 'text/plain; charset=utf-8'
        $client.Close()
        continue
      }

      $body = [System.IO.File]::ReadAllBytes($targetPath)
      $contentType = Get-ContentType ([System.IO.Path]::GetExtension($targetPath))
      Write-Response $stream 200 'OK' $body $contentType
      $client.Close()
    }
    catch {
      try {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Internal Server Error')
        Write-Response $stream 500 'Internal Server Error' $body 'text/plain; charset=utf-8'
      }
      catch {}
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
