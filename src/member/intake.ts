import type { Meal, MealSlot } from '../types/index.ts';

export type MemberIntakeIntent =
  | { kind: 'record'; slot: MealSlot; meal: Meal }
  | { kind: 'undo-record' | 'skip' | 'undo-skip'; slot: MealSlot }
  | { kind: 'extra-add'; slot: MealSlot; meal: Meal }
  | { kind: 'extra-remove'; id: string };

export type MemberIntakeRequest = MemberIntakeIntent & {
  date: string;
  requestId: string;
  catalogRevision: string;
  profileContext: string;
  intakeRevision: string;
  expectedUpdatedAt: string | null;
};

export type MemberIntakeReceipt = {
  kind: 'intake';
  date: string;
  intakeRevision: string;
  expectedUpdatedAt: string | null;
  replayed: boolean;
};
