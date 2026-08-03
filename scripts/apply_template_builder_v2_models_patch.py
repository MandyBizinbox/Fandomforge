#!/usr/bin/env python3
"""Apply the Product Template V2 persistence fields to backend/models.py.

This is a guarded, one-time branch patch. Every replacement must match exactly
once so an unexpected source change fails instead of silently corrupting the
model file.
"""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "backend" / "models.py"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"ABORT: expected exactly one {label} block, found {count}."
        )
    return source.replace(old, new, 1)


def main() -> None:
    source = MODELS.read_text(encoding="utf-8")

    if "class ProductTemplateGalleryImage(BaseModel):" in source:
        print("Product Template V2 model fields already applied.")
        return

    source = replace_once(
        source,
        '''class ProductTemplateMockupScreen(BaseModel):\n    model_config = ConfigDict(extra="ignore")\n\n    id: str = Field(default_factory=uid)\n    name: str\n    view: str = "front"\n    image_url: Optional[str] = None\n    width_px: Optional[float] = None\n    height_px: Optional[float] = None\n    sort_order: int = 0\n    is_primary: bool = False\n''',
        '''class ProductTemplateGalleryImage(BaseModel):\n    model_config = ConfigDict(extra="ignore")\n\n    id: str = Field(default_factory=uid)\n    name: Optional[str] = ""\n    image_url: str\n    role: Literal[\n        "catalogue_thumbnail",\n        "creator_selection",\n        "editor_background",\n        "front_mockup",\n        "back_mockup",\n        "side_mockup",\n        "angled_mockup",\n        "full_wrap_editor",\n        "size_guide",\n        "gallery",\n    ] = "gallery"\n    view_key: Optional[str] = None\n    source_print_area_id: Optional[str] = None\n    derived_from_artwork_mode: Optional[str] = None\n    crop: Dict[str, float] = Field(default_factory=dict)\n    sort_order: int = 0\n    is_primary: bool = False\n    status: Literal["active", "draft", "archived"] = "active"\n\n\nclass ProductTemplateMockupScreen(BaseModel):\n    model_config = ConfigDict(extra="ignore")\n\n    id: str = Field(default_factory=uid)\n    name: str\n    view: str = "front"\n    view_key: Optional[str] = None\n    role: Optional[str] = None\n    image_url: Optional[str] = None\n    width_px: Optional[float] = None\n    height_px: Optional[float] = None\n    source_print_area_id: Optional[str] = None\n    derived_from_artwork_mode: Optional[str] = None\n    crop: Dict[str, float] = Field(default_factory=dict)\n    sort_order: int = 0\n    is_primary: bool = False\n    status: Literal["active", "draft", "archived"] = "active"\n''',
        "mockup screen",
    )

    source = replace_once(
        source,
        '''    width_mm: Optional[float] = None\n    height_mm: Optional[float] = None\n    dpi: int = 300\n    fit_mode: str = "contain"\n    required: bool = False\n    allowed_print_option_ids: List[str] = Field(default_factory=list)\n    notes: Optional[str] = None\n''',
        '''    width_mm: Optional[float] = None\n    height_mm: Optional[float] = None\n\n    # V2 printable geometry. Percentage placement remains the bounding box;\n    # these fields define how creator artwork is clipped inside that box.\n    geometry_type: Literal["rectangle", "circle", "ellipse", "polygon", "mask"] = "rectangle"\n    shape_type: Optional[str] = None\n    clip_shape: Optional[str] = None\n    polygon_points: List[Dict[str, float]] = Field(default_factory=list)\n    mask_url: Optional[str] = None\n    clip_mask_url: Optional[str] = None\n    bleed_mm: float = 0\n    safe_margin_mm: float = 0\n    rotation_deg: float = 0\n    pricing_area_mode: Literal["bounding_box", "shape"] = "bounding_box"\n\n    dpi: int = 300\n    fit_mode: str = "contain"\n    required: bool = False\n    allowed_print_option_ids: List[str] = Field(default_factory=list)\n    notes: Optional[str] = None\n    status: Literal["active", "draft", "archived"] = "active"\n''',
        "print area geometry",
    )

    source = replace_once(
        source,
        '''    image_url: Optional[str] = None\n    mockup_screen_overrides: Dict[str, str] = Field(default_factory=dict)\n    enabled: bool = True\n''',
        '''    image_url: Optional[str] = None\n    mockup_screen_overrides: Dict[str, str] = Field(default_factory=dict)\n    print_area_overrides: Dict[str, Dict[str, Any]] = Field(default_factory=dict)\n    enabled: bool = True\n''',
        "variation print-area override",
    )

    source = replace_once(
        source,
        '''    supplier_name: Optional[str] = ""\n    supplier_url: Optional[str] = ""\n    supplier_notes: Optional[str] = ""\n    size_chart: ProductTemplateSizeChart = Field(default_factory=ProductTemplateSizeChart)\n''',
        '''    supplier_name: Optional[str] = ""\n    supplier_url: Optional[str] = ""\n    supplier_notes: Optional[str] = ""\n\n    # Status and catalogue visibility are independent controls.\n    creator_visible: bool = True\n    admin_visible: bool = True\n\n    size_chart: ProductTemplateSizeChart = Field(default_factory=ProductTemplateSizeChart)\n''',
        "template visibility base",
    )

    source = replace_once(
        source,
        '''    mockup_url: Optional[str] = None\n    product_image_url: Optional[str] = None\n    mockup_images: List[str] = Field(default_factory=list)\n    mockup_screens: List[ProductTemplateMockupScreen] = Field(default_factory=list)\n''',
        '''    mockup_url: Optional[str] = None\n    product_image_url: Optional[str] = None\n    mockup_images: List[str] = Field(default_factory=list)\n    template_gallery: List[ProductTemplateGalleryImage] = Field(default_factory=list)\n    artwork_modes: List[Literal["single_area", "front_back", "full_wrap"]] = Field(default_factory=list)\n    mockup_screens: List[ProductTemplateMockupScreen] = Field(default_factory=list)\n''',
        "template gallery base",
    )

    source = replace_once(
        source,
        '''    supplier_name: Optional[str] = None\n    supplier_url: Optional[str] = None\n    supplier_notes: Optional[str] = None\n    size_chart: Optional[ProductTemplateSizeChart] = None\n''',
        '''    supplier_name: Optional[str] = None\n    supplier_url: Optional[str] = None\n    supplier_notes: Optional[str] = None\n    creator_visible: Optional[bool] = None\n    admin_visible: Optional[bool] = None\n    size_chart: Optional[ProductTemplateSizeChart] = None\n''',
        "template visibility update",
    )

    source = replace_once(
        source,
        '''    mockup_url: Optional[str] = None\n    product_image_url: Optional[str] = None\n    mockup_images: Optional[List[str]] = None\n    mockup_screens: Optional[List[ProductTemplateMockupScreen]] = None\n''',
        '''    mockup_url: Optional[str] = None\n    product_image_url: Optional[str] = None\n    mockup_images: Optional[List[str]] = None\n    template_gallery: Optional[List[ProductTemplateGalleryImage]] = None\n    artwork_modes: Optional[List[Literal["single_area", "front_back", "full_wrap"]]] = None\n    mockup_screens: Optional[List[ProductTemplateMockupScreen]] = None\n''',
        "template gallery update",
    )

    MODELS.write_text(source, encoding="utf-8")
    print("Applied Product Template V2 persistence fields to backend/models.py")


if __name__ == "__main__":
    main()
