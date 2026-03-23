"""Authentication helpers for password hashing and JWT handling."""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY

# Keep passlib only for backward-compatibility with any existing bcrypt hashes.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

PBKDF2_SCHEME = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600000
PBKDF2_SALT_BYTES = 16


def _hash_with_pbkdf2(password: str, *, salt: str, iterations: int) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return f"{PBKDF2_SCHEME}${iterations}${salt}${digest}"


def _verify_pbkdf2_hash(plain_password: str, password_hash: str) -> bool:
    parts = password_hash.split("$", 3)
    if len(parts) != 4:
        return False

    scheme, rounds, salt, expected_digest = parts
    if scheme != PBKDF2_SCHEME:
        return False

    try:
        iterations = int(rounds)
    except ValueError:
        return False

    candidate = _hash_with_pbkdf2(plain_password, salt=salt, iterations=iterations)
    return hmac.compare_digest(candidate, password_hash)


def hash_password(password: str) -> str:
    """Hash plain text password."""
    salt = secrets.token_hex(PBKDF2_SALT_BYTES)
    return _hash_with_pbkdf2(password, salt=salt, iterations=PBKDF2_ITERATIONS)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify plain text password against stored hash."""
    if password_hash.startswith(f"{PBKDF2_SCHEME}$"):
        return _verify_pbkdf2_hash(plain_password, password_hash)

    try:
        return pwd_context.verify(plain_password, password_hash)
    except UnknownHashError:
        return False


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    """Create signed JWT access token."""
    expire_delta = timedelta(minutes=expires_minutes or ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expire_delta
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode JWT token and return payload if valid."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
