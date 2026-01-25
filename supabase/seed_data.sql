-- Insert sample menu items
INSERT INTO menu_items (name, description, ingredients, spice_level, price, category) VALUES
('Butter Chicken', 'Creamy tomato-based curry with tender chicken pieces', ARRAY['Chicken', 'Butter', 'Tomato', 'Cream', 'Garam Masala', 'Ginger', 'Garlic'], 2, 15.99, 'Main Course'),
('Chicken Biryani', 'Fragrant basmati rice cooked with marinated chicken and aromatic spices', ARRAY['Chicken', 'Basmati Rice', 'Onions', 'Yogurt', 'Biryani Masala', 'Saffron', 'Mint'], 3, 18.99, 'Main Course'),
('Paneer Tikka', 'Grilled cottage cheese cubes marinated in spices', ARRAY['Paneer', 'Yogurt', 'Garam Masala', 'Lemon', 'Bell Peppers', 'Onions'], 2, 12.99, 'Appetizer'),
('Dal Makhani', 'Creamy black lentils cooked with butter and spices', ARRAY['Black Lentils', 'Butter', 'Cream', 'Tomatoes', 'Ginger', 'Garlic', 'Cumin'], 1, 10.99, 'Main Course'),
('Chicken Vindaloo', 'Spicy and tangy curry with chicken in a hot sauce', ARRAY['Chicken', 'Vinegar', 'Red Chilies', 'Garlic', 'Ginger', 'Mustard Seeds', 'Turmeric'], 5, 16.99, 'Main Course'),
('Vegetable Samosa', 'Crispy pastry filled with spiced potatoes and peas', ARRAY['Potatoes', 'Peas', 'Flour', 'Cumin', 'Coriander', 'Garam Masala'], 2, 4.99, 'Appetizer'),
('Naan Bread', 'Soft and fluffy leavened flatbread', ARRAY['Flour', 'Yogurt', 'Yeast', 'Butter'], 0, 3.99, 'Bread'),
('Mango Lassi', 'Refreshing yogurt drink with mango', ARRAY['Mango', 'Yogurt', 'Sugar', 'Cardamom'], 0, 5.99, 'Beverage'),
('Chicken Tikka Masala', 'Grilled chicken in a creamy tomato sauce', ARRAY['Chicken', 'Tomato', 'Cream', 'Garam Masala', 'Paprika', 'Ginger', 'Garlic'], 2, 17.99, 'Main Course'),
('Palak Paneer', 'Spinach curry with cottage cheese cubes', ARRAY['Spinach', 'Paneer', 'Onions', 'Ginger', 'Garlic', 'Cumin', 'Cream'], 1, 13.99, 'Main Course'),
('Tandoori Chicken', 'Yogurt-marinated chicken cooked in tandoor', ARRAY['Chicken', 'Yogurt', 'Tandoori Masala', 'Lemon', 'Ginger', 'Garlic'], 3, 16.99, 'Main Course'),
('Gulab Jamun', 'Sweet milk dumplings in sugar syrup', ARRAY['Milk Powder', 'Flour', 'Sugar', 'Cardamom', 'Rose Water'], 0, 6.99, 'Dessert');
