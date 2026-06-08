-- Backfill food_group on restaurant ingredient catalog and sync restaurant stock.

UPDATE restaurant_ingredients ri
SET food_group = CASE
    WHEN name_normalized ~ '(chicken|mutton|lamb|fish|prawn|shrimp|egg|meat|keema|sausage|bacon|seafood|pork|beef)' THEN 'non_veg'
    WHEN name_normalized ~ '(bread| bun|bun |pav|naan|kulcha|roti|tortilla|burger bun)' THEN 'bakery'
    WHEN name_normalized ~ '(tea|coffee|juice|squash|soda|cola|sharbat|syrup|lassi|milkshake)' THEN 'beverages'
    WHEN name_normalized ~ '( oil|oil |ghee|vanaspati|shortening|cooking oil)' THEN 'oils_fats'
    WHEN name_normalized ~ '(milk|paneer|curd|yogurt|dahi|butter|cream|cheese|khoya|mawa|malai)' THEN 'dairy'
    WHEN name_normalized ~ '(rice| dal|dal |lentil|pulse|urad|moong|chana|chickpea|rajma|besan|atta|flour|wheat|semolina|rava|suji|oats|pasta|boondi|masoor|toor|pigeon pea|matar)' THEN 'grains_pulses'
    WHEN name_normalized ~ '(masala|powder|spice|turmeric|cumin|cardamom|ajwain|clove|cinnamon|nutmeg|mace|fenugreek|methi|saffron|anise|mustard seed|bay leaf|garam|chaat|biryani masala|chole masala|coriander powder|chilli powder|red chilli powder|cumin powder|black pepper|white pepper|peppercorn)' THEN 'spices'
    WHEN name_normalized ~ '(apple|banana|mango|orange|grape|papaya|pineapple|berry|melon|pomegranate|guava)' THEN 'fruits'
    WHEN name_normalized ~ '(onion|tomato|potato|ginger|garlic|carrot|capsicum|bell pepper|cauliflower|cabbage|cucumber|spinach|palak|coriander|mint|lemon|lime|green chilli|chilli|mushroom|broccoli|zucchini|eggplant|brinjal|okra|ladyfinger|beetroot|radish|turnip|lettuce|celery|spring onion)' THEN 'vegetables'
    WHEN name_normalized ~ '(sauce|ketchup|vinegar|pickle|paste|soy|mayonnaise|mustard|tamarind|chutney)' THEN 'condiments'
    ELSE food_group
END
WHERE food_group = 'other';

UPDATE restaurant_ingredients SET food_group = 'vegetables' WHERE name_normalized IN ('onion', 'tomato', 'potato', 'ginger', 'garlic', 'green chilli');
UPDATE restaurant_ingredients SET food_group = 'dairy' WHERE name_normalized IN ('paneer', 'curd', 'milk', 'butter', 'cream');
UPDATE restaurant_ingredients SET food_group = 'grains_pulses' WHERE name_normalized IN ('toor dal', 'chana dal', 'moong dal', 'basmati rice');
UPDATE restaurant_ingredients SET food_group = 'oils_fats' WHERE name_normalized IN ('cooking oil', 'ghee');
UPDATE restaurant_ingredients SET food_group = 'spices' WHERE name_normalized IN ('turmeric powder', 'red chilli powder', 'coriander powder', 'garam masala', 'cumin seeds', 'salt');

UPDATE inventory i
SET food_group = ri.food_group,
    updated_at = CURRENT_TIMESTAMP
FROM restaurant_ingredients ri
WHERE ri.name_normalized = LOWER(TRIM(i.canonical_name))
  AND i.kitchen_id IN (SELECT kitchen_id FROM kitchens WHERE kind = 'restaurant')
  AND COALESCE(NULLIF(TRIM(i.food_group), ''), 'other') IS DISTINCT FROM ri.food_group;
