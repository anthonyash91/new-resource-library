import type { DeepString, Locale } from "./types";
import { en } from "./messages/en";
import { es } from "./messages/es";

export type Messages = DeepString<typeof en>;

const catalogs: Record<Locale, Messages> = { en, es };

function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function getMessages(locale: Locale): Messages {
  return catalogs[locale] ?? catalogs.en;
}

export function createTranslator(locale: Locale) {
  const messages = getMessages(locale);

  function t(key: string, params?: Record<string, string | number>): string {
    const value = resolvePath(messages, key);
    if (typeof value !== "string") return key;

    if (!params) return value;

    return Object.entries(params).reduce(
      (result, [paramKey, paramValue]) =>
        result.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue)),
      value
    );
  }

  return { t, messages, locale };
}

export type Translator = ReturnType<typeof createTranslator>;
