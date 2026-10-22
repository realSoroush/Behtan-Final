import { useEffect, useRef } from "react";
import type { WaveController } from "./flow-wave-renderer";

/** Decorative only. Failure never blocks the content or app entry. */
export function FlowWave({ paused }: { paused: boolean }) {
  const webglRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<WaveController | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    let disposed = false;
    void import("./flow-wave-renderer")
      .then(({ createFlowWave }) => {
        if (disposed || !webglRef.current || !fallbackRef.current) return;
        controllerRef.current = createFlowWave(
          webglRef.current,
          fallbackRef.current,
          pausedRef.current,
        );
      })
      .catch(() => {
        /* The CSS gradient remains if the optional renderer cannot load. */
      });
    return () => {
      disposed = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);
  useEffect(() => {
    controllerRef.current?.setPaused(paused);
  }, [paused]);
  return (
    <div className="ambient" aria-hidden="true">
      <canvas className="wave-canvas" ref={webglRef} />
      <canvas className="wave-canvas" ref={fallbackRef} hidden />
    </div>
  );
}
