import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const decimal = (value: Decimal.Value): Decimal => new Decimal(value);
export const round2 = (value: Decimal.Value): Decimal => decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const round4 = (value: Decimal.Value): Decimal => decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
