export function formatMoney(cents: number, currency = "PHP"): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function centsToAmount(cents: number): number {
  return cents / 100;
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function cleanPhilippineMobile(mobile: string): string {
  if (!mobile) return "";
  const digits = mobile.replace(/\D/g, "");
  if (digits.startsWith("639") && digits.length === 12) {
    return "0" + digits.slice(2);
  }
  if (digits.startsWith("9") && digits.length === 10) {
    return "0" + digits;
  }
  return digits;
}