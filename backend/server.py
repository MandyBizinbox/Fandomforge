"""FandomForge API server."""
import asyncio
from contextlib import asynccontextmanager, suppress
import logging
import os
from pathlib import Path

from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
UPLOAD_DIR = ROOT / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
E2E_MODE = (
    os.environ.get("E2E_TEST_MODE") == "1"
    and os.environ.get("ENVIRONMENT", "development").lower() != "production"
    and db_name.startswith("fandomforge_e2e_")
)
client = AsyncIOMotorClient(mongo_url)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("fandomforge")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = client[db_name]
    email_task = None
    try:
        from seed import seed_if_empty
        from seed_production_operations import seed_production_operations
        from seed_production_rules import seed_production_rules
        from classic_htv_colour_seed import seed_classic_htv_colours
        from glitter_htv_colour_seed import seed_glitter_htv_colours
        from puff_htv_colour_seed import seed_puff_htv_colours
        from metallic_htv_colour_seed import seed_metallic_htv_colours
        from glow_htv_colour_seed import seed_glow_htv_colours
        from htv_profile_colour_assignment import repair_htv_profile_colour_assignments
        from payout_launch_routes import ensure_payout_launch_indexes
        from email_delivery import ensure_email_delivery_indexes
        from email_settings_routes import dashboard_email_delivery_loop
        from launch_integrity.install import ensure_launch_integrity_indexes
        await seed_if_empty(app.state.db)
        await seed_production_operations(app.state.db)
        await seed_production_rules(app.state.db)
        classic_htv_seed = await seed_classic_htv_colours(app.state.db)
        logger.info("Classic HTV stocked-colour seed: %s", classic_htv_seed)
        glitter_htv_seed = await seed_glitter_htv_colours(app.state.db)
        logger.info("Glitter HTV stocked-colour seed: %s", glitter_htv_seed)
        puff_htv_seed = await seed_puff_htv_colours(app.state.db)
        logger.info("Puff HTV stocked-colour seed: %s", puff_htv_seed)
        metallic_htv_seed = await seed_metallic_htv_colours(app.state.db)
        logger.info("Metallic HTV stocked-colour seed: %s", metallic_htv_seed)
        glow_htv_seed = await seed_glow_htv_colours(app.state.db)
        logger.info("Glow HTV stocked-colour seed: %s", glow_htv_seed)
        htv_profile_assignment = await repair_htv_profile_colour_assignments(app.state.db)
        logger.info("Authoritative HTV profile-colour assignment: %s", htv_profile_assignment)
        await ensure_payout_launch_indexes(app.state.db)
        await ensure_email_delivery_indexes(app.state.db)
        await ensure_launch_integrity_indexes(app.state.db)
        if E2E_MODE:
            from e2e_support import normalize_e2e_fixture_emails
            changed = await normalize_e2e_fixture_emails(app.state.db)
            logger.info("Normalized isolated E2E fixture email aliases: %s", changed)
        worker_id = f"api-{os.getpid()}"
        email_task = asyncio.create_task(dashboard_email_delivery_loop(app.state.db, worker_id), name=f"fandomforge-email-{worker_id}")
        app.state.email_delivery_task = email_task
        logger.info("Seed, launch-integrity indexes and email-delivery startup checks complete")
    except Exception as exc:
        logger.exception("Startup checks failed: %s", exc)
    yield
    if email_task:
        email_task.cancel()
        with suppress(asyncio.CancelledError):
            await email_task
    client.close()


app = FastAPI(title="FandomForge API", lifespan=lifespan)
if E2E_MODE:
    from e2e_support import E2EEmailAliasMiddleware
    app.add_middleware(E2EEmailAliasMiddleware)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "FandomForge API", "version": "1.0.0"}


@api_router.get("/health")
async def health(request: Request):
    from email_settings_routes import email_delivery_status
    from launch_integrity import LAUNCH_INTEGRITY_VERSION
    email = await email_delivery_status(request.app.state.db)
    return {"status": "ok", "launch_integrity_version": LAUNCH_INTEGRITY_VERSION, "email_delivery": email}


from production_model_compat import install_production_model_compat
install_production_model_compat()
from auth import auth_router
import routes_main as routes_main_module
from product_template_geometry_csv_patch import install_product_template_geometry_csv_patch
from production_geometry_profile_copy_patch import install_production_geometry_profile_copy_patch
from production_geometry_profile_copy_color_patch import install_production_geometry_profile_copy_color_patch
from production_geometry_profile_copy_warning_patch import (
    build_import_plan as build_profile_copy_import_plan,
    apply_import_plan_to_documents as apply_profile_copy_import_plan,
)
install_product_template_geometry_csv_patch(routes_main_module)
install_production_geometry_profile_copy_patch(routes_main_module)
install_production_geometry_profile_copy_color_patch(routes_main_module)
# Missing Color-owned editor views must not block a Size-owned geometry repair.
# Route preview/apply through the final compatibility layer while leaving the
# existing export/parse stack untouched.
routes_main_module.build_import_plan = build_profile_copy_import_plan
routes_main_module.apply_import_plan_to_documents = apply_profile_copy_import_plan
if E2E_MODE:
    from e2e_gateway_patch import install_e2e_mock_gateway
    install_e2e_mock_gateway(routes_main_module)
