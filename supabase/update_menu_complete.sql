-- Complete Menu Update Script for American Food Items
-- This script replaces all existing menu items with American food items
-- Run this in your Supabase SQL Editor

-- Step 1: Delete all existing menu items
DELETE FROM menu_items;

-- Step 2: Insert new American food items organized by category

-- ============================================
-- MAIN COURSE / LUNCH / DINNER
-- ============================================
INSERT INTO menu_items (name, description, ingredients, spice_level, price, category, is_available) VALUES
('Classic Burger', 'Juicy beef patty with lettuce, tomato, onion, and special sauce on a sesame seed bun', ARRAY['Beef Patty', 'Lettuce', 'Tomato', 'Onion', 'Pickles', 'Special Sauce', 'Sesame Bun'], 0, 12.99, 'Main Course', true),
('Cheeseburger', 'Classic burger with melted American cheese', ARRAY['Beef Patty', 'American Cheese', 'Lettuce', 'Tomato', 'Onion', 'Pickles', 'Special Sauce', 'Sesame Bun'], 0, 13.99, 'Main Course', true),
('BBQ Bacon Burger', 'Beef patty with crispy bacon, cheddar cheese, and BBQ sauce', ARRAY['Beef Patty', 'Bacon', 'Cheddar Cheese', 'BBQ Sauce', 'Lettuce', 'Tomato', 'Onion', 'Bun'], 1, 15.99, 'Main Course', true),
('Grilled Chicken Sandwich', 'Tender grilled chicken breast with mayo, lettuce, and tomato', ARRAY['Chicken Breast', 'Mayonnaise', 'Lettuce', 'Tomato', 'Onion', 'Brioche Bun'], 0, 11.99, 'Main Course', true),
('Club Sandwich', 'Triple-decker sandwich with turkey, bacon, lettuce, tomato, and mayo', ARRAY['Turkey', 'Bacon', 'Lettuce', 'Tomato', 'Mayonnaise', 'Bread'], 0, 13.99, 'Main Course', true),
('BLT Sandwich', 'Crispy bacon, fresh lettuce, and tomato on toasted bread', ARRAY['Bacon', 'Lettuce', 'Tomato', 'Mayonnaise', 'Bread'], 0, 10.99, 'Main Course', true),
('Fried Chicken', 'Crispy southern-style fried chicken with secret spices', ARRAY['Chicken', 'Flour', 'Spices', 'Buttermilk', 'Oil'], 2, 14.99, 'Main Course', true),
('BBQ Ribs', 'Tender pork ribs slow-cooked and glazed with BBQ sauce', ARRAY['Pork Ribs', 'BBQ Sauce', 'Spices', 'Brown Sugar'], 2, 18.99, 'Main Course', true),
('Mac and Cheese', 'Creamy macaroni with three-cheese blend', ARRAY['Macaroni', 'Cheddar Cheese', 'Mozzarella', 'Parmesan', 'Butter', 'Milk'], 0, 9.99, 'Main Course', true);

-- ============================================
-- APPETIZERS / SIDES
-- ============================================
INSERT INTO menu_items (name, description, ingredients, spice_level, price, category, is_available) VALUES
('French Fries', 'Crispy golden fries served hot', ARRAY['Potatoes', 'Salt', 'Oil'], 0, 4.99, 'Appetizer', true),
('Onion Rings', 'Beer-battered onion rings, crispy and golden', ARRAY['Onions', 'Flour', 'Beer', 'Spices', 'Oil'], 0, 5.99, 'Appetizer', true),
('Chicken Wings', 'Spicy buffalo wings with blue cheese dip', ARRAY['Chicken Wings', 'Hot Sauce', 'Butter', 'Blue Cheese', 'Celery'], 3, 10.99, 'Appetizer', true),
('Mozzarella Sticks', 'Breaded mozzarella sticks with marinara sauce', ARRAY['Mozzarella Cheese', 'Breadcrumbs', 'Marinara Sauce', 'Oil'], 0, 7.99, 'Appetizer', true),
('Nachos', 'Tortilla chips loaded with cheese, jalapeños, and sour cream', ARRAY['Tortilla Chips', 'Cheese', 'Jalapeños', 'Sour Cream', 'Salsa'], 2, 8.99, 'Appetizer', true);

