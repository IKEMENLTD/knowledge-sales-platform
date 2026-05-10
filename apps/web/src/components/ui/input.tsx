import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Editorial input — 3-state with cinnabar focus ring.
 *  - text-base on mobile (16px) で iOS Safari ズームを防止
 *  - md+ で text-sm に絞る
 *  - hover で border 強化、focus で cinnabar ring
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-md border border-border bg-surface-inset/60',
          'px-3.5 text-base md:text-sm leading-tight',
          'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]',
          'transition-[border-color,box-shadow,background-color] duration-fast ease-sumi',
          'placeholder:text-muted-foreground/60',
          'hover:border-foreground/25 hover:bg-card',
          'focus-visible:outline-none focus-visible:border-ring focus-visible:bg-card',
          'focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18),inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
