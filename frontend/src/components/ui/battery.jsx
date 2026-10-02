"use client";
import { cn } from "@/lib/utils";
const CELLS = 8;
const fillByTone = {
  battery: "bg-success",
  destructive: "bg-destructive",
  solar: "bg-primary",
};
const clamp = (value) => Math.min(100, Math.max(0, value));
function resolveTone(tone, value) {
  if (tone === "solar" || tone === "battery") {
    return tone;
  }
  if (value >= 60) {
    return "battery";
  }
  if (value >= 20) {
    return "solar";
  }
  return "destructive";
}
function BatteryLevel({
  value,
  tone = "auto",
  charging = false,
  label,
  segments = CELLS,
  size = "md",
  className,
  "aria-label": ariaLabel = "Battery level",
  ...props
}) {
  const clamped = clamp(value);
  const filled = Math.round((clamped / 100) * segments);
  const fill = fillByTone[resolveTone(tone, clamped)];
  const cellSize = { lg: "h-5", md: "h-3.5", sm: "h-2.5" }[size];
  const textSize = { lg: "text-sm", md: "text-xs", sm: "text-[0.6875rem]" }[
    size
  ];
  return (
    <div
      aria-label={ariaLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clamped}
      aria-valuetext={`${Math.round(clamped)}% battery level`}
      className={cn("flex items-center gap-2", className)}
      data-slot="battery-level"
      role="progressbar"
      {...props}
    >
      <div
        className={cn(
          "relative rounded-[5px] border border-border bg-muted/60 p-[3px]",
          cellSize,
          charging && "overflow-hidden"
        )}
        data-slot="battery-shell"
      >
        <div className="flex h-full items-center gap-[2px]">
          {Array.from({ length: segments }, (_, index) => (
            <span
              aria-hidden="true"
              className={cn(
                "h-full flex-1 rounded-[2px] transition-colors duration-200",
                index < filled ? fill : "bg-foreground/10"
              )}
              key={index}
            />
          ))}
        </div>
        {charging ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 h-full w-1/3 bg-linear-to-r from-transparent via-white/25 to-transparent motion-safe:animate-[battery-shimmer_1.6s_ease-in-out_infinite]"
            data-slot="battery-shimmer"
          />
        ) : null}
      </div>
      <span aria-hidden="true" className="h-3 w-[3px] rounded-r-md bg-border" />

      {label !== undefined || charging ? (
        <span
          className={cn(
            "font-display text-muted-foreground tabular-nums",
            textSize
          )}
        >
          {label ?? `${Math.round(clamped)}%`}
        </span>
      ) : null}
    </div>
  );
}
export { BatteryLevel, fillByTone };
