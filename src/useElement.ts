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
  props: ReactElementProps,
): { isClient: boolean; containerRef: React.RefObject<HTMLDivElement> } {
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
    // Remount only on identity inputs (secret / origins); callbacks are
    // read through a ref and theme is hot-applied in the effect below, so
    // neither belongs in this dependency list.
  }, [isClient, props.clientSecret, props.locale, iframeOrigin, apiBase]);

  // Hot-apply theme changes without tearing down the iframe.
  useEffect(() => {
    if (themeKey && handleRef.current && props.theme) {
      handleRef.current.updateTheme(props.theme);
    }
  }, [themeKey]);

  return { isClient, containerRef };
}
