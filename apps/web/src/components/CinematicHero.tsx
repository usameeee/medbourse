import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  resolveAppLocale,
  type AppLocale,
  type PublicShowcaseFrame,
  type PublicShowcaseSlide,
} from '@medbourse/shared';
import HeroImage from './HeroImage';
import styles from './CinematicHero.module.css';

/*
 * Scroll length is proportional to the total frame count: every frame buys one "unit" of
 * camera travel, and a scene-to-scene gap is worth 60% of a frame (the spec's longer
 * crossfade). Nothing here is tied to a fixed scene or frame count.
 */
const SCROLL_VH_PER_UNIT = 50;
const SCENE_GAP_WEIGHT = 0.6;
/** Consecutive frames inside a scene overlap by ~35% while crossfading. */
const FRAME_OVERLAP = 0.35;
/** Scene-to-scene crossfades are longer: they span ~60% of the gap and dip the brightness. */
const SCENE_OVERLAP = 0.6;
/** Cap on the pointer-depth drift, in pixels — corporate, not a gimmick. */
const MAX_DEPTH_PX = 11;

interface FrameSlot {
  key: string;
  frame: PublicShowcaseFrame;
  globalIndex: number;
  /** Where the camera settles on this frame, as normalised scroll progress. */
  start: number;
  end: number;
  /** Crossfade windows, resolved once neighbours are known. */
  fadeIn: [number, number] | null;
  fadeOut: [number, number] | null;
  isLastOfScene: boolean;
}

interface SceneSlot {
  key: string;
  scene: PublicShowcaseSlide;
  index: number;
  start: number;
  end: number;
  frames: FrameSlot[];
}

interface HeroLayout {
  scenes: SceneSlot[];
  /** Every frame in scroll order, for O(1) lookups by `globalIndex`. */
  frames: FrameSlot[];
  gaps: { mid: number; half: number }[];
  totalWeight: number;
}

type Keyframe = [number, number];

/**
 * Framer Motion needs a strictly increasing keyframe list; duplicate positions are
 * collapsed (last value wins) so a degenerate scene can never produce a NaN transform.
 */
function toCurve(pairs: Keyframe[]): { input: number[]; output: number[] } {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const input: number[] = [];
  const output: number[] = [];
  for (const [rawKey, value] of sorted) {
    const key = Math.min(1, Math.max(0, rawKey));
    if (input.length > 0 && key <= input[input.length - 1]) {
      output[output.length - 1] = value;
      continue;
    }
    input.push(key);
    output.push(value);
  }
  if (input.length === 0) {
    return { input: [0, 1], output: [1, 1] };
  }
  if (input.length === 1) {
    return { input: [0, 1], output: [output[0], output[0]] };
  }
  return { input, output };
}

/** Maps scrubbed progress through an arbitrary keyframe curve. */
function useCurve(progress: MotionValue<number>, pairs: Keyframe[]): MotionValue<number> {
  const curve = toCurve(pairs);
  return useTransform(progress, curve.input, curve.output);
}

/**
 * Turns the CMS scenes into a normalised timeline. A scene's frames are laid out as one
 * continuous move; the gap that follows each scene is where two scenes dissolve.
 */
function buildLayout(scenes: PublicShowcaseSlide[]): HeroLayout {
  const totalFrames = scenes.reduce((sum, scene) => sum + scene.frames.length, 0);
  const gapCount = Math.max(0, scenes.length - 1);
  const totalWeight = totalFrames + gapCount * SCENE_GAP_WEIGHT;
  if (totalWeight <= 0) {
    return { scenes: [], frames: [], gaps: [], totalWeight: 0 };
  }

  const sceneSlots: SceneSlot[] = [];
  const flatFrames: FrameSlot[] = [];
  const gaps: { mid: number; half: number }[] = [];
  let cursor = 0;
  let globalIndex = 0;

  scenes.forEach((scene, index) => {
    const count = scene.frames.length;
    const span = count / totalWeight;
    const start = cursor;
    const end = start + span;
    const step = count > 0 ? span / count : 0;
    const frames: FrameSlot[] = scene.frames.map((frame, k) => ({
      key: `${scene.id}:${k}`,
      frame,
      globalIndex: globalIndex++,
      start: start + k * step,
      end: start + (k + 1) * step,
      fadeIn: null,
      fadeOut: null,
      isLastOfScene: k === count - 1,
    }));
    sceneSlots.push({ key: scene.id, scene, index, start, end, frames });
    flatFrames.push(...frames);
    cursor = end;
    if (index < scenes.length - 1) {
      const gapEnd = cursor + SCENE_GAP_WEIGHT / totalWeight;
      gaps.push({ mid: (cursor + gapEnd) / 2, half: (SCENE_OVERLAP / 2) * (gapEnd - cursor) });
      cursor = gapEnd;
    }
  });

  // Resolve crossfades now that each scene knows its neighbours.
  sceneSlots.forEach((slot, index) => {
    const prevGap = index > 0 ? gaps[index - 1] : null;
    const nextGap = index < sceneSlots.length - 1 ? gaps[index] : null;
    const count = slot.frames.length;
    slot.frames.forEach((frame, k) => {
      const half = (FRAME_OVERLAP / 2) * (frame.end - frame.start);
      if (k > 0) {
        frame.fadeIn = [frame.start - half, frame.start + half];
      } else if (prevGap) {
        frame.fadeIn = [prevGap.mid - prevGap.half, prevGap.mid + prevGap.half];
      }
      if (k < count - 1) {
        frame.fadeOut = [frame.end - half, frame.end + half];
      } else if (nextGap) {
        frame.fadeOut = [nextGap.mid - nextGap.half, nextGap.mid + nextGap.half];
      }
    });
  });

  return { scenes: sceneSlots, frames: flatFrames, gaps, totalWeight };
}

