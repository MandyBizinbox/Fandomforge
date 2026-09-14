const CREATOR_CONSOLE_ROLES = new Set(["creator", "owner", "super_admin", "admin"]);

export function legacyCreatorProfileSetupDestination(role) {
  return CREATOR_CONSOLE_ROLES.has(role) ? "/creator" : "/account";
}
