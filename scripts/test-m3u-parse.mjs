import { parseM3U } from '../src/infrastructure/parsers/M3UParser.ts';
import { classifyGroupName, isStrongLiveName } from '../src/domain/content/contentSection.ts';

const sample = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="" tvg-name="TRT 1 HD" tvg-logo="http://logo1010.com/x.png" group-title="► Ulusal",TRT 1 HD',
  'http://x.com/live/u/p/1.ts',
  '#EXTINF:-1 tvg-name="BeIN 1" group-title="► Spor",BeIN Sports 1',
  'http://x.com/live/u/p/2.ts',
  '#EXTINF:-1 tvg-name="CNN" group-title="► Haber",CNN Turk',
  'http://x.com/live/u/p/3.ts',
  '#EXTINF:-1 tvg-name="Doc" group-title="► Belgesel",Nat Geo',
  'http://x.com/live/u/p/4.ts',
  '#EXTINF:-1,group-title="TR|FILM Animasyon",Movie 1',
  'http://x.com/movie/u/p/5.mp4',
].join('\n');

const { channels } = parseM3U(sample);
for (const ch of channels) {
  console.log({
    name: ch.name,
    group: ch.group,
    section: classifyGroupName(ch.group),
    strongLive: isStrongLiveName(ch.group),
  });
}
