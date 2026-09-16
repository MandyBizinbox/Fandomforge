import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { legacyCreatorProfileSetupDestination } from "../lib/creatorOnboardingRouting";

export default function BandProfileSetup() {
  const { user } = useAuth();
  return <Navigate to={legacyCreatorProfileSetupDestination(user?.role)} replace />;
}
