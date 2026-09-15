import type {
  BaseElementOptions,
  BillKitElementError,
  BillKitElementHandle,
  BillKitElementLogger,
  BillKitThemeTokens,
  ChangeEvent,
  SuccessEvent,
} from "@billkit-eu/js";
import { useEffect, useRef, useState } from "react";
import { useBillKit } from "./BillKitProvider";

/** Callback + presentational props common to the React element components. */
export interface ReactElementProps {
  /** Ephemeral checkout `client_secret` (`<sessionId>_secret_...`). */
  clientSecret: string;
  theme?: BillKitThemeTokens;
  locale?: string;
  /** Load-watchdog timeout (ms) before `onError({code:"load_timeout"})`. */
  loadTimeoutMs?: number;
  /**
   * Overrides the provider's `logger` for this element only. Omitted,
   * the provider's is used; with neither, the element is silent.
   */
  logger?: BillKitElementLogger;
  /** Applied to the container `<div>` the iframe mounts into. */
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
  onChange?: (event: ChangeEvent) => void;
  onSuccess?: (event: SuccessEvent) => void;
  onError?: (error: BillKitElementError) => void;
  onRedirect?: (url: string) => boolean | void;
}

type MountFn = (
  target: HTMLElement,
  options: BaseElementOptions,
) => BillKitElementHandle;

/**
 * SSR-safe mount hook shared by `<CheckoutElement/>` and
 * `<PaymentMethodElement/>`.
 *
 * - Returns `isClient = false` on the server and on the first client
 *   render, so the component renders `null` and hydration matches. The
 *   `useEffect` then flips it true and the real mount happens, with no
 *   hydration mismatch, no `window` access during render.
 * - Callbacks are read through a ref, so a parent passing fresh closures
 *   every render never forces a costly iframe remount. Only the identity
 *   inputs (secret, origins) remount; theme changes hot-update in place.
 */
export function useElement(
  mount: MountFn,
  // `customerId` is not part of the public `ReactElementProps` (only the
  // payment-method element has one), but the hook still has to *see* it:
  // it is a remount input, and leaving it out of the dependency list
  // meant switching customers kept the previous customer's wallet — and
  // its "set default" / "remove" actions — on screen.
  props: ReactElementProps & { customerId?: string },
): {
  isClient: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  handleRef: React.RefObject<BillKitElementHandle | null>;
} {
  const { iframeOrigin, apiBase, logger: providerLogger } = useBillKit();
  const [isClient, setIsClient] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<BillKitElementHandle | null>(null);

  // Latest callbacks, read at event time and decoupled from remount inputs.
  const callbacks = useRef(props);
  callbacks.current = props;

  // Same trick for the logger: resolve it at call time through a ref so
  // an inline `logger={{...}}` (or switching one on mid-session) never
  // tears down and rebuilds the payment iframe. The element always
  // receives this one stable object; it forwards to whatever is current,
  // or drops the line when neither prop nor provider supplies one.
  const activeLogger = useRef<BillKitElementLogger | undefined>(undefined);
  activeLogger.current = props.logger ?? providerLogger;
  const stableLogger = useRef<BillKitElementLogger>({
    debug: (message, context) => activeLogger.current?.debug(message, context),
    warn: (message, context) => activeLogger.current?.warn(message, context),
  }).current;

  useEffect(() => setIsClient(true), []);

  const themeKey = props.theme ? JSON.stringify(props.theme) : "";

  useEffect(() => {
    if (!isClient || containerRef.current === null) return;
    const options: BaseElementOptions = {
      clientSecret: props.clientSecret,
      ...(props.theme ? { theme: props.theme } : {}),
      ...(props.locale ? { locale: props.locale } : {}),
      ...(iframeOrigin ? { iframeOrigin } : {}),
      ...(apiBase ? { apiBase } : {}),
      ...(props.loadTimeoutMs !== undefined ? { loadTimeoutMs: props.loadTimeoutMs } : {}),
      logger: stableLogger,
      onReady: () => callbacks.current.onReady?.(),
      onChange: (e) => callbacks.current.onChange?.(e),
      onSuccess: (e) => callbacks.current.onSuccess?.(e),
      onError: (e) => callbacks.current.onError?.(e),
      onRedirect: (url) => callbacks.current.onRedirect?.(url),
    };
    const handle = mount(containerRef.current, options);
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Remount only on identity inputs (secret / customer / origins);
    // callbacks are read through a ref and theme is hot-applied in the
    // effect below, so neither belongs in this dependency list.
  }, [isClient, props.clientSecret, props.customerId, props.locale, iframeOrigin, apiBase]);

  // Hot-apply theme changes without tearing down the iframe.
  useEffect(() => {
    if (themeKey && handleRef.current && props.theme) {
      handleRef.current.updateTheme(props.theme);
    }
  }, [themeKey]);

  return { isClient, containerRef, handleRef };
}

/**
 * The imperative handle `<CheckoutElement/>` and
 * `<PaymentMethodElement/>` expose through `ref`.
 *
 * Everything else about these components is declarative, but submitting
 * is genuinely an *event*, not a state: a merchant's own pay button
 * lives outside the iframe (that is the point of `onChange.complete`),
 * and it has to be able to say "go" exactly once. A `submit` prop would
 * have to be a toggling boolean, which is the classic React smell for an
 * action modelled as state, so this follows the
 * `useImperativeHandle` path that `<input>`'s `focus()` set.
 *
 * Calls made before the iframe has mounted are no-ops rather than
 * throwing — on the server, and on the first client render, there is no
 * element yet.
 */
export interface ThemeableElementRef {
  /** Push new theme tokens in without remounting. */
  updateTheme(theme: BillKitThemeTokens): void;
}

export interface BillKitElementRef extends ThemeableElementRef {
  /** Submit the form from your own pay button. */
  submit(): void;
}

/** Build the ref `<CheckoutElement/>` exposes. */
export function checkoutElementRef(
  handleRef: React.RefObject<BillKitElementHandle | null>,
): BillKitElementRef {
  return {
    submit: () => handleRef.current?.submit(),
    updateTheme: (theme) => handleRef.current?.updateTheme(theme),
  };
}

/**
 * Build the ref `<PaymentMethodElement/>` exposes.
 *
 * Deliberately no `submit`: the wallet element drops `billkit:submit` on
 * the floor (there is no form to submit — its actions are per-row "set
 * default" / "remove" buttons inside the iframe). Exposing a method that
 * silently does nothing would be worse than not having one.
 */
export function themeableElementRef(
  handleRef: React.RefObject<BillKitElementHandle | null>,
): ThemeableElementRef {
  return {
    updateTheme: (theme) => handleRef.current?.updateTheme(theme),
  };
}