function sceneIndexAt(scenes: SceneSlot[], progress: number): number {
  for (const slot of scenes) {
    if (progress < slot.end) return slot.index;
  }
  return Math.max(0, scenes.length - 1);
}

function frameIndexAt(frames: FrameSlot[], progress: number): number {
  for (const slot of frames) {
    if (progress < slot.end) return slot.globalIndex;
  }
  return frames.length > 0 ? frames[frames.length - 1].globalIndex : 0;
}

function altFor(scene: PublicShowcaseSlide, locale: AppLocale): string {
  return scene.altText[locale] || scene.headline[locale] || scene.name[locale];
}

/** One stacked photo. Only its own opacity/scale/drift move; one frame is on top at a time. */
function FrameLayer({
  slot,
  progress,
  isFinal,
  active,
  shouldLoad,
  priority,
  alt,
}: {
  slot: FrameSlot;
  progress: MotionValue<number>;
  isFinal: boolean;
  active: boolean;
  shouldLoad: boolean;
  priority: boolean;
  alt: string;
}) {
  const opacity = useCurve(progress, [
    [0, slot.fadeIn ? 0 : 1],
    ...(slot.fadeIn ? ([[slot.fadeIn[0], 0], [slot.fadeIn[1], 1]] as Keyframe[]) : []),
    ...(slot.fadeOut ? ([[slot.fadeOut[0], 1], [slot.fadeOut[1], 0]] as Keyframe[]) : []),
    [1, slot.fadeOut ? 0 : 1],
  ]);

  // A frame only ever zooms in slowly; the last frame of the last scene pulls back instead.
  const span: [number, number] = [slot.start, Math.max(slot.start + 1e-4, slot.end)];
  const scale = useTransform(progress, span, isFinal ? [1.08, 1] : [1, 1.06]);
  const y = useTransform(progress, span, isFinal ? ['0%', '-4%'] : ['0%', '-1.5%']);

  const focal = {
    '--focal-x': `${slot.frame.focalX}%`,
    '--focal-y': `${slot.frame.focalY}%`,
  } as CSSProperties;

  return (
    <motion.div
      className={styles.layer}
      data-active={active ? 'true' : undefined}
      style={{ ...focal, opacity, scale, y }}
    >
      {shouldLoad && slot.frame.imageUrl && (
        <HeroImage
          className={styles.image}
          url={slot.frame.imageUrl}
          alt={alt}
          priority={priority}
          sizes="100vw"
        />
      )}
    </motion.div>
  );
}

