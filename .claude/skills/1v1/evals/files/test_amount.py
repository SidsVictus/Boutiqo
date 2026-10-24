from decimal import Decimal
from amount import parse_amount


def test_dot():
    assert parse_amount('1,5') == Decimal('1.5')


def test_thousands():
    assert parse_amount('1,5') == Decimal('15')
