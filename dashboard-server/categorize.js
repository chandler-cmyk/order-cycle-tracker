// Derives brand and category from item name.
// All logic lives here so sync.js and dashboard-server.js stay in sync.

const CATEGORIES = [
  'LunchBoxx Hash Hole',
  'LunchBoxx Preroll',
  'Budder Hole Blunt',
  'Budder Hole Preroll',
  'Mini Preroll',
  'Blunt',
  'Preroll',
  'Gummy',
  'Disposable',
];

function inferBrandCategory(name) {
  const n = name || '';

  // Brand: anything with "LunchBoxx" in the name is LunchBoxx, else NYSW
  const brand = /lunchboxx/i.test(n) ? 'LunchBoxx' : "Not Ya Son's Weed";

  // Category: order matters — most specific patterns first
  let category = '';
  if (/lunchboxx/i.test(n) && /hash.?hole/i.test(n)) {
    category = 'LunchBoxx Hash Hole';
  } else if (/lunchboxx/i.test(n) && /pre.?roll/i.test(n)) {
    category = 'LunchBoxx Preroll';
  } else if (/budder.?hole/i.test(n) && /blunt/i.test(n)) {
    category = 'Budder Hole Blunt';
  } else if (/budder.?hole/i.test(n) && /pre.?roll/i.test(n)) {
    category = 'Budder Hole Preroll';
  } else if (/mini/i.test(n) && /pre.?roll/i.test(n)) {
    category = 'Mini Preroll';
  } else if (/blunt/i.test(n)) {
    category = 'Blunt';
  } else if (/pre.?roll/i.test(n)) {
    category = 'Preroll';
  } else if (/gumm/i.test(n)) {
    category = 'Gummy';
  } else if (/dispos/i.test(n) || /vape/i.test(n)) {
    category = 'Disposable';
  }

  return { brand, category };
}

module.exports = { inferBrandCategory, CATEGORIES };
