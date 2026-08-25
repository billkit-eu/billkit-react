import type { BillKitElementLogger } from "@billkit-eu/js";
import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * Config shared by every BillKit element on the page. Mirrors
 * `@stripe/react-stripe-js`'s `<Elements>` provider: put your public key
 * (and any origin overrides) here once, then render elements freely
 * beneath it.
 */
export interface BillKitContextValue {
  /**
   * @deprecated Not required, not used, and not something BillKit issues.
   *
   * BillKit has no publishable-key concept; the API only mints secret
   * keys (`sk_live_...` / `sk_test_...`), which must never reach a browser.
   * Elements authenticate with the ephemeral `client_secret` your server
   * gets from `POST /v1/checkout/sessions` with `ui_mode: "embedded"`,
   * and that secret already names the tenant, the mode, and the session.
   *
   * The prop was accepted (and required) in 0.1.0 by analogy with
   * `@stripe/react-stripe-js`, but nothing ever read it, and a tenant
   * following the docs went looking for a `pk_...` value that does not
   * exist. It is now optional and ignored; pass nothing. It will be
   * removed in the next major.
   */
  publishableKey?: string;
  /** Origin the element iframe is served from. Defaults to js.billkit.eu. */
  iframeOrigin?: string;
  /** API origin the iframe calls. Defaults to api.billkit.eu. */
  apiBase?: string;
  /**
   * Where every element beneath this provider sends its lifecycle
   * diagnostics: iframe boot, dropped `postMessage`s, refused
   * redirects, load timeouts. Omitted (the default) means silence: the
   * elements never write to `console` on their own.
   *
   * `console` works as-is. An individual element can override this with
   * its own `logger` prop. The `clientSecret` is never passed to it.
   */
  logger?: BillKitElementLogger;
}

const BillKitContext = createContext<BillKitContextValue | null>(null);

export interface BillKitProviderProps extends BillKitContextValue {
  children: ReactNode;
}

/**
 * Wrap the part of your tree that renders BillKit elements.
 *
 * No credential is needed here; the element authenticates with the
 * ephemeral `client_secret` your server minted for the session:
 *
 * ```tsx
 * <BillKitProvider>
 *   <CheckoutElement clientSecret={clientSecret} onSuccess={done} />
 * </BillKitProvider>
 * ```
 */
export function BillKitProvider({
  publishableKey,
  iframeOrigin,
  apiBase,
  logger,
  children,
}: BillKitProviderProps): JSX.Element {
  const value = useMemo<BillKitContextValue>(
    () => ({ publishableKey, iframeOrigin, apiBase, logger }),
    [publishableKey, iframeOrigin, apiBase, logger],
  );
  return <BillKitContext.Provider value={value}>{children}</BillKitContext.Provider>;
}

/**
 * Read the nearest {@link BillKitProvider}. Throws a clear error when an
 * element is rendered outside a provider, the most common integration
 * mistake.
 */
export function useBillKit(): BillKitContextValue {
  const ctx = useContext(BillKitContext);
  if (ctx === null) {
    throw new Error(
      "BillKit: a <CheckoutElement/> must be rendered inside a <BillKitProvider>.",
    );
  }
  return ctx;
}
