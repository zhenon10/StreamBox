/**
 * Generate IvPlayer webOS icons / splash from brand/ivplayer-app-icon.*
 * Outputs:
 *   webos/icon.png           80×80
 *   webos/icon-large.png     130×130
 *   webos/splash.png         1920×1080
 *   webos/store/store-icon-400.png  400×400 (Seller Lounge)
 *
 * Source: brand/ivplayer-app-icon.jpg|png (LG store artwork)
 * Resize: Windows System.Drawing (no extra npm deps).
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const brandDir = join(root, 'brand');
const webosDir = join(root, 'webos');
const storeDir = join(webosDir, 'store');

const BG = '#07090f';

function findSource() {
  const preferred = ['ivplayer-app-icon.jpg', 'ivplayer-app-icon.jpeg', 'ivplayer-app-icon.png'];
  for (const name of preferred) {
    const p = join(brandDir, name);
    if (existsSync(p)) return p;
  }
  if (!existsSync(brandDir)) {
    throw new Error('Missing brand/ — place ivplayer-app-icon.jpg there');
  }
  const hit = readdirSync(brandDir).find((f) => /^ivplayer-app-icon\./i.test(f));
  if (!hit) throw new Error('Missing brand/ivplayer-app-icon.jpg (or .png)');
  return join(brandDir, hit);
}

function runPowerShell(script) {
  const ps1 = join(tmpdir(), `ivplayer-icons-${randomBytes(6).toString('hex')}.ps1`);
  writeFileSync(ps1, script, 'utf8');
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { encoding: 'utf8' },
  );
  try {
    // best-effort cleanup
    spawnSync('powershell.exe', ['-NoProfile', '-Command', `Remove-Item -Force '${ps1}'`], {
      encoding: 'utf8',
    });
  } catch {
    /* ignore */
  }
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `PowerShell exited ${r.status}`);
  }
  if (r.stdout?.trim()) console.log(r.stdout.trim());
}

function generateWithSystemDrawing(sourceAbs) {
  const icon80 = join(webosDir, 'icon.png');
  const icon130 = join(webosDir, 'icon-large.png');
  const icon400 = join(storeDir, 'store-icon-400.png');
  const splash = join(webosDir, 'splash.png');

  // Escape for single-quoted PowerShell strings
  const q = (p) => p.replace(/'/g, "''");

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Save-SquarePng([string]$srcPath, [string]$destPath, [int]$size) {
  $src = [System.Drawing.Image]::FromFile($srcPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $bmp.SetResolution(72, 72)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.Clear([System.Drawing.ColorTranslator]::FromHtml('${BG}'))
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

      # Cover square: scale to fill, center-crop if needed
      $scale = [Math]::Max($size / $src.Width, $size / $src.Height)
      $w = [int][Math]::Round($src.Width * $scale)
      $h = [int][Math]::Round($src.Height * $scale)
      $x = [int](($size - $w) / 2)
      $y = [int](($size - $h) / 2)
      $g.DrawImage($src, $x, $y, $w, $h)
    } finally {
      $g.Dispose()
    }
    $dir = Split-Path -Parent $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("OK " + $destPath + " " + $size + "x" + $size)
  } finally {
    $src.Dispose()
  }
}

function Save-Splash([string]$srcPath, [string]$destPath, [int]$width, [int]$height, [int]$emblem) {
  $src = [System.Drawing.Image]::FromFile($srcPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $bmp.SetResolution(72, 72)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.Clear([System.Drawing.ColorTranslator]::FromHtml('${BG}'))
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $scale = [Math]::Min($emblem / $src.Width, $emblem / $src.Height)
      $w = [int][Math]::Round($src.Width * $scale)
      $h = [int][Math]::Round($src.Height * $scale)
      $x = [int](($width - $w) / 2)
      $y = [int](($height - $h) / 2)
      $g.DrawImage($src, $x, $y, $w, $h)
    } finally {
      $g.Dispose()
    }
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("OK " + $destPath + " " + $width + "x" + $height)
  } finally {
    $src.Dispose()
  }
}

$src = '${q(sourceAbs)}'
Save-SquarePng $src '${q(icon80)}' 80
Save-SquarePng $src '${q(icon130)}' 130
Save-SquarePng $src '${q(icon400)}' 400
Save-Splash $src '${q(splash)}' 1920 1080 420
`;

  runPowerShell(script);
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error(
      'tv:icons currently uses Windows System.Drawing. Run on Windows, or convert brand icon manually to webos/*.png sizes.',
    );
  }

  mkdirSync(webosDir, { recursive: true });
  mkdirSync(storeDir, { recursive: true });

  const source = findSource();
  console.log(`Source: ${source} (${extname(source)})`);
  generateWithSystemDrawing(source);
  console.log('\nIvPlayer webOS assets ready (brand icon).');
}

main();
