import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, MoveHorizontal } from 'lucide-react';

export interface DailyOverviewSlide {
  id: string;
  label: string;
  content: ReactNode;
}

interface DailyOverviewCarouselProps {
  slides: DailyOverviewSlide[];
}

const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 420;

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

export function DailyOverviewCarousel({ slides }: DailyOverviewCarouselProps) {
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);

  const activeIndex = slides.length > 0 ? wrapIndex(page, slides.length) : 0;
  const activeSlide = slides[activeIndex];

  const paginate = useCallback((nextDirection: 1 | -1) => {
    if (slides.length < 2) return;
    setDirection(nextDirection);
    setPage((current) => current + nextDirection);
  }, [slides.length]);

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x <= -SWIPE_DISTANCE || info.velocity.x <= -SWIPE_VELOCITY) {
      paginate(1);
      return;
    }
    if (info.offset.x >= SWIPE_DISTANCE || info.velocity.x >= SWIPE_VELOCITY) {
      paginate(-1);
    }
  }, [paginate]);

  const edgeHints = useMemo(() => {
    if (slides.length < 2) return null;
    return (
      <>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-8 -left-1 z-0 w-3 rounded-r-2xl border border-primary-100/80 bg-primary-50/90 shadow-sm dark:border-primary-900/50 dark:bg-primary-950/50"
          animate={{ x: [-1, 1, -1], opacity: [0.55, 0.9, 0.55] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-8 -right-1 z-0 w-3 rounded-l-2xl border border-primary-100/80 bg-primary-50/90 shadow-sm dark:border-primary-900/50 dark:bg-primary-950/50"
          animate={{ x: [1, -1, 1], opacity: [0.55, 0.9, 0.55] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </>
    );
  }, [slides.length]);

  if (!activeSlide) return null;

  return (
    <section aria-label="کارت‌های خلاصه روزانه" className="space-y-2.5">
      <div className="relative -mx-1 px-1">
        {edgeHints}
        <div className="relative z-10 overflow-hidden rounded-[1.6rem] touch-pan-y">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={page}
              custom={direction}
              variants={{
                enter: (dir: number) => ({ x: dir > 0 ? 64 : -64, opacity: 0.55, scale: 0.985 }),
                center: { x: 0, opacity: 1, scale: 1 },
                exit: (dir: number) => ({ x: dir > 0 ? -64 : 64, opacity: 0.25, scale: 0.985 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.75 }}
              drag={slides.length > 1 ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragEnd={handleDragEnd}
              whileDrag={{ scale: 0.992, cursor: 'grabbing' }}
              className={slides.length > 1 ? 'cursor-grab select-none' : undefined}
            >
              {activeSlide.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-between gap-3 px-1" dir="ltr">
          <button
            type="button"
            onClick={() => paginate(-1)}
            aria-label="کارت قبلی"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white/85 text-neutral-500 shadow-sm transition hover:-translate-x-0.5 hover:text-primary-600 dark:border-neutral-800 dark:bg-neutral-900/85 dark:text-neutral-400 dark:hover:text-primary-400"
          >
            <ChevronLeft size={15} />
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-3" dir="rtl">
            <div className="flex items-center gap-1.5" dir="ltr" aria-label={`کارت ${activeIndex + 1} از ${slides.length}`}>
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => {
                    if (index === activeIndex) return;
                    paginate(index > activeIndex ? 1 : -1);
                  }}
                  aria-label={`نمایش ${slide.label}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === activeIndex
                      ? 'w-5 bg-primary-500'
                      : 'w-1.5 bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-600'
                  }`}
                />
              ))}
            </div>

            <motion.div
              aria-hidden="true"
              animate={{ x: [-3, 3, -3] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              className="flex items-center gap-1 text-[10px] font-medium text-neutral-400 dark:text-neutral-500"
            >
              <MoveHorizontal size={13} />
              <span>بکشید</span>
            </motion.div>
          </div>

          <button
            type="button"
            onClick={() => paginate(1)}
            aria-label="کارت بعدی"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white/85 text-neutral-500 shadow-sm transition hover:translate-x-0.5 hover:text-primary-600 dark:border-neutral-800 dark:bg-neutral-900/85 dark:text-neutral-400 dark:hover:text-primary-400"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
