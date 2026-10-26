/**
 * Formats an Algerian phone number into international WhatsApp standard (+213...).
 * Example: 0784669514 -> +213784669514
 * 
 * Rules:
 * - Strips any spaces, dashes, or non-numeric formatting.
 * - Removes leading zero (0) and prepends +213.
 * - If already starts with +213, normalizes it.
 * - If starts with 00213 or 213, normalizes to +213.
 */
export function formatAlgerianPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';

  // Remove spaces, dashes, brackets, etc. Keep digits and '+'
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  // 1. If starts with +213
  if (cleaned.startsWith('+213')) {
    // In case someone wrote +21307... strip the redundant zero after country code
    const rest = cleaned.substring(4).replace(/^0+/, '');
    return `+213${rest}`;
  }

  // 2. If starts with 00213
  if (cleaned.startsWith('00213')) {
    const rest = cleaned.substring(5).replace(/^0+/, '');
    return `+213${rest}`;
  }

  // 3. If starts with 213 (without +)
  if (cleaned.startsWith('213') && cleaned.length >= 11) {
    const rest = cleaned.substring(3).replace(/^0+/, '');
    return `+213${rest}`;
  }

  // 4. Standard Algerian local format starting with 0 (e.g., 0784669514, 05..., 06..., 021...)
  if (cleaned.startsWith('0')) {
    const rest = cleaned.replace(/^0+/, '');
    return `+213${rest}`;
  }

  // 5. Entered without leading 0 (e.g., 784669514, 550..., 661...)
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length >= 8 && digitsOnly.length <= 10) {
    return `+213${digitsOnly}`;
  }

  // Fallback
  return cleaned.startsWith('+') ? cleaned : `+213${digitsOnly}`;
}

/**
 * Validates whether an Algerian phone number is valid (e.g. 05/06/07/02 followed by 8 digits).
 */
export function isValidAlgerianPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  // If in international format (213 + 9 digits = 12 digits)
  if (digits.startsWith('213') && digits.length === 12) {
    return true;
  }
  // If in local format (0 + 9 digits = 10 digits)
  if (digits.startsWith('0') && digits.length === 10) {
    return true;
  }
  // If entered without leading 0 (9 digits)
  if (digits.length === 9) {
    return true;
  }
  return digits.length >= 9 && digits.length <= 15;
}

/**
 * Clean digits-only for WhatsApp link generation (e.g. 213784669514)
 */
export function getWhatsAppNumber(phone: string): string {
  const formatted = formatAlgerianPhone(phone);
  return formatted.replace(/[^0-9]/g, '');
}
