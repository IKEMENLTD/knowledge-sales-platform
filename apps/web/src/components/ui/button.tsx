import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * "Sumi & Cinnabar" button system.
 *
 * - 3-state: rest / hover / active で shadow + translate を物理的に変化
 * - cubic-bezier(0.32, 0.72, 0, 1) で Linear-grade snappiness
 * - 44px+ tap target on default size (iOS HIG)
 * - cinnabar variant でブランドアクセント
 */
const buttonVariants = cva(
  [
    'group inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md text-sm font-medium leading-none',
    'transition-[transform,box-shadow,background-color,border-color,color]',
    'duration-fast ease-sumi',
    'select-none touch-manipulation',
    'focus-visible:outline-none focus-visible:shadow-focus-ring',
    'disabled:pointer-events-none disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-primary text-primary-foreground',
          'shadow-sumi-sm',
          'hover:bg-primary/95 hover:shadow-sumi hover:-translate-y-px',
          'active:translate-y-0 active:shadow-sumi-sm active:bg-primary',
        ].join(' '),
        cinnabar: [
          'bg-cinnabar text-cinnabar-foreground',
          'shadow-sumi-sm',
          'hover:bg-cinnabar/95 hover:shadow-cinnabar-glow hover:-translate-y-px',
          'active:translate-y-0 active:shadow-sumi-sm',
          'focus-visible:shadow-focus-ring-cinnabar',
        ].join(' '),
        destructive: [
          'bg-destructive text-destructive-foreground',
          'shadow-sumi-sm',
          'hover:bg-destructive/95 hover:shadow-sumi hover:-translate-y-px',
          'active:translate-y-0',
        ].join(' '),
        outline: [
          'border border-border bg-card/60 text-foreground backdrop-blur-sm',
          'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.5)]',
          'hover:bg-card hover:border-foreground/25 hover:-translate-y-px hover:shadow-sumi',
          'active:translate-y-0',
        ].join(' '),
        secondary: [
          'bg-muted text-foreground',
          'hover:bg-accent hover:-translate-y-px',
          'active:translate-y-0',
        ].join(' '),
        ghost: [
          'text-foreground',
          'hover:bg-accent hover:text-accent-foreground',
        ].join(' '),
        link: [
          'text-foreground underline-offset-4',
          'hover:underline decoration-cinnabar decoration-[1.5px] underline-offset-[6px]',
        ].join(' '),
      },
      size: {
        // 44px tap target を default で確保 (iOS HIG)
        default: 'h-11 px-4 text-base md:text-sm',
        sm: 'h-10 px-3.5 text-sm',
        lg: 'h-12 px-7 text-base',
        xl: 'h-14 px-8 text-base font-semibold rounded-lg',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
