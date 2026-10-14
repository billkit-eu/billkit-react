import { type BaseElementOptions, type BillKitElementHandle, mountPaymentMethodElement } from "@billkit-eu/js";
import { forwardRef, useImperativeHandle } from "react";
import {
  type ReactElementProps,
  type ThemeableElementRef,
  themeableElementRef,
  useElement,
} from "./useElement";

export interface PaymentMethodElementProps extends ReactElementProps {
  /**
   * Optional. The `client_secret` already names the customer, and the
   * element shows that customer's methods whatever is passed here. When
   * given, a change still remounts the element.
   */
  customerId?: string;
}

/**
 * The customer's saved payment methods ("Visa •••• 4242 · Update"), as a
 * React component. Same SSR-safe mounting as {@link CheckoutElement}.
 *
 * A new `clientSecret` (or `customerId`) remounts the element, so the
 * wallet on screen always belongs to the customer the secret names.
 *
 * The `ref` exposes `focus()` and `updateTheme()`, and no `submit()`: this
 * element has no form to submit; its actions are per-row buttons inside the
 * iframe.
 */
export const PaymentMethodElement = forwardRef<ThemeableElementRef, PaymentMethodElementProps>(
  function PaymentMethodElement(props, ref) {
    const { customerId } = props;
    const mount = (target: HTMLElement, options: BaseElementOptions): BillKitElementHandle =>
      mountPaymentMethodElement(target, { ...options, ...(customerId ? { customerId } : {}) });
    const { shouldRender, containerRef, handleRef } = useElement(mount, props);
    useImperativeHandle(ref, () => themeableElementRef(handleRef), []);
    if (!shouldRender) return null;
    return <div ref={containerRef} className={props.className} style={props.style} />;
  },
);
