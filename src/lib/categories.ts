import type { Direction } from './types';

/**
 * Tax groups used in the year-end summary.
 *  income   – money in that is usually taxable (salary, freelance, rent, interest…)
 *  exempt   – money in that is usually NOT taxable (gifts, scholarships, family support, loans…)
 *  relief   – spending that may qualify for a relief / qualifying payment
 *  business – spending that may be deductible against business or freelance income
 *  taxpaid  – tax already paid (APIT, WHT, IRD instalments) – needed for the return
 *  personal – normal living costs (not deductible)
 *  transfer – moving your own money around (left out of all totals)
 *  unsorted – Dr. Tax couldn't tell what it was; you'll be asked
 */
export type TaxGroup = 'income' | 'exempt' | 'relief' | 'business' | 'taxpaid' | 'personal' | 'transfer' | 'unsorted';

export type Category = {
  id: string;
  label: string;
  /** Short label for notification buttons and quick chips. */
  short: string;
  group: TaxGroup;
  /** Which direction this category normally applies to. */
  direction: Direction | 'both';
  hint?: string;
};

// Colours checked for colour-blind separation between neighbouring groups (dataviz validator).
// Every use sits next to the group's name, so identity never relies on colour alone.
export const TAX_GROUPS: Record<TaxGroup, { label: string; color: string; hint: string }> = {
  unsorted: {
    label: 'Not sorted yet',
    color: '#E34948',
    hint: 'Dr. Tax couldn’t tell what these were. Sort them in Review so they land in the right place.',
  },
  income: {
    label: 'Taxable income',
    color: '#1BAF7A',
    hint: 'Money received that usually has to be declared on your return.',
  },
  exempt: {
    label: 'Other money in (usually not taxable)',
    color: '#2A78D6',
    hint: 'Gifts, scholarships, family support, loans and refunds. Kept separate so they aren’t mistaken for income. Keep proof (e.g. a scholarship letter).',
  },
  relief: {
    label: 'Possible reliefs',
    color: '#E87BA4',
    hint: 'Payments that may reduce your tax. Keep receipts and confirm with the IRD or a tax advisor.',
  },
  business: {
    label: 'Business / freelance expenses',
    color: '#EDA100',
    hint: 'Costs of earning business or freelance income. May be deductible against that income.',
  },
  taxpaid: {
    label: 'Tax already paid',
    color: '#6250D6',
    hint: 'APIT, withholding tax and IRD instalments. Claim these as credits on your return.',
  },
  personal: {
    label: 'Personal spending',
    color: '#EB6834',
    hint: 'Day-to-day spending. Normally not deductible.',
  },
  transfer: {
    label: 'Own transfers & savings',
    color: '#8A8F98',
    hint: 'Moving money between your own accounts. Not counted as income or spending.',
  },
};

export const TAX_GROUP_ORDER: TaxGroup[] = ['unsorted', 'income', 'exempt', 'relief', 'business', 'taxpaid', 'personal', 'transfer'];

/** Groups where a note (who / what for) makes the tax record much stronger. */
export const GROUPS_NEEDING_DETAILS: TaxGroup[] = ['income', 'exempt', 'relief', 'business', 'taxpaid'];

