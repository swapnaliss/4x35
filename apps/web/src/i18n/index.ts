import i18next, { type i18n as I18n } from "i18next";
import { useCallback, useSyncExternalStore } from "react";
import en from "./en.json";

/** Dotted paths to every string leaf of the message catalogue, e.g. `status.pass.label`. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof en>;
export type MessageValues = Record<string, string | number>;

export const i18n: I18n = i18next.createInstance();

// Synchronous init: the `en` catalogue is bundled, so the first render already has its strings.
void i18n.init({
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["en"],
  resources: { en: { translation: en } },
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes text nodes itself.
  returnNull: false,
});

/** Translates a typed key outside React (tests, non-component helpers). */
export function t(key: MessageKey, values?: MessageValues): string {
  return i18n.t(key, values ?? {});
}

function subscribe(onChange: () => void): () => void {
  i18n.on("languageChanged", onChange);
  return () => i18n.off("languageChanged", onChange);
}

/** The React binding: re-renders on a language change and returns a typed `t`. */
export function useT(): (key: MessageKey, values?: MessageValues) => string {
  const lng = useSyncExternalStore(
    subscribe,
    () => i18n.language,
    () => i18n.language,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: lng is the re-render trigger
  return useCallback((key: MessageKey, values?: MessageValues) => t(key, values), [lng]);
}
