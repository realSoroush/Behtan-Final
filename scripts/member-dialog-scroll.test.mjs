import assert from 'node:assert/strict';
import { acquireMemberScrollLock } from '../src/utils/memberDialogScroll.ts';
for (const order of [[0,1],[1,0]]) {
  const body = {style:{overflow:'auto'}};
  const releases = [acquireMemberScrollLock(body), acquireMemberScrollLock(body)];
  releases[order[0]]();
  assert.equal(body.style.overflow, 'hidden');
  const releaseSwap = acquireMemberScrollLock(body);
  releases[order[1]]();
  releases[order[1]]();
  assert.equal(body.style.overflow, 'hidden');
  releaseSwap();
  assert.equal(body.style.overflow, 'auto');
}
console.log('✓ Nested day/plate/swap scroll locks restore the original overflow in either cleanup order');
