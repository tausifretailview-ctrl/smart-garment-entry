import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { openShopChat, useShopChatThreads, useSiblingShopsForChat } from "@/hooks/useShopChat";

/**
 * Opens the shop chat panel (right side) with an unread badge.
 * Hidden unless the shop has a linked sibling shop, or the login is admin of another shop
 * (so it can turn chat on).
 */
export function ShopChatButton({
  className,
  iconClassName = "h-4 w-4",
  badgeClassName,
  label,
}: {
  className?: string;
  iconClassName?: string;
  badgeClassName?: string;
  label?: string;
}) {
  const { data: threads = [] } = useShopChatThreads();
  const { data: siblings = [] } = useSiblingShopsForChat();
  if (threads.length === 0 && siblings.length === 0) return null;

  const unread = threads.reduce((sum, t) => sum + (t.unread || 0), 0);

  return (
    <button
      type="button"
      onClick={() => openShopChat()}
      className={cn("relative flex items-center justify-center gap-1.5 touch-manipulation", className)}
      aria-label={unread > 0 ? `Shop chat, ${unread} unread` : "Shop chat"}
      title="Chat with your other shops"
    >
      <MessagesSquare className={iconClassName} />
      {label && <span className="hidden sm:inline">{label}</span>}
      {unread > 0 && (
        <span
          className={cn(
            "absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground",
            "text-[10px] font-bold flex items-center justify-center leading-none",
            badgeClassName,
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
