import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Editorial input with iOS-friendly preset variants. */
export type InputPreset =
  | 'default'
  | 'email'
  | 'tel'
  | 'search'
  | 'numeric'
  | 'url'
  | 'name-jp'
  | 'password';

const PRESET_ATTRS: Record<InputPreset, Partial<InputHTMLAttributes<HTMLInputElement>>> = {
  default: {},
  email: {
    type: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    autoCapitalize: 'none',
    spellCheck: false,
    enterKeyHint: 'next',
  },
  tel: {
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    enterKeyHint: 'next',
  },
  search: {
    type: 'search',
    inputMode: 'search',
    autoComplete: 'off',
    enterKeyHint: 'search',
  },
  numeric: {
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'off',
    pattern: '[0-9]*',
  },
  url: {
    type: 'url',
    inputMode: 'url',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  'name-jp': {
    type: 'text',
    autoCapitalize: 'none',
    autoComplete: 'name',
    spellCheck: false,
  },
  password: {
    type: 'password',
    autoComplete: 'current-password',
    autoCapitalize: 'none',
    spellCheck: false,
  },
};

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /**
   * iOS/Android キーボードの種類・autocomplete・autocapitalize を一括宣言する preset。
   * 個別属性で上書き可能 (preset 後に明示属性を渡す)。
   */
  preset?: InputPreset;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, preset = 'default', type, ...rest }, ref) => {
    const presetAttrs = PRESET_ATTRS[preset];
    return (
      <input
        ref={ref}
        type={type ?? presetAttrs.type ?? 'text'}
        {...presetAttrs}
        {...rest}
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
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
