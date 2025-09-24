// ---------- Types ----------
type UnitKey = "minute" | "hour" | "day" | "month" | "year";
type Style = "short" | "long";
type MinuteRounding = "ceil" | "floor" | "nearest";
type InputUnit = "ms" | "sec";

type FormatOptions = {
    // input
    inputUnit?: InputUnit; // default "ms" (use "sec" to pass seconds)

    // formatting
    maxUnits?: 1 | 2; // default 2
    minOneMinute?: boolean; // default true (anything <60s => "1 min")
    style?: Style; // default "short"
    delimiter?: string; // default " "
    allowZero?: boolean; // default false

    // calendar math for months/years
    calendar?: {
        daysPerMonth?: number; // default 30 (>=1, integer)
        monthsPerYear?: number; // default 12 (>=1, integer)
    };

    /**
     * For durations < 1 hour:
     *  - true => show minutes only (no seconds)
     *  - false => include seconds (e.g., "40 sec", "1 min 19 sec")
     * Default: true
     */
    roundSubHourToMinutes?: boolean;

    /**
     * Rounding method for minutes when roundSubHourToMinutes=true.
     *  - "ceil" (round high), "floor" (round low), "nearest"
     * Default: "ceil"
     */
    minuteRounding?: MinuteRounding;
};

type Parts = {
    value: number;
    unit: UnitKey | "second";
};

// ---------- Helpers ----------
const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

function label(unit: UnitKey | "second", value: number, style: Style): string {
    if (style === "long") {
        switch (unit) {
            case "second":
                return plural(value, "second", "seconds");
            case "minute":
                return plural(value, "minute", "minutes");
            case "hour":
                return plural(value, "hour", "hours");
            case "day":
                return plural(value, "day", "days");
            case "month":
                return plural(value, "month", "months");
            case "year":
                return plural(value, "year", "years");
        }
    }
    // short
    switch (unit) {
        case "second":
            return "sec"; // same label for 1 & many
        case "minute":
            return value === 1 ? "min" : "mins";
        case "hour":
            return value === 1 ? "hr" : "hrs";
        case "day":
            return value === 1 ? "day" : "days";
        case "month":
            return value === 1 ? "month" : "months";
        case "year":
            return value === 1 ? "year" : "years";
    }
}

