import { useId } from 'react';
import styles from './BrandMark.module.css';

interface BrandMarkProps {
  /** Rendered height in pixels. Width follows the wordmark's fixed aspect ratio. */
  size?: number;
  /**
   * `badge` paints the silk-flag logo (Türkiye-red satin letters) for light surfaces;
   * `mono` draws the whole wordmark in a single `currentColor` ink for coloured surfaces.
   */
  variant?: 'badge' | 'mono';
  /** Accessible name announced to assistive tech. */
  label?: string;
  className?: string;
}

/**
 * Letters are spaced by their *painted* edges, not by the path coordinates: a monoline
 * letter reaches half a stroke (5.5u) past its centreline, while a filled medallion
 * reaches its full radius, so mixing the two would make the medallions look looser than
 * the strokes. Laying them out on a constant 15-unit ink gap keeps the rhythm even.
 * viewBox is tuned to the letter paths below; keep in sync when the artwork changes.
 */
const VIEWBOX_MIN_X = -4;
const VIEWBOX_MIN_Y = 16;
const VIEWBOX_WIDTH = 552;
const VIEWBOX_HEIGHT = 86;

/**
 * The logotype is the word itself — "medbourse", hand-drawn as a wordmark with no
 * separate emblem. The letters read like the flag: a **silk/satin red** body with the
 * three business lines **knocked out in white**, sitting in the round letters.
 *
 * Three letters carry the lines as white cut-outs (plain geometry, no icon font):
 *  · the bowl of "d" holds a graduation cap → education
 *  · the bowl of "b" holds a location pin → travel
 *  · the "o" holds a medical cross → health
 */
export default function BrandMark({
  size = 40,
  variant = 'badge',
  label = 'Medbourse',
  className,
}: BrandMarkProps) {
  const uid = useId();
  const silkId = `${uid}-silk`;
  const maskId = `${uid}-motifs`;
  /** `badge` = silk-red satin (a diagonal multi-stop sheen reads as fabric); `mono` = flat ink. */
  const ink = variant === 'badge' ? `url(#${silkId})` : 'currentColor';
  const width = (size * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT;

  return (
    <svg
      className={className ?? styles.mark}
      width={width}
      height={size}
      viewBox={`${VIEWBOX_MIN_X} ${VIEWBOX_MIN_Y} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <defs>
        {/* Satin sheen: stacked highlights along the diagonal imitate woven silk. */}
        <linearGradient id={silkId} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="552" y2="98">
          <stop offset="0%" stopColor="#ff8087" />
          <stop offset="14%" stopColor="#e30a17" />
          <stop offset="30%" stopColor="#a8060f" />
          <stop offset="46%" stopColor="#e30a17" />
          <stop offset="60%" stopColor="#ff9ea4" />
          <stop offset="74%" stopColor="#cf0a14" />
          <stop offset="88%" stopColor="#8f050d" />
          <stop offset="100%" stopColor="#b0060f" />
        </linearGradient>

        {/* The motifs are punched out of the letters, so they always read as white
            (i.e. the light surface) on light backgrounds and as the surface colour elsewhere. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={VIEWBOX_MIN_X} y={VIEWBOX_MIN_Y} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT}>
          <rect x={VIEWBOX_MIN_X} y={VIEWBOX_MIN_Y} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="#ffffff" />
          <g fill="#000000">
            {/* education — graduation cap inside the bowl of "d" (centre 176.5) */}
            <path d="M176.5 62 L189.5 70 L176.5 78 L163.5 70 Z" />
            {/* travel — location pin inside the bowl of "b" (centre 244.5) */}
            <path d="M244.5 61 C238.5 61 233.5 66 233.5 72 C233.5 80 244.5 89 244.5 89 C244.5 89 255.5 80 255.5 72 C255.5 66 250.5 61 244.5 61 Z" />
            {/* health — medical cross inside the "o" (centre 303.5) */}
            <rect x="299" y="62" width="9" height="26" rx="2" />
            <rect x="290.5" y="70.5" width="26" height="9" rx="2" />
          </g>
          <g fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round">
            <path d="M165.5 71 C165.5 81 187.5 81 187.5 71" />
          </g>
          <g fill="none" stroke="#000000" strokeWidth="2.4" strokeLinecap="round">
            <path d="M187.5 70 V78" />
          </g>
          <circle cx="187.5" cy="80" r="1.9" fill="#000000" />
          {/* the pin keeps its hole → leave that spot visible */}
          <circle cx="244.5" cy="71" r="3.2" fill="#ffffff" />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        {/* ── Silk medallions (the round letters: d / b / o) ── */}
        <g fill={ink}>
          <circle cx="176.5" cy="75" r="22" />
          <circle cx="244.5" cy="75" r="22" />
          <circle cx="303.5" cy="75" r="22" />
        </g>

        {/* ── Monoline letters ── */}
        <g
          fill="none"
          stroke={ink}
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* m — stems at 6 / 40 / 74 */}
          <path d="M6 92 V75 A17 17 0 0 1 40 75 V92" />
          <path d="M40 75 A17 17 0 0 1 74 75 V92" />

          {/* e — bowl centred on 117 */}
          <path d="M134 75 A17 17 0 1 0 127.93 88.02" />
          <path d="M100 75 H134" />

          {/* d — ascender (bowl is the medallion at 176.5) */}
          <path d="M196.5 26 V92" />

          {/* b — ascender (bowl is the medallion at 244.5) */}
          <path d="M222.5 26 V92" />

          {/* u — stems at 346 / 380 */}
          <path d="M346 58 V75 A17 17 0 0 0 380 75 V58" />

          {/* r — stem at 406, arm out to 420 */}
          <path d="M406 92 V58" />
          <path d="M406 68 C406 60 412 58 420 58" />

          {/* s — 446 → 480 */}
          <path d="M480 63 C474 56 452 56 449 66 C446 76 474 72 476 80 C478 88 452 90 446 83" />

          {/* e — bowl centred on 523 */}
          <path d="M540 75 A17 17 0 1 0 533.93 88.02" />
          <path d="M506 75 H540" />
        </g>
      </g>
    </svg>
  );
}
