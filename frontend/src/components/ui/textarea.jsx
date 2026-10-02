import { cn } from "@/lib/utils";
function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "field-sizing-content flex min-h-16 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
        className
      )}
      data-slot="textarea"
      {...props}
    />
  );
}
export { Textarea };
