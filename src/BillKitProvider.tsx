import type { BillKitElementLogger } from "@billkit-eu/js";
import { createContext, type ReactElement, type ReactNode, useContext, useMemo } from "react";

/**
 * Config shared by every BillKit element on the page. Mirrors
 * `@stripe/react-stripe-js`'s `<Elements>` provider — minus the key:
 * BillKit has no publishable-key concept. The API only mints secret keys
 * (`bk_live_...` / `bk_test_...`), which must never reach a browser;
 * elements authenticate with the ephemeral `client_secret` your server
 * gets from `POST /v1/checkout/sessions` with `ui_mode: "embedded"`, and
 * that secret already names the tenant, the mode, and the session. So the
 * provider carries origin overrides and a logger, nothing credential-shaped.
 */
export interface BillKitContextValue {
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
  iframeOrigin,
  apiBase,
  logger,
  children,
}: BillKitProviderProps): ReactElement {
  const value = useMemo<BillKitContextValue>(
    () => ({ iframeOrigin, apiBase, logger }),
    [iframeOrigin, apiBase, logger],
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
