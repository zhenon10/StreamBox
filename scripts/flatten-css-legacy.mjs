/**
 * Flatten Tailwind v4 CSS for Chromium 79 (webOS 6).
 * @layer / @property are unsupported before Chrome 99/85 → styles silently fail.
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

  return out;
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

    // Skip whitespace / layer name / prelude until `{`
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
