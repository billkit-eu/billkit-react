import { type BaseElementOptions, type BillKitElementHandle, mountPaymentMethodElement } from "@billkit-eu/js";
import { forwardRef, useImperativeHandle } from "react";
import {
  type ReactElementProps,
  type ThemeableElementRef,
  themeableElementRef,
  useElement,
} from "./useElement";

export interface PaymentMethodElementProps extends ReactElementProps {
  /** The customer whose saved payment methods to render + manage. */
  customerId: string;
}

/**
 * The customer's saved payment methods ("Visa •••• 4242 · Update"), as a
 * React component. Same SSR-safe mounting as {@link CheckoutElement}.
 *
 * Changing `customerId` remounts the element, so the wallet on screen
 * always belongs to the customer named in the props.
 *
 * The `ref` exposes `updateTheme()` only — this element has no form to
 * submit; its actions are per-row buttons inside the iframe.
 */
export const PaymentMethodElement = forwardRef<ThemeableElementRef, PaymentMethodElementProps>(
  function PaymentMethodElement(props, ref) {
    const { customerId } = props;
    const mount = (target: HTMLElement, options: BaseElementOptions): BillKitElementHandle =>
      mountPaymentMethodElement(target, { ...options, customerId });
    const { isClient, containerRef, handleRef } = useElement(mount, props);
    useImperativeHandle(ref, () => themeableElementRef(handleRef), []);
    if (!isClient) return null;
    return <div ref={containerRef} className={props.className} style={props.style} />;
  },
);