export const CATEGORIES: Category[] = [
  // Not sorted
  { id: 'unsorted_in', label: 'Money in — not sorted', short: 'Not sorted', group: 'unsorted', direction: 'credit' },
  { id: 'unsorted_out', label: 'Money out — not sorted', short: 'Not sorted', group: 'unsorted', direction: 'debit' },

  // Taxable income
  { id: 'salary', label: 'Salary / employment', short: 'Salary', group: 'income', direction: 'credit' },
  { id: 'freelance_income', label: 'Freelance income', short: 'Freelance', group: 'income', direction: 'credit', hint: 'Add the client and the work in the note.' },
  { id: 'business_income', label: 'Business income', short: 'Business', group: 'income', direction: 'credit' },
  { id: 'rent_income', label: 'Rent received', short: 'Rent', group: 'income', direction: 'credit' },
  { id: 'interest', label: 'Interest / dividends', short: 'Interest', group: 'income', direction: 'credit' },
  { id: 'other_income', label: 'Other taxable income', short: 'Other income', group: 'income', direction: 'credit' },

  // Money in, usually not taxable
  { id: 'gift_received', label: 'Personal gift received', short: 'Gift', group: 'exempt', direction: 'credit', hint: 'Note who gave it and why (birthday, wedding…).' },
  { id: 'scholarship', label: 'Scholarship / bursary', short: 'Scholarship', group: 'exempt', direction: 'credit', hint: 'Note the scholarship name. Keep the award letter.' },
  { id: 'family_support', label: 'Family support / allowance', short: 'Family', group: 'exempt', direction: 'credit' },
  { id: 'loan_received', label: 'Loan received', short: 'Loan', group: 'exempt', direction: 'credit' },
  { id: 'loan_repaid_to_me', label: 'Loan repaid to me', short: 'Repaid', group: 'exempt', direction: 'credit' },
  { id: 'refund', label: 'Refund / reimbursement', short: 'Refund', group: 'exempt', direction: 'credit' },
  { id: 'sale_personal', label: 'Sold personal item', short: 'Sold item', group: 'exempt', direction: 'credit' },

  // Possible reliefs / qualifying payments
  { id: 'medical', label: 'Medical / health', short: 'Medical', group: 'relief', direction: 'debit' },
  { id: 'education', label: 'Education', short: 'Education', group: 'relief', direction: 'debit' },
  { id: 'housing_loan', label: 'Housing loan interest', short: 'Housing loan', group: 'relief', direction: 'debit' },
  { id: 'pension', label: 'Pension / insurance', short: 'Insurance', group: 'relief', direction: 'debit' },
  { id: 'donation', label: 'Donations / charity', short: 'Donation', group: 'relief', direction: 'debit' },
  { id: 'solar', label: 'Solar panels', short: 'Solar', group: 'relief', direction: 'debit' },

  // Business / freelance
  { id: 'business_expense', label: 'Business / freelance expense', short: 'Business', group: 'business', direction: 'debit' },
  { id: 'business_travel', label: 'Business travel', short: 'Work travel', group: 'business', direction: 'debit' },
  { id: 'business_equipment', label: 'Equipment & software for work', short: 'Equipment', group: 'business', direction: 'debit' },

  // Tax paid
  { id: 'tax_payment', label: 'Tax payment (IRD / APIT / WHT)', short: 'Tax', group: 'taxpaid', direction: 'debit' },

  // Personal
  { id: 'transport', label: 'Transport (Uber, fuel)', short: 'Transport', group: 'personal', direction: 'debit' },
  { id: 'food', label: 'Food & dining', short: 'Food', group: 'personal', direction: 'debit' },
  { id: 'groceries', label: 'Groceries', short: 'Groceries', group: 'personal', direction: 'debit' },
  { id: 'shopping', label: 'Shopping', short: 'Shopping', group: 'personal', direction: 'debit' },
  { id: 'bills', label: 'Bills & utilities', short: 'Bills', group: 'personal', direction: 'debit' },
  { id: 'online', label: 'Online payments', short: 'Online', group: 'personal', direction: 'debit' },
  { id: 'entertainment', label: 'Entertainment', short: 'Fun', group: 'personal', direction: 'debit' },
  { id: 'fees', label: 'Clubs, fees & memberships', short: 'Fees', group: 'personal', direction: 'both' },
  { id: 'rent_paid', label: 'Rent paid', short: 'Rent', group: 'personal', direction: 'debit' },
  { id: 'gift_given', label: 'Gift given', short: 'Gift', group: 'personal', direction: 'debit' },
  { id: 'loan_given', label: 'Loan given to someone', short: 'Lent', group: 'personal', direction: 'debit' },
  { id: 'loan_repayment', label: 'Loan repayment', short: 'Loan', group: 'personal', direction: 'debit' },
  { id: 'cash', label: 'Cash withdrawal', short: 'Cash', group: 'personal', direction: 'debit' },
  { id: 'personal_other', label: 'Other personal spending', short: 'Personal', group: 'personal', direction: 'debit' },

  // Own money
  { id: 'transfer_self', label: 'Own-account transfer', short: 'Own account', group: 'transfer', direction: 'both' },
  { id: 'savings', label: 'Savings / fixed deposit', short: 'Savings', group: 'transfer', direction: 'both' },
];

/** Categories that mean "Dr. Tax doesn't know, ask the user". */
export const NEEDS_CHECK_CATEGORIES = ['unsorted_in', 'unsorted_out'];

export function unsortedFor(direction: Direction): string {
  return direction === 'credit' ? 'unsorted_in' : 'unsorted_out';
}

/** The most likely answers, shown first when asking what a payment was for. */
export const QUICK_PICKS: Record<Direction, string[]> = {
  credit: ['freelance_income', 'salary', 'gift_received', 'scholarship', 'family_support', 'refund', 'loan_repaid_to_me', 'transfer_self', 'business_income', 'other_income'],
  debit: ['personal_other', 'business_expense', 'gift_given', 'medical', 'education', 'food', 'transport', 'shopping', 'bills', 'loan_given', 'donation', 'transfer_self'],
};

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return byId.get(id) ?? byId.get('unsorted_out')!;
}

export function categoriesFor(direction: Direction): Category[] {
  return CATEGORIES.filter((c) => c.direction === 'both' || c.direction === direction);
}

type BuiltInRule = { pattern: RegExp; category: string; direction?: Direction };

