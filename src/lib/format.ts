import { Decimal } from "@/lib/money";

const indian = (value: Decimal.Value, maximumFractionDigits: number): string =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
    useGrouping: true,
  }).format(new Decimal(value).toNumber());

export const formatINR = (value: Decimal.Value, dp = 2): string => `₹${indian(value, dp)}`;
export const formatLitres = (value: Decimal.Value, dp = 2): string => indian(value, dp);
export const formatNumber = (value: Decimal.Value, dp = 2): string => indian(value, dp);
