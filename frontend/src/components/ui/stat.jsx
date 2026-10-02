import { energyStatTones } from "@/components/ui/energy-tone";
import { cn } from "@/lib/utils";
function Stat({
  label,
  value,
  unit,
  hint,
  icon,
  tone = "neutral",
  glow = false,
  className,
  ...props
}) {
  const colors = energyStatTones[tone];
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-panel transition-shadow duration-200",
        glow && colors.glow,
        className
      )}
      data-slot="stat"
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-muted-foreground text-xs">{label}</span>
        {icon ? (
          <span className={cn("[&>svg]:size-4", colors.icon)}>{icon}</span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-display text-2xl tabular-nums tracking-tight",
            colors.value
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="font-medium text-muted-foreground text-xs">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
export { Stat };
