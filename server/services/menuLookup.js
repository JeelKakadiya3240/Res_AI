const Fuse = require('fuse.js');
const supabase = require('../config/supabase');

// Synonym/alias table for common typos and variations
const MENU_SYNONYMS = {
  'samosa': ['samosa', 'simosa', 'samosaa', 'samos', 'veg samosa', 'vegetable samosa', 'veg. samosa'],
  'biryani': ['biryani', 'biriyani', 'biriani', 'biryani rice'],
  'butter chicken': ['butter chicken', 'butterchicken', 'butter chicken curry'],
  'paneer tikka': ['paneer tikka', 'paneer-tikka', 'paneer tikka masala', 'paneer tika'],
  'dal makhani': ['dal makhani', 'dal makani', 'dal makhni', 'black dal'],
  'naan': ['naan', 'nan', 'naan bread', 'naan breads'],
  'lassi': ['lassi', 'lasi', 'mango lassi', 'yogurt drink'],
  'tikka masala': ['tikka masala', 'tika masala', 'tikka masla'],
  'palak paneer': ['palak paneer', 'palak panner', 'spinach paneer'],
  'tandoori chicken': ['tandoori chicken', 'tandoor chicken', 'tandori chicken'],
  'gulab jamun': ['gulab jamun', 'gulab jamoon', 'gulabjamun', 'jamun'],
  'vindaloo': ['vindaloo', 'vindalou', 'vindaloo curry']
};

// Confidence thresholds
const HIGH_THRESHOLD = 0.85;  // Auto-accept
const AMBIGUOUS_THRESHOLD = 0.6;  // Ask for clarification
const LOW_THRESHOLD = 0.6;  // Show menu or ask

// Cache menu items
let menuItemsCache = null;
let menuItemsCacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize text: lowercase, strip punctuation, unicode normalize
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with space
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Get menu items with caching
 */
async function getMenuItems() {
  const now = Date.now();
  
  if (menuItemsCache && menuItemsCacheTime && (now - menuItemsCacheTime) < CACHE_TTL) {
    return menuItemsCache;
  }

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, description, price, category, is_available')
    .eq('is_available', true);

  if (error) {
    console.error('Error fetching menu items:', error);
    return menuItemsCache || [];
  }

  menuItemsCache = data || [];
  menuItemsCacheTime = now;
  return menuItemsCache;
}

/**
 * Find synonyms for a given text
 */
function findSynonyms(normalizedText) {
  const synonyms = [];
  
  for (const [canonical, variants] of Object.entries(MENU_SYNONYMS)) {
    if (variants.some(v => normalizedText.includes(v) || v.includes(normalizedText))) {
      synonyms.push(canonical);
    }
  }
  
  return synonyms;
}

/**
 * Lookup menu item with fuzzy matching and confidence scores
 * Returns: { menu_id, menu_name, match_confidence, candidates }
 */
async function lookupMenuItem(rawText, quantity = 1) {
  const normalized = normalizeText(rawText);
  const menuItems = await getMenuItems();
  
  if (!menuItems || menuItems.length === 0) {
    return {
      success: false,
      error: 'Menu not available',
      candidates: []
    };
  }

  // Log the lookup attempt
  console.log(`🔍 Menu lookup: raw="${rawText}" → normalized="${normalized}"`);

  // Configure Fuse.js for fuzzy matching
  const fuse = new Fuse(menuItems, {
    keys: ['name'],
    threshold: 0.4, // Lower threshold = more strict (0.0 = exact match, 1.0 = match anything)
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
    findAllMatches: false
  });

  // Search with normalized text
  const results = fuse.search(normalized);
  
  // Also check synonyms
  const synonyms = findSynonyms(normalized);
  const synonymResults = [];
  
  for (const synonym of synonyms) {
    const synonymSearch = fuse.search(synonym);
    synonymResults.push(...synonymSearch);
  }

  // Combine and deduplicate results
  const allResults = [...results, ...synonymResults];
  const uniqueResults = [];
  const seenIds = new Set();
  
  for (const result of allResults) {
    if (!seenIds.has(result.item.id)) {
      seenIds.add(result.item.id);
      uniqueResults.push(result);
    }
  }

  // Sort by score (lower is better in Fuse.js, so we convert to confidence)
  uniqueResults.sort((a, b) => a.score - b.score);

  // Convert Fuse.js scores to confidence (0-1 scale, higher is better)
  // Fuse.js score: 0 = perfect match, 1 = no match
  // Confidence: 1 = perfect match, 0 = no match
  const candidates = uniqueResults.slice(0, 5).map(result => ({
    menu_id: result.item.id,
    menu_name: result.item.name,
    price: result.item.price,
    category: result.item.category,
    score: result.score,
    confidence: 1 - result.score, // Convert to confidence (higher is better)
    raw_text: rawText,
    normalized_text: normalized
  }));

  // Log candidates
  console.log(`📋 Found ${candidates.length} candidates:`, 
    candidates.map(c => `${c.menu_name} (conf: ${c.confidence.toFixed(2)})`).join(', '));

  if (candidates.length === 0) {
    return {
      success: false,
      error: 'No matching items found',
      candidates: [],
      raw_text: rawText,
      normalized_text: normalized
    };
  }

  const topCandidate = candidates[0];

  // Decision logic based on confidence
  if (topCandidate.confidence >= HIGH_THRESHOLD) {
    // Auto-accept
    console.log(`✅ Auto-matched: "${rawText}" → "${topCandidate.menu_name}" (confidence: ${topCandidate.confidence.toFixed(2)})`);
    return {
      success: true,
      menu_id: topCandidate.menu_id,
      menu_name: topCandidate.menu_name,
      price: topCandidate.price,
      match_confidence: topCandidate.confidence,
      candidates: candidates,
      raw_text: rawText,
      normalized_text: normalized,
      action: 'auto_match'
    };
  } else if (topCandidate.confidence >= AMBIGUOUS_THRESHOLD) {
    // Ask for clarification
    console.log(`❓ Ambiguous match: "${rawText}" → top: "${topCandidate.menu_name}" (confidence: ${topCandidate.confidence.toFixed(2)})`);
    return {
      success: false,
      error: 'ambiguous',
      menu_id: topCandidate.menu_id,
      menu_name: topCandidate.menu_name,
      match_confidence: topCandidate.confidence,
      candidates: candidates.slice(0, 3), // Top 3 for disambiguation
      raw_text: rawText,
      normalized_text: normalized,
      action: 'ask_clarification'
    };
  } else {
    // Low confidence - show menu or ask
    console.log(`⚠️ Low confidence match: "${rawText}" → top: "${topCandidate.menu_name}" (confidence: ${topCandidate.confidence.toFixed(2)})`);
    return {
      success: false,
      error: 'low_confidence',
      match_confidence: topCandidate.confidence,
      candidates: candidates.slice(0, 5), // Top 5 for menu display
      raw_text: rawText,
      normalized_text: normalized,
      action: 'show_menu'
    };
  }
}

/**
 * Validate menu item by ID (for final order placement)
 */
async function validateMenuItemById(menuId) {
  const menuItems = await getMenuItems();
  const item = menuItems.find(m => m.id === menuId && m.is_available);
  
  if (!item) {
    return {
      valid: false,
      error: 'Item not found or not available'
    };
  }
  
  return {
    valid: true,
    menu_id: item.id,
    menu_name: item.name,
    price: item.price
  };
}

module.exports = {
  lookupMenuItem,
  validateMenuItemById,
  normalizeText,
  getMenuItems,
  HIGH_THRESHOLD,
  AMBIGUOUS_THRESHOLD,
  LOW_THRESHOLD
};
