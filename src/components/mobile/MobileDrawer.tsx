import { useState } from "react";
import { Settings, HelpCircle, LogOut, User, Building, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useNavigate } from "react-router-dom";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface MobileDrawerProps {
  trigger: React.ReactNode;
}

export const MobileDrawer = ({ trigger }: MobileDrawerProps) => {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const { orgNavigate, orgSlug } = useOrgNavigation();
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    setOpen(false);
    orgNavigate(path);
  };

  const handleSignOut = async () => {
    setOpen(false);
    const slug = currentOrganization?.slug || orgSlug;
    await signOut();
    if (slug) {
      navigate(`/${slug}`);
    } else {
      navigate("/auth");
    }
  };

  const menuItems = [
    { icon: User, label: "Profile", path: "/profile" },
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: HelpCircle, label: "Help & Support", path: "/settings" },
  ];

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger}
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="sr-only">Menu</DrawerTitle>
          
          {/* User Profile Section */}
          <div className="flex items-center gap-3 p-2">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">
                {user?.email || "User"}
              </p>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Building className="h-3 w-3" />
                <span className="truncate">
                  {currentOrganization?.name || "Organization"}
                </span>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <Separator />

        {/* Menu Items */}
        <div className="p-2 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg",
                  "text-foreground hover:bg-muted/50 transition-colors",
                  "active:scale-[0.98] touch-manipulation"
                )}
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-left font-medium">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>

        <Separator />

        {/* Sign Out */}
        <div className="p-2 pb-safe">
          <button
            onClick={handleSignOut}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg",
              "text-destructive hover:bg-destructive/10 transition-colors",
              "active:scale-[0.98] touch-manipulation"
            )}
          >
            <LogOut className="h-5 w-5" />
            <span className="flex-1 text-left font-medium">Sign Out</span>
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
