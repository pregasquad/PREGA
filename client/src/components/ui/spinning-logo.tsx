import { cn } from "@/lib/utils";

interface SpinningLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

export function SpinningLogo({ size = "md", className }: SpinningLogoProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <img
        src="/prega_logo.png"
        alt="Loading..."
        className={cn(sizeClasses[size], "animate-spin")}
        style={{ animationDuration: "1.5s" }}
      />
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-4">
        <SpinningLogo size="xl" />
        <p className="text-muted-foreground text-sm animate-pulse">Chargement...</p>
      </div>
    </div>
  );
}

export function LoadingSpinner({ size = "md", className }: SpinningLogoProps) {
  return <SpinningLogo size={size} className={className} />;
}
