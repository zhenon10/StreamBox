function parseExtInf(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#EXTINF:')) return null;
  const body = trimmed.slice('#EXTINF:'.length).trim();
  const durMatch = /^(-?\d+(?:\.\d+)?)\s*(.*)$/.exec(body);
  if (!durMatch) return null;
  let rest = durMatch[2] ?? '';
  if (rest.startsWith(',')) rest = rest.slice(1);
  let inQuotes = false;
  let commaIdx = -1;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      commaIdx = i;
      break;
    }
  }
  let attrBlob = '';
  let title = rest.trim();
  if (commaIdx >= 0) {
    attrBlob = rest.slice(0, commaIdx).trim();
    title = rest.slice(commaIdx + 1).trim();
  }
  const attributes = {};
  const attrRegex = /([\w-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = attrRegex.exec(attrBlob)) !== null) attributes[m[1]] = m[2];
  return { title, group: attributes['group-title'] };
}

const lines = [
  '#EXTINF:-1 tvg-id="" tvg-name="TRT 1 HD" tvg-logo="http://logo1010.com/x.png" group-title="Ulusal",TRT 1 HD',
  '#EXTINF:-1 tvg-name="BeIN 1" group-title="Spor",BeIN Sports 1',
  '#EXTINF:-1 tvg-name="x" group-title="Haber",CNN',
  '#EXTINF:-1,group-title="TR|FILM",Movie 1',
  '#EXTINF:-1,Plain Channel',
];

for (const line of lines) console.log(parseExtInf(line));
