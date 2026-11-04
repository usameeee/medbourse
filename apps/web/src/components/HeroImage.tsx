import { useState } from 'react';
import { apiUrl } from '../api';

const CLOUDINARY_UPLOAD = '/upload/';
const HERO_WIDTHS = [640, 960, 1280, 1600, 2000, 2400] as const;
const LARGEST_HERO_WIDTH = HERO_WIDTHS[HERO_WIDTHS.length - 1];

/**
 * Cloudinary can re-slice an uploaded asset on the fly without touching the original.
 * Every frame is cropped to the same 16:9 window with automatic gravity, so portraits and
 * panoramas of different shapes deliver the same composition instead of cropping differently.
 */
function cloudinaryWidth(url: string, width: number): string {
  const [head, tail] = url.split(CLOUDINARY_UPLOAD);
  return `${head}${CLOUDINARY_UPLOAD}f_auto,q_auto:best,c_fill,ar_16:9,g_auto,w_${width}/${tail}`;
}

/**
 * Builds a `srcset` so large screens get a sharp frame while phones avoid downloading a
 * full-size original. Returns `undefined` for hosts without on-the-fly resizing (e.g. the
 * local storage driver served by the API), which are then used as-is.
 */
function cloudinarySrcSet(url: string): string | undefined {
  if (!url.includes('res.cloudinary.com') || !url.includes(CLOUDINARY_UPLOAD)) {
    return undefined;
  }
  return HERO_WIDTHS.map((width) => `${cloudinaryWidth(url, width)} ${width}w`).join(', ');
}

interface HeroImageProps {
  url: string | null;
  alt: string;
  className?: string;
  /** Above-the-fold heroes should not be lazy-loaded. */
  priority?: boolean;
  sizes?: string;
}

/**
 * A full-bleed hero photo. Falls back to the untouched stored original if a Cloudinary
 * transformation is rejected, so a delivery misconfiguration never blanks the hero.
 */
export default function HeroImage({
  url,
  alt,
  className,
  priority = false,
  sizes = '100vw',
}: HeroImageProps) {
  const [useOriginal, setUseOriginal] = useState(false);
  if (!url) {
    return null;
  }

  const absolute = url.startsWith('http') ? url : apiUrl(url);
  const srcSet = useOriginal ? undefined : cloudinarySrcSet(absolute);

  return (
    <img
      className={className}
      src={srcSet ? cloudinaryWidth(absolute, LARGEST_HERO_WIDTH) : absolute}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setUseOriginal(true)}
    />
  );
}
