-- Rename protein pantry bucket to non_veg
UPDATE inventory SET food_group = 'non_veg' WHERE food_group = 'protein';
