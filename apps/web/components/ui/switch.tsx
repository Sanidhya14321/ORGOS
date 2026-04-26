import * as React from "react"

const Switch = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }
>(({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
  <label className={`inline-flex items-center cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
    <input
      ref={ref}
      type="checkbox"
      checked={checked || false}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      disabled={disabled}
      className="sr-only peer"
      {...props}
    />
    <div className={`
      relative w-11 h-6 rounded-full transition-colors
      peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-accent
      ${checked 
        ? 'bg-accent' 
        : 'bg-bg-subtle'
      }
      ${className || ''}
    `}>
      <div className={`
        absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full
        transition-transform duration-200
        ${checked ? 'translate-x-5' : 'translate-x-0'}
      `} />
    </div>
  </label>
))
Switch.displayName = "Switch"

export { Switch }

