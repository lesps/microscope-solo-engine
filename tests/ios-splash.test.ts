import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPLASH_THEMES, splashImages, splashLinks } from '../scripts/ios-splash';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const pub = path.join(root, 'public');
const icon = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');

const pngSize = (file: string) => {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

function page(theme: keyof typeof SPLASH_THEMES, w: number, h: number) {
  const c = SPLASH_THEMES[theme];
  const size = Math.round(Math.min(Math.max(Math.min(w, h) * 0.28, 96), 200));
  return `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;background:${c.bg};
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${size * 0.18}px">
    <div style="width:${size}px;height:${size}px">${icon.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>
    <div style="font-family:'Iowan Old Style',Palatino,Georgia,serif;font-weight:700;color:${c.text};
      font-size:${Math.round(size * 0.2)}px">Solo Microscope</div></body></html>`;
}

describe.runIf(process.env.UPDATE_SPLASH)('regenerate iOS launch images', () => {
  it('renders every image', { timeout: 300_000 }, async () => {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    fs.mkdirSync(path.join(pub, 'splash'), { recursive: true });
    for (const s of splashImages()) {
      const p = await browser.newPage({
        viewport: { width: s.css.w, height: s.css.h },
        deviceScaleFactor: s.css.ratio,
      });
      await p.setContent(page(s.theme, s.css.w, s.css.h));
      await p.screenshot({ path: path.join(pub, s.file) });
      await p.close();
    }
    await browser.close();
  });
});

describe('iOS launch images', () => {
  it('every listed image exists at its exact pixel size, and nothing else is in public/splash', () => {
    const images = splashImages();
    for (const s of images)
      expect(pngSize(path.join(pub, s.file)), s.file).toEqual({ width: s.width, height: s.height });
    expect(fs.readdirSync(path.join(pub, 'splash')).sort()).toEqual(
      images.map((s) => path.basename(s.file)).sort(),
    );
  });

  it('pixel sizes are unique, so no two media queries share a file', () => {
    const files = splashImages().map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('links put every light image before any dark one', () => {
    const media = splashLinks().map((l) => String(l.attrs!.media));
    const firstDark = media.findIndex((m) => m.includes('dark'));
    expect(firstDark).toBe(media.length / 2);
    expect(media.slice(0, firstDark).some((m) => m.includes('prefers-color-scheme'))).toBe(false);
  });

  it('theme colors match the app’s --bg and --text', () => {
    const css = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
    const [light, dark] = css.split('@media (prefers-color-scheme: dark)');
    const token = (block: string, name: string) =>
      block!.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))![1];
    expect({ bg: token(light!, 'bg'), text: token(light!, 'text') }).toEqual(SPLASH_THEMES.light);
    expect({ bg: token(dark!, 'bg'), text: token(dark!, 'text') }).toEqual(SPLASH_THEMES.dark);
  });
});
