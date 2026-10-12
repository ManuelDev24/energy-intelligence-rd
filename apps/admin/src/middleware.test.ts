// @vitest-environment node
import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

it("pone una CSP con nonce distinto en cada página, también en el login", () => {
  const first = middleware(new NextRequest("http://localhost:3100/login"));
  const second = middleware(new NextRequest("http://localhost:3100/login"));
  const nonceOf = (response: Response) => /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1];
  expect(nonceOf(first)).toBeTruthy();
  expect(nonceOf(first)).not.toBe(nonceOf(second));
  expect(first.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect(first.headers.get("content-security-policy")).toContain("object-src 'none'");
});
