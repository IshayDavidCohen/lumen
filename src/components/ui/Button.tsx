import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700
    disabled:bg-zinc-700 disabled:text-zinc-500
  `,
  ghost: `
    bg-transparent
    text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200
    dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 dark:active:bg-zinc-700
    disabled:opacity-50 disabled:pointer-events-none
  `,
  danger: `
    bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700
    dark:bg-red-600/10 dark:text-red-400 dark:hover:bg-red-600/20 dark:hover:text-red-300
    disabled:opacity-50 disabled:pointer-events-none
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs rounded",
  md: "h-9 px-4 text-sm rounded-md",
  icon: "h-8 w-8 rounded-full flex items-center justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "ghost", size = "md", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center gap-2
          font-medium transition-colors duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50
          disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `.trim()}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
