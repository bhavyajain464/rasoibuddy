export interface OnboardingStaple {
  id: string;
  name: string;
  qty: number;
  unit: string;
  category: string;
  selected: boolean;
}

/** Default pantry staples for onboarding step 3. Image: assets/staples/{id}.webp */
export const DEFAULT_ONBOARDING_STAPLES: OnboardingStaple[] = [
  // Grains & Flours
  { id: 'wheat-flour-atta', name: 'Wheat Flour (Atta)', qty: 5, unit: 'kg', category: 'Grains & Flours', selected: true },
  { id: 'rice-basmati', name: 'Rice (Basmati)', qty: 5, unit: 'kg', category: 'Grains & Flours', selected: true },
  { id: 'rice-flour', name: 'Rice Flour', qty: 1, unit: 'kg', category: 'Grains & Flours', selected: false },
  { id: 'besan', name: 'Besan (Gram Flour)', qty: 500, unit: 'g', category: 'Grains & Flours', selected: false },
  { id: 'sooji', name: 'Sooji (Semolina)', qty: 500, unit: 'g', category: 'Grains & Flours', selected: false },
  { id: 'poha', name: 'Poha (Flattened Rice)', qty: 500, unit: 'g', category: 'Grains & Flours', selected: false },

  // Dals & Lentils
  { id: 'toor-dal', name: 'Toor Dal', qty: 1, unit: 'kg', category: 'Dals & Lentils', selected: true },
  { id: 'moong-dal', name: 'Moong Dal', qty: 500, unit: 'g', category: 'Dals & Lentils', selected: true },
  { id: 'chana-dal', name: 'Chana Dal', qty: 500, unit: 'g', category: 'Dals & Lentils', selected: false },
  { id: 'masoor-dal', name: 'Masoor Dal', qty: 500, unit: 'g', category: 'Dals & Lentils', selected: false },
  { id: 'rajma', name: 'Rajma (Kidney Beans)', qty: 500, unit: 'g', category: 'Dals & Lentils', selected: false },
  { id: 'chole', name: 'Chole (Chickpeas)', qty: 500, unit: 'g', category: 'Dals & Lentils', selected: false },

  // Spices
  { id: 'turmeric-powder', name: 'Turmeric Powder', qty: 200, unit: 'g', category: 'Spices', selected: true },
  { id: 'red-chilli-powder', name: 'Red Chilli Powder', qty: 200, unit: 'g', category: 'Spices', selected: true },
  { id: 'coriander-powder', name: 'Coriander Powder', qty: 200, unit: 'g', category: 'Spices', selected: true },
  { id: 'cumin-powder', name: 'Cumin Powder', qty: 100, unit: 'g', category: 'Spices', selected: true },
  { id: 'garam-masala', name: 'Garam Masala', qty: 100, unit: 'g', category: 'Spices', selected: true },
  { id: 'cumin-seeds', name: 'Cumin Seeds (Jeera)', qty: 100, unit: 'g', category: 'Spices', selected: true },
  { id: 'mustard-seeds', name: 'Mustard Seeds', qty: 100, unit: 'g', category: 'Spices', selected: true },
  { id: 'black-pepper', name: 'Black Pepper', qty: 50, unit: 'g', category: 'Spices', selected: false },
  { id: 'cinnamon-sticks', name: 'Cinnamon Sticks', qty: 50, unit: 'g', category: 'Spices', selected: false },
  { id: 'bay-leaves', name: 'Bay Leaves', qty: 1, unit: 'pcs', category: 'Spices', selected: false },

  // Oils & Essentials
  { id: 'cooking-oil', name: 'Cooking Oil', qty: 2, unit: 'L', category: 'Oils & Essentials', selected: true },
  { id: 'ghee', name: 'Ghee', qty: 500, unit: 'ml', category: 'Oils & Essentials', selected: true },
  { id: 'salt', name: 'Salt', qty: 1, unit: 'kg', category: 'Oils & Essentials', selected: true },
  { id: 'sugar', name: 'Sugar', qty: 1, unit: 'kg', category: 'Oils & Essentials', selected: true },
  { id: 'tea-chai', name: 'Tea (Chai)', qty: 250, unit: 'g', category: 'Oils & Essentials', selected: true },
  { id: 'coffee-powder', name: 'Coffee Powder', qty: 200, unit: 'g', category: 'Oils & Essentials', selected: false },

  // Dairy & Fresh
  { id: 'milk', name: 'Milk', qty: 1, unit: 'L', category: 'Dairy & Fresh', selected: true },
  { id: 'curd', name: 'Curd (Yogurt)', qty: 500, unit: 'g', category: 'Dairy & Fresh', selected: true },
  { id: 'butter', name: 'Butter', qty: 200, unit: 'g', category: 'Dairy & Fresh', selected: false },
  { id: 'paneer', name: 'Paneer', qty: 200, unit: 'g', category: 'Dairy & Fresh', selected: false },

  // Vegetables
  { id: 'onions', name: 'Onions', qty: 2, unit: 'kg', category: 'Vegetables', selected: true },
  { id: 'tomatoes', name: 'Tomatoes', qty: 1, unit: 'kg', category: 'Vegetables', selected: true },
  { id: 'potatoes', name: 'Potatoes', qty: 2, unit: 'kg', category: 'Vegetables', selected: true },
  { id: 'green-chillies', name: 'Green Chillies', qty: 100, unit: 'g', category: 'Vegetables', selected: true },
  { id: 'ginger', name: 'Ginger', qty: 100, unit: 'g', category: 'Vegetables', selected: true },
  { id: 'garlic', name: 'Garlic', qty: 100, unit: 'g', category: 'Vegetables', selected: true },
  { id: 'coriander-leaves', name: 'Coriander Leaves', qty: 1, unit: 'bunch', category: 'Vegetables', selected: false },
  { id: 'curry-leaves', name: 'Curry Leaves', qty: 1, unit: 'bunch', category: 'Vegetables', selected: false },
  { id: 'lemons', name: 'Lemons', qty: 4, unit: 'pcs', category: 'Vegetables', selected: false },
];

export type StapleId = (typeof DEFAULT_ONBOARDING_STAPLES)[number]['id'];
