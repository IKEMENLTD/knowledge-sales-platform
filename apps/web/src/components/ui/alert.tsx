import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Token-based alert. dark mode で崩壊しない。
 *  - default: muted neutral
 *  - cinnabar: brand active accent (まれに、CTA-like 通知用)
 *  - destructive: 警告・エラー
 *  - warning (ochre): 注意
 *  - success (chitose): 達成
 *  - info: 情報補足
 */
const alertVariants = cva(
  [
    'relative w-full rounded-lg border p-4 text-sm leading-relaxed',
    "[&>svg~*]:pl-7 [&>svg+div]:translate-y-[-2px]",
    '[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-card text-foreground border-border',
        cinnabar:
          'bg-cinnabar-muted text-cinnabar border-cinnabar/30 [&>svg]:text-cinnabar',
        destructive:
          'bg-destructive/8 text-destructive border-destructive/30 [&>svg]:text-destructive',
        warning:
          'bg-ochre-muted text-ochre border-ochre/30 [&>svg]:text-ochre',
        success:
          'bg-chitose-muted text-chitose border-chitose/30 [&>svg]:text-chitose',
        info:
          'bg-info/10 text-info border-info/25 [&>svg]:text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = 'Alert';

const AlertTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-semibold tracking-crisp leading-none', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm leading-relaxed [&_p]:leading-relaxed', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription, alertVariants };
