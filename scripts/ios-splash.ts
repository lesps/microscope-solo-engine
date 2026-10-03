import type { HtmlTagDescriptor } from 'vite';

/**
 * iOS shows a Home Screen app's launch image only when one matches the device exactly (CSS size,
 * pixel ratio and orientation); otherwise it flashes a blank white screen. Phones get portrait
 * only, iPads both orientations. Regenerate the PNGs after editing this list:
 * UPDATE_SPLASH=1 npx vitest run tests/ios-splash.test.ts
 */
export const SPLASH_DEVICES: { w: number; h: number; ratio: number; ipad?: true }[] = [
  { w: 440, h: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
  { w: 420, h: 912, ratio: 3 }, // Air
  { w: 402, h: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { w: 430, h: 932, ratio: 3 }, // 14 Pro Max, 15 Plus / Pro Max, 16 Plus
  { w: 393, h: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { w: 428, h: 926, ratio: 3 }, // 12 / 13 Pro Max, 14 Plus
  { w: 390, h: 844, ratio: 3 }, // 12, 13, 14, 16e
  { w: 375, h: 812, ratio: 3 }, // X, XS, 11 Pro, 12 / 13 mini
  { w: 414, h: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { w: 414, h: 896, ratio: 2 }, // XR, 11
  { w: 414, h: 736, ratio: 3 }, // 6–8 Plus
  { w: 375, h: 667, ratio: 2 }, // 6–8, SE 2 / 3
  { w: 320, h: 568, ratio: 2 }, // SE
  { w: 1032, h: 1376, ratio: 2, ipad: true }, // Pro 13" (M4)
  { w: 1024, h: 1366, ratio: 2, ipad: true }, // Pro 12.9", Air 13"
  { w: 834, h: 1210, ratio: 2, ipad: true }, // Pro 11" (M4)
  { w: 834, h: 1194, ratio: 2, ipad: true }, // Pro 11"
  { w: 820, h: 1180, ratio: 2, ipad: true }, // Air 10.9", iPad 10th
  { w: 834, h: 1112, ratio: 2, ipad: true }, // Air 3, Pro 10.5"
  { w: 810, h: 1080, ratio: 2, ipad: true }, // iPad 7th–9th
  { w: 768, h: 1024, ratio: 2, ipad: true }, // mini 5, iPad 5th–6th
  { w: 744, h: 1133, ratio: 2, ipad: true }, // mini 6th–7th
];

/** The app's background and text colors (`--bg`, `--text` in styles.css), per color scheme. */
export const SPLASH_THEMES = {
  light: { bg: '#f6f3ee', text: '#221d16' },
  dark: { bg: '#17151a', text: '#ece6dc' },
} as const;

export interface SplashImage {
  file: string;
  theme: keyof typeof SPLASH_THEMES;
  /** CSS pixels and ratio, for rendering. */
  css: { w: number; h: number; ratio: number };
  width: number;
  height: number;
  media: string;
}

export function splashImages(): SplashImage[] {
  const out: SplashImage[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const d of SPLASH_DEVICES) {
      for (const orientation of d.ipad
        ? (['portrait', 'landscape'] as const)
        : (['portrait'] as const)) {
        const [w, h] = orientation === 'portrait' ? [d.w, d.h] : [d.h, d.w];
        const width = w * d.ratio;
        const height = h * d.ratio;
        out.push({
          file: `splash/${theme}-${width}x${height}.png`,
          theme,
          css: { w, h, ratio: d.ratio },
          width,
          height,
          media:
            `(device-width: ${d.w}px) and (device-height: ${d.h}px) and ` +
            `(-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: ${orientation})` +
            (theme === 'dark' ? ' and (prefers-color-scheme: dark)' : ''),
        });
      }
    }
  }
  return out;
}

/**
 * Link tags for index.html. Light images carry no color-scheme condition so they remain the
 * fallback where iOS ignores it; the dark ones come after and win where it doesn't.
 */
export function splashLinks(): HtmlTagDescriptor[] {
  return splashImages().map((s) => ({
    tag: 'link',
    attrs: { rel: 'apple-touch-startup-image', href: `./${s.file}`, media: s.media },
    injectTo: 'head',
  }));
}
