import type {
  BaseElementOptions,
  BillKitElementError,
  BillKitElementHandle,
  BillKitElementLogger,
  BillKitThemeTokens,
  ChangeEvent,
  ProcessingEvent,
  SuccessEvent,
} from "@billkit-eu/js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBillKit } from "./BillKitProvider";

/**
 * Callback + presentational props common to the React element components,
 * generic over what `onSuccess` receives: the checkout element reports a
 * `sessionId`, the one-shot element a `oneShotPaymentId`.
 */
export interface ElementPropsBase<S> {
  /**
   * Ephemeral checkout `client_secret` (`<sessionId>_secret_...`). An empty
   * (or blank) string renders nothing and mounts nothing, so the element can
   * be rendered while the secret is still being fetched; it mounts when a
   * real one arrives.
   */
  clientSecret: string;
  theme?: BillKitThemeTokens;
  locale?: string;
  /**
   * Accessible name for the element's `<iframe>`. Defaults per element
   * ("BillKit secure checkout", "BillKit saved payment methods", "BillKit
   * secure payment"), in English: this one string lives on your page, so
   * `locale` cannot reach it. Set it when your page is not in English.
   */
  title?: string;
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
  /**
   * A payment started, or stopped being in flight. Hold whatever would tear
   * the form down mid-payment (a modal's close) while `processing` is true.
   * See `onProcessing` in `@billkit-eu/js`.
   */
  onProcessing?: (event: ProcessingEvent) => void;
  /** Escape was pressed inside the element, which your page cannot hear on its own. */
  onEscape?: () => void;
  onSuccess?: (event: S) => void;
  onError?: (error: BillKitElementError) => void;
  onRedirect?: (url: string) => boolean | void;
}

/** Props of the checkout and payment-method elements. */
export type ReactElementProps = ElementPropsBase<SuccessEvent>;

/** The loader options a mount function takes, with `onSuccess` typed by `S`. */
export type ElementMountOptions<S> = Omit<BaseElementOptions, "onSuccess"> & {
  onSuccess?: (event: S) => void;
};

type MountFn<S> = (target: HTMLElement, options: ElementMountOptions<S>) => BillKitElementHandle;

/**
 * `useLayoutEffect` in a browser, `useEffect` on the server, where a
 * layout effect never runs and React 18 warns about one on every render.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The container ref, in whichever `RefObject` shape the installed React types use. */
function useContainerRef() {
  return useRef<HTMLDivElement>(null);
}

/**
 * SSR-safe mount hook shared by `<CheckoutElement/>` and
 * `<PaymentMethodElement/>`.
 *
 * - Returns `shouldRender = false` on the server and on the first client
 *   render, so the component renders `null` and hydration matches. The
 *   `useEffect` then flips it true and the real mount happens, with no
 *   hydration mismatch, no `window` access during render.
 * - Also `false` while `clientSecret` is empty or blank, the state of a page
 *   that renders the element before its secret has been fetched. Mounting
 *   then would throw out of an effect and take the page down with it; the
 *   element mounts when the secret arrives instead.
 * - Callbacks are read through a ref, so a parent passing fresh closures
 *   every render never forces a costly iframe remount. Only the identity
 *   inputs (secret, origins) remount; theme changes hot-update in place.
 */
