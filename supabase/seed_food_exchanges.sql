-- ============================================================================
-- Seed data: food_exchanges
-- Realistic starter set covering every category referenced by the meal
-- generation engine. Values are standard exchange-list approximations —
-- replace/expand with your verified nutrition source before production.
-- ============================================================================

insert into public.food_exchanges
  (id, category, name, amount, "weightGrams", kcal, carbs, protein, fat, fiber, sugar, gi_level)
values
  -- Starch
  ('st_1', 'starch', 'برنج پخته', '۱ پیمانه', 150, 205, 45, 4, 0, 1, 3, 'High'),
  ('st_2', 'starch', 'نان سنگک', '۱ کف دست', 30, 80, 16, 3, 1, 2, 0, 'Medium'),
  ('st_3', 'starch', 'سیب زمینی پخته', '۱ عدد متوسط', 150, 130, 30, 3, 0, 3, 2, 'Medium'),
  ('st_4', 'starch', 'نان جو', '۱ کف دست', 30, 75, 15, 3, 1, 2, 0, 'Low'),

  -- Meat — very lean
  ('mvl_1', 'meat_very_lean', 'سینه مرغ بدون پوست', '۳۰ گرم', 30, 35, 0, 7, 1, 0, 0, 'Low'),
  ('mvl_2', 'meat_very_lean', 'سفیده تخم مرغ', '۲ عدد', 66, 35, 0, 7, 0, 0, 0, 'Low'),

  -- Meat — lean
  ('ml_1', 'meat_lean', 'فیله ماهی سالمون', '۳۰ گرم', 30, 55, 0, 7, 3, 0, 0, 'Low'),
  ('ml_2', 'meat_lean', 'گوشت گوسفند کم چرب', '۳۰ گرم', 30, 55, 0, 7, 3, 0, 0, 'Low'),

  -- Meat — medium fat
  ('mmf_1', 'meat_medium_fat', 'تخم مرغ کامل', '۱ عدد', 50, 75, 1, 7, 5, 0, 0, 'Low'),
  ('mmf_2', 'meat_medium_fat', 'گوشت چرخ کرده متوسط', '۳۰ گرم', 30, 75, 0, 7, 5, 0, 0, 'Low'),

  -- Meat — high fat
  ('mhf_1', 'meat_high_fat', 'سوسیس', '۳۰ گرم', 30, 100, 1, 5, 8, 0, 0, 'Low'),

  -- Vegetable
  ('vg_1', 'vegetable', 'خیار', '۱ پیمانه خرد شده', 100, 25, 5, 2, 0, 2, 2, 'Low'),
  ('vg_2', 'vegetable', 'گوجه فرنگی', '۱ عدد متوسط', 120, 25, 5, 2, 0, 2, 3, 'Low'),
  ('vg_3', 'vegetable', 'کاهو', '۱ پیمانه', 55, 25, 5, 2, 0, 2, 1, 'Low'),
  ('vg_4', 'vegetable', 'اسفناج پخته', '۱ پیمانه', 90, 25, 5, 2, 0, 2, 0, 'Low'),

  -- Fruit
  ('fr_1', 'fruit', 'سیب', '۱ عدد متوسط', 120, 60, 15, 0, 0, 3, 11, 'Medium'),
  ('fr_2', 'fruit', 'موز', '۱ عدد کوچک', 100, 60, 15, 1, 0, 2, 9, 'High'),
  ('fr_3', 'fruit', 'پرتقال', '۱ عدد متوسط', 130, 60, 15, 1, 0, 3, 9, 'Low'),
  ('fr_4', 'fruit', 'توت فرنگی', '۱ پیمانه', 150, 60, 15, 1, 0, 3, 7, 'Low'),

  -- Dairy — skim
  ('ds_1', 'dairy_skim', 'ماست کم چرب', '۱ پیمانه', 245, 90, 12, 8, 0, 0, 12, 'Medium'),
  ('ds_2', 'dairy_skim', 'شیر بدون چربی', '۱ لیوان', 245, 90, 12, 8, 0, 0, 12, 'Medium'),

  -- Dairy — low fat
  ('dl_1', 'dairy_low_fat', 'ماست ۲ درصد', '۱ پیمانه', 245, 120, 12, 8, 5, 0, 12, 'Medium'),

  -- Dairy — whole
  ('dw_1', 'dairy_whole', 'شیر کامل', '۱ لیوان', 245, 150, 12, 8, 8, 0, 12, 'Medium'),
  ('dw_2', 'dairy_whole', 'پنیر سفید', '۳۰ گرم', 30, 150, 12, 8, 8, 0, 12, 'Low'),

  -- Fat
  ('ft_1', 'fat', 'روغن زیتون', '۱ قاشق چایخوری', 5, 45, 0, 0, 5, 0, 0, 'Low'),
  ('ft_2', 'fat', 'کره', '۱ قاشق چایخوری', 5, 45, 0, 0, 5, 0, 0, 'Low'),
  ('ft_3', 'fat', 'مغز گردو', '۴ نیمه', 8, 45, 1, 1, 4, 0, 0, 'Low'),
  ('ft_4', 'fat', 'آووکادو', '۲ قاشق غذاخوری', 30, 45, 2, 0, 4, 2, 0, 'Low'),

  -- Mixed dish (must always be paired with a starch item downstream)
  ('md_1', 'mixed_dish', 'قورمه سبزی', '۱ پیمانه', 250, 320, 15, 20, 18, 5, 3, 'Low'),
  ('md_2', 'mixed_dish', 'جوجه کباب', '۱ سیخ', 200, 280, 2, 35, 14, 0, 0, 'Low'),
  ('md_3', 'mixed_dish', 'خورش قیمه', '۱ پیمانه', 250, 310, 18, 18, 17, 4, 3, 'Medium'),
  ('md_4', 'mixed_dish', 'کوکو سبزی', '۲ برش', 150, 250, 10, 12, 17, 3, 2, 'Low'),

  -- Legume
  ('lg_1', 'legume', 'عدس پخته', '۱ پیمانه', 100, 115, 20, 9, 0, 8, 2, 'Low'),
  ('lg_2', 'legume', 'لوبیا چیتی پخته', '۱ پیمانه', 100, 120, 22, 8, 1, 7, 2, 'Low'),
  ('lg_3', 'legume', 'نخود پخته', '۱ پیمانه', 100, 120, 20, 8, 2, 6, 3, 'Low')
on conflict (id) do nothing;
