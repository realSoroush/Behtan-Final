import { EXERCISES } from "./catalog";
import { ExerciseMedia } from "./ExerciseMedia";
import "./training.css";
export function ExerciseGuide({ id }: { id: string }) {
  const exercise = EXERCISES.find((x) => x.id === id);
  return (
    <main className="training-guide" dir="rtl">
      <a href="/">به‌تن</a>
      {exercise ? (
        <>
          <small>آموزش حرکت</small>
          <h1>{exercise.name}</h1>
          <ExerciseMedia exercise={exercise} />
          <ol>
            {exercise.cues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <p>
            حرکت را کنترل‌شده و در دامنه بدون درد انجام بده. برای ست، تکرار و
            مقاومت از برنامه اختصاصی خودت استفاده کن.
          </p>
        </>
      ) : (
        <h1>حرکت پیدا نشد.</h1>
      )}
    </main>
  );
}
