import { mountCheckoutElement } from "@billkit-eu/js";
import { type ReactElementProps, useElement } from "./useElement";

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
 */
export function CheckoutElement(props: CheckoutElementProps): JSX.Element | null {
  const { isClient, containerRef } = useElement(mountCheckoutElement, props);
  if (!isClient) return null;
  return <div ref={containerRef} className={props.className} style={props.style} />;
}
