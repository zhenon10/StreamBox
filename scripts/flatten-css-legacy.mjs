/**
 * Flatten Tailwind v4 CSS for Chromium 79 (webOS 6).
 * @layer / @property are unsupported before Chrome 99/85 → styles silently fail.
 * `in oklab` gradients & color-mix() also fail on Chromium 79.
 */
export function flattenCssForLegacyTv(css) {
  let out = css;

  // Drop @property rules (used for transform/filter vars; utilities still have fallbacks).
  out = stripAtRules(out, 'property');

  // Unwrap cascade layers so declarations apply in legacy engines.
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = unwrapAtRules(out, 'layer');
  }

  // Chrome 79 does not parse "to top in oklab" — drop color-space suffixes.
  out = out.replace(/\s+in\s+oklab\b/gi, '');
  out = out.replace(/\s+in\s+oklch\b/gi, '');
  out = out.replace(/\s+in\s+srgb\b/gi, '');

  // color-mix(in oklab, color N%, transparent) → rgba-ish approximations via hex alpha.
  // Keep a conservative rewrite for the common Tailwind opacity pattern.
  out = rewriteColorMix(out);

  return out;
}

/**
 * Rewrite simple `color-mix(in oklab|oklch|srgb, <color> <pct>%, transparent)` to hex+alpha.
 * Leaves complex mixes untouched (declaration may still fail — better than invalid oklab).
 */
function rewriteColorMix(css) {
  return css.replace(
    /color-mix\(\s*in\s+(?:oklab|oklch|srgb)\s*,\s*([^,]+?)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)/gi,
    (_m, colorRaw, pctRaw) => {
      const pct = Math.max(0, Math.min(100, Number(pctRaw)));
      const color = String(colorRaw).trim();
      const hex = colorToRgb(color);
      if (!hex) return `rgba(0,0,0,${(pct / 100).toFixed(3)})`;
      const a = Math.round((pct / 100) * 255)
        .toString(16)
        .padStart(2, '0');
      return `#${hex}${a}`;
    },
  );
}

/** @returns {string|null} RRGGBB */
function colorToRgb(color) {
  const c = color.replace(/\s+/g, '').toLowerCase();
  if (c === '#000' || c === '#000000' || c === 'black' || c === 'var(--color-black)') {
    return '000000';
  }
  if (c === '#fff' || c === '#ffffff' || c === 'white' || c === 'var(--color-white)') {
    return 'ffffff';
  }
  const short = /^#([0-9a-f]{3})$/i.exec(c);
  if (short) {
    const s = short[1];
    return `${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  const long = /^#([0-9a-f]{6})$/i.exec(c);
  if (long) return long[1];
  return null;
}

function unwrapAtRules(css, atName) {
  const needle = `@${atName}`;
  let result = '';
  let i = 0;

  while (i < css.length) {
    const idx = css.indexOf(needle, i);
    if (idx === -1) {
      result += css.slice(i);
      break;
    }

    result += css.slice(i, idx);
    let j = idx + needle.length;

    while (j < css.length && css[j] !== '{') j += 1;
    if (j >= css.length) {
      result += css.slice(idx);
      break;
    }

    const bodyStart = j + 1;
    const bodyEnd = findMatchingBrace(css, j);
    if (bodyEnd === -1) {
      result += css.slice(idx);
      break;
    }

    result += css.slice(bodyStart, bodyEnd);
    i = bodyEnd + 1;
  }

  return result;
}

function stripAtRules(css, atName) {
  const needle = `@${atName}`;
  let result = '';
  let i = 0;

  while (i < css.length) {
    const idx = css.indexOf(needle, i);
    if (idx === -1) {
      result += css.slice(i);
      break;
    }

    result += css.slice(i, idx);
    let j = idx + needle.length;
    while (j < css.length && css[j] !== '{') j += 1;
    if (j >= css.length) break;
    const end = findMatchingBrace(css, j);
    if (end === -1) break;
    i = end + 1;
  }

  return result;
}

function findMatchingBrace(css, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < css.length; k += 1) {
    const ch = css[k];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}
