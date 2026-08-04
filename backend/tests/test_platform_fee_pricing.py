from decimal import Decimal
import unittest

from platform_fee_pricing import (
    creator_amount_for_sale,
    production_fee_amount,
    total_cost_to_produce,
)


class PlatformFeePricingTest(unittest.TestCase):
    def test_acrylic_example(self):
        subtotal = Decimal("22.00") + Decimal("10.00")

        self.assertEqual(
            production_fee_amount(subtotal, Decimal("0.15")),
            Decimal("4.80"),
        )
        self.assertEqual(
            total_cost_to_produce(subtotal, Decimal("0.15")),
            Decimal("36.80"),
        )
        self.assertEqual(
            creator_amount_for_sale(
                Decimal("50.00"),
                subtotal,
                Decimal("0.15"),
            ),
            Decimal("13.20"),
        )

    def test_fee_does_not_change_with_retail(self):
        subtotal = Decimal("32.00")
        fee = production_fee_amount(subtotal, Decimal("0.15"))

        self.assertEqual(fee, Decimal("4.80"))
        self.assertEqual(
            creator_amount_for_sale(
                Decimal("100.00"),
                subtotal,
                Decimal("0.15"),
            ),
            Decimal("63.20"),
        )


if __name__ == "__main__":
    unittest.main()