export function useElement<S = SuccessEvent>(
  mount: MountFn<S>,
  // `customerId` is not part of the public `ReactElementProps` (only the
  // payment-method element has one), but the hook still has to *see* it:
  // it is a remount input, and leaving it out of the dependency list
  // meant switching customers kept the previous customer's wallet (and
  // its "set default" / "remove" actions) on screen.
  props: ElementPropsBase<S> & { customerId?: string },
): {
  shouldRender: boolean;
  // Typed by inference from `useRef<HTMLDivElement>(null)`, deliberately.
  // The two React type majors in the peer range disagree on what that call
  // returns: React 18's types give `RefObject<HTMLDivElement>`, which is
  // what its `<div ref>` accepts, and React 19's give
  // `RefObject<HTMLDivElement | null>`, which is what ITS `<div ref>`
  // accepts. Spelling either one out here broke the build under the other,
  // and the React 18 CI leg is what caught it.
  containerRef: ReturnType<typeof useContainerRef>;
  handleRef: React.RefObject<BillKitElementHandle | null>;
} {
  const { iframeOrigin, apiBase, logger: providerLogger } = useBillKit();
  const [isClient, setIsClient] = useState(false);
  const containerRef = useContainerRef();
  const handleRef = useRef<BillKitElementHandle | null>(null);

  // Latest callbacks, read at event time and decoupled from remount inputs.
  const callbacks = useRef(props);

  // Same trick for the logger: resolve it at call time through a ref so
  // an inline `logger={{...}}` (or switching one on mid-session) never
  // tears down and rebuilds the payment iframe. The element always
  // receives this one stable object; it forwards to whatever is current,
  // or drops the line when neither prop nor provider supplies one.
  const resolvedLogger = props.logger ?? providerLogger;
  const activeLogger = useRef<BillKitElementLogger | undefined>(resolvedLogger);

  // Both refs are written once the render commits, never during it. React
  // can render and then throw a render away (a transition that a sibling
  // suspends, a concurrent render it restarts), and a ref written there
  // would route the live element's events to the closures of a render the
  // page never showed. A layout effect runs on commit and before any
  // message can arrive from the iframe, so nothing reads a stale value.
  useIsomorphicLayoutEffect(() => {
    callbacks.current = props;
    activeLogger.current = resolvedLogger;
  });
  const stableLogger = useRef<BillKitElementLogger>({
    debug: (message, context) => activeLogger.current?.debug(message, context),
    warn: (message, context) => activeLogger.current?.warn(message, context),
  }).current;

  useEffect(() => setIsClient(true), []);

  const hasSecret = typeof props.clientSecret === "string" && props.clientSecret.trim() !== "";

  const themeKey = props.theme ? JSON.stringify(props.theme) : "";

  useEffect(() => {
    if (!isClient || !hasSecret || containerRef.current === null) return;
    const options: ElementMountOptions<S> = {
      clientSecret: props.clientSecret,
      ...(props.theme ? { theme: props.theme } : {}),
      ...(props.locale ? { locale: props.locale } : {}),
      ...(props.title ? { title: props.title } : {}),
      ...(iframeOrigin ? { iframeOrigin } : {}),
      ...(apiBase ? { apiBase } : {}),
      ...(props.loadTimeoutMs !== undefined ? { loadTimeoutMs: props.loadTimeoutMs } : {}),
      logger: stableLogger,
      onReady: () => callbacks.current.onReady?.(),
      onChange: (e) => callbacks.current.onChange?.(e),
      onProcessing: (e) => callbacks.current.onProcessing?.(e),
      onEscape: () => callbacks.current.onEscape?.(),
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
  }, [isClient, props.clientSecret, props.customerId, props.locale, props.title, iframeOrigin, apiBase]);

  // Hot-apply theme changes without tearing down the iframe. Removing the
  // theme (`theme` set, then `undefined`) sends an empty token set, which
  // the element reads as "back to the defaults"; doing nothing left the
  // old tokens painted. The first run is skipped when there is no theme,
  // since the mount effect has just passed none.
  const appliedThemeKey = useRef("");
  useEffect(() => {
    const previous = appliedThemeKey.current;
    appliedThemeKey.current = themeKey;
    if (!handleRef.current) return;
    if (themeKey && props.theme) {
      handleRef.current.updateTheme(props.theme);
    } else if (previous) {
      handleRef.current.updateTheme({});
    }
  }, [themeKey]);

  return { shouldRender: isClient && hasSecret, containerRef, handleRef };
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
 * throwing: on the server, and on the first client render, there is no
 * element yet.
 */
export interface ThemeableElementRef {
  /** Push new theme tokens in without remounting. */
  updateTheme(theme: BillKitThemeTokens): void;
  /**
   * Move keyboard focus into the element, onto the first control it is
   * showing. Your page cannot reach into the cross-origin frame to do this
   * itself. A call before the element has booted is dropped, not queued.
   */
  focus(): void;
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
    focus: () => handleRef.current?.focus(),
    updateTheme: (theme) => handleRef.current?.updateTheme(theme),
  };
}

/**
 * Build the ref `<PaymentMethodElement/>` exposes.
 *
 * Deliberately no `submit`: the wallet element drops `billkit:submit` on
 * the floor (there is no form to submit; its actions are per-row "set
 * default" / "remove" buttons inside the iframe). Exposing a method that
 * silently does nothing would be worse than not having one.
 */
export function themeableElementRef(
  handleRef: React.RefObject<BillKitElementHandle | null>,
): ThemeableElementRef {
  return {
    focus: () => handleRef.current?.focus(),
    updateTheme: (theme) => handleRef.current?.updateTheme(theme),
  };
}