/** Bottom-left copy for one scene; rises in, then clears out before the next scene begins. */
function SceneCopy({
  slot,
  progress,
  locale,
  isFirst,
  isLast,
}: {
  slot: SceneSlot;
  progress: MotionValue<number>;
  locale: AppLocale;
  isFirst: boolean;
  isLast: boolean;
}) {
  const span = Math.max(1e-4, slot.end - slot.start);
  const titleIn = [slot.start, slot.start + span * 0.1] as const;
  const descIn = [slot.start + span * 0.03, slot.start + span * 0.15] as const;
  const buttonIn = [slot.start + span * 0.26, slot.start + span * 0.42] as const;
  const out = isLast ? null : ([slot.end - span * 0.12, slot.end - span * 0.02] as const);

  const fade = (startsAt: number, endsAt: number): Keyframe[] => [
    [0, 0],
    [startsAt, 0],
    [endsAt, 1],
    ...(out ? ([[out[0], 1], [out[1], 0]] as Keyframe[]) : []),
    [1, out ? 0 : 1],
  ];

  const titleOpacity = useCurve(progress, fade(titleIn[0], titleIn[1]));
  const titleY = useTransform(progress, [titleIn[0], titleIn[1]], [60, 0]);
  const eyebrowY = useTransform(progress, [titleIn[0], titleIn[1]], [80, 0]);
  const descOpacity = useCurve(progress, fade(descIn[0], descIn[1]));
  const descY = useTransform(progress, [descIn[0], descIn[1]], [40, 0]);
  const buttonOpacity = useCurve(progress, fade(buttonIn[0], buttonIn[1]));
  const buttonY = useTransform(progress, [buttonIn[0], buttonIn[1]], [20, 0]);

  const { t } = useTranslation();
  const eyebrow = slot.scene.eyebrow[locale];
  const title = slot.scene.headline[locale];
  const description = slot.scene.narrative[locale];
  const category = slot.scene.category;
  const Heading = isFirst ? motion.h1 : motion.h2;

  return (
    <div className={styles.copy}>
      {eyebrow && (
        <motion.p className={styles.eyebrow} style={{ opacity: titleOpacity, y: eyebrowY }}>
          {eyebrow}
        </motion.p>
      )}
      {title && (
        <Heading className={styles.title} style={{ opacity: titleOpacity, y: titleY }}>
          {title}
        </Heading>
      )}
      {description && (
        <motion.p className={styles.description} style={{ opacity: descOpacity, y: descY }}>
          {description}
        </motion.p>
      )}
      {category && (
        <motion.div className={styles.buttonWrap} style={{ opacity: buttonOpacity, y: buttonY }}>
          <Link className={styles.button} to={`/category/${category}`}>
            {t(`categoryCta.${category}`)}
            <svg
              className={styles.buttonIcon}
              width="18"
              height="18"
              viewBox="0 0 18 18"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M3 9h11M9.5 4l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </Link>
        </motion.div>
      )}
    </div>
  );
}

interface CinematicHeroProps {
  slides: PublicShowcaseSlide[];
}

/**
 * A scroll-controlled cinematic hero: one pinned full-screen stage whose master timeline is
 * scrubbed by scroll. Every scene, frame, caption and control is read from the CMS payload —
 * nothing here is hardcoded. Under `prefers-reduced-motion` it degrades to stacked stills.
 */
