import type { AndroidSymbol } from 'expo-symbols';

import type { TaxGroup } from '@/lib/categories';

/** Material icon for each category (shown in a tinted circle next to each payment). */
export const CATEGORY_ICONS: Record<string, AndroidSymbol> = {
  unsorted_in: 'help',
  unsorted_out: 'help',
  salary: 'work',
  freelance_income: 'laptop_mac',
  business_income: 'storefront',
  rent_income: 'home',
  interest: 'savings',
  other_income: 'payments',
  gift_received: 'card_giftcard',
  scholarship: 'school',
  family_support: 'family_restroom',
  loan_received: 'handshake',
  loan_repaid_to_me: 'handshake',
  refund: 'undo',
  sale_personal: 'sell',
  medical: 'local_hospital',
  education: 'school',
  housing_loan: 'house',
  pension: 'health_and_safety',
  donation: 'volunteer_activism',
  solar: 'solar_power',
  business_expense: 'work',
  business_travel: 'flight',
  business_equipment: 'computer',
  tax_payment: 'account_balance',
  transport: 'directions_car',
  food: 'restaurant',
  groceries: 'shopping_cart',
  shopping: 'shopping_bag',
  bills: 'receipt',
  online: 'language',
  entertainment: 'movie',
  fees: 'groups',
  rent_paid: 'home',
  gift_given: 'card_giftcard',
  loan_given: 'handshake',
  loan_repayment: 'handshake',
  cash: 'atm',
  personal_other: 'person',
  transfer_self: 'swap_horiz',
  savings: 'savings',
};

export const GROUP_ICONS: Record<TaxGroup, AndroidSymbol> = {
  unsorted: 'help',
  income: 'payments',
  exempt: 'card_giftcard',
  relief: 'health_and_safety',
  business: 'work',
  taxpaid: 'account_balance',
  personal: 'shopping_bag',
  transfer: 'swap_horiz',
};

export function categoryIcon(id: string): AndroidSymbol {
  return CATEGORY_ICONS[id] ?? 'payments';
}
