import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
const alertVariants = cva(
  "relative grid w-full gap-1 rounded-xl border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:top-3.5 [&>svg]:left-4 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-current [&>svg~*]:pl-7",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default:
          "border-border bg-card text-foreground [&>svg]:text-muted-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
        info: "border-info/40 bg-info/10 text-info",
        success: "border-success/40 bg-success/10 text-success",
        warning: "border-warning/40 bg-warning/10 text-warning",
      },
    },
  }
);
function Alert({ className, variant, ...props }) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}
function AlertTitle({ className, ...props }) {
  return (
    <div
      className={cn("font-display font-medium tracking-tight", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}
function AlertDescription({ className, ...props }) {
  return (
    <div
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}
export { Alert, AlertDescription, AlertTitle, alertVariants };
