-- ===========================================================================
-- AS Store — sample catalog (mirrors the storefront's current mock data, so the
-- live site looks the same once it's wired to the API).
-- Run AFTER schema.sql, in the same `as_store` database. Idempotent.
-- ===========================================================================

-- --- Categories ------------------------------------------------------------
INSERT INTO categories (name, slug, tagline, image_url, sort) VALUES
  ('Smartphones', 'smartphones', 'The future, in your pocket.', 'https://picsum.photos/seed/bento-phone/1200/800',  1),
  ('Audio',       'audio',       'Hear the difference.',        'https://picsum.photos/seed/bento-audio/1200/1200', 2),
  ('Computing',   'computing',   'Built to create.',            'https://picsum.photos/seed/bento-comp/1200/800',   3),
  ('Wearables',   'wearables',   'Wellness, worn well.',        'https://picsum.photos/seed/bento-wear/1200/1200',  4),
  ('Smart Home',  'smart-home',  'A home that listens.',        'https://picsum.photos/seed/bento-home/1200/1200',  5),
  ('Accessories', 'accessories', 'The finishing touch.',        'https://picsum.photos/seed/bento-acc/1200/1200',   6)
ON CONFLICT (slug) DO NOTHING;

-- --- Products (joined to their category by slug) ----------------------------
INSERT INTO products (name, slug, tagline, price, category_id, colors, is_new, featured, sort)
SELECT v.name, v.slug, v.tagline, v.price, c.id, v.colors::jsonb, v.is_new, v.featured, v.sort
FROM (VALUES
  ('Aurora Pro 5G',    'aurora-pro-5g',     'Brilliant. In every sense.', 1199::numeric, 'smartphones', '["#1d1d1f","#9aa0a6","#2b5797","#b0392f"]', true, true,  1),
  ('Pulse Buds Air',   'pulse-buds-air',    'Silence the world.',          189,          'audio',       '["#f5f5f7","#1d1d1f"]',                     true, false, 2),
  ('Vortex Watch X',   'vortex-watch-x',    'Your day, on your wrist.',    349,          'wearables',   '["#1d1d1f","#d8c4a0","#9aa0a6"]',           true, false, 3),
  ('Nimbus Book 14',   'nimbus-book-14',    'Power to go far.',           1549,          'computing',   '["#9aa0a6","#1d1d1f"]',                     true, true,  4),
  ('Halo Smart Hub',   'halo-smart-hub',    'Your home, in harmony.',      129,          'smart-home',  '["#f5f5f7"]',                               true, false, 5),
  ('Quantum Charger',  'quantum-charger',   '65W. Tiny. Mighty.',           59,          'accessories', '["#1d1d1f","#f5f5f7"]',                     true, false, 6),
  ('Echo Sound Bar',   'echo-sound-bar',    'Cinema, at home.',            279,          'audio',       '["#1d1d1f"]',                               true, false, 7),
  ('Nebula 4K Monitor','nebula-4k-monitor', 'See everything.',             389,          'computing',   '["#1d1d1f"]',                               true, true,  8),
  ('PowerCore 20K',    'powercore-20k',     'All-day backup.',              49,          'accessories', '["#1d1d1f","#f5f5f7"]',                     true, false, 9),
  ('Glide Keyboard',   'glide-keyboard',    'Type like a dream.',          119,          'accessories', '["#1d1d1f","#f5f5f7"]',                     true, false, 10),
  ('Aura Smart Bulbs', 'aura-smart-bulbs',  '16 million colors.',           39,          'smart-home',  '["#f5f5f7"]',                               true, false, 11),
  ('Vortex Fit Band',  'vortex-fit-band',   'Move more.',                   89,          'wearables',   '["#1d1d1f","#b0392f"]',                     true, false, 12)
) AS v(name, slug, tagline, price, cat_slug, colors, is_new, featured, sort)
JOIN categories c ON c.slug = v.cat_slug
ON CONFLICT (slug) DO NOTHING;

-- --- Primary product image (one each; gallery can grow later) ---------------
INSERT INTO product_images (product_id, url, alt, sort)
SELECT p.id, x.url, p.name, 0
FROM (VALUES
  ('aurora-pro-5g',     'https://picsum.photos/seed/as-phone-1/1200/1200'),
  ('pulse-buds-air',    'https://picsum.photos/seed/as-buds-2/1200/1200'),
  ('vortex-watch-x',    'https://picsum.photos/seed/as-watch-3/1200/1200'),
  ('nimbus-book-14',    'https://picsum.photos/seed/as-laptop-4/1200/1200'),
  ('halo-smart-hub',    'https://picsum.photos/seed/as-hub-5/1200/1200'),
  ('quantum-charger',   'https://picsum.photos/seed/as-charger-6/1200/1200'),
  ('echo-sound-bar',    'https://picsum.photos/seed/as-soundbar-7/1200/1200'),
  ('nebula-4k-monitor', 'https://picsum.photos/seed/as-monitor-10/1200/1200'),
  ('powercore-20k',     'https://picsum.photos/seed/as-powerbank-12/1200/1200'),
  ('glide-keyboard',    'https://picsum.photos/seed/as-keyboard-14/1200/1200'),
  ('aura-smart-bulbs',  'https://picsum.photos/seed/as-bulb-15/1200/1200'),
  ('vortex-fit-band',   'https://picsum.photos/seed/as-band-16/1200/1200')
) AS x(slug, url)
JOIN products p ON p.slug = x.slug
ON CONFLICT (product_id, url) DO NOTHING;

-- --- Default site settings -------------------------------------------------
INSERT INTO settings (id, store_name, announcement_enabled, announcement_text,
  contact_email, contact_phone, contact_whatsapp, contact_address, socials, nav_links, footer_groups)
VALUES (
  1, 'AS Store', true, 'Free delivery across Lebanon · 12-month warranty',
  'store@ascompany.com', '+961 1 000 000', '+9611000000', 'Beirut, Lebanon',
  '{"instagram":"https://instagram.com","facebook":"https://facebook.com","tiktok":"","x":"","youtube":""}'::jsonb,
  '[{"label":"Store","href":"/"},{"label":"Smartphones","href":"/"},{"label":"Audio","href":"/"},{"label":"Computing","href":"/"},{"label":"Wearables","href":"/"},{"label":"Smart Home","href":"/"},{"label":"Accessories","href":"/"},{"label":"Support","href":"/pages/support"}]'::jsonb,
  '[{"title":"Shop","links":[{"label":"Smartphones","href":"/"},{"label":"Audio","href":"/"},{"label":"Computing","href":"/"},{"label":"Accessories","href":"/"}]},{"title":"Support","links":[{"label":"Contact us","href":"/pages/contact"},{"label":"Shipping & Returns","href":"/pages/shipping"},{"label":"Warranty","href":"/pages/warranty"}]},{"title":"Company","links":[{"label":"About AS","href":"/pages/about"},{"label":"Support","href":"/pages/support"}]}]'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- --- Sample content pages --------------------------------------------------
INSERT INTO pages (slug, title, body, sort) VALUES
  ('about','About AS Store','AS Store is the retail arm of AS Company (Absolute Solutions SAL), Lebanon''s market leader in telecommunication and electronics since 2008.

We bring you genuine, warrantied tech delivered across Lebanon.', 1),
  ('contact','Contact us','Questions? Reach us by email at store@ascompany.com or on WhatsApp.

We''re here to help every day.', 2),
  ('shipping','Shipping & Returns','We deliver across Lebanon within 24-72 hours.

Returns are accepted within 7 days of delivery in original condition.', 3),
  ('warranty','Warranty','All products carry a 12-month warranty unless otherwise stated.', 4),
  ('support','Support','Need help? Visit our contact page or message us on WhatsApp and our team will assist you.', 5)
ON CONFLICT (slug) DO NOTHING;
