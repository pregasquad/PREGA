import { useQuery } from "@tanstack/react-query";

interface AdminRole {
  id: number;
  name: string;
  role: string;
  permissions: string[];
}

export function useNavigationPermissions() {
  const currentUserName =
    typeof window !== "undefined" ? sessionStorage.getItem("current_user") : null;
  const isAdmin =
    typeof window !== "undefined"
      ? sessionStorage.getItem("admin_authenticated") === "true"
      : false;

  const { data: adminRoles = [] } = useQuery<AdminRole[]>({
    queryKey: ["/api/admin-roles"],
  });

  const currentUser = adminRoles.find(r => r.name === currentUserName);

  const hasPermission = (permission: string | null): boolean => {
    if (!permission) return true;
    if (!currentUserName || currentUserName === "Setup") return true;
    if (!currentUser) return true;
    if (currentUser.role === "owner") return true;
    if (currentUser.permissions.length === 0) return true;
    return currentUser.permissions.includes(permission);
  };

  return { hasPermission, currentUser, currentUserName, isAdmin };
}