-- ============================================
-- BEVERAGES / SOFT DRINKS
-- ============================================
INSERT INTO menu_items (name, description, ingredients, spice_level, price, category, is_available) VALUES
('Cola', 'Classic cola soft drink', ARRAY['Carbonated Water', 'Sugar', 'Caramel Color', 'Natural Flavors'], 0, 2.99, 'Beverage', true),
('Diet Cola', 'Zero-calorie cola drink', ARRAY['Carbonated Water', 'Artificial Sweetener', 'Caramel Color', 'Natural Flavors'], 0, 2.99, 'Beverage', true),
('Lemonade', 'Freshly squeezed lemonade, sweet and tangy', ARRAY['Lemons', 'Sugar', 'Water', 'Ice'], 0, 3.99, 'Beverage', true),
('Iced Tea', 'Refreshing iced tea, sweetened or unsweetened', ARRAY['Tea', 'Water', 'Sugar', 'Ice', 'Lemon'], 0, 2.99, 'Beverage', true),
('Milkshake', 'Creamy vanilla milkshake', ARRAY['Vanilla Ice Cream', 'Milk', 'Whipped Cream', 'Cherry'], 0, 5.99, 'Beverage', true),
('Chocolate Milkshake', 'Rich chocolate milkshake', ARRAY['Chocolate Ice Cream', 'Milk', 'Chocolate Syrup', 'Whipped Cream'], 0, 5.99, 'Beverage', true),
('Strawberry Milkshake', 'Sweet strawberry milkshake', ARRAY['Strawberry Ice Cream', 'Milk', 'Fresh Strawberries', 'Whipped Cream'], 0, 5.99, 'Beverage', true),
('Coffee', 'Hot brewed coffee', ARRAY['Coffee Beans', 'Water'], 0, 3.99, 'Beverage', true),
('Iced Coffee', 'Cold brewed iced coffee', ARRAY['Coffee', 'Ice', 'Milk', 'Sugar'], 0, 4.99, 'Beverage', true);

-- ============================================
-- DESSERTS
-- ============================================
INSERT INTO menu_items (name, description, ingredients, spice_level, price, category, is_available) VALUES
('Apple Pie', 'Classic American apple pie with flaky crust', ARRAY['Apples', 'Flour', 'Butter', 'Sugar', 'Cinnamon', 'Nutmeg'], 0, 6.99, 'Dessert', true),
('Chocolate Cake', 'Rich chocolate layer cake with frosting', ARRAY['Chocolate', 'Flour', 'Sugar', 'Eggs', 'Butter', 'Cocoa Powder'], 0, 7.99, 'Dessert', true),
('Cheesecake', 'Creamy New York-style cheesecake', ARRAY['Cream Cheese', 'Sugar', 'Eggs', 'Graham Cracker Crust', 'Vanilla'], 0, 8.99, 'Dessert', true),
('Ice Cream Sundae', 'Vanilla ice cream with hot fudge, whipped cream, and cherry', ARRAY['Vanilla Ice Cream', 'Hot Fudge', 'Whipped Cream', 'Cherry', 'Nuts'], 0, 6.99, 'Dessert', true),
('Brownie', 'Warm chocolate brownie with vanilla ice cream', ARRAY['Chocolate', 'Flour', 'Sugar', 'Butter', 'Eggs', 'Vanilla Ice Cream'], 0, 5.99, 'Dessert', true);

-- ============================================
-- BREAD / SIDES
-- ============================================
INSERT INTO menu_items (name, description, ingredients, spice_level, price, category, is_available) VALUES
('Garlic Bread', 'Toasted bread with garlic butter', ARRAY['Bread', 'Butter', 'Garlic', 'Parsley'], 0, 4.99, 'Bread', true),
('Breadsticks', 'Soft breadsticks with marinara sauce', ARRAY['Flour', 'Yeast', 'Butter', 'Garlic', 'Marinara Sauce'], 0, 5.99, 'Bread', true);

-- ============================================
-- VERIFICATION QUERY (optional - run to check)
-- ============================================
-- SELECT category, COUNT(*) as item_count, 
--        STRING_AGG(name, ', ') as items
-- FROM menu_items 
-- WHERE is_available = true
-- GROUP BY category
-- ORDER BY category;