from production_operation_pricing import install_production_operation_pricing
from production_profile_resolution_patch import install_production_profile_resolution_patch
from order_finance_patches import install_order_finance_patches
from builder_artwork_costing_patch import install_builder_artwork_costing_patch
from builder_production_rules_patch import install_builder_production_rules_patch
from builder_product_save_patch import install_builder_product_save_patch
from builder_text_artwork_patch import install_builder_text_artwork_patch
from platform_launch_policy_patch import install_platform_launch_policy_patch
from outsourced_rate_runtime_patch import install_outsourced_rate_runtime
from profile_stocked_colours_patch import install_profile_stocked_colours_patch
from profile_colour_projection_repair import install_profile_colour_projection_repair
from template_lifecycle_routes import install_template_lifecycle_routes
install_production_profile_resolution_patch()
install_production_operation_pricing(routes_main_module)
install_order_finance_patches(routes_main_module)
install_builder_artwork_costing_patch(routes_main_module)
install_builder_production_rules_patch(routes_main_module)
install_builder_product_save_patch(routes_main_module)
install_builder_text_artwork_patch(routes_main_module)
install_platform_launch_policy_patch(routes_main_module)
install_outsourced_rate_runtime(routes_main_module)
install_profile_stocked_colours_patch()
install_profile_colour_projection_repair()
install_template_lifecycle_routes(routes_main_module)
from launch_integrity.compat import ensure_core_compat
ensure_core_compat(routes_main_module)
from launch_integrity.install import install_launch_integrity
install_launch_integrity(app, routes_main_module)

from routes_main import (
    bands_router, printers_router, product_templates_router, products_router, artworks_router,
    orders_router, admin_router, payments_router, platform_billing_router, files_router, public_router,
    band_dash_router, printer_dash_router, categories_router, attributes_router, print_options_router,
)
from routes_public_platform import public_platform_router
from public_homepage_privacy import public_homepage_router
import payout_launch_routes as payout_launch_routes_module
from payout_launch_routes import payout_launch_router
from payout_retry_guard import install_payout_retry_guard
from builder_draft_routes import builder_drafts_router
from creator_finance_routes import creator_finance_router
from email_settings_routes import email_settings_router
from routes_production_operations import production_operations_router
import routes_production_rules as routes_production_rules_module
from routes_production_rules import production_rules_router
from launch_integrity.routes import integrity_router
from launch_integrity.printer_gate_routes import printer_gate_router
from launch_integrity.printer_ops import printer_ops_router
from launch_integrity.review_routes import review_router
from launch_integrity.safety_routes import safety_router
from launch_integrity.financial_gate_routes import financial_gate_router
install_profile_stocked_colours_patch(routes_production_rules_module)
install_profile_colour_projection_repair(routes_production_rules_module)
install_payout_retry_guard(payout_launch_routes_module)

api_router.include_router(auth_router)
api_router.include_router(integrity_router)
api_router.include_router(printer_gate_router)
api_router.include_router(printer_ops_router)
api_router.include_router(review_router)
api_router.include_router(safety_router)
api_router.include_router(financial_gate_router)
if E2E_MODE:
    from e2e_support import e2e_router
    api_router.include_router(e2e_router)
api_router.include_router(payout_launch_router)
api_router.include_router(bands_router)
api_router.include_router(printers_router)
api_router.include_router(product_templates_router)
api_router.include_router(builder_drafts_router)
api_router.include_router(products_router)
api_router.include_router(artworks_router)
api_router.include_router(orders_router)
api_router.include_router(payments_router)
api_router.include_router(platform_billing_router)
api_router.include_router(admin_router)
api_router.include_router(email_settings_router)
api_router.include_router(public_platform_router)
api_router.include_router(public_homepage_router)
api_router.include_router(public_router)
api_router.include_router(files_router)
api_router.include_router(band_dash_router)
api_router.include_router(creator_finance_router)
api_router.include_router(printer_dash_router)
api_router.include_router(categories_router)
api_router.include_router(attributes_router)
api_router.include_router(print_options_router)
api_router.include_router(production_operations_router)
api_router.include_router(production_rules_router)
app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
