// The SMS from your screenshots (plus a few non-bank messages that must be ignored).
// Shared by the Node simulator and the emulator injector.
export type FakeSms = { address: string; body: string; date: number };

const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
export const SCREENSHOT_INBOX: FakeSms[] = [];
const row = (address: string, body: string, date: number) => void SCREENSHOT_INBOX.push({ address, body, date });

// SAMPATHTXN
row('SAMPATHTXN', 'LKR 4,000.00 debited from AC **5375 for CEFTLV-01-900380030010-02-6995-03-0000-0 26/09/2026 22:38:38 To Inq Call 0112303050 Get protected -Do not Share OTP', at(2026, 9, 26, 22, 38, 40));
row('SAMPATHTXN', 'LKR 5,000.00 credited to AC **5375 for SI No ROYAL COLLEGE UNION 01/10/2026 06:04:20 To Inq Call 0112303050', at(2026, 10, 1, 6, 4, 22));
row('SAMPATHTXN', 'LKR 2,850.00 debited from AC **5375 for TFR Vishwa -000088326017 03/10/2026 12:54:23 To Inq Call 0112303050', at(2026, 10, 3, 12, 54, 25));
row('SAMPATHTXN', 'LKR 2,525.00 debited from AC **5375 for Adeepa 04/10/2026 15:29:41 To Inq Call 0112303050 Get protected -Do not Share OTP', at(2026, 10, 4, 15, 29, 43));
row('SAMPATHTXN', 'LKR 1,001.00 debited from AC **5375 for CEFTLV-01-900050060010-02-6995-03-0000-0 09/10/2026 07:28:02 To Inq Call 0112303050 Get protected -Do not Share OTP', at(2026, 10, 9, 7, 28, 4));
row('SAMPATHTXN', 'LKR 24,525.00 debited from AC **5375 for 267029193 22/10/2026 09:49:21 To Inq Call 0112303050 Get protected -Do not Share OTP', at(2026, 10, 22, 9, 49, 23));
// COMBANK
row('COMBANK', "OTP for Merchant 'PAYHERE LTC' for LKR 1,050.00 is 757772", at(2026, 10, 22, 9, 34, 50));
row('COMBANK', 'Dear Cardholder, Purchase at PAYHERE LTC Kalutara LK for LKR 1,050.00 on 22/10/26 09:35 AM has been authorised on your debit card ending #7405.', at(2026, 10, 22, 9, 35, 30));
row('COMBANK', 'Dear Cardholder, Purchase at UBER 852 LK for LKR 3,149.45 on 22/10/26 10:32 AM has been authorised on your debit card ending #7405.', at(2026, 10, 22, 10, 32, 20));
row('COMBANK', 'YOUR TRANSACTION AT UBER ON YOUR CARD ENDING WITH 7405 HAS BEEN CANCELLED.', at(2026, 10, 22, 10, 34, 5));
row('COMBANK', 'Dear Cardholder, Purchase at UBER 852 LK for LKR 3,085.32 on 22/10/26 10:35 AM has been authorised on your debit card ending #7405.', at(2026, 10, 22, 10, 35, 15));
row('COMBANK', 'Credit for Rs. 500,000.00 to 8014186987 at 16:55 at DIGITAL BANKING DIVISION', at(2026, 10, 28, 16, 55, 20));
row('COMBANK', 'Credit for Rs. 1,050.00 to 8014186987 at 16:58 at DIGITAL BANKING DIVISION', at(2026, 10, 28, 16, 58, 10));
row('COMBANK', 'ComBank Digital-Transfer to Other Banks LKR 100,000.00 attempted. Please use code 357524 to approve. Do NOT share this number with anyone. PbgqGoDg8jk', at(2026, 10, 28, 17, 2, 0));
row('COMBANK', 'ComBank Digital-Transfer to Other Banks LKR 100,000.00 attempted. Please use code 740118 to approve. Do NOT share this number with anyone. PbgqGoDg8jk', at(2026, 10, 28, 17, 3, 0));
row('COMBANK', 'Dear Cardholder, Purchase at UBER 852 LK for LKR 1,883.81 on 30/10/26 01:31 PM has been authorised on your debit card ending #7405.', at(2026, 10, 30, 13, 31, 30));
row('COMBANK', 'Dear Cardholder, Purchase at A2B Veg Restaurant - OGF COLOMBO-03 LK for LKR 1,716.00 on 30/10/26 03:24 PM has been authorised on your debit card ending #7405.', at(2026, 10, 30, 15, 24, 40));
row('COMBANK', 'Dear Cardholder, Purchase at UBER 852 LK for LKR 316.27 on 30/10/26 03:40 PM has been authorised on your debit card ending #7405.', at(2026, 10, 30, 15, 40, 20));
row('COMBANK', 'Dear Cardholder, Purchase at UBER 852 LK for LKR 316.27 on 30/10/26 03:44 PM has been authorised on your debit card ending #7405.', at(2026, 10, 30, 15, 44, 25));
// PeoplesBank
row('PeoplesBank', "Dear MR GGAS KULARATHNA, Your attempt to log in to People's Pay App failed. For inquiries, Call us on 1961.", at(2026, 5, 18, 21, 48, 0));
row('PeoplesBank', 'Hi Adeepa K, Too many invalid logins were detected & we have blocked your Peoples Pay. Reset your password or Call 1961.', at(2026, 5, 18, 21, 48, 30));
row('PeoplesBank', "Dear MR GGAS KULARATHNA, Your attempt to log in to People's Pay App failed. For inquiries, Call us on 1961.", at(2026, 5, 18, 21, 49, 0));
// Not a bank: must be ignored
row('Dialog', 'Get 50GB for Rs 1,000. Dial #678# now!', at(2026, 10, 29, 10, 0, 0));
row('+94771234567', 'Machan send me Rs 2,000 for lunch', at(2026, 10, 29, 12, 0, 0));

