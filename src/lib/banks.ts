/**
 * Sri Lankan banks Dr. Tax knows. Adding a bank picks its SMS sender IDs and the template
 * used to read its messages.
 *
 * - `template`: which parser reads the SMS. 'sampath' and 'combank' are built from real
 *   messages; 'generic' reads common formats ("LKR 1,000.00 debited …") and marks them
 *   for checking until a bank-specific template is added.
 * - `match`: recognises the bank's sender ID in the inbox (letters only, case-insensitive),
 *   so the right sender IDs are picked up automatically.
 */
export type SmsTemplate = 'sampath' | 'combank' | 'generic';

export type BankInfo = {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Known sender IDs (more are found automatically with `match`). */
  senders: string[];
  match: RegExp;
  template: SmsTemplate;
};

export const BANK_CATALOG: BankInfo[] = [
  { id: 'sampath', name: 'Sampath Bank', short: 'Sampath', color: '#F26F21', senders: ['SAMPATHTXN', 'SAMPATH', 'SampathBank'], match: /SAMPATH/, template: 'sampath' },
  { id: 'combank', name: 'Commercial Bank', short: 'ComBank', color: '#0060A9', senders: ['COMBANK', 'ComBank'], match: /^COMBANK|COMMERCIALBANK/, template: 'combank' },
  { id: 'peoples', name: "People's Bank", short: "People's", color: '#D4A017', senders: ['PeoplesBank', "People's Bank", 'PEOPLESBNK'], match: /PEOPLES/, template: 'generic' },
  { id: 'boc', name: 'Bank of Ceylon', short: 'BOC', color: '#C8A200', senders: ['BOC', 'BOCSMS'], match: /^BOC|BANKOFCEYLON/, template: 'generic' },
  { id: 'hnb', name: 'Hatton National Bank', short: 'HNB', color: '#E4A11B', senders: ['HNB', 'HNBALERTS'], match: /^HNB|HATTONNATIONAL/, template: 'generic' },
  { id: 'nsb', name: 'National Savings Bank', short: 'NSB', color: '#F7941D', senders: ['NSB', 'NSBSMS'], match: /^NSB|NATIONALSAVINGS/, template: 'generic' },
  { id: 'ntb', name: 'Nations Trust Bank', short: 'NTB', color: '#E04E39', senders: ['NTB', 'NationsTrust'], match: /^NTB|NATIONSTRUST/, template: 'generic' },
  { id: 'seylan', name: 'Seylan Bank', short: 'Seylan', color: '#D7282F', senders: ['SEYLAN', 'SeylanBank'], match: /SEYLAN/, template: 'generic' },
  { id: 'dfcc', name: 'DFCC Bank', short: 'DFCC', color: '#ED1C24', senders: ['DFCC', 'DFCCBANK'], match: /^DFCC/, template: 'generic' },
  { id: 'ndb', name: 'NDB Bank', short: 'NDB', color: '#B5121B', senders: ['NDB', 'NDBBANK'], match: /^NDB/, template: 'generic' },
  { id: 'panasia', name: 'Pan Asia Bank', short: 'Pan Asia', color: '#0A4C95', senders: ['PABC', 'PanAsiaBank'], match: /^PABC|PANASIA/, template: 'generic' },
  { id: 'cargills', name: 'Cargills Bank', short: 'Cargills', color: '#E01E2D', senders: ['CargillsBank'], match: /CARGILLSBANK/, template: 'generic' },
  { id: 'amana', name: 'Amana Bank', short: 'Amana', color: '#00A859', senders: ['AmanaBank', 'AMANA'], match: /^AMANA/, template: 'generic' },
  { id: 'union', name: 'Union Bank', short: 'Union', color: '#003E7E', senders: ['UnionBank', 'UBC'], match: /UNIONBANK/, template: 'generic' },
  { id: 'hsbc', name: 'HSBC', short: 'HSBC', color: '#DB0011', senders: ['HSBC'], match: /^HSBC/, template: 'generic' },
  { id: 'scb', name: 'Standard Chartered', short: 'StanChart', color: '#0072AA', senders: ['StanChart', 'SCB'], match: /STANCHART|STANDARDCHARTERED/, template: 'generic' },
];

const CASH: BankInfo = { id: 'cash', name: 'Cash / Other', short: 'Cash', color: '#6B7280', senders: [], match: /$^/, template: 'generic' };
const byId = new Map([...BANK_CATALOG, CASH].map((b) => [b.id, b]));

/** Bank details for an id; unknown ids still display sensibly. */
export function bankInfo(id: string): BankInfo {
  return byId.get(id) ?? { ...CASH, id, name: id, short: id };
}

export function normalizeSender(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Which catalog bank a sender ID belongs to, if any. */
export function detectBank(sender: string): BankInfo | null {
  const key = normalizeSender(sender);
  if (!key || /^\+?\d+$/.test(key)) return null; // phone numbers aren't banks
  return BANK_CATALOG.find((b) => b.match.test(key) || b.senders.some((s) => normalizeSender(s) === key)) ?? null;
}

/** Banks found in the inbox's sender list, most messages first. */
export function detectBanks(senders: { address: string; count: number }[]): { bank: BankInfo; senders: string[]; count: number }[] {
  const found = new Map<string, { bank: BankInfo; senders: string[]; count: number }>();
  for (const s of senders) {
    const bank = detectBank(s.address);
    if (!bank) continue;
    const entry = found.get(bank.id) ?? { bank, senders: [], count: 0 };
    entry.senders.push(s.address);
    entry.count += s.count;
    found.set(bank.id, entry);
  }
  return [...found.values()].sort((a, b) => b.count - a.count);
}
