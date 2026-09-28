"""Authentication and role-based access-control contract tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BASE = Path(__file__).resolve().parents[2]
if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

from src.api import routes  # noqa: E402
from src.backend.app import create_app  # noqa: E402


@pytest.fixture()
def app(tmp_path):
    app = create_app()
    app.config.update(
        TESTING=True,
        AUTH_REQUIRED=True,
        AUTH_DB=str(tmp_path / "accounts.sqlite3"),
        SECRET_KEY="test-session-secret",
    )
    return app


def _signup(client, email="analyst@example.com"):
    return client.post("/api/v1/auth/signup", json={
        "first_name": "Ayesha",
        "last_name": "Khan",
        "email": email,
        "password": "a-long-test-password",
        "brand": "DineIQ Test Kitchen",
    })


def _csrf(client):
    response = client.get("/api/v1/auth/csrf")
    assert response.status_code == 200
    return {"X-CSRF-Token": response.get_json()["csrf_token"]}


def _create_admin(app, email="admin@example.com"):
    with app.app_context():
        con = routes._auth_db()
        try:
            salt = "test-admin-salt"
            con.execute(
                "INSERT INTO users(email,name,role,password_hash,salt,brand) VALUES(?,?,?,?,?,?)",
                (email, "Admin User", "Administrator", routes._hash_password("a-long-test-password", salt),
                 salt, "DineIQ Test Kitchen"),
            )
            con.commit()
        finally:
            con.close()


def _login(client, email):
    return client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "a-long-test-password",
    })


def test_signup_creates_only_a_data_analyst_and_protects_pages(app):
    client = app.test_client()
    assert client.get("/orders").status_code == 302

    response = _signup(client)
    assert response.status_code == 201
    assert response.get_json()["role"] == "Data Analyst"
    assert client.get("/api/v1/auth/me").get_json()["role"] == "Data Analyst"
    assert client.get("/api/v1/auth/users").status_code == 403
    assert client.get("/").location.endswith("/home")


@pytest.mark.parametrize(("role", "title", "visible", "blocked"), [
    ("Restaurant Manager", "Restaurant operations dashboard", "Orders", "/models"),
    ("Regional Manager", "Regional operations dashboard", "Location leaderboard", "/data"),
    ("Data Analyst", "Analytics workbench", "Forecast vs actual", "/orders"),
    ("Administrator", "Workspace command center", "Accounts by role", "/team"),
])
def test_each_role_gets_its_own_dashboard_and_navigation(app, role, title, visible, blocked):
    member = app.test_client()
    assert _signup(member).status_code == 201
    _create_admin(app)
    admin = app.test_client()
    assert _login(admin, "admin@example.com").status_code == 200
    response = admin.patch(
        "/api/v1/auth/users/analyst@example.com/role",
        headers=_csrf(admin), json={"role": role},
    )
    assert response.status_code == 200

    home = member.get("/home")
    assert home.status_code == 200
    html = home.get_data(as_text=True)
    assert title in html and visible in html
    blocked_response = member.get(blocked)
    if blocked == "/team":
        assert blocked_response.status_code == 200
    else:
        assert blocked_response.status_code == 302
        assert blocked_response.location.endswith("/home")


def test_all_supported_roles_can_log_in_and_admin_controls_access(app):
    analyst = app.test_client()
    assert _signup(analyst).status_code == 201

    _create_admin(app)
    admin = app.test_client()
    assert _login(admin, "admin@example.com").status_code == 200
    headers = _csrf(admin)

    for role in ("Restaurant Manager", "Regional Manager", "Administrator"):
        response = admin.patch(
            "/api/v1/auth/users/analyst@example.com/role",
            headers=headers,
            json={"role": role},
        )
        assert response.status_code == 200
        assert response.get_json()["role"] == role
        assert analyst.get("/api/v1/auth/me").get_json()["role"] == role

    assert analyst.get("/api/v1/auth/users").status_code == 200


def test_deactivation_invalidates_existing_session_and_blocks_future_login(app):
    analyst = app.test_client()
    assert _signup(analyst).status_code == 201
    _create_admin(app)
    admin = app.test_client()
    assert _login(admin, "admin@example.com").status_code == 200

    response = admin.patch(
        "/api/v1/auth/users/analyst@example.com/status",
        headers=_csrf(admin),
        json={"is_active": False},
    )
    assert response.status_code == 200
    assert response.get_json()["is_active"] is False
    assert analyst.get("/api/v1/auth/me").status_code == 401
    assert analyst.get("/orders").status_code == 302

    fresh_client = app.test_client()
    response = _login(fresh_client, "analyst@example.com")
    assert response.status_code == 403
    assert response.get_json()["error"] == "ACCOUNT_INACTIVE"


def test_mutating_role_requests_require_a_valid_csrf_token(app):
    _create_admin(app)
    admin = app.test_client()
    assert _login(admin, "admin@example.com").status_code == 200

    response = admin.patch(
        "/api/v1/auth/users/admin@example.com/role",
        json={"role": "Restaurant Manager"},
    )
    assert response.status_code == 403
    assert response.get_json()["error"] == "CSRF_FAILED"
