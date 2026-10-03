import { Navigate, Outlet, useLocation } from "react-router";
import { useCurrentUser } from "../hooks/useAuth";

export default function ProtectedRoute() {
  const { data: user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading...</div>; // swap for your spinner
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
