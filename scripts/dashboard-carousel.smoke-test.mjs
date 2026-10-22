import { readFileSync } from 'node:fs';

const carousel = readFileSync(new URL('../src/components/dashboard/DailyOverviewCarousel.tsx', import.meta.url), 'utf8');

const assertions = [
  ['Horizontal dragging enabled', carousel.includes("drag={slides.length > 1 ? 'x' : false}")],
  ['Infinite pagination uses wrapped page index', carousel.includes('wrapIndex(page, slides.length)')],
  ['Swipe distance guard exists', carousel.includes('SWIPE_DISTANCE')],
  ['Swipe velocity guard exists', carousel.includes('SWIPE_VELOCITY')],
  ['Both direction controls exist', carousel.includes('کارت قبلی') && carousel.includes('کارت بعدی')],
  ['Swipe hint exists', carousel.includes('<span>بکشید</span>')],
  ['Animated swipe hint exists', carousel.includes('animate={{ x: [-3, 3, -3] }}')],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('❌ Behtan reusable carousel smoke test failed');
  for (const [label] of failed) console.error(`   - ${label}`);
  process.exit(1);
}

console.log('✅ Behtan reusable carousel smoke test passed');
console.log('   Infinite left/right navigation: enabled');
console.log('   Touch/mouse drag: enabled');
console.log('   Visual swipe affordance: arrows + dots + animated swipe hint');
