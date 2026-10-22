import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import type { Exercise } from "./types";
export function ExerciseMedia({ exercise }: { exercise: Exercise }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaying(false);
  }, [exercise.id]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, []);
  return (
    <div className="training-media">
      <img
        width="180"
        height="180"
        loading="lazy"
        src={playing ? exercise.animation : exercise.poster}
        alt={"اجرای " + exercise.name}
      />
      <button
        type="button"
        onClick={() => setPlaying((v) => !v)}
        aria-label={(playing ? "توقف" : "پخش") + " آموزش " + exercise.name}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}{" "}
        {playing ? "توقف" : "دیدن حرکت"}
      </button>
    </div>
  );
}
