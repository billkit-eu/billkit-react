import { type BaseElementOptions, type BillKitElementHandle, mountPaymentMethodElement } from "@billkit-eu/js";
import { type ReactElementProps, useElement } from "./useElement";

export interface PaymentMethodElementProps extends ReactElementProps {
  /** The customer whose saved payment methods to render + manage. */
  customerId: string;
}

/**
 * The customer's saved payment methods ("Visa •••• 4242 · Update"), as a
 * React component. Same SSR-safe mounting as {@link CheckoutElement}.
 */
export function PaymentMethodElement(props: PaymentMethodElementProps): JSX.Element | null {
  const { customerId } = props;
  const mount = (target: HTMLElement, options: BaseElementOptions): BillKitElementHandle =>
    mountPaymentMethodElement(target, { ...options, customerId });
  const { isClient, containerRef } = useElement(mount, props);
  if (!isClient) return null;
  return <div ref={containerRef} className={props.className} style={props.style} />;
}
