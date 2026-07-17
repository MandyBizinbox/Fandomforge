"""FandomForge API server."""
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
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
client = AsyncIOMotorClient(mongo_url)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("fandomforge")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = client[db_name]
    try:
        from seed import seed_if_empty
        from seed_production_operations import seed_production_operations
        from seed_production_rules import seed_production_rules

        await seed_if_empty(app.state.db)
        await seed_production_operations(app.state.db)
        await seed_production_rules(app.state.db)
        logger.info("Seed check complete")
    except Exception as e:
        logger.exception(f"Seed failed: {e}")
    yield
    client.close()


app = FastAPI(title="FandomForge API", lifespan=lifespan)

# Serve uploads via /api/uploads (behind ingress /api rule)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "FandomForge API", "version": "1.0.0"}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


# Mount sub-routers on /api
from production_model_compat import install_production_model_compat

install_production_model_compat()

from auth import auth_router
import routes_main as routes_main_module
from production_operation_pricing import install_production_operation_pricing
from order_finance_patches import install_order_finance_patches
from builder_artwork_costing_patch import install_builder_artwork_costing_patch
from builder_production_rules_patch import install_builder_production_rules_patch
from builder_text_artwork_patch import install_builder_text_artwork_patch
from platform_launch_policy_patch import install_platform_launch_policy_patch

install_production_operation_pricing(routes_main_module)
install_order_finance_patches(routes_main_module)
install_builder_artwork_costing_patch(routes_main_module)
install_builder_production_rules_patch(routes_main_module)
install_builder_text_artwork_patch(routes_main_module)
install_platform_launch_policy_patch(routes_main_module)

from routes_main import (
    bands_router, printers_router, product_templates_router, products_router, artworks_router,
    orders_router, admin_router, payments_router, platform_billing_router, files_router, public_router,
    band_dash_router, printer_dash_router, categories_router, attributes_router, print_options_router,
)
from routes_public_platform import public_platform_router
from public_homepage_privacy import public_homepage_router
from builder_draft_routes import builder_drafts_router
from routes_production_operations import production_operations_router
from routes_production_rules import production_rules_router

api_router.include_router(auth_router)
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
# Platform-aware routes must be registered before legacy public routes with the
# same path so configured contact details and branding remain authoritative.
api_router.include_router(public_platform_router)
api_router.include_router(public_homepage_router)
api_router.include_router(public_router)
api_router.include_router(files_router)
api_router.include_router(band_dash_router)
api_router.include_router(printer_dash_router)
api_router.include_router(categories_router)
api_router.include_router(attributes_router)
api_router.include_router(print_options_router)
api_router.include_router(production_operations_router)
api_router.include_router(production_rules_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"]
)
