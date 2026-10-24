from text_utils import slugify

TRICKY = ["Hello, World!", "  --  ", "Ünïcödé Straße", "a" * 300, "x/y?z=1&w=2", "tab\there", "Éclair-au-café 2", "émoji 🎉 party",
          "ALL CAPS", "trailing---", "日本 tokyo", "dots...and...dots", "under_score", "MiXeD 123 numbers 456"]


def test_basic() -> None:
    assert slugify("Hello, World!") == "hello-world"


def test_accents_folded() -> None:
    assert slugify("Crème Brûlée") == "creme-brulee"


def test_sharp_s() -> None:
    assert slugify("Straße") == "strasse"


def test_separators_collapse() -> None:
    assert slugify("  a  --  b__c  ") == "a-b-c"


def test_max_length_cuts_at_word_boundary() -> None:
    assert slugify("the quick brown fox", max_length=10) == "the-quick"


def test_nothing_left_raises() -> None:
    try:
        slugify("!!! ???")
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_idempotent_and_clean() -> None:
    for text in TRICKY:
        try:
            once = slugify(text)
        except ValueError:
            continue
        assert slugify(once) == once, text
        assert once == once.lower(), text
        assert " " not in once, text
        assert not once.startswith("-"), text
        assert not once.endswith("-"), text
        assert "--" not in once, text
