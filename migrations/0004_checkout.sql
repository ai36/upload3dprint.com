-- plan §4: upper bound of the promised date is stored in the order (SC-003).
ALTER TABLE orders ADD COLUMN due_date TEXT; -- YYYY-MM-DD

-- Settings used by the stub integrations (plan §2.3) and checkout (FR-009–FR-011).
INSERT INTO settings (key, value) VALUES
  ('tax_rate', '0'),                -- plan §2.3: tax stub rate, default 0
  -- placeholder: replace after USPS account (FR-010); cents by parcel weight
  ('shipping_rates', '[{"max_g":250,"cents":600},{"max_g":500,"cents":750},{"max_g":1000,"cents":950},{"max_g":2000,"cents":1300},{"max_g":5000,"cents":2000}]'),
  ('ship_from_zip', '"97201"'),     -- placeholder: Portland, OR (FR-010), owner sets it
  ('packaging', '{"weight_g":150,"size_mm":[250,200,100]}'), -- placeholder: owner sets it (FR-010)
  ('material_density_g_cm3', '{"pla":1.24,"petg":1.27}'), -- parcel weight (T022)
  ('operator_email', '"operator@example.com"'), -- placeholder: owner sets it
  ('reminder_business_days', '1');  -- SC-003: remind the operator this many business days before due_date
