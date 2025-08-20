param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [string]$Id,
  [string]$Title,
  [string]$OutPath = "conversation_extracted.json"
)

if (!(Test-Path -LiteralPath $InputPath)) {
  Write-Error "InputPath not found: $InputPath"
  exit 1
}

# Read entire file as text (works even if JSON is minified on one long line)
$raw = [System.IO.File]::ReadAllText($InputPath)

function Convert-ToUnicodeEscapes([string]$s){
  if ([string]::IsNullOrEmpty($s)) { return $s }
  $map = @{
    'é'='\u00e9'; 'è'='\u00e8'; 'ê'='\u00ea'; 'ë'='\u00eb';
    'à'='\u00e0'; 'â'='\u00e2'; 'î'='\u00ee'; 'ï'='\u00ef';
    'ô'='\u00f4'; 'ù'='\u00f9'; 'û'='\u00fb'; 'ü'='\u00fc';
    'ç'='\u00e7';
    'É'='\u00c9'; 'È'='\u00c8'; 'Ê'='\u00ca'; 'Ë'='\u00cb';
    'À'='\u00c0'; 'Â'='\u00c2'; 'Î'='\u00ce'; 'Ï'='\u00cf';
    'Ô'='\u00d4'; 'Ù'='\u00d9'; 'Û'='\u00db'; 'Ü'='\u00dc';
    'Ç'='\u00c7'
  }
  $out = $s
  foreach($k in $map.Keys){ $out = $out.Replace($k, $map[$k]) }
  return $out
}

function Find-IndexByIdOrTitle([string]$text, [string]$id, [string]$title){
  if ($id) {
    $p = '"id":"' + $id + '"'
    $i = $text.IndexOf($p)
    if ($i -ge 0) { return $i }
  }
  if ($title) {
    $p1 = '"title":"' + $title + '"'
    $i = $text.IndexOf($p1)
    if ($i -ge 0) { return $i }
    $esc = Convert-ToUnicodeEscapes $title
    $p2 = '"title":"' + $esc + '"'
    $i = $text.IndexOf($p2)
    if ($i -ge 0) { return $i }
  }
  return -1
}

$idx = Find-IndexByIdOrTitle -text $raw -id $Id -title $Title
if ($idx -lt 0) {
  Write-Error "Could not locate conversation by Id or Title. Id='$Id' Title='$Title'"
  exit 2
}

# Find start of JSON object '{' going backward from index
$start = $idx
while ($start -gt 0 -and $raw[$start] -ne '{') { $start-- }
if ($raw[$start] -ne '{') { Write-Error 'Start brace not found'; exit 3 }

# Walk forward and balance braces to find the end of object
$depth = 0
$inString = $false
$escape = $false
$end = -1
for ($i = $start; $i -lt $raw.Length; $i++) {
  $ch = $raw[$i]
  if ($escape) { $escape = $false; continue }
  if ($inString) {
    if ($ch -eq '\\') { $escape = $true; continue }
    if ($ch -eq '"') { $inString = $false; continue }
    continue
  } else {
    if ($ch -eq '"') { $inString = $true; continue }
    if ($ch -eq '{') { $depth++; continue }
    if ($ch -eq '}') { $depth--; if ($depth -eq 0) { $end = $i; break } }
  }
}

if ($end -lt 0) { Write-Error 'End brace not found'; exit 4 }

$obj = $raw.Substring($start, $end - $start + 1)
[System.IO.File]::WriteAllText($OutPath, $obj, [System.Text.Encoding]::UTF8)
Write-Host "Written $OutPath ($($obj.Length) chars)"
