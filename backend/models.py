"""Pydantic models for FandomForge."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import uuid


def uid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ------------ USERS ------------
Role = Literal["super_admin", "owner", "admin", "manager", "creator", "creator", "printer", "buyer", "customer"]
AccountStatus = Literal["active", "suspended", "pending", "archived"]
CreatorVisibility = Literal["public", "unlisted", "private"]


class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: Role = "buyer"
    status: AccountStatus = "active"
    manager_permissions: Dict[str, bool] = Field(default_factory=dict)


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role = "buyer"


ManagerPermissionKey = Literal[
    "manage_users",
    "manage_bands",
    "manage_band_users",
    "manage_products",
    "manage_product_templates",
    "manage_orders",
    "manage_artwork_review",
    "manage_printers",
    "manage_printer_users",
    "manage_printer_pricing",
    "manage_shipping",
    "manage_shop_payment_gateways",
    "manage_reports",
    "manage_platform_branding",
    "manage_subscriptions",
    "manage_payouts",
]


def default_manager_permissions() -> Dict[str, bool]:
    return {
        "manage_users": False,
        "manage_bands": True,
        "manage_band_users": True,
        "manage_products": True,
        "manage_product_templates": True,
        "manage_orders": True,
        "manage_artwork_review": True,
        "manage_printers": False,
        "manage_printer_users": False,
        "manage_printer_pricing": False,
        "manage_shipping": True,
        "manage_shop_payment_gateways": True,
        "manage_reports": True,
        "manage_platform_branding": True,
        "manage_subscriptions": False,
        "manage_payouts": False,
    }


class ManagerPermissions(BaseModel):
    model_config = ConfigDict(extra="ignore")

    manage_users: bool = False
    manage_bands: bool = True
    manage_band_users: bool = True
    manage_products: bool = True
    manage_product_templates: bool = True
    manage_orders: bool = True
    manage_artwork_review: bool = True
    manage_printers: bool = False
    manage_printer_users: bool = False
    manage_printer_pricing: bool = False
    manage_shipping: bool = True
    manage_shop_payment_gateways: bool = True
    manage_reports: bool = True
    manage_platform_branding: bool = True
    manage_subscriptions: bool = False
    manage_payouts: bool = False


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role = "buyer"
    status: AccountStatus = "active"
    manager_permissions: Dict[str, bool] = Field(default_factory=dict)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    role: Optional[Role] = None
    status: Optional[AccountStatus] = None
    manager_permissions: Optional[Dict[str, bool]] = None


class UserPasswordUpdate(BaseModel):
    password: str


MembershipStatus = Literal["active", "invited", "suspended", "removed"]
BandMembershipRole = Literal["owner", "admin", "products", "orders", "finance", "viewer"]
PrinterMembershipRole = Literal["owner", "admin", "production", "dispatch", "finance", "viewer"]


class BandUserMembershipBase(BaseModel):
    band_id: str
    user_id: str
    role: BandMembershipRole = "viewer"
    permissions: Dict[str, bool] = Field(default_factory=dict)
    is_primary_owner: bool = False
    status: MembershipStatus = "active"


class BandUserMembershipCreate(BaseModel):
    user_id: str
    role: BandMembershipRole = "viewer"
    permissions: Dict[str, bool] = Field(default_factory=dict)
    is_primary_owner: bool = False
    status: MembershipStatus = "active"


class BandUserMembershipUpdate(BaseModel):
    role: Optional[BandMembershipRole] = None
    permissions: Optional[Dict[str, bool]] = None
    is_primary_owner: Optional[bool] = None
    status: Optional[MembershipStatus] = None


class BandUserMembership(BandUserMembershipBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    invited_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PrinterUserMembershipBase(BaseModel):
    printer_id: str
    user_id: str
    role: PrinterMembershipRole = "viewer"
    permissions: Dict[str, bool] = Field(default_factory=dict)
    is_primary_owner: bool = False
    status: MembershipStatus = "active"


class PrinterUserMembershipCreate(BaseModel):
    user_id: str
    role: PrinterMembershipRole = "viewer"
    permissions: Dict[str, bool] = Field(default_factory=dict)
    is_primary_owner: bool = False
    status: MembershipStatus = "active"


class PrinterUserMembershipUpdate(BaseModel):
    role: Optional[PrinterMembershipRole] = None
    permissions: Optional[Dict[str, bool]] = None
    is_primary_owner: Optional[bool] = None
    status: Optional[MembershipStatus] = None


class PrinterUserMembership(PrinterUserMembershipBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    invited_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class User(UserBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    avatar_url: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class UserWithMemberships(User):
    band_memberships: List[Dict[str, Any]] = Field(default_factory=list)
    printer_memberships: List[Dict[str, Any]] = Field(default_factory=list)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ------------ CREATOR / CREATOR ------------
class BandBase(BaseModel):
    name: str
    slug: str
    category: Optional[str] = ""
    bio: Optional[str] = ""
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    profile_image_url: Optional[str] = None
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    website_url: Optional[str] = ""
    socials: Dict[str, str] = Field(default_factory=dict)
    group_delivery: Dict[str, Any] = Field(default_factory=dict)
    visibility: CreatorVisibility = "unlisted"
    show_on_platform_gallery: bool = False
    gallery_logo_url: Optional[str] = None
    gallery_banner_url: Optional[str] = None
    gallery_display_name: Optional[str] = None
    allow_search_indexing: bool = False


class BandCreate(BandBase):
    pass


class Creator(BandBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    user_id: str
    status: AccountStatus = "pending"
    subscription_status: Literal["active", "inactive", "past_due"] = "inactive"
    monthly_fee: float = 19.99
    commission_rate: float = 0.15
    platform_commission_rate_percent: Optional[float] = None
    platform_commission_source: Optional[Literal["default", "creator_override", "monthly_package"]] = None
    monthly_package_enabled: bool = False
    monthly_package_name: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class BandUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    category: Optional[str] = None
    bio: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    profile_image_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website_url: Optional[str] = None
    socials: Optional[Dict[str, str]] = None
    group_delivery: Optional[Dict[str, Any]] = None
    visibility: Optional[CreatorVisibility] = None
    show_on_platform_gallery: Optional[bool] = None
    gallery_logo_url: Optional[str] = None
    gallery_banner_url: Optional[str] = None
    gallery_display_name: Optional[str] = None
    allow_search_indexing: Optional[bool] = None
    status: Optional[AccountStatus] = None
    subscription_status: Optional[Literal["active", "inactive", "past_due"]] = None
    monthly_fee: Optional[float] = None
    commission_rate: Optional[float] = None
    platform_commission_rate_percent: Optional[float] = None
    platform_commission_source: Optional[Literal["default", "creator_override", "monthly_package"]] = None
    monthly_package_enabled: Optional[bool] = None
    monthly_package_name: Optional[str] = None
    user_id: Optional[str] = None


# ------------ PRINTER ------------
class PrinterBase(BaseModel):
    company_name: str
    contact_email: EmailStr
    phone: Optional[str] = None
    business_phone: Optional[str] = None
    whatsapp: Optional[str] = None
    contact_person: Optional[str] = None
    trading_name: Optional[str] = None
    location: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None

    # Broad production categories.
    capabilities: List[str] = Field(default_factory=list)

    # Supported print method keys/names, e.g. dtf, sublimation, embroidery.
    print_methods: List[str] = Field(default_factory=list)

    # Supported print area tags, e.g. front, back, sleeve, neck_label, pocket.
    area_tags: List[str] = Field(default_factory=list)

    # Matrix rows:
    # [{method_key, area_tag, active, turnaround_time, notes}]
    capability_matrix: List[Dict[str, Any]] = Field(default_factory=list)

    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    profile_image_url: Optional[str] = None
    website_url: Optional[str] = None
    production_notes: Optional[str] = ""


class PrinterApplication(PrinterBase):
    pass


class Printer(PrinterBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    user_id: str
    status: AccountStatus = "pending"
    created_at: datetime = Field(default_factory=utcnow)




# ------------ PRINTER TEMPLATE PRICING ------------
PrinterPriceStatus = Literal["active", "pending", "archived"]


class PrinterTemplatePriceBase(BaseModel):
    product_template_id: str
    print_option_id: str
    print_area_id: Optional[str] = None
    blank_price: float = 0
    print_price: float = 0
    production_notes: Optional[str] = ""
    status: PrinterPriceStatus = "active"


class PrinterTemplatePriceCreate(PrinterTemplatePriceBase):
    pass


class PrinterTemplatePriceUpdate(BaseModel):
    product_template_id: Optional[str] = None
    print_option_id: Optional[str] = None
    print_area_id: Optional[str] = None
    blank_price: Optional[float] = None
    print_price: Optional[float] = None
    production_notes: Optional[str] = None
    status: Optional[PrinterPriceStatus] = None


class PrinterTemplatePrice(PrinterTemplatePriceBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    printer_id: str
    total_price: float = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ------------ ATTRIBUTE ------------
class Attribute(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    name: str
    slug: str
    values: List[str] = Field(default_factory=list)
    used_for_variation: bool = True
    created_at: datetime = Field(default_factory=utcnow)


class AttributeCreate(BaseModel):
    name: str
    values: List[str] = Field(default_factory=list)
    used_for_variation: bool = True


class AttributeUpdate(BaseModel):
    name: Optional[str] = None
    values: Optional[List[str]] = None
    used_for_variation: Optional[bool] = None


# ------------ CATEGORY ------------
class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    name: str
    slug: str


class CategoryCreate(BaseModel):
    name: str


class CategoryUpdate(BaseModel):
    name: Optional[str] = None


# ------------ PRINT OPTIONS ------------
PrintOptionStatus = Literal["active", "draft", "archived"]
PrintOptionCalculationType = Literal["fixed", "area_from_sheet", "area_fixed_rate", "sheet"]


class PrintOptionBase(BaseModel):
    # New pricing-rule identity. This is the human/admin-facing title.
    rule_name: Optional[str] = None

    # Backward-compatible legacy fields used throughout templates/products.
    # For new dynamic rules, print_method can equal rule_name and print_size can be generated.
    print_method: str
    print_size: str
    print_cost_max: float = 0
    print_positions: List[str] = Field(default_factory=list)

    # Method category / production metadata.
    method_key: Optional[str] = None
    standard_print_size_key: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    dpi: int = 300
    fit_mode: str = "contain"

    # Print cost calculation fields.
    calculation_type: Optional[str] = None
    sheet_width_mm: Optional[float] = None
    sheet_height_mm: Optional[float] = None
    sheet_cost: Optional[float] = None
    cost_per_cm2: Optional[float] = None
    minimum_print_cost: Optional[float] = None
    waste_percentage: Optional[float] = None
    markup_percentage: Optional[float] = None
    pricing_notes: Optional[str] = None
    rule_name: Optional[str] = None
    status: Optional[str] = None

    production_notes: Optional[str] = ""

    # Pricing calculation model.
    calculation_type: PrintOptionCalculationType = "fixed"
    sheet_width_mm: Optional[float] = None
    sheet_height_mm: Optional[float] = None
    sheet_cost: float = 0
    cost_per_cm2: float = 0
    minimum_print_cost: float = 0
    waste_percentage: float = 0
    markup_percentage: float = 0
    pricing_notes: Optional[str] = ""

    slug: Optional[str] = None
    status: PrintOptionStatus = "active"


class PrintOptionCreate(PrintOptionBase):
    pass


class PrintOptionUpdate(BaseModel):
    rule_name: Optional[str] = None

    print_method: Optional[str] = None
    print_size: Optional[str] = None
    print_cost_max: Optional[float] = None
    print_positions: Optional[List[str]] = None

    method_key: Optional[str] = None
    standard_print_size_key: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    dpi: Optional[int] = None
    fit_mode: Optional[str] = None
    production_notes: Optional[str] = None

    calculation_type: Optional[PrintOptionCalculationType] = None
    sheet_width_mm: Optional[float] = None
    sheet_height_mm: Optional[float] = None
    sheet_cost: Optional[float] = None
    cost_per_cm2: Optional[float] = None
    minimum_print_cost: Optional[float] = None
    waste_percentage: Optional[float] = None
    markup_percentage: Optional[float] = None
    pricing_notes: Optional[str] = None

    slug: Optional[str] = None
    status: Optional[PrintOptionStatus] = None


class PrintOption(PrintOptionBase):
    id: str = Field(default_factory=uid)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ------------ PRODUCT TYPE BLUEPRINT ------------
class ProductTypeBaseView(BaseModel):
    """
    Base visual/product view available for a product family.

    Product Types define views only. They do not own supplier-specific
    print areas, printable dimensions, costs, SKUs or print methods.
    Those belong to Product Templates and Template Variations.
    """

    id: str = Field(default_factory=uid)
    name: str
    view_key: str = "front"
    sort_order: int = 0
    is_primary: bool = False
    notes: Optional[str] = None


class ProductTypeBase(BaseModel):
    """
    Reusable production blueprint for a type of product.

    Examples:
    - Adult T-Shirt
    - Hoodie
    - Mug
    - Cap
    - Canvas
    - Water Bottle

    Product Templates inherit/copy these defaults, then add supplier-specific
    colours, sizes, costs, SKUs and variation image overrides.
    """

    name: str
    slug: Optional[str] = None
    description: Optional[str] = ""

    category: Optional[str] = ""
    category_id: Optional[str] = None

    # Correct Product Type ownership:
    # Product Types define reusable base views only.
    base_views: List[ProductTypeBaseView] = Field(default_factory=list)
    default_variation_axes: List[str] = Field(default_factory=list)
    supports_printing: bool = True
    supports_mockups: bool = True
    requires_template: bool = True

    # Legacy compatibility only.
    # Do not use these as the source of truth for production print areas.
    # Product Templates own mockup screens and print areas.
    mockup_screens: List["ProductTemplateMockupScreen"] = Field(default_factory=list)
    print_areas: List["ProductTemplatePrintArea"] = Field(default_factory=list)

    attribute_ids: List[str] = Field(default_factory=list)
    default_attribute_values: dict = Field(default_factory=dict)

    print_option_ids: List[str] = Field(default_factory=list)
    allowed_print_size_keys: List[str] = Field(default_factory=list)

    supports_neck_label: bool = False
    supports_sleeves: bool = False
    supports_wraparound: bool = False

    status: TemplateStatus = "active"


class ProductTypeCreate(ProductTypeBase):
    pass


class ProductTypeUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None

    category: Optional[str] = None
    category_id: Optional[str] = None

    base_views: Optional[List[ProductTypeBaseView]] = None
    default_variation_axes: Optional[List[str]] = None
    supports_printing: Optional[bool] = None
    supports_mockups: Optional[bool] = None
    requires_template: Optional[bool] = None

    # Legacy compatibility only.
    mockup_screens: Optional[List["ProductTemplateMockupScreen"]] = None
    print_areas: Optional[List["ProductTemplatePrintArea"]] = None

    attribute_ids: Optional[List[str]] = None
    default_attribute_values: Optional[dict] = None

    print_option_ids: Optional[List[str]] = None
    allowed_print_size_keys: Optional[List[str]] = None

    supports_neck_label: Optional[bool] = None
    supports_sleeves: Optional[bool] = None
    supports_wraparound: Optional[bool] = None

    status: Optional[TemplateStatus] = None


class ProductType(ProductTypeBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    slug: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)



# ------------ PRODUCT TEMPLATE ------------
TemplateStatus = Literal["active", "draft", "archived"]


class ProductTemplateSizeChart(BaseModel):
    enabled: bool = False
    title: str = "Size Guide"
    unit: str = "cm"
    columns: List[str] = Field(default_factory=lambda: ["Size", "Chest", "Length"])
    rows: List[List[str]] = Field(default_factory=list)
    notes: Optional[str] = ""


class ProductTemplateGalleryImage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    name: Optional[str] = ""
    image_url: str
    role: Literal[
        "catalogue_thumbnail",
        "creator_selection",
        "editor_background",
        "front_mockup",
        "back_mockup",
        "side_mockup",
        "angled_mockup",
        "full_wrap_editor",
        "size_guide",
        "gallery",
    ] = "gallery"
    view_key: Optional[str] = None
    source_print_area_id: Optional[str] = None
    derived_from_artwork_mode: Optional[str] = None
    crop: Dict[str, float] = Field(default_factory=dict)
    sort_order: int = 0
    is_primary: bool = False
    status: Literal["active", "draft", "archived"] = "active"


class ProductTemplateMockupScreen(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    name: str
    view: str = "front"
    view_key: Optional[str] = None
    role: Optional[str] = None
    image_url: Optional[str] = None
    width_px: Optional[float] = None
    height_px: Optional[float] = None
    source_print_area_id: Optional[str] = None
    derived_from_artwork_mode: Optional[str] = None
    crop: Dict[str, float] = Field(default_factory=dict)
    sort_order: int = 0
    is_primary: bool = False
    status: Literal["active", "draft", "archived"] = "active"


class ProductTemplatePrintArea(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    name: str
    screen_id: Optional[str] = None
    screen_view: Optional[str] = None
    view_key: Optional[str] = None
    area_key: Optional[str] = None
    print_size: Optional[str] = None
    standard_print_size_key: Optional[str] = None
    x: float = 0
    x_pct: Optional[float] = None
    y: float = 0
    y_pct: Optional[float] = None
    width: float = 0
    width_pct: Optional[float] = None
    height: float = 0
    height_pct: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None

    # V2 printable geometry. Percentage placement remains the bounding box;
    # these fields define how creator artwork is clipped inside that box.
    geometry_type: Literal["rectangle", "circle", "ellipse", "polygon", "mask"] = "rectangle"
    shape_type: Optional[str] = None
    clip_shape: Optional[str] = None
    polygon_points: List[Dict[str, float]] = Field(default_factory=list)
    mask_url: Optional[str] = None
    clip_mask_url: Optional[str] = None
    bleed_mm: float = 0
    safe_margin_mm: float = 0
    rotation_deg: float = 0
    pricing_area_mode: Literal["bounding_box", "shape"] = "bounding_box"

    dpi: int = 300
    fit_mode: str = "contain"
    required: bool = False
    allowed_print_option_ids: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    status: Literal["active", "draft", "archived"] = "active"


class ProductTemplatePrintOption(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    print_method: Optional[str] = None
    method: Optional[str] = None
    method_key: Optional[str] = None
    print_size: Optional[str] = None
    print_area_id: Optional[str] = None

    # Legacy field. Kept for backwards compatibility.
    print_cost_max: float = 0

    # Correct costing split:
    # platform_print_cost is the true internal/production cost.
    # creator_print_price is the cost charged into the creator product builder.
    platform_print_cost: Optional[float] = None
    creator_print_price: Optional[float] = None
    platform_print_markup_type: Optional[Literal["manual", "percentage", "fixed_amount"]] = "manual"
    platform_print_markup_value: Optional[float] = 0
    platform_print_profit: Optional[float] = None
    platform_print_margin_percent: Optional[float] = None

    print_positions: List[str] = Field(default_factory=list)

    standard_print_size_key: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    dpi: int = 300
    fit_mode: str = "contain"
    production_notes: Optional[str] = ""


class ProductTemplateVariation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    sku: Optional[str] = None
    attributes: Dict[str, str] = Field(default_factory=dict)

    # Legacy fields. Kept for backwards compatibility.
    cost: float = 0
    base_blank_cost: Optional[float] = None

    # Correct blank costing split:
    # platform_blank_cost is the true internal/supplier blank cost.
    # creator_blank_price is the blank cost charged to the creator.
    platform_blank_cost: Optional[float] = None
    creator_blank_price: Optional[float] = None
    platform_blank_markup_type: Optional[Literal["manual", "percentage", "fixed_amount"]] = "manual"
    platform_blank_markup_value: Optional[float] = 0
    platform_blank_profit: Optional[float] = None
    platform_blank_margin_percent: Optional[float] = None

    supplier_sku: Optional[str] = None
    image_url: Optional[str] = None
    mockup_screen_overrides: Dict[str, str] = Field(default_factory=dict)
    print_area_overrides: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    enabled: bool = True
    sort_order: int = 0
    status: Literal["active", "draft", "archived"] = "active"


class ProductTemplateBase(BaseModel):
    name: str
    slug: Optional[str] = None
    product_type_id: Optional[str] = None
    category: str
    category_id: Optional[str] = None
    description: Optional[str] = ""

    brand: Optional[str] = ""
    blank_sku: Optional[str] = ""
    supplier_name: Optional[str] = ""
    supplier_url: Optional[str] = ""
    supplier_notes: Optional[str] = ""

    # Status and catalogue visibility are independent controls.
    creator_visible: bool = True
    admin_visible: bool = True

    size_chart: ProductTemplateSizeChart = Field(default_factory=ProductTemplateSizeChart)

    # Legacy template-level fallback pricing.
    base_price: float = 0
    base_blank_cost: float = 0

    # Correct template-level default costing.
    # Variant-level values should override these.
    platform_blank_cost: Optional[float] = None
    creator_blank_price: Optional[float] = None
    platform_blank_markup_type: Optional[Literal["manual", "percentage", "fixed_amount"]] = "manual"
    platform_blank_markup_value: Optional[float] = 0

    product_mode: Literal["template_printed", "simple_manual"] = "template_printed"
    production_mode: Literal["printed_from_template", "manual_no_template"] = "printed_from_template"
    requires_artwork: bool = True
    supports_printing: bool = True
    supports_mockups: bool = True

    mockup_url: Optional[str] = None
    product_image_url: Optional[str] = None
    mockup_images: List[str] = Field(default_factory=list)
    template_gallery: List[ProductTemplateGalleryImage] = Field(default_factory=list)
    artwork_modes: List[Literal["single_area", "front_back", "full_wrap"]] = Field(default_factory=list)
    mockup_screens: List[ProductTemplateMockupScreen] = Field(default_factory=list)

    available_sizes: List[str] = Field(default_factory=list)
    available_colors: List[str] = Field(default_factory=list)

    attribute_ids: List[str] = Field(default_factory=list)
    selected_attribute_values: dict = Field(default_factory=dict)

    # Attribute-owned variation production profiles.
    # Example: colour owns editor images while size owns print geometry.
    variation_inheritance: Dict[str, Any] = Field(default_factory=dict)
    attribute_image_profiles: Dict[str, Any] = Field(default_factory=dict)
    attribute_production_profiles: Dict[str, Any] = Field(default_factory=dict)

    variations: List[ProductTemplateVariation] = Field(default_factory=list)

    print_option_ids: List[str] = Field(default_factory=list)
    print_options: List[ProductTemplatePrintOption] = Field(default_factory=list)
    print_areas: List[ProductTemplatePrintArea] = Field(default_factory=list)

    status: TemplateStatus = "active"


class ProductTemplateCreate(ProductTemplateBase):
    pass


class ProductTemplateUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    product_type_id: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    description: Optional[str] = None

    brand: Optional[str] = None
    blank_sku: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_url: Optional[str] = None
    supplier_notes: Optional[str] = None
    creator_visible: Optional[bool] = None
    admin_visible: Optional[bool] = None
    size_chart: Optional[ProductTemplateSizeChart] = None

    base_price: Optional[float] = None
    base_blank_cost: Optional[float] = None

    platform_blank_cost: Optional[float] = None
    creator_blank_price: Optional[float] = None
    platform_blank_markup_type: Optional[Literal["manual", "percentage", "fixed_amount"]] = None
    platform_blank_markup_value: Optional[float] = None

    product_mode: Optional[Literal["template_printed", "simple_manual"]] = None
    production_mode: Optional[Literal["printed_from_template", "manual_no_template"]] = None
    requires_artwork: Optional[bool] = None
    supports_printing: Optional[bool] = None
    supports_mockups: Optional[bool] = None

    mockup_url: Optional[str] = None
    product_image_url: Optional[str] = None
    mockup_images: Optional[List[str]] = None
    template_gallery: Optional[List[ProductTemplateGalleryImage]] = None
    artwork_modes: Optional[List[Literal["single_area", "front_back", "full_wrap"]]] = None
    mockup_screens: Optional[List[ProductTemplateMockupScreen]] = None

    available_sizes: Optional[List[str]] = None
    available_colors: Optional[List[str]] = None

    attribute_ids: Optional[List[str]] = None
    selected_attribute_values: Optional[dict] = None
    variation_inheritance: Optional[Dict[str, Any]] = None
    attribute_image_profiles: Optional[Dict[str, Any]] = None
    attribute_production_profiles: Optional[Dict[str, Any]] = None
    variations: Optional[List[ProductTemplateVariation]] = None

    print_option_ids: Optional[List[str]] = None
    print_options: Optional[List[ProductTemplatePrintOption]] = None
    print_areas: Optional[List[ProductTemplatePrintArea]] = None

    status: Optional[TemplateStatus] = None


class ProductTemplate(ProductTemplateBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    slug: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ------------ ARTWORK ------------
ArtworkPlacement = Literal["front", "back", "sleeve", "left_chest", "right_chest", "other"]
ArtworkStatus = Literal["pending", "approved", "rejected"]


class ArtworkFile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    product_id: str
    file_url: str
    file_name: str
    placement: ArtworkPlacement = "front"
    notes: Optional[str] = ""
    dimensions: Optional[str] = None
    dpi: int = 300
    status: ArtworkStatus = "pending"
    created_at: datetime = Field(default_factory=utcnow)


# ------------ PRODUCT ------------
class ProductVariation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    template_variation_id: Optional[str] = None
    sku: str = Field(default_factory=lambda: uid()[:8].upper())
    stock_status: Literal["in_stock", "limited_stock", "out_of_stock", "made_to_order"] = "made_to_order"
    price_override: Optional[float] = None
    effective_selling_price: Optional[float] = None
    effective_creator_amount: Optional[float] = None
    manual_pricing_override_active: bool = False
    attribute_values: Dict[str, str] = Field(default_factory=dict)
    size: Optional[str] = ""
    color: Optional[str] = ""


class ProductArtworkSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    original_url: Optional[str] = None
    original_width_px: Optional[float] = None
    original_height_px: Optional[float] = None
    artwork_aspect_ratio: Optional[float] = None
    placement_box_width_mm: Optional[float] = None
    placement_box_height_mm: Optional[float] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    status: Literal["pending_review", "approved", "rejected"] = "pending_review"
    notes: Optional[str] = None


class ProductArtworkPlacement(BaseModel):
    model_config = ConfigDict(extra="ignore")

    screen_id: Optional[str] = None
    print_area_id: Optional[str] = None
    x: float = 0
    y: float = 0
    width: float = 100
    height: float = 100
    rotation: float = 0
    scale: float = 1


class ProductArtworkSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    print_area_id: str
    print_option_id: Optional[str] = None
    screen_id: Optional[str] = None
    screen_view: Optional[str] = None

    # Phase 3 production metadata copied from the selected print area / print option.
    area_key: Optional[str] = None
    print_method: Optional[str] = None
    method_key: Optional[str] = None
    print_size: Optional[str] = None
    print_cost_max: float = 0
    print_width_mm: Optional[float] = None
    print_height_mm: Optional[float] = None
    print_area_width_mm: Optional[float] = None
    print_area_height_mm: Optional[float] = None
    artwork_width_mm: Optional[float] = None
    artwork_height_mm: Optional[float] = None
    charged_width_mm: Optional[float] = None
    charged_height_mm: Optional[float] = None
    charged_area_cm2: Optional[float] = None
    pricing_source: Optional[str] = None
    area_cm2: float = 0
    raw_print_cost: float = 0
    calculated_print_cost: float = 0

    # Correct print costing split copied/resolved from the template print option.
    platform_print_cost: Optional[float] = None
    creator_print_price: Optional[float] = None
    platform_print_profit: Optional[float] = None
    platform_print_margin_percent: Optional[float] = None

    calculation_type: Optional[str] = None
    cost_per_cm2: float = 0
    minimum_print_cost: float = 0
    waste_percentage: float = 0
    markup_percentage: float = 0
    standard_print_size_key: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    dpi: int = 300
    fit_mode: str = "contain"
    production_notes: Optional[str] = ""

    original_url: Optional[str] = None
    original_width_px: Optional[float] = None
    original_height_px: Optional[float] = None
    artwork_aspect_ratio: Optional[float] = None
    placement_box_width_mm: Optional[float] = None
    placement_box_height_mm: Optional[float] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    status: Literal["pending_review", "approved", "rejected"] = "pending_review"
    reviewed_by_user_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    rejection_reason: Optional[str] = None
    print_cost_override: Optional[float] = None
    print_cost_override_reason: Optional[str] = None
    print_cost_overridden_by: Optional[str] = None
    print_cost_overridden_at: Optional[datetime] = None
    placement: ProductArtworkPlacement = Field(default_factory=ProductArtworkPlacement)
    mockup_image_url: Optional[str] = None
    notes: Optional[str] = None
    sort_order: int = 0




class ProductArtworkGroup(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(default_factory=uid)
    label: str = "Default artwork"
    scope_type: Literal["all", "attribute", "variation", "custom"] = "all"
    attribute_key: Optional[str] = None
    attribute_value: Optional[str] = None
    variation_ids: List[str] = Field(default_factory=list)
    inherits_from: Optional[str] = None
    artworks: List[ProductArtworkSlot] = Field(default_factory=list)
    primary_mockup_image_url: Optional[str] = None
    derived_mockup_images: List[Dict[str, Any]] = Field(default_factory=list)
    sort_order: int = 0

class ProductBase(BaseModel):
    model_config = ConfigDict(extra="allow")

    title: str
    description: str = ""
    specs: str = ""
    category: str
    template_id: Optional[str] = None
    selling_price: float
    print_cost: float
    mockup_images: List[str] = Field(default_factory=list)
    mockup_image_url: Optional[str] = None
    primary_mockup_image_url: Optional[str] = None
    variations: List[ProductVariation] = Field(default_factory=list)
    attribute_ids: List[str] = Field(default_factory=list)
    spec_attributes: Dict[str, List[str]] = Field(default_factory=dict)
    customization_enabled: bool = False
    published: bool = False
    publish_on_approval: bool = False
    requires_creator_pricing_approval: bool = False
    creator_pricing_approval_status: Literal["not_required", "pending_creator_approval", "approved"] = "not_required"
    print_cost_override: Optional[float] = None
    print_cost_override_reason: Optional[str] = None
    print_cost_overridden_by: Optional[str] = None
    print_cost_overridden_at: Optional[str] = None
    pricing_override_approved: bool = False
    pricing_override_reason: Optional[str] = None
    pricing_override_by: Optional[str] = None
    pricing_override_at: Optional[str] = None
    pricing_override_role: Optional[str] = None
    manual_pricing_overrides: Dict[str, Any] = Field(default_factory=dict, exclude=True)
    artwork_review_status: Literal["not_required", "pending_review", "approved", "rejected"] = "not_required"
    artwork_review_notes: Optional[str] = None

    selected_template_variation_ids: List[str] = Field(default_factory=list)
    selected_print_area_id: Optional[str] = None
    selected_print_option_id: Optional[str] = None
    artwork: Optional[ProductArtworkSnapshot] = None
    placement: ProductArtworkPlacement = Field(default_factory=ProductArtworkPlacement)
    artworks: List[ProductArtworkSlot] = Field(default_factory=list)
    artwork_groups: List[ProductArtworkGroup] = Field(default_factory=list)

    product_mode: Literal["template_printed", "simple_manual"] = "template_printed"
    production_mode: Literal["printed_from_template", "manual_no_template"] = "printed_from_template"

    # Legacy estimate fields.
    estimated_blank_cost: float = 0
    estimated_print_cost: float = 0
    estimated_total_cost: float = 0

    # Correct platform/creator/customer costing split.
    platform_blank_cost: float = 0
    creator_blank_price: float = 0
    platform_print_cost: float = 0
    creator_print_price: float = 0
    creator_product_cost: float = 0
    customer_selling_price: Optional[float] = None
    platform_blank_profit: float = 0
    platform_print_profit: float = 0
    estimated_platform_profit: float = 0

    commission_rate: float = 0.15
    estimated_commission: float = 0
    estimated_creator_profit: float = 0
    effective_selling_price: Optional[float] = None
    effective_creator_amount: Optional[float] = None
    manual_pricing_override_active: bool = False


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    title: Optional[str] = None
    description: Optional[str] = None
    specs: Optional[str] = None
    category: Optional[str] = None
    template_id: Optional[str] = None
    selling_price: Optional[float] = None
    print_cost: Optional[float] = None
    mockup_images: Optional[List[str]] = None
    mockup_image_url: Optional[str] = None
    primary_mockup_image_url: Optional[str] = None
    variations: Optional[List[ProductVariation]] = None
    attribute_ids: Optional[List[str]] = None
    spec_attributes: Optional[Dict[str, List[str]]] = None
    customization_enabled: Optional[bool] = None
    published: Optional[bool] = None
    publish_on_approval: Optional[bool] = None
    requires_creator_pricing_approval: Optional[bool] = None
    creator_pricing_approval_status: Optional[Literal["not_required", "pending_creator_approval", "approved"]] = None
    print_cost_override: Optional[float] = None
    print_cost_override_reason: Optional[str] = None
    print_cost_overridden_by: Optional[str] = None
    print_cost_overridden_at: Optional[str] = None
    pricing_override_approved: Optional[bool] = None
    pricing_override_reason: Optional[str] = None
    pricing_override_by: Optional[str] = None
    pricing_override_at: Optional[str] = None
    pricing_override_role: Optional[str] = None
    manual_pricing_overrides: Optional[Dict[str, Any]] = None
    artwork_review_status: Optional[Literal["not_required", "pending_review", "approved", "rejected"]] = None
    artwork_review_notes: Optional[str] = None

    selected_template_variation_ids: Optional[List[str]] = None
    selected_print_area_id: Optional[str] = None
    selected_print_option_id: Optional[str] = None
    artwork: Optional[ProductArtworkSnapshot] = None
    placement: Optional[ProductArtworkPlacement] = None
    artworks: Optional[List[ProductArtworkSlot]] = None
    artwork_groups: Optional[List[ProductArtworkGroup]] = None

    product_mode: Optional[Literal["template_printed", "simple_manual"]] = None
    production_mode: Optional[Literal["printed_from_template", "manual_no_template"]] = None

    estimated_blank_cost: Optional[float] = None
    estimated_print_cost: Optional[float] = None
    estimated_total_cost: Optional[float] = None

    platform_blank_cost: Optional[float] = None
    creator_blank_price: Optional[float] = None
    platform_print_cost: Optional[float] = None
    creator_print_price: Optional[float] = None
    creator_product_cost: Optional[float] = None
    customer_selling_price: Optional[float] = None
    platform_blank_profit: Optional[float] = None
    platform_print_profit: Optional[float] = None
    estimated_platform_profit: Optional[float] = None

    commission_rate: Optional[float] = None
    estimated_commission: Optional[float] = None
    estimated_creator_profit: Optional[float] = None


class Product(ProductBase):
    model_config = ConfigDict(extra="allow")

    id: str = Field(default_factory=uid)
    band_id: str
    slug: str
    assigned_printer_id: Optional[str] = None
    created_by_user_id: Optional[str] = None
    created_by_role: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ------------ CART ------------
class Customization(BaseModel):
    model_config = ConfigDict(extra="ignore")

    preview_image: Optional[str] = None
    design_json: Dict[str, Any] = Field(default_factory=dict)
    text_entries: List[Dict[str, Any]] = Field(default_factory=list)
    uploaded_files: List[str] = Field(default_factory=list)
    placement: ArtworkPlacement = "front"


class CartItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    product_id: str
    product_title: str
    band_id: str
    variation_id: str
    size: str
    color: str
    mockup_url: Optional[str] = None
    unit_price: float
    quantity: int = 1
    customization: Optional[Customization] = None


# ------------ ORDER ------------
OrderStatus = Literal[
    "pending_payment",
    "paid",
    "awaiting_artwork_review",
    "sent_to_printer",
    "in_production",
    "ready_for_dispatch",
    "shipped",
    "completed",
    "cancelled",
    "refunded",
]


class ShippingAddress(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = ""
    line1: str
    line2: Optional[str] = ""
    city: str
    state: Optional[str] = ""
    postal_code: str
    country: str = "ZA"


class ProductionSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    template_id: Optional[str] = None
    template_name: Optional[str] = None
    template_category: Optional[str] = None
    blank_brand: Optional[str] = None
    blank_sku: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_url: Optional[str] = None
    supplier_notes: Optional[str] = None
    product_image_url: Optional[str] = None
    mockup_image_url: Optional[str] = None
    selected_template_variation_ids: List[str] = Field(default_factory=list)
    variation: Dict[str, Any] = Field(default_factory=dict)
    print_area: Dict[str, Any] = Field(default_factory=dict)
    print_option: Dict[str, Any] = Field(default_factory=dict)
    artwork: Dict[str, Any] = Field(default_factory=dict)
    artworks: List[Dict[str, Any]] = Field(default_factory=list)
    placement: Dict[str, Any] = Field(default_factory=dict)

    # Phase 3 platform-controlled costing.
    costing_model: Optional[str] = None
    costing_breakdown: Dict[str, Any] = Field(default_factory=dict)

    # Phase 3.8 capability/province printer assignment.
    assignment_model: Optional[str] = None
    delivery_province_key: Optional[str] = None
    assigned_printer: Dict[str, Any] = Field(default_factory=dict)
    printer_price_id_legacy_assignment: Optional[str] = None

    production_cost: float = 0
    printer_payout: float = 0
    creator_profit: float = 0
    platform_commission: float = 0


class OrderItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    product_id: str
    product_title: str
    band_id: str
    printer_id: Optional[str] = None
    variation_id: str
    size: str
    color: str
    quantity: int
    unit_price: float
    print_cost_unit: float
    commission_rate: float
    commission_amount: float
    band_earnings: float
    printer_payout: float
    customization: Optional[Customization] = None
    artwork_file_url: Optional[str] = None
    production_snapshot: Optional[ProductionSnapshot] = None
    production_status: Literal["pending", "accepted", "in_production", "ready", "shipped", "delivered"] = "pending"
    tracking_number: Optional[str] = None
    courier_name: Optional[str] = None
    tracking_url: Optional[str] = None
    waybill_number: Optional[str] = None
    dispatched_at: Optional[datetime] = None


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    order_number: str = Field(default_factory=lambda: f"MF-{uid()[:8].upper()}")
    tracking_token: str = Field(default_factory=uid)
    buyer_id: Optional[str] = None
    buyer_email: EmailStr
    items: List[OrderItem]
    subtotal: float
    shipping_total: float = 0
    total: float
    shipping_method_key: Optional[str] = None
    shipping_adapter_key: Optional[str] = None
    shipping_method_name: Optional[str] = None
    shipping_method_type: Optional[str] = None
    shipping_tracking_url_template: Optional[str] = None
    group_delivery_batch_date: Optional[str] = None
    group_delivery_interval_days: Optional[int] = None
    group_delivery_point_name: Optional[str] = None
    group_delivery_address_line_1: Optional[str] = None
    group_delivery_suburb: Optional[str] = None
    group_delivery_town: Optional[str] = None
    group_delivery_province: Optional[str] = None
    group_delivery_postal_code: Optional[str] = None
    group_delivery_customer_instructions: Optional[str] = None
    courier_name: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    waybill_number: Optional[str] = None
    shipped_at: Optional[datetime] = None
    shipping_address: ShippingAddress
    status: OrderStatus = "pending_payment"
    payment_id: Optional[str] = None
    payment_status: Literal["pending", "paid", "failed", "refunded"] = "pending"
    payment_provider: str = "mock"
    payment_reference: Optional[str] = None
    provider_payment_id: Optional[str] = None
    payment_details: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)




# ------------ ORDER EVENTS / ACTIVITY ------------
OrderEventAudience = Literal["admin", "creator", "printer", "buyer", "all"]
OrderEventKind = Literal[
    "order_created",
    "manual_order_created",
    "payment_updated",
    "order_status_changed",
    "production_status_changed",
    "printer_assigned",
    "tracking_updated",
    "artwork_reviewed",
    "internal_note",
    "system",
]


class OrderEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    order_id: Optional[str] = None
    order_number: Optional[str] = None
    order_item_id: Optional[str] = None
    product_id: Optional[str] = None
    product_title: Optional[str] = None
    band_id: Optional[str] = None
    printer_id: Optional[str] = None
    actor_user_id: Optional[str] = None
    actor_role: Optional[str] = None
    audience: List[OrderEventAudience] = Field(default_factory=lambda: ["admin"])
    kind: OrderEventKind = "system"
    title: str
    message: Optional[str] = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)


class OrderNoteCreate(BaseModel):
    message: str
    order_item_id: Optional[str] = None
    audience: List[OrderEventAudience] = Field(default_factory=lambda: ["admin"])


class CheckoutRequest(BaseModel):
    items: List[CartItem]
    shipping_address: ShippingAddress
    payment_provider: str = "mock"
    shipping_method_key: Optional[str] = None
    collection_slot_id: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    item_id: Optional[str] = None
    item_production_status: Optional[str] = None
    tracking_number: Optional[str] = None
    courier_name: Optional[str] = None
    tracking_url: Optional[str] = None
    waybill_number: Optional[str] = None


# ------------ PAYMENT ------------
class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    order_id: Optional[str] = None
    subscription_id: Optional[str] = None
    user_id: Optional[str] = None
    amount: float
    currency: str = "ZAR"
    provider: str = "mock"
    provider_reference: Optional[str] = None
    status: Literal["pending", "requires_action", "processing", "completed", "failed", "cancelled", "refunded", "partially_refunded"] = "pending"
    kind: Literal["order", "subscription"] = "order"
    created_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None


# ------------ SUBSCRIPTIONS / SAAS PLANS ------------
SubscriptionOwnerType = Literal["creator", "creator", "printer"]
SubscriptionPlanAudience = Literal["creator", "printer", "both"]
SubscriptionPlanStatus = Literal["active", "draft", "archived"]
SubscriptionBillingCycle = Literal["monthly", "quarterly", "annual", "manual"]
SubscriptionStatus = Literal["trial", "active", "past_due", "suspended", "cancelled", "free", "manual", "billing_setup_required", "requires_payment"]
SubscriptionPaymentMethod = Literal["manual", "manual_eft", "paystack", "free", "external"]


class SubscriptionPlanBase(BaseModel):
    name: str
    audience: SubscriptionPlanAudience = "creator"
    description: Optional[str] = ""
    monthly_price: float = 0
    billing_cycle: SubscriptionBillingCycle = "monthly"
    trial_days: int = 0
    status: SubscriptionPlanStatus = "active"
    sort_order: int = 100
    features: List[str] = Field(default_factory=list)
    limits: Dict[str, Any] = Field(default_factory=dict)
    module_overrides: Dict[str, bool] = Field(default_factory=dict)
    allow_product_publishing: bool = True
    allow_job_assignment: bool = True
    storefront_visible: bool = True
    checkout_enabled: bool = True


class SubscriptionPlanCreate(SubscriptionPlanBase):
    pass


class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = None
    audience: Optional[SubscriptionPlanAudience] = None
    description: Optional[str] = None
    monthly_price: Optional[float] = None
    billing_cycle: Optional[SubscriptionBillingCycle] = None
    trial_days: Optional[int] = None
    status: Optional[SubscriptionPlanStatus] = None
    sort_order: Optional[int] = None
    features: Optional[List[str]] = None
    limits: Optional[Dict[str, Any]] = None
    module_overrides: Optional[Dict[str, bool]] = None
    allow_product_publishing: Optional[bool] = None
    allow_job_assignment: Optional[bool] = None
    storefront_visible: Optional[bool] = None
    checkout_enabled: Optional[bool] = None


class SubscriptionPlan(SubscriptionPlanBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AccountSubscriptionBase(BaseModel):
    owner_type: SubscriptionOwnerType
    owner_id: str
    plan_id: Optional[str] = None
    status: SubscriptionStatus = "manual"
    payment_method: SubscriptionPaymentMethod = "manual"
    monthly_fee: float = 0
    billing_cycle: SubscriptionBillingCycle = "monthly"
    trial_ends_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    next_billing_date: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    suspended_at: Optional[datetime] = None
    last_payment_status: Optional[str] = "not_required"
    last_payment_at: Optional[datetime] = None
    notes: Optional[str] = ""
    can_publish_products: bool = True
    can_receive_jobs: bool = True
    storefront_visible: bool = True
    checkout_enabled: bool = True
    max_products: Optional[int] = None
    max_jobs_per_month: Optional[int] = None
    commission_rate_override: Optional[float] = None

    # Paystack owner subscription billing metadata. These fields must be part
    # of the response model so Admin → Billing can show the linked Paystack
    # plan/reference/subscription values instead of losing them during
    # response_model serialization.
    paystack_plan_code: Optional[str] = None
    paystack_plan_name: Optional[str] = None
    paystack_subscription_code: Optional[str] = None
    paystack_customer_code: Optional[str] = None
    paystack_authorization_code: Optional[str] = None
    paystack_email_token: Optional[str] = None
    paystack_reference: Optional[str] = None
    paystack_checkout_url: Optional[str] = None
    paystack_last_event: Optional[str] = None
    paystack_synced_at: Optional[datetime] = None


class AccountSubscriptionCreate(AccountSubscriptionBase):
    pass


class AccountSubscriptionAssign(BaseModel):
    owner_type: SubscriptionOwnerType
    owner_id: str
    plan_id: Optional[str] = None
    status: SubscriptionStatus = "active"
    payment_method: SubscriptionPaymentMethod = "manual"
    monthly_fee: Optional[float] = None
    billing_cycle: Optional[SubscriptionBillingCycle] = None
    trial_ends_at: Optional[datetime] = None
    next_billing_date: Optional[datetime] = None
    notes: Optional[str] = ""
    can_publish_products: Optional[bool] = None
    can_receive_jobs: Optional[bool] = None
    storefront_visible: Optional[bool] = None
    checkout_enabled: Optional[bool] = None
    max_products: Optional[int] = None
    max_jobs_per_month: Optional[int] = None
    commission_rate_override: Optional[float] = None


class AccountSubscriptionUpdate(BaseModel):
    plan_id: Optional[str] = None
    status: Optional[SubscriptionStatus] = None
    payment_method: Optional[SubscriptionPaymentMethod] = None
    monthly_fee: Optional[float] = None
    billing_cycle: Optional[SubscriptionBillingCycle] = None
    trial_ends_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    next_billing_date: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    suspended_at: Optional[datetime] = None
    last_payment_status: Optional[str] = None
    last_payment_at: Optional[datetime] = None
    notes: Optional[str] = None
    can_publish_products: Optional[bool] = None
    can_receive_jobs: Optional[bool] = None
    storefront_visible: Optional[bool] = None
    checkout_enabled: Optional[bool] = None
    max_products: Optional[int] = None
    max_jobs_per_month: Optional[int] = None
    commission_rate_override: Optional[float] = None
    paystack_plan_code: Optional[str] = None
    paystack_plan_name: Optional[str] = None
    paystack_subscription_code: Optional[str] = None
    paystack_customer_code: Optional[str] = None
    paystack_authorization_code: Optional[str] = None
    paystack_email_token: Optional[str] = None
    paystack_reference: Optional[str] = None
    paystack_checkout_url: Optional[str] = None
    paystack_last_event: Optional[str] = None
    paystack_synced_at: Optional[datetime] = None


class AccountSubscription(AccountSubscriptionBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class SubscriptionWithOwner(AccountSubscription):
    owner_name: Optional[str] = ""
    owner_email: Optional[str] = ""
    plan_name: Optional[str] = ""
    plan_description: Optional[str] = ""
    plan_currency: Optional[str] = "ZAR"


# Backwards-compatible legacy payment subscription model.
class Subscription(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    band_id: str
    amount: float = 19.99
    status: Literal["active", "past_due", "cancelled"] = "active"
    current_period_end: datetime
    created_at: datetime = Field(default_factory=utcnow)


# ------------ COMMISSION / PAYOUT ------------
class Commission(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    order_id: str
    order_item_id: str
    band_id: str
    amount: float
    rate: float
    created_at: datetime = Field(default_factory=utcnow)


class Payout(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    printer_id: str
    order_id: str
    order_item_id: str
    amount: float
    status: Literal["due", "paid"] = "due"
    created_at: datetime = Field(default_factory=utcnow)




# ------------ WALLET / PAYOUT LEDGER ------------
WalletOwnerType = Literal["creator", "creator", "printer", "platform"]
WalletTransactionType = Literal[
    "platform_commission",
    "creator_earning",
    "printer_payout",
    "adjustment",
    "refund",
    "reversal",
]
WalletTransactionStatus = Literal["pending", "available", "in_batch", "paid", "failed", "reversed"]
PayoutProvider = Literal["manual_eft", "paystack"]
PayoutBatchStatus = Literal["draft", "approved", "processing", "paid", "partial", "failed", "cancelled"]
PayoutProfileStatus = Literal["draft", "pending_verification", "verified", "failed", "disabled"]


class WalletTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    owner_type: WalletOwnerType
    owner_id: str
    order_id: Optional[str] = None
    order_number: Optional[str] = None
    order_item_id: Optional[str] = None
    amount: float
    currency: str = "ZAR"
    type: WalletTransactionType
    status: WalletTransactionStatus = "available"
    description: Optional[str] = ""
    source_collection: Optional[str] = None
    source_id: Optional[str] = None
    payout_batch_id: Optional[str] = None
    payout_batch_item_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    available_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None


class PayoutProfileBase(BaseModel):
    owner_type: WalletOwnerType
    owner_id: str
    provider: PayoutProvider = "manual_eft"
    account_name: str
    bank_name: Optional[str] = ""
    bank_code: Optional[str] = ""
    account_number: Optional[str] = ""
    paystack_recipient_code: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = ""
    verification_status: PayoutProfileStatus = "draft"
    notes: Optional[str] = ""
    is_default: bool = True


class PayoutProfileCreate(PayoutProfileBase):
    pass


class PayoutProfileUpdate(BaseModel):
    provider: Optional[PayoutProvider] = None
    account_name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_code: Optional[str] = None
    account_number: Optional[str] = None
    paystack_recipient_code: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    verification_status: Optional[PayoutProfileStatus] = None
    notes: Optional[str] = None
    is_default: Optional[bool] = None


class PayoutProfile(PayoutProfileBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PayoutBatchItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    owner_type: WalletOwnerType
    owner_id: str
    payout_profile_id: Optional[str] = None
    provider: PayoutProvider = "manual_eft"
    amount: float
    currency: str = "ZAR"
    wallet_transaction_ids: List[str] = Field(default_factory=list)
    status: Literal["pending", "processing", "paid", "failed"] = "pending"
    provider_reference: Optional[str] = None
    provider_transfer_code: Optional[str] = None
    failure_reason: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PayoutBatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    title: str
    provider: PayoutProvider = "manual_eft"
    status: PayoutBatchStatus = "draft"
    currency: str = "ZAR"
    items: List[PayoutBatchItem] = Field(default_factory=list)
    total_amount: float = 0
    created_by_user_id: Optional[str] = None
    approved_by_user_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    approved_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    notes: Optional[str] = ""


class PayoutBatchCreate(BaseModel):
    title: Optional[str] = None
    provider: PayoutProvider = "manual_eft"
    owner_type: Optional[WalletOwnerType] = None
    min_amount: float = 1


class PayoutBatchMarkPaid(BaseModel):
    payment_reference: Optional[str] = None
    notes: Optional[str] = None

# ------------ NOTIFICATIONS ------------
NotificationAudience = Literal["admin", "creator", "creator", "printer", "buyer", "customer", "all"]
NotificationType = Literal[
    "order",
    "production",
    "artwork",
    "note",
    "payment",
    "pricing",
    "system",
]


class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    recipient_user_id: Optional[str] = None
    recipient_role: Optional[str] = None
    recipient_email: Optional[EmailStr] = None
    title: str
    message: str = ""
    type: NotificationType = "system"
    event_kind: Optional[str] = None
    link_url: Optional[str] = None
    related_order_id: Optional[str] = None
    related_order_number: Optional[str] = None
    related_order_item_id: Optional[str] = None
    related_product_id: Optional[str] = None
    related_product_title: Optional[str] = None
    band_id: Optional[str] = None
    printer_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    read: bool = False
    read_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class NotificationUpdate(BaseModel):
    read: Optional[bool] = None


class NotificationEmail(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=uid)
    notification_id: Optional[str] = None
    recipient_user_id: Optional[str] = None
    recipient_email: EmailStr
    subject: str
    body: str
    status: Literal["queued", "sent", "failed", "cancelled"] = "queued"
    provider: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    sent_at: Optional[datetime] = None





# ------------ CHECKOUT SHIPPING METHODS ------------
ShippingMethodType = Literal["manual", "flat_rate", "free_shipping", "local_pickup", "bobgo", "courier_adapter", "collection", "batched_creator_delivery"]


class ShippingMethodConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str
    adapter_key: Optional[str] = None
    enabled: bool = False
    display_name: str
    description: Optional[str] = ""
    method_type: ShippingMethodType = "manual"
    sort_order: int = 100
    rate: float = 0
    free_shipping_threshold: Optional[float] = None
    zones: List[str] = Field(default_factory=list)
    public_config: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)


class ShippingMethodUpdate(BaseModel):
    adapter_key: Optional[str] = None
    enabled: Optional[bool] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    method_type: Optional[ShippingMethodType] = None
    sort_order: Optional[int] = None
    rate: Optional[float] = None
    free_shipping_threshold: Optional[float] = None
    zones: Optional[List[str]] = None
    public_config: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None




class ShippingSettingField(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str
    type: Literal["text", "textarea", "number", "password", "checkbox", "select"] = "text"
    label: str
    help: Optional[str] = ""
    placeholder: Optional[str] = ""
    options: List[Dict[str, Any]] = Field(default_factory=list)


class ShippingMethodAdapterDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str
    display_name: str
    description: Optional[str] = ""
    method_type: ShippingMethodType = "manual"
    supports_live_rates: bool = False
    supports_waybills: bool = False
    supports_tracking: bool = False
    supports_pickup: bool = False
    settings_schema: List[ShippingSettingField] = Field(default_factory=list)
    public_config_schema: List[ShippingSettingField] = Field(default_factory=list)


class CheckoutShippingQuoteRequest(BaseModel):
    items: List[CartItem] = Field(default_factory=list)
    subtotal: float = 0
    shipping_address: Optional[ShippingAddress] = None


class CheckoutShippingMethod(BaseModel):
    key: str
    adapter_key: Optional[str] = None
    enabled: bool = True
    display_name: str
    description: Optional[str] = ""
    method_type: ShippingMethodType = "manual"
    sort_order: int = 100
    rate: float = 0
    amount: float = 0
    label: Optional[str] = None
    tracking_url_template: Optional[str] = None
    public_config: Dict[str, Any] = Field(default_factory=dict)

    slots: List[Dict[str, Any]] = Field(default_factory=list)
    collection_location_name: Optional[str] = None
    collection_address: Optional[str] = None
    collection_instructions: Optional[str] = None
    group_delivery_batch_date: Optional[str] = None
    group_delivery_interval_days: Optional[int] = None
    group_delivery_point_name: Optional[str] = None
    group_delivery_address_line_1: Optional[str] = None
    group_delivery_suburb: Optional[str] = None
    group_delivery_town: Optional[str] = None
    group_delivery_province: Optional[str] = None
    group_delivery_postal_code: Optional[str] = None
    group_delivery_customer_instructions: Optional[str] = None

# ------------ CHECKOUT PAYMENT GATEWAYS ------------
PaymentGatewayMode = Literal["test", "live"]


class PaymentGatewayConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str
    enabled: bool = False
    display_name: str
    description: Optional[str] = ""
    mode: PaymentGatewayMode = "test"
    sort_order: int = 100
    public_config: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)
    secret_configured: bool = False


class PaymentGatewayUpdate(BaseModel):
    enabled: Optional[bool] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    mode: Optional[PaymentGatewayMode] = None
    sort_order: Optional[int] = None
    public_config: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None
    clear_secret_fields: List[str] = Field(default_factory=list)


class CheckoutPaymentCreate(BaseModel):
    order_id: str
    gateway_key: str



# ------------ PLATFORM PACKAGES / MODULE TOGGLES ------------
PlatformPackageKey = Literal["full_marketplace", "creator_sole_printer", "creator_storefronts", "catalog_only"]


class ModuleToggles(BaseModel):
    model_config = ConfigDict(extra="ignore")

    creators_enabled: bool = True
    printers_enabled: bool = True
    sole_printer_mode: bool = False
    product_templates_enabled: bool = True
    artwork_review_enabled: bool = True
    printer_marketplace_enabled: bool = True
    printer_auto_assignment_enabled: bool = True
    payouts_enabled: bool = True
    creator_subscriptions_enabled: bool = False
    printer_subscriptions_enabled: bool = False
    public_shop_enabled: bool = True
    manual_orders_enabled: bool = True
    shipping_enabled: bool = True
    bobgo_enabled: bool = False
    paystack_checkout_enabled: bool = True
    manual_eft_enabled: bool = True


class FeaturePackageDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str
    name: str
    description: Optional[str] = ""
    recommended_for: Optional[str] = ""
    toggles: ModuleToggles = Field(default_factory=ModuleToggles)


class PlatformPackageUpdate(BaseModel):
    platform_name: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    primary_color: Optional[str] = None
    package_key: Optional[str] = None
    modules: Optional[ModuleToggles] = None
    default_printer_id: Optional[str] = None


def default_theme_palettes() -> Dict[str, Dict[str, str]]:
    return {
        "light": {
            "background_color": "#FFFFFF",
            "page_text_color": "#111111",
            "surface_background_color": "#F7F7F8",
            "surface_text_color": "#111111",
            "card_background_color": "#FFFFFF",
            "card_text_color": "#111111",
            "card_border_color": "#D9DCE1",
            "muted_text_color": "#6B7280",
            "input_background_color": "#FFFFFF",
            "input_text_color": "#111111",
            "input_border_color": "#CDD1D6",
            "header_background_color": "#FFFFFF",
            "header_text_color": "#111111",
            "button_primary_background_color": "",
            "button_primary_text_color": "#FFFFFF",
            "button_primary_border_color": "",
            "button_alternate_background_color": "#111111",
            "button_alternate_text_color": "#FFFFFF",
            "button_alternate_border_color": "#111111",
            "button_secondary_border_color": "#CDD1D6",
        },
        "dark": {
            "background_color": "#0A0A0A",
            "page_text_color": "#FFFFFF",
            "surface_background_color": "#111111",
            "surface_text_color": "#FFFFFF",
            "card_background_color": "#161616",
            "card_text_color": "#FFFFFF",
            "card_border_color": "#343434",
            "muted_text_color": "#A3A3A3",
            "input_background_color": "#0F0F0F",
            "input_text_color": "#FFFFFF",
            "input_border_color": "#3A3A3A",
            "header_background_color": "#0A0A0A",
            "header_text_color": "#FFFFFF",
            "button_primary_background_color": "",
            "button_primary_text_color": "#FFFFFF",
            "button_primary_border_color": "",
            "button_alternate_background_color": "#FFFFFF",
            "button_alternate_text_color": "#000000",
            "button_alternate_border_color": "#FFFFFF",
            "button_secondary_border_color": "#444444",
        },
    }


class PublicPlatformConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    platform_name: str = "FandomForge"
    platform_tagline: str = "Merch made simple"
    currency: str = "ZAR"
    package_key: str = "full_marketplace"
    modules: ModuleToggles = Field(default_factory=ModuleToggles)
    support_email: Optional[str] = ""
    support_phone: Optional[str] = ""
    support_whatsapp: Optional[str] = ""
    logo_url: Optional[str] = ""
    favicon_url: Optional[str] = ""
    primary_color: Optional[str] = "#FF3B30"
    accent_color: Optional[str] = "#FF7A1A"
    storefront_theme_mode: Literal["light", "dark", "system"] = "light"
    admin_theme_mode: Literal["light", "dark", "system"] = "dark"
    allow_theme_toggle: bool = False
    theme_palettes: Dict[str, Dict[str, str]] = Field(default_factory=default_theme_palettes)
    country: str = "ZA"
    timezone: str = "Africa/Johannesburg"
    business_name: Optional[str] = ""
    business_registration: Optional[str] = ""
    public_contact_email: Optional[str] = ""
    public_contact_phone: Optional[str] = ""
    homepage: Dict[str, Any] = Field(default_factory=dict)
    homepage_sections: List[Dict[str, Any]] = Field(default_factory=list)
    signup: Dict[str, Any] = Field(default_factory=dict)
    policies: Dict[str, Any] = Field(default_factory=dict)

# ------------ SETTINGS ------------
class PlatformSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = "platform"
    default_commission_rate: float = 0.15
    default_monthly_band_fee: float = 19.99
    platform_name: str = "FandomForge"
    platform_tagline: str = "Merch made simple"
    currency: str = "ZAR"

    # Clone-ready instance branding and public content.
    logo_url: Optional[str] = ""
    favicon_url: Optional[str] = ""
    accent_color: str = "#FF7A1A"
    # Context-aware theme ownership. Flat fields below remain compatibility
    # fallbacks until every legacy component has migrated to semantic tokens.
    storefront_theme_mode: Literal["light", "dark", "system"] = "light"
    admin_theme_mode: Literal["light", "dark", "system"] = "dark"
    allow_theme_toggle: bool = False
    theme_palettes: Dict[str, Dict[str, str]] = Field(default_factory=default_theme_palettes)
    theme_mode: str = "dark"
    background_color: str = "#0A0A0A"
    page_text_color: str = ""
    surface_background_color: str = ""
    surface_text_color: str = ""
    card_background_color: str = ""
    card_text_color: str = ""
    card_border_color: str = ""
    muted_text_color: str = ""
    input_background_color: str = ""
    input_text_color: str = ""
    input_border_color: str = ""
    header_background_color: str = "#0A0A0A"
    header_text_color: str = "#FFFFFF"
    button_primary_background_color: str = "#FF3B30"
    button_primary_text_color: str = "#FFFFFF"
    button_primary_border_color: str = ""
    button_alternate_background_color: str = "#FFFFFF"
    button_alternate_text_color: str = "#000000"
    button_alternate_border_color: str = ""
    button_secondary_border_color: str = ""
    support_whatsapp: Optional[str] = ""
    business_name: Optional[str] = ""
    business_registration: Optional[str] = ""
    public_contact_email: Optional[str] = ""
    public_contact_phone: Optional[str] = ""
    homepage: Dict[str, Any] = Field(default_factory=dict)
    homepage_sections: List[Dict[str, Any]] = Field(default_factory=list)
    signup: Dict[str, Any] = Field(default_factory=dict)
    policies: Dict[str, Any] = Field(default_factory=dict)

    # SaaS deployment package / module controls.
    package_key: str = "full_marketplace"
    modules: ModuleToggles = Field(default_factory=ModuleToggles)
    support_email: Optional[str] = ""
    support_phone: Optional[str] = ""
    country: str = "ZA"
    timezone: str = "Africa/Johannesburg"
    primary_color: str = "#FF3B30"
    default_printer_id: Optional[str] = None

    # Payment / payout provider settings.
    # Stored in the platform settings document so admins can configure keys from the UI.
    # API responses should mask paystack_secret_key before returning to the browser.
    paystack_enabled: bool = False
    paystack_mode: Literal["test", "live"] = "test"
    paystack_public_key: Optional[str] = ""
    paystack_secret_key: Optional[str] = None
    paystack_secret_configured: bool = False

    # Buyer checkout gateway plugin settings. Secret fields are masked in API responses.
    payment_gateways: Dict[str, PaymentGatewayConfig] = Field(default_factory=dict)

    # Buyer checkout shipping method settings.
    shipping_methods: Dict[str, ShippingMethodConfig] = Field(default_factory=dict)
