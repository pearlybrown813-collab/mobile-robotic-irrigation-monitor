-- =====================================================================
-- Starter data: sampling points on the test plot and default thresholds.
-- Users and the robot device are created by server/src/initDb.ts so that
-- their password / API key can be hashed properly.
-- =====================================================================

INSERT IGNORE INTO sampling_points (point_index, label, distance_m, crop, notes) VALUES
  (1, 'Bed A - North end',  1.50, 'Tomato', 'Near the water tap'),
  (2, 'Bed A - Middle',     3.00, 'Tomato', NULL),
  (3, 'Bed B - Shaded',     4.50, 'Pepper', 'Partly shaded after 2 p.m.'),
  (4, 'Bed B - Open sun',   6.00, 'Pepper', 'Full sun, dries quickly'),
  (5, 'Bed C - South end',  7.50, 'Okra',   'Slight slope');

INSERT IGNORE INTO thresholds (setting_key, setting_value, description) VALUES
  ('dry_below',   30.00, 'Soil moisture (%) below which the point is classified as DRY'),
  ('wet_above',   60.00, 'Soil moisture (%) above which the point is classified as WET'),
  ('hot_above',   35.00, 'Ambient temperature (deg C) above which a high-temperature advisory is shown'),
  ('adc_dry_raw', 3000,  'Raw ADC value of the moisture sensor in dry air (calibration point 1)'),
  ('adc_wet_raw', 1200,  'Raw ADC value of the moisture sensor in water (calibration point 2)');
