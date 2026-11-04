-- Starting catalog (FR-007): FDM, PLA, PETG, one executor.
INSERT INTO technologies (id, name, min_wall_mm) VALUES
  ('fdm', 'FDM', 0.8); -- placeholder: replace after contractor choice (docs/contractors.md)

INSERT INTO materials (id, name, technology_id, price_per_cm3, colors) VALUES
  -- placeholder: replace after contractor choice (docs/contractors.md)
  ('pla', 'PLA', 'fdm', 0.10, '["Black","White","Gray"]'),
  -- placeholder: replace after contractor choice (docs/contractors.md)
  ('petg', 'PETG', 'fdm', 0.12, '["Black","White"]');

INSERT INTO executors (id, name, technology_ids, build_x_mm, build_y_mm, build_z_mm, lead_days_min, lead_days_max, pickup_address) VALUES
  -- placeholder: replace after contractor choice (docs/contractors.md)
  ('contractor-1', 'Portland contractor', '["fdm"]', 220, 220, 250, 2, 4, NULL);

INSERT INTO settings (key, value) VALUES
  ('markup', '0.3'),                -- placeholder: temporary dev value, owner sets it
  ('min_price', '5'),               -- USD; placeholder: temporary dev value, owner sets it
  ('volume_discounts', '[{"min_qty":1,"discount":0}]'), -- plan D-4: mechanism on, values 0 %
  ('max_file_mb', '100'),           -- FR-002
  ('file_retention_days', '30'),    -- FR-015
  ('draft_retention_days', '7'),    -- FR-015
  ('usps_transit_days_min', '2'),   -- placeholder: replace after USPS service choice
  ('usps_transit_days_max', '5');   -- placeholder: replace after USPS service choice
