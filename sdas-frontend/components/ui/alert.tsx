import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const styles = {
  error: {
    wrapper: "border-danger/25 bg-danger-soft text-danger",
    Icon: AlertCircle,
  },
  success: {
    wrapper: "border-success/25 bg-success-soft text-success",
    Icon: CheckCircle2,
  },
  warning: {
    wrapper: "border-warning/30 bg-warning-soft text-warning",
    Icon: TriangleAlert,
  },
  info: {
    wrapper: "border-info/25 bg-info-soft text-info",
    Icon: Info,
  },
} as const;

export type AlertVariant = keyof typeof styles;

interface AlertProps extends Omit<ComponentProps<"div">, "title"> {
  variant?: AlertVariant;
  title?: string;
}

export function Alert({ className, variant = "info", title, children, ...props }: AlertProps) {
  const style = styles[variant];
  const Icon = style.Icon;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        style.wrapper,
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
