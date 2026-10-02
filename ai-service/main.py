# Hishab AI Service — foundation (FastAPI + Pandas)
#
# What this file does (for beginners):
# 1. Creates a small web server using FastAPI.
# 2. Exposes GET /health (health check).
# 3. Exposes POST /analyze-transactions (summary stats using Pandas).
#
# The Node backend will later send authenticated users' transaction
# JSON here. This service NEVER connects to MongoDB directly.

import os
from typing import List, Literal, Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# Load variables from .env file (if it exists). Safe defaults below.
load_dotenv()

PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "127.0.0.1")

# CORS origins: allow the local Node backend (port 5001) plus
# common local frontend ports. Override with CORS_ORIGINS env var.
# Example: CORS_ORIGINS=http://localhost:5001,http://localhost:5173
_default_origins = [
    "http://localhost:5001",
    "http://127.0.0.1:5001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_env_origins = os.getenv("CORS_ORIGINS", "").strip()
ALLOWED_ORIGINS = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else _default_origins
)

app = FastAPI(
    title="Hishab AI Service",
    description="Foundation microservice: transaction summaries with Pandas. No ML/LLM yet.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],  # allow GET, POST, OPTIONS, etc.
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request models (Pydantic validates incoming JSON automatically)
# ---------------------------------------------------------------------------

class TransactionIn(BaseModel):
    """One transaction sent by the Node backend."""

    type: Literal["income", "expense"] = Field(
        ..., description='Must be exactly "income" or "expense".'
    )
    category: str = Field(..., min_length=1, description="e.g. Food, Transport")
    amount: float = Field(..., description="Must be a non-negative number.")
    date: str = Field(..., min_length=1, description="ISO date string.")
    description: Optional[str] = Field(default=None, description="Optional note.")
    subcategory: Optional[str] = Field(default=None, description="Optional subcategory.")

    @field_validator("category")
    @classmethod
    def category_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("category is required and must not be blank.")
        return v.strip()

    @field_validator("amount")
    @classmethod
    def amount_must_be_non_negative(cls, v: float) -> float:
        # Pydantic already ensures this is a number; we just check the sign.
        # Note: bool is a subclass of int in Python, so reject it explicitly.
        if isinstance(v, bool):
            raise ValueError("amount must be a number, not true/false.")
        if v < 0:
            raise ValueError("amount must not be negative.")
        return float(v)

    @field_validator("date")
    @classmethod
    def date_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("date is required and must not be blank.")
        return v.strip()


class AnalyzeRequest(BaseModel):
    """Body of POST /analyze-transactions."""

    userId: str = Field(..., min_length=1, description="User id from Node backend.")
    transactions: List[TransactionIn] = Field(
        ..., description="List of transactions (must not be empty)."
    )

    @field_validator("userId")
    @classmethod
    def user_id_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("userId is required and must not be blank.")
        return v.strip()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    """Simple health check used by the backend / developers."""
    return {"status": "ok", "service": "hishab-ai-service"}


@app.post("/analyze-transactions")
def analyze_transactions(payload: AnalyzeRequest):
    """
    Summarize transactions with Pandas.

    Steps:
    1. Pydantic already rejected: missing fields, bad `type`, negative amount.
    2. Here we reject an empty list with a clear 400 error.
    3. Pandas safely converts amount/date; invalid rows are dropped, not crashed.
    """
    if not payload.transactions or len(payload.transactions) == 0:
        raise HTTPException(
            status_code=400,
            detail="transactions must not be empty. Provide at least one transaction.",
        )

    # Convert Pydantic models to plain dicts for Pandas.
    rows = [t.model_dump() for t in payload.transactions]
    df = pd.DataFrame(rows)

    # --- Safe conversions (never crash on bad data) ---
    # amount -> numeric; bad values become NaN.
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    # date -> datetime; bad values become NaT ("Not a Time").
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)

    # Drop rows where amount or date could not be understood.
    df = df.dropna(subset=["amount", "date"])

    # Extra safety: drop negative amounts if any slipped through.
    # .copy() avoids a Pandas SettingWithCopyWarning when we add columns later.
    df = df[df["amount"] >= 0].copy()

    if df.empty:
        raise HTTPException(
            status_code=422,
            detail="No valid transactions found. Every row had an invalid amount or date.",
        )

    # --- Totals (convert NumPy types -> plain Python floats/ints) ---
    total_income = float(df.loc[df["type"] == "income", "amount"].sum())
    total_expense = float(df.loc[df["type"] == "expense", "amount"].sum())
    net_savings = float(total_income - total_expense)
    transaction_count = int(len(df))

    # --- Expense totals grouped by category ---
    expense_df = df[df["type"] == "expense"]
    if not expense_df.empty:
        grouped = expense_df.groupby("category", as_index=False)["amount"].sum()
        grouped = grouped.sort_values("amount", ascending=False)
        category_expenses = [
            {"category": str(row["category"]), "amount": float(row["amount"])}
            for _, row in grouped.iterrows()
        ]
        top = category_expenses[0]
        top_expense_category = {"name": top["category"], "amount": float(top["amount"])}
    else:
        category_expenses = []
        top_expense_category = {"name": "", "amount": 0.0}

    # --- Weekly summary (weeks start on Monday) ---
    # Normalize each date to its Monday 00:00, then group.
    df["weekStart"] = (
        df["date"].dt.tz_convert("UTC").dt.normalize()
        - pd.to_timedelta(
            df["date"].dt.tz_convert("UTC").dt.weekday, unit="D"
        )
    )
    weekly_rows = []
    for week_start, week_df in df.groupby("weekStart"):
        income = float(week_df.loc[week_df["type"] == "income", "amount"].sum())
        expense = float(week_df.loc[week_df["type"] == "expense", "amount"].sum())
        # week_start is a Timestamp; format as YYYY-MM-DD.
        week_label = pd.Timestamp(week_start).strftime("%Y-%m-%d")
        weekly_rows.append(
            {"weekStart": week_label, "income": income, "expense": expense}
        )
    # Sort oldest week first.
    weekly_rows.sort(key=lambda r: r["weekStart"])

    return {
        "success": True,
        "userId": payload.userId,
        "summary": {
            "transactionCount": transaction_count,
            "totalIncome": total_income,
            "totalExpense": total_expense,
            "netSavings": net_savings,
            "topExpenseCategory": top_expense_category,
            "categoryExpenses": category_expenses,
            "weeklySummary": weekly_rows,
        },
    }


# Allow `python main.py` to start the server (optional convenience).
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