export default function CinematicHero({ slides }: CinematicHeroProps) {
  const { t, i18n } = useTranslation();
  const reduced = useReducedMotion();
  const locale = resolveAppLocale(i18n.resolvedLanguage ?? i18n.language);

  // A scene with no usable frame has nothing to show.
  const scenes = useMemo(
    () => slides.filter((slide) => slide.frames.some((frame) => frame.imageUrl)),
    [slides],
  );
  const layout = useMemo(() => buildLayout(scenes), [scenes]);

  const wrapperRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ['start start', 'end end'],
  });

  const [activeScene, setActiveScene] = useState(0);
  const [activeFrame, setActiveFrame] = useState(0);
  // The loading window only ever grows, so an image is never unmounted and refetched.
  const [maxLoadedFrame, setMaxLoadedFrame] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const nextScene = sceneIndexAt(layout.scenes, progress);
    const nextFrame = frameIndexAt(layout.frames, progress);
    setActiveScene((prev) => (prev === nextScene ? prev : nextScene));
    setActiveFrame((prev) => (prev === nextFrame ? prev : nextFrame));
  });

  // Preload the current scene plus the one after it, then keep them.
  useEffect(() => {
    const current = layout.scenes[sceneIndexAt(layout.scenes, layout.frames[activeFrame]?.start ?? 0)];
    if (!current) return;
    const next = layout.scenes[current.index + 1];
    const last = next ? next.frames[next.frames.length - 1] : current.frames[current.frames.length - 1];
    if (last) setMaxLoadedFrame((prev) => (last.globalIndex > prev ? last.globalIndex : prev));
  }, [activeFrame, layout]);

  // Pointer depth: a few pixels of drift, desktop and fine pointer only.
  const depthX = useMotionValue(0);
  const depthY = useMotionValue(0);
  const driftX = useSpring(depthX, { stiffness: 120, damping: 22, mass: 0.4 });
  const driftY = useSpring(depthY, { stiffness: 120, damping: 22, mass: 0.4 });

  useEffect(() => {
    if (reduced || !window.matchMedia('(pointer: fine)').matches) return;
    function onMove(event: PointerEvent) {
      depthX.set(((event.clientX / window.innerWidth) * 2 - 1) * MAX_DEPTH_PX);
      depthY.set(((event.clientY / window.innerHeight) * 2 - 1) * MAX_DEPTH_PX);
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [reduced, depthX, depthY]);

  // Gentle brightness dip, only across the gaps between scenes.
  const veilOpacity = useCurve(scrollYProgress, [
    [0, 0],
    ...layout.gaps.flatMap(
      (gap): Keyframe[] => [
        [gap.mid - gap.half, 0],
        [gap.mid, 0.5],
        [gap.mid + gap.half, 0],
      ],
    ),
    [1, 0],
  ]);

  const goToScene = useCallback(
    (index: number) => {
      const element = wrapperRef.current;
      const slot = layout.scenes[index];
      if (!element || !slot) return;
      const top = window.scrollY + element.getBoundingClientRect().top;
      const distance = Math.max(0, element.offsetHeight - window.innerHeight);
      window.scrollTo({ top: top + slot.start * distance, behavior: 'smooth' });
    },
    [layout],
  );

  if (layout.scenes.length === 0) {
    return null;
  }

  const label = t('publicSite.showcaseLabel');

  // Reduced motion: no pin, no scrub, no parallax — plain stacked sections showing each
  // scene's first frame and its text.
  if (reduced) {
    return (
      <section className={styles.static} aria-label={label}>
        {layout.scenes.map((slot, position) => {
          const frame = slot.frames[0]?.frame;
          const focal = {
            '--focal-x': `${frame?.focalX ?? 50}%`,
            '--focal-y': `${frame?.focalY ?? 50}%`,
          } as CSSProperties;
          const eyebrow = slot.scene.eyebrow[locale];
          const description = slot.scene.narrative[locale];
          const category = slot.scene.category;
          return (
            <article className={styles.staticItem} key={slot.key} style={focal}>
              {frame?.imageUrl && (
                <HeroImage
                  className={styles.staticImage}
                  url={frame.imageUrl}
                  alt={altFor(slot.scene, locale)}
                  sizes="100vw"
                />
              )}
              <div className={styles.staticText}>
                {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
                {position === 0 ? (
                  <h1 className={styles.title}>{slot.scene.headline[locale]}</h1>
                ) : (
                  <h2 className={styles.title}>{slot.scene.headline[locale]}</h2>
                )}
                {description && <p className={styles.description}>{description}</p>}
                {category && (
                  <Link className={styles.button} to={`/category/${category}`}>
                    {t(`categoryCta.${category}`)}
                    <svg
                      className={styles.buttonIcon}
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M3 9h11M9.5 4l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </section>
    );
  }

  const lastSceneIndex = layout.scenes.length - 1;

  return (
    <section
      ref={wrapperRef}
      className={styles.wrapper}
      style={{ height: `${100 + SCROLL_VH_PER_UNIT * layout.totalWeight}svh` }}
      aria-label={label}
    >
      <div className={styles.viewport}>
        <motion.div className={styles.parallax} style={{ x: driftX, y: driftY }}>
          {layout.scenes.map((sceneSlot) =>
            sceneSlot.frames.map((frameSlot) => (
              <FrameLayer
                key={frameSlot.key}
                slot={frameSlot}
                progress={scrollYProgress}
                isFinal={sceneSlot.index === lastSceneIndex && frameSlot.isLastOfScene}
                active={
                  frameSlot.globalIndex === activeFrame ||
                  frameSlot.globalIndex === activeFrame + 1
                }
                shouldLoad={frameSlot.globalIndex <= maxLoadedFrame}
                priority={frameSlot.globalIndex === 0}
                alt={altFor(sceneSlot.scene, locale)}
              />
            )),
          )}
        </motion.div>

        <div className={styles.scrim} aria-hidden="true" />
        <motion.div className={styles.veil} style={{ opacity: veilOpacity }} aria-hidden="true" />

        {layout.scenes.map((sceneSlot) => (
          <SceneCopy
            key={sceneSlot.key}
            slot={sceneSlot}
            progress={scrollYProgress}
            locale={locale}
            isFirst={sceneSlot.index === 0}
            isLast={sceneSlot.index === lastSceneIndex}
          />
        ))}

        <nav className={styles.dots} aria-label={label}>
          {layout.scenes.map((sceneSlot) => {
            const active = sceneSlot.index === activeScene;
            const sceneLabel =
              sceneSlot.scene.name[locale] ||
              sceneSlot.scene.headline[locale] ||
              `${sceneSlot.index + 1}`;
            return (
              <button
                key={sceneSlot.key}
                type="button"
                className={styles.dot}
                data-active={active ? 'true' : undefined}
                aria-label={sceneLabel}
                aria-current={active ? 'true' : undefined}
                onClick={() => goToScene(sceneSlot.index)}
              >
                <span className={styles.dotLabel} aria-hidden="true">
                  {sceneLabel}
                </span>
                <span className={styles.dotMark} aria-hidden="true" />
              </button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
