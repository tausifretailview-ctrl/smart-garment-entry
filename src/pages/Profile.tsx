import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Shield, CheckCircle2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";

const roleDescriptions = {
  admin: "Full system access including user management and all settings",
  manager: "Access to purchase management, inventory, and product operations",
  user: "Access to basic product and inventory features"
};

const rolePermissions = {
  admin: [
    "Manage all users and roles",
    "Access all settings and configurations",
    "View and manage all purchases",
    "Full product and inventory control",
    "Generate all reports"
  ],
  manager: [
    "Create and manage purchase bills",
    "Add and edit products",
    "Manage inventory and stock",
    "Generate purchase and stock reports",
    "Print barcodes"
  ],
  user: [
    "View products and inventory",
    "Print barcodes",
    "View stock reports"
  ]
};

export default function Profile() {
  const { user } = useAuth();
  const { roles, loading } = useUserRoles();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <BackToDashboard />

        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">User Profile</h1>
            <p className="text-muted-foreground">View your account information and permissions</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your basic account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="text-lg">{user?.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Account Created</label>
              <p className="text-lg">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }) : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Assigned Roles
            </CardTitle>
            <CardDescription>Your current role assignments</CardDescription>
          </CardHeader>
          <CardContent>
            {roles.length === 0 ? (
              <p className="text-muted-foreground">No roles assigned yet. Contact your administrator.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <Badge key={role} variant="secondary" className="text-sm px-3 py-1">
                      {role}
                    </Badge>
                  ))}
                </div>
                <div className="space-y-3 mt-4">
                  {roles.map((role) => (
                    <div key={role} className="border rounded-lg p-4">
                      <h3 className="font-semibold capitalize mb-2">{role}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {roleDescriptions[role as keyof typeof roleDescriptions]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>What you can do based on your assigned roles</CardDescription>
          </CardHeader>
          <CardContent>
            {roles.length === 0 ? (
              <p className="text-muted-foreground">No permissions available. Contact your administrator to assign roles.</p>
            ) : (
              <div className="space-y-6">
                {roles.map((role) => (
                  <div key={role}>
                    <h3 className="font-semibold capitalize mb-3 flex items-center gap-2">
                      <Badge variant="outline">{role}</Badge>
                      <span className="text-sm text-muted-foreground">permissions</span>
                    </h3>
                    <ul className="space-y-2">
                      {rolePermissions[role as keyof typeof rolePermissions]?.map((permission, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{permission}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
