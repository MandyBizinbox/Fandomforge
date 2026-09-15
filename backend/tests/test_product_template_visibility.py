from __future__ import annotations

from types import SimpleNamespace

from product_template_visibility import (
    can_access_hidden_templates,
    creator_template_query,
    strip_template_visibility_controls,
)


def test_creator_query_excludes_only_explicit_false():
    query = creator_template_query({
        "status": "active",
        "category": "mug",
    })

    assert query == {
        "status": "active",
        "category": "mug",
        "creator_visible": {"$ne": False},
    }


def test_admin_roles_can_access_hidden_templates():
    for role in (
        "owner",
        "super_admin",
        "admin",
        "manager",
    ):
        assert can_access_hidden_templates(
            SimpleNamespace(role=role)
        )


def test_creator_role_cannot_access_hidden_templates():
    assert not can_access_hidden_templates(
        SimpleNamespace(role="creator")
    )


def test_visibility_controls_are_removed_from_public_document():
    source = {
        "id": "template-1",
        "name": "Template",
        "creator_visible": False,
        "admin_visible": True,
    }

    result = strip_template_visibility_controls(source)

    assert result == {
        "id": "template-1",
        "name": "Template",
    }

    assert source["creator_visible"] is False
    assert source["admin_visible"] is True