/** Default keyword rules for common Sri Lankan merchants. Your own rules win over these. */
const BUILT_IN_RULES: BuiltInRule[] = [
  { pattern: /\b(UBER|PICKME|KANGAROO|CEYPETCO|LIOC|LANKA IOC|FUEL|FILLING STATION|SINOPEC)\b/i, category: 'transport', direction: 'debit' },
  { pattern: /\b(RESTAURANT|CAFE|KFC|PIZZA|MCDONALDS?|BURGER|BAKERY|BAKERS|FOOD|EATS|A2B|DOMINOS|STARBUCKS|JAVA LOUNGE)\b/i, category: 'food', direction: 'debit' },
  { pattern: /\b(KEELLS|CARGILLS|ARPICO|GLOMARK|SPAR|SATHOSA|FOOD CITY)\b/i, category: 'groceries', direction: 'debit' },
  { pattern: /\b(PHARMACY|PHARMACIES|HOSPITALS?|MEDICAL|HEALTHGUARD|NAWALOKA|ASIRI|DURDANS|NINEWELLS|DENTAL|CLINIC|LABORATORY)\b/i, category: 'medical', direction: 'debit' },
  { pattern: /\b(SCHOOL|UNIVERSITY|TUITION|INSTITUTE|ACADEMY|COURSE|EXAM|UDEMY|COURSERA)\b/i, category: 'education', direction: 'debit' },
  { pattern: /\b(DIALOG|MOBITEL|SLT|HUTCH|AIRTEL|CEB|LECO|NWSDB|WATER BOARD|ELECTRICITY|BROADBAND|NETFLIX|SPOTIFY)\b/i, category: 'bills', direction: 'debit' },
  { pattern: /\b(INSURANCE|ASSURANCE|AIA|CEYLINCO|ALLIANZ)\b/i, category: 'pension', direction: 'debit' },
  { pattern: /\b(DARAZ|AMAZON|ALIEXPRESS|ODEL|NOLIMIT|FASHION BUG|ABANS|SINGER|SOFTLOGIC)\b/i, category: 'shopping', direction: 'debit' },
  { pattern: /\b(PAYHERE|PAYPAL|STRIPE|GOOGLE|FRIMI|GENIE)\b/i, category: 'online', direction: 'debit' },
  { pattern: /\b(ATM|CASH WITHDRAWAL|CWD)\b/i, category: 'cash', direction: 'debit' },
  { pattern: /\b(TEMPLE|CHURCH|KOVIL|MOSQUE|DONATION|CHARITY|FOUNDATION)\b/i, category: 'donation', direction: 'debit' },
  { pattern: /\b(INLAND REVENUE|IRD|APIT|WHT|TAX PAYMENT)\b/i, category: 'tax_payment', direction: 'debit' },
  { pattern: /\b(SCHOLARSHIP|BURSARY|MAHAPOLA|GRANT)\b/i, category: 'scholarship', direction: 'credit' },
  { pattern: /\b(UPWORK|FIVERR|FREELANCER|PAYONEER|TOPTAL|DEEL)\b/i, category: 'freelance_income', direction: 'credit' },
  { pattern: /\b(SALARY|SAL CR|PAYROLL)\b/i, category: 'salary', direction: 'credit' },
  { pattern: /\b(INTEREST|INT CR|DIVIDEND)\b/i, category: 'interest', direction: 'credit' },
  { pattern: /\b(REFUND|REVERSAL|REVERSED|CASHBACK)\b/i, category: 'refund', direction: 'credit' },
  { pattern: /\b(UNION|CLUB|ASSOCIATION|SOCIETY|SUBSCRIPTION)\b/i, category: 'fees', direction: 'debit' },
];

export type CategorizeInput = { merchant: string; description: string; direction: Direction; channel: string };
export type UserRule = { pattern: string; category: string };

/**
 * Picks a category. Order: your own rules → your own names (self-transfers) → built-in rules.
 * Anything else is "not sorted" so you get asked, instead of Dr. Tax guessing.
 */
export function categorize(input: CategorizeInput, userRules: UserRule[], ownNames: string[]): string {
  const text = `${input.merchant} ${input.description}`.toUpperCase();

  for (const rule of userRules) {
    const p = rule.pattern.trim().toUpperCase();
    const cat = byId.get(rule.category);
    if (!p || !cat) continue;
    if (cat.direction !== 'both' && cat.direction !== input.direction) continue;
    if (text.includes(p)) return rule.category;
  }

  for (const name of ownNames) {
    const n = name.trim().toUpperCase();
    if (n && containsWord(text, n)) return 'transfer_self';
  }

  for (const rule of BUILT_IN_RULES) {
    if (rule.direction && rule.direction !== input.direction) continue;
    if (rule.pattern.test(text)) return rule.category;
  }

  return unsortedFor(input.direction);
}

function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(haystack);
}
