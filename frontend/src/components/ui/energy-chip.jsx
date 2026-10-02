import { energyChipTones } from "@/components/ui/energy-tone";
import { cn } from "@/lib/utils";
function EnergyChip({
  tone = "neutral",
  active = false,
  dot = true,
  className,
  children,
  ...props
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2 font-medium text-[0.6875rem]",
        energyChipTones[tone],
        className
      )}
      data-active={active || undefined}
      data-slot="energy-chip"
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full bg-current",
            active &&
              "motion-safe:animate-[solar-pulse_2s_ease-in-out_infinite]"
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
export { EnergyChip };
