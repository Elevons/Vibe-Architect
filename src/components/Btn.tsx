import type { ButtonHTMLAttributes } from "react";
import { FONT } from "../lib/constants";

/**
 * The app's base button: small, dark, subtle border. Callers override any
 * style inline via the `style` prop.
 */
export function Btn(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { style, ...rest } = props;
  return (
    <button
      {...rest}
      style={{
        background: "#ffffff0a",
        border: "1px solid #fff1",
        borderRadius: 4,
        color: "#ccc",
        padding: "3px 8px",
        fontSize: 10,
        cursor: "pointer",
        fontFamily: FONT,
        ...style,
      }}
    />
  );
}
