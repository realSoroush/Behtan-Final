import type { Meal } from '../../src/types';

export interface IntakeFixture {
  user: string;
  day: string;
  context: string;
  revision: string;
  profileContext: string;
  extraId: string;
  meal: Meal;
}
