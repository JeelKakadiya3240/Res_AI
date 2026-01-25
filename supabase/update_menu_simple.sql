-- Simple UPDATE script to change existing menu items to American food
-- This keeps the same number of items but updates their names and details

-- Update existing items to American food (keeping same IDs)
UPDATE menu_items SET 
  name = 'Classic Burger',
  description = 'Juicy beef patty with lettuce, tomato, onion, and special sauce',
  ingredients = ARRAY['Beef Patty', 'Lettuce', 'Tomato', 'Onion', 'Pickles', 'Special Sauce', 'Sesame Bun'],
  spice_level = 0,
  price = 12.99,
  category = 'Main Course'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 0);

UPDATE menu_items SET 
  name = 'Cheeseburger',
  description = 'Classic burger with melted American cheese',
  ingredients = ARRAY['Beef Patty', 'American Cheese', 'Lettuce', 'Tomato', 'Onion', 'Pickles', 'Special Sauce'],
  spice_level = 0,
  price = 13.99,
  category = 'Main Course'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 1);

UPDATE menu_items SET 
  name = 'BBQ Bacon Burger',
  description = 'Beef patty with crispy bacon, cheddar cheese, and BBQ sauce',
  ingredients = ARRAY['Beef Patty', 'Bacon', 'Cheddar Cheese', 'BBQ Sauce', 'Lettuce', 'Tomato'],
  spice_level = 1,
  price = 15.99,
  category = 'Main Course'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 2);

UPDATE menu_items SET 
  name = 'Grilled Chicken Sandwich',
  description = 'Tender grilled chicken breast with mayo, lettuce, and tomato',
  ingredients = ARRAY['Chicken Breast', 'Mayonnaise', 'Lettuce', 'Tomato', 'Onion', 'Brioche Bun'],
  spice_level = 0,
  price = 11.99,
  category = 'Main Course'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 3);

UPDATE menu_items SET 
  name = 'Club Sandwich',
  description = 'Triple-decker sandwich with turkey, bacon, lettuce, tomato, and mayo',
  ingredients = ARRAY['Turkey', 'Bacon', 'Lettuce', 'Tomato', 'Mayonnaise', 'Bread'],
  spice_level = 0,
  price = 13.99,
  category = 'Main Course'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 4);

UPDATE menu_items SET 
  name = 'French Fries',
  description = 'Crispy golden fries served hot',
  ingredients = ARRAY['Potatoes', 'Salt', 'Oil'],
  spice_level = 0,
  price = 4.99,
  category = 'Appetizer'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 5);

UPDATE menu_items SET 
  name = 'Chicken Wings',
  description = 'Spicy buffalo wings with blue cheese dip',
  ingredients = ARRAY['Chicken Wings', 'Hot Sauce', 'Butter', 'Blue Cheese', 'Celery'],
  spice_level = 3,
  price = 10.99,
  category = 'Appetizer'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 6);

UPDATE menu_items SET 
  name = 'Cola',
  description = 'Classic cola soft drink',
  ingredients = ARRAY['Carbonated Water', 'Sugar', 'Caramel Color', 'Natural Flavors'],
  spice_level = 0,
  price = 2.99,
  category = 'Beverage'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 7);

UPDATE menu_items SET 
  name = 'Lemonade',
  description = 'Freshly squeezed lemonade, sweet and tangy',
  ingredients = ARRAY['Lemons', 'Sugar', 'Water', 'Ice'],
  spice_level = 0,
  price = 3.99,
  category = 'Beverage'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 8);

UPDATE menu_items SET 
  name = 'Iced Tea',
  description = 'Refreshing iced tea, sweetened or unsweetened',
  ingredients = ARRAY['Tea', 'Water', 'Sugar', 'Ice', 'Lemon'],
  spice_level = 0,
  price = 2.99,
  category = 'Beverage'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 9);

UPDATE menu_items SET 
  name = 'Milkshake',
  description = 'Creamy vanilla milkshake',
  ingredients = ARRAY['Vanilla Ice Cream', 'Milk', 'Whipped Cream', 'Cherry'],
  spice_level = 0,
  price = 5.99,
  category = 'Beverage'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 10);

UPDATE menu_items SET 
  name = 'Apple Pie',
  description = 'Classic American apple pie with flaky crust',
  ingredients = ARRAY['Apples', 'Flour', 'Butter', 'Sugar', 'Cinnamon', 'Nutmeg'],
  spice_level = 0,
  price = 6.99,
  category = 'Dessert'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 11);

UPDATE menu_items SET 
  name = 'Chocolate Cake',
  description = 'Rich chocolate layer cake with frosting',
  ingredients = ARRAY['Chocolate', 'Flour', 'Sugar', 'Eggs', 'Butter', 'Cocoa Powder'],
  spice_level = 0,
  price = 7.99,
  category = 'Dessert'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 12);

UPDATE menu_items SET 
  name = 'Garlic Bread',
  description = 'Toasted bread with garlic butter',
  ingredients = ARRAY['Bread', 'Butter', 'Garlic', 'Parsley'],
  spice_level = 0,
  price = 4.99,
  category = 'Bread'
WHERE id = (SELECT id FROM menu_items LIMIT 1 OFFSET 13);
