import { useEffect, useState } from 'react';
import type { TrainingInput } from '../training/types';
import { TRAINING_DRAFT_KEY } from './trainingDraft';

function readDraft(): TrainingInput {
  try {
    const draft = JSON.parse(sessionStorage.getItem(TRAINING_DRAFT_KEY) ?? 'null');
    if (draft?.version === 1 && Array.isArray(draft.days) && draft.screening) {
      return { ...draft, screening: { ...draft.screening, confirmed: false } };
    }
  } catch {
    // Storage can be blocked or contain an invalid draft. Use a fresh form.
  }
  return {
    version: 1,
    location: 'home',
    experience: 'beginner',
    goal: 'general',
    days: [],
    minutes: 45,
    equipment: [],
    start_date: new Date().toISOString().slice(0, 10),
    screening: { confirmed: false, symptoms: false, pain: false, restriction: false, recent_surgery: false },
  };
}

export function useTrainingDraft() {
  const [input, setInput] = useState(readDraft);
  useEffect(() => {
    try {
      sessionStorage.setItem(TRAINING_DRAFT_KEY, JSON.stringify(input));
    } catch {
      // Checkout reports a recoverable error if it cannot read the draft.
    }
  }, [input]);
  return [input, setInput] as const;
}