// Defensive coercers
function toInt(n: unknown, fallback: number): number {
    const x = typeof n === "number" ? n : Number(n);
    return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

function clampMinInt(n: unknown, min: number, fallback: number): number {
    const v = toInt(n, fallback);
    return Math.max(min, v);
}

function toBool(v: unknown, fallback: boolean): boolean {
    return typeof v === "boolean" ? v : fallback;
}

function toStyle(v: unknown, fallback: Style): Style {
    return v === "long" || v === "short" ? v : fallback;
}

function toRounding(v: unknown, fallback: MinuteRounding): MinuteRounding {
    return v === "floor" || v === "nearest" || v === "ceil" ? v : fallback;
}

function toStringOr(v: unknown, fallback: string): string {
    return typeof v === "string" ? v : fallback;
}

function toInputUnit(v: unknown, fallback: InputUnit): InputUnit {
    return v === "sec" || v === "ms" ? v : fallback;
}

// Normalize options
type NormalizedOptions = {
    inputUnit: InputUnit;
    maxUnits: 1 | 2;
    minOneMinute: boolean;
    style: Style;
    delimiter: string;
    allowZero: boolean;
    calDaysPerMonth: number;
    calMonthsPerYear: number;
    roundSubHourToMinutes: boolean;
    minuteRounding: MinuteRounding;
};

function normalizeOptions(opts?: FormatOptions): NormalizedOptions {
    const o = opts ?? {};
    const inputUnit = toInputUnit(o.inputUnit, "ms");

    const style = toStyle(o.style, "short");
    const maxUnits: 1 | 2 = o.maxUnits === 1 ? 1 : 2;

    const delimiter = toStringOr(o.delimiter, " ");
    const minOneMinute = toBool(o.minOneMinute, true);
    const allowZero = toBool(o.allowZero, false);
    const roundSubHourToMinutes = toBool(o.roundSubHourToMinutes, true);
    const minuteRounding = toRounding(o.minuteRounding, "ceil");

    const cal = o.calendar ?? {};
    const calDaysPerMonth = clampMinInt(cal.daysPerMonth, 1, 30);
    const calMonthsPerYear = clampMinInt(cal.monthsPerYear, 1, 12);

    return {
        inputUnit,
        maxUnits,
        minOneMinute,
        style,
        delimiter,
        allowZero,
        calDaysPerMonth,
        calMonthsPerYear,
        roundSubHourToMinutes,
        minuteRounding,
    };
}

// ---------- Single API (default input is milliseconds) ----------
function formatCompactDuration(
    input: number,
    opts: FormatOptions = {}
): string {
    const {
        inputUnit,
        maxUnits,
        minOneMinute,
        style,
        delimiter,
        allowZero,
        calDaysPerMonth,
        calMonthsPerYear,
        roundSubHourToMinutes,
        minuteRounding,
    } = normalizeOptions(opts);

    // sanitize input and convert to whole seconds
    const raw = Math.max(0, toInt(input, 0));
    const seconds = inputUnit === "ms" ? Math.floor(raw / 1000) : raw;

    const MIN = 60;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    const MONTH = calDaysPerMonth * DAY;
    const YEAR = calMonthsPerYear * MONTH;

    const SECS = {
        minute: MIN,
        hour: HOUR,
        day: DAY,
        month: MONTH,
        year: YEAR,
    } as const;
    const ORDER: UnitKey[] = ["minute", "hour", "day", "month", "year"];

    // Zero handling
    if (seconds === 0) {
        if (allowZero) return "";
        return minOneMinute
            ? `1${delimiter}${label("minute", 1, style)}`
            : `0${delimiter}${label("second", 0, style)}`;
    }

    // Sub-minute
    if (seconds < MIN) {
        if (minOneMinute && roundSubHourToMinutes) {
            return `1${delimiter}${label("minute", 1, style)}`;
        }
        return `${seconds}${delimiter}${label("second", seconds, style)}`;
    }

    // < 1 hour
    if (seconds < HOUR) {
        if (roundSubHourToMinutes) {
            const minutesFloat = seconds / MIN;
            let mins: number;
            switch (minuteRounding) {
                case "floor":
                    mins = Math.floor(minutesFloat);
                    break;
                case "nearest":
                    mins = Math.round(minutesFloat);
                    break;
                default:
                    mins = Math.ceil(minutesFloat); // "ceil"
            }
            const safe = Math.max(mins, 1); // never 0 mins
            return `${safe}${delimiter}${label("minute", safe, style)}`;
        } else {
            const mins = Math.floor(seconds / MIN);
            const secs = seconds % MIN;
            if (mins === 0) {
                return `${secs}${delimiter}${label("second", secs, style)}`;
            }
            if (maxUnits === 1) {
                return `${mins}${delimiter}${label("minute", mins, style)}`;
            }
            return `${mins}${delimiter}${label(
                "minute",
                mins,
                style
            )}${delimiter}${secs}${delimiter}${label("second", secs, style)}`;
        }
    }

    // >= 1 hour: two-unit format with carry
    let primary: UnitKey = "hour";
    for (let i = ORDER.length - 1; i >= 0; i--) {
        const u = ORDER[i];
        if (u === "minute") continue;
        if (seconds >= SECS[u]) {
            primary = u;
            break;
        }
    }

    const primSecs = SECS[primary];
    let primVal = Math.floor(seconds / primSecs);
    let remainder = seconds - primVal * primSecs;

    // next smaller unit (maybe "minute")
    const nextIndex = ORDER.indexOf(primary) - 1;
    const secondary: UnitKey = ORDER[Math.max(0, nextIndex)];

    // round UP remainder into secondary unit
    let secVal = Math.ceil(remainder / SECS[secondary]);

    const BASES: Record<UnitKey, number> = {
        minute: 60,
        hour: 24,
        day: calDaysPerMonth,
        month: calMonthsPerYear,
        year: Number.POSITIVE_INFINITY,
    };

    if (secVal >= BASES[secondary]) {
        primVal += 1;
        secVal = 0;
    }

    const parts: Parts[] = [{value: primVal, unit: primary}];
    if (maxUnits > 1 && secVal > 0)
        parts.push({value: secVal, unit: secondary});

    return parts
        .map((p) => `${p.value}${delimiter}${label(p.unit, p.value, style)}`)
        .join(delimiter);
}
