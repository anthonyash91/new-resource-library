INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES
  ('Housing', 'housing', 'Shelter, transitional housing, and rental assistance', 1, true),
  ('Healthcare', 'healthcare', 'Medical, mental health, and primary care', 2, true),
  ('Employment', 'employment', 'Job training, placement, and workforce services', 3, true),
  ('Legal Aid', 'legal-aid', 'Legal help, expungement, and court navigation', 4, true),
  ('Financial Assistance', 'financial-assistance', 'Benefits, emergency funds, and financial coaching', 5, true),
  ('Substance Use Treatment', 'substance-use-treatment', 'Recovery, treatment, and peer support', 6, true),
  ('Food & Nutrition', 'food-nutrition', 'Food banks, SNAP help, and meal programs', 7, true),
  ('Education', 'education', 'GED, college, and skills training', 8, true),
  ('ID & Documentation', 'id-documentation', 'Birth certificates, IDs, and vital records', 9, true),
  ('Veterans Services', 'veterans', 'Programs for veterans and their families', 10, true),
  ('Reentry Support', 'reentry-support', 'Reentry navigation and community coalitions', 11, true),
  ('Family & Children', 'family-services', 'Family reunification and child-related support', 12, true),
  ('Transportation', 'transportation', 'Rides, bus passes, and mobility help', 13, true)
ON CONFLICT (slug) DO NOTHING;
