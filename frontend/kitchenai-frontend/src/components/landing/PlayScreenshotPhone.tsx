import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BRAND_DISPLAY_NAME } from '../../constants/brand';
import {
  PLAY_HERO_SCREENSHOT_SRC,
  PLAY_SHOWCASE_COUNT,
  PLAY_SHOWCASE_SLIDES,
  playScreenshotSrc,
} from '../../constants/playScreenshots';

/** Static home-screen mockup in the hero (screenshot 01). */
export function HeroHomePhone() {
  return (
    <div className="phone-wrap">
      <div className="glow" />
      <div className="phone">
        <div className="screen phone-screen-shot">
          <img
            src={PLAY_HERO_SCREENSHOT_SRC}
            alt={`${BRAND_DISPLAY_NAME} home screen`}
            className="phone-shot-img"
            decoding="sync"
            fetchPriority="high"
          />
        </div>
      </div>
    </div>
  );
}

/** Compact phone mockup for the “How it works” steps section. */
export function StepScreenshotPhone({
  screenshotIndex,
  alt,
}: {
  screenshotIndex: number;
  alt: string;
}) {
  return (
    <div className="step-phone">
      <div className="step-phone-bezel">
        <img
          src={playScreenshotSrc(screenshotIndex)}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}

const GAP_PX = 24;
const SWIPE_THRESHOLD_PX = 48;
const AUTO_ADVANCE_MS = 6000;

function loopSlides() {
  return [...PLAY_SHOWCASE_SLIDES, ...PLAY_SHOWCASE_SLIDES, ...PLAY_SHOWCASE_SLIDES];
}

export function AppShowcaseCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const jumpingRef = useRef(false);
  const [index, setIndex] = useState(PLAY_SHOWCASE_COUNT);
  const [cardWidth, setCardWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const dragRef = useRef<{ startX: number; dragging: boolean }>({ startX: 0, dragging: false });

  const slides = useMemo(() => loopSlides(), []);
  const activeDot = ((index % PLAY_SHOWCASE_COUNT) + PLAY_SHOWCASE_COUNT) % PLAY_SHOWCASE_COUNT;

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const card = viewport.querySelector<HTMLElement>('.showcase-card');
    if (!card) return;
    const width = card.offsetWidth;
    if (width > 0) {
      setCardWidth(width);
      setReady(true);
    }
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  useEffect(() => {
    PLAY_SHOWCASE_SLIDES.forEach((slide) => {
      const img = new window.Image();
      img.src = playScreenshotSrc(slide.screenshotIndex);
    });
  }, []);

  const stride = cardWidth + GAP_PX;
  const offset =
    cardWidth && viewportRef.current
      ? viewportRef.current.offsetWidth / 2 - cardWidth / 2 - index * stride
      : 0;

  const applyTrackTransform = useCallback(
    (nextOffset: number, animate: boolean) => {
      const track = trackRef.current;
      if (!track) return;
      track.style.transition = animate
        ? 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'none';
      track.style.transform = `translateX(${nextOffset}px)`;
    },
    [],
  );

  useLayoutEffect(() => {
    applyTrackTransform(offset, !jumpingRef.current);
  }, [offset, applyTrackTransform]);

  const jumpToIndex = useCallback(
    (nextIndex: number) => {
      if (!cardWidth || !viewportRef.current) {
        setIndex(nextIndex);
        return;
      }
      jumpingRef.current = true;
      const nextOffset =
        viewportRef.current.offsetWidth / 2 - cardWidth / 2 - nextIndex * stride;
      applyTrackTransform(nextOffset, false);
      setIndex(nextIndex);
      requestAnimationFrame(() => {
        jumpingRef.current = false;
      });
    },
    [applyTrackTransform, cardWidth, stride],
  );

  const step = useCallback((delta: number) => {
    setIndex((current) => current + delta);
  }, []);

  const goToDot = useCallback((dot: number) => {
    setIndex(PLAY_SHOWCASE_COUNT + dot);
  }, []);

  const handleTrackTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.propertyName !== 'transform') return;
      if (jumpingRef.current) return;

      if (index >= PLAY_SHOWCASE_COUNT * 2) {
        jumpToIndex(index - PLAY_SHOWCASE_COUNT);
        return;
      }
      if (index < PLAY_SHOWCASE_COUNT) {
        jumpToIndex(index + PLAY_SHOWCASE_COUNT);
      }
    },
    [index, jumpToIndex],
  );

  useEffect(() => {
    const id = window.setInterval(() => step(1), AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [step]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: event.clientX, dragging: true };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const delta = event.clientX - dragRef.current.startX;
    dragRef.current.dragging = false;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    step(delta > 0 ? -1 : 1);
  };

  return (
    <section className="app-showcase" aria-label={`${BRAND_DISPLAY_NAME} app preview`}>
      <div className="showcase-shell">
        <button
          type="button"
          className="showcase-arrow showcase-arrow--prev"
          aria-label="Previous slide"
          onClick={() => step(-1)}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>

        <div
          ref={viewportRef}
          className={`showcase-viewport${ready ? ' is-ready' : ''}`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            ref={trackRef}
            className="showcase-track"
            onTransitionEnd={handleTrackTransitionEnd}
          >
            {slides.map((slide, i) => (
              <article
                key={`${slide.title}-${i}`}
                className={`showcase-card${i === index ? ' is-active' : ''}`}
                aria-hidden={i !== index}
              >
                <div className="showcase-phone">
                  <div className="showcase-phone-bezel">
                    <img
                      src={playScreenshotSrc(slide.screenshotIndex)}
                      alt=""
                      loading="eager"
                      decoding="async"
                      draggable={false}
                    />
                  </div>
                </div>
                <div className="showcase-copy">
                  <h3>{slide.title}</h3>
                  <p>{slide.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="showcase-arrow showcase-arrow--next"
          aria-label="Next slide"
          onClick={() => step(1)}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="showcase-dots" role="tablist" aria-label="Choose app screen">
        {PLAY_SHOWCASE_SLIDES.map((slide, dot) => (
          <button
            key={slide.title}
            type="button"
            role="tab"
            aria-selected={dot === activeDot}
            aria-label={`Show ${slide.title}`}
            className={dot === activeDot ? 'on' : ''}
            onClick={() => goToDot(dot)}
          />
        ))}
      </div>
    </section>
  );
}
