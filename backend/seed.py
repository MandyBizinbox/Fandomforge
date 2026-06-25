"""Seed demo data on startup if DB is empty."""
from datetime import datetime, timezone, timedelta
from models import (
    User, Creator, Printer, Product, ProductTemplate, ProductTemplatePrintArea,
    ProductTemplatePrintOption, ProductTemplateVariation, ProductTemplateMockupScreen, ProductVariation, ArtworkFile, PrintOption,
    Order, OrderItem, ShippingAddress, Category, PlatformSettings,
    Subscription, Payment, Commission, Payout, Attribute, uid, utcnow,
)
from auth import hash_password


def iso(d):
    out = dict(d)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


async def seed_if_empty(db):
    existing_users = await db.users.count_documents({})
    if existing_users > 0:
        return

    # Settings
    s = PlatformSettings()
    await db.settings.insert_one(s.model_dump())

    # Categories
    cats = ["T-Shirt", "Hoodie", "Poster", "Mug", "Tote Bag", "Vinyl"]
    for name in cats:
        c = Category(name=name, slug=name.lower().replace(" ", "-"))
        await db.categories.insert_one(c.model_dump())

    # Global Print Options / Admin price caps
    seed_print_options = [
        PrintOption(print_method="DTF", print_size="Pocket", print_positions=["left_chest", "right_chest", "sleeve"], print_cost_max=35, description="Small DTF transfer for pocket or sleeve placement."),
        PrintOption(print_method="DTF", print_size="A4", print_positions=["front", "back"], print_cost_max=70, description="Standard A4 DTF print."),
        PrintOption(print_method="DTF", print_size="A3", print_positions=["front", "back"], print_cost_max=110, description="Large A3 DTF print."),
        PrintOption(print_method="Embroidery", print_size="Left Chest", print_positions=["left_chest", "right_chest"], print_cost_max=90, description="Small embroidery position."),
        PrintOption(print_method="Sublimation", print_size="Mug Wrap", print_positions=["wrap"], print_cost_max=55, description="Full mug wrap sublimation."),
    ]
    print_option_ids = {}
    for option in seed_print_options:
        option.slug = option.print_method.lower().replace(" ", "-") + "-" + option.print_size.lower().replace(" ", "-")
        await db.print_options.insert_one(iso(option.model_dump()))
        print_option_ids[f"{option.print_method}:{option.print_size}"] = option.id

    # Product Templates / Admin Blank Catalog
    product_templates = [
        ProductTemplate(
            name="Classic T-Shirt",
            slug="classic-t-shirt",
            category="t-shirt",
            description="Standard cotton T-shirt blank for creator merch.",
            brand="Generic Cotton",
            blank_sku="TEE-CLASSIC",
            supplier_name="Preferred local blank supplier",
            supplier_url="",
            supplier_notes="Use equivalent 160gsm+ cotton blank when exact SKU is unavailable.",
            base_price=70.0,
            base_blank_cost=70.0,
            product_image_url="https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg",
            mockup_url="https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg",
            mockup_images=["https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg"],
            mockup_screens=[ProductTemplateMockupScreen(name="Front", code="front", screen_type="front", image_url="https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg")],
            print_option_ids=[print_option_ids["DTF:A4"], print_option_ids["DTF:A3"], print_option_ids["Embroidery:Left Chest"]],
            variations=[
                ProductTemplateVariation(attribute_values={"Size": "S", "Colour": "Black"}, blank_cost=70),
                ProductTemplateVariation(attribute_values={"Size": "M", "Colour": "White"}, blank_cost=70),
                ProductTemplateVariation(attribute_values={"Size": "L", "Colour": "Black"}, blank_cost=75),
            ],
            available_sizes=["S", "M", "L", "XL", "XXL"],
            available_colors=["Black", "White", "Charcoal"],
            print_areas=[
                ProductTemplatePrintArea(name="Front A4", code="front_a4", width_mm=210, height_mm=297, mockup_view="front"),
                ProductTemplatePrintArea(name="Back A3", code="back_a3", width_mm=297, height_mm=420, mockup_view="back"),
                ProductTemplatePrintArea(name="Left Chest", code="left_chest", width_mm=100, height_mm=100, mockup_view="front"),
            ],
            print_options=[
                ProductTemplatePrintOption(method="DTF", area_code="front_a4", max_printer_price=70, suggested_printer_price=55),
                ProductTemplatePrintOption(method="DTF", area_code="back_a3", max_printer_price=110, suggested_printer_price=90),
                ProductTemplatePrintOption(method="Embroidery", area_code="left_chest", max_printer_price=90, suggested_printer_price=75),
            ],
            status="active",
        ),
        ProductTemplate(
            name="Pullover Hoodie",
            slug="pullover-hoodie",
            category="hoodie",
            description="Midweight pullover hoodie blank for DTF or embroidery.",
            brand="Generic Fleece",
            blank_sku="HOODIE-PULLOVER",
            supplier_name="Preferred local blank supplier",
            supplier_url="",
            supplier_notes="Use black, navy, charcoal, and grey first where stock is available.",
            base_price=180.0,
            base_blank_cost=180.0,
            product_image_url="https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800",
            mockup_url="https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800",
            mockup_images=["https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800"],
            mockup_screens=[ProductTemplateMockupScreen(name="Front", code="front", screen_type="front", image_url="https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800")],
            print_option_ids=[print_option_ids["DTF:A4"], print_option_ids["DTF:A3"], print_option_ids["Embroidery:Left Chest"]],
            variations=[
                ProductTemplateVariation(attribute_values={"Size": "S", "Colour": "Black"}, blank_cost=180),
                ProductTemplateVariation(attribute_values={"Size": "M", "Colour": "Navy"}, blank_cost=185),
                ProductTemplateVariation(attribute_values={"Size": "L", "Colour": "Grey"}, blank_cost=190),
            ],
            available_sizes=["S", "M", "L", "XL", "XXL"],
            available_colors=["Black", "Navy", "Charcoal", "Grey"],
            print_areas=[
                ProductTemplatePrintArea(name="Front A4", code="front_a4", width_mm=210, height_mm=297, mockup_view="front"),
                ProductTemplatePrintArea(name="Back A3", code="back_a3", width_mm=297, height_mm=420, mockup_view="back"),
                ProductTemplatePrintArea(name="Left Chest", code="left_chest", width_mm=100, height_mm=100, mockup_view="front"),
            ],
            print_options=[
                ProductTemplatePrintOption(method="DTF", area_code="front_a4", max_printer_price=80, suggested_printer_price=65),
                ProductTemplatePrintOption(method="DTF", area_code="back_a3", max_printer_price=125, suggested_printer_price=100),
                ProductTemplatePrintOption(method="Embroidery", area_code="left_chest", max_printer_price=100, suggested_printer_price=85),
            ],
            status="active",
        ),
        ProductTemplate(
            name="Ceramic Mug",
            slug="ceramic-mug",
            category="mug",
            description="White ceramic mug suitable for sublimation.",
            brand="Generic Ceramic",
            blank_sku="MUG-WHITE-11OZ",
            supplier_name="Preferred local blank supplier",
            supplier_url="",
            supplier_notes="Use 11oz sublimation-coated ceramic mug.",
            base_price=35.0,
            base_blank_cost=35.0,
            product_image_url="https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800",
            mockup_url="https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800",
            mockup_images=["https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800"],
            mockup_screens=[ProductTemplateMockupScreen(name="Wrap", code="wrap", screen_type="other", image_url="https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800")],
            print_option_ids=[print_option_ids["Sublimation:Mug Wrap"]],
            variations=[ProductTemplateVariation(attribute_values={"Size": "11oz", "Colour": "White"}, blank_cost=35)],
            available_sizes=["11oz"],
            available_colors=["White"],
            print_areas=[
                ProductTemplatePrintArea(name="Wrap Print", code="wrap", width_mm=210, height_mm=90, mockup_view="wrap"),
            ],
            print_options=[
                ProductTemplatePrintOption(method="Sublimation", area_code="wrap", max_printer_price=55, suggested_printer_price=45),
            ],
            status="active",
        ),
    ]

    for template in product_templates:
        doc = iso(template.model_dump())
        await db.product_templates.insert_one(doc)

    # Attributes (global, admin-managed)
    seed_attrs = [
        {"name": "Size", "values": ["S", "M", "L", "XL", "XXL"], "used_for_variation": True},
        {"name": "Color", "values": ["Black", "White", "Red", "Forest Green", "Charcoal"], "used_for_variation": True},
        {"name": "Material", "values": ["100% Cotton", "Organic Cotton", "Heavyweight Cotton"], "used_for_variation": False},
        {"name": "Fit", "values": ["Regular", "Oversized", "Slim"], "used_for_variation": False},
    ]
    attr_id_by_name = {}
    for a in seed_attrs:
        attr = Attribute(name=a["name"], slug=a["name"].lower().replace(" ", "-"), values=a["values"], used_for_variation=a["used_for_variation"])
        doc = attr.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.attributes.insert_one(doc)
        attr_id_by_name[a["name"]] = attr.id

    # ---- Admin user ----
    admin = User(email="admin@fandomforge.com", name="Platform Admin", role="super_admin", status="active")
    await db.users.insert_one({**iso(admin.model_dump()), "password_hash": hash_password("Admin123!")})

    # ---- Creators ----
    band_specs = [
        {
            "email": "neon@fandomforge.com", "password": "Band123!",
            "name": "Neon Graves", "slug": "neon-graves",
            "bio": "Post-punk trio from Johannesburg. Loud, loud, loud.",
            "logo_url": "https://images.unsplash.com/photo-1571455786673-9d9d6c194f90?w=400",
            "banner_url": "https://images.pexels.com/photos/11963130/pexels-photo-11963130.png",
            "socials": {"instagram": "neongraves", "twitter": "neongraves"},
        },
        {
            "email": "ashen@fandomforge.com", "password": "Band123!",
            "name": "Ashen Tide", "slug": "ashen-tide",
            "bio": "Doom metal from Cape Town. Slow riffs, heavy feels.",
            "logo_url": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400",
            "banner_url": "https://images.unsplash.com/photo-1692271931628-adc2b16670dd",
            "socials": {"instagram": "ashentide"},
        },
        {
            "email": "silverwolf@fandomforge.com", "password": "Band123!",
            "name": "Silverwolf", "slug": "silverwolf",
            "bio": "Indie rock four-piece. Pretenders vibes with teeth.",
            "logo_url": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400",
            "banner_url": "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1600",
            "socials": {"instagram": "silverwolfza"},
        },
    ]

    band_ids = []
    for idx, b in enumerate(band_specs):
        u = User(email=b["email"], name=b["name"], role="creator", status="active")
        await db.users.insert_one({**iso(u.model_dump()), "password_hash": hash_password(b["password"])})
        creator = Creator(
            user_id=u.id, name=b["name"], slug=b["slug"], bio=b["bio"],
            logo_url=b["logo_url"], banner_url=b["banner_url"], socials=b["socials"],
            status="active", subscription_status="active", commission_rate=0.15,
        )
        doc = iso(creator.model_dump())
        await db.creators.insert_one(doc)
        band_ids.append(creator.id)
        # Subscription
        sub = Subscription(
            band_id=creator.id, amount=19.99, status="active",
            current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
        )
        await db.subscriptions.insert_one(iso(sub.model_dump()))

    # ---- Printers ----
    printer_specs = [
        {"email": "ink@fandomforge.com", "password": "Printer123!", "company_name": "Ink Society",
         "contact_email": "ink@fandomforge.com", "phone": "+27 21 000 0001", "location": "Cape Town",
         "capabilities": ["DTG", "Screen Print", "Hoodies"]},
        {"email": "pressworks@fandomforge.com", "password": "Printer123!", "company_name": "PressWorks JHB",
         "contact_email": "pressworks@fandomforge.com", "phone": "+27 11 000 0002", "location": "Johannesburg",
         "capabilities": ["Screen Print", "Posters"]},
        {"email": "totem@fandomforge.com", "password": "Printer123!", "company_name": "Totem Fulfilment",
         "contact_email": "totem@fandomforge.com", "phone": "+27 31 000 0003", "location": "Durban",
         "capabilities": ["DTG", "Tote Bags", "Mugs"]},
    ]
    printer_ids = []
    for p in printer_specs:
        u = User(email=p["email"], name=p["company_name"], role="printer", status="active")
        await db.users.insert_one({**iso(u.model_dump()), "password_hash": hash_password(p["password"])})
        pr = Printer(
            user_id=u.id, company_name=p["company_name"], contact_email=p["contact_email"],
            phone=p["phone"], location=p["location"], capabilities=p["capabilities"],
            status="active",
        )
        await db.printers.insert_one(iso(pr.model_dump()))
        printer_ids.append(pr.id)

    # ---- Buyer account ----
    buyer = User(email="fan@fandomforge.com", name="Music Fan", role="buyer", status="active")
    await db.users.insert_one({**iso(buyer.model_dump()), "password_hash": hash_password("Fan123!")})

    # ---- Products ----
    mockup_tees = [
        "https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg",
        "https://images.unsplash.com/photo-1571455786673-9d9d6c194f90?w=800",
        "https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?w=800",
        "https://images.unsplash.com/photo-1620799139652-715e4d5b2c96?w=800",
    ]
    mockup_hoodie = "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800"

    products_plan = [
        ("Neon Graves — Cathedral Tee", "t-shirt", 45.0, 14.0, 0,
         "Heavy cotton tee, cathedral artwork on front.", True, [mockup_tees[0], mockup_tees[1]]),
        ("Neon Graves — Tour Hoodie", "hoodie", 79.0, 28.0, 0,
         "Pullover hoodie with tour dates on back.", True, [mockup_hoodie]),
        ("Neon Graves — Poster A2", "poster", 18.0, 5.0, 0,
         "A2 matte poster. Signed print run.", False, ["https://images.unsplash.com/photo-1601233749202-95d04d5b3c00?w=800"]),
        ("Ashen Tide — Black Tide Tee", "t-shirt", 42.0, 13.0, 1,
         "Midnight black with silver wave print.", True, [mockup_tees[2]]),
        ("Ashen Tide — Logo Mug", "mug", 15.0, 6.0, 1,
         "Ceramic mug with Ashen Tide sigil.", False, ["https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800"]),
        ("Ashen Tide — Vinyl LP", "vinyl", 32.0, 12.0, 1,
         "Debut LP, 180g pressed.", False, ["https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=800"]),
        ("Silverwolf — Howling Tee", "t-shirt", 38.0, 12.0, 2,
         "Howling wolf graphic, soft-hand print.", True, [mockup_tees[3]]),
        ("Silverwolf — Forest Hoodie", "hoodie", 72.0, 26.0, 2,
         "Forest green pullover with embroidery.", False, [mockup_hoodie]),
        ("Silverwolf — Tote Bag", "tote-bag", 14.0, 4.0, 2,
         "Organic cotton tote with logo print.", True, ["https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800"]),
        ("Silverwolf — Lyric Poster", "poster", 20.0, 5.0, 2,
         "Debut album lyric typography print.", False, ["https://images.unsplash.com/photo-1561998338-13ad7883b20f?w=800"]),
    ]

    for i, (title, cat, price, cost, band_idx, desc, custom, mockups) in enumerate(products_plan):
        if cat in ("t-shirt", "hoodie"):
            # Use Size + Color attributes for variation
            attribute_ids = [attr_id_by_name["Size"], attr_id_by_name["Color"], attr_id_by_name["Material"]]
            sizes = ["S", "M", "L", "XL"]
            colors = ["Black", "White"]
            variations = []
            for sz in sizes:
                for cl in colors:
                    variations.append(ProductVariation(
                        size=sz, color=cl,
                        attribute_values={"Size": sz, "Color": cl},
                        sku=f"{title[:3].upper().replace(' ','')}-{sz}-{cl[:2].upper()}",
                        price_override=(price + 5) if sz == "XL" else None,  # XL costs +5
                    ))
            spec_attributes = {"Material": ["Heavyweight Cotton"]}
        else:
            attribute_ids = []
            variations = [ProductVariation(size="Standard", color="Default", attribute_values={"Size": "Standard"})]
            spec_attributes = {}

        prod = Product(
            band_id=band_ids[band_idx],
            slug=title.lower().replace(" ", "-").replace("—", "").replace("--", "-"),
            title=title, description=desc, category=cat,
            selling_price=price, print_cost=cost,
            mockup_images=mockups, variations=variations,
            attribute_ids=attribute_ids, spec_attributes=spec_attributes,
            customization_enabled=custom, published=True,
            assigned_printer_id=printer_ids[i % 3],
        )
        await db.products.insert_one(iso(prod.model_dump()))
        # Attach approved artwork placeholder
        art = ArtworkFile(
            product_id=prod.id,
            file_url=mockups[0],
            file_name=f"artwork_{prod.id[:6]}.png",
            placement="front", notes="Seeded placeholder artwork",
            dimensions="12x14in", dpi=300, status="approved",
        )
        await db.artworks.insert_one(iso(art.model_dump()))

    # ---- Sample orders ----
    products = await db.products.find({}, {"_id": 0}).to_list(20)
    for k in range(3):
        p = products[k * 3]
        var = p["variations"][0]
        rate = 0.15
        commission = round(p["selling_price"] * rate, 2)
        band_earn = round(p["selling_price"] - p["print_cost"] - commission, 2)
        printer_payout_amt = round(p["print_cost"], 2)
        oi = OrderItem(
            product_id=p["id"], product_title=p["title"], band_id=p["band_id"],
            printer_id=p.get("assigned_printer_id"),
            variation_id=var["id"], size=var["size"], color=var["color"],
            quantity=1, unit_price=p["selling_price"], print_cost_unit=p["print_cost"],
            commission_rate=rate, commission_amount=commission,
            band_earnings=band_earn, printer_payout=printer_payout_amt,
            artwork_file_url=p["mockup_images"][0] if p.get("mockup_images") else None,
            production_status=["pending", "in_production", "shipped"][k],
        )
        addr = ShippingAddress(
            full_name="Demo Buyer", email="fan@fandomforge.com",
            phone="+27 82 000 0000", line1="1 Example Rd", city="Cape Town",
            state="WC", postal_code="8001", country="ZA",
        )
        order = Order(
            buyer_id=None, buyer_email="fan@fandomforge.com", items=[oi],
            subtotal=p["selling_price"], total=p["selling_price"],
            shipping_address=addr,
            status=["sent_to_printer", "in_production", "shipped"][k],
            payment_status="paid", payment_provider="mock",
        )
        doc = iso(order.model_dump())
        await db.orders.insert_one(doc)
        await db.commissions.insert_one(iso(Commission(
            order_id=order.id, order_item_id=oi.id, band_id=oi.band_id,
            amount=oi.commission_amount, rate=oi.commission_rate,
        ).model_dump()))
        if oi.printer_id:
            await db.payouts.insert_one(iso(Payout(
                printer_id=oi.printer_id, order_id=order.id,
                order_item_id=oi.id, amount=oi.printer_payout,
                status="due" if k < 2 else "paid",
            ).model_dump()))
