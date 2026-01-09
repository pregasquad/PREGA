export function LogoSpinner({ size = "md", showText = true }: { size?: "sm" | "md" | "lg", showText?: boolean }) {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32"
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <img 
        src="/loading-logo.png" 
        alt="Loading" 
        className={`${sizeClasses[size]} object-contain animate-spin`}
        style={{ animationDuration: '2s' }}
      />
      {showText && (
        <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
      )}
    </div>
  );
}
