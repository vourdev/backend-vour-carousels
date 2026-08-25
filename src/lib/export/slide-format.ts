/**
 * The one shape every slide is captured at.
 *
 * 1080x1350 is Instagram's 4:5 portrait post at the largest size it will display, and
 * the same file is what goes to TikTok.
 *
 * The pixel ratio is 1, where it used to be 2. Rendering at deviceScaleFactor 2 produced
 * a 2160x2700 image, and that was wrong in both directions at once: Instagram downsamples
 * anything past 1080 wide, so the extra pixels were thrown away after being paid for, and
 * 5,832,000 pixels is well past TikTok's 2,073,600 ceiling for photo posts — which is the
 * only reason `toTikTokSafeUrl` had to exist, rewriting the delivery URL with a Cloudinary
 * `c_limit` transform to shrink it back down.
 *
 * At 1 the capture is already what both platforms want. One asset serves both with no
 * derivative, the double resample on Instagram's side is gone, and the file is roughly a
 * third of the bytes — which is the difference between a deck that fits comfortably in
 * this VPS's disk-and-CDN path and one that does not.
 */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
export const SLIDE_PIXEL_RATIO = 1;
export const SLIDE_QUALITY = 92;

/** How long a render may wait on `document.fonts.ready` before it goes ahead anyway. */
export const READY_TIMEOUT_MS = 6000;
