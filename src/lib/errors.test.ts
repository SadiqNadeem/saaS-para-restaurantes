import { describe, it, expect } from "vitest";
import {
  AppError,
  AppErrorCode,
  fromSupabaseError,
  getErrorMessage,
  isRateLimitError,
} from "./errors";

describe("AppError", () => {
  it("creates error with correct code and default status", () => {
    const err = new AppError(AppErrorCode.RESTAURANT_NOT_FOUND, "No encontrado");
    expect(err.code).toBe(AppErrorCode.RESTAURANT_NOT_FOUND);
    expect(err.message).toBe("No encontrado");
    expect(err.status).toBe(404);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });

  it("allows overriding status", () => {
    const err = new AppError(AppErrorCode.SERVER_ERROR, "Custom", { status: 503 });
    expect(err.status).toBe(503);
  });

  it("serializes to JSON correctly", () => {
    const err = new AppError(AppErrorCode.UNAUTHORIZED, "No autorizado");
    expect(err.toJSON()).toEqual({
      error: "No autorizado",
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("maps RATE_LIMITED to 429", () => {
    const err = new AppError(AppErrorCode.RATE_LIMITED, "Too many");
    expect(err.status).toBe(429);
  });

  it("maps FORBIDDEN to 403", () => {
    const err = new AppError(AppErrorCode.FORBIDDEN, "Forbidden");
    expect(err.status).toBe(403);
  });
});

describe("getErrorMessage", () => {
  it("extracts message from AppError", () => {
    const err = new AppError(AppErrorCode.CART_EMPTY, "Carrito vacío");
    expect(getErrorMessage(err)).toBe("Carrito vacío");
  });

  it("extracts message from standard Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("handles string errors", () => {
    expect(getErrorMessage("algo falló")).toBe("algo falló");
  });

  it("returns fallback for unknown types", () => {
    expect(getErrorMessage(null)).toBe("Ha ocurrido un error inesperado");
    expect(getErrorMessage(42)).toBe("Ha ocurrido un error inesperado");
  });
});

describe("isRateLimitError", () => {
  it("detects AppError with RATE_LIMITED code", () => {
    const err = new AppError(AppErrorCode.RATE_LIMITED, "Too many");
    expect(isRateLimitError(err)).toBe(true);
  });

  it("detects objects with status 429", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isRateLimitError(new AppError(AppErrorCode.UNAUTHORIZED, "x"))).toBe(false);
    expect(isRateLimitError(new Error("boom"))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe("fromSupabaseError", () => {
  it("converts null to SERVER_ERROR", () => {
    const err = fromSupabaseError(null);
    expect(err.code).toBe(AppErrorCode.SERVER_ERROR);
  });

  it("detects RLS error by code 42501", () => {
    const err = fromSupabaseError({ code: "42501", message: "permission denied" });
    expect(err.code).toBe(AppErrorCode.FORBIDDEN);
    expect(err.status).toBe(403);
  });

  it("detects not found PGRST116", () => {
    const err = fromSupabaseError({ code: "PGRST116", message: "not found" });
    expect(err.code).toBe(AppErrorCode.NOT_FOUND);
    expect(err.status).toBe(404);
  });

  it("wraps generic errors as SERVER_ERROR", () => {
    const err = fromSupabaseError({ code: "23505", message: "duplicate key" });
    expect(err.code).toBe(AppErrorCode.SERVER_ERROR);
    expect(err.message).toBe("duplicate key");
  });
});
