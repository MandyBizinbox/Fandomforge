"""Launch-integrity services for the FandomForge production candidate.

The package is additive and deliberately keeps legacy collections readable while
routing all new sensitive operations through shared settings, permission,
pricing, entitlement, audit, finance and production services.
"""

LAUNCH_INTEGRITY_VERSION = "2026.07.18.1"
