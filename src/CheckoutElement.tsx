import { mountCheckoutElement } from "@billkit-eu/js";
import { forwardRef, useImperativeHandle } from "react";
import {
  type BillKitElementRef,
  checkoutElementRef,
  type ReactElementProps,
  useElement,
} from "./useElement";

export type CheckoutElementProps = ReactElementProps;

/**
 * Embedded checkout, as a React component. SSR-safe: renders `null` on the
 * server and the first client render, then mounts the js.billkit.eu iframe
 * after hydration.
 *
 * ```tsx
 * <BillKitProvider>
 *   <CheckoutElement
 *     clientSecret={clientSecret}
 *     theme={{ colorPrimary: "#6d28d9", borderRadius: "10px" }}
 *     onSuccess={({ sessionId }) => router.push(`/thanks?cs=${sessionId}`)}
 *   />
 * </BillKitProvider>
 * ```
 *
 * Driving your own pay button: take a `ref` and call `submit()`. Gate the
 * button on `onChange`'s `complete`, and re-enable it from `onError` —
 * a declined card fires `onError({ code: "payment_declined" })` and the
 * element shows its own retry panel.
 *
 * ```tsx
 * const element = useRef<BillKitElementRef>(null);
 * const [ready, setReady] = useState(false);
 * <>
 *   <CheckoutElement
 *     ref={element}
 *     clientSecret={clientSecret}
 *     onChange={({ complete }) => setReady(complete)}
 *     onError={() => setSubmitting(false)}
 *   />
 *   <button disabled={!ready} onClick={() => element.current?.submit()}>Pay</button>
 * </>
 * ```
 */
export const CheckoutElement = forwardRef<BillKitElementRef, CheckoutElementProps>(
  function CheckoutElement(props, ref) {
    const { isClient, containerRef, handleRef } = useElement(mountCheckoutElement, props);
    // No dependency list: `handleRef` is a stable ref object, and the
    // closures read `.current` at call time, so the imperative handle
    // never goes stale across remounts.
    useImperativeHandle(ref, () => checkoutElementRef(handleRef), []);
    if (!isClient) return null;
    return <div ref={containerRef} className={props.className} style={props.style} />;
  },
);
