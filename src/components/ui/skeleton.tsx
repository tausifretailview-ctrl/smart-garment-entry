import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "animate-pulse rounded-md bg-muted",
        "bg-gradient-to-r from-muted via-muted/70 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]",
        className
      )} 
      {...props} 
    />
  );
}

export { Skeleton };
