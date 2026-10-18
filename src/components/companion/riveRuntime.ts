import { Alignment, Fit, Layout, Rive, RuntimeLoader } from '@rive-app/canvas';
import wasmUrl from '@rive-app/canvas/rive.wasm?url';

let configured = false;
export function createCompanion(canvas: HTMLCanvasElement, assets: { rive: string; wasm: string }, onLoad: () => void, onError: () => void) {
  if (!configured) {
    RuntimeLoader.setWasmUrl(assets.wasm || wasmUrl);
    RuntimeLoader.setWasmFallbackUrl(null); // No external CDN or cross-site request.
    configured = true;
  }
  return new Rive({
    src: assets.rive, canvas, artboard: 'Behtan', stateMachines: 'Companion',
    autoplay: true, autoBind: true, layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    isTouchScrollEnabled: true, shouldDisableRiveListeners: true,
    // Host provides one keyboard-accessible greeting button instead of duplicate touch handlers.
    onLoad, onLoadError: onError,
  });
}
